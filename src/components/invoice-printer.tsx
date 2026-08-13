"use client"

import type { Sale, Payment, Customer, CartItem } from "@/components/store-context"
import {
  persistClientInvoiceFromPayment,
  persistClientInvoiceFromSale,
  type SaveClientInvoiceOptions,
} from "@/lib/invoice-storage"
import { formatAlmacenSaleItemName } from "@/lib/almacen"
import { getPrintLogoUrl } from "@/lib/print-logo"
import { formatCurrency } from "@/lib/utils"
import { NOMBRECONFI } from "@/nombreconfi"
import {
  getBrandingRepairHeaderHtml,
  getBrandingTicketHeaderHtml,
  getTenantBranding,
  resolvePrintBranding,
  THERMAL_LOGO_NAME_OVERLAP_MM,
  THERMAL_PRINT_LOGO_CSS,
} from "@/lib/tenant-branding"

export interface InvoicePrinterProps {
  businessName?: string
  businessRnc?: string
  businessPhone?: string
  businessAddress?: string
  businessEmail?: string
}

const defaultConfig: InvoicePrinterProps = {
  businessName: NOMBRECONFI.businessName,
  businessRnc: "",
  businessPhone: NOMBRECONFI.phones,
  businessAddress: NOMBRECONFI.address,
  businessEmail: NOMBRECONFI.email,
}

// --- SHARED STYLES & HELPERS ---
const LINE_WIDTH = 38
const DIVIDER = "=".repeat(LINE_WIDTH)
const DIVIDER_LIGHT = "-----------" // Short separator
const PRINT_TEXT_SCALE_FACTOR = 1.25
const PRINT_BUSINESS_NAME = NOMBRECONFI.businessName.toUpperCase()
const scalePrintPx = (sizePx: number) => Number((sizePx * PRINT_TEXT_SCALE_FACTOR).toFixed(2))
const FINAL_PRINT_SPACER = `
  <div class="line">${DIVIDER_LIGHT}</div>
  <div class="space"></div>
`

const SHARED_STYLES = `
  @page { size: auto; margin: 0mm; }
  body { 
    font-family: Calibri, 'Segoe UI', Candara, Arial, sans-serif;
    font-size: ${scalePrintPx(16)}px;
    margin: 0;
    padding: 0;
    background-color: #fff;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ticket {
    width: 80mm;
    max-width: 80mm;
    margin: 0 auto;
    padding: 2mm 2mm 2mm 2mm;
    box-sizing: border-box;
    background: white;
  }
  .center { text-align: center; }
  .left { text-align: left; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .flex-row {
    display: flex;
    justify-content: space-between;
    width: 100%;
    line-height: 1.3;
    margin-bottom: 0.5mm;
  }
  .line { 
    white-space: pre-wrap;
    font-size: ${scalePrintPx(16)}px;
    font-family: Calibri, 'Segoe UI', Candara, Arial, sans-serif;
    width: 100%;
    line-height: 1.3;
    margin-bottom: 0.5mm;
  }
  .header { 
      font-size: ${scalePrintPx(24)}px;
      font-weight: 900; 
      text-align: center; 
      margin: 0 0 1mm 0;
      padding: 0;
      line-height: 1.1;
      color: #000;
      text-transform: uppercase;
      width: 100%;
  }
  .subtitle {
      font-size: ${scalePrintPx(12)}px;
      font-weight: bold;
      text-align: center;
      margin-bottom: 2mm;
      color: #000;
      width: 100%;
  }
  .contact-info {
      font-size: ${scalePrintPx(12)}px;
      text-align: center;
      margin-bottom: 1mm;
      width: 100%;
  }
  .contact-info div {
      text-align: center;
      width: 100%;
  }
  .total { font-size: ${scalePrintPx(20)}px; font-weight: bold; }
  .small { font-size: ${scalePrintPx(14)}px; }
  .space { height: 1mm; display: block; }
  .firma { margin-top: 5mm; text-align: center; }
  .firma-line { border-top: 2px solid #000; width: 70%; margin: 1mm auto 0 auto; padding-top: 2mm; font-size: ${scalePrintPx(12)}px; }
  .amount-box { border: 2px solid #000; padding: 3mm; margin: 2mm 0; text-align: center; background: white; }
  .brand-header {
    text-align: center;
    margin: 0 auto 3mm auto;
    padding-bottom: 2mm;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .brand-title-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 1mm;
    line-height: 1;
    font-size: 0;
    margin-bottom: 1mm;
    width: 100%;
  }
  .brand-title-stack .logo-wrap {
    margin: 0 auto;
    padding: 0;
    min-height: 28mm;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .brand-title-stack .header {
    margin-top: 0;
    padding-top: 0;
    text-align: center;
    width: 100%;
  }
  .brand-title-stack .subtitle {
    margin-top: 0;
    margin-bottom: 1mm;
    text-align: center;
    width: 100%;
  }
  .brand-contact {
    margin-top: 2mm;
    padding-top: 2mm;
    border-top: 1px dashed #bbb;
    text-align: center;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .brand-contact .contact-info {
    margin-bottom: 0;
    text-align: center;
    width: 100%;
  }
  .logo-wrap {
    text-align: center;
    margin: 0 auto;
    padding: 0;
    width: 100%;
    line-height: 0;
    font-size: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .print-logo {
    display: block;
    margin: 0 auto;
    padding: 0;
    vertical-align: top;
    ${THERMAL_PRINT_LOGO_CSS}
  }
`

const getPrintLogoHtml = () =>
  `<div class="logo-wrap"><img class="print-logo" src="${getPrintLogoUrl()}" alt="${NOMBRECONFI.businessName} logo" /></div>`

type PrintHtmlOptions = {
  silent?: boolean
  deviceName?: string
}

