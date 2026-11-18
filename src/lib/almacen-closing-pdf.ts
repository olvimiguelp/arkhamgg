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
  openingBalance?: number
  countedAmount?: number
  discrepancy?: number
}

export interface AlmacenClosingPDFData {
  date: string
  closingNumber: string
  cashier: string
  notes?: string
  financialSummary?: AlmacenClosingFinancialSummary
  transactions?: {
    invoices: Array<{ number: string; method: string; total: number }>
  }
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

  let estimatedHeight = 250
  if (data.financialSummary) {
    estimatedHeight += 120
  }
  if (data.transactions) {
    estimatedHeight += data.transactions.invoices.length * 8
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
    headerTitle: "CIERRE DE CAJA",
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
    const summary = data.financialSummary

    doc.setFillColor(34, 197, 94)
    doc.rect(margin, y - 3, contentWidth, 14, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.setFont("courier", "bold")
    doc.text("RESUMEN DE VENTAS", centerX, y + 7, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 18

    drawRow("Efectivo:", `$${formatAmount(summary.cashNet)}`, y, 9)
    y += 11
    drawRow("Tarjeta:", `$${formatAmount(summary.cardNet)}`, y, 9)
    y += 11
    drawRow("Transferencia:", `$${formatAmount(summary.transferNet)}`, y, 9)
    y += 11
    drawRow("Crédito:", `$${formatAmount(summary.creditNet)}`, y, 9)
    y += 13
    drawLine(y - 3, true)
    drawRow(`TOTAL VENTAS (${summary.invoiceCount})`, `$${formatAmount(summary.totalSales)}`, y + 5, 10, true)
    y += 15

    doc.setFillColor(239, 68, 68)
    doc.rect(margin, y, contentWidth, 14, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("courier", "bold")
    doc.text("DEVOLUCIONES", centerX, y + 10, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 22
    drawRow(`Total Devoluciones (${summary.returnsCount})`, `-$${formatAmount(summary.totalReturns)}`, y, 9)
    y += 15

    doc.setFillColor(59, 130, 246)
    doc.rect(margin, y, contentWidth, 14, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("courier", "bold")
    doc.text("PAGOS DE DEUDA", centerX, y + 10, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 22
    drawRow("Total Pagos (0)", `+$${formatAmount(summary.cashDebtPayments)}`, y, 9)
    y += 15

    doc.setFillColor(168, 85, 247)
    doc.rect(margin, y, contentWidth, 14, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("courier", "bold")
    doc.text("REPARACIONES", centerX, y + 10, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 22
    drawRow("Total Reparaciones (0)", "$0.00", y, 9)
    y += 18

    drawLine(y, false)
    y += 5
    doc.setFillColor(15, 23, 42)
    doc.rect(margin, y, contentWidth, 16, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(11)
    doc.setFont("courier", "bold")
    doc.text("CUADRE DE CAJA", centerX, y + 11, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 24

    const openingBalance = summary.openingBalance
    const countedAmount = summary.countedAmount
    const expectedAmount = openingBalance === undefined ? undefined : openingBalance + summary.cashNet
    const discrepancy =
      summary.discrepancy ??
      (expectedAmount !== undefined && countedAmount !== undefined ? expectedAmount - countedAmount : undefined)

    drawRow("Saldo Inicial:", openingBalance === undefined ? "No registrado" : `$${formatAmount(openingBalance)}`, y, 9)
    y += 12
    drawRow("Monto Esperado:", expectedAmount === undefined ? "No registrado" : `$${formatAmount(expectedAmount)}`, y, 10, true)
    y += 12
    drawRow("Monto Contado:", countedAmount === undefined ? "No registrado" : `$${formatAmount(countedAmount)}`, y, 10, true)
    y += 14

    const discrepancyColor =
      discrepancy === undefined
        ? { bg: [100, 116, 139], text: [255, 255, 255] }
        : discrepancy === 0
        ? { bg: [34, 197, 94], text: [255, 255, 255] }
        : discrepancy > 0
          ? { bg: [239, 68, 68], text: [255, 255, 255] }
          : { bg: [249, 115, 22], text: [255, 255, 255] }
    doc.setFillColor(discrepancyColor.bg[0], discrepancyColor.bg[1], discrepancyColor.bg[2])
    doc.rect(margin, y - 3, contentWidth, 18, "F")
    doc.setTextColor(discrepancyColor.text[0], discrepancyColor.text[1], discrepancyColor.text[2])
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    const discrepancyText =
      discrepancy === undefined
        ? "CUADRE NO REGISTRADO"
        : discrepancy === 0
        ? "CUADRADO"
        : discrepancy > 0
          ? `FALTANTE: $${formatAmount(discrepancy)}`
          : `SOBRANTE: $${formatAmount(Math.abs(discrepancy))}`
    doc.text(discrepancyText, centerX, y + 9, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 25

    if (data.transactions && data.transactions.invoices.length > 0) {
      drawLine(y, true)
      y += 8
      doc.setFontSize(9)
      doc.setFont("courier", "bold")
      doc.text("DETALLE DE FACTURAS", centerX, y, { align: "center" })
      y += 10
      doc.setFontSize(8)
      doc.setFont("courier", "bold")
      doc.text("ID FACTURA", margin + 2, y)
      doc.text("TOTAL", pageWidth - margin - 2, y, { align: "right" })
      y += 8
      doc.setFont("courier", "normal")
      data.transactions.invoices.slice(0, 50).forEach((invoice) => {
        doc.text(invoice.number, margin + 2, y)
        doc.text(`$${formatAmount(invoice.total)}`, pageWidth - margin - 2, y, { align: "right" })
        y += 8
      })
    }
  } else {
    doc.setFont("courier", "italic")
    doc.setFontSize(8)
    doc.text("Resumen financiero no disponible para este cierre.", centerX, y, { align: "center" })
    y += 12
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
