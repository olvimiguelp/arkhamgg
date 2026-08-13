"use client"

import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, Plus, ShoppingCart, Receipt, CreditCard, FileText, Trash2, DollarSign, Loader2, ShoppingBasket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/lib/sidebar-context"
import { createClient } from "@/lib/supabase/client"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Sidebar, MENU_ITEMS } from "@/components/sidebar"
import { useStore, type ManualInvoiceItem, type CartItem } from "@/components/store-context"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { buildSourceRuntimeId } from "@/lib/transaction-classification"
import { NOMBRECONFI } from "@/nombreconfi"

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isOptionsOpen, setIsOptionsOpen] = useState(false)
  const { collapsed } = useSidebar()
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();
  const {
    onDialogOpen,
    currentTab,
    setCurrentTab,
    showManualInvoiceDialog,
    setShowManualInvoiceDialog,
    cart, // Add cart
    setCart, // Add setCart
    addExpense,
    currentUser,
    employees,
  } = useStore()
  const { toast } = useToast()

  const [manualItems, setManualItems] = useState<ManualInvoiceItem[]>([])
  // const [customerName, setCustomerName] = useState("") // Removed
  // const [customerPhone, setCustomerPhone] = useState("") // Removed
  // const [paymentMethod, setPaymentMethod] = useState("cash") // Removed
  // const [selectedCustomerId, setSelectedCustomerId] = useState("") // Removed
  const [newDescription, setNewDescription] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [newCost, setNewCost] = useState("")

  // Expense State
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [expenseDescription, setExpenseDescription] = useState("")
  const [expenseAmount, setExpenseAmount] = useState("")
  const [expenseCategory, setExpenseCategory] = useState("operativo")
  const [isRegisteringExpense, setIsRegisteringExpense] = useState(false)
  const [isAddingManualItems, setIsAddingManualItems] = useState(false)

  // Purchase from a customer (for example, receiving a phone as part of a sale)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [purchaseCustomerName, setPurchaseCustomerName] = useState("")
  const [purchaseDescription, setPurchaseDescription] = useState("")
  const [purchaseNotes, setPurchaseNotes] = useState("")
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [isRegisteringPurchase, setIsRegisteringPurchase] = useState(false)

  const currentItem = MENU_ITEMS.find((item) => item.to === pathname)
  const currentTitle = currentItem?.label || NOMBRECONFI.appName
  const currentSubtitle = currentItem?.subtitle
  const currentActionLabel = currentItem?.actionLabel
  const currentEmployee =
    currentUser?.role === "employee" ? employees.find((employee) => employee.email === currentUser.email) : null
  const canAddRecords = currentUser?.role === "admin" || Boolean(currentEmployee?.permissions.canAdd)

  const isWholesaleSalesPage = pathname.startsWith("/ventas-por-mayor")
  const isSalesPage = pathname.startsWith("/ventas") || isWholesaleSalesPage
  const isAlmacenCustomersPage = pathname.startsWith("/cliente-almacen")
  const shouldShowDebtPaymentAction = isSalesPage || isAlmacenCustomersPage
  const activeSalesRoute = isWholesaleSalesPage ? "/ventas-por-mayor" : "/ventas"

  const handleOpenDebtPaymentDialog = () => {
    const eventName = isAlmacenCustomersPage ? "open-almacen-payment-dialog" : "open-payment-dialog"
    window.dispatchEvent(new CustomEvent(eventName))
  }

  const addItem = () => {
    const price = Number.parseFloat(newPrice)
    const cost = Number.parseFloat(newCost) || 0

    if (!newDescription.trim() || !price || price <= 0) {
      toast({
        title: "Error",
        description: "Complete todos los campos correctamente",
        variant: "destructive",
      })
      return
    }

    const newItem: ManualInvoiceItem = {
      id: Math.random().toString(36).substr(2, 9),
      quantity: 1,
      description: newDescription.trim(),
      price: price,
      cost: cost,
    }

    setManualItems([...manualItems, newItem])
    setNewDescription("")
    setNewPrice("")
    setNewCost("")
  }

  const removeItem = (id: string) => {
    setManualItems(manualItems.filter((item) => item.id !== id))
  }

  const updateItemQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id)
      return
    }
    setManualItems(manualItems.map((item) => (item.id === id ? { ...item, quantity } : item)))
  }

  const total = manualItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const handleAddToCart = () => {
    if (manualItems.length === 0) {
      toast({
        title: "Error",
        description: "Agregue al menos un item",
        variant: "destructive",
      })
      return
    }

    setIsAddingManualItems(true)

    // Simulate a small delay for the animation if it's too fast (optional, but good for UX)
    // For now, let's just do it directly.

    try {
      // Convert manual items to CartItems
      const newCartItems = manualItems.map(item => {
        const sourceId = `manual-${Date.now()}-${item.id}`
        return {
          id: buildSourceRuntimeId("manual", sourceId),
          sku: "MANUAL",
          name: item.description,
          category: "Manual",
          stock: 9999,
          minStock: 0,
          buyPrice: item.cost || 0,
          wholesalePrice: item.price,
          sellPrice: item.price,
          minimumSellPrice: 0,
          supplier: "Manual",
          sourceTable: "manual" as const,
          sourceId,
          cartId: Math.random().toString(), // Helper for cart distinctness
          quantity: item.quantity,
          customPrice: item.price, // Ensure price is respected
        }
      })

      // Add to specific cart state
      setCart([...cart, ...newCartItems])

      toast({
        title: "Items agregados al carrito",
        description: "Los items han sido agregados al carrito de ventas.",
      })

      // Reset and close
      setManualItems([])
      setNewDescription("")
      setNewPrice("")
      setNewCost("")
      setShowManualInvoiceDialog(false)

      // Navigate to the current sales page's cart view if not there
      if (pathname !== activeSalesRoute) {
        navigate(activeSalesRoute)
        // We might need to ensure the "pos" tab is selected, but usually it defaults to it or stays.
        // If store-context has setCurrentTab, we can force it.
        setCurrentTab("pos")
      } else {
        // If already on the active sales route, ensure we are on the POS tab
        setCurrentTab("pos")
      }
    } finally {
      setIsAddingManualItems(false)
    }
  }

  const handleCloseDialog = () => {
    setManualItems([])
    // setCustomerName("")
    // setCustomerPhone("")
    // setPaymentMethod("cash")

    setNewDescription("")
    setNewPrice("")

    // setSelectedCustomerId("")
    setShowManualInvoiceDialog(false)
  }

  const handleRegisterExpense = async () => {
    if (!expenseDescription.trim() || !expenseAmount || Number.parseFloat(expenseAmount) <= 0) {
      toast({
        title: "Error",
        description: "Complete la descripción y el monto correctamente",
        variant: "destructive",
      })
      return
    }

    setIsRegisteringExpense(true)

    try {
      await addExpense({
        date: new Date().toISOString().split("T")[0],
        description: expenseDescription,
        amount: Number.parseFloat(expenseAmount),
        category: expenseCategory,
        paymentMethod: "cash",
        userName: currentUser?.name || "Sistema",
        userId: currentUser?.id,
      })

      toast({
        title: "Gasto Registrado",
        description: `Se registró el gasto de $${formatCurrency(Number.parseFloat(expenseAmount))}`,
      })

      setExpenseDescription("")
      setExpenseAmount("")
      setExpenseCategory("operativo")
      setShowExpenseDialog(false)
    } catch (error) {
      console.error("Error registering expense:", error)
      toast({
        title: "Error",
        description: "No se pudo registrar el gasto",
        variant: "destructive",
      })
    } finally {
      setIsRegisteringExpense(false)
    }
  }

  const handleRegisterPurchase = async () => {
    const amount = Number.parseFloat(purchaseAmount)
    if (!purchaseCustomerName.trim() || !purchaseDescription.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Error",
        description: "Complete el cliente, la descripción y el precio de compra correctamente",
        variant: "destructive",
      })
      return
    }

    setIsRegisteringPurchase(true)
    try {
      const notes = purchaseNotes.trim()
      const detail = `Compra a cliente: ${purchaseCustomerName.trim()} | ${purchaseDescription.trim()}${notes ? ` | Notas: ${notes}` : ""}`

      await addExpense({
        date: new Date().toISOString().split("T")[0],
        description: detail,
        amount,
        category: "compra_telefono",
        paymentMethod: "cash",
        userName: currentUser?.name || "Sistema",
        userId: currentUser?.id,
      })

      toast({
        title: "Compra registrada",
        description: `Se descontó ${formatCurrency(amount)} del efectivo de caja`,
      })
      setPurchaseCustomerName("")
      setPurchaseDescription("")
      setPurchaseNotes("")
      setPurchaseAmount("")
      setShowPurchaseDialog(false)
    } catch (error) {
      console.error("Error registering purchase:", error)
      toast({ title: "Error", description: "No se pudo registrar la compra", variant: "destructive" })
    } finally {
      setIsRegisteringPurchase(false)
    }
  }

  const handleClosePurchaseDialog = () => {
    if (isRegisteringPurchase) return
    setPurchaseCustomerName("")
    setPurchaseDescription("")
    setPurchaseNotes("")
    setPurchaseAmount("")
    setShowPurchaseDialog(false)
  }

  return (
    <>
      <header className={`fixed top-0 right-0 left-0 z-30 flex h-14 items-center gap-2 border-b bg-[#1e293b] px-3 text-white shadow-sm transition-all duration-300 ease-in-out sm:px-6 ${
        collapsed ? "md:left-20" : "md:left-64"
      }`}>
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 text-white hover:bg-white/10 hover:text-white md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Menú</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-r-0 bg-[#1e293b] p-0 dark:bg-[#0f172a]">
            <Sidebar onItemClick={() => setIsMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-semibold leading-none sm:text-lg">{currentTitle}</span>
              {currentSubtitle && (
                <span className="mt-1 truncate text-[10px] font-normal text-muted-foreground sm:text-xs">
                  {currentSubtitle}
                </span>
              )}
            </div>
          </div>
        </div>

        {isSalesPage && (
          <div className="hidden flex-1 justify-center sm:flex">
            <Tabs value={currentTab === "history" ? "history" : "pos"} onValueChange={setCurrentTab} className="w-auto">
              <TabsList className="border-[#475569] bg-[#334155]">
                <TabsTrigger
                  value="pos"
                  className="text-white/90 data-[state=active]:bg-[#fbbf24] data-[state=active]:text-[#1e293b]"
                >
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Facturas
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="text-white/90 data-[state=active]:bg-[#fbbf24] data-[state=active]:text-[#1e293b]"
                >
                  <Receipt className="mr-2 h-4 w-4" />
                  Historiales
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {isSalesPage && (
            <>
              <Button
                onClick={() => setShowManualInvoiceDialog(true)}
                size="sm"
                className="hidden h-11 px-5 text-base bg-blue-600 text-white hover:bg-blue-700 sm:inline-flex"
              >
                <FileText className="mr-2 h-5 w-5" />
                Emitir Factura Manual
              </Button>
              <Button
                onClick={() => setShowManualInvoiceDialog(true)}
                size="icon"
                className="inline-flex h-9 w-9 bg-blue-600 text-white hover:bg-blue-700 sm:hidden"
                aria-label="Emitir factura manual"
              >
                <FileText className="h-4 w-4" />
              </Button>
            </>
          )}

          {isSalesPage && (
            <>
              <Button
                onClick={() => setShowPurchaseDialog(true)}
                size="sm"
                className="hidden bg-amber-500 text-slate-950 hover:bg-amber-400 sm:inline-flex"
              >
                <ShoppingBasket className="mr-2 h-4 w-4" />
                Compras
              </Button>
              <Button
                onClick={() => setShowPurchaseDialog(true)}
                size="icon"
                className="inline-flex h-9 w-9 bg-amber-500 text-slate-950 hover:bg-amber-400 sm:hidden"
                aria-label="Registrar compra"
              >
                <ShoppingBasket className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setShowExpenseDialog(true)}
                size="sm"
                variant="destructive"
                className="hidden sm:inline-flex"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Registrar Gasto
              </Button>
              <Button
                onClick={() => setShowExpenseDialog(true)}
                size="icon"
                variant="destructive"
                className="inline-flex h-9 w-9 sm:hidden"
                aria-label="Registrar gasto"
              >
                <DollarSign className="h-4 w-4" />
              </Button>
            </>
          )}

          {shouldShowDebtPaymentAction && (
            <>
              <Button
                onClick={handleOpenDebtPaymentDialog}
                size="sm"
                className="mr-2 hidden bg-green-600 text-white hover:bg-green-700 sm:inline-flex"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                {isAlmacenCustomersPage ? "Registrar Abono a Deuda" : "Pago de Deuda"}
              </Button>
              <Button
                onClick={handleOpenDebtPaymentDialog}
                size="icon"
                className="inline-flex h-9 w-9 bg-green-600 text-white hover:bg-green-700 sm:hidden"
                aria-label={isAlmacenCustomersPage ? "Registrar abono a deuda" : "Pago de deuda"}
              >
                <CreditCard className="h-4 w-4" />
              </Button>

              {/* Options sheet trigger for mobile */}
              <Sheet open={isOptionsOpen} onOpenChange={setIsOptionsOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="inline-flex text-white sm:hidden">
                    <span className="text-lg">⋮</span>
                    <span className="sr-only">Opciones</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-48 p-4">
                  <div className="flex flex-col gap-2">
                    {isSalesPage && (
                      <Button
                        onClick={() => {
                          setShowManualInvoiceDialog(true)
                          setIsOptionsOpen(false)
                        }}
                        className="w-full justify-start"
                      >
                        <FileText className="mr-2 h-4 w-4" /> Emitir Factura Manual
                      </Button>
                    )}

                    <Button
                      onClick={() => {
                        setShowPurchaseDialog(true)
                        setIsOptionsOpen(false)
                      }}
                      className="w-full justify-start bg-amber-500 text-slate-950 hover:bg-amber-400"
                    >
                      <ShoppingBasket className="mr-2 h-4 w-4" /> Registrar Compra
                    </Button>

                    <Button
                      onClick={() => {
                        setShowExpenseDialog(true)
                        setIsOptionsOpen(false)
                      }}
                      variant="destructive"
                      className="w-full justify-start"
                    >
                      <DollarSign className="mr-2 h-4 w-4" /> Registrar Gasto
                    </Button>

                    <Button
                      onClick={() => {
                        handleOpenDebtPaymentDialog()
                        setIsOptionsOpen(false)
                      }}
                      className="w-full justify-start bg-green-600 text-white hover:bg-green-700"
                    >
                      <CreditCard className="mr-2 h-4 w-4" /> {isAlmacenCustomersPage ? "Registrar Abono a Deuda" : "Pago de Deuda"}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          )}

          {currentActionLabel && canAddRecords && (
            <Button
              onClick={() => onDialogOpen?.()}
              size="sm"
              className="bg-[#1e3a8a] text-white hover:bg-[#1e3a8a]/90"
            >
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">{currentActionLabel}</span>
              <span className="inline sm:hidden">{currentActionLabel}</span>
            </Button>
          )}
        </div>
      </header>

      <Dialog open={showManualInvoiceDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="w-full sm:max-w-[45rem] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="hidden sm:block">
            <DialogTitle>Agregar Items Manuales al Carrito</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">

            <div className="border rounded-lg p-3 bg-muted/30">
              <Label className="text-sm sm:text-base font-semibold mb-3 block">Nuevo Item</Label>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5 space-y-2">
                  <Label className="text-sm">Descripción</Label>
                  <Input
                    className="text-sm"
                    placeholder="Descripción del producto o servicio"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('manual-cost-input')?.focus();
                      }
                    }}
                  />
                </div>
                <div className="col-span-6 sm:col-span-3 space-y-2">
                  <Label className="text-sm">Costo (Opcional)</Label>
                  <Input
                    id="manual-cost-input"
                    type="number"
                    min="0"
                    step="0.01"
                    className="text-sm"
                    placeholder="0.00"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('manual-price-input')?.focus();
                      }
                    }}
                  />
                </div>
                <div className="col-span-6 sm:col-span-3 space-y-2">
                  <Label className="text-sm">Precio Unit.</Label>
                  <Input
                    id="manual-price-input"
                    type="number"
                    min="0"
                    step="0.01"
                    className="text-sm"
                    placeholder="0.00"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addItem();
                      }
                    }}
                  />
                </div>
                <div className="col-span-12 sm:col-span-1">
                  <Button onClick={addItem} className="w-full h-9 flex items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="border rounded-lg">
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Cant.</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="w-24 text-right">Costo</TableHead>
                      <TableHead className="w-24 text-right">Precio</TableHead>
                      <TableHead className="w-24 text-right">Ganancia</TableHead>
                      <TableHead className="w-24 text-right">Importe</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No hay items agregados.
                        </TableCell>
                      </TableRow>
                    ) : (
                      manualItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 bg-transparent"
                                onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                              >
                                -
                              </Button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 bg-transparent"
                                onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                              >
                                +
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-right text-muted-foreground">${formatCurrency(item.cost || 0)}</TableCell>
                          <TableCell className="text-right">${formatCurrency(item.price)}</TableCell>
                          <TableCell className="text-right text-green-600">
                            ${formatCurrency((item.price - (item.cost || 0)) * item.quantity)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${formatCurrency(item.price * item.quantity)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="block sm:hidden p-2">
                {manualItems.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">No hay items agregados.</div>
                ) : (
                  manualItems.map((item) => (
                    <div key={item.id} className="bg-muted/10 rounded p-3 mb-2 flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <div className="text-sm font-medium">{item.description}</div>
                          <div className="text-sm font-semibold">${formatCurrency(item.price * item.quantity)}</div>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateItemQuantity(item.id, item.quantity - 1)}
                            >
                              -
                            </Button>
                            <span className="px-2">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => updateItemQuantity(item.id, item.quantity + 1)}
                            >
                              +
                            </Button>
                          </div>
                          <div>Costo: ${formatCurrency(item.cost || 0)}</div>
                          <div className="text-green-600">Gan.: ${formatCurrency((item.price - (item.cost || 0)) * item.quantity)}</div>
                        </div>
                      </div>
                      <div className="ml-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {manualItems.length > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex justify-between text-base sm:text-lg font-bold">
                  <span>Total:</span>
                  <span>${formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleAddToCart} disabled={manualItems.length === 0 || isAddingManualItems}>
              {isAddingManualItems ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Agregando...
                </>
              ) : (
                <>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Agregar al Carrito
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Gasto del Día</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Descripción del Gasto</Label>
              <Input
                placeholder="Ej: Compra de agua, Almuerzo, Transporte"
                value={expenseDescription}
                onChange={(e) => setExpenseDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Monto (RD$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "operativo", label: "Operativo" },
                  { value: "suministros", label: "Suministros" },
                  { value: "servicios", label: "Servicios" },
                  { value: "gasto_especial", label: "Gasto especial" },
                  { value: "otros", label: "Otros" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-xl border px-3 py-3 text-sm text-left transition-colors ${
                      expenseCategory === option.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-slate-300 bg-white text-slate-900 hover:border-slate-500 hover:bg-slate-50"
                    }`}
                    onClick={() => setExpenseCategory(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterExpense}
              disabled={isRegisteringExpense || !expenseDescription.trim() || !expenseAmount}
              variant="destructive"
            >
              {isRegisteringExpense ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Registrar Salida de Caja"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      <Dialog open={showPurchaseDialog} onOpenChange={(open) => (open ? setShowPurchaseDialog(true) : handleClosePurchaseDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar compra a cliente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="purchase-customer">Nombre del cliente</Label>
              <Input
                id="purchase-customer"
                placeholder="Ej: Juan Pérez"
                value={purchaseCustomerName}
                onChange={(event) => setPurchaseCustomerName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-description">Descripción de la compra</Label>
              <Input
                id="purchase-description"
                placeholder="Ej: iPhone 13, IMEI..."
                value={purchaseDescription}
                onChange={(event) => setPurchaseDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-notes">Notas</Label>
              <Input
                id="purchase-notes"
                placeholder="Condición, accesorios, acuerdo..."
                value={purchaseNotes}
                onChange={(event) => setPurchaseNotes(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchase-amount">Precio de compra (RD$)</Label>
              <Input
                id="purchase-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={purchaseAmount}
                onChange={(event) => setPurchaseAmount(event.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Esta compra se registrará como un gasto en efectivo y se descontará del cierre de caja.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClosePurchaseDialog}>Cancelar</Button>
            <Button
              onClick={handleRegisterPurchase}
              disabled={isRegisteringPurchase || !purchaseCustomerName.trim() || !purchaseDescription.trim() || !purchaseAmount}
              className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            >
              {isRegisteringPurchase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingBasket className="mr-2 h-4 w-4" />}
              Registrar compra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
