"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  FilePlus2,
  HandCoins,
  Paperclip,
  PackagePlus,
  Plus,
  Receipt,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react"
import { useStore, type Purchase, type PurchaseItem } from "@/components/store-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { isValidPurchaseAttachment, uploadPurchaseAttachment } from "@/lib/purchase-attachments-storage"

const money = (value: number) => `RD$ ${value.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`
const formatDate = (value?: string) => (value ? new Date(value).toLocaleDateString("es-DO") : "—")

type PurchaseKind = "piezas" | "productos" | "otros"
type Destination = "products" | "armacen"
type StatusFilter = "all" | "pendiente" | "parcial" | "pagado"

type Line = {
  id: string
  mode: "existing" | "new" | "gasto"
  productId: string
  name: string
  sku: string
  category: string
  boxNumber: string
  quantity: number
  unitPrice: number
  wholesalePrice: number
  sellPrice: number
}

const emptyLine = (kind: PurchaseKind): Line => ({
  id: crypto.randomUUID(),
  mode: kind === "productos" ? "existing" : "gasto",
  productId: "",
  name: "",
  sku: "",
  category: "General",
  boxNumber: "",
  quantity: 1,
  unitPrice: 0,
  wholesalePrice: 0,
  sellPrice: 0,
})

const kindLabel = (kind?: PurchaseKind) =>
  kind === "piezas" ? "Piezas" : kind === "otros" ? "Otros / Gastos" : "Productos"

const isOverdue = (purchase: Purchase) =>
  purchase.status !== "pagado" && Boolean(purchase.dueDate) && new Date(purchase.dueDate as string) < new Date()

