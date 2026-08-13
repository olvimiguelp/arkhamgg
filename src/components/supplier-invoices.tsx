"use client"

import { useMemo, useState } from "react"
import { FilePlus2, HandCoins, PackagePlus, Plus, ReceiptText, Trash2 } from "lucide-react"
import { useStore, type PurchaseItem, type Supplier } from "@/components/store-context"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

const money = (value: number) => `RD$ ${value.toLocaleString("es-DO", { minimumFractionDigits: 2 })}`

type Destination = "products" | "armacen"
type InvoiceFilter = "all" | "credit" | "cash" | "paid"
type Line = {
  id: string
  mode: "existing" | "new"
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

const emptyLine = (): Line => ({
  id: crypto.randomUUID(), mode: "existing", productId: "", name: "", sku: "", category: "General",
  boxNumber: "", quantity: 1, unitPrice: 0, wholesalePrice: 0, sellPrice: 0,
})

export function SupplierInvoices({ supplierId }: { supplierId?: string }) {
  const { suppliers, products, purchases, supplierPayments, addPurchase, addSupplierPayment, addProduct } = useStore()
  const { toast } = useToast()
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [viewedSupplierId, setViewedSupplierId] = useState(supplierId || "")
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>("all")
  const [selectedSupplierId, setSelectedSupplierId] = useState(supplierId || "")
  const [destination, setDestination] = useState<Destination>("products")
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado")
  const [amountPaid, setAmountPaid] = useState(0)
  const [dueDate, setDueDate] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [paymentSupplierId, setPaymentSupplierId] = useState(supplierId || "")
  const [paymentPurchaseId, setPaymentPurchaseId] = useState("auto")
  const [paymentAmount, setPaymentAmount] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash")
  const [paymentNote, setPaymentNote] = useState("")
  const [saving, setSaving] = useState(false)

  const activeSupplierId = supplierId || viewedSupplierId
  const visibleSuppliers = supplierId ? suppliers.filter((item) => item.id === supplierId) : suppliers
  const supplierPurchases = purchases
    .filter((item) => Boolean(activeSupplierId) && item.supplierId === activeSupplierId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const visiblePurchases = supplierPurchases.filter((purchase) => {
    if (invoiceFilter === "credit") return purchase.paymentType === "credito"
    if (invoiceFilter === "cash") return purchase.paymentType === "contado"
    if (invoiceFilter === "paid") return purchase.paymentType === "credito" && purchase.amountPaid > 0
    return true
  })
  const visiblePayments = supplierPayments
    .filter((item) => Boolean(activeSupplierId) && item.supplierId === activeSupplierId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const selectedSupplier = suppliers.find((item) => item.id === selectedSupplierId)
  const paymentSupplier = suppliers.find((item) => item.id === paymentSupplierId)
  const availableProducts = products.filter((product) => destination === "armacen" ? product.sourceTable === "armacen" : product.sourceTable !== "armacen")
  const pendingPurchases = purchases
    .filter((purchase) => purchase.supplierId === paymentSupplierId && purchase.total - purchase.amountPaid > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0)
  const effectivePaid = paymentType === "contado" ? subtotal : Math.min(subtotal, Math.max(0, amountPaid))
  const debtCreated = Math.max(0, subtotal - effectivePaid)

  const totals = useMemo(() => ({
    purchased: supplierPurchases.reduce((sum, item) => sum + item.total, 0),
    pending: supplierPurchases.reduce((sum, item) => sum + Math.max(0, item.total - item.amountPaid), 0),
    paid: visiblePayments.reduce((sum, item) => sum + item.amount, 0),
  }), [supplierPurchases, visiblePayments])

  const paymentPreview = useMemo(() => {
    const selectedPurchaseId = paymentPurchaseId === "auto" ? undefined : paymentPurchaseId
    const preferred = selectedPurchaseId
      ? pendingPurchases.find((purchase) => purchase.id === selectedPurchaseId)
      : undefined
    const allocationOrder = preferred
      ? [preferred, ...pendingPurchases.filter((purchase) => purchase.id !== preferred.id)]
      : pendingPurchases
    let remaining = Math.max(0, paymentAmount)

    return allocationOrder.flatMap((purchase) => {
      if (remaining <= 0) return []
      const applied = Math.min(remaining, Math.max(0, purchase.total - purchase.amountPaid))
      remaining -= applied
      return applied > 0 ? [{ purchase, applied }] : []
    })
  }, [paymentAmount, paymentPurchaseId, pendingPurchases])

  const updateLine = (id: string, patch: Partial<Line>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line))

  const chooseExistingProduct = (lineId: string, productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    updateLine(lineId, {
      productId, name: product.name, sku: product.sku, category: product.category,
      boxNumber: product.boxNumber || "", unitPrice: product.buyPrice,
      wholesalePrice: product.wholesalePrice, sellPrice: product.sellPrice,
    })
  }

  const resetInvoice = () => {
    setSelectedSupplierId(supplierId || "")
    setDestination("products")
    setPaymentType("contado")
    setAmountPaid(0)
    setDueDate("")
    setNotes("")
    setLines([emptyLine()])
  }

  const saveInvoice = async () => {
    if (!selectedSupplier || lines.length === 0 || lines.some((line) => !line.name.trim() || line.quantity <= 0 || line.unitPrice < 0 || (line.mode === "existing" && !line.productId))) {
      toast({ title: "Datos incompletos", description: "Selecciona el proveedor y completa todos los productos de la factura.", variant: "destructive" })
      return
    }
    if (paymentType === "credito" && effectivePaid > subtotal) return
    setSaving(true)
    try {
      const purchaseItems: PurchaseItem[] = []
      for (const line of lines) {
        if (line.mode === "new") {
          const temporaryId = `new-${line.id}`
          await addProduct({
            sourceTable: destination === "armacen" ? "armacen" : "products",
            sku: line.sku.trim() || `COMP-${Date.now()}`,
            name: line.name.trim(), category: destination === "armacen" ? "Almacen" : line.category.trim() || "General",
            boxNumber: destination === "armacen" ? line.boxNumber.trim() || "1" : undefined,
            stock: line.quantity, minStock: 1, buyPrice: line.unitPrice,
            wholesalePrice: line.wholesalePrice || line.sellPrice, sellPrice: line.sellPrice || line.unitPrice,
            supplier: selectedSupplier.id,
          })
          purchaseItems.push({ id: line.id, productId: temporaryId, productName: line.name.trim(), quantity: line.quantity, unitPrice: line.unitPrice, total: line.quantity * line.unitPrice })
        } else {
          purchaseItems.push({ id: line.id, productId: line.productId, productName: line.name, quantity: line.quantity, unitPrice: line.unitPrice, total: line.quantity * line.unitPrice })
        }
      }
      const purchase = await addPurchase({
        supplierId: selectedSupplier.id, supplierName: selectedSupplier.name, items: purchaseItems,
        subtotal, tax: 0, total: subtotal, paymentType,
        paymentMethod: "cash", amountPaid: effectivePaid,
        dueDate: paymentType === "credito" ? dueDate || undefined : undefined,
        status: debtCreated <= 0 ? "pagado" : effectivePaid > 0 ? "parcial" : "pendiente",
        notes: `[Destino: ${destination === "armacen" ? "Almacén" : "Productos"}]${notes ? ` ${notes}` : ""}`,
      })
      toast({ title: "Factura registrada", description: `${purchase.invoiceNumber} guardada. ${debtCreated > 0 ? `Deuda creada: ${money(debtCreated)}.` : "Pagada en efectivo."}` })
      setInvoiceOpen(false)
      resetInvoice()
    } catch {
      toast({ title: "No se pudo registrar", description: "Revisa la conexión y vuelve a intentarlo.", variant: "destructive" })
    } finally { setSaving(false) }
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
      await addSupplierPayment({
        supplierId: paymentSupplier.id,
        purchaseId: paymentPurchaseId === "auto" ? undefined : paymentPurchaseId,
        amount: paymentAmount,
        paymentMethod,
        note: paymentNote || undefined,
      })
      toast({ title: "Abono registrado", description: `Saldo restante con ${paymentSupplier.name}: ${money(Math.max(0, paymentSupplier.debt - paymentAmount))}.` })
      setPaymentOpen(false); setPaymentAmount(0); setPaymentPurchaseId("auto"); setPaymentNote("")
    } catch {
      toast({ title: "No se pudo registrar el abono", variant: "destructive" })
    } finally { setSaving(false) }
  }

  const statusBadge = (status: string) => status === "pagado" ? <Badge>Pagada</Badge> : status === "parcial" ? <Badge variant="secondary">Abonada</Badge> : <Badge variant="destructive">Pendiente</Badge>

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div><h2 className="text-2xl font-bold tracking-tight">Facturas de proveedores</h2><p className="text-sm text-muted-foreground">Consulta las facturas y aplica abonos al proveedor seleccionado.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" disabled={!activeSupplierId} onClick={() => { setPaymentSupplierId(activeSupplierId); setPaymentOpen(true) }}><HandCoins data-icon="inline-start" /> Registrar abono</Button>
          {!supplierId && <Button onClick={() => { setSelectedSupplierId(activeSupplierId); setInvoiceOpen(true) }}><FilePlus2 data-icon="inline-start" /> Nueva factura</Button>}
        </div>
      </div>

      {!supplierId && <Card><CardHeader><CardTitle>Proveedor</CardTitle><CardDescription>Selecciona un proveedor para ver únicamente sus facturas y abonos.</CardDescription></CardHeader><CardContent><Select value={viewedSupplierId} onValueChange={(value) => { setViewedSupplierId(value); setSelectedSupplierId(value); setPaymentSupplierId(value); setPaymentPurchaseId("none"); setInvoiceFilter("all") }}><SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger><SelectContent><SelectGroup>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · debe {money(supplier.debt)}</SelectItem>)}</SelectGroup></SelectContent></Select></CardContent></Card>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>Total comprado</CardDescription><CardTitle>{money(totals.purchased)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Deuda en facturas</CardDescription><CardTitle>{money(totals.pending)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Abonos registrados</CardDescription><CardTitle>{money(totals.paid)}</CardTitle></CardHeader></Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList><TabsTrigger value="invoices">Facturas</TabsTrigger><TabsTrigger value="payments">Abonos</TabsTrigger></TabsList>
        <TabsContent value="invoices">
          <Card><CardHeader><CardTitle>Historial de compras</CardTitle><CardDescription>{activeSupplierId ? "Facturas del proveedor seleccionado, ordenadas desde la más antigua." : "Selecciona un proveedor para consultar sus facturas."}</CardDescription>{activeSupplierId && <ToggleGroup type="single" value={invoiceFilter} onValueChange={(value) => value && setInvoiceFilter(value as InvoiceFilter)} variant="outline" className="flex flex-wrap justify-start"><ToggleGroupItem value="all">Todas</ToggleGroupItem><ToggleGroupItem value="credit">A crédito</ToggleGroupItem><ToggleGroupItem value="cash">en efectivo</ToggleGroupItem><ToggleGroupItem value="paid">Abonadas</ToggleGroupItem></ToggleGroup>}</CardHeader><CardContent className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Factura</TableHead><TableHead>Proveedor</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Pendiente</TableHead></TableRow></TableHeader>
              <TableBody>{visiblePurchases.map((purchase) => <TableRow key={purchase.id}><TableCell className="font-medium">{purchase.invoiceNumber}</TableCell><TableCell>{purchase.supplierName}</TableCell><TableCell>{new Date(purchase.date).toLocaleDateString("es-DO")}</TableCell><TableCell>{statusBadge(purchase.status)}</TableCell><TableCell className="text-right">{money(purchase.total)}</TableCell><TableCell className="text-right">{money(Math.max(0, purchase.total - purchase.amountPaid))}</TableCell></TableRow>)}
              {visiblePurchases.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No hay facturas registradas.</TableCell></TableRow>}</TableBody></Table>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="payments">
          <Card><CardHeader><CardTitle>Historial de abonos</CardTitle><CardDescription>Movimientos separados que reducen la deuda del proveedor.</CardDescription></CardHeader><CardContent className="overflow-x-auto">
            <Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Factura relacionada</TableHead><TableHead className="text-right">Abono</TableHead><TableHead className="text-right">Saldo restante</TableHead></TableRow></TableHeader>
              <TableBody>{visiblePayments.map((payment) => { const supplier = suppliers.find((item) => item.id === payment.supplierId); const purchase = purchases.find((item) => item.id === payment.purchaseId); return <TableRow key={payment.id}><TableCell>{new Date(payment.date).toLocaleDateString("es-DO")}</TableCell><TableCell>{supplier?.name || "Proveedor"}</TableCell><TableCell>{purchase?.invoiceNumber || "Abono general"}</TableCell><TableCell className="text-right">{money(payment.amount)}</TableCell><TableCell className="text-right font-medium">{money(payment.remainingDebt)}</TableCell></TableRow> })}
              {visiblePayments.length === 0 && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No hay abonos registrados.</TableCell></TableRow>}</TableBody></Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}><DialogContent className="max-h-[92vh] w-[95vw] max-w-[95vw] sm:w-[90vw] sm:max-w-[85vw] lg:max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>Registrar factura de compra</DialogTitle></DialogHeader>
        <FieldGroup><div className="grid gap-4 md:grid-cols-3"><Field><FieldLabel>Proveedor</FieldLabel><Select value={selectedSupplierId} onValueChange={setSelectedSupplierId} disabled={Boolean(supplierId)}><SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger><SelectContent><SelectGroup>{visibleSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>Destino del inventario</FieldLabel><Select value={destination} onValueChange={(value: Destination) => { setDestination(value); setLines([emptyLine()]) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="products">Productos</SelectItem><SelectItem value="armacen">Almacén</SelectItem></SelectGroup></SelectContent></Select></Field>
        <Field><FieldLabel>Condición</FieldLabel><Select value={paymentType} onValueChange={(value: "contado" | "credito") => setPaymentType(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="contado">en efectivo</SelectItem><SelectItem value="credito">Compra a crédito</SelectItem></SelectGroup></SelectContent></Select></Field></div></FieldGroup>
        <div className="flex flex-col gap-3"><div className="flex items-center justify-between"><div><h3 className="font-semibold">Productos comprados</h3><p className="text-sm text-muted-foreground">Selecciona uno existente o crea uno nuevo.</p></div><Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyLine()])}><Plus data-icon="inline-start" /> Agregar línea</Button></div>
          {lines.map((line, index) => <Card key={line.id}><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="text-base">Producto {index + 1}</CardTitle><Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 /><span className="sr-only">Eliminar producto</span></Button></div></CardHeader><CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-4"><div><Label>Tipo</Label><Select value={line.mode} onValueChange={(value: "existing" | "new") => updateLine(line.id, { mode: value, productId: "", name: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="existing">Producto existente</SelectItem><SelectItem value="new">Producto nuevo</SelectItem></SelectGroup></SelectContent></Select></div>
            {line.mode === "existing" ? <div className="md:col-span-2"><Label>Producto</Label><Select value={line.productId} onValueChange={(value) => chooseExistingProduct(line.id, value)}><SelectTrigger><SelectValue placeholder="Seleccionar producto" /></SelectTrigger><SelectContent><SelectGroup>{availableProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.name} · stock {product.stock}</SelectItem>)}</SelectGroup></SelectContent></Select></div> : <><div><Label>Nombre</Label><Input value={line.name} onChange={(event) => updateLine(line.id, { name: event.target.value })} /></div><div><Label>SKU</Label><Input value={line.sku} onChange={(event) => updateLine(line.id, { sku: event.target.value })} /></div></>}
            <div><Label>Cantidad</Label><Input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} /></div></div>
            <div className="grid gap-4 sm:grid-cols-3"><div><Label>Costo unitario</Label><Input type="number" min="0" value={line.unitPrice} onChange={(event) => updateLine(line.id, { unitPrice: Number(event.target.value) })} /></div>{line.mode === "new" && <><div><Label>Precio venta</Label><Input type="number" min="0" value={line.sellPrice} onChange={(event) => updateLine(line.id, { sellPrice: Number(event.target.value) })} /></div>{destination === "armacen" && <div><Label>Número de caja</Label><Input value={line.boxNumber} onChange={(event) => updateLine(line.id, { boxNumber: event.target.value })} /></div>}</>}</div>
          </CardContent></Card>)}
        </div>
        {paymentType === "credito" && <div className="grid gap-4 sm:grid-cols-2"><div><Label>Abono inicial</Label><Input type="number" min="0" max={subtotal} value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} /></div><div><Label>Fecha límite</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div>}
        <div><Label>Notas</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Detalles opcionales de la factura" /></div>
        <div className="w-full overflow-hidden rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4" />
            <h4 className="text-sm font-medium tracking-tight">Resumen de factura</h4>
          </div>
          <div className="mt-3 grid w-full gap-2 md:grid-cols-3">
            <div className="w-full rounded-lg border bg-muted/40 p-3 text-left">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">Total</p>
              <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">{money(subtotal)}</p>
            </div>
            <div className="w-full rounded-lg border bg-muted/40 p-3 text-left">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">Pagado</p>
              <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">{money(effectivePaid)}</p>
            </div>
            <div className="w-full rounded-lg border bg-muted/40 p-3 text-left">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground sm:text-xs">Quedará debiendo</p>
              <p className="mt-1 text-sm font-semibold text-foreground sm:text-base">{money(debtCreated)}</p>
            </div>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setInvoiceOpen(false)}>Cancelar</Button><Button onClick={saveInvoice} disabled={saving}><PackagePlus data-icon="inline-start" /> {saving ? "Guardando..." : "Registrar factura"}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}><DialogContent><DialogHeader><DialogTitle>Registrar abono a proveedor</DialogTitle></DialogHeader><FieldGroup>
        <Field><FieldLabel>Proveedor</FieldLabel><Select value={paymentSupplierId} onValueChange={(value) => { setPaymentSupplierId(value); setPaymentPurchaseId("auto") }} disabled={Boolean(supplierId)}><SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger><SelectContent><SelectGroup>{visibleSuppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} · debe {money(supplier.debt)}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        <div className="rounded-lg border bg-muted/30 p-3"><div className="flex flex-col gap-2"><p className="text-sm font-medium">Factura a pagar</p><p className="text-xs text-muted-foreground">Elige una factura específica o deja la opción automática para usar la más antigua.</p></div><div className="mt-3"><Select value={paymentPurchaseId} onValueChange={setPaymentPurchaseId} disabled={pendingPurchases.length === 0}><SelectTrigger className="w-full"><SelectValue placeholder={pendingPurchases.length > 0 ? "Selecciona una factura" : "No hay facturas pendientes"} /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="auto">Automático: factura más antigua</SelectItem>{pendingPurchases.map((purchase) => <SelectItem key={purchase.id} value={purchase.id}>{purchase.invoiceNumber} · {new Date(purchase.date).toLocaleString("es-DO")} · pendiente {money(purchase.total - purchase.amountPaid)}</SelectItem>)}</SelectGroup></SelectContent></Select></div></div>
        <div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel>Monto del abono</FieldLabel><Input type="number" min="0" max={paymentSupplier?.debt || 0} value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} /></Field><Field><FieldLabel>Método</FieldLabel><Select value={paymentMethod} onValueChange={(value: "cash" | "card" | "transfer") => setPaymentMethod(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="cash">Efectivo</SelectItem><SelectItem value="card">Tarjeta</SelectItem><SelectItem value="transfer">Transferencia</SelectItem></SelectGroup></SelectContent></Select></Field></div>
        <Field><FieldLabel>Nota</FieldLabel><Textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} /></Field>
      </FieldGroup>{paymentSupplier && <div className="flex flex-col gap-3"><div className="grid gap-3 md:grid-cols-3"><Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deuda anterior</p><p className="mt-1 text-sm font-semibold text-foreground">{money(paymentSupplier.debt)}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Abono</p><p className="mt-1 text-sm font-semibold text-foreground">{money(paymentAmount)}</p></CardContent></Card><Card><CardContent className="p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Restante</p><p className="mt-1 text-sm font-semibold text-foreground">{money(Math.max(0, paymentSupplier.debt - paymentAmount))}</p></CardContent></Card></div>{paymentPreview.length > 0 && <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Distribución</p><div className="mt-2 flex flex-col gap-1 text-sm">{paymentPreview.map(({ purchase, applied }) => <span key={purchase.id}>{purchase.invoiceNumber}: {money(applied)}</span>)}</div></div>}</div>}
      <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancelar</Button><Button onClick={savePayment} disabled={saving}><HandCoins data-icon="inline-start" /> {saving ? "Guardando..." : "Registrar abono"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  )
}
