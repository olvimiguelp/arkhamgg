import { drawBrandingClosingHeaderPdf, getTenantBranding } from "@/lib/tenant-branding"

export interface AlmacenClosingSnapshotItem {
  productId: string
  sku: string
  name: string
  category: string
  boxNumber?: string
  expectedStock: number
  countedStock: number
  unitCost: number
  unitPrice: number
  discrepancyUnits: number
  discrepancyCost: number
}

export interface AlmacenClosingFinancialSummary {
  totalSales: number
  invoiceCount: number
  cashNet: number
  cardNet: number
  transferNet: number
  creditNet: number
  totalReturns: number
  returnsCount: number
  netIncome: number
  cashDebtPayments: number
}

export interface AlmacenClosingPDFData {
  date: string
  closingNumber: string
  cashier: string
  totalProducts: number
  totalUnitsExpected: number
  totalUnitsCounted: number
  discrepancyUnits: number
  totalCostExpected: number
  totalCostCounted: number
  discrepancyCost: number
  notes?: string
  snapshot: AlmacenClosingSnapshotItem[]
  financialSummary?: AlmacenClosingFinancialSummary
}

const formatAmount = (value: number) => Number(value || 0).toFixed(2)

export async function generateAlmacenClosingPDF(
  data: AlmacenClosingPDFData,
  ownerAdminId?: string | null,
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf")
  const branding = await getTenantBranding(ownerAdminId)
  const pageWidth = 226.77 // 80mm receipt
  const margin = 2.83
  const contentWidth = pageWidth - margin * 2

  let estimatedHeight = 420 + data.snapshot.length * 8
  if (data.financialSummary) {
    estimatedHeight += 120
  }
  if (data.notes) {
    estimatedHeight += 40
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [pageWidth, Math.max(estimatedHeight, 420)],
  })

  let y = margin + 10
  const centerX = pageWidth / 2

  const drawLine = (yPos: number, dashed = false) => {
    if (dashed) {
      ;(doc as any).setLineDashPattern?.([2, 2], 0)
    } else {
      ;(doc as any).setLineDashPattern?.([], 0)
    }
    doc.setLineWidth(0.5)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    ;(doc as any).setLineDashPattern?.([], 0)
  }

  const drawRow = (left: string, right: string, yPos: number, size = 8, bold = false) => {
    doc.setFont("courier", bold ? "bold" : "normal")
    doc.setFontSize(size)
    doc.text(left, margin + 2, yPos)
    doc.text(right, pageWidth - margin - 2, yPos, { align: "right" })
  }

  y = drawBrandingClosingHeaderPdf(doc, branding, {
    pageWidth,
    headerTitle: "CIERRE DE ALMACEN",
  }) - 5

  doc.setFillColor(248, 250, 252)
  doc.rect(margin, y - 5, contentWidth, 35, "F")
  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text(`No. ${data.closingNumber}`, centerX, y + 5, { align: "center" })
  doc.setFontSize(9)
  doc.setFont("courier", "normal")
  doc.text(`Fecha: ${data.date}`, centerX, y + 16, { align: "center" })
  doc.text(`Responsable: ${data.cashier}`, centerX, y + 26, { align: "center" })

  y += 40
  drawLine(y, true)
  y += 12

  if (data.financialSummary) {
    doc.setFillColor(16, 185, 129)
    doc.rect(margin, y - 3, contentWidth, 14, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont("courier", "bold")
    doc.text("RESUMEN CIERRE ALMACEN", centerX, y + 7, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 18

    drawRow("Total Facturado:", `$${formatAmount(data.financialSummary.totalSales)}`, y, 9)
    y += 11
    drawRow("Facturas:", String(data.financialSummary.invoiceCount), y, 9)
    y += 11
    drawRow("En Efectivo:", `$${formatAmount(data.financialSummary.cashNet)}`, y, 9)
    y += 11
    drawRow("En Tarjeta:", `$${formatAmount(data.financialSummary.cardNet)}`, y, 9)
    y += 11
    drawRow("Transferencias:", `$${formatAmount(data.financialSummary.transferNet)}`, y, 9)
    y += 11
    drawRow("A Credito:", `$${formatAmount(data.financialSummary.creditNet)}`, y, 9)
    y += 11
    drawRow("Devoluciones:", `-$${formatAmount(data.financialSummary.totalReturns)}`, y, 9)
    y += 11
    drawRow("Abonos Deuda (Efectivo):", `$${formatAmount(data.financialSummary.cashDebtPayments)}`, y, 9)
    y += 13
    drawLine(y - 3, true)
    drawRow("Ventas Netas de Almacen:", `$${formatAmount(data.financialSummary.netIncome)}`, y + 5, 10, true)
    y += 16
  }

  doc.setFillColor(59, 130, 246)
  doc.rect(margin, y - 3, contentWidth, 14, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text("RESUMEN DE INVENTARIO", centerX, y + 7, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 18

  drawRow("Productos:", String(data.totalProducts), y, 9)
  y += 11
  drawRow("Unidades esperadas:", String(data.totalUnitsExpected), y, 9)
  y += 11
  drawRow("Unidades contadas:", String(data.totalUnitsCounted), y, 9)
  y += 11
  drawRow("Diferencia unidades:", String(data.discrepancyUnits), y, 9, true)
  y += 13
  drawLine(y - 3, true)
  drawRow("Costo esperado:", `$${formatAmount(data.totalCostExpected)}`, y + 5, 10, true)
  y += 11
  drawRow("Costo contado:", `$${formatAmount(data.totalCostCounted)}`, y + 5, 10, true)
  y += 11
  drawRow("Diferencia costo:", `$${formatAmount(data.discrepancyCost)}`, y + 5, 10, true)
  y += 16

  drawLine(y, false)
  y += 8
  doc.setFontSize(9)
  doc.setFont("courier", "bold")
  doc.text("DETALLE POR PRODUCTO", centerX, y, { align: "center" })
  y += 10

  doc.setFontSize(7)
  doc.setFont("courier", "bold")
  doc.text("ID", margin + 2, y)
  doc.text("ESP", margin + 86, y, { align: "right" })
  doc.text("CONT", margin + 122, y, { align: "right" })
  doc.text("DIF", margin + 154, y, { align: "right" })
  doc.text("COSTO DIF", pageWidth - margin - 2, y, { align: "right" })
  y += 8
  doc.setFont("courier", "normal")

  data.snapshot.slice(0, 90).forEach((item) => {
    const itemCode = (item.sku || "").trim() || item.productId.slice(0, 8)
    doc.text(itemCode, margin + 2, y)
    doc.text(String(item.expectedStock), margin + 86, y, { align: "right" })
    doc.text(String(item.countedStock), margin + 122, y, { align: "right" })
    doc.text(String(item.discrepancyUnits), margin + 154, y, { align: "right" })
    doc.text(`$${formatAmount(item.discrepancyCost)}`, pageWidth - margin - 2, y, { align: "right" })
    y += 8
  })

  if (data.snapshot.length > 90) {
    doc.setFont("courier", "italic")
    doc.text(`... y ${data.snapshot.length - 90} productos mas`, centerX, y, { align: "center" })
    y += 8
  }

  if (data.notes) {
    y += 4
    drawLine(y, true)
    y += 10
    doc.setFontSize(8)
    doc.setFont("courier", "bold")
    doc.text("NOTAS:", margin + 2, y)
    y += 9
    doc.setFont("courier", "normal")
    const splitNotes = doc.splitTextToSize(data.notes, contentWidth - 4)
    doc.text(splitNotes, margin + 2, y)
    y += splitNotes.length * 8
  }

  y += 10
  drawLine(y, false)
  y += 12

  doc.setFontSize(8)
  doc.setFont("courier", "normal")
  doc.text("Documento generado automaticamente", centerX, y, { align: "center" })
  y += 9
  doc.text(`${branding.businessName} - Control de Almacen`, centerX, y, { align: "center" })
  y += 9

  const now = new Date()
  doc.setFontSize(7)
  doc.text(`Impreso: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, centerX, y, { align: "center" })

  return doc.output("blob")
}

export function generateAlmacenClosingNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const random = Math.floor(Math.random() * 9000) + 1000
  return `CA-${year}${month}${day}-${random}`
}
