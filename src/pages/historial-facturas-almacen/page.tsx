"use client"

import { useMemo, useState } from "react"
import { useStore } from "@/components/store-context"
import { formatCurrency } from "@/lib/utils"
import { isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SaleDetailsDialog } from "@/components/sale-details-dialog"
import { useToast } from "@/hooks/use-toast"
import { printSaleInvoice } from "@/components/invoice-printer"
import { downloadInvoiceFromStorage, getSaleInvoicePersistOptions } from "@/lib/invoice-storage"
import { isAlmacenSourceRecord, normalizeInventorySourceTable } from "@/lib/transaction-classification"
import {
  Calendar,
  CloudDownload,
  Download,
  Eye,
  FileText,
  Printer,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react"

type AlmacenTransaction = {
  id: string
  number: string
  date: string
  status: string
  customer: string
  amount: number
  paymentMethod: string
  items: any[]
}

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

const days = Array.from({ length: 31 }, (_, index) => String(index + 1))

const getPaymentMethodLabel = (value?: string) => {
  const method = String(value || "").toLowerCase()
  if (method === "cash") return "Efectivo"
  if (method === "card") return "Tarjeta"
  if (method === "transfer") return "Transferencia"
  if (method === "credit") return "Credito"
  return "Efectivo"
}

export default function HistorialFacturasAlmacenPage() {
  const { sales, products, customers, deleteSale, currentUser } = useStore()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedMonth, setSelectedMonth] = useState<string>("all")
  const [selectedYear, setSelectedYear] = useState<string>("all")
  const [selectedDay, setSelectedDay] = useState<string>("all")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedTransaction, setSelectedTransaction] = useState<AlmacenTransaction | null>(null)
  const [showDetailsDialog, setShowDetailsDialog] = useState(false)

  const almacenProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => {
            const explicitSource = normalizeInventorySourceTable((product as { sourceTable?: unknown }).sourceTable)
            if (explicitSource) return explicitSource === "armacen"
            return Boolean(normalizeAlmacenBoxNumber(product.boxNumber) || isAlmacenCategory(product.category))
          })
          .map((product) => String(product.id)),
      ),
    [products],
  )

  const isAlmacenItem = (item: any) => isAlmacenSourceRecord(item as Record<string, unknown>, almacenProductIds)

  const visibleSales = useMemo(
    () =>
      sales.filter((sale) => {
        if (sale.status === "devuelta_parcial" || sale.status === "devuelta_completa" || sale.status === "anulada") {
          return false
        }
        return Array.isArray(sale.items) && sale.items.some((item) => isAlmacenItem(item))
      }),
    [sales, almacenProductIds],
  )

  const transactions = useMemo<AlmacenTransaction[]>(
    () =>
      visibleSales
        .map((sale) => ({
          id: sale.id,
          number: sale.invoiceNumber,
          date: sale.date,
          status: sale.status,
          customer: sale.customerName || "Cliente General",
          amount: sale.total,
          paymentMethod: sale.paymentMethod,
          items: sale.items || [],
        }))
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    [visibleSales],
  )

  const years = useMemo(
    () => [...new Set(visibleSales.map((sale) => new Date(sale.date).getFullYear()))].sort((a, b) => b - a),
    [visibleSales],
  )

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesSearch =
          transaction.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          transaction.customer.toLowerCase().includes(searchTerm.toLowerCase())

        const transactionDate = new Date(transaction.date)
        const matchesMonth =
          selectedMonth === "all" || transactionDate.getMonth() + 1 === Number.parseInt(selectedMonth, 10)
        const matchesYear = selectedYear === "all" || transactionDate.getFullYear() === Number.parseInt(selectedYear, 10)
        const matchesDay = selectedDay === "all" || transactionDate.getDate() === Number.parseInt(selectedDay, 10)

        return matchesSearch && matchesMonth && matchesYear && matchesDay
      }),
    [transactions, searchTerm, selectedMonth, selectedYear, selectedDay],
  )

  const totalInvoices = filteredTransactions.length
  const pendingInvoices = filteredTransactions.filter((transaction) => transaction.status === "pending")
  const pendingInvoicesCount = pendingInvoices.length
  const pendingTotal = pendingInvoices.reduce((sum, transaction) => sum + transaction.amount, 0)
  const completedInvoices = filteredTransactions.filter((transaction) => transaction.status !== "pending")
  const completedTotal = completedInvoices.reduce((sum, transaction) => sum + transaction.amount, 0)
  const averageTicket = completedInvoices.length > 0 ? completedTotal / completedInvoices.length : 0

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTransactions.length) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(filteredTransactions.map((transaction) => transaction.id)))
  }

  const downloadCsv = (rows: AlmacenTransaction[], filename: string) => {
    if (rows.length === 0) return

    const data = rows.map((transaction) => ({
      Numero: transaction.number,
      Fecha: new Date(transaction.date).toLocaleString("es-ES"),
      Estado: transaction.status === "pending" ? "Pendiente" : transaction.status || "Completada",
      Cliente: transaction.customer,
      Monto: transaction.amount,
      MetodoPago: getPaymentMethodLabel(transaction.paymentMethod),
    }))

    const headers = Object.keys(data[0]).join(",")
    const csvRows = data.map((row) => Object.values(row).join(",")).join("\n")
    const csv = `${headers}\n${csvRows}`

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadSelected = () => {
    const selected = filteredTransactions.filter((transaction) => selectedIds.has(transaction.id))
    downloadCsv(selected, `facturas-almacen-seleccionadas-${new Date().toISOString().split("T")[0]}.csv`)
  }

  const handleDownloadAll = () => {
    const monthLabel = selectedMonth !== "all" ? months.find((month) => month.value === selectedMonth)?.label : "Todos"
    const yearLabel = selectedYear !== "all" ? selectedYear : "TodosLosAnos"
    const dayLabel = selectedDay !== "all" ? `Dia-${selectedDay}` : "TodosLosDias"
    downloadCsv(filteredTransactions, `facturas-almacen-${dayLabel}-${monthLabel}-${yearLabel}.csv`)
  }

  const handlePrint = (transaction: AlmacenTransaction) => {
    const sale = visibleSales.find((item) => item.id === transaction.id)
    if (!sale) return
    void printSaleInvoice(
      sale,
      customers,
      undefined,
      undefined,
      getSaleInvoicePersistOptions(currentUser?.adminId, sale.id, "almacen"),
    )
  }

  const handleDownloadPdf = async (transaction: AlmacenTransaction) => {
    const sale = visibleSales.find((item) => item.id === transaction.id)
    if (!sale) return
    if (!currentUser?.adminId) return
    const result = await downloadInvoiceFromStorage(
      sale.date,
      sale.id,
      sale.invoiceNumber,
      currentUser.adminId,
      sale,
      "almacen",
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

  const handleDelete = async (transaction: AlmacenTransaction) => {
    const confirmed = window.confirm(`¿Eliminar la factura ${transaction.number}?`)
    if (!confirmed) return

    try {
      await deleteSale(transaction.id)
      toast({
        title: "Factura eliminada",
        description: `Se elimino la factura ${transaction.number}.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la factura seleccionada."
      toast({
        title: "Error al eliminar",
        description: message,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 md:p-0 md:space-y-6">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Facturas Almacen</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">{totalInvoices}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">en el periodo seleccionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Total Ventas</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">RD${formatCurrency(completedTotal)}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">facturas completadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Pre-facturas</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">{pendingInvoicesCount}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">RD${formatCurrency(pendingTotal)} pendientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Ticket Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">RD${formatCurrency(averageTicket)}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">solo facturas completadas</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por numero o cliente..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-full sm:w-[140px]">
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
                <SelectTrigger className="w-full sm:w-[120px]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedDay} onValueChange={setSelectedDay}>
                <SelectTrigger className="w-full sm:w-[100px]">
                  <SelectValue placeholder="Dia" />
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
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Facturas de Almacen</CardTitle>
            <CardDescription>
              {filteredTransactions.length} facturas encontradas
              {selectedIds.size > 0 && ` • ${selectedIds.size} seleccionadas`}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {selectedIds.size > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadSelected} className="justify-start sm:justify-center">
                <Download className="mr-2 h-4 w-4" />
                Descargar Seleccionadas ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleDownloadAll} className="justify-start sm:justify-center">
              <Download className="mr-2 h-4 w-4" />
              Descargar Todo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 md:hidden">
            {filteredTransactions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No se encontraron facturas de almacen
              </div>
            ) : (
              filteredTransactions.map((transaction) => (
                <Card key={transaction.id} className="border-border/70">
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{transaction.number}</p>
                        <p className="text-xs text-muted-foreground">{new Date(transaction.date).toLocaleString("es-ES")}</p>
                      </div>
                      <Badge
                        variant={
                          transaction.status === "pending"
                            ? "secondary"
                            : transaction.status === "credito"
                              ? "outline"
                              : "default"
                        }
                      >
                        {transaction.status === "pending"
                          ? "Pendiente"
                          : transaction.status === "credito"
                            ? "Credito"
                            : "Completada"}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-muted-foreground">Cliente</span>
                        <span className="text-right font-medium">{transaction.customer}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Método</span>
                        <span>{getPaymentMethodLabel(transaction.paymentMethod)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">Monto</span>
                        <span className="font-semibold">RD${formatCurrency(transaction.amount)}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTransaction(transaction)
                          setShowDetailsDialog(true)
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Ver
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handlePrint(transaction)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void handleDownloadPdf(transaction)}>
                        <CloudDownload className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void handleDelete(transaction)}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                        Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>No. Factura</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Metodo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        No se encontraron facturas de almacen
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
                        <TableCell className="font-medium">{transaction.number}</TableCell>
                        <TableCell>{new Date(transaction.date).toLocaleString("es-ES")}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              transaction.status === "pending"
                                ? "secondary"
                                : transaction.status === "credito"
                                  ? "outline"
                                  : "default"
                            }
                          >
                            {transaction.status === "pending"
                              ? "Pendiente"
                              : transaction.status === "credito"
                                ? "Credito"
                                : "Completada"}
                          </Badge>
                        </TableCell>
                        <TableCell>{transaction.customer}</TableCell>
                        <TableCell>{getPaymentMethodLabel(transaction.paymentMethod)}</TableCell>
                        <TableCell className="text-right font-medium">RD${formatCurrency(transaction.amount)}</TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
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
                                <TooltipContent>Ver detalles</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrint(transaction)}>
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Imprimir</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void handleDownloadPdf(transaction)}
                                  >
                                    <CloudDownload className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Descargar PDF</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => void handleDelete(transaction)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Eliminar factura</TooltipContent>
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
          </div>
        </CardContent>
      </Card>

      <SaleDetailsDialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog} sale={selectedTransaction} />
    </div>
  )
}
