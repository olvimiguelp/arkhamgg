import { drawBrandingClosingHeaderPdf, getTenantBranding } from "@/lib/tenant-branding"

interface CashClosingData {
  date: string
  closingNumber: string
  cashier: string
  openingBalance: number
  sales: {
    cash: number
    card: number
    transfer: number
    credit: number
    total: number
    count: number
  }
  returns: {
    total: number
    count: number
  }
  payments: {
    total: number
    count: number
  }
  repairs: {
    total: number
    count: number
  }
  expectedAmount: number
  countedAmount: number
  discrepancy: number
  notes?: string
  transactions?: {
    invoices: Array<{ number: string; method: string; total: number }>
    returns: Array<{ number: string; invoiceNumber: string; total: number }>
    payments: Array<{ number: string; amount: number }>
  }
}

export async function generateCashClosingPDF(
  data: CashClosingData,
  ownerAdminId?: string | null,
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf")
  const branding = await getTenantBranding(ownerAdminId)
  // 80mm receipt format (226.77 points = 80mm)
  const pageWidth = 226.77
  const margin = 2.83 // 1mm margin
  const contentWidth = pageWidth - margin * 2

  // Calculate dynamic height based on content
  let estimatedHeight = 450 // Base height increased for margin
  if (data.transactions) {
    estimatedHeight += data.transactions.invoices.length * 12
    estimatedHeight += data.transactions.returns.length * 12
    estimatedHeight += data.transactions.payments.length * 12
  }
  estimatedHeight += 11 // Extra margin at the bottom (reduced by 30%)

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: [pageWidth, Math.max(estimatedHeight, 400)],
  })

  let y = margin + 10
  const centerX = pageWidth / 2

  // Helper functions
  const drawCenteredText = (text: string, yPos: number, size: number, style: "normal" | "bold" = "normal") => {
    doc.setFontSize(size)
    doc.setFont("courier", style)
    doc.text(text, centerX, yPos, { align: "center" })
  }

  const drawLine = (yPos: number, style: "solid" | "dashed" = "solid") => {
    if (style === "dashed") {
      (doc as any).setLineDashPattern?.([2, 2], 0);
    } else {
      (doc as any).setLineDashPattern?.([], 0);
    }
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    (doc as any).setLineDashPattern?.([], 0);
  };

  const drawRow = (left: string, right: string, yPos: number, size = 8, bold = false) => {
    doc.setFontSize(size)
    doc.setFont("courier", bold ? "bold" : "normal")
    doc.text(left, margin + 2, yPos)
    doc.text(right, pageWidth - margin - 2, yPos, { align: "right" })
  }

  y = drawBrandingClosingHeaderPdf(doc, branding, {
    pageWidth,
    headerTitle: "CIERRE DE CAJA",
  }) - 5

  // ============ CLOSING INFO ============
  doc.setFillColor(248, 250, 252) // slate-50
  doc.rect(margin, y - 5, contentWidth, 35, "F")

  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text(`No. ${data.closingNumber}`, centerX, y + 5, { align: "center" })

  doc.setFontSize(9)
  doc.setFont("courier", "normal")
  doc.text(`Fecha: ${data.date}`, centerX, y + 16, { align: "center" })
  doc.text(`Cajero: ${data.cashier}`, centerX, y + 26, { align: "center" })

  y += 40
  drawLine(y, "dashed")
  y += 12

  // ============ RESUMEN DE VENTAS ============
  doc.setFillColor(34, 197, 94) // green-500
  doc.rect(margin, y - 3, contentWidth, 14, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text("RESUMEN DE VENTAS", centerX, y + 7, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 18

  drawRow("Efectivo:", `$${data.sales.cash.toFixed(2)}`, y, 9)
  y += 11
  drawRow("Tarjeta:", `$${data.sales.card.toFixed(2)}`, y, 9)
  y += 11
  drawRow("Transferencia:", `$${data.sales.transfer.toFixed(2)}`, y, 9)
  y += 11
  drawRow("Crédito:", `$${data.sales.credit.toFixed(2)}`, y, 9)
  y += 13
  drawLine(y - 3, "dashed")
  drawRow(`TOTAL VENTAS (${data.sales.count})`, `$${data.sales.total.toFixed(2)}`, y + 5, 10, true)
  y += 15

  // ============ DEVOLUCIONES ============
  doc.setFillColor(239, 68, 68) // red-500
  doc.rect(margin, y, contentWidth, 14, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text("DEVOLUCIONES", centerX, y + 10, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 22

  drawRow(`Total Devoluciones (${data.returns.count})`, `-$${data.returns.total.toFixed(2)}`, y, 9)
  y += 15

  // ============ PAGOS DE DEUDA ============
  doc.setFillColor(59, 130, 246) // blue-500
  doc.rect(margin, y, contentWidth, 14, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text("PAGOS DE DEUDA", centerX, y + 10, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 22

  drawRow(`Total Pagos (${data.payments.count})`, `+$${data.payments.total.toFixed(2)}`, y, 9)
  y += 15

  // ============ REPARACIONES ============
  doc.setFillColor(168, 85, 247) // purple-500
  doc.rect(margin, y, contentWidth, 14, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont("courier", "bold")
  doc.text("REPARACIONES", centerX, y + 10, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 22

  drawRow(`Total Reparaciones (${data.repairs.count})`, `$${data.repairs.total.toFixed(2)}`, y, 9)
  y += 18

  // ============ CUADRE DE CAJA ============
  drawLine(y, "solid")
  y += 5
  doc.setFillColor(15, 23, 42) // slate-900
  doc.rect(margin, y, contentWidth, 16, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont("courier", "bold")
  doc.text("CUADRE DE CAJA", centerX, y + 11, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 24

  // Opening balance
  drawRow("Saldo Inicial:", `$${data.openingBalance.toFixed(2)}`, y, 9)
  y += 12

  // Expected amount
  drawRow("Monto Esperado:", `$${data.expectedAmount.toFixed(2)}`, y, 10, true)
  y += 12

  // Counted amount
  drawRow("Monto Contado:", `$${data.countedAmount.toFixed(2)}`, y, 10, true)
  y += 14

  // Discrepancy with background color
  const discrepancyColor =
    data.discrepancy === 0
      ? { bg: [34, 197, 94], text: [255, 255, 255] } // green
      : data.discrepancy > 0
        ? { bg: [239, 68, 68], text: [255, 255, 255] } // red (faltante)
        : { bg: [249, 115, 22], text: [255, 255, 255] } // orange (sobrante)

  doc.setFillColor(discrepancyColor.bg[0], discrepancyColor.bg[1], discrepancyColor.bg[2])
  doc.rect(margin, y - 3, contentWidth, 18, "F")
  doc.setTextColor(discrepancyColor.text[0], discrepancyColor.text[1], discrepancyColor.text[2])
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")

  const discrepancyText =
    data.discrepancy === 0
      ? "CUADRADO"
      : data.discrepancy > 0
        ? `FALTANTE: $${data.discrepancy.toFixed(2)}`
        : `SOBRANTE: $${Math.abs(data.discrepancy).toFixed(2)}`

  doc.text(discrepancyText, centerX, y + 9, { align: "center" })
  doc.setTextColor(0, 0, 0)
  y += 25

  // DETALLE DE TRANSACCIONES
  if (data.transactions && data.transactions.invoices.length > 0) {
    drawLine(y, "dashed")
    y += 8

    doc.setFontSize(9)
    doc.setFont("courier", "bold")
    doc.text("DETALLE DE FACTURAS", centerX, y, { align: "center" })
    y += 10

    doc.setFontSize(8)
    doc.setFont("courier", "normal")

    // Header row
    doc.setFont("courier", "bold")
    doc.text("ID FACTURA", margin + 2, y)
    doc.text("TOTAL", pageWidth - margin - 2, y, { align: "right" })
    y += 8
    doc.setFont("courier", "normal")

    data.transactions.invoices.slice(0, 50).forEach((inv) => {
      doc.text(inv.number, margin + 2, y)
      doc.text(`$${inv.total.toFixed(2)}`, pageWidth - margin - 2, y, { align: "right" })
      y += 8
    })

    if (data.transactions.invoices.length > 50) {
      doc.setFont("courier", "italic")
      doc.text(`... y ${data.transactions.invoices.length - 50} facturas mas`, centerX, y, { align: "center" })
      y += 8
    }
  }

  // ============ NOTAS ============
  if (data.notes) {
    y += 5
    drawLine(y, "dashed")
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

  // ============ FOOTER ============
  y += 10
  drawLine(y, "solid")
  y += 12

  doc.setFontSize(8)
  doc.setFont("courier", "normal")
  doc.text("Documento generado automaticamente", centerX, y, { align: "center" })
  y += 9
  doc.text(`${branding.businessName} - Sistema de Facturacion`, centerX, y, { align: "center" })
  y += 9

  const now = new Date()
  doc.setFontSize(7)
  doc.text(`Impreso: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, centerX, y, { align: "center" })

  // ADD MARGIN AT THE BOTTOM
  y += 14 // Espacio extra al final (reducido un 30%)

  return doc.output("blob")
}

export function generateClosingNumber(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  const random = Math.floor(Math.random() * 9000) + 1000
  return `CC-${year}${month}${day}-${random}`
}