type ElectronPrintResult = {
  supported: boolean
  success: boolean
  error?: string
}

export type StorageLabelPrintResult = {
  success: boolean
  mode: "electron-silent" | "print-dialog"
  error?: string
}

const sendHtmlToElectronPrinter = (html: string, options?: PrintHtmlOptions) => {
  if (typeof window === "undefined") return false

  try {
    const electronRequire = (window as Window & { require?: (module: string) => any }).require
    if (typeof electronRequire !== "function") return false

    const electronModule = electronRequire("electron")
    const ipcRenderer = electronModule?.ipcRenderer

    if (!ipcRenderer?.send) return false

    ipcRenderer.send("printer:print-html", {
      html,
      silent: Boolean(options?.silent),
      deviceName: options?.deviceName,
    })

    return true
  } catch (error) {
    console.error("electron silent print error", error)
    return false
  }
}

const invokeHtmlToElectronPrinter = async (html: string, options?: PrintHtmlOptions): Promise<ElectronPrintResult> => {
  if (typeof window === "undefined") {
    return { supported: false, success: false }
  }

  try {
    const electronRequire = (window as Window & { require?: (module: string) => any }).require
    if (typeof electronRequire !== "function") {
      return { supported: false, success: false }
    }

    const electronModule = electronRequire("electron")
    const ipcRenderer = electronModule?.ipcRenderer

    if (!ipcRenderer?.invoke) {
      return { supported: false, success: false }
    }

    const result = await ipcRenderer.invoke("printer:print-html", {
      html,
      silent: Boolean(options?.silent),
      deviceName: options?.deviceName,
    })

    return {
      supported: true,
      success: Boolean(result?.success),
      error: typeof result?.error === "string" ? result.error : undefined,
    }
  } catch (error) {
    console.error("electron invoke print error", error)
    return {
      supported: true,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const printHtmlUsingHiddenIframe = (html: string, options?: PrintHtmlOptions) => {
  if (options?.silent && sendHtmlToElectronPrinter(html, options)) {
    return
  }

  try {
    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.left = "-9999px"
    iframe.style.top = "-9999px"
    iframe.style.width = "1px"
    iframe.style.height = "1px"
    iframe.style.opacity = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document
    if (!doc) {
      setTimeout(() => {
        try {
          iframe.remove()
        } catch (error) {
          console.debug("No se pudo remover iframe temporal", error)
        }
      }, 1000)
      return
    }

    let printed = false
    const triggerPrint = () => {
      if (printed) return
      printed = true
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } catch (error) {
        console.debug("No se pudo lanzar la impresion del iframe", error)
      }
      setTimeout(() => {
        try {
          if (iframe.parentNode) {
            document.body.removeChild(iframe)
          }
        } catch (error) {
          console.debug("No se pudo remover iframe despues de imprimir", error)
        }
      }, 1000)
    }

    iframe.onload = triggerPrint

    doc.open()
    doc.write(html)
    doc.close()

    // Fallback trigger in case iframe.onload does not fire after doc.close
    setTimeout(triggerPrint, 250)
  } catch (e) {
    console.error("print iframe error", e)
  }
}

// --- FUNCIÓN PARA FACTURA DE VENTA ---
export async function printSaleInvoice(
  sale: Sale,
  customers?: Customer[],
  employee?: { name?: string; phone?: string } | null,
  config: InvoicePrinterProps = defaultConfig,
  persistOptions?: SaveClientInvoiceOptions,
) {
  if (persistOptions?.ownerAdminId) {
    void persistClientInvoiceFromSale(sale, persistOptions, employee?.name)
  }

  const { branding } = await resolvePrintBranding(persistOptions?.ownerAdminId)

  const customerInfo = customers?.find((c) => c.name === sale.customerName)
  const saleWithCash = sale as Sale & { cashReceived?: number }
  const cashReceived = saleWithCash.cashReceived ?? sale.amountPaid
  const employeeName = employee?.name ?? ""

  const fechaVencimiento = new Date(sale.date)
  fechaVencimiento.setDate(fechaVencimiento.getDate() + 30)

  const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Factura ${sale.invoiceNumber}</title>
      <style>${SHARED_STYLES}</style>
    </head>
    <body>
      <div class="ticket">
        ${getBrandingTicketHeaderHtml(branding)}
        
        <div class="line">${DIVIDER}</div>
        
        <div class="flex-row small"><span class="bold">FACT:</span> <span>${sale.invoiceNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${new Date(sale.date).toLocaleDateString("es-DO")}</span></div>
        <div class="flex-row small"><span class="bold">HORA:</span> <span>${new Date(sale.date).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span></div>

        <div class="line">${DIVIDER_LIGHT}</div>

        ${employeeName
      ? `<div class="flex-row small"><span class="bold">EMPLEADO:</span> <span>${(employeeName || "").substring(0, 25)}</span></div>`
      : ""
    }

        ${customerInfo
      ? `
          <div class="flex-row small"><span class="bold">CLIENTE:</span> <span>${customerInfo.name.substring(0, 25)}</span></div>
          <div class="flex-row small"><span class="bold">CED:</span> <span>${customerInfo.cedula}</span></div>
        `
      : sale.customerName
        ? `
              <div class="flex-row small"><span class="bold">CLIENTE:</span> <span>${sale.customerName.substring(0, 25)}</span></div>`
        : ""
    }
        <div class="flex-row small"><span class="bold">PAGO:</span> <span>${sale.status === "pending" ? "PENDIENTE" : sale.status === "credito" && sale.amountPaid > 0 ? "PAGO PARCIAL" : sale.paymentMethod === "cash" ? "EFECTIVO" : sale.paymentMethod === "card" ? "TARJETA" : "TRANSF."}</span></div>
        
        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="center bold">DETALLE</div>
        <div class="line">${DIVIDER_LIGHT}</div>
        
        ${sale.items
      .map(
        (item) => `
          <div class="line bold">${formatAlmacenSaleItemName({
            name: item.name,
            boxNumber: item.boxNumber,
            category: item.category,
          }).substring(0, LINE_WIDTH)}</div>
          <div class="flex-row">
              <span>${item.quantity} x $${formatCurrency(item.customPrice ?? item.sellPrice)}</span>
              <span>$${formatCurrency((item.customPrice ?? item.sellPrice) * item.quantity)}</span>
          </div>
        `,
      )
      .join("")}
        
        <div class="line">${DIVIDER_LIGHT}</div>

        ${(() => {
          const subtotalAmount = sale.items.reduce((sum, item) => sum + ((item.customPrice ?? item.sellPrice ?? 0) * item.quantity), 0)
          const discountAmount = sale.discount !== undefined
            ? sale.discount
            : Math.max(0, subtotalAmount - sale.total)

          return discountAmount > 0
            ? `
              <div class="flex-row"><span>PRECIO ORIGINAL:</span> <span>$${formatCurrency(subtotalAmount)}</span></div>
              <div class="flex-row"><span>DESCUENTO:</span> <span>-$${formatCurrency(discountAmount)}</span></div>
            `
            : ""
        })()}

        ${sale.status === "credito"
      ? `
          <div class="flex-row"><span>TOTAL VENTA:</span> <span>$${formatCurrency(sale.total)}</span></div>
          <div class="flex-row"><span>PAGADO EFECTIVO:</span> <span>$${formatCurrency(sale.amountPaid)}</span></div>
          <div class="flex-row bold"><span>FALTANTE CRÉDITO:</span> <span>$${formatCurrency(sale.total - sale.amountPaid)}</span></div>
        `
      : cashReceived !== undefined && sale.change !== undefined && sale.change > 0
        ? `
          <div class="flex-row"><span>MONTO RECIBIDO:</span> <span>$${formatCurrency(Number(cashReceived))}</span></div>
          <div class="flex-row"><span>CAMBIO:</span> <span>$${formatCurrency(sale.change)}</span></div>
        `
        : ""
    }

        <div class="line">${DIVIDER}</div>

        <div class="flex-row total">
          ${sale.status === "credito" || sale.paymentMethod === "credit"
      ? '<div class="center bold" style="width: 100%; font-size: 18px;">ESTADO: CRÉDITO</div>'
      : `<span>TOTAL:</span><span>$${formatCurrency(sale.total)}</span>`
    }
        </div>

        <div class="line">${DIVIDER}</div>

        ${sale.status === "pending" ? '<div class="center bold small">PRE-FACTURA EN COLA (SIN COBRO)</div><div class="line">' + DIVIDER + "</div>" : ""}

        ${sale.status === "credito" || sale.paymentMethod === "credit" ? `
        <div class="firma">
          <div class="firma-line">Firma del Cliente</div>
        </div>
        <div class="space"></div>
        ` : ""}

        <div class="space"></div>
        <div class="center bold">GRACIAS POR SU COMPRA</div>
        ${FINAL_PRINT_SPACER}
      </div>
    </body>
    </html>
  `
  printHtmlUsingHiddenIframe(invoiceHTML)
}

// --- FUNCIÓN PARA COMPROBANTE DE PAGO ---
export async function printPaymentInvoice(
  payment: Payment,
  customer: Customer,
  config: InvoicePrinterProps = defaultConfig,
  persistOptions?: SaveClientInvoiceOptions,
) {
  if (persistOptions?.ownerAdminId) {
    void persistClientInvoiceFromPayment(payment, customer.name, {
      ...persistOptions,
      source: "pago",
      paymentId: payment.id,
    })
  }

  const { branding } = await resolvePrintBranding(persistOptions?.ownerAdminId)

  const paymentMethodLabel = payment.paymentMethod === "cash" ? "Efectivo" : payment.paymentMethod === "card" ? "Tarjeta" : "Transferencia"
  const paymentDate = new Date(payment.date)
  const receiptKind = payment.customerType === "almacen" ? "ABONO A DEUDA CLIENTE ALMACEN" : "ABONO A DEUDA CLIENTE"

  const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pago - ${payment.invoiceNumber}</title>
      <style>
        ${SHARED_STYLES}
        .payment-headline {
          text-align: center;
          font-weight: 900;
          font-size: ${scalePrintPx(15)}px;
          margin: 1.3mm 0 0.7mm 0;
        }
        .payment-subheadline {
          text-align: center;
          font-size: ${scalePrintPx(11)}px;
          font-weight: 700;
          letter-spacing: 0.3px;
          margin-bottom: 1mm;
        }
        .payment-method-badge {
          border: 1px solid #000;
          padding: 0.6mm 1.2mm;
          border-radius: 999px;
          font-size: ${scalePrintPx(11)}px;
          font-weight: 800;
          text-transform: uppercase;
        }
        .summary-card {
          border: 2px solid #000;
          margin: 1.8mm 0;
          padding: 1.4mm;
        }
        .summary-title {
          text-align: center;
          font-weight: 800;
          font-size: ${scalePrintPx(11)}px;
          margin-bottom: 0.6mm;
        }
        .summary-amount {
          text-align: center;
          font-size: ${scalePrintPx(26)}px;
          font-weight: 900;
          line-height: 1.05;
          margin: 0.8mm 0;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${getBrandingTicketHeaderHtml(branding)}

        <div class="line">${DIVIDER}</div>
        <div class="payment-headline">COMPROBANTE DE PAGO</div>
        <div class="payment-subheadline">${receiptKind}</div>
        <div class="line">${DIVIDER_LIGHT}</div>

        <div class="flex-row small"><span class="bold">No. recibo:</span> <span>${payment.invoiceNumber}</span></div>
        <div class="flex-row small"><span class="bold">Fecha:</span> <span>${paymentDate.toLocaleDateString("es-DO")}</span></div>
        <div class="flex-row small"><span class="bold">Hora:</span> <span>${paymentDate.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span></div>
        <div class="flex-row small"><span class="bold">Metodo:</span> <span class="payment-method-badge">${paymentMethodLabel}</span></div>

        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="line bold">CLIENTE</div>
        <div class="line">${customer.name.substring(0, LINE_WIDTH)}</div>
        <div class="flex-row small"><span class="bold">Cedula:</span> <span>${customer.cedula || "N/A"}</span></div>
        <div class="flex-row small"><span class="bold">Telefono:</span> <span>${customer.phone || "N/A"}</span></div>

        <div class="summary-card">
          <div class="summary-title">MONTO ABONADO</div>
          <div class="summary-amount">$${formatCurrency(payment.amount)}</div>
        </div>

        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="line bold">ESTADO DE LA DEUDA</div>
        <div class="flex-row"><span>Antes:</span> <span>$${formatCurrency(payment.previousDebt)}</span></div>
        <div class="flex-row"><span>Abono:</span> <span>$${formatCurrency(payment.amount)}</span></div>
        <div class="flex-row bold"><span>Pendiente:</span> <span>$${formatCurrency(payment.remainingDebt)}</span></div>

        ${payment.note ? `<div class="line small">NOTA: ${payment.note.substring(0, 62)}</div>` : ""}

        <div class="line">${DIVIDER}</div>
        <div class="firma">
          <div class="firma-line">Firma del Cliente</div>
        </div>
        <div class="space"></div>
        <div class="center bold">Gracias por su pago</div>
        <div class="center small">Conserve este recibo como constancia.</div>
        ${FINAL_PRINT_SPACER}
      </div>
    </body>
    </html>
  `
  printHtmlUsingHiddenIframe(invoiceHTML)
}

// --- FUNCIÓN PARA COMPROBANTE DE DEVOLUCIÓN ---
export interface ReturnTicketData {
  returnNumber: string
  invoiceNumber: string
  customerName?: string
  date: string
  items: Array<{
    productName: string
    quantity: number
    unitPrice: number
    subtotal: number
  }>
  total: number
  type: "reembolso" | "credito" | "cambio"
  reason?: string
}

export async function printReturnTicket(
  data: ReturnTicketData,
  config: InvoicePrinterProps = defaultConfig,
  ownerAdminId?: string | null,
) {
  const { branding } = await resolvePrintBranding(ownerAdminId)

  const typeLabel = data.type === 'reembolso' ? 'REEMBOLSO' : data.type === 'credito' ? 'CRÉDITO A FAVOR' : 'CAMBIO';

  const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Devolución - ${data.returnNumber}</title>
      <style>${SHARED_STYLES}</style>
    </head>
    <body>
      <div class="ticket">
        ${getBrandingTicketHeaderHtml(branding)}

        <div class="line">${DIVIDER}</div>
        <div class="center bold">NOTA DE CRÉDITO / DEVOLUCIÓN</div>
        <div class="line">${DIVIDER}</div>
        
        <div class="flex-row small"><span class="bold">DEV:</span> <span>${data.returnNumber}</span></div>
        <div class="flex-row small"><span class="bold">FACT ORIG:</span> <span>${data.invoiceNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${new Date(data.date).toLocaleDateString("es-DO")}</span></div>
        
        <div class="line">${DIVIDER_LIGHT}</div>

        ${data.customerName
      ? `<div class="line bold">CLIENTE:</div><div class="line">${data.customerName.substring(0, LINE_WIDTH)}</div>`
      : ''}
          
        <div class="line bold">TIPO: ${typeLabel}</div>
        ${data.reason ? `<div class="line small">MOTIVO: ${data.reason.substring(0, LINE_WIDTH)}</div>` : ''}

        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="center bold">PRODUCTOS DEVUELTOS</div>
        <div class="line">${DIVIDER_LIGHT}</div>

        ${data.items.map(item => `
          <div class="line bold">${item.productName.substring(0, LINE_WIDTH)}</div>
          <div class="flex-row">
              <span>${item.quantity} x $${formatCurrency(item.unitPrice)}</span>
              <span>$${formatCurrency(item.subtotal)}</span>
          </div>
        `).join('')}

        <div class="line">${DIVIDER}</div>

        <div class="amount-box">
          <div class="small">TOTAL DEVOLUCIÓN</div>
          <div class="total">$${formatCurrency(data.total)}</div>
        </div>

        <div class="center small">Conserve este comprobante</div>
        <div class="space"></div>
      </div>
    </body>
    </html>
  `
  printHtmlUsingHiddenIframe(invoiceHTML)
}


// --- FUNCIÓN PARA TICKET DE REPARACIÓN ---
export interface RepairTicketData {
  repairNumber: string
  clientName: string
  device: string
  issue: string
  type: "repair" | "unlock"
  date: string
}

export async function printRepairTicket(
  data: RepairTicketData,
  config: InvoicePrinterProps = defaultConfig,
  ownerAdminId?: string | null,
) {
  const { branding } = await resolvePrintBranding(ownerAdminId)

  const REPAIR_TICKET_STYLES = `
    @page { size: auto; margin: 0mm; }
    body {
      font-family: Calibri, 'Segoe UI', Candara, Arial, sans-serif;
      font-size: ${scalePrintPx(14)}px;
      margin: 0;
      padding: 0;
      background-color: #fff;
      line-height: 1.5;
      color: #222;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ticket {
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 2mm 2mm 2mm 2mm;
      box-sizing: border-box;
      background: white;
    }
    /* Header */
    .ticket-header {
      text-align: center;
      padding-bottom: 3mm;
      border-bottom: 1px solid #ddd;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .logo-wrap {
      margin: 0 auto;
      padding: 0;
      width: 100%;
      line-height: 0;
      font-size: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .print-logo {
      display: block;
      margin: 0 auto;
      vertical-align: top;
      ${THERMAL_PRINT_LOGO_CSS}
    }
    .ticket-header .brand-title-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 1mm;
      line-height: 1;
      font-size: 0;
      width: 100%;
    }
    .ticket-header .brand-title-stack .biz-name {
      font-size: ${scalePrintPx(22)}px;
      font-weight: 900;
      margin: 0;
      padding: 0;
      line-height: 1.1;
      color: #111;
      text-align: center;
      width: 100%;
    }
    .ticket-header .biz-subtitle,
    .ticket-header .biz-address,
    .ticket-header .biz-email,
    .ticket-header .biz-phone {
      font-size: ${scalePrintPx(11)}px;
      color: #444;
      margin: 1px 0;
      text-align: center;
      width: 100%;
    }
    .ticket-header .ticket-date {
      font-size: ${scalePrintPx(11)}px;
      color: #888;
      margin-top: 3mm;
      text-align: center;
      width: 100%;
    }
    /* Info rows */
    .info-section {
      padding: 3mm 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 1.5mm 0;
      border-bottom: 1px solid #eee;
      font-size: ${scalePrintPx(13)}px;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 700;
      color: #222;
    }
    .info-value {
      text-align: right;
      color: #333;
    }
    /* Servicio section */
    .servicio-section {
      border-top: 1px dashed #ccc;
      margin-top: 2mm;
      padding-top: 2mm;
    }
    .servicio-section .servicio-title {
      font-weight: 700;
      font-size: ${scalePrintPx(13)}px;
      margin-bottom: 1mm;
    }
    .servicio-section .servicio-detail {
      font-size: ${scalePrintPx(13)}px;
      color: #333;
    }
    /* Footer */
    .ticket-footer {
      text-align: center;
      padding-top: 4mm;
      border-top: 1px solid #ddd;
      margin-top: 3mm;
    }
    .ticket-footer p {
      font-size: ${scalePrintPx(11)}px;
      color: #888;
      margin: 1px 0;
    }
    /* Firma */
    .ticket-firma {
      margin-top: 6mm;
      padding-top: 2mm;
      border-top: 1px solid #ddd;
    }
    .ticket-firma .firma-linea {
      border-top: 2px solid #000;
      width: 65%;
      margin: 0 auto;
      padding-top: 2mm;
      text-align: center;
      font-size: ${scalePrintPx(11)}px;
      font-weight: 600;
      color: #222;
    }
  `;

  const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Reparación - ${data.repairNumber}</title>
      <style>${REPAIR_TICKET_STYLES}</style>
    </head>
    <body>
      <div class="ticket">
        <div class="ticket-header">
          ${getBrandingRepairHeaderHtml(branding)}
          <div class="ticket-date">Fecha: ${new Date(data.date).toLocaleDateString("es-DO")}</div>
        </div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Ticket:</span>
            <span class="info-value">${data.repairNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cliente:</span>
            <span class="info-value">${data.clientName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Equipo:</span>
            <span class="info-value">${data.device}</span>
          </div>
        </div>

        <div class="servicio-section">
          <div class="servicio-title">Servicio:</div>
          <div class="servicio-detail">${data.type === "repair" ? "Reparación" : "Desbloqueo"} - ${data.issue}</div>
        </div>

        <div class="ticket-footer">
          <p>Gracias por su preferencia</p>
          <p>Conserve este ticket para retirar su equipo</p>
        </div>

        <div class="ticket-firma">
          <div class="firma-linea">FIRMA CLIENTE</div>
        </div>
      </div>
    </body>
    </html>
  `
  printHtmlUsingHiddenIframe(invoiceHTML)
}


// --- FUNCIÓN PARA CIERRE DE CAJA ---
export interface CashClosingTicketData {
  closingNumber: string
  date: string
  cashierName: string
  openingBalance: number
  totalSales: number
  salesByMethod: {
    cash: number
    card: number
    transfer: number
    credit: number
  }
  totalReturns: number
  totalPayments: number
  totalRepairs: number
  totalExpenses: number
  expectedCash: number
  countedCash: number
  discrepancy: number
}

export async function printCashClosingTicket(
  data: CashClosingTicketData,
  config: InvoicePrinterProps = defaultConfig,
  ownerAdminId?: string | null,
) {
  const { branding } = await resolvePrintBranding(ownerAdminId)

  const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cierre - ${data.closingNumber}</title>
      <style>
        ${SHARED_STYLES}
        .section-title { 
            font-weight: bold; 
            text-align: center; 
            background: #000; 
            color: #fff; 
            margin: 2mm 0 1mm 0;
            padding: 1px 0;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${getBrandingTicketHeaderHtml(branding)}
        <div class="center small bold">CIERRE DE CAJA</div>
        
        <div class="line">${DIVIDER}</div>
        
        <div class="flex-row small"><span class="bold">NO:</span> <span>${data.closingNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${data.date}</span></div>
        <div class="flex-row small"><span class="bold">CAJERO:</span> <span>${data.cashierName.substring(0, 20)}</span></div>

        <div class="section-title">RESUMEN VENTAS</div>
        <div class="flex-row small"><span>Efectivo:</span> <span>$${formatCurrency(data.salesByMethod.cash)}</span></div>
        <div class="flex-row small"><span>Tarjeta:</span> <span>$${formatCurrency(data.salesByMethod.card)}</span></div>
        <div class="flex-row small"><span>Transf.:</span> <span>$${formatCurrency(data.salesByMethod.transfer)}</span></div>
        <div class="flex-row small"><span>Crédito:</span> <span>$${formatCurrency(data.salesByMethod.credit)}</span></div>
        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="flex-row bold"><span>TOTAL VENTAS:</span> <span>$${formatCurrency(data.totalSales)}</span></div>

        <div class="section-title">MOVIMIENTOS</div>
        <div class="flex-row small"><span>(+) Pagos:</span> <span>$${formatCurrency(data.totalPayments)}</span></div>
        <div class="flex-row small"><span>(+) Reparac.:</span> <span>$${formatCurrency(data.totalRepairs)}</span></div>
        <div class="flex-row small"><span>(-) Devoluc.:</span> <span>$${formatCurrency(data.totalReturns)}</span></div>
        <div class="flex-row small"><span>(-) Gastos:</span> <span>$${formatCurrency(data.totalExpenses)}</span></div>

        <div class="section-title">CUADRE</div>
        <div class="flex-row small"><span>Saldo Inicial:</span> <span>$${formatCurrency(data.openingBalance)}</span></div>
        <div class="flex-row small bold"><span>ESPERADO:</span> <span>$${formatCurrency(data.expectedCash)}</span></div>
        <div class="flex-row small bold"><span>CONTADO:</span> <span>$${formatCurrency(data.countedCash)}</span></div>
        
        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="flex-row bold">
            <span>DIFERENCIA:</span> 
            <span>$${formatCurrency(data.discrepancy)}</span>
        </div>
        
        <div class="center small" style="margin-top: 5mm;">
            ${data.discrepancy === 0 ? "CUADRE PERFECTO" : data.discrepancy > 0 ? "FALTANTE" : "SOBRANTE"}
        </div>

        <div class="space"></div>
        <div class="firma">
          <div class="firma-line">Firma Cajero</div>
        </div>
        <div class="space"></div>
      </div>
    </body>
    </html>
  `
  printHtmlUsingHiddenIframe(invoiceHTML)
}

export interface AlmacenClosingTicketData {
  closingNumber: string
  date: string
  cashierName: string
  totalProducts: number
  totalUnitsExpected: number
  totalUnitsCounted: number
  discrepancyUnits: number
  totalCostExpected: number
  totalCostCounted: number
  discrepancyCost: number
  notes?: string
  financialSummary?: {
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
}

export async function printAlmacenClosingTicket(
  data: AlmacenClosingTicketData,
  config: InvoicePrinterProps = defaultConfig,
  ownerAdminId?: string | null,
) {
  const { branding } = await resolvePrintBranding(ownerAdminId)

  const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cierre Almacen - ${data.closingNumber}</title>
      <style>
        ${SHARED_STYLES}
        .section-title {
          font-weight: bold;
          text-align: center;
          background: #000;
          color: #fff;
          margin: 2mm 0 1mm 0;
          padding: 1px 0;
        }
        .note-box {
          border: 1px dashed #000;
          padding: 2mm;
          margin-top: 2mm;
          font-size: ${scalePrintPx(13)}px;
        }
      </style>
    </head>
    <body>
      <div class="ticket">
        ${getBrandingTicketHeaderHtml(branding)}
        <div class="center small bold">CIERRE DE ALMACEN</div>

        <div class="line">${DIVIDER}</div>

        <div class="flex-row small"><span class="bold">NO:</span> <span>${data.closingNumber}</span></div>
        <div class="flex-row small"><span class="bold">FECHA:</span> <span>${data.date}</span></div>
        <div class="flex-row small"><span class="bold">RESPONSABLE:</span> <span>${data.cashierName.substring(0, 20)}</span></div>

        <div class="section-title">RESUMEN</div>
        <div class="flex-row small"><span>Productos:</span> <span>${data.totalProducts}</span></div>
        <div class="flex-row small"><span>Unid. esperadas:</span> <span>${data.totalUnitsExpected}</span></div>
        <div class="flex-row small"><span>Unid. contadas:</span> <span>${data.totalUnitsCounted}</span></div>
        <div class="flex-row small bold"><span>Diferencia unid.:</span> <span>${data.discrepancyUnits}</span></div>
        <div class="line">${DIVIDER_LIGHT}</div>
        <div class="flex-row small"><span>Costo esperado:</span> <span>$${formatCurrency(data.totalCostExpected)}</span></div>
        <div class="flex-row small"><span>Costo contado:</span> <span>$${formatCurrency(data.totalCostCounted)}</span></div>
        <div class="flex-row bold"><span>Diferencia costo:</span> <span>$${formatCurrency(data.discrepancyCost)}</span></div>

        ${data.financialSummary ? `
          <div class="section-title">CIERRE INFORMADO</div>
          <div class="flex-row small"><span>Total Facturado:</span> <span>$${formatCurrency(data.financialSummary.totalSales)}</span></div>
          <div class="flex-row small"><span>Facturas:</span> <span>${data.financialSummary.invoiceCount}</span></div>
          <div class="flex-row small"><span>En Efectivo:</span> <span>$${formatCurrency(data.financialSummary.cashNet)}</span></div>
          <div class="flex-row small"><span>En Tarjeta:</span> <span>$${formatCurrency(data.financialSummary.cardNet)}</span></div>
          <div class="flex-row small"><span>Transferencias:</span> <span>$${formatCurrency(data.financialSummary.transferNet)}</span></div>
          <div class="flex-row small"><span>A Credito:</span> <span>$${formatCurrency(data.financialSummary.creditNet)}</span></div>
          <div class="flex-row small"><span>Devoluciones:</span> <span>-$${formatCurrency(data.financialSummary.totalReturns)}</span></div>
          <div class="flex-row small"><span>Abonos Deuda (Efectivo):</span> <span>$${formatCurrency(data.financialSummary.cashDebtPayments)}</span></div>
          <div class="line">${DIVIDER_LIGHT}</div>
          <div class="flex-row bold"><span>Ventas Netas de Almacen:</span> <span>$${formatCurrency(data.financialSummary.netIncome)}</span></div>
        ` : ""}

        <div class="section-title">ESTADO</div>
        <div class="center small" style="margin-top: 1mm;">
          ${data.discrepancyUnits === 0 && data.discrepancyCost === 0 ? "CUADRE PERFECTO" : "REQUIERE REVISION"}
        </div>

        ${data.notes ? `<div class="note-box"><div class="bold">Notas:</div><div>${data.notes}</div></div>` : ""}

        <div class="space"></div>
        <div class="firma">
          <div class="firma-line">Firma Responsable</div>
        </div>
        <div class="space"></div>
      </div>
    </body>
    </html>
  `
  printHtmlUsingHiddenIframe(invoiceHTML)
}

export interface StorageLabelData {
  productName: string
  caja: string
  component?: string
  details?: string
  imei?: string
  copies?: number
  boxLabel?: string
  hideProductName?: boolean
  singleLineBoxInfo?: boolean
  showFullProductName?: boolean
  printerProfile?: "default" | "2c-lp281b"
  companyName?: string
}

type StorageLabelPrintOptions = {
  silent?: boolean
}

const CODE39_PATTERNS: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const truncateLabelLine = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...` : value

export const getBusinessAbbreviation = (businessName: string) => {
  const tokens = businessName
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^0-9A-Za-z]/g, ""))
    .filter(Boolean)

  if (!tokens.length) return "EMP"
  if (tokens.length === 1) return tokens[0].slice(0, 4).toUpperCase()

  const abbreviation = tokens
    .slice(0, 3)
    .map((token) => (/^\d+$/.test(token) && token.length <= 3 ? token : token[0]))
    .join("")
    .toUpperCase()

  return abbreviation || "EMP"
}

export const STORAGE_LABEL_COMPANY_SHORT = PRINT_BUSINESS_NAME

const sanitizeCode39Value = (value: string) => {
  const normalized = value.toUpperCase().replace(/\s+/g, " ").trim()
  const sanitized = Array.from(normalized)
    .map((char) => (char !== "*" && CODE39_PATTERNS[char] ? char : "-"))
    .join("")

  return sanitized || "SIN-ID"
}

const buildCode39Svg = (value: string) => {
  const encodedValue = `*${value}*`
  const narrowBar = 2
  const wideBar = 5
  const barHeight = 60
  const interCharacterGap = 2

  let cursorX = 0
  const bars: string[] = []

  Array.from(encodedValue).forEach((char, charIndex) => {
    const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS["-"]

    Array.from(pattern).forEach((barType, segmentIndex) => {
      const segmentWidth = barType === "w" ? wideBar : narrowBar
      const isBar = segmentIndex % 2 === 0

      if (isBar) {
        bars.push(`<rect x="${cursorX}" y="0" width="${segmentWidth}" height="${barHeight}" fill="#000" />`)
      }

      cursorX += segmentWidth
    })

    if (charIndex < encodedValue.length - 1) {
      cursorX += interCharacterGap
    }
  })

  return `
    <svg viewBox="0 0 ${cursorX} ${barHeight}" preserveAspectRatio="none" role="img" aria-label="Codigo de barras ${escapeHtml(value)}">
      ${bars.join("")}
    </svg>
  `
}

export async function printStorageLabel(
  data: StorageLabelData,
  options?: StorageLabelPrintOptions,
  ownerAdminId?: string | null,
): Promise<StorageLabelPrintResult> {
  const { branding } = await resolvePrintBranding(ownerAdminId)
  const companyShort =
    data.companyName?.trim() ||
    branding.businessName?.trim() ||
    getBusinessAbbreviation(branding.businessName) ||
    STORAGE_LABEL_COMPANY_SHORT

  const TEXT_SCALE_FACTOR = 1.1
  const TEXT_SHIFT_X_PERCENT = -4
  const scaleTextSize = (sizePx: number) => Number((sizePx * TEXT_SCALE_FACTOR).toFixed(2))
  const copies = Math.max(1, Math.floor(data.copies || 1))
  const boxLabel = (data.boxLabel || "Caja").trim()
  const printerProfile = data.printerProfile === "2c-lp281b" ? "2c-lp281b" : "default"
  const isNarrowPrinterProfile = printerProfile === "2c-lp281b"
  const normalizedProductName = String(data.productName || "").trim()
  const normalizedComponent = String(data.component || "").trim()
  const normalizedDetails = String(data.details || "").trim()
  const normalizedImei = String(data.imei || "").trim()
  const identifierSource = String(data.caja || "").trim() || "SIN-ID"
  const maxBarcodeLength = isNarrowPrinterProfile ? 18 : 30
  const barcodeValue = sanitizeCode39Value(identifierSource).slice(0, maxBarcodeLength).trim() || "SIN-ID"
  const barcodeSvg = buildCode39Svg(barcodeValue)
  const displayIdentifier = truncateLabelLine(identifierSource.toUpperCase(), isNarrowPrinterProfile ? 22 : 40)
  const displayImei = normalizedImei
    ? truncateLabelLine(normalizedImei.toUpperCase(), isNarrowPrinterProfile ? 24 : 36)
    : ""
  const secondaryLines = [normalizedComponent, normalizedDetails]
    .filter(Boolean)
    .map((line) => truncateLabelLine(line.toUpperCase(), isNarrowPrinterProfile ? 24 : 38))
  const shouldRenderProductName = !data.hideProductName && Boolean(normalizedProductName)
  const productNameLength = normalizedProductName.length
  const productNameBaseFontPx = isNarrowPrinterProfile
    ? productNameLength > 48
      ? 6.1
      : productNameLength > 34
        ? 6.8
        : 7.6
    : productNameLength > 66
      ? 9.8
      : productNameLength > 48
        ? 11
        : 12.4
  const productNameFontPx = scaleTextSize(productNameBaseFontPx)
  const productNameLineHeight = isNarrowPrinterProfile ? 1.07 : 1.1
  const productNameMaxHeightMm = isNarrowPrinterProfile ? 8 : 12
  const pageWidthMm = isNarrowPrinterProfile ? 38 : 58
  const pageHeightMm = isNarrowPrinterProfile ? 27 : 40
  const pagePaddingMm = isNarrowPrinterProfile ? 0.55 : 2
  const labelPaddingMm = isNarrowPrinterProfile ? 1.05 : 2.2
  const labelRadiusMm = isNarrowPrinterProfile ? 1.5 : 2.4
  const companyFontPx = scaleTextSize(isNarrowPrinterProfile ? 15.5 : 24)
  const companyMarginBottomMm = isNarrowPrinterProfile ? 0.45 : 1.3
  const metaFontPx = scaleTextSize(isNarrowPrinterProfile ? 6.1 : 8.9)
  const metaLineHeight = isNarrowPrinterProfile ? 1.08 : 1.1
  const barcodeHeightMm = isNarrowPrinterProfile
    ? displayImei
      ? 4.9
      : 5.7
    : displayImei
      ? 8.6
      : 9.4
  const barcodeMarginTopMm = isNarrowPrinterProfile ? 0.25 : 0.8
  const imeiFontPx = scaleTextSize(isNarrowPrinterProfile ? 5.4 : 8.3)
  const identifierFontPx = scaleTextSize(isNarrowPrinterProfile ? 7.1 : 10.6)
  const identifierLetterSpacingPx = isNarrowPrinterProfile ? 0.6 : 0.95

  const LABEL_STYLES = `
    @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label-page {
      width: ${pageWidthMm}mm;
      height: ${pageHeightMm}mm;
      box-sizing: border-box;
      padding: ${pagePaddingMm}mm;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      overflow: hidden;
      page-break-after: always;
    }
    .label-page:last-child {
      page-break-after: auto;
    }
    .label {
      width: 100%;
      height: 100%;
      border: 0;
      border-radius: ${labelRadiusMm}mm;
      padding: ${labelPaddingMm}mm;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0;
      color: #000;
      font-weight: 500;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      background: #fff;
      overflow: hidden;
    }
    .company-short,
    .product-name,
    .meta-line,
    .imei-line,
    .identifier {
      transform: translateX(${TEXT_SHIFT_X_PERCENT}%);
    }
    .company-short {
      font-size: ${companyFontPx}px;
      line-height: 1;
      font-weight: 900;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.25px;
      margin-bottom: ${companyMarginBottomMm}mm;
    }
    .product-name {
      font-size: ${productNameFontPx}px;
      line-height: ${productNameLineHeight};
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      max-height: ${productNameMaxHeightMm}mm;
      overflow: hidden;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .meta {
      margin-top: 0.45mm;
      display: flex;
      flex-direction: column;
      gap: 0.18mm;
    }
    .meta-line {
      font-size: ${metaFontPx}px;
      line-height: ${metaLineHeight};
      text-align: center;
      text-transform: uppercase;
      font-weight: 700;
      color: #111;
    }
    .barcode-wrap {
      margin-top: ${barcodeMarginTopMm}mm;
      padding-top: ${barcodeMarginTopMm}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .imei-line {
      margin-bottom: ${isNarrowPrinterProfile ? 0.16 : 0.4}mm;
      font-size: ${imeiFontPx}px;
      line-height: 1.05;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      color: #111;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .barcode {
      width: 100%;
      height: ${barcodeHeightMm}mm;
      overflow: hidden;
    }
    .barcode svg {
      width: 100%;
      height: 100%;
      display: block;
      shape-rendering: crispEdges;
    }
    .identifier {
      margin-top: 0.5mm;
      font-size: ${identifierFontPx}px;
      line-height: 1;
      font-weight: 900;
      text-align: center;
      letter-spacing: ${identifierLetterSpacingPx}px;
      text-transform: uppercase;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
  `

  const labelHTML = Array.from({ length: copies }, () => `
    <div class="label-page">
      <div class="label">
        <div class="company-short">${escapeHtml(companyShort)}</div>
        ${shouldRenderProductName ? `<div class="product-name">${escapeHtml(normalizedProductName)}</div>` : ""}
        ${secondaryLines.length
          ? `
            <div class="meta">
              ${secondaryLines.map((line) => `<div class="meta-line">${escapeHtml(line)}</div>`).join("")}
            </div>
          `
          : ""}
        <div class="barcode-wrap">
          ${displayImei ? `<div class="imei-line">IMEI: ${escapeHtml(displayImei)}</div>` : ""}
          <div class="barcode">${barcodeSvg}</div>
          <div class="identifier">${escapeHtml(boxLabel.toUpperCase())}: ${escapeHtml(displayIdentifier)}</div>
        </div>
      </div>
    </div>
  `).join("")

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Etiqueta ${escapeHtml(normalizedProductName || "Producto")}</title>
      <style>${LABEL_STYLES}</style>
    </head>
    <body>
      ${labelHTML}
    </body>
    </html>
  `

  const useSilentPrint = options?.silent !== false
  const electronPrintResult = await invokeHtmlToElectronPrinter(html, { silent: useSilentPrint })

  if (electronPrintResult.supported) {
    const mode = useSilentPrint ? "electron-silent" : "print-dialog"
    return electronPrintResult.success
      ? {
        success: true,
        mode,
      }
      : {
        success: false,
        mode,
        error: electronPrintResult.error || "No se pudo imprimir la etiqueta.",
      }
  }

  printHtmlUsingHiddenIframe(html)

  return {
    success: true,
    mode: "print-dialog",
  }
}
