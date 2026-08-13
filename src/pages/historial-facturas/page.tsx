"use client"

import { useState, useEffect, useMemo } from "react"
import { useStore } from "@/components/store-context"
import { formatCurrency } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Download,
  Printer,
  Calendar,
  FileText,
  DollarSign,
  TrendingUp,
  CloudDownload,
  Cloud,
  Loader2,
  FolderOpen,
  Eye,
  Trash2,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { downloadInvoiceFromStorage, getSaleInvoicePersistOptions } from "@/lib/invoice-storage"
import { SaleDetailsDialog } from "@/components/sale-details-dialog"
import { useToast } from "@/hooks/use-toast"
import { printPaymentInvoice, printSaleInvoice } from "@/components/invoice-printer"
import { getBrandingContactHtml, getTenantBranding } from "@/lib/tenant-branding"
import { normalizePaymentMethod, type PaymentMethod } from "@/lib/transaction-classification"

const readEmployeeIdFromRecord = (record?: Record<string, unknown> | null) => {
  const candidateValues = [
    record?.createdByEmployeeId,
    record?.created_by_employee_id,
    record?.createdBy,
    record?.created_by,
    record?.employeeId,
    record?.employee_id,
    record?.userId,
    record?.user_id,
  ]

  for (const value of candidateValues) {
    if (typeof value === "string" && value.trim()) return value
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }

  return undefined
}

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  credit: "Crédito",
}

const getPaymentMethodLabel = (value: unknown) => paymentMethodLabels[normalizePaymentMethod(value)]

