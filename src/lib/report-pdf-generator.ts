/**
 * Generador de reportes en PDF con mejor diseño y espaciado
 */

interface ReportRow {
  invoice: string
  date: Date
  product: string
  quantity: number
  price: number
  total: number
  status: string
}

interface ReportConfig {
  customerName?: string
  periodLabel: string
  reportTitle?: string
}

const STATUS_LABELS: Record<string, string> = {
  credito: "Crédito",
  pagado: "Pagado",
  parcial: "Parcial",
}

/**
 * Genera un PDF de reporte de ventas con mejor diseño
 * Usa diseño landscape para más espacio horizontal
 */
export async function generateSalesReportPDF(
  rows: ReportRow[],
  config: ReportConfig,
  formatCurrency: (value: number) => string
): Promise<Blob> {
  const { jsPDF: jsPDFClass } = await import("jspdf")

  // Usar orientación portrait (vertical) para impresión en hoja normal
  const doc = new jsPDFClass({ 
    orientation: "p", // 'p' para portrait (vertical), 'l' para landscape
    unit: "mm", 
    format: "a4" 
  })

  // Configurar dimensiones de página
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 5
  const usableWidth = pageWidth - 2 * margin

  // Título
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  const title = config.reportTitle || `Reporte de Ventas${config.customerName ? ` - ${config.customerName}` : ""}`
  doc.text(title, margin, 8)

  // Información del reporte
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Periodo: ${config.periodLabel}`, margin, 12)
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, margin, 14.5)

  // Distribución REAL del ancho en A4 vertical
  const columns = {
    invoice: { x: margin, width: 22, label: "Factura" },

    date: {
      x: margin + 22,
      width: 22,
      label: "Fecha",
    },

    product: {
      x: margin + 44,
      width: 84,
      label: "Producto",
    },

    quantity: {
      x: margin + 128,
      width: 14,
      label: "Cant.",
    },

    total: {
      x: margin + 142,
      width: 28,
      label: "Total",
    },

    status: {
      x: margin + 170,
      width: 19,
      label: "Estado",
    },
  }

  let y = 17.5
  const lineHeight = 3.5
  const maxYPerPage = pageHeight - margin - 5

  const renderHeader = () => {
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    doc.setFillColor(200, 200, 200)

    // Dibujar encabezados
    doc.text(columns.invoice.label, columns.invoice.x, y, { align: "left" })
    doc.text(columns.date.label, columns.date.x, y, { align: "left" })
    doc.text(columns.product.label, columns.product.x, y, { align: "left" })
    doc.text(columns.quantity.label, columns.quantity.x + columns.quantity.width, y, { align: "right" })
    doc.text(columns.total.label, columns.total.x + columns.total.width, y, { align: "right" })
    doc.text(columns.status.label, columns.status.x + columns.status.width, y, { align: "right" })

    // Línea separadora
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)
    doc.line(margin, y + 1.2, pageWidth - margin, y + 1.2)

    y += 4
  }

  renderHeader()

  // Renderizar filas
  rows.forEach((row) => {
    const statusLabel = STATUS_LABELS[row.status] || row.status
    const dateText = row.date.toLocaleDateString("es-ES")
    
    // Extraer solo la ID de la factura (parte numérica después del último guión)
    const invoiceId = row.invoice.includes('-') ? row.invoice.split('-').pop() || row.invoice : row.invoice
    const invoiceDisplay = invoiceId.substring(0, 12) // Limitar a 12 caracteres
    
    // Dividir producto en líneas si es muy largo
    const maxProductWidth = columns.product.width - 2 // Dejar margen
    const productLines = doc.splitTextToSize(row.product, maxProductWidth)

    productLines.forEach((productLine, lineIndex) => {
      // Verificar si necesitamos nueva página
      if (y > maxYPerPage) {
        doc.addPage()
        y = margin
        renderHeader()
      }

      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")

      // Mostrar datos solo en primera línea del producto
      if (lineIndex === 0) {
        // Usar splitTextToSize para respetar anchos de columna
        doc.text(invoiceDisplay, columns.invoice.x, y, {
          align: "left",
          maxWidth: columns.invoice.width - 1,
        })
        doc.text(dateText, columns.date.x, y, {
          align: "left",
          maxWidth: columns.date.width - 1,
        })
        doc.text(`${row.quantity}`, columns.quantity.x + columns.quantity.width, y, { align: "right" })
        doc.text(`$${formatCurrency(row.total)}`, columns.total.x + columns.total.width, y, { align: "right" })
        doc.text(statusLabel, columns.status.x + columns.status.width, y, { align: "right" })
      }

      // Producto en cada línea
      doc.text(productLine, columns.product.x, y, { align: "left" })

      y += lineHeight
    })
  })

  // Footer con totales
  if (rows.length > 0) {
    y += 1.5
    doc.setLineWidth(0.4)
    doc.line(margin, y, pageWidth - margin, y)

    y += 2.5
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)

    const totalVentas = rows.reduce((sum, row) => sum + row.total, 0)
    const totalCantidad = rows.reduce((sum, row) => sum + row.quantity, 0)

    doc.text(`Totales:`, columns.product.x, y)
    doc.text(`${totalCantidad}`, columns.quantity.x + columns.quantity.width, y, { align: "right" })
    doc.text(`$${formatCurrency(totalVentas)}`, columns.total.x + columns.total.width, y, { align: "right" })
  }

  return doc.output("blob")
}