export default function FacturasPage() {
  const {
    suppliers,
    products,
    purchases,
    supplierPayments,
    addPurchase,
    addSupplierPayment,
    addProduct,
    employees,
    currentUser,
    setOnDialogOpen,
  } = useStore()
  const { toast } = useToast()

  const employeePermissions = employees.find((employee) => employee.email === currentUser?.email)?.permissions
  const canAdd = currentUser?.role === "admin" || Boolean(employeePermissions?.canAdd)

  // ---------- Filtros del listado ----------
  const [search, setSearch] = useState("")
  const [filterSupplierId, setFilterSupplierId] = useState("all")
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all")
  const [filterKind, setFilterKind] = useState<"all" | PurchaseKind>("all")

  // ---------- Diálogo: nueva factura ----------
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedSupplierId, setSelectedSupplierId] = useState("")
  const [purchaseKind, setPurchaseKind] = useState<PurchaseKind>("productos")
  const [destination, setDestination] = useState<Destination>("products")
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado")
  const [amountPaid, setAmountPaid] = useState(0)
  const [dueDate, setDueDate] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<Line[]>([emptyLine("productos")])

  // ---------- Diálogo: registrar abono ----------
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [paymentSupplierId, setPaymentSupplierId] = useState("")
  const [paymentPurchaseId, setPaymentPurchaseId] = useState("auto")
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash")
  const [paymentNote, setPaymentNote] = useState("")
  const [paymentFile, setPaymentFile] = useState<File | null>(null)

  // ---------- Diálogo: ver detalle / adjunto ----------
  const [detailPurchase, setDetailPurchase] = useState<Purchase | null>(null)

  const selectedSupplier = suppliers.find((item) => item.id === selectedSupplierId)
  const paymentSupplier = suppliers.find((item) => item.id === paymentSupplierId)
  const availableProducts = products.filter((product) =>
    destination === "armacen" ? product.sourceTable === "armacen" : product.sourceTable !== "armacen",
  )
  const pendingPurchases = purchases
    .filter((purchase) => purchase.supplierId === paymentSupplierId && purchase.total - purchase.amountPaid > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0)
  const effectivePaid = paymentType === "contado" ? subtotal : Math.min(subtotal, Math.max(0, amountPaid))
  const debtCreated = Math.max(0, subtotal - effectivePaid)

  const paymentPreview = useMemo(() => {
    const preferredId = paymentPurchaseId === "auto" ? undefined : paymentPurchaseId
    const preferred = preferredId ? pendingPurchases.find((purchase) => purchase.id === preferredId) : undefined
    const order = preferred
      ? [preferred, ...pendingPurchases.filter((purchase) => purchase.id !== preferred.id)]
      : pendingPurchases
    let remaining = Math.max(0, paymentAmount)
    return order.flatMap((purchase) => {
      if (remaining <= 0) return []
      const applied = Math.min(remaining, Math.max(0, purchase.total - purchase.amountPaid))
      remaining -= applied
      return applied > 0 ? [{ purchase, applied }] : []
    })
  }, [paymentAmount, paymentPurchaseId, pendingPurchases])

  // ---------- Listado filtrado ----------
  const allPurchases = useMemo(
    () => [...purchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [purchases],
  )
  const filteredPurchases = allPurchases.filter((purchase) => {
    if (filterSupplierId !== "all" && purchase.supplierId !== filterSupplierId) return false
    if (filterStatus !== "all" && purchase.status !== filterStatus) return false
    if (filterKind !== "all" && (purchase.purchaseKind || "productos") !== filterKind) return false
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      const haystack = `${purchase.invoiceNumber} ${purchase.supplierName} ${purchase.notes || ""}`.toLowerCase()
      if (!haystack.includes(term)) return false
    }
    return true
  })
  const filteredPayments = useMemo(
    () =>
      supplierPayments
        .filter((payment) => filterSupplierId === "all" || payment.supplierId === filterSupplierId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [supplierPayments, filterSupplierId],
  )

  const totals = useMemo(
    () => ({
      purchased: filteredPurchases.reduce((sum, item) => sum + item.total, 0),
      pending: filteredPurchases.reduce((sum, item) => sum + Math.max(0, item.total - item.amountPaid), 0),
      paid: filteredPayments.reduce((sum, item) => sum + item.amount, 0),
    }),
    [filteredPurchases, filteredPayments],
  )

  // ---------- Helpers de formulario ----------
  const updateLine = (id: string, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  const chooseExistingProduct = (lineId: string, productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    updateLine(lineId, {
      productId,
      name: product.name,
      sku: product.sku,
      category: product.category,
      boxNumber: product.boxNumber || "",
      unitPrice: product.buyPrice,
      wholesalePrice: product.wholesalePrice,
      sellPrice: product.sellPrice,
    })
  }

  const changeKind = (kind: PurchaseKind) => {
    setPurchaseKind(kind)
    setDestination("products")
    setLines([emptyLine(kind)])
  }

  const openInvoiceDialog = useCallback(() => {
    if (!canAdd) {
      toast({ title: "Sin permiso", description: "Tu usuario no tiene permiso para registrar facturas.", variant: "destructive" })
      return
    }
    setSelectedSupplierId("")
    setPurchaseKind("productos")
    setDestination("products")
    setPaymentType("contado")
    setAmountPaid(0)
    setDueDate("")
    setNotes("")
    setLines([emptyLine("productos")])
    setInvoiceOpen(true)
  }, [canAdd, toast])

  useEffect(() => {
    setOnDialogOpen?.(openInvoiceDialog)
    return () => setOnDialogOpen?.(() => {})
  }, [setOnDialogOpen, openInvoiceDialog])

  const openPaymentDialog = (supplierId?: string) => {
    if (!canAdd) {
      toast({ title: "Sin permiso", description: "Tu usuario no tiene permiso para registrar abonos.", variant: "destructive" })
      return
    }
    setPaymentSupplierId(supplierId || "")
    setPaymentPurchaseId("auto")
    setPaymentAmount(0)
    setPaymentMethod("cash")
    setPaymentNote("")
    setPaymentFile(null)
    setPaymentOpen(true)
  }

  const saveInvoice = async () => {
    const linesInvalid = lines.some((line) => {
      if (purchaseKind === "productos") {
        return !line.name.trim() || line.quantity <= 0 || line.unitPrice < 0 || (line.mode === "existing" && !line.productId)
      }
      return !line.name.trim() || line.quantity <= 0 || line.unitPrice < 0
    })
    if (!selectedSupplier || lines.length === 0 || linesInvalid) {
      toast({
        title: "Datos incompletos",
        description: "Selecciona el proveedor y completa todas las líneas de la factura.",
        variant: "destructive",
      })
      return
    }
    if (paymentType === "credito" && effectivePaid > subtotal) return

    setSaving(true)
    try {
      const purchaseItems: PurchaseItem[] = []
      for (const line of lines) {
        if (purchaseKind === "productos" && line.mode === "new") {
          const temporaryId = `new-${line.id}`
          await addProduct({
            sourceTable: destination === "armacen" ? "armacen" : "products",
            sku: line.sku.trim() || `COMP-${Date.now()}`,
            name: line.name.trim(),
            category: destination === "armacen" ? "Almacen" : line.category.trim() || "General",
            boxNumber: destination === "armacen" ? line.boxNumber.trim() || "1" : undefined,
            stock: line.quantity,
            minStock: 1,
            buyPrice: line.unitPrice,
            wholesalePrice: line.wholesalePrice || line.sellPrice,
            sellPrice: line.sellPrice || line.unitPrice,
            supplier: selectedSupplier.id,
          })
          purchaseItems.push({
            id: line.id,
            productId: temporaryId,
            productName: line.name.trim(),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
          })
        } else if (purchaseKind === "productos") {
          purchaseItems.push({
            id: line.id,
            productId: line.productId,
            productName: line.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
          })
        } else {
          // Piezas u otros gastos: no crean ni tocan productos de inventario.
          purchaseItems.push({
            id: line.id,
            productId: `gasto-${line.id}`,
            productName: line.name.trim(),
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            total: line.quantity * line.unitPrice,
          })
        }
      }

      const purchase = await addPurchase({
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        items: purchaseItems,
        subtotal,
        tax: 0,
        total: subtotal,
        paymentType,
        paymentMethod: "cash",
        amountPaid: effectivePaid,
        dueDate: paymentType === "credito" ? dueDate || undefined : undefined,
        status: debtCreated <= 0 ? "pagado" : effectivePaid > 0 ? "parcial" : "pendiente",
        notes: notes || undefined,
        purchaseKind,
      })

      toast({
        title: "Factura registrada",
        description: `${purchase.invoiceNumber} guardada. ${debtCreated > 0 ? `Deuda creada: ${money(debtCreated)}.` : "Pagada completa."}`,
      })
      setInvoiceOpen(false)
    } catch {
      toast({ title: "No se pudo registrar", description: "Revisa la conexión y vuelve a intentarlo.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const savePayment = async () => {
    if (!paymentSupplier || paymentAmount <= 0 || paymentAmount > paymentSupplier.debt) {
      toast({ title: "Abono inválido", description: "El monto debe ser mayor que cero y no superar la deuda del proveedor.", variant: "destructive" })
      return
    }
    if (pendingPurchases.length === 0) {
      toast({ title: "No hay facturas pendientes", description: "Este proveedor no tiene facturas disponibles para aplicar el abono.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      let attachmentUrl: string | undefined
      if (paymentFile) {
        const uploaded = await uploadPurchaseAttachment(paymentFile, "abonos")
        if (!uploaded.success) {
          toast({ title: "No se pudo adjuntar el comprobante", description: uploaded.error, variant: "destructive" })
          setSaving(false)
          return
        }
        attachmentUrl = uploaded.publicUrl
      }

      await addSupplierPayment({
        supplierId: paymentSupplier.id,
        purchaseId: paymentPurchaseId === "auto" ? undefined : paymentPurchaseId,
        amount: paymentAmount,
        paymentMethod,
        note: paymentNote || undefined,
        attachmentUrl,
      })
      toast({
        title: "Abono registrado",
        description: `Saldo restante con ${paymentSupplier.name}: ${money(Math.max(0, paymentSupplier.debt - paymentAmount))}.`,
      })
      setPaymentOpen(false)
    } catch {
      toast({ title: "No se pudo registrar el abono", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (purchase: Purchase) => {
    if (purchase.status === "pagado") return <Badge>Pagada</Badge>
    if (purchase.status === "parcial") return <Badge variant="secondary">Abonada</Badge>
    return <Badge variant="destructive">Pendiente</Badge>
  }

  return (
    <div className="space-y-4 px-2 pb-4 pt-2 sm:space-y-6 sm:px-4 sm:pb-6 sm:pt-4 lg:px-6 lg:pb-6 lg:pt-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registro de Facturas</h1>
          <p className="text-sm text-muted-foreground">
            Guarda tus facturas de compra, vincúlalas a productos y controla lo que le debes a cada proveedor.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => openPaymentDialog()}>
            <HandCoins data-icon="inline-start" /> Registrar abono
          </Button>
          <Button onClick={openInvoiceDialog}>
            <FilePlus2 data-icon="inline-start" /> Nueva factura
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Total comprado</CardDescription><CardTitle>{money(totals.purchased)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Deuda pendiente</CardDescription><CardTitle>{money(totals.pending)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Abonos registrados</CardDescription><CardTitle>{money(totals.paid)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar por factura, proveedor o nota" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={filterSupplierId} onValueChange={setFilterSupplierId}>
            <SelectTrigger className="sm:w-56"><SelectValue placeholder="Proveedor" /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="all">Todos los proveedores</SelectItem>
              {suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(value: StatusFilter) => setFilterStatus(value)}>
            <SelectTrigger className="sm:w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="parcial">Abonada</SelectItem>
              <SelectItem value="pagado">Pagada</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
          <Select value={filterKind} onValueChange={(value: "all" | PurchaseKind) => setFilterKind(value)}>
            <SelectTrigger className="sm:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="all">Todos los tipos</SelectItem>
              <SelectItem value="piezas">Piezas</SelectItem>
              <SelectItem value="productos">Productos</SelectItem>
              <SelectItem value="otros">Otros / Gastos</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Facturas</TabsTrigger>
          <TabsTrigger value="payments">Abonos</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle>Historial de compras</CardTitle>
              <CardDescription>Todas las facturas registradas, de más reciente a más antigua.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="text-center">Adjunto</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.invoiceNumber}</TableCell>
                      <TableCell>{purchase.supplierName}</TableCell>
                      <TableCell>{formatDate(purchase.date)}</TableCell>
                      <TableCell><Badge variant="outline">{kindLabel(purchase.purchaseKind)}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {statusBadge(purchase)}
                          {isOverdue(purchase) && (
                            <span className="flex items-center gap-1 text-xs text-red-500">
                              <AlertTriangle className="h-3 w-3" /> Vencida ({formatDate(purchase.dueDate)})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{money(purchase.total)}</TableCell>
                      <TableCell className="text-right">{money(Math.max(0, purchase.total - purchase.amountPaid))}</TableCell>
                      <TableCell className="text-center">
                        {purchase.attachmentUrl ? (
                          <a href={purchase.attachmentUrl} target="_blank" rel="noreferrer" title="Ver factura adjunta">
                            <Paperclip className="mx-auto h-4 w-4 text-primary" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => setDetailPurchase(purchase)}>Ver</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredPurchases.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No hay facturas registradas.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Historial de abonos</CardTitle>
              <CardDescription>Pagos a proveedores; un mismo abono puede repartirse entre varias facturas pendientes.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Factura relacionada</TableHead>
                    <TableHead className="text-right">Abono</TableHead>
                    <TableHead className="text-right">Saldo restante</TableHead>
                    <TableHead className="text-center">Comprobante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => {
                    const purchase = purchases.find((item) => item.id === payment.purchaseId)
                    return (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.date)}</TableCell>
                        <TableCell>{suppliers.find((item) => item.id === payment.supplierId)?.name || "Proveedor"}</TableCell>
                        <TableCell>{purchase?.invoiceNumber || "Abono general"}</TableCell>
                        <TableCell className="text-right">{money(payment.amount)}</TableCell>
                        <TableCell className="text-right font-medium">{money(payment.remainingDebt)}</TableCell>
                        <TableCell className="text-center">
                          {payment.attachmentUrl ? (
                            <a href={payment.attachmentUrl} target="_blank" rel="noreferrer" title="Ver comprobante">
                              <Paperclip className="mx-auto h-4 w-4 text-primary" />
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {filteredPayments.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No hay abonos registrados.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- Diálogo: nueva factura ---------- */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-[95vw] overflow-y-auto sm:w-[90vw] sm:max-w-[85vw] lg:max-w-5xl">
          <DialogHeader><DialogTitle>Registrar factura de compra</DialogTitle></DialogHeader>

          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>Proveedor</FieldLabel>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Tipo de compra</FieldLabel>
                <Select value={purchaseKind} onValueChange={(value: PurchaseKind) => changeKind(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="productos">Productos (entra a inventario)</SelectItem>
                    <SelectItem value="piezas">Piezas / repuestos</SelectItem>
                    <SelectItem value="otros">Otros gastos</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Condición</FieldLabel>
                <Select value={paymentType} onValueChange={(value: "contado" | "credito") => setPaymentType(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="contado">En efectivo</SelectItem>
                    <SelectItem value="credito">A crédito (o mixto)</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </div>
            {purchaseKind === "productos" && (
              <Field>
                <FieldLabel>Destino del inventario</FieldLabel>
                <Select value={destination} onValueChange={(value: Destination) => { setDestination(value); setLines([emptyLine("productos")]) }}>
                  <SelectTrigger className="md:w-64"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="products">Productos</SelectItem>
                    <SelectItem value="armacen">Almacén</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            )}
          </FieldGroup>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{purchaseKind === "productos" ? "Productos comprados" : "Conceptos de la factura"}</h3>
                <p className="text-sm text-muted-foreground">
                  {purchaseKind === "productos" ? "Selecciona uno existente o crea uno nuevo." : "Describe cada concepto; no se crean productos de inventario."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine(purchaseKind)])}>
                <Plus data-icon="inline-start" /> Agregar línea
              </Button>
            </div>

            {lines.map((line, index) => (
              <Card key={line.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{purchaseKind === "productos" ? `Producto ${index + 1}` : `Concepto ${index + 1}`}</CardTitle>
                    <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>
                      <Trash2 /><span className="sr-only">Eliminar línea</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {purchaseKind === "productos" ? (
                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <Label>Tipo</Label>
                        <Select value={line.mode} onValueChange={(value: "existing" | "new") => updateLine(line.id, { mode: value, productId: "", name: "" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectGroup>
                            <SelectItem value="existing">Producto existente</SelectItem>
                            <SelectItem value="new">Producto nuevo</SelectItem>
                          </SelectGroup></SelectContent>
                        </Select>
                      </div>
                      {line.mode === "existing" ? (
                        <div className="md:col-span-2">
                          <Label>Producto</Label>
                          <Select value={line.productId} onValueChange={(value) => chooseExistingProduct(line.id, value)}>
                            <SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger>
                            <SelectContent><SelectGroup>
                              {availableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · stock {product.stock}</SelectItem>)}
                            </SelectGroup></SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <>
                          <div><Label>Nombre</Label><Input value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value })} /></div>
                          <div><Label>SKU</Label><Input value={line.sku} onChange={(event) => updateLine(line.id, { sku: event.target.value })} /></div>
                        </>
                      )}
                      <div><Label>Cantidad</Label><Input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} /></div>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="md:col-span-2"><Label>Concepto / descripción</Label><Input placeholder="Ej: Pantalla iPhone 12 Pro Max, envío, cargador..." value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value })} /></div>
                      <div><Label>Cantidad</Label><Input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} /></div>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div><Label>Costo unitario</Label><Input type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) })} /></div>
                    {purchaseKind === "productos" && line.mode === "new" && (
                      <>
                        <div><Label>Precio venta</Label><Input type="number" min="0" value={line.sellPrice} onChange={(event) => updateLine(line.id, { sellPrice: Number(event.target.value) })} /></div>
                        {destination === "armacen" && <div><Label>Número de caja</Label><Input value={line.boxNumber} onChange={(event) => updateLine(line.id, { boxNumber: event.target.value })} /></div>}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {paymentType === "credito" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Abono inicial (deja en 0 si es 100% a crédito)</Label><Input type="number" min="0" max={subtotal} value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} /></div>
              <div><Label>Fecha límite / vencimiento</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div>
            </div>
          )}

          <div><Label>Notas</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalles opcionales de la factura" /></div>

          <div className="w-full overflow-hidden rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2"><Receipt className="size-4" /><h4 className="text-sm font-medium tracking-tight">Resumen de factura</h4></div>
            <div className="mt-3 grid w-full gap-2 md:grid-cols-3">
              <div className="w-full rounded-lg border bg-muted/40 p-3 text-left"><p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">Total</p><p className="mt-1 text-sm font-semibold text-foreground sm:text-base">{money(subtotal)}</p></div>
              <div className="w-full rounded-lg border bg-muted/40 p-3 text-left"><p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">Pagado</p><p className="mt-1 text-sm font-semibold text-foreground sm:text-base">{money(effectivePaid)}</p></div>
              <div className="w-full rounded-lg border bg-muted/40 p-3 text-left"><p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">Quedará debiendo</p><p className="mt-1 text-sm font-semibold text-foreground sm:text-base">{money(debtCreated)}</p></div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancelar</Button>
            <Button onClick={saveInvoice} disabled={saving}><PackagePlus data-icon="inline-start" /> {saving ? "Guardando..." : "Registrar factura"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Diálogo: registrar abono ---------- */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Registrar abono a proveedor</DialogTitle></DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Proveedor</FieldLabel>
              <Select value={paymentSupplierId} onValueChange={(value) => { setPaymentSupplierId(value); setPaymentPurchaseId("auto") }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · debe {money(supplier.debt)}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>

            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Factura a pagar</p>
                <p className="text-xs text-muted-foreground">Elige una factura específica o deja la opción automática: se reparte primero en las facturas más antiguas, como un estado de cuenta.</p>
              </div>
              <div className="mt-3">
                <Select value={paymentPurchaseId} onValueChange={setPaymentPurchaseId} disabled={pendingPurchases.length === 0}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={pendingPurchases.length > 0 ? "Selecciona una factura" : "No hay facturas pendientes"} /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="auto">Automático: factura(s) más antigua(s)</SelectItem>
                    {pendingPurchases.map((purchase) => (
                      <SelectItem key={purchase.id} value={purchase.id}>
                        {purchase.invoiceNumber} · {formatDate(purchase.date)} · pendiente {money(purchase.total - purchase.amountPaid)}
                      </SelectItem>
                    ))}
                  </SelectGroup></SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel>Monto del abono</FieldLabel><Input type="number" min="0" max={paymentSupplier?.debt || 0} value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} /></Field>
              <Field>
                <FieldLabel>Método</FieldLabel>
                <Select value={paymentMethod} onValueChange={(value: "cash" | "card" | "transfer") => setPaymentMethod(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </div>

            <Field><FieldLabel>Nota</FieldLabel><Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></Field>

            <div className="space-y-2">
              <Label className="flex items-center gap-1"><UploadCloud className="h-4 w-4" /> Comprobante de pago (opcional)</Label>
              <Input
                type="file"
                accept="application/pdf,image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null
                  if (file && !isValidPurchaseAttachment(file)) {
                    toast({ title: "Archivo no válido", description: "Solo se permiten PDF o imágenes.", variant: "destructive" })
                    event.target.value = ""
                    setPaymentFile(null)
                    return
                  }
                  setPaymentFile(file)
                }}
              />
              {paymentFile && <p className="text-xs text-muted-foreground">Seleccionado: {paymentFile.name}</p>}
            </div>
          </FieldGroup>

          {paymentSupplier && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deuda anterior</p><p className="mt-1 text-sm font-semibold text-foreground">{money(paymentSupplier.debt)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Abono</p><p className="mt-1 text-sm font-semibold text-foreground">{money(paymentAmount)}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Restante</p><p className="mt-1 text-sm font-semibold text-foreground">{money(Math.max(0, paymentSupplier.debt - paymentAmount))}</p></CardContent></Card>
              </div>
              {paymentPreview.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Distribución entre facturas</p>
                  <div className="mt-2 flex flex-col gap-1 text-sm">
                    {paymentPreview.map(({ purchase, applied }) => <span key={purchase.id}>{purchase.invoiceNumber}: {money(applied)}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button>
            <Button onClick={savePayment} disabled={saving}><HandCoins data-icon="inline-start" /> {saving ? "Guardando..." : "Registrar abono"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Diálogo: detalle de factura ---------- */}
      <Dialog open={Boolean(detailPurchase)} onOpenChange={(open) => !open && setDetailPurchase(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{detailPurchase?.invoiceNumber}</DialogTitle></DialogHeader>
          {detailPurchase && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="text-muted-foreground">Proveedor:</span> {detailPurchase.supplierName}</p>
                <p><span className="text-muted-foreground">Fecha:</span> {formatDate(detailPurchase.date)}</p>
                <p><span className="text-muted-foreground">Tipo:</span> {kindLabel(detailPurchase.purchaseKind)}</p>
                <p><span className="text-muted-foreground">Condición:</span> {detailPurchase.paymentType === "credito" ? "Crédito" : "Contado"}</p>
                {detailPurchase.dueDate && <p><span className="text-muted-foreground">Vence:</span> {formatDate(detailPurchase.dueDate)}</p>}
                <p><span className="text-muted-foreground">Estado:</span> {statusBadge(detailPurchase)}</p>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Costo</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detailPurchase.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">{money(item.unitPrice)}</TableCell>
                      <TableCell className="text-right">{money(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end gap-6 text-sm">
                <p><span className="text-muted-foreground">Total:</span> {money(detailPurchase.total)}</p>
                <p><span className="text-muted-foreground">Pagado:</span> {money(detailPurchase.amountPaid)}</p>
                <p><span className="text-muted-foreground">Pendiente:</span> {money(Math.max(0, detailPurchase.total - detailPurchase.amountPaid))}</p>
              </div>
              {detailPurchase.notes && <p className="text-sm text-muted-foreground">Notas: {detailPurchase.notes}</p>}
              {detailPurchase.attachmentUrl ? (
                <Button variant="outline" asChild>
                  <a href={detailPurchase.attachmentUrl} target="_blank" rel="noreferrer"><Paperclip data-icon="inline-start" /> Ver factura adjunta</a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Esta factura no tiene documento adjunto.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