export default function HistorialFacturasPage() {
  const { sales, payments, deleteSale, deletePayment, customers, currentUser, employees } = useStore()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedMonth, setSelectedMonth] = useState<string>("all")
  const [selectedYear, setSelectedYear] = useState<string>("all")
  const [selectedDay, setSelectedDay] = useState<string>("all")
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState("database")
  const [selectedTransaction, setSelectedTransaction] = useState<unknown>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  // (Removed storage/archive invoice state — not used)

  // En historial solo se muestran facturas activas (sin devolución/anulación)
  const visibleSales = sales.filter(
    (sale) => sale.status !== "devuelta_parcial" && sale.status !== "devuelta_completa" && sale.status !== "anulada",
  )

  // (removed loadStorageInvoices)

  // Obtener años únicos para el filtro
  const years = [...new Set(visibleSales.map((s) => new Date(s.date).getFullYear()))].sort((a, b) => b - a)

  const months = [
    { value: "1", label: "Enero" },
    { value: "2", label: "Febrero" },
    { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Mayo" },
    { value: "6", label: "Junio" },
    { value: "7", label: "Julio" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ]

  const days = Array.from({ length: 31 }, (_, i) => (i + 1).toString())

  const employeeOptions = useMemo(() => {
    const options = employees
      .filter((employee) => employee.role === "employee" || employee.role === "admin")
      .map((employee) => ({ id: employee.id, name: employee.name }))

    if (currentUser && !options.some((employee) => employee.id === currentUser.id)) {
      options.push({ id: currentUser.id, name: currentUser.name })
    }

    return options
  }, [employees, currentUser])

  const getSaleDisplayedAmount = (sale: (typeof sales)[number]) => {
    const total = Math.max(0, Number(sale.total) || 0)
    const paid = Math.min(total, Math.max(0, Number(sale.amountPaid) || 0))
    const isCreditSale = sale.status === "credito" || sale.paymentMethod === "credit"

    // En una venta parcial solo se muestra la parte cobrada. Para ventas
    // antiguas de contado sin amountPaid, conservamos el total de la factura.
    return isCreditSale || paid > 0 ? paid : total
  }

  const getEmployeeName = (employeeId?: string, employeeName?: string) => {
    if (employeeName) return employeeName
    const employee = employees.find((item) => item.id === employeeId)
    if (employee) return employee.name
    if (employeeId === currentUser?.id) return currentUser.name
    return "No identificado"
  }

  // Combinar ventas y pagos en transacciones
  const transactions = [
    ...visibleSales.map((sale) => ({
      id: sale.id,
      number: sale.invoiceNumber,
      date: sale.date,
      type: "sale" as const,
      status: sale.status,
      customer: sale.customerName || "Cliente General",
      amount: getSaleDisplayedAmount(sale),
      paymentMethod: sale.paymentMethod,
      description: sale.items.map((item) => item.name || item.description || "Producto").join(", ") || "Sin productos",
      createdByEmployeeId: readEmployeeIdFromRecord(sale as unknown as Record<string, unknown>),
      items: sale.items,
    })),
    ...payments.map((payment) => {
      const customer = customers.find((c) => c.id === payment.customerId)
      return {
        id: payment.id,
        number: payment.invoiceNumber || "N/A",
        date: payment.date,
        type: "payment" as const,
        status: undefined,
        customer: customer ? customer.name : "Cliente Desconocido",
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        description: "Abono/Pago",
        createdByEmployeeId: payment.createdByEmployeeId,
        createdByEmployeeName: payment.createdByEmployeeName,
        items: [],
      }
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Filtrar transacciones
  const filteredTransactions = transactions.filter((t) => {
    const transactionEmployeeId = t.createdByEmployeeId

    const matchesSearch =
      (t.number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.customer || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(searchTerm.toLowerCase())

    const transactionDate = new Date(t.date)
    const matchesMonth = selectedMonth === "all" || transactionDate.getMonth() + 1 === Number.parseInt(selectedMonth)
    const matchesYear = selectedYear === "all" || transactionDate.getFullYear() === Number.parseInt(selectedYear)
    const matchesDay = selectedDay === "all" || transactionDate.getDate() === Number.parseInt(selectedDay)
    const matchesEmployee = selectedEmployee === "all" || transactionEmployeeId === selectedEmployee

    return matchesSearch && matchesMonth && matchesYear && matchesDay && matchesEmployee
  })

  // (removed storage filtering — archive invoices feature removed)

  // Estadísticas
  const totalSales = filteredTransactions
    .filter((t) => t.type === "sale" && t.status !== "pending")
    .reduce((sum, t) => sum + t.amount, 0)
  const pendingSales = filteredTransactions
    .filter((t) => t.type === "sale" && t.status === "pending")
    .reduce((sum, t) => sum + t.amount, 0)
  const totalPayments = filteredTransactions.filter((t) => t.type === "payment").reduce((sum, t) => sum + t.amount, 0)
  const totalInvoices = filteredTransactions.filter((t) => t.type === "sale").length
  const pendingInvoicesCount = filteredTransactions.filter((t) => t.type === "sale" && t.status === "pending").length

  // Funciones de selección
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)))
    }
  }

  // (removed storage selection helpers)

  // Descargar seleccionadas (Database)
  const handleDownloadSelected = () => {
    const selectedTransactions = filteredTransactions.filter(
      (t) => selectedIds.has(t.id) && t.type === "sale" && t.status === "credito",
    )

    const data = selectedTransactions.map((t) => ({
      Numero: t.number,
      Fecha: new Date(t.date).toLocaleString("es-ES"),
      Tipo: "Venta a crédito",
      Estado: "Crédito",
      Cliente: t.customer,
      Monto: t.amount,
      MetodoPago: t.paymentMethod,
    }))

    if (data.length === 0) {
      toast({
        title: "No hay ventas a crédito seleccionadas",
        description: "Selecciona solo facturas a crédito para descargar el reporte.",
        variant: "warning",
      })
      return
    }

    const headers = Object.keys(data[0]).join(",")
    const rows = data.map((row) => Object.values(row).join(",")).join("\n")
    const csv = `${headers}\n${rows}`

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `facturas-seleccionadas-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Descargar todo el mes (Database)
  const handleDownloadMonth = () => {
    const creditTransactions = filteredTransactions.filter((t) => t.type === "sale" && t.status === "credito")

    const data = creditTransactions.map((t) => ({
      Numero: t.number,
      Fecha: new Date(t.date).toLocaleString("es-ES"),
      Tipo: "Venta a crédito",
      Estado: "Crédito",
      Cliente: t.customer,
      Monto: t.amount,
      MetodoPago: t.paymentMethod,
    }))

    if (data.length === 0) {
      toast({
        title: "No hay ventas a crédito en este período",
        description: "Ajusta el rango de fecha o busca otro cliente para descargar el reporte.",
        variant: "warning",
      })
      return
    }

    const headers = Object.keys(data[0]).join(",")
    const rows = data.map((row) => Object.values(row).join(",")).join("\n")
    const csv = `${headers}\n${rows}`

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    const monthLabel = selectedMonth !== "all" ? months.find((m) => m.value === selectedMonth)?.label : "Todos"
    const yearLabel = selectedYear !== "all" ? selectedYear : "TodosLosAnos"
    const dayLabel = selectedDay !== "all" ? `Dia-${selectedDay}` : ""
    link.download = `facturas-${dayLabel}-${monthLabel}-${yearLabel}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // (removed storage download helper)

  // Imprimir factura
  const handlePrint = async (transaction: (typeof transactions)[0]) => {
    if (transaction.type === "sale") {
      const sale = sales.find((item) => item.id === transaction.id)
      if (sale) {
        void printSaleInvoice(
          sale,
          customers,
          undefined,
          undefined,
          getSaleInvoicePersistOptions(currentUser?.adminId, sale.id, "tienda"),
        )
        return
      }
    }

    if (transaction.type === "payment") {
      const payment = payments.find((item) => item.id === transaction.id)
      const customer = payment ? customers.find((item) => item.id === payment.customerId) : null

      if (payment && customer) {
        void printPaymentInvoice(
          payment,
          customer,
          undefined,
          currentUser?.adminId
            ? { ownerAdminId: currentUser.adminId, source: "pago", paymentId: payment.id }
            : undefined,
        )
        return
      }
    }

    const branding = await getTenantBranding(currentUser?.adminId)
    const printContent = `
      <html>
        <head>
          <title>Factura ${transaction.number}</title>
          <style>
            body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; }
            .business-name { font-size: 24px; font-weight: bold; color: #ff6600; text-transform: uppercase; margin-bottom: 5px; text-align: center; width: 100%; }
            .subtitle { font-size: 14px; font-weight: bold; color: #ff6600; margin-bottom: 10px; text-align: center; width: 100%; }
            .contact-info { font-size: 12px; margin-bottom: 5px; }
            .info { margin-bottom: 15px; }
            .items { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
            .items th, .items td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .total { text-align: right; font-size: 18px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="business-name">${branding.businessName}</div>
            <div class="subtitle">${branding.invoiceSubtitle}</div>
            ${getBrandingContactHtml(branding)}
            <h2>Factura: ${transaction.number}</h2>
          </div>
          <div class="info">
            <p><strong>Fecha:</strong> ${new Date(transaction.date).toLocaleString("es-ES")}</p>
            <p><strong>Cliente:</strong> ${transaction.customer}</p>
            <p><strong>Tipo:</strong> ${transaction.type === "sale" ? "Venta" : "Pago"}</p>
          </div>
          ${transaction.items && transaction.items.length > 0
        ? `
            <table class="items">
              <tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr>
              ${transaction.items.map((item) => `<tr><td>${item.name}</td><td>${item.quantity}</td><td>RD$${(item.customPrice ?? item.sellPrice ?? 0)?.toLocaleString()}</td><td>RD$${((item.customPrice ?? item.sellPrice ?? 0) * item.quantity).toLocaleString()}</td></tr>`).join("")}
            </table>
          `
        : ""
      }
          <div class="total">Total: RD$${transaction.amount.toLocaleString()}</div>
        </body>
      </html>
    `

    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(printContent)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const handleDeleteTransaction = async (transaction: (typeof transactions)[0]) => {
    const confirmationMessage =
      transaction.type === "payment"
        ? `¿Eliminar el pago ${transaction.number} y restaurar la deuda del cliente?\n\nNota: solo se puede eliminar el ultimo abono del cliente.`
        : `¿Eliminar la factura ${transaction.number}?`

    const confirmed = window.confirm(confirmationMessage)
    if (!confirmed) return

    try {
      if (transaction.type === "payment") {
        await deletePayment(transaction.id)
        toast({
          title: "Pago eliminado",
          description: `Se elimino el abono ${transaction.number} y se restauro la deuda del cliente.`,
        })
        return
      }

      await deleteSale(transaction.id)
    } catch (error) {
      if (transaction.type !== "payment") return

      const errorMessage =
        error instanceof Error ? error.message : "No se pudo eliminar el pago seleccionado."

      toast({
        title: "Error al eliminar pago",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  const downloadFromStorage = async (transaction: (typeof transactions)[0]) => {
    const sale = visibleSales.find((s) => s.id === transaction.id)
    if (!sale || !currentUser?.adminId) {
      toast({
        title: "No se pudo descargar",
        description: "Inicia sesión o selecciona una venta válida.",
        variant: "destructive",
      })
      return
    }

    const result = await downloadInvoiceFromStorage(
      sale.date,
      sale.id,
      sale.invoiceNumber,
      currentUser.adminId,
      sale,
      "tienda",
      currentUser.name,
    )

    if (!result.success) {
      toast({
        title: "Error al descargar",
        description: result.error || "No se pudo generar el PDF.",
        variant: "destructive",
      })
    }
  }

  // (removed individual storage download)

  return (
    <div className="space-y-6">
      {/* Estadísticas */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Total Facturas</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{totalInvoices}</div>
            <p className="text-xs md:text-xs text-muted-foreground">en el período seleccionado</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Pre-facturas en Cola</CardTitle>
            <Loader2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{pendingInvoicesCount}</div>
            <p className="text-xs md:text-xs text-muted-foreground">facturas pendientes</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">RD$</span>
              <span className="text-lg md:text-xl font-bold leading-none">{formatCurrency(totalSales)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">ventas finalizadas (sin pendientes)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">RD$</span>
              <span className="text-lg md:text-xl font-bold leading-none">{formatCurrency(totalPayments)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">pagos recibidos</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs para Base de Datos y Storage */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="database" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Base de Datos
          </TabsTrigger>
          {/* storage tab removed */}
        </TabsList>

        {/* Filtros */}
        <Card className="mt-4">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por número o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[140px]">
                    <Calendar className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {months.map((month) => (
                      <SelectItem key={month.value} value={month.value}>
                        {month.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {years.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedDay} onValueChange={setSelectedDay}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="Día" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {days.map((day) => (
                      <SelectItem key={day} value={day}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Empleado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los empleados</SelectItem>
                    {employeeOptions.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tab Base de Datos */}
        <TabsContent value="database" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Transacciones</CardTitle>
                <CardDescription>
                  {filteredTransactions.length} transacciones encontradas
                  {selectedIds.size > 0 && ` • ${selectedIds.size} seleccionadas`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {selectedIds.size > 0 && (
                    <Button variant="outline" size="sm" onClick={handleDownloadSelected}>
                      <Download className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Descargar Seleccionadas ({selectedIds.size})</span>
                    </Button>
                )}
                  <Button variant="outline" size="sm" onClick={handleDownloadMonth}>
                    <Download className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Descargar Todo</span>
                  </Button>
              </div>
            </CardHeader>
            <CardContent>
                <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Checkbox
                            checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Productos facturados</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Método</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Realizado por</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                            No se encontraron transacciones
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((transaction) => (
                          <TableRow key={transaction.id} className={selectedIds.has(transaction.id) ? "bg-muted/50" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(transaction.id)}
                                onCheckedChange={() => toggleSelect(transaction.id)}
                              />
                            </TableCell>
                            <TableCell className="max-w-[280px] whitespace-normal text-xs font-medium">
                              {transaction.items.length > 0 ? (
                                <div className="space-y-0.5">
                                  {transaction.items.map((item, index) => (
                                    <div key={`${transaction.id}-item-${index}`} className="leading-4">• {item.name || item.description || "Producto"}</div>
                                  ))}
                                </div>
                              ) : transaction.description}
                            </TableCell>
                            <TableCell>{new Date(transaction.date).toLocaleString("es-ES")}</TableCell>
                            <TableCell>
                              <Badge variant={transaction.type === "sale" && transaction.status === "pending" ? "secondary" : transaction.type === "sale" ? "default" : "secondary"}>
                                {transaction.type === "sale" ? (transaction.status === "pending" ? "Pre-factura" : "Venta") : "Pago"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {transaction.type === "sale" ? (
                                <Badge
                                  variant={
                                    transaction.status === "pending"
                                      ? "secondary"
                                      : transaction.status === "anulada"
                                        ? "destructive"
                                        : transaction.status === "credito"
                                          ? "outline"
                                          : "default"
                                  }
                                >
                                  {transaction.status === "pending"
                                    ? "Pendiente"
                                    : transaction.status === "credito"
                                      ? "Crédito"
                                      : transaction.status === "anulada"
                                        ? "Anulada"
                                        : "Completada"}
                                </Badge>
                              ) : (
                                <Badge variant="default">Completada</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {getPaymentMethodLabel(transaction.paymentMethod)}
                            </TableCell>
                            <TableCell>{transaction.customer}</TableCell>
                            <TableCell>{getEmployeeName(transaction.createdByEmployeeId, transaction.createdByEmployeeName)}</TableCell>
                            <TableCell className="text-right font-medium">
                              RD${formatCurrency(transaction.amount)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-center gap-1">
                                {transaction.type === "sale" && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => {
                                            setSelectedTransaction(transaction)
                                            setShowDetailsDialog(true)
                                          }}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Ver Detalles</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handlePrint(transaction)}
                                      >
                                        <Printer className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Imprimir</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                {transaction.type === "sale" && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => downloadFromStorage(transaction)}
                                        >
                                          <CloudDownload className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Descargar PDF</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleDeleteTransaction(transaction)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {transaction.type === "payment" ? "Eliminar pago" : "Eliminar factura"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile stacked list */}
                <div className="block sm:hidden">
                  {filteredTransactions.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">No se encontraron transacciones</div>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <div key={transaction.id} className="border rounded-lg p-3 mb-3 bg-white/5">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <div className="max-w-[240px] text-sm font-semibold">
                                {transaction.items.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {transaction.items.map((item, index) => (
                                      <div key={`${transaction.id}-mobile-item-${index}`} className="leading-4">• {item.name || item.description || "Producto"}</div>
                                    ))}
                                  </div>
                                ) : transaction.description}
                              </div>
                              <Badge variant={transaction.type === "sale" && transaction.status === "pending" ? "secondary" : transaction.type === "sale" ? "default" : "secondary"}>
                                {transaction.type === "sale" ? (transaction.status === "pending" ? "Pre-factura" : "Venta") : "Pago"}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">{new Date(transaction.date).toLocaleString("es-ES")}</div>
                            <div className="text-sm mt-2">{transaction.customer}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Estado: {transaction.type === "payment"
                                ? "Completada"
                                : transaction.status === "pending"
                                  ? "Pendiente"
                                  : transaction.status === "credito"
                                    ? "Crédito"
                                    : transaction.status === "anulada"
                                      ? "Anulada"
                                      : "Completada"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Método: {getPaymentMethodLabel(transaction.paymentMethod)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold">RD${formatCurrency(transaction.amount)}</div>
                            <div className="mt-2 flex flex-col items-end gap-1">
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handlePrint(transaction)}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                                {transaction.type === "sale" && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadFromStorage(transaction)}>
                                    <CloudDownload className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDeleteTransaction(transaction)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                              {transaction.type === "sale" && (
                                <Button size="sm" className="w-full mt-1" onClick={() => { setSelectedTransaction(transaction); setShowDetailsDialog(true); }}>
                                  Ver Detalles
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* storage tab removed */}
      </Tabs>

      <SaleDetailsDialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog} sale={selectedTransaction} />
    </div>
  )
}
