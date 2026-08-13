import { createClient } from "@/lib/supabase/client"
import type { Payment, Sale } from "@/components/store-context"
import { formatAlmacenSaleItemName } from "@/lib/almacen"
import { loadPrintLogoDataUrl } from "@/lib/print-logo"
import { formatCurrency } from "@/lib/utils"
import { drawBrandingHeaderOnThermalPdf, getTenantBranding } from "@/lib/tenant-branding"

export interface InvoiceData {
  id: string
  invoiceNumber: string
  date: string
  customerName: string
  customerPhone?: string
  items: Array<{
    name: string
    quantity: number
    price: number
    total: number
    boxNumber?: string
    category?: string
  }>
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  employeeName?: string
  amountPaid?: number
  change?: number
  kind?: "sale" | "payment"
}

export type ClientInvoiceSource = "tienda" | "almacen" | "pago" | "manual"

export interface SaveClientInvoiceOptions {
  ownerAdminId: string
  source?: ClientInvoiceSource
  saleId?: string
  paymentId?: string
}

function triggerPdfDownload(blob: Blob, invoiceNumber: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `Factura-${invoiceNumber}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function buildInvoiceDataFromSale(
  sale: Sale,
  employeeName?: string,
): InvoiceData {
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    date: sale.date,
    customerName: sale.customerName || "Cliente General",
    customerPhone: sale.customerPhone,
    kind: "sale",
    items: sale.items.map((item) => {
      const effectivePrice = item.customPrice ?? item.sellPrice
      return {
        name: item.name,
        boxNumber: item.boxNumber,
        category: item.category,
        quantity: item.quantity,
        price: effectivePrice,
        total: item.quantity * effectivePrice,
      }
    }),
    subtotal: sale.subtotal || sale.total,
    tax: sale.tax || 0,
    total: sale.total,
    paymentMethod: sale.paymentMethod,
    employeeName,
    amountPaid: sale.amountPaid,
    change: sale.change,
  }
}

export function buildInvoiceDataFromPayment(payment: Payment, customerName: string): InvoiceData {
  return {
    id: payment.id,
    invoiceNumber: payment.invoiceNumber,
    date: payment.date,
    customerName,
    kind: "payment",
    items: [
      {
        name: "Abono a deuda",
        quantity: 1,
        price: payment.amount,
        total: payment.amount,
      },
    ],
    subtotal: payment.amount,
    tax: 0,
    total: payment.amount,
    paymentMethod: payment.paymentMethod,
  }
}

export function getSaleInvoicePersistOptions(
  ownerAdminId: string | undefined,
  saleId: string,
  source: ClientInvoiceSource = "tienda",
): SaveClientInvoiceOptions | undefined {
  if (!ownerAdminId) return undefined
  return { ownerAdminId, saleId, source }
}

/**
 * Guarda snapshot JSON en client_invoices (sin PDF).
 */
export async function saveClientInvoice(
  invoice: InvoiceData,
  options: SaveClientInvoiceOptions,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const supabase = createClient()

    const payload = {
      owner_admin_id: options.ownerAdminId,
      sale_id: options.saleId ?? (invoice.kind === "sale" ? invoice.id : null),
      payment_id: options.paymentId ?? (invoice.kind === "payment" ? invoice.id : null),
      invoice_number: invoice.invoiceNumber,
      invoice_date: invoice.date,
      customer_name: invoice.customerName,
      customer_phone: invoice.customerPhone ?? null,
      source: options.source ?? "tienda",
      // Ensure invoice_data is plain serializable JSON to avoid structured-clone
      // or driver-specific callback issues when sending payload to the client.
      invoice_data: JSON.parse(JSON.stringify(invoice)),
      updated_at: new Date().toISOString(),
    }

    try {
      const { data, error } = await supabase
        .from("client_invoices")
        .upsert(payload, { onConflict: "owner_admin_id,invoice_number" })
        .select("id")
        .single()

      if (error) {
        console.error("Error al guardar factura en client_invoices:", error)
        return { success: false, error: error.message }
      }

      return { success: true, id: data?.id }
    } catch (err) {
      console.error("Error inesperado durante upsert en client_invoices:", err, { payloadSize: JSON.stringify(payload).length })
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error("Error inesperado al guardar factura:", err)
    return { success: false, error: "Error inesperado al guardar la factura" }
  }
}

/** Alias legacy */
export const saveInvoiceToStorage = saveClientInvoice

export async function persistClientInvoiceFromSale(
  sale: Sale,
  options: SaveClientInvoiceOptions,
  employeeName?: string,
): Promise<void> {
  const invoice = buildInvoiceDataFromSale(sale, employeeName)
  await saveClientInvoice(invoice, options)
}

export async function persistClientInvoiceFromPayment(
  payment: Payment,
  customerName: string,
  options: SaveClientInvoiceOptions,
): Promise<void> {
  const invoice = buildInvoiceDataFromPayment(payment, customerName)
  await saveClientInvoice(invoice, { ...options, source: "pago", paymentId: payment.id })
}

async function fetchClientInvoiceData(filters: {
  ownerAdminId?: string
  saleId?: string
  invoiceNumber?: string
  recordId?: string
}): Promise<{ success: boolean; invoice?: InvoiceData; invoiceNumber?: string; error?: string }> {
  try {
    const supabase = createClient()
    let query = supabase.from("client_invoices").select("invoice_data, invoice_number")

    if (filters.recordId) {
      query = query.eq("id", filters.recordId)
    } else if (filters.saleId) {
      query = query.eq("sale_id", filters.saleId)
    } else if (filters.invoiceNumber) {
      query = query.eq("invoice_number", filters.invoiceNumber)
    } else {
      return { success: false, error: "No se indicó cómo buscar la factura" }
    }

    if (filters.ownerAdminId) {
      query = query.eq("owner_admin_id", filters.ownerAdminId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data?.invoice_data) {
      return { success: false, error: "Factura no encontrada" }
    }

    return {
      success: true,
      invoice: data.invoice_data as InvoiceData,
      invoiceNumber: data.invoice_number,
    }
  } catch (err) {
    console.error("Error al obtener factura:", err)
    return { success: false, error: "Error inesperado al obtener la factura" }
  }
}

export async function generateInvoicePDF(
  invoice: InvoiceData,
  ownerAdminId?: string | null,
): Promise<Blob> {
  const branding = await getTenantBranding(ownerAdminId)
  const saleData = {
    invoiceNumber: invoice.invoiceNumber,
    date: invoice.date,
    customerName: invoice.customerName,
    paymentMethod: invoice.paymentMethod,
    items: invoice.items.map((item) => ({
      name: formatAlmacenSaleItemName({
        name: item.name,
        boxNumber: item.boxNumber,
        category: item.category,
      }),
      quantity: item.quantity,
      sellPrice: item.price,
    })),
    total: invoice.total,
    cashReceived: invoice.amountPaid,
    change: invoice.change,
  }

  const { default: jsPDF } = await import("jspdf")

  const RECEIPT_WIDTH = 80
  const SIDE_MARGIN = 1
  const BASE_HEIGHT = 120
  const FOOTER_MARGIN = 20

  // Split long descriptions before creating the final document. A thermal PDF
  // has a fixed width, so drawing the whole item in one line makes the text
  // overflow and get clipped by the printer/PDF viewer.
  const measureDoc = new jsPDF({ unit: "mm", format: [RECEIPT_WIDTH, 1000] })
  measureDoc.setFont("courier", "normal")
  measureDoc.setFontSize(12)
  const descriptionWidth = RECEIPT_WIDTH - SIDE_MARGIN * 2
  const preparedItems = saleData.items.map((item) => ({
    ...item,
    descriptionLines: measureDoc.splitTextToSize(item.name, descriptionWidth) as string[],
  }))
  const itemHeight = preparedItems.reduce(
    (height, item) => height + Math.max(1, item.descriptionLines.length) * 5.5 + 5.5,
    0,
  )
  const estimatedHeight = BASE_HEIGHT + itemHeight + FOOTER_MARGIN
  const PAGE_HEIGHT = Math.max(200, estimatedHeight)

  const doc = new jsPDF({ unit: "mm", format: [RECEIPT_WIDTH, PAGE_HEIGHT] })

  const CENTER = RECEIPT_WIDTH / 2

  let y = await drawBrandingHeaderOnThermalPdf(doc, branding, {
    centerX: CENTER,
    sideMargin: SIDE_MARGIN,
    pageWidth: RECEIPT_WIDTH,
    startY: 4,
  })

  doc.setFontSize(13)
  doc.setFont("courier", "bold")
  const title = invoice.kind === "payment" ? "COMPROBANTE" : "FACTURA"
  doc.text(title, CENTER, y, { align: "center" })
  y += 5

  doc.setLineWidth(1.2)
  doc.line(SIDE_MARGIN, y, RECEIPT_WIDTH - SIDE_MARGIN, y)
  y += 5

  doc.setFontSize(12)
  doc.setFont("courier", "bold")
  doc.text(`${title}: ${saleData.invoiceNumber}`, SIDE_MARGIN, y)
  y += 6
  doc.setFont("courier", "normal")
  doc.text(`FECHA: ${new Date(saleData.date).toLocaleDateString("es-DO")}`, SIDE_MARGIN, y)

  if (saleData.customerName) {
    y += 8
    doc.setFont("courier", "bold")
    doc.text("CLIENTE:", SIDE_MARGIN, y)
    y += 5
    doc.setFont("courier", "normal")
    doc.text(saleData.customerName, SIDE_MARGIN, y)
  }

  y += 12
  doc.setFont("courier", "bold")
  doc.text("DETALLE:", SIDE_MARGIN, y)
  y += 6

  preparedItems.forEach((item) => {
    doc.setFont("courier", "normal")
    doc.setFontSize(12)
    doc.text(item.descriptionLines, SIDE_MARGIN, y, { lineHeightFactor: 1.15 })
    y += Math.max(1, item.descriptionLines.length) * 5.5
    doc.text(
      `${item.quantity} x $${formatCurrency(item.sellPrice)}  Subtotal: $${formatCurrency(item.sellPrice * item.quantity)}`,
      SIDE_MARGIN,
      y,
    )
    y += 5.5
  })

  y += 6
  doc.setFontSize(16)
  doc.setFont("courier", "bold")
  doc.text(`TOTAL: $${formatCurrency(saleData.total)}`, SIDE_MARGIN, y)

  y += 10
  doc.setFontSize(12)
  doc.setFont("courier", "normal")
  doc.text("¡GRACIAS POR SU COMPRA!", CENTER, y, { align: "center" })

  y += 6
  doc.text("-----------", CENTER, y, { align: "center" })

  y += 10

  return doc.output("blob")
}

/**
 * Guarda en tabla (si aplica) y descarga PDF generado al vuelo.
 */
export async function downloadClientInvoicePdfFromSale(
  sale: Sale,
  ownerAdminId: string,
  source: ClientInvoiceSource = "tienda",
  employeeName?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const invoice = buildInvoiceDataFromSale(sale, employeeName)
    await saveClientInvoice(invoice, { ownerAdminId, saleId: sale.id, source })

    const pdfBlob = await generateInvoicePDF(invoice, ownerAdminId)
    triggerPdfDownload(pdfBlob, invoice.invoiceNumber)
    return { success: true }
  } catch (err) {
    console.error("Error al descargar factura:", err)
    return { success: false, error: "Error al generar el PDF" }
  }
}

export async function downloadInvoiceFromStorage(
  _date: string,
  saleId: string,
  invoiceNumber: string,
  ownerAdminId?: string,
  fallbackSale?: Sale,
  source: ClientInvoiceSource = "tienda",
  employeeName?: string,
): Promise<{ success: boolean; error?: string }> {
  if (fallbackSale && ownerAdminId) {
    return downloadClientInvoicePdfFromSale(fallbackSale, ownerAdminId, source, employeeName)
  }

  const fetched = await fetchClientInvoiceData({ saleId, invoiceNumber, ownerAdminId })
  let invoice = fetched.invoice

  if (!invoice && fallbackSale && ownerAdminId) {
    return downloadClientInvoicePdfFromSale(fallbackSale, ownerAdminId, source, employeeName)
  }

  if (!invoice) {
    return { success: false, error: fetched.error || "Factura no encontrada. Imprímela o descárgala una vez para archivarla." }
  }

  try {
    const pdfBlob = await generateInvoicePDF(invoice, ownerAdminId)
    triggerPdfDownload(pdfBlob, invoice.invoiceNumber)
    return { success: true }
  } catch {
    return { success: false, error: "Error al generar el PDF" }
  }
}

export async function listInvoicesByMonth(
  year: number,
  month: number,
  ownerAdminId?: string,
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  const result = await listAllStoredInvoices(ownerAdminId)
  if (!result.success || !result.invoices) {
    return { success: false, error: result.error }
  }

  const files = result.invoices
    .filter((inv) => inv.year === year && inv.month === month)
    .map((inv) => `${inv.year}/${String(inv.month).padStart(2, "0")}/${inv.name}`)

  return { success: true, files }
}

export async function listInvoicesByYear(
  year: number,
  ownerAdminId?: string,
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  const result = await listAllStoredInvoices(ownerAdminId)
  if (!result.success || !result.invoices) {
    return { success: false, error: result.error }
  }

  const files = result.invoices
    .filter((inv) => inv.year === year)
    .map((inv) => `${inv.year}/${String(inv.month).padStart(2, "0")}/${inv.name}`)

  return { success: true, files }
}

export async function deleteInvoiceByPath(recordId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    const { error } = await supabase.from("client_invoices").delete().eq("id", recordId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error("Error al eliminar factura:", err)
    return { success: false, error: "Error inesperado al eliminar la factura" }
  }
}

export async function deleteInvoiceFromStorage(
  _date: string,
  saleId: string,
  ownerAdminId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient()
    let query = supabase.from("client_invoices").delete().eq("sale_id", saleId)
    if (ownerAdminId) {
      query = query.eq("owner_admin_id", ownerAdminId)
    }

    const { error } = await query
    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: "Error inesperado al eliminar la factura" }
  }
}

export function getInvoicePublicUrl(_date: string, _invoiceId: string): string {
  return ""
}

export function getInvoicePath(date: string, invoiceId: string): string {
  const invoiceDate = new Date(date)
  const year = invoiceDate.getFullYear()
  const month = String(invoiceDate.getMonth() + 1).padStart(2, "0")
  return `${year}/${month}/${invoiceId}.pdf`
}

export async function getInvoiceInfo(path: string): Promise<{
  success: boolean
  info?: { id: string; year: string; month: string; name: string }
  error?: string
}> {
  const parts = path.split("/")
  if (parts.length !== 3) {
    return { success: false, error: "Path inválido" }
  }

  const [year, month, filename] = parts
  return {
    success: true,
    info: { id: filename.replace(".pdf", ""), year, month, name: filename },
  }
}

export async function listAllStoredInvoices(ownerAdminId?: string): Promise<{
  success: boolean
  invoices?: Array<{
    path: string
    id: string
    year: number
    month: number
    name: string
    createdAt: string
    recordId: string
    saleId: string | null
    customerName: string | null
    source: ClientInvoiceSource
  }>
  error?: string
}> {
  try {
    const supabase = createClient()
    let query = supabase
      .from("client_invoices")
      .select("id, sale_id, invoice_number, invoice_date, customer_name, source, created_at")
      .order("created_at", { ascending: false })

    if (ownerAdminId) {
      query = query.eq("owner_admin_id", ownerAdminId)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    const invoices = (data || []).map((row) => {
      const invoiceDate = new Date(row.invoice_date || row.created_at)
      const year = invoiceDate.getFullYear()
      const month = invoiceDate.getMonth() + 1
      const invoiceNumber = row.invoice_number as string

      return {
        recordId: row.id as string,
        saleId: (row.sale_id as string | null) ?? null,
        path: `${year}/${String(month).padStart(2, "0")}/${invoiceNumber}.pdf`,
        id: invoiceNumber,
        year,
        month,
        name: `${invoiceNumber}.pdf`,
        createdAt: row.created_at as string,
        customerName: (row.customer_name as string | null) ?? null,
        source: (row.source as ClientInvoiceSource) || "tienda",
      }
    })

    return { success: true, invoices }
  } catch (err) {
    return { success: false, error: "Error inesperado al listar facturas" }
  }
}

export async function downloadInvoiceByPath(
  recordId: string,
  invoiceNumber?: string,
  ownerAdminId?: string,
): Promise<{ success: boolean; error?: string }> {
  const fetched = await fetchClientInvoiceData({ recordId, ownerAdminId })

  if (!fetched.invoice) {
    return { success: false, error: fetched.error || "Factura no encontrada" }
  }

  try {
    const pdfBlob = await generateInvoicePDF(fetched.invoice, ownerAdminId)
    triggerPdfDownload(pdfBlob, invoiceNumber || fetched.invoiceNumber || "factura")
    return { success: true }
  } catch {
    return { success: false, error: "Error al generar el PDF" }
  }
}
