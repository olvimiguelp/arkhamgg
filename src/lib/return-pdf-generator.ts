import { formatCurrency } from "@/lib/utils"
import { drawBrandingHeaderOnThermalPdf, getTenantBranding } from "@/lib/tenant-branding"

export interface ReturnData {
  returnNumber: string
  invoiceNumber: string
  customerName?: string
  customerPhone?: string
  date: string
  items: Array<{
    productName: string
    imei?: string
    quantity: number
    unitPrice: number
    subtotal: number
  }>
  total: number
  type: "reembolso" | "credito" | "cambio"
  reason: string
  status: "completa" | "parcial"
}

export async function generateReturnPDF(
  returnData: ReturnData,
  ownerAdminId?: string | null,
): Promise<Blob> {
  const branding = await getTenantBranding(ownerAdminId)

  const { default: jsPDF } = await import("jspdf")

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 200],
  })

  const pageWidth = 80
  const margin = 1
  const contentWidth = pageWidth - margin * 2
  const centerX = pageWidth / 2

  let y = await drawBrandingHeaderOnThermalPdf(doc, branding, {
    centerX,
    sideMargin: margin,
    pageWidth,
    startY: 4,
  })

  doc.setFontSize(12)
  doc.setFont("courier", "bold")
  doc.setTextColor(0, 0, 0)
  doc.text("NOTA DE CRÉDITO / DEVOLUCIÓN", centerX, y, { align: "center" })
  y += 8

  doc.setLineWidth(0.2)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // Información de la devolución
  doc.setFontSize(12)
  doc.setFont("courier", "bold")
  doc.text(`Devolución: ${returnData.returnNumber}`, margin, y)
  y += 4

  doc.setFont("courier", "normal")
  doc.setFontSize(11)
  const fecha = new Date(returnData.date).toLocaleDateString("es-DO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
  doc.text(`Fecha: ${fecha}`, margin, y)
  y += 4

  doc.text(`Factura Original: ${returnData.invoiceNumber}`, margin, y)
  y += 4

  if (returnData.customerName) {
    doc.text(`Cliente: ${returnData.customerName}`, margin, y)
    y += 4
  }

  if (returnData.customerPhone) {
    doc.text(`Tel: ${returnData.customerPhone}`, margin, y)
    y += 4
  }

  // Tipo de devolución
  const tipoDevolucion =
    returnData.type === "reembolso"
      ? "REEMBOLSO"
      : returnData.type === "credito"
        ? "CRÉDITO A FAVOR"
        : "CAMBIO DE PRODUCTO"
  doc.setFont("courier", "bold")
  doc.text(`Tipo: ${tipoDevolucion}`, margin, y)
  y += 4

  doc.setFont("courier", "normal")
  doc.text(`Estado: ${returnData.status === "completa" ? "Completa" : "Parcial"}`, margin, y)
  y += 4

  if (returnData.reason) {
    const reasonLines = doc.splitTextToSize(`Motivo: ${returnData.reason}`, contentWidth)
    doc.text(reasonLines, margin, y)
    y += reasonLines.length * 4
  }

  y += 2

  // Línea separadora
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // Encabezado de items
  doc.setFont("courier", "bold")
  doc.setFontSize(11)
  doc.text("Cant", margin, y)
  doc.text("Producto", margin + 10, y)
  doc.text("Precio", pageWidth - margin - 22, y)
  doc.text("Total", pageWidth - margin - 8, y, { align: "right" })
  y += 3

  doc.line(margin, y, pageWidth - margin, y)
  y += 3

  // Items
  doc.setFont("courier", "normal")
  doc.setFontSize(12)
  returnData.items.forEach((item) => {
    const itemName = item.productName.length > 18 ? item.productName.substring(0, 18) + "..." : item.productName

    doc.text(String(item.quantity), margin, y)
    doc.text(itemName, margin + 10, y)
    doc.text(`$${formatCurrency(item.unitPrice)}`, pageWidth - margin - 22, y)
    doc.text(`$${formatCurrency(item.subtotal)}`, pageWidth - margin, y, { align: "right" })
    y += 4

    if (item.imei) {
      doc.setFontSize(9)
      doc.text(`IMEI: ${item.imei}`, margin + 10, y)
      doc.setFontSize(12)
      y += 3
    }

    if (item.productName.length > 18) {
      doc.setFontSize(9)
      doc.text(item.productName.substring(18, 36), margin + 10, y)
      doc.setFontSize(12)
      y += 3
    }
  })

  y += 2

  // Línea separadora
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // Total
  doc.setFontSize(14)
  doc.setFont("courier", "bold")
  doc.text("TOTAL:", margin, y)
  doc.text(`$${formatCurrency(returnData.total)}`, pageWidth - margin, y, { align: "right" })
  y += 6

  y += 4

  // Línea separadora
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // Pie de página
  doc.setFontSize(11)
  doc.setFont("courier", "normal")
  doc.text("Conserve esta nota de crédito", pageWidth / 2, y, { align: "center" })
  y += 4
  doc.text("como comprobante de devolución", pageWidth / 2, y, { align: "center" })

  return doc.output("blob")
}

export async function downloadReturnPDF(
  returnData: ReturnData,
  ownerAdminId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const pdfBlob = await generateReturnPDF(returnData, ownerAdminId)

    // Crear enlace de descarga
    const url = URL.createObjectURL(pdfBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Devolución-${returnData.returnNumber}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    return { success: true }
  } catch (err) {
    console.error("Error al generar PDF de devolución:", err)
    return { success: false, error: "Error al generar el PDF de devolución" }
  }
}

export async function printReturnPDF(
  returnData: ReturnData,
  ownerAdminId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const pdfBlob = await generateReturnPDF(returnData, ownerAdminId)

    // Crear URL temporal para el blob
    const url = URL.createObjectURL(pdfBlob)

    // Abrir en nueva ventana
    const printWindow = window.open(url, "_blank")
    if (printWindow) {
      // Esperar a que se cargue y luego imprimir
      printWindow.addEventListener("load", () => {
        printWindow.print()
      })
    } else {
      return { success: false, error: "No se pudo abrir la ventana de impresión" }
    }

    return { success: true }
  } catch (err) {
    console.error("Error al imprimir devolución:", err)
    return { success: false, error: "Error al imprimir la devolución" }
  }
}


