"use client"

import { useState, useMemo } from "react"
import {
  Search,
  RotateCcw,
  FileText,
  AlertCircle,
  CheckCircle,
  Printer,
  ArrowLeft,
  Package,
  User,
  Calendar,
  Receipt,
  CreditCard,
  RefreshCw,
  DollarSign,
  History,
  Trash2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useStore } from "@/components/store-context"
import { formatCurrency } from "@/lib/utils"
import type { Sale, CartItem } from "@/components/store-context"
import { isAlmacenCategory, normalizeAlmacenBoxNumber } from "@/lib/almacen"
import { isAlmacenSourceRecord, normalizeInventorySourceTable } from "@/lib/transaction-classification"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { printReturnTicket } from "@/components/invoice-printer"

interface ReturnItemSelection {
  item: CartItem
  selected: boolean
  quantityToReturn: number
  alreadyReturned: number
  availableToReturn: number
}

const getEffectiveUnitPrice = (item: CartItem) => item.customPrice ?? item.sellPrice

export default function DevolucionesPage() {
  const { sales, customers, returns, addReturn, cancelReturn, getReturnedQuantity, currentUser, employees, products } = useStore()
  const { toast } = useToast()
  const employee = employees.find((e) => e.email === currentUser?.email)
  const isAdmin = currentUser?.role === "admin"
  const canEditReturns = isAdmin || employee?.permissions.canEdit
  const canDeleteReturns = isAdmin || employee?.permissions.canDelete
  const almacenProductIds = useMemo(
    () =>
      new Set(
        products
          .filter((product) => {
            const explicitSource = normalizeInventorySourceTable(product.sourceTable)
            if (explicitSource) return explicitSource === "armacen"
            return Boolean(normalizeAlmacenBoxNumber(product.boxNumber) || isAlmacenCategory(product.category))
          })
          .map((product) => product.id),
      ),
    [products],
  )

  // Estado para búsqueda de factura
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)

  // Estado para selección de productos a devolver
  const [returnItems, setReturnItems] = useState<ReturnItemSelection[]>([])

  // Estado para información de devolución
  const [returnType, setReturnType] = useState<"reembolso" | "transferencia" | "credito">("reembolso")
  const [returnReason, setReturnReason] = useState("")

  // Diálogos
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [isProcessingReturn, setIsProcessingReturn] = useState(false)
  const [returnToInventory, setReturnToInventory] = useState(true) // Default true: products return to stock
  const [lastReturn, setLastReturn] = useState<any | null>(null)

  // Tab actual
  const [activeTab, setActiveTab] = useState("nueva")

  // Filtros para historial
  const [historyFilter, setHistoryFilter] = useState({
    search: "",
    type: "all",
    dateFrom: "",
    dateTo: "",
  })

  // Buscar facturas
  const filteredSales = useMemo(() => {
    if (!searchTerm) return []
    const term = searchTerm.toLowerCase()
    return sales.filter(
      (sale) =>
        sale.status !== "anulada" &&
        (sale.invoiceNumber.toLowerCase().includes(term) ||
          sale.customerName?.toLowerCase().includes(term) ||
          sale.id.includes(term)),
    )
  }, [sales, searchTerm])

  // Seleccionar una factura
  const handleSelectSale = (sale: Sale) => {
    if (sale.status === "devuelta_completa") {
      toast({
        title: "Factura ya devuelta",
        description: "Esta factura ya tiene todos sus productos devueltos.",
        variant: "destructive",
      })
      return
    }

    const hasCreditPortion =
      sale.status === "credito" ||
      sale.paymentMethod === "credit" ||
      Number(sale.amountPaid || 0) < Number(sale.total || 0)

    setSelectedSale(sale)
    setReturnType(hasCreditPortion ? "credito" : "reembolso")

    // Preparar items para selección
    const items: ReturnItemSelection[] = sale.items.map((item) => {
      const alreadyReturned = getReturnedQuantity(sale.id, item.id)
      const availableToReturn = item.quantity - alreadyReturned

      return {
        item,
        selected: false,
        quantityToReturn: 0,
        alreadyReturned,
        availableToReturn,
      }
    })

    setReturnItems(items)
    setSearchTerm("")
  }

  // Cancelar selección
  const handleCancelSelection = () => {
    setSelectedSale(null)
    setReturnItems([])
    setReturnType("reembolso")
    setReturnReason("")
    setReturnToInventory(true)
  }

  // Actualizar selección de item
  const toggleItemSelection = (index: number, checked: boolean) => {
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
            ...item,
            selected: checked,
            quantityToReturn: checked ? Math.min(1, item.availableToReturn) : 0,
          }
          : item,
      ),
    )
  }

  // Actualizar cantidad a devolver
  const updateReturnQuantity = (index: number, quantity: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const validQuantity = Math.max(0, Math.min(quantity, item.availableToReturn))
        return {
          ...item,
          quantityToReturn: validQuantity,
          selected: validQuantity > 0,
        }
      }),
    )
  }

  // Calcular total de devolución
  const returnTotal = useMemo(() => {
    return returnItems
      .filter((item) => item.selected && item.quantityToReturn > 0)
      .reduce((sum, item) => sum + getEffectiveUnitPrice(item.item) * item.quantityToReturn, 0)
  }, [returnItems])

  // Validar antes de procesar
  const canProcessReturn = useMemo(() => {
    const hasSelectedItems = returnItems.some((item) => item.selected && item.quantityToReturn > 0)
    const hasReason = returnReason.trim().length > 0
    return hasSelectedItems && hasReason
  }, [returnItems, returnReason])

  // Procesar devolución
  const handleProcessReturn = async () => {
    if (!selectedSale || !canProcessReturn || isProcessingReturn) return
    setIsProcessingReturn(true)

    try {
    // ... inside handleProcessReturn
    const itemsToReturn = returnItems
      .filter((item) => item.selected && item.quantityToReturn > 0)
      .map((item) => {
        const unitPrice = getEffectiveUnitPrice(item.item)
        return {
          id: Math.random().toString(36).substr(2, 9),
          productId: item.item.id,
          sourceTable: item.item.sourceTable,
          sourceId: item.item.sourceId,
          productName: item.item.name,
          imei: item.item.imei,
          quantity: item.quantityToReturn,
          unitPrice,
          subtotal: unitPrice * item.quantityToReturn,
          // Preserve cost if available for profit calculation
          buyPrice: item.item.buyPrice,
          sku: item.item.sku,
        }
      })

    // Determinar si es devolución completa o parcial
    const totalItemsInSale = selectedSale.items.reduce((sum, item) => sum + item.quantity, 0)
    const totalAlreadyReturned = returnItems.reduce((sum, item) => sum + item.alreadyReturned, 0)
    const totalReturning = itemsToReturn.reduce((sum, item) => sum + item.quantity, 0)
    const isComplete = totalAlreadyReturned + totalReturning >= totalItemsInSale

    const customer = customers.find((c) => c.id === selectedSale.customerId || c.name === selectedSale.customerName)

    const newReturn = await addReturn({
      invoiceId: selectedSale.id,
      invoiceNumber: selectedSale.invoiceNumber,
      customerId: customer?.id,
      customerName: selectedSale.customerName,
      items: itemsToReturn,
      total: returnTotal,
      type: returnType,
      reason: returnReason,
      status: isComplete ? "completa" : "parcial",
      returnToInventory: returnToInventory,
    })

    // AUTOMATIC EXPENSE REVERSAL FOR MANUAL ITEMS
    // If the returned items include Manual Items (which created an expense upon sale),
    // we must create a negative expense to reverse it.
    // KEY CHANGE: Only reverse expense if item is returned to inventory (recoverable).
    // If not recoverable (loss), we do NOT reverse the expense, so the cost remains as a loss.
    if (returnToInventory) {
      const supabase = createClient()
      const manualItemsCost = itemsToReturn
        .filter(
          (item) =>
            item.sku === "MANUAL" &&
            !isAlmacenSourceRecord(item as unknown as Record<string, unknown>, almacenProductIds),
        )
        .reduce((sum, item) => sum + (Number(item.buyPrice) || 0) * item.quantity, 0)

      if (manualItemsCost > 0) {
        try {
          await supabase.from("expenses").insert({
            date: new Date().toISOString().split("T")[0],
            description: `Reversión Costo (Devolución) - Factura ${selectedSale.invoiceNumber}`,
            amount: -manualItemsCost, // Negative amount to reverse the expense
            category: "operativo",
            payment_method: "cash", // Assuming reversion is cash adjustment or just accounting fix
            user_name: currentUser?.name || "Sistema",
            user_id: currentUser?.id,
          })
          toast({
            title: "Gasto Revertido",
            description: `Se registró una reversión de gastos por $${formatCurrency(manualItemsCost)}`,
          })
        } catch (error) {
          console.error("Error reversing manual item expense:", error)
        }
      }
    }

    setLastReturn(newReturn)

    setShowConfirmDialog(false)
    setShowSuccessDialog(true)

    // Reset
    handleCancelSelection()

    toast({
      title: "Devolución procesada",
      description: `Se ha registrado la devolución ${newReturn.returnNumber}`,
    })
    } catch (error) {
      console.error("Error processing return:", error)
      toast({
        title: "Error",
        description: "No se pudo procesar la devolución. Intente de nuevo.",
        variant: "destructive",
      })
      setIsProcessingReturn(false)
    }
  }

  // Filtrar historial
  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      if (historyFilter.search) {
        const term = historyFilter.search.toLowerCase()
        if (
          !r.returnNumber.toLowerCase().includes(term) &&
          !r.invoiceNumber.toLowerCase().includes(term) &&
          !r.customerName?.toLowerCase().includes(term)
        ) {
          return false
        }
      }
      if (historyFilter.type !== "all" && r.type !== historyFilter.type) {
        return false
      }
      if (historyFilter.dateFrom) {
        const from = new Date(historyFilter.dateFrom)
        if (new Date(r.date) < from) return false
      }
      if (historyFilter.dateTo) {
        const to = new Date(historyFilter.dateTo)
        to.setHours(23, 59, 59)
        if (new Date(r.date) > to) return false
      }
      return true
    })
  }, [returns, historyFilter])

  // Obtener el cliente de la factura seleccionada
  const selectedCustomer = useMemo(() => {
    if (!selectedSale) return null
    return customers.find((c) => c.id === selectedSale.customerId || c.name === selectedSale.customerName)
  }, [selectedSale, customers])

  const [printingReturnId, setPrintingReturnId] = useState<string | null>(null)
  const [cancelingReturnId, setCancelingReturnId] = useState<string | null>(null)

  const handlePrintReturn = async (ret: any) => {
    setPrintingReturnId(ret.id)
    try {
      // Usar la nueva función de impresión térmica 80mm
      void printReturnTicket(
        {
          returnNumber: ret.returnNumber,
          invoiceNumber: ret.invoiceNumber,
          customerName: ret.customerName,
          date: ret.date,
          items: ret.items,
          total: ret.total,
          type: ret.type,
          reason: ret.reason,
        },
        undefined,
        currentUser?.adminId,
      )

      toast({
        title: "Imprimiendo",
        description: "Enviando ticket a la impresora...",
      })
    } catch (error) {
      console.error("Error printing return:", error)
      toast({
        title: "Error",
        description: "Error al imprimir la devolución",
        variant: "destructive",
      })
    } finally {
      setPrintingReturnId(null)
    }
  }

  const handleCancelReturn = async (ret: any) => {
    if (!canDeleteReturns) {
      toast({
        title: "Sin permisos",
        description: "No tienes permisos para anular devoluciones.",
        variant: "destructive",
      })
      return
    }

    const confirmed = window.confirm(
      `¿Anular la devolucion ${ret.returnNumber} de la factura ${ret.invoiceNumber}?\n\nEsta accion revertira inventario y ajustes del cliente.`,
    )

    if (!confirmed) return

    setCancelingReturnId(ret.id)
    try {
      await cancelReturn(ret.id)
      toast({
        title: "Devolucion anulada",
        description: `La devolucion ${ret.returnNumber} fue anulada correctamente.`,
      })
    } catch (error) {
      console.error("Error canceling return:", error)
      const errorMessage = error instanceof Error ? error.message : "No se pudo anular la devolucion."
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setCancelingReturnId(null)
    }
  }

  const handleConfirmDialogChange = (open: boolean) => {
    if (isProcessingReturn) return
    setShowConfirmDialog(open)
  }

  const handleSuccessDialogChange = (open: boolean) => {
    setShowSuccessDialog(open)
    if (!open) {
      setIsProcessingReturn(false)
    }
  }

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="nueva" className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Nueva Devolución
          </TabsTrigger>
          <TabsTrigger value="historial" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nueva" className="space-y-6 mt-6">
          {!selectedSale ? (
            // Sección de búsqueda de factura
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Buscar Factura
                </CardTitle>
                <CardDescription>Ingrese el número de factura, nombre del cliente o ID para buscar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por número de factura, cliente..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {searchTerm && (
                  <div className="space-y-2">
                    {filteredSales.length === 0 ? (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Sin resultados</AlertTitle>
                        <AlertDescription>No se encontraron facturas que coincidan con "{searchTerm}"</AlertDescription>
                      </Alert>
                    ) : (
                      <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
                        {filteredSales.map((sale) => (
                          <div
                            key={sale.id}
                            className="p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => handleSelectSale(sale)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{sale.invoiceNumber}</span>
                                  <Badge
                                    variant={
                                      sale.status === "completada"
                                        ? "default"
                                        : sale.status === "devuelta_parcial"
                                          ? "secondary"
                                          : "outline"
                                    }
                                  >
                                    {sale.status === "completada"
                                      ? "Completada"
                                      : sale.status === "devuelta_parcial"
                                        ? "Devolución Parcial"
                                        : sale.status === "devuelta_completa"
                                          ? "Devuelta"
                                          : sale.status}
                                  </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {sale.customerName || "Cliente General"} •{" "}
                                  {new Date(sale.date).toLocaleDateString("es-ES")}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">${formatCurrency(sale.total || 0)}</div>
                                <div className="text-sm text-muted-foreground">{sale.items.length} productos</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!searchTerm && (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Ingrese un término de búsqueda para encontrar facturas</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            // Factura seleccionada - Formulario de devolución
            <div className="space-y-6">
              <Button variant="ghost" onClick={handleCancelSelection} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Volver a buscar
              </Button>

              {/* Información de la factura */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Información de Factura
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Número de Factura
                      </div>
                      <div className="font-semibold">{selectedSale.invoiceNumber}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Cliente
                      </div>
                      <div className="font-semibold">{selectedSale.customerName || "Cliente General"}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Fecha
                      </div>
                      <div className="font-semibold">{new Date(selectedSale.date).toLocaleDateString("es-ES")}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Total Factura
                      </div>
                      <div className="font-semibold">${formatCurrency(selectedSale?.total || 0)}</div>
                    </div>
                  </div>
                  {selectedSale.status !== "completada" && (
                    <Alert className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Esta factura tiene devoluciones previas</AlertTitle>
                      <AlertDescription>
                        Las cantidades disponibles para devolver ya reflejan las devoluciones anteriores.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Productos de la factura */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Productos a Devolver
                  </CardTitle>
                  <CardDescription>Seleccione los productos y cantidades a devolver</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Comprado</TableHead>
                        <TableHead className="text-center">Ya Devuelto</TableHead>
                        <TableHead className="text-center">Disponible</TableHead>
                        <TableHead className="text-center w-32">Cantidad a Devolver</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnItems.map((returnItem, index) => (
                        <TableRow
                          key={returnItem.item.cartId}
                          className={returnItem.availableToReturn === 0 ? "opacity-50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={returnItem.selected}
                              onCheckedChange={(checked) => toggleItemSelection(index, checked as boolean)}
                              disabled={returnItem.availableToReturn === 0}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{returnItem.item.name}</div>
                            <div className="text-xs text-muted-foreground">{returnItem.item.sku}</div>
                            {returnItem.item.imei && (
                              <div className="text-xs text-muted-foreground">IMEI: {returnItem.item.imei}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{returnItem.item.quantity}</TableCell>
                          <TableCell className="text-center">
                            {returnItem.alreadyReturned > 0 ? (
                              <Badge variant="secondary">{returnItem.alreadyReturned}</Badge>
                            ) : (
                              "0"
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={returnItem.availableToReturn > 0 ? "outline" : "destructive"}>
                              {returnItem.availableToReturn}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              max={returnItem.availableToReturn}
                              value={returnItem.quantityToReturn}
                              onChange={(e) => updateReturnQuantity(index, Number.parseInt(e.target.value) || 0)}
                              disabled={returnItem.availableToReturn === 0}
                              className="w-20 mx-auto text-center"
                            />
                          </TableCell>
                          <TableCell className="text-right">${formatCurrency(getEffectiveUnitPrice(returnItem.item))}</TableCell>
                          <TableCell className="text-right font-medium">
                            ${formatCurrency(getEffectiveUnitPrice(returnItem.item) * returnItem.quantityToReturn || 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Información de la devolución */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5" />
                    Detalles de Devolución
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Devolución</Label>
                      <Select value={returnType} onValueChange={(v) => setReturnType(v as typeof returnType)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reembolso">
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              Reembolso en Efectivo
                            </div>
                          </SelectItem>
                          <SelectItem value="credito">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4" />
                              Crédito
                            </div>
                          </SelectItem>
                          <SelectItem value="transferencia">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4" />
                              Transferencia
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Motivo de Devolución *</Label>
                      <Textarea
                        placeholder="Describa el motivo de la devolución..."
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-4">
                    <Checkbox
                      id="return-inventory"
                      checked={returnToInventory}
                      onCheckedChange={(checked) => setReturnToInventory(checked as boolean)}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <Label
                        htmlFor="return-inventory"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Devolver productos al inventario
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {returnToInventory
                          ? "Los productos volverán al stock y se anulará el costo (ganancia ajustada)."
                          : "Los productos NO volverán al stock (se asume pérdida o daño). El costo se mantiene como gasto."}
                      </p>
                    </div>
                  </div>

                  {returnType === "transferencia" && (
                    <Alert>
                      <CreditCard className="h-4 w-4" />
                      <AlertTitle>Devolución por Transferencia</AlertTitle>
                      <AlertDescription>
                        Se registrará como devolución con transferencia. Solo afectará el cierre de caja en la sección de Transferencias.
                      </AlertDescription>
                    </Alert>
                  )}

                  {returnType === "credito" && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Devolución a crédito</AlertTitle>
                      <AlertDescription>
                        Para ventas con crédito o crédito parcial, esta devolución no reducirá efectivo de caja y ajustará el saldo pendiente del cliente.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <Separator />
                <CardFooter className="flex items-center justify-between pt-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Total a Devolver</div>
                    <div className="text-3xl font-bold">${(returnTotal || 0).toLocaleString()}</div>
                  </div>
                  {canEditReturns && (
                    <Button
                      size="lg"
                      disabled={!canProcessReturn || isProcessingReturn}
                      onClick={() => setShowConfirmDialog(true)}
                      className="gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Registrar Devolución
                    </Button>
                  )}
                </CardFooter>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historial de Devoluciones
              </CardTitle>
              <CardDescription>Consulte todas las devoluciones registradas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={historyFilter.search}
                    onChange={(e) => setHistoryFilter((f) => ({ ...f, search: e.target.value }))}
                    className="pl-10"
                  />
                </div>
                <Select value={historyFilter.type} onValueChange={(v) => setHistoryFilter((f) => ({ ...f, type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    <SelectItem value="reembolso">Reembolso</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                    <SelectItem value="cambio">Cambio</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={historyFilter.dateFrom}
                  onChange={(e) => setHistoryFilter((f) => ({ ...f, dateFrom: e.target.value }))}
                  placeholder="Desde"
                />
                <Input
                  type="date"
                  value={historyFilter.dateTo}
                  onChange={(e) => setHistoryFilter((f) => ({ ...f, dateTo: e.target.value }))}
                  placeholder="Hasta"
                />
              </div>

              {/* Tabla de historial */}
              {filteredReturns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RotateCcw className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay devoluciones registradas</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº Devolución</TableHead>
                        <TableHead>Nº Factura</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReturns.map((ret) => (
                        <TableRow key={ret.id}>
                          <TableCell className="font-medium">{ret.returnNumber}</TableCell>
                          <TableCell>{ret.invoiceNumber}</TableCell>
                          <TableCell>{ret.customerName || "Cliente General"}</TableCell>
                          <TableCell>{new Date(ret.date).toLocaleDateString("es-ES")}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                ret.type === "reembolso" ? "default" : ret.type === "credito" ? "secondary" : "outline"
                              }
                            >
                              {ret.type === "reembolso" ? "Reembolso" : ret.type === "credito" ? "Crédito" : "Cambio"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">${ret.total.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={ret.status === "completa" ? "default" : "secondary"}>
                              {ret.status === "completa" ? "Completa" : "Parcial"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePrintReturn(ret)}
                              disabled={printingReturnId === ret.id}
                              title="Imprimir Nota de Crédito"
                            >
                              {printingReturnId === ret.id ? (
                                <div className="h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
                              ) : (
                                <Printer className="h-4 w-4" />
                              )}
                            </Button>
                            {canDeleteReturns && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleCancelReturn(ret)}
                                disabled={cancelingReturnId === ret.id}
                                title="Anular devolucion"
                              >
                                {cancelingReturnId === ret.id ? (
                                  <div className="h-4 w-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resumen de estadísticas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-full">
                    <RotateCcw className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{returns.length}</div>
                    <div className="text-sm text-muted-foreground">Total Devoluciones</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-500/10 rounded-full">
                    <DollarSign className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      $
                      {(
                        returns.filter((r) => r.type === "reembolso").reduce((sum, r) => sum + r.total, 0) || 0
                      ).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Reembolsos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-full">
                    <CreditCard className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      $
                      {(
                        returns.filter((r) => r.type === "credito").reduce((sum, r) => sum + r.total, 0) || 0
                      ).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Créditos</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-orange-500/10 rounded-full">
                    <RefreshCw className="h-6 w-6 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      $
                      {(
                        returns.filter((r) => r.type === "cambio").reduce((sum, r) => sum + r.total, 0) || 0
                      ).toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground">Cambios</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Diálogo de confirmación */}
      <Dialog open={showConfirmDialog} onOpenChange={handleConfirmDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Devolución</DialogTitle>
            <DialogDescription>¿Está seguro de procesar esta devolución?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Factura:</span>
              <span className="font-medium">{selectedSale?.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Productos a devolver:</span>
              <span className="font-medium">
                {returnItems.filter((i) => i.selected && i.quantityToReturn > 0).length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo:</span>
              <Badge>
                {returnType === "reembolso" ? "Reembolso" : returnType === "credito" ? "Crédito" : "Cambio"}
              </Badge>
            </div>
            <Separator />
            <div className="flex justify-between text-lg">
              <span className="font-semibold">Total a Devolver:</span>
              <span className="font-bold">${(returnTotal || 0).toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} disabled={isProcessingReturn}>
              Cancelar
            </Button>
            <Button onClick={handleProcessReturn} disabled={isProcessingReturn}>Confirmar Devolución</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de éxito */}
      <Dialog open={showSuccessDialog} onOpenChange={handleSuccessDialogChange}>
        <DialogContent className="text-center">
          <DialogHeader>
            <div className="mx-auto mb-4 p-4 bg-green-100 rounded-full w-fit">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <DialogTitle className="text-2xl">Devolución Exitosa</DialogTitle>
            <DialogDescription>La devolución ha sido procesada correctamente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Número de Devolución</div>
              <div className="text-xl font-bold">{lastReturn?.returnNumber}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Total Devuelto</div>
              <div className="text-3xl font-bold text-green-600">${(lastReturn?.total || 0).toLocaleString()}</div>
            </div>
            <Badge variant="secondary" className="mx-auto">
              {lastReturn?.type === "reembolso"
                ? "Reembolso en Efectivo"
                : lastReturn?.type === "credito"
                  ? "Crédito a Favor"
                  : "Cambio de Producto"}
            </Badge>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="gap-2 bg-transparent"
              onClick={() => lastReturn && handlePrintReturn(lastReturn)}
              disabled={!lastReturn || printingReturnId === lastReturn.id}
            >
              <Printer className="h-4 w-4" />
              Imprimir Nota de Crédito
            </Button>
            <Button onClick={() => handleSuccessDialogChange(false)}>Aceptar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

