import { useEffect, useMemo, useState } from "react"
import { Loader2, Search, UserPlus, Users, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import ProductGrid, { type PGItem } from "@/components/ProductGrid"
import { useStore, type CartItem } from "@/components/store-context"
import { buildSourceRuntimeId } from "@/lib/transaction-classification"

type PaymentMethod = "cash" | "card" | "transfer" | "credit"
type CustomerMode = "new" | "import"

export function AlmacenSaleDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const { customers, createAlmacenSale } = useStore()

  const [loadingProducts, setLoadingProducts] = useState(false)
  const [products, setProducts] = useState<PGItem[]>([])
  const [search, setSearch] = useState("")

  const [cart, setCart] = useState<Array<PGItem & { quantity: number }>>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash")
  const [amountPaid, setAmountPaid] = useState("")

  const [customerMode, setCustomerMode] = useState<CustomerMode>("new")
  const [importCustomerId, setImportCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")

  const [isSaving, setIsSaving] = useState(false)

  const total = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.sellPrice) || 0) * item.quantity, 0)
  }, [cart])

  const parsedPaid = useMemo(() => {
    const n = Number.parseFloat(amountPaid)
    return Number.isFinite(n) ? Math.max(0, n) : 0
  }, [amountPaid])

  const creditAmount = useMemo(() => {
    if (paymentMethod === "credit") return total
    return Math.max(0, total - Math.min(total, parsedPaid))
  }, [paymentMethod, parsedPaid, total])

  const importedCustomer = useMemo(() => {
    return customers.find((c) => c.id === importCustomerId)
  }, [customers, importCustomerId])

  useEffect(() => {
    if (!open) return
    setSearch("")
    setLoadingProducts(true)
    const supabase = createClient()
    supabase
      .from("armacen")
      .select("id, sku, name, category, box_number, stock, min_stock, buy_price, sell_price, supplier, capacity, imei")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error loading armacen products:", error)
          toast({
            title: "Error",
            description: "No se pudo cargar armacen. Verifica que exista la tabla y las politicas RLS.",
            variant: "destructive",
          })
          setProducts([])
          return
        }
        const mapped: PGItem[] = (data || []).map((row: any) => ({
          id: buildSourceRuntimeId("armacen", row.id),
          sourceTable: "armacen",
          sourceId: String(row.id),
          sku: row.sku || "",
          name: row.name || "",
          category: row.category || "",
          boxNumber: row.box_number || "",
          stock: Number(row.stock) || 0,
          sellPrice: Number(row.sell_price) || 0,
          capacity: row.capacity || undefined,
          imei: row.imei || undefined,
          // Extra fields kept via casting when building CartItem
          // minStock/buyPrice/supplier are fetched but stored in original row in memory if needed later.
        }))
        setProducts(mapped)
      })
      .finally(() => setLoadingProducts(false))
  }, [open, toast])

  useEffect(() => {
    if (!open) return
    // Reset payment defaults when opening
    setPaymentMethod("cash")
    setAmountPaid("")
    setCustomerMode("new")
    setImportCustomerId("")
    setCustomerName("")
    setCustomerPhone("")
    setCart([])
  }, [open])

  useEffect(() => {
    if (paymentMethod === "credit") {
      setAmountPaid("")
    } else if (total > 0) {
      // Keep it user-editable, but default to full amount.
      setAmountPaid(String(total))
    }
  }, [paymentMethod, total])

  useEffect(() => {
    if (customerMode !== "import") return
    if (!importedCustomer) return
    setCustomerName(importedCustomer.name || "")
    setCustomerPhone(importedCustomer.phone || "")
  }, [customerMode, importedCustomer])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => {
      const name = (p.name || "").toLowerCase()
      const sku = (p.sku || "").toLowerCase()
      const box = (p.boxNumber || "").toLowerCase()
      return name.includes(q) || sku.includes(q) || box.includes(q)
    })
  }, [products, search])

  const addToCart = (product: PGItem) => {
    const available = Number(product.stock) || 0
    if (available <= 0) {
      toast({ title: "Sin inventario", description: "Este producto no tiene stock en almacen.", variant: "destructive" })
      return
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        if (existing.quantity >= available) {
          toast({
            title: "Inventario insuficiente",
            description: `Solo hay ${available} unidades disponibles.`,
            variant: "destructive",
          })
          return prev
        }
        return prev.map((item) => (item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  const updateQuantity = (id: string, nextQuantity: number) => {
    setCart((prev) => {
      const item = prev.find((p) => p.id === id)
      if (!item) return prev
      const available = Number(item.stock) || 0
      const safeQty = Math.max(0, Math.min(available, nextQuantity))
      if (safeQty <= 0) return prev.filter((p) => p.id !== id)
      return prev.map((p) => (p.id === id ? { ...p, quantity: safeQty } : p))
    })
  }

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((p) => p.id !== id))

  const canSaveCredit = creditAmount > 0 ? Boolean(customerName.trim()) : true

  const handleConfirm = async () => {
    if (cart.length === 0) return

    if (creditAmount > 0 && !customerName.trim()) {
      toast({ title: "Falta el cliente", description: "Escribe o importa el nombre del cliente.", variant: "destructive" })
      return
    }

    if (customerMode === "import" && creditAmount > 0 && !importCustomerId) {
      toast({
        title: "Seleccione cliente",
        description: "Elija el cliente a importar desde /clientes.",
        variant: "destructive",
      })
      return
    }

    const paid = paymentMethod === "credit" ? 0 : parsedPaid

    // Build CartItems compatible with StoreContext/Sales table.
    const saleItems: CartItem[] = cart.map((item) => ({
      id: String(item.id),
      sourceTable: "armacen",
      sourceId: String(item.sourceId ?? item.id),
      sku: String(item.sku || ""),
      name: String(item.name || ""),
      category: String(item.category || ""),
      boxNumber: item.boxNumber ? String(item.boxNumber) : undefined,
      stock: Number(item.stock) || 0,
      minStock: 0,
      buyPrice: 0,
      wholesalePrice: 0,
      sellPrice: Number(item.sellPrice) || 0,
      minimumSellPrice: 0,
      supplier: "",
      capacity: item.capacity ? String(item.capacity) : undefined,
      imei: item.imei ? String(item.imei) : undefined,
      cartId: `${item.id}-${Math.random().toString(36).slice(2, 8)}`,
      quantity: item.quantity,
    }))

    setIsSaving(true)
    try {
      const result = await createAlmacenSale({
        items: saleItems,
        paymentMethod,
        amountPaid: paid,
        customerName: creditAmount > 0 ? customerName.trim() : undefined,
        customerPhone: creditAmount > 0 ? customerPhone.trim() : undefined,
        sourceCustomerId: customerMode === "import" && creditAmount > 0 ? importCustomerId : null,
      })

      if (!result?.success) {
        throw result?.error || new Error("No se pudo guardar la venta de almacen.")
      }

      toast({
        title: "Venta guardada",
        description: `Factura ${result.sale?.invoiceNumber || ""} registrada correctamente.`,
      })

      onOpenChange(false)
    } catch (err: any) {
      console.error("Error creating almacen sale:", err)
      toast({
        title: "Error",
        description: err?.message || "Ocurrio un error al guardar la venta.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nueva Venta de Almacen</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[420px_1fr]">
          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Carrito</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <div className="text-sm text-muted-foreground">Selecciona productos del armacen para agregarlos.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-[90px] text-right">Cant.</TableHead>
                      <TableHead className="w-[110px] text-right">Total</TableHead>
                      <TableHead className="w-[40px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="align-top">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.sku ? `SKU: ${item.sku}` : null}
                            {item.boxNumber ? `  |  Caja: ${item.boxNumber}` : null}
                          </div>
                          <div className="text-xs text-muted-foreground">Unit: ${formatCurrency(Number(item.sellPrice) || 0)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={String(item.quantity)}
                            type="number"
                            min={1}
                            max={Number(item.stock) || 0}
                            onChange={(e) => updateQuantity(item.id, Number.parseInt(e.target.value || "0", 10))}
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${formatCurrency((Number(item.sellPrice) || 0) * item.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeFromCart(item.id)} title="Quitar">
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              <div className="border-t pt-3 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold">${formatCurrency(total)}</span>
                </div>

                <div className="space-y-2">
                  <Label>Metodo de pago</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="transfer">Transferencia</SelectItem>
                      <SelectItem value="credit">Credito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {paymentMethod !== "credit" && (
                  <div className="space-y-2">
                    <Label>Monto pagado</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder={formatCurrency(total)}
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                    />
                  </div>
                )}

                {creditAmount > 0 && (
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Venta a credito</div>
                      <div className="text-sm text-red-600 font-bold">Faltante: ${formatCurrency(creditAmount)}</div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={customerMode === "new" ? "default" : "outline"}
                        className="flex-1 gap-2"
                        onClick={() => setCustomerMode("new")}
                      >
                        <UserPlus className="h-4 w-4" />
                        Nuevo cliente
                      </Button>
                      <Button
                        type="button"
                        variant={customerMode === "import" ? "default" : "outline"}
                        className="flex-1 gap-2"
                        onClick={() => setCustomerMode("import")}
                      >
                        <Users className="h-4 w-4" />
                        Importar desde /clientes
                      </Button>
                    </div>

                    {customerMode === "import" && (
                      <div className="space-y-2">
                        <Label>Cliente a importar</Label>
                        <Select value={importCustomerId} onValueChange={setImportCustomerId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione un cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} {c.phone ? `(${c.phone})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="text-xs text-muted-foreground">
                          Se guardara el enlace en `source_customer_id` dentro de `almacen_customer_accounts`.
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Nombre</Label>
                        <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre del cliente" />
                      </div>
                      <div className="space-y-2">
                        <Label>Telefono</Label>
                        <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Opcional" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Productos (armacen)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por caja, nombre o SKU..." className="pl-8" />
              </div>

              {loadingProducts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando armacen...
                </div>
              ) : (
                <div className="max-h-[65vh] overflow-y-auto pr-2">
                  <ProductGrid products={filteredProducts} onCardClick={addToCart} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSaving || cart.length === 0 || !canSaveCredit}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar venta"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
