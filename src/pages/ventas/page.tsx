"use client"

import ProductGrid from "../../components/ProductGrid"
import { useState, useEffect, useCallback, useMemo, useRef, type FormEvent } from "react"
import { Trash2, Printer, Search, CreditCard, UserPlus, Users, Check, ChevronsUpDown, Loader2, Eye, BadgeDollarSign, ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs"
import { useStore } from "@/components/store-context"
import { formatCurrency, cn } from "@/lib/utils"
import type { Payment, Customer, Sale, CartItem, Product } from "@/components/store-context"
import { printSaleInvoice, printPaymentInvoice } from "@/components/invoice-printer"
import { getSaleInvoicePersistOptions } from "@/lib/invoice-storage"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  formatAlmacenSku,
  getAlmacenCategoryFilterValue,
  getAlmacenCategoryLabel,
  isAlmacenCategory,
  normalizeAlmacenBoxNumber,
} from "@/lib/almacen"
import { isAlmacenSourceRecord, normalizeInventorySourceTable, parseSourceRuntimeId } from "@/lib/transaction-classification"
import { tenantCanAccessAlmacen } from "@/lib/tenant-permissions"
import { useNavigate } from "react-router-dom"
import { createClient } from "@/lib/supabase/client"
import {
  allocatePaymentToInvoices,
  formatSaleCreatedDateTime,
  getFirstCreatedPendingSale,
  getSaleCreditPendingAmount,
  shouldShowInCustomerPurchaseHistory,
  sortSalesByRecencyDesc,
} from "@/lib/credit-sale-utils"
import { Checkbox } from "@/components/ui/checkbox"
import { useLocation } from "react-router-dom"


function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const normalizeSearchValue = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

const normalizeNumericSearchValue = (value: string) => {
  const normalized = normalizeSearchValue(value)
  if (!normalized) return ""
  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10)
    return Number.isFinite(parsed) ? String(parsed) : normalized
  }
  return normalized
}

const compactSearchValue = (value: string) => normalizeSearchValue(value).replace(/\s+/g, "")

const normalizeExactIdValue = (value: string) => {
  const normalized = normalizeSearchValue(value)
  if (!normalized) return ""
  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10)
    return Number.isFinite(parsed) ? String(parsed) : normalized
  }
  return normalized
}

const levenshteinWithin = (left: string, right: string, maxDistance: number) => {
  if (left === right) return true
  const leftLength = left.length
  const rightLength = right.length
  if (Math.abs(leftLength - rightLength) > maxDistance) return false
  if (leftLength === 0 || rightLength === 0) return Math.max(leftLength, rightLength) <= maxDistance

  let previous = Array.from({ length: rightLength + 1 }, (_, index) => index)
  let current = new Array<number>(rightLength + 1)

  for (let i = 1; i <= leftLength; i += 1) {
    current[0] = i
    let rowMin = current[0]

    for (let j = 1; j <= rightLength; j += 1) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      )
      if (current[j] < rowMin) rowMin = current[j]
    }

    if (rowMin > maxDistance) return false
    ;[previous, current] = [current, previous]
  }

  return previous[rightLength] <= maxDistance
}

type AlmacenCustomerAccount = {
  id: string
  name: string
  phone: string
  debt: number
  sourceCustomerId: string | null
}

type NewAlmacenCustomerForm = {
  name: string
  cedula: string
  phone: string
  email: string
  address: string
  notes: string
  debt: string
  creditLimit: string
}

const INITIAL_NEW_ALMACEN_CUSTOMER_FORM: NewAlmacenCustomerForm = {
  name: "",
  cedula: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  debt: "0",
  creditLimit: "0",
}

export default function SalesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const isWholesalePage = location.pathname.startsWith("/ventas-por-mayor")
  const {
    products,
    searchProducts,
    loadMoreProducts,
    sales,
    addSale,
    updateSale,
    currentTab,
    setCurrentTab,
    customers,
    updateCustomer,
    addCustomer,
    addPayment,
    employees,
    currentUser,
    cart,
    setCart,
    repairs,
    updateRepair,
    removeFromCart,
    updateCartItemQuantity,
    updateCartItemPrice,
    clearCart,
    deleteSale,
    createAlmacenSale,
  } = useStore()

  const syncRepairStatusForSale = async (saleItems: CartItem[], status: "listo" | "entregado") => {
    const relatedRepairs = repairs.filter((repair) =>
      saleItems.some((item) => {
        const sourceId = String(item.sourceId || "")
        return sourceId === repair.id || sourceId.startsWith(`${repair.id}-`)
      }),
    )
    await Promise.all(relatedRepairs.map((repair) => updateRepair(repair.id, { status })))
  }

  const employee = employees.find((e) => e.email === currentUser?.email)
  const isAdmin = currentUser?.role === "admin"
  const currentOwnerAdminId = useMemo(() => {
    const adminId = String(currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || "").trim()
    return adminId || null
  }, [currentUser])
  const canDelete = isAdmin || employee?.permissions.canDelete
  const canSeeAlmacen = tenantCanAccessAlmacen(currentUser, employees)
  const canUseWholesaleDiscounts = isAdmin || Boolean(employee?.permissions.wholesaleDiscounts)
  const canAccessWholesalePage = isAdmin || Boolean(employee?.permissions.wholesaleSales)

  useEffect(() => {
    if (isWholesalePage && !canAccessWholesalePage) {
      navigate("/ventas", { replace: true })
    }
  }, [canAccessWholesalePage, isWholesalePage, navigate])

  const shouldShowWholesaleDiscountInput =
    (isWholesalePage || isAdmin) &&
    (isAdmin || Boolean(employee?.permissions.wholesaleDiscounts))

  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const [searchTerm, setSearchTerm] = useState("")
  const [visibleProductLimit, setVisibleProductLimit] = useState(20)
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false)
  const [hasMoreProducts, setHasMoreProducts] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showAlmacenProductsOnly, setShowAlmacenProductsOnly] = useState(false)
  const [almacenCategoryFilter, setAlmacenCategoryFilter] = useState<string>("all")
  const [almacenBoxFilter, setAlmacenBoxFilter] = useState<string>("all")
  const [editingPriceMap, setEditingPriceMap] = useState<Record<string, string>>({})
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
  const [showSaleTypeDialog, setShowSaleTypeDialog] = useState(false)
  const [showWholesaleDialog, setShowWholesaleDialog] = useState(false)
  const [showMobileCartDialog, setShowMobileCartDialog] = useState(false)
  const [saleTypeMode, setSaleTypeMode] = useState<"normal" | "credit" | "wholesale">("normal")
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false)
  const [currentInvoice, setCurrentInvoice] = useState<Sale | null>(null)
  const [editingQueuedSale, setEditingQueuedSale] = useState<Sale | null>(null)

  useEffect(() => {
    const query = searchTerm.trim()
    if (!query) return

    const timeout = window.setTimeout(() => {
      void searchProducts(query).catch((error) => {
        console.warn("No se pudieron buscar productos:", error)
      })
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [searchProducts, searchTerm])

  useEffect(() => {
    const navigationState = location.state as { returnedInvoice?: Sale } | null
    const returnedInvoice = navigationState?.returnedInvoice
    if (!returnedInvoice) return

    // Cargar la misma venta completa que salió de /ventas hacia la cola.
    // El estado global ya contiene la actualización persistida; aquí solo
    // restauramos la factura activa para mostrarla igual que al enviarla.
    const customerName = returnedInvoice.customerName || customers.find((customer) => customer.id === returnedInvoice.customerId)?.name || ""
    const invoiceWithCustomerName = { ...returnedInvoice, customerName: customerName || undefined }
    setCart(invoiceWithCustomerName.items.map((item) => ({ ...item })))
    setCustomerName(customerName)
    setCustomerPhone(returnedInvoice.customerPhone || "")
    setAmountPaid(String(returnedInvoice.total || ""))
    setPaymentMethod("cash")
    const restoredSubtotal = returnedInvoice.items.reduce(
      (sum, item) => sum + (Number(item.customPrice ?? item.sellPrice ?? 0) || 0) * Number(item.quantity || 0),
      0,
    )
    setDiscount(Math.max(0, restoredSubtotal - Number(returnedInvoice.total || 0)))
    setEditingQueuedSale(invoiceWithCustomerName)
    navigate(location.pathname, { replace: true, state: null })
  }, [customers, location.pathname, location.state, navigate, setCart])

  const cartQuantity = useMemo(() => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [cart])

  const [showPaymentSuccessDialog, setShowPaymentSuccessDialog] = useState(false)
  const [currentPayment, setCurrentPayment] = useState<{ payment: Payment; customer: Customer } | null>(null)

  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<string>("")
  const [paymentCustomerType, setPaymentCustomerType] = useState<"general" | "almacen">("general")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("cash")
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")

  const [amountPaid, setAmountPaid] = useState("")
  const [discount, setDiscount] = useState(0)

  const [showManualInvoiceDialog, setShowManualInvoiceDialog] = useState(false)
  const [manualInvoiceItems, setManualInvoiceItems] = useState<Array<{ productId: string; quantity: number }>>([])
  const [manualAmountPaid, setManualAmountPaid] = useState("")

  const [showCreditDialog, setShowCreditDialog] = useState(false)
  const [selectedCustomerForCredit, setSelectedCustomerForCredit] = useState<string>("")
  const [creditDialogMode, setCreditDialogMode] = useState<"type" | "almacen" | "regular">("type")
  const [showCreditTypeDialog, setShowCreditTypeDialog] = useState(false)
  const [almacenCustomersForCredit, setAlmacenCustomersForCredit] = useState<AlmacenCustomerAccount[]>([])
  const [selectedAlmacenCustomerForCredit, setSelectedAlmacenCustomerForCredit] = useState("")
  const [isLoadingAlmacenCustomersForCredit, setIsLoadingAlmacenCustomersForCredit] = useState(false)
  const [showAddAlmacenCustomerDialog, setShowAddAlmacenCustomerDialog] = useState(false)
  const [isCreatingAlmacenCustomer, setIsCreatingAlmacenCustomer] = useState(false)
  const [newAlmacenCustomerForm, setNewAlmacenCustomerForm] = useState<NewAlmacenCustomerForm>(
    INITIAL_NEW_ALMACEN_CUSTOMER_FORM,
  )
  const [selectedGeneralCustomerForAlmacenCredit, setSelectedGeneralCustomerForAlmacenCredit] = useState("none")
  const [isImportingGeneralCustomerForAlmacenCredit, setIsImportingGeneralCustomerForAlmacenCredit] = useState(false)
  const [almacenCustomerName, setAlmacenCustomerName] = useState("")
  const [almacenCustomerPhone, setAlmacenCustomerPhone] = useState("")
  const [almacenSourceCustomerId, setAlmacenSourceCustomerId] = useState<string | null>(null)
  const [showQueueDialog, setShowQueueDialog] = useState(false)
  const [queueLabel, setQueueLabel] = useState("")
  const [queueCustomerType, setQueueCustomerType] = useState<"general" | "credito">("general")
  const [queueCreditCustomerId, setQueueCreditCustomerId] = useState("")
  const [isSendingToQueue, setIsSendingToQueue] = useState(false)
  const [showFinalizeQueueDialog, setShowFinalizeQueueDialog] = useState(false)
  const [selectedQueuedSale, setSelectedQueuedSale] = useState<Sale | null>(null)
  const [queuedPaymentMethod, setQueuedPaymentMethod] = useState<"cash" | "card" | "transfer">("cash")
  const [queuedAmountPaid, setQueuedAmountPaid] = useState("")
  const [queuedCustomerName, setQueuedCustomerName] = useState("")
  const [queuedCustomerPhone, setQueuedCustomerPhone] = useState("")
  const [isFinalizingQueuedSale, setIsFinalizingQueuedSale] = useState(false)

  // Partial credit (cash shortfall) states
  const [showPartialCreditDialog, setShowPartialCreditDialog] = useState(false)
  const [partialCashPaid, setPartialCashPaid] = useState(0)
  const [partialCreditAmount, setPartialCreditAmount] = useState(0)
  const [partialCreditMode, setPartialCreditMode] = useState<"existing" | "new">("existing")
  const [selectedCustomerForPartialCredit, setSelectedCustomerForPartialCredit] = useState<string>("")
  const [newCreditCustomerName, setNewCreditCustomerName] = useState("")
  const [newCreditCustomerPhone, setNewCreditCustomerPhone] = useState("")
  const [newCreditCustomerCedula, setNewCreditCustomerCedula] = useState("")
  const [newCreditCustomerEmail, setNewCreditCustomerEmail] = useState("")
  const [newCreditCustomerAddress, setNewCreditCustomerAddress] = useState("")
  const [newCreditCustomerNotes, setNewCreditCustomerNotes] = useState("")
  const [newCreditCustomerDebt, setNewCreditCustomerDebt] = useState("")
  const [newCreditCustomerCreditLimit, setNewCreditCustomerCreditLimit] = useState("")
  const [newCreditCustomerCreditDevice, setNewCreditCustomerCreditDevice] = useState("")
  const [openNewCreditCombobox, setOpenNewCreditCombobox] = useState(false)

  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false)
  const [isProcessingPartialCredit, setIsProcessingPartialCredit] = useState(false)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [isProcessingCreditSale, setIsProcessingCreditSale] = useState(false)
  const [isProcessingAlmacenCredit, setIsProcessingAlmacenCredit] = useState(false)

  // Enhanced payment dialog states (two-step payment system)
  const [isConfirmPaymentDialogOpen, setIsConfirmPaymentDialogOpen] = useState(false)
  const [paymentAmountDraft, setPaymentAmountDraft] = useState("")
  const [paymentMethodAbono, setPaymentMethodAbono] = useState<"cash" | "card" | "transfer">("cash")
  const [selectedPaymentSaleIds, setSelectedPaymentSaleIds] = useState<string[]>([])
  const [pendingPayment, setPendingPayment] = useState<{ amount: number; note: string; paymentMethod: "cash" | "card" | "transfer"; appliedSaleIds: string[] } | null>(null)
  const [recentPaymentReceipt, setRecentPaymentReceipt] = useState<{ payment: Payment; customer: Customer } | null>(null)
  const [paymentNoteAbono, setPaymentNoteAbono] = useState("")

  // Historial filters
  const [filterDay, setFilterDay] = useState<string>("all")
  const [filterMonth, setFilterMonth] = useState<string>("all")
  const [filterYear, setFilterYear] = useState<string>("all")
  const [filterSaleType, setFilterSaleType] = useState<string>("all")

  const applyWholesalePricesToCart = useCallback(() => {
    const getWholesalePrice = (item: CartItem) => {
      const sourceId = item.sourceId || parseSourceRuntimeId(item.id)?.sourceId
      const product = products.find((entry) => entry.id === item.id || entry.sourceId === sourceId)
      const wholesalePrice = Number(product?.wholesalePrice ?? item.wholesalePrice ?? 0)
      return Number.isFinite(wholesalePrice) && wholesalePrice > 0 ? wholesalePrice : 0
    }

    const nextCart = cart.map((item) => {
      const wholesalePrice = getWholesalePrice(item)
      if (wholesalePrice <= 0) return item
      return {
        ...item,
        wholesalePrice,
        customPrice: wholesalePrice,
      }
    })

    setEditingPriceMap({})
    setCart(nextCart)
  }, [cart, products, setCart])

  const getWholesalePriceForItem = useCallback(
    (item: CartItem) => {
      const sourceId = item.sourceId || parseSourceRuntimeId(item.id)?.sourceId
      const product = products.find((entry) => entry.id === item.id || entry.sourceId === sourceId)
      const wholesalePrice = Number(product?.wholesalePrice ?? item.wholesalePrice ?? 0)
      return Number.isFinite(wholesalePrice) && wholesalePrice > 0 ? wholesalePrice : 0
    },
    [products],
  )

  const getMinimumSellPrice = (item: { minimumSellPrice?: number; buyPrice?: number }) => {
    const marked = Number(item.minimumSellPrice)
    if (Number.isFinite(marked) && marked > 0) return marked

    const fallbackBuyPrice = Number(item.buyPrice)
    return Number.isFinite(fallbackBuyPrice) ? Math.max(0, fallbackBuyPrice) : 0
  }

  const renderCartCardContent = () => (
    <>
      <CardHeader className="shrink-0 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pb-1 sm:pb-2">
        <CardTitle>Carrito de Venta</CardTitle>
        <div className="grid w-full gap-1 sm:flex sm:items-center sm:w-auto">
          {cart.length > 0 && (
            <Button variant="outline" size="sm" onClick={openQueueDialog} disabled={isSendingToQueue} className="w-full sm:w-auto">
              {isSendingToQueue ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar a Cola Exclusiva"
              )}
            </Button>
          )}
          {cart.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (window.confirm("¿Estás seguro de que deseas vaciar el carrito?")) {
                  handleClearCart()
                }
              }}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Vaciar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto scroll-smooth py-1 px-0 sm:px-4">
        <Table className="[&_td]:p-0.5 [&amp;_th]:p-0.5">
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="md:w-[100px]">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="md:w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cart.map((item) => {
              const minPrice = getMinimumSellPrice(item)
              const rawEditing = editingPriceMap[item.cartId]
              const parsedEditing =
                rawEditing !== undefined && rawEditing !== "" ? Number.parseFloat(rawEditing) : undefined
              const effectivePrice = Number(item.customPrice ?? item.sellPrice ?? 0)
              const safePrice = Number.isFinite(effectivePrice) ? effectivePrice : 0
              const displayPrice = rawEditing !== undefined ? rawEditing : safePrice.toString()
              const priceToCheck = parsedEditing ?? safePrice
              const isBelowCost = minPrice > 0 && priceToCheck < minPrice

              return (
                <TableRow key={item.cartId}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        const boxNumber = normalizeAlmacenBoxNumber(item.boxNumber)
                        const isAlmacenItem = isAlmacenInventoryProduct(item)

                        if (isAlmacenItem) {
                          return boxNumber ? `Caja ${boxNumber}` : getAlmacenCategoryLabel(item.category)
                        }

                        return item.sku
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      max={item.stock}
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.cartId, Number.parseInt(e.target.value) || 0)}
                      className="md:w-16 h-7 w-full max-w-[5.5rem] px-1 py-0.5"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-end">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={displayPrice}
                        onChange={(e) => {
                          const val = e.target.value
                          setEditingPriceMap((prev) => ({ ...prev, [item.cartId]: val }))

                          if (val !== "") {
                            const newPrice = Number.parseFloat(val)
                            if (!Number.isNaN(newPrice)) {
                              const safePrice = minPrice > 0 ? Math.max(minPrice, newPrice) : newPrice
                              updateCartItemPrice(item.cartId, safePrice)
                            }
                          }
                        }}
                        onBlur={() => {
                          const raw = editingPriceMap[item.cartId]
                          if (raw !== undefined && raw !== "") {
                            const parsed = Number.parseFloat(raw)
                            if (!Number.isNaN(parsed)) {
                              const safePrice = minPrice > 0 ? Math.max(minPrice, parsed) : parsed
                              if (minPrice > 0 && parsed < minPrice) {
                                updateCartItemPrice(item.cartId, safePrice)
                                toast({
                                  title: "Precio minimo de venta",
                                  description: `El precio de ${item.name} no puede ser menor al minimo de venta ($${formatCurrency(minPrice)}).`,
                                  variant: "destructive",
                                })
                              } else {
                                updateCartItemPrice(item.cartId, safePrice)
                              }
                            }
                          }
                          setEditingPriceMap((prev) => {
                            const next = { ...prev }
                            delete next[item.cartId]
                            return next
                          })
                        }}
                        className={cn(
                          "md:w-24 h-7 text-right w-full max-w-[6.5rem] px-1 py-0.5",
                          isBelowCost ? "border-red-500 focus-visible:ring-red-500" : "",
                        )}
                      />
                      {isBelowCost && (
                        <div className="text-xs text-red-600 mt-0.5">
                          Precio minimo de venta: ${formatCurrency(minPrice)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${formatCurrency((item.customPrice ?? item.sellPrice ?? 0) * item.quantity)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveFromCart(item.cartId)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {cart.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  El carrito está vacío
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="flex flex-col gap-1 border-t pt-1 shrink-0 bg-background">
        <div className="w-full space-y-1">
          <div className="flex justify-between text-base">
            <span>Precio Original</span>
            <span>${formatCurrency(subtotal)}</span>
          </div>
          {shouldShowWholesaleDiscountInput && (
            <div className="flex justify-between items-center gap-2">
              <label className="flex-1">Descuento ($)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount > 0 ? discount : ""}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === "") {
                      setDiscount(0)
                    } else {
                      const parsed = Number.parseFloat(val)
                      if (!Number.isNaN(parsed)) {
                        setDiscount(Math.max(0, Math.min(parsed, subtotal)))
                      }
                    }
                  }}
                  placeholder="0"
                  className="w-28 h-8 text-right"
                  disabled={!canUseWholesaleDiscounts}
                />
              </div>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Precio Final</span>
            <span>${formatCurrency(total)}</span>
          </div>
        </div>
        <div className="w-full flex gap-2">
          <Button
            className="flex-1"
            size="lg"
            disabled={cart.length === 0}
            onClick={openSaleTypeDialog}
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Procesar Venta
          </Button>
        </div>
      </CardFooter>
    </>
  )

  const renderCartCard = () => (
    <Card className="flex flex-col h-full md:order-1 border-0 rounded-none md:rounded-lg md:border shadow-none md:shadow-sm">
      {renderCartCardContent()}
    </Card>
  )

  const getCartItemEnteredPrice = (item: CartItem) => {
    const raw = editingPriceMap[item.cartId]
    if (raw !== undefined && raw !== "") {
      const parsed = Number.parseFloat(raw)
      if (!Number.isNaN(parsed)) return parsed
    }
    return item.customPrice ?? item.sellPrice ?? 0
  }

  const getBelowCostCartItems = (items: CartItem[]) => {
    return items.filter((item) => {
      const min = getMinimumSellPrice(item)
      if (min <= 0) return false
      return getCartItemEnteredPrice(item) < min
    })
  }

  const requireMinPrices = (items: CartItem[], actionLabel: string) => {
    const below = getBelowCostCartItems(items)
    if (below.length === 0) return true
    const list = below
      .map((item) => `${item.name} (mín: $${formatCurrency(getMinimumSellPrice(item))})`)
      .join(", ")
    toast({
      title: "Precio por debajo del costo",
      description: `Ajusta el precio antes de ${actionLabel}. ${list}`,
      variant: "destructive",
    })
    return false
  }

  const loadAlmacenCustomersForCredit = useCallback(async () => {
    setIsLoadingAlmacenCustomersForCredit(true)
    try {
      let query = supabase
        .from("almacen_customer_accounts")
        .select("id, name, phone, debt, source_customer_id")

      if (currentOwnerAdminId) {
        query = query.eq("owner_admin_id", currentOwnerAdminId)
      }

      const { data, error } = await query.order("created_at", { ascending: false })

      if (error) {
        console.error("Error loading almacen customers for credit:", error)
        setAlmacenCustomersForCredit([])
        return
      }

      const mapped = (data || []).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? "Cliente sin nombre"),
        phone: String(row.phone ?? ""),
        debt: Number(row.debt ?? 0) || 0,
        sourceCustomerId: row.source_customer_id ? String(row.source_customer_id) : null,
      }))

      setAlmacenCustomersForCredit(mapped)
    } finally {
      setIsLoadingAlmacenCustomersForCredit(false)
    }
  }, [currentOwnerAdminId, supabase])

  const handleAlmacenCustomerForCreditChange = useCallback(
    (accountId: string) => {
      setSelectedAlmacenCustomerForCredit(accountId)
      const selected = almacenCustomersForCredit.find((customer) => customer.id === accountId)

      if (!selected) {
        setAlmacenCustomerName("")
        setAlmacenCustomerPhone("")
        setAlmacenSourceCustomerId(null)
        return
      }

      setAlmacenCustomerName(selected.name)
      setAlmacenCustomerPhone(selected.phone)
      setAlmacenSourceCustomerId(selected.sourceCustomerId)
    },
    [almacenCustomersForCredit],
  )

  const resetNewAlmacenCustomerForm = useCallback(() => {
    setNewAlmacenCustomerForm(INITIAL_NEW_ALMACEN_CUSTOMER_FORM)
  }, [])

  const handleCreateAlmacenCustomerForCredit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setIsCreatingAlmacenCustomer(true)

      const normalizeAmount = (value: string) => {
        const parsed = Number.parseFloat(value)
        if (!Number.isFinite(parsed) || parsed < 0) return 0
        return Math.round(parsed * 100) / 100
      }

      const name = newAlmacenCustomerForm.name.trim() || "Cliente sin nombre"
      const phone = newAlmacenCustomerForm.phone.trim()
      const debt = normalizeAmount(newAlmacenCustomerForm.debt)

      try {
        if (!currentOwnerAdminId) {
          throw new Error("No hay un administrador activo para asociar este cliente del almacén.")
        }

        const payload = {
          owner_admin_id: currentOwnerAdminId,
          source_customer_id: null,
          name,
          cedula: newAlmacenCustomerForm.cedula.trim() || null,
          phone: phone || null,
          email: newAlmacenCustomerForm.email.trim() || null,
          address: newAlmacenCustomerForm.address.trim() || null,
          notes: newAlmacenCustomerForm.notes.trim() || null,
          debt,
          total_purchases: 0,
          credit_limit: normalizeAmount(newAlmacenCustomerForm.creditLimit),
          status: "En proceso",
        }

        const { data, error } = await supabase
          .from("almacen_customer_accounts")
          .insert(payload)
          .select("id, name, phone, debt, source_customer_id")
          .single()

        if (error || !data) {
          throw error || new Error("No se pudo crear el cliente.")
        }

        const created: AlmacenCustomerAccount = {
          id: String(data.id ?? ""),
          name: String(data.name ?? name),
          phone: String(data.phone ?? phone),
          debt: Number(data.debt ?? debt) || 0,
          sourceCustomerId: data.source_customer_id ? String(data.source_customer_id) : null,
        }

        setAlmacenCustomersForCredit((prev) => [created, ...prev.filter((customer) => customer.id !== created.id)])
        setSelectedAlmacenCustomerForCredit(created.id)
        setAlmacenCustomerName(created.name)
        setAlmacenCustomerPhone(created.phone)
        setAlmacenSourceCustomerId(created.sourceCustomerId)

        resetNewAlmacenCustomerForm()
        setShowAddAlmacenCustomerDialog(false)

        toast({
          title: "Cliente agregado",
          description: `Se agrego ${created.name} para el credito del almacen.`,
        })
      } catch (error: any) {
        console.error("Error creating almacen customer from ventas:", error)
        toast({
          title: "Error",
          description: error?.message || "No se pudo guardar el cliente del almacen.",
          variant: "destructive",
        })
      } finally {
        setIsCreatingAlmacenCustomer(false)
      }
    },
    [currentOwnerAdminId, newAlmacenCustomerForm, resetNewAlmacenCustomerForm, supabase, toast],
  )

  const handleImportGeneralCustomerForAlmacenCredit = useCallback(async () => {
    if (selectedGeneralCustomerForAlmacenCredit === "none") {
      toast({
        title: "Seleccione cliente",
        description: "Selecciona un cliente de /clientes para importarlo.",
        variant: "destructive",
      })
      return
    }

    const sourceCustomer = customers.find((customer) => customer.id === selectedGeneralCustomerForAlmacenCredit)
    if (!sourceCustomer) {
      toast({
        title: "Cliente no encontrado",
        description: "No se encontro el cliente seleccionado en /clientes.",
        variant: "destructive",
      })
      return
    }

    setIsImportingGeneralCustomerForAlmacenCredit(true)
    try {
      let existingQuery = supabase
        .from("almacen_customer_accounts")
        .select("id, name, phone, debt, source_customer_id")
        .eq("source_customer_id", sourceCustomer.id)

      if (currentOwnerAdminId) {
        existingQuery = existingQuery.eq("owner_admin_id", currentOwnerAdminId)
      }

      const { data: existingBySource, error: existingError } = await existingQuery.maybeSingle()

      if (existingError) throw existingError

      if (existingBySource?.id) {
        const existing: AlmacenCustomerAccount = {
          id: String(existingBySource.id ?? ""),
          name: String(existingBySource.name ?? sourceCustomer.name ?? "Cliente sin nombre"),
          phone: String(existingBySource.phone ?? sourceCustomer.phone ?? ""),
          debt: Number(existingBySource.debt ?? 0) || 0,
          sourceCustomerId: existingBySource.source_customer_id
            ? String(existingBySource.source_customer_id)
            : sourceCustomer.id,
        }

        setAlmacenCustomersForCredit((prev) => [existing, ...prev.filter((customer) => customer.id !== existing.id)])
        setSelectedAlmacenCustomerForCredit(existing.id)
        setAlmacenCustomerName(existing.name)
        setAlmacenCustomerPhone(existing.phone)
        setAlmacenSourceCustomerId(existing.sourceCustomerId)
        setSelectedGeneralCustomerForAlmacenCredit("none")

        toast({
          title: "Cliente listo",
          description: `${existing.name} ya estaba en Cliente Almacen y quedo seleccionado.`,
        })
        return
      }

      const payload = {
        owner_admin_id: currentOwnerAdminId,
        source_customer_id: sourceCustomer.id,
        name: sourceCustomer.name?.trim() || "Cliente sin nombre",
        cedula: sourceCustomer.cedula?.trim() || null,
        phone: sourceCustomer.phone?.trim() || null,
        email: sourceCustomer.email?.trim() || null,
        address: sourceCustomer.address?.trim() || null,
        notes: sourceCustomer.notes?.trim() || null,
        debt: 0,
        total_purchases: 0,
        credit_limit: Number(sourceCustomer.creditLimit) || 0,
        status: sourceCustomer.status || "En proceso",
      }

      const { data, error } = await supabase
        .from("almacen_customer_accounts")
        .insert(payload)
        .select("id, name, phone, debt, source_customer_id")
        .single()

      if (error || !data) throw error || new Error("No se pudo importar el cliente.")

      const created: AlmacenCustomerAccount = {
        id: String(data.id ?? ""),
        name: String(data.name ?? payload.name),
        phone: String(data.phone ?? payload.phone ?? ""),
        debt: Number(data.debt ?? 0) || 0,
        sourceCustomerId: data.source_customer_id ? String(data.source_customer_id) : sourceCustomer.id,
      }

      setAlmacenCustomersForCredit((prev) => [created, ...prev.filter((customer) => customer.id !== created.id)])
      setSelectedAlmacenCustomerForCredit(created.id)
      setAlmacenCustomerName(created.name)
      setAlmacenCustomerPhone(created.phone)
      setAlmacenSourceCustomerId(created.sourceCustomerId)
      setSelectedGeneralCustomerForAlmacenCredit("none")

      toast({
        title: "Cliente importado",
        description: `${created.name} se agrego automaticamente a Cliente Almacen.`,
      })
    } catch (error: any) {
      console.error("Error importing customer from /clientes (ventas):", error)
      toast({
        title: "Error",
        description: error?.message || "No se pudo importar el cliente desde /clientes.",
        variant: "destructive",
      })
    } finally {
      setIsImportingGeneralCustomerForAlmacenCredit(false)
    }
  }, [customers, selectedGeneralCustomerForAlmacenCredit, supabase, toast])

  useEffect(() => {
    void loadAlmacenCustomersForCredit()
  }, [loadAlmacenCustomersForCredit])

  useEffect(() => {
    const handleOpenPayment = async () => {
      await loadAlmacenCustomersForCredit()
      setPaymentCustomerType("general")
      setSelectedCustomerForPayment("")
      setPaymentAmountDraft("")
      setPaymentMethodAbono("cash")
      setPaymentNoteAbono("")
      setSelectedPaymentSaleIds([])
      setShowPaymentDialog(true)
    }
    window.addEventListener("open-payment-dialog", handleOpenPayment)
    return () => window.removeEventListener("open-payment-dialog", handleOpenPayment)
  }, [loadAlmacenCustomersForCredit])

  const employeeForPrint = employee
    ? { name: employee.name, phone: employee.phone }
    : { name: currentUser?.name ?? "", phone: "" }

  // Helper function to get pending sales for a customer
  const getPaymentPendingSales = useCallback(
    (customerType: "general" | "almacen", customerId: string) => {
      if (customerType === "almacen") {
        return sales.filter(
          (sale) =>
            sale.almacenCustomerAccountId === customerId && getSaleCreditPendingAmount(sale) > 0
        )
      } else {
        const customer = customers.find((c) => c.id === customerId)
        if (!customer) return []
        return sales.filter(
          (sale) =>
            (sale.customerName === customer.name ||
              (sale.customerPhone && sale.customerPhone === customer.phone) ||
              (sale.customerId && sale.customerId === customer.id)) &&
            !sale.almacenCustomerAccountId &&
            getSaleCreditPendingAmount(sale) > 0
        )
      }
    },
    [sales, customers]
  )

  // Calculate pending invoices for payment dialog
  const paymentPendingInvoices = useMemo(() => {
    if (!selectedCustomerForPayment) return []
    const [selectedType, selectedId] = selectedCustomerForPayment.split(":")
    return sortSalesByRecencyDesc(getPaymentPendingSales(selectedType as "general" | "almacen", selectedId))
  }, [selectedCustomerForPayment, getPaymentPendingSales])

  // Calculate payment draft amount
  const paymentDraftAmountValue = useMemo(() => {
    const parsed = Number(paymentAmountDraft)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
  }, [paymentAmountDraft])

  // Calculate current payment customer
  const currentPaymentCustomer = useMemo(() => {
    if (!selectedCustomerForPayment) return null
    const [selectedType, selectedId] = selectedCustomerForPayment.split(":")
    if (selectedType === "almacen") {
      return almacenCustomersForCredit.find((c) => c.id === selectedId) || null
    } else {
      return customers.find((c) => c.id === selectedId) || null
    }
  }, [selectedCustomerForPayment, almacenCustomersForCredit, customers])

  // Calculate projected debt after payment
  const projectedRemainingDebtAfterPayment = useMemo(
    () => Math.max(0, (currentPaymentCustomer?.debt || 0) - paymentDraftAmountValue),
    [currentPaymentCustomer?.debt, paymentDraftAmountValue]
  )

  const handlePaymentSubmit = () => {
    const [selectedType, selectedId] = selectedCustomerForPayment.split(":")
    const amount = Number.parseFloat(paymentAmountDraft)
    const customer = selectedType === "almacen"
      ? almacenCustomersForCredit.find((c) => c.id === selectedId)
      : customers.find((c) => c.id === selectedId)

    if (!customer || isNaN(amount) || amount <= 0) {
      toast({
        title: "Error",
        description: "Verifique los datos del pago",
        variant: "destructive",
      })
      return
    }

    if (amount > customer.debt) {
      toast({
        title: "Error",
        description: "El monto no puede ser mayor a la deuda",
        variant: "destructive",
      })
      return
    }

    // Set up pending payment and open confirmation dialog
    setPendingPayment({ 
      amount: amount, 
      note: paymentNoteAbono, 
      paymentMethod: paymentMethodAbono,
      appliedSaleIds: selectedPaymentSaleIds
    })
    setIsConfirmPaymentDialogOpen(true)
  }

  const handleConfirmPayment = async () => {
    if (!currentPaymentCustomer || !pendingPayment) return

    const [selectedType, selectedId] = selectedCustomerForPayment.split(":")
    const allCustomerSales = getPaymentPendingSales(selectedType as "general" | "almacen", selectedId)
    const paymentAllocationsPreview = allocatePaymentToInvoices(
      allCustomerSales,
      pendingPayment.amount,
      pendingPayment.appliedSaleIds,
    )

    setIsProcessingPayment(true)
    try {
      const newPayment = await addPayment({
        customerId: currentPaymentCustomer.id,
        amount: pendingPayment.amount,
        previousDebt: currentPaymentCustomer.debt,
        remainingDebt: currentPaymentCustomer.debt - pendingPayment.amount,
        paymentMethod: pendingPayment.paymentMethod,
        paymentKind: "debt_payment",
        note: paymentNoteAbono || "Pago registrado desde caja",
        customerType: selectedType === "almacen" ? "almacen" : "general",
      })

      // Update almacen customer debt if applicable
      if (selectedType === "almacen") {
        setAlmacenCustomersForCredit((prev) =>
          prev.map((c) =>
            c.id === selectedId ? { ...c, debt: Math.max(0, c.debt - pendingPayment.amount) } : c,
          ),
        )
      }

      // Create customer object for receipt
      const customerForReceipt: Customer = {
        id: currentPaymentCustomer.id,
        name: currentPaymentCustomer.name,
        cedula: (currentPaymentCustomer as any).cedula || "",
        phone: currentPaymentCustomer.phone,
        email: "",
        address: "",
        status: "En proceso",
        creditDevice: "",
        notes: "",
        debt: currentPaymentCustomer.debt,
        totalPurchases: 0,
        creditBalance: 0,
        creditLimit: 0,
      }

      // Print receipt
      void printPaymentInvoice(
        newPayment,
        customerForReceipt,
        undefined,
        currentUser?.adminId
          ? { ownerAdminId: currentUser.adminId, source: "pago", paymentId: newPayment.id }
          : undefined,
      )

      // Show success receipt dialog
      setRecentPaymentReceipt({ payment: newPayment, customer: customerForReceipt })

      // Close dialogs and reset
      setIsConfirmPaymentDialogOpen(false)
      setShowPaymentDialog(false)
      setPaymentAmountDraft("")
      setSelectedCustomerForPayment("")
      setPaymentMethod("cash")
      setPaymentMethodAbono("cash")
      setPaymentNoteAbono("")
      setSelectedPaymentSaleIds([])
      setPendingPayment(null)

      toast({
        title: "Pago Exitoso",
        description: `Se registró un pago de $${formatCurrency(pendingPayment.amount)} para ${currentPaymentCustomer.name}`,
      })
    } catch (err) {
      console.error("Error al registrar pago:", err)
      toast({
        title: "Error al registrar pago",
        description: (err as any)?.message || "Ocurrió un error al guardar el pago. Intente de nuevo.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const addToCart = async (product: Product) => {
    if (product.stock === 0) {
      toast({
        title: "Sin inventario",
        description: "Este producto no tiene inventario disponible",
        variant: "destructive",
      })
      return
    }

    const existingItem = cart.find((item) => item.id === product.id)
    const minPrice = getMinimumSellPrice(product)
    const basePrice = isWholesalePage
      ? Number(product.wholesalePrice ?? product.sellPrice ?? 0)
      : Number(product.sellPrice ?? 0)
    const needsMinAdjustment = minPrice > 0 && basePrice < minPrice
    const priceToUse = needsMinAdjustment ? minPrice : basePrice

    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        toast({
          title: "Inventario insuficiente",
          description: `Solo hay ${product.stock} unidades disponibles`,
          variant: "destructive",
        })
        return
      }
      updateCartItemQuantity(existingItem.cartId, existingItem.quantity + 1)
    } else {
      setCart([
        ...cart,
        {
          ...product,
          cartId: Math.random().toString(),
          quantity: 1,
          customPrice: priceToUse,
        },
      ])
      if (needsMinAdjustment) {
        toast({
          title: "Precio ajustado al minimo",
          description: `${product.name} fue ajustado al precio minimo de venta ($${formatCurrency(minPrice)}).`,
        })
      }
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      const code = searchTerm.trim()
      if (!code) return

      const normalizedCode = normalizeSearchValue(code)

      // Try to find an exact match by SKU, formatted SKU, Product ID, or Source ID
      const match = searchableVisibleProducts.find(
        (item) =>
          normalizeExactIdValue(item.normalizedSku) === normalizeExactIdValue(normalizedCode) ||
          normalizeExactIdValue(item.normalizedFormattedSku) === normalizeExactIdValue(normalizedCode) ||
          normalizeExactIdValue(item.normalizedProductId) === normalizeExactIdValue(normalizedCode) ||
          normalizeExactIdValue(item.normalizedSourceId) === normalizeExactIdValue(normalizedCode)
      )

      if (match) {
        await addToCart(match.product)
        setSearchTerm("")
        toast({
          title: "Producto agregado",
          description: `${match.product.name} fue agregado al carrito.`,
        })
      } else {
        toast({
          title: "No encontrado",
          description: `No se encontró ningún producto con el código "${code}".`,
          variant: "destructive",
        })
      }

      // Maintain focus on the search input for the next scan
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    }
  }

  const updateQuantity = (cartId: string, newQuantity: number) => {
    const item = cart.find((i) => i.cartId === cartId)
    if (!item) return

    if (newQuantity <= 0) {
      removeFromCart(cartId)
      return
    }

    if (newQuantity > item.stock) {
      toast({
        title: "Inventario insuficiente",
        description: `Solo hay ${item.stock} unidades disponibles`,
        variant: "destructive",
      })
      return
    }

    // TODO: Update quantity in DB if it's a manual item with dbId?
    // For now, we only track the initial addition. If user changes quantity, we might need to update.
    // Given the complexity, let's assume quantity changes on manual items are rare or handled by delete/add,
    // OR we should ideally update the DB record.
    // User request was "desde que precione en agregar... se tiene que guardar".
    // I will leave quantity updates local for now to avoid excessive DB calls, but ideally we should update.

    updateCartItemQuantity(cartId, newQuantity)
  }

  const handleRemoveFromCart = async (cartId: string) => {
    removeFromCart(cartId)
  }

  const handleClearCart = async () => {
    clearCart()
    setDiscount(0)
  }

  const subtotal = cart.reduce((sum, item) => {
    const unitPrice = Number(item.customPrice ?? item.sellPrice ?? 0)
    const quantity = Number(item.quantity) || 0
    const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0
    return sum + safeUnitPrice * Math.max(0, quantity)
  }, 0)

  const discountAmount = Math.max(0, Math.min(discount, subtotal))
  const total = Math.max(0, subtotal - discountAmount)

  const isAlmacenInventoryProduct = useCallback((item: Partial<Product | CartItem>) => {
    const runtimeSource = parseSourceRuntimeId(item.id)
    if (runtimeSource?.sourceTable) return runtimeSource.sourceTable === "armacen"

    const explicitSource = normalizeInventorySourceTable(item.sourceTable)
    if (explicitSource) return explicitSource === "armacen"

    const hasBoxNumber = Boolean(normalizeAlmacenBoxNumber(item.boxNumber))
    if (hasBoxNumber) return true

    // Fallback solo para datos legacy sin metadata de origen.
    const hasLegacySourceMetadata = Boolean(item.id || item.sourceId || item.sourceTable)
    const hasKnownAlmacenCategory = isAlmacenCategory(item.category)
    return !hasLegacySourceMetadata && hasKnownAlmacenCategory
  }, [])

  const visibleProducts = useMemo(() => {
    if (showAlmacenProductsOnly) {
      return products.filter((product) => isAlmacenInventoryProduct(product))
    }

    return products.filter((product) => !isAlmacenInventoryProduct(product))
  }, [isAlmacenInventoryProduct, products, showAlmacenProductsOnly])

  const almacenCategoryOptions = useMemo(() => {
    const map = new Map<string, string>()

    products.forEach((product) => {
      if (!isAlmacenInventoryProduct(product)) return
      const value = getAlmacenCategoryFilterValue(product.category)
      if (!value) return
      map.set(value, getAlmacenCategoryLabel(product.category))
    })

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
  }, [isAlmacenInventoryProduct, products])

  const almacenBoxOptions = useMemo(() => {
    const boxes = new Set<string>()
    products.forEach((product) => {
      const normalizedBox = normalizeAlmacenBoxNumber(product.boxNumber)
      if (!isAlmacenInventoryProduct(product) || !normalizedBox) return
      boxes.add(normalizedBox)
    })
    return Array.from(boxes).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
  }, [isAlmacenInventoryProduct, products])

  const searchableVisibleProducts = useMemo(() => {
    return visibleProducts.map((product) => {
      const boxValue = normalizeAlmacenBoxNumber(product.boxNumber)
      const categoryLabel = getAlmacenCategoryLabel(product.category)
      const normalizedName = normalizeSearchValue(product.name || "")
      const normalizedSku = normalizeSearchValue(product.sku || "")
      const normalizedNumericSku = normalizeNumericSearchValue(product.sku || "")
      const normalizedFormattedSku = normalizeSearchValue(formatAlmacenSku(product.sku || ""))
      const normalizedNumericFormattedSku = normalizeNumericSearchValue(formatAlmacenSku(product.sku || ""))
      const normalizedProductId = normalizeSearchValue(product.id || "")
      const normalizedSourceId = normalizeSearchValue(product.sourceId || "")
      const normalizedBox = normalizeSearchValue(boxValue)
      const normalizedCategory = normalizeSearchValue(categoryLabel)
      const searchableText = normalizeSearchValue(
        `${product.name || ""} ${product.sku || ""} ${formatAlmacenSku(product.sku || "")} ${normalizedNumericSku} ${normalizedNumericFormattedSku} ${product.id || ""} ${product.sourceId || ""} ${boxValue} ${categoryLabel}`,
      )
      const compactSearchText = compactSearchValue(searchableText)
      const searchWords = Array.from(new Set(searchableText.split(" ").filter(Boolean)))

      return {
        product,
        categoryValue: getAlmacenCategoryFilterValue(product.category),
        boxValue,
        normalizedName,
        normalizedSku,
        normalizedNumericSku,
        normalizedFormattedSku,
        normalizedNumericFormattedSku,
        normalizedProductId,
        normalizedSourceId,
        normalizedBox,
        normalizedCategory,
        searchableText,
        compactSearchText,
        searchWords,
      }
    })
  }, [visibleProducts])

  const matchesSearchToken = useCallback(
    (
      token: string,
      searchable: {
        normalizedName: string
        normalizedSku: string
        normalizedNumericSku: string
        normalizedFormattedSku: string
        normalizedNumericFormattedSku: string
        normalizedProductId: string
        normalizedSourceId: string
        normalizedBox: string
        normalizedCategory: string
        searchableText: string
        compactSearchText: string
        searchWords: string[]
      },
    ) => {
      if (!token) return true

      const compactToken = token.replace(/\s+/g, "")
      if (!compactToken) return true

      if (
        searchable.normalizedName.includes(token) ||
        searchable.normalizedSku.includes(token) ||
        searchable.normalizedNumericSku.includes(token) ||
        searchable.normalizedFormattedSku.includes(token) ||
        searchable.normalizedNumericFormattedSku.includes(token) ||
        searchable.normalizedProductId.includes(token) ||
        searchable.normalizedSourceId.includes(token) ||
        searchable.normalizedBox.includes(token) ||
        searchable.normalizedCategory.includes(token) ||
        searchable.searchableText.includes(token) ||
        searchable.compactSearchText.includes(compactToken)
      ) {
        return true
      }

      if (searchable.searchWords.some((word) => word.startsWith(token) || token.startsWith(word))) {
        return true
      }

      if (token.length >= 4) {
        const allowedDistance = token.length >= 8 ? 2 : 1
        return searchable.searchWords.some((word) => levenshteinWithin(token, word, allowedDistance))
      }

      return false
    },
    [],
  )

  const matchesGeneralSearchToken = useCallback(
    (
      token: string,
      searchable: {
        normalizedName: string
        normalizedSku: string
        normalizedFormattedSku: string
        normalizedProductId: string
        normalizedSourceId: string
        searchableText: string
        compactSearchText: string
        searchWords: string[]
      },
    ) => {
      if (!token) return true

      const compactToken = token.replace(/\s+/g, "")
      if (!compactToken) return true

      if (
        searchable.normalizedName.includes(token) ||
        searchable.normalizedSku.includes(token) ||
        searchable.normalizedNumericSku.includes(token) ||
        searchable.normalizedFormattedSku.includes(token) ||
        searchable.normalizedNumericFormattedSku.includes(token)
      ) {
        return true
      }

      if (searchable.searchWords.some((word) => word.startsWith(token))) {
        return true
      }

      if (token.length >= 5) {
        return searchable.searchWords.some((word) => {
          if (word.length < 4) return false
          return levenshteinWithin(token, word, 1)
        })
      }

      return false
    },
    [],
  )

  const filteredProducts = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(searchTerm)
    const searchTokens = normalizedSearch.split(" ").filter(Boolean)
    const exactIdToken = searchTokens.length === 1 ? normalizeExactIdValue(searchTokens[0]) : ""

    if (exactIdToken) {
      const exactIdMatches = searchableVisibleProducts
        .filter((item) => {
          const idCandidates = [
            item.normalizedSku,
            item.normalizedFormattedSku,
            item.normalizedProductId,
            item.normalizedSourceId,
          ]

          return idCandidates.some((candidate) => normalizeExactIdValue(candidate) === exactIdToken)
        })
        .map((item) => item.product)

      if (exactIdMatches.length > 0) {
        return exactIdMatches
      }
    }

    const filtered = searchableVisibleProducts
      .filter((item) => {
      if (showAlmacenProductsOnly) {
        if (almacenCategoryFilter !== "all" && item.categoryValue !== almacenCategoryFilter) return false
        if (almacenBoxFilter !== "all" && item.boxValue !== almacenBoxFilter) return false
      }

      if (searchTokens.length === 0) return true
      return searchTokens.every((token) =>
        showAlmacenProductsOnly ? matchesSearchToken(token, item) : matchesGeneralSearchToken(token, item),
      )
      })

    if (searchTokens.length === 0 || showAlmacenProductsOnly) {
      return filtered.map((item) => item.product)
    }

    const primaryToken = searchTokens[0]

    return filtered
      .map((item, index) => {
        let score = 0
        if (item.normalizedSku === primaryToken || item.normalizedFormattedSku === primaryToken) score += 150
        if (item.normalizedProductId === primaryToken || item.normalizedSourceId === primaryToken) score += 140
        if (item.normalizedName === primaryToken) score += 120
        if (item.normalizedName.startsWith(primaryToken)) score += 70
        if (item.normalizedSku.startsWith(primaryToken) || item.normalizedFormattedSku.startsWith(primaryToken)) score += 65
        if (item.searchableText.startsWith(primaryToken)) score += 25
        return { item, index, score }
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.index - b.index
      })
      .map(({ item }) => item.product)
  }, [
    almacenBoxFilter,
    almacenCategoryFilter,
    matchesGeneralSearchToken,
    matchesSearchToken,
    searchableVisibleProducts,
    searchTerm,
    showAlmacenProductsOnly,
  ])

  const productsToDisplay = useMemo(
    () => (searchTerm.trim() ? filteredProducts : filteredProducts.slice(0, visibleProductLimit)),
    [filteredProducts, searchTerm, visibleProductLimit],
  )

  const handleLoadMoreProducts = async () => {
    if (loadingMoreProducts || !hasMoreProducts) return

    setLoadingMoreProducts(true)
    try {
      const loadedCount = await loadMoreProducts(showAlmacenProductsOnly ? "armacen" : "products")
      if (loadedCount === 0) setHasMoreProducts(false)
      else setVisibleProductLimit((current) => current + 25)
    } catch (error) {
      console.warn("No se pudieron cargar más productos:", error)
    } finally {
      setLoadingMoreProducts(false)
    }
  }

  const activeSalesTab = currentTab === "history" ? "history" : "pos"

  const almacenProductIds = useMemo(() => {
    const ids = new Set<string>()
    products.forEach((product) => {
      if (isAlmacenInventoryProduct(product)) {
        ids.add(product.id)
      }
    })
    return ids
  }, [isAlmacenInventoryProduct, products])

  const isAlmacenSaleItem = useCallback(
    (item: Partial<CartItem>) => {
      if (isAlmacenSourceRecord(item as Record<string, unknown>, almacenProductIds)) return true
      return Boolean(item.id && almacenProductIds.has(item.id))
    },
    [almacenProductIds],
  )

  const saleHasAlmacenItems = useCallback(
    (sale: Sale) => {
      if (!Array.isArray(sale.items) || sale.items.length === 0) return false
      return sale.items.some((item) => isAlmacenSaleItem(item))
    },
    [isAlmacenSaleItem],
  )

  const hasAlmacenItemsInCart = useMemo(() => cart.some((item) => isAlmacenSaleItem(item)), [cart, isAlmacenSaleItem])
  const hasNonAlmacenItemsInCart = useMemo(() => cart.some((item) => !isAlmacenSaleItem(item)), [cart, isAlmacenSaleItem])
  const hasMixedCart = hasAlmacenItemsInCart && hasNonAlmacenItemsInCart
  const selectedMixedAlmacenCustomer = useMemo(() => {
    if (!hasMixedCart) return null
    return almacenCustomersForCredit.find((customer) => customer.id === selectedAlmacenCustomerForCredit) || null
  }, [almacenCustomersForCredit, hasMixedCart, selectedAlmacenCustomerForCredit])
  const linkedMixedGeneralCustomer = useMemo(() => {
    const sourceCustomerId = selectedMixedAlmacenCustomer?.sourceCustomerId
    if (!sourceCustomerId) return null
    return customers.find((customer) => customer.id === sourceCustomerId) || null
  }, [customers, selectedMixedAlmacenCustomer?.sourceCustomerId])

  const getSaleLineSubtotal = (item: Partial<CartItem>) => {
    const quantity = Math.max(0, Number(item.quantity) || 0)
    const unitPrice = Number(item.customPrice ?? item.sellPrice ?? 0)
    return Math.max(0, quantity * (Number.isFinite(unitPrice) ? unitPrice : 0))
  }

  const calculateGeneralCustomerPortion = (saleData: Pick<Sale, "items" | "total" | "amountPaid" | "paymentMethod">) => {
      const saleItems = Array.isArray(saleData.items) ? saleData.items : []
      const saleItemsTotal = saleItems.reduce((sum, item) => sum + getSaleLineSubtotal(item), 0)
      const almacenItemsTotal = saleItems
        .filter((item) => isAlmacenSaleItem(item))
        .reduce((sum, item) => sum + getSaleLineSubtotal(item), 0)

      const almacenRatio =
        saleItemsTotal > 0 ? Math.max(0, Math.min(1, almacenItemsTotal / saleItemsTotal)) : 0
      const nonAlmacenRatio = Math.max(0, 1 - almacenRatio)

      const saleTotal = Math.max(0, Number(saleData.total) || 0)
      const amountPaid = Math.min(saleTotal, Math.max(0, Number(saleData.amountPaid) || 0))
      const method =
        saleData.paymentMethod === "cash" ||
        saleData.paymentMethod === "card" ||
        saleData.paymentMethod === "transfer" ||
        saleData.paymentMethod === "credit"
          ? saleData.paymentMethod
          : "cash"

      const totals = { cash: 0, card: 0, transfer: 0, credit: 0 }
      if (method === "credit") {
        totals.credit = saleTotal
      } else {
        const isPartialCredit = amountPaid > 0 && amountPaid < saleTotal
        if (isPartialCredit) {
          totals[method] = amountPaid
          totals.credit = saleTotal - amountPaid
        } else {
          totals[method] = saleTotal
        }
      }

      const nonAlmacenTotal = saleTotal * nonAlmacenRatio
      const nonAlmacenCredit = totals.credit * nonAlmacenRatio

      return {
        nonAlmacenTotal,
        nonAlmacenCredit,
      }
    }

  const years = useMemo(() => {
    return [...new Set(sales.map((s) => new Date(s.date).getFullYear()))].sort((a, b) => b - a)
  }, [sales])

  const months = useMemo(() => [
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
  ], [])

  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => (i + 1).toString()), [])

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const saleDate = new Date(sale.date)
      const matchesDay = filterDay === "all" || saleDate.getDate() === Number.parseInt(filterDay)
      const matchesMonth = filterMonth === "all" || saleDate.getMonth() + 1 === Number.parseInt(filterMonth)
      const matchesYear = filterYear === "all" || saleDate.getFullYear() === Number.parseInt(filterYear)
      const hasAlmacenItems = saleHasAlmacenItems(sale)
      const matchesSaleType =
        filterSaleType === "all" ||
        (filterSaleType === "almacen" && hasAlmacenItems) ||
        (filterSaleType === "general" && !hasAlmacenItems)

      return matchesDay && matchesMonth && matchesYear && matchesSaleType
    })
  }, [filterDay, filterMonth, filterSaleType, filterYear, saleHasAlmacenItems, sales])

  const getSaleDisplayedAmount = (sale: Sale) => {
    const saleTotal = Math.max(0, Number(sale.total) || 0)
    const amountPaid = Math.min(saleTotal, Math.max(0, Number(sale.amountPaid) || 0))
    const isCreditSale = sale.status === "credito" || sale.paymentMethod === "credit"

    // Las ventas parciales muestran en el listado solo lo cobrado.
    // Las ventas antiguas de contado sin amountPaid conservan su total.
    return isCreditSale || amountPaid > 0 ? amountPaid : saleTotal
  }

  const roundMoney = (value: number) => Math.round((Number(value) || 0) * 100) / 100

  const getSaleCreditTotal = (saleTotal: number, amountPaid: number, paymentMethod?: string) => {
    const totalValue = Math.max(0, Number(saleTotal) || 0)
    const paidValue = Math.min(totalValue, Math.max(0, Number(amountPaid) || 0))
    const method =
      paymentMethod === "cash" || paymentMethod === "card" || paymentMethod === "transfer" || paymentMethod === "credit"
        ? paymentMethod
        : "cash"

    if (totalValue <= 0) return 0
    if (method === "credit") return totalValue
    if (paidValue > 0 && paidValue < totalValue) return totalValue - paidValue
    return 0
  }

  const getAlmacenRatioFromItems = (items: Array<Partial<CartItem>>) => {
    const safeItems = Array.isArray(items) ? items : []
    const itemsTotal = safeItems.reduce((sum, item) => sum + getSaleLineSubtotal(item), 0)
    const almacenTotal = safeItems
      .filter((item) => isAlmacenSaleItem(item))
      .reduce((sum, item) => sum + getSaleLineSubtotal(item), 0)

    if (itemsTotal > 0) return Math.max(0, Math.min(1, almacenTotal / itemsTotal))

    const almacenCount = safeItems.filter((item) => isAlmacenSaleItem(item)).length
    if (almacenCount > 0 && almacenCount === safeItems.length) return 1
    return 0
  }

  const calculateCreditSplit = (saleData: Pick<Sale, "items" | "total" | "amountPaid" | "paymentMethod">) => {
    const saleTotal = Math.max(0, Number(saleData.total) || 0)
    const amountPaid = Math.min(saleTotal, Math.max(0, Number(saleData.amountPaid) || 0))
    const creditTotal = getSaleCreditTotal(saleTotal, amountPaid, saleData.paymentMethod)
    const almacenRatio = getAlmacenRatioFromItems(Array.isArray(saleData.items) ? saleData.items : [])
    const generalRatio = Math.max(0, 1 - almacenRatio)

    const generalTotalAmount = roundMoney(saleTotal * generalRatio)
    const generalCreditAmount = roundMoney(creditTotal * generalRatio)
    const almacenCreditAmount = roundMoney(Math.max(0, creditTotal - generalCreditAmount))

    return { generalTotalAmount, generalCreditAmount, almacenCreditAmount }
  }

  const updateGeneralCustomerDebt = async (
    customerId: string,
    split: { generalTotalAmount: number; generalCreditAmount: number },
  ) => {
    const customer = customers.find((c) => c.id === customerId)
    if (!customer) return

    if (split.generalTotalAmount <= 0 && split.generalCreditAmount <= 0) return

    const nextDebt = roundMoney((Number(customer.debt) || 0) + split.generalCreditAmount)
    const nextPurchases = roundMoney((Number(customer.totalPurchases) || 0) + split.generalTotalAmount)

    await updateCustomer(customer.id, {
      debt: nextDebt,
      totalPurchases: nextPurchases,
      status: nextDebt > 0 ? "En proceso" : "Finalizado",
    })
  }

  const buildCreditSplitToastDescription = ({
    customerName,
    generalCreditAmount,
    almacenCreditAmount,
  }: {
    customerName: string
    generalCreditAmount: number
    almacenCreditAmount: number
  }) => {
    if (generalCreditAmount > 0 && almacenCreditAmount > 0) {
      return `Se agrego ${formatCurrency(generalCreditAmount)} a la deuda general y ${formatCurrency(almacenCreditAmount)} a Cliente Almacen.`
    }
    if (generalCreditAmount > 0) {
      return `Se agrego ${formatCurrency(generalCreditAmount)} a la deuda general de ${customerName}.`
    }
    if (almacenCreditAmount > 0) {
      return `Se agrego ${formatCurrency(almacenCreditAmount)} a Cliente Almacen para ${customerName}.`
    }
    return "Venta registrada."
  }

  const handleGoToClienteAlmacenCredit = useCallback(() => {
    setShowCreditDialog(false)
    navigate("/cliente-almacen")
    toast({
      title: "Flujo Cliente Almacén",
      description: "Usa \"Nueva Venta (Almacen)\" para registrar este crédito en su módulo correspondiente.",
    })
  }, [navigate, toast])

  const openSaleTypeDialog = useCallback(() => {
    if (cart.length === 0) return
    if (!requireMinPrices(cart, "continuar con la venta")) return
    setShowSaleTypeDialog(true)
  }, [cart, requireMinPrices])

  const handleSelectSaleType = useCallback(
    (type: "normal" | "credit" | "wholesale") => {
      setSaleTypeMode(type)
      setShowSaleTypeDialog(false)

      if (type === "credit") {
        setShowCreditTypeDialog(true)
        return
      }

      if (type === "wholesale") {
        setShowWholesaleDialog(true)
        return
      }

      setPaymentMethod("cash")
      setAmountPaid("")
      setCustomerName("")
      setCustomerPhone("")
      setShowCheckoutDialog(true)
    },
    [applyWholesalePricesToCart],
  )

  const handleConfirmWholesalePrices = useCallback(() => {
    applyWholesalePricesToCart()
    setShowWholesaleDialog(false)
    setPaymentMethod("cash")
    setAmountPaid("")
    setCustomerName("")
    setCustomerPhone("")
    setShowCheckoutDialog(true)
  }, [applyWholesalePricesToCart])

  const handleCreditSale = async () => {
    if (cart.length === 0) return
    if (!requireMinPrices(cart, "agregar la venta a credito")) return

    // Caso 1: Crédito del Cliente del Almacén
    if (creditDialogMode === "almacen") {
      if (hasNonAlmacenItemsInCart) {
        setCreditDialogMode("regular")
        toast({
          title: "Venta mixta detectada",
          description:
            "Se habilito el flujo mixto. Selecciona cliente regular (catalogo) y cliente de almacen para dividir el credito.",
        })
        return
      }

      if (!almacenCustomerName.trim()) {
        toast({
          title: "Error",
          description: "Seleccione o ingrese un cliente del almacén.",
          variant: "destructive",
        })
        return
      }

      setIsProcessingCreditSale(true)
      try {
        const saleItems: CartItem[] = cart.map((item) => ({
          ...item,
        }))

        const result = await createAlmacenSale({
          items: saleItems,
          paymentMethod: "credit",
          amountPaid: 0,
          customerName: almacenCustomerName.trim(),
          customerPhone: almacenCustomerPhone.trim(),
          sourceCustomerId: almacenSourceCustomerId,
        })

        if (!result?.success) {
          toast({
            title: "Error",
            description: "No se pudo registrar la venta a crédito del almacén.",
            variant: "destructive",
          })
          return
        }

        setCurrentInvoice(result.sale || null)
        clearCart()
        setDiscount(0)
        setSelectedAlmacenCustomerForCredit("")
        setAlmacenCustomerName("")
        setAlmacenCustomerPhone("")
        setAlmacenSourceCustomerId(null)
        setShowCreditDialog(false)
        setCreditDialogMode("type")
        setShowInvoiceDialog(true)

        toast({
          title: "Venta a crédito registrada",
          description: `Se registró un crédito de $${formatCurrency(result.sale?.total || 0)} para ${almacenCustomerName} en Cliente del Almacén.`,
        })
      } catch (err) {
        console.error("Error registrando venta a crédito del almacén:", err)
        toast({
          title: "Error",
          description: (err as any)?.message || "Ocurrió un error al guardar la venta.",
          variant: "destructive",
        })
      } finally {
        setIsProcessingCreditSale(false)
      }
      return
    }

    // Caso 2: Crédito para Cliente Regular (incluye mixto)
    const selectedAlmacenCustomer = hasMixedCart ? selectedMixedAlmacenCustomer : null
    if (hasMixedCart && !selectedAlmacenCustomer) {
      toast({
        title: "Seleccione cliente de almacén",
        description: "Selecciona un cliente de Cliente Almacen para continuar con la venta mixta.",
        variant: "destructive",
      })
      return
    }

    const customer = hasMixedCart
      ? linkedMixedGeneralCustomer
      : customers.find((c) => c.id === selectedCustomerForCredit) || null

    if (hasMixedCart && selectedAlmacenCustomer && !selectedAlmacenCustomer.sourceCustomerId) {
      toast({
        title: "Falta vincular cliente general",
        description: "Usa 'Tomar de /clientes' para vincular este cliente de almacén a /clientes.",
        variant: "destructive",
      })
      return
    }

    if (!customer) {
      toast({
        title: "Error",
        description: hasMixedCart
          ? "No se encontro el cliente vinculado en /clientes. Importa uno rapido desde /clientes."
          : "Seleccione un cliente válido.",
        variant: "destructive",
      })
      return
    }

    const existingEditingSale = sales.find((sale) => sale.id === editingQueuedSale?.id)
    const editingSale = editingQueuedSale || existingEditingSale
    const newSale: Sale & {
      almacenCustomerAccountId?: string
      almacenCustomerName?: string
      almacenCustomerPhone?: string
      almacenSourceCustomerId?: string | null
    } = {
      id: editingSale?.id || generateUUID(),
      invoiceNumber: editingSale?.invoiceNumber || generateInvoiceNumber(),
      date: new Date().toISOString(),
      createdAt: editingSale?.createdAt || new Date().toISOString(),
      items: [...cart],
      total,
      amountPaid: 0,
      change: 0,
      paymentMethod: "credit",
      customerName: customer.name,
      customerPhone: customer.phone || undefined,
      customerId: customer.id,
      almacenCustomerAccountId: selectedAlmacenCustomer?.id,
      almacenCustomerName: selectedAlmacenCustomer?.name,
      almacenCustomerPhone: selectedAlmacenCustomer?.phone || undefined,
      almacenSourceCustomerId: selectedAlmacenCustomer?.sourceCustomerId ?? null,
      discount: discount > 0 ? discount : undefined,
      status: "credito",
      isWholesale: isWholesalePage,
      createdByEmployeeId: currentUser?.id || editingSale?.createdByEmployeeId || undefined,
    }

    setIsProcessingCreditSale(true)
    try {
      const result = existingEditingSale
        ? (await updateSale(newSale.id, {
            date: newSale.date,
            items: newSale.items,
            total: newSale.total,
            amountPaid: newSale.amountPaid,
            change: newSale.change,
            paymentMethod: newSale.paymentMethod,
            customerName: newSale.customerName,
            customerPhone: newSale.customerPhone,
            customerId: newSale.customerId,
            status: newSale.status,
            createdByEmployeeId: newSale.createdByEmployeeId,
          }), { success: true })
        : await addSale(newSale)

      if (!result?.success) {
        toast({
          title: "Error",
          description: "No se pudo registrar la venta a crédito.",
          variant: "destructive",
        })
        return
      }

      const split = calculateCreditSplit(newSale)
      await updateGeneralCustomerDebt(customer.id, split)

      setCurrentInvoice(newSale)
      clearCart()
      setDiscount(0)
      setSelectedCustomerForCredit("")
      setSelectedAlmacenCustomerForCredit("")
      setAlmacenCustomerName("")
      setAlmacenCustomerPhone("")
      setAlmacenSourceCustomerId(null)
      setSelectedGeneralCustomerForAlmacenCredit("none")
      setEditingQueuedSale(null)
      setShowCreditDialog(false)
      setCreditDialogMode("type")
      setShowInvoiceDialog(true)

      toast({
        title: "Venta a crédito registrada",
        description: buildCreditSplitToastDescription({
          customerName: customer.name,
          generalCreditAmount: split.generalCreditAmount,
          almacenCreditAmount: split.almacenCreditAmount,
        }),
      })
    } catch (err) {
      console.error("Error registrando venta a crédito:", err)
      toast({
        title: "Error",
        description: (err as any)?.message || "Ocurrió un error al guardar la venta a crédito.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingCreditSale(false)
    }
  }

  const handlePartialCreditConfirm = async () => {
    if (cart.length === 0) return
    if (!requireMinPrices(cart, "confirmar la venta con credito")) return

    const paid = Math.max(0, Number(partialCashPaid) || 0)
    if (paid <= 0) {
      toast({
        title: "Monto invalido",
        description: "El monto pagado debe ser mayor a 0.",
        variant: "destructive",
      })
      return
    }

    let customerId = ""
    let customerNameForSale = ""
    let customerPhoneForSale = ""

    if (partialCreditMode === "existing") {
      const existing = customers.find((c) => c.id === selectedCustomerForPartialCredit)
      if (!existing) {
        toast({
          title: "Seleccione cliente",
          description: "Debe seleccionar un cliente existente.",
          variant: "destructive",
        })
        return
      }
      customerId = existing.id
      customerNameForSale = existing.name
      customerPhoneForSale = existing.phone || ""
    } else {
      const name = newCreditCustomerName.trim()
      if (!name) {
        toast({
          title: "Nombre requerido",
          description: "Escriba el nombre del nuevo cliente.",
          variant: "destructive",
        })
        return
      }

      setIsProcessingPartialCredit(true)
      try {
        const newId = await addCustomer({
          name,
          phone: newCreditCustomerPhone.trim(),
          cedula: newCreditCustomerCedula.trim(),
          email: newCreditCustomerEmail.trim(),
          address: newCreditCustomerAddress.trim(),
          notes: newCreditCustomerNotes.trim(),
          debt: Number.parseFloat(newCreditCustomerDebt) || 0,
          totalPurchases: 0,
          creditBalance: 0,
          creditLimit: Number.parseFloat(newCreditCustomerCreditLimit) || 0,
          creditDevice: newCreditCustomerCreditDevice.trim(),
          status: "En proceso",
        })

        if (!newId) {
          toast({
            title: "Error",
            description: "No se pudo crear el cliente.",
            variant: "destructive",
          })
          return
        }

        customerId = newId
        customerNameForSale = name
        customerPhoneForSale = newCreditCustomerPhone.trim()
      } finally {
        setIsProcessingPartialCredit(false)
      }
    }

    const saleTotal = roundMoney(total)
    if (paid >= saleTotal) {
      toast({
        title: "No aplica",
        description: "El monto pagado cubre el total. Use Finalizar Venta normal.",
      })
      return
    }

    const existingEditingSale = sales.find((sale) => sale.id === editingQueuedSale?.id)
    const editingSale = editingQueuedSale || existingEditingSale
    const newSale: Sale = {
      id: editingSale?.id || generateUUID(),
      invoiceNumber: editingSale?.invoiceNumber || generateInvoiceNumber(),
      date: new Date().toISOString(),
      createdAt: editingSale?.createdAt || new Date().toISOString(),
      items: [...cart],
      total: saleTotal,
      amountPaid: paid,
      change: 0,
      paymentMethod: paymentMethod,
      customerName: customerNameForSale || undefined,
      customerPhone: customerPhoneForSale || undefined,
      customerId: customerId || undefined,
      discount: discount > 0 ? discount : undefined,
      status: "credito",
      isWholesale: isWholesalePage,
      createdByEmployeeId: currentUser?.id || editingSale?.createdByEmployeeId || undefined,
    }

    setIsProcessingPartialCredit(true)
    try {
      const result = existingEditingSale
        ? (await updateSale(newSale.id, {
            date: newSale.date,
            items: newSale.items,
            total: newSale.total,
            amountPaid: newSale.amountPaid,
            change: newSale.change,
            paymentMethod: newSale.paymentMethod,
            customerName: newSale.customerName,
            customerPhone: newSale.customerPhone,
            customerId: newSale.customerId,
            status: newSale.status,
            createdByEmployeeId: newSale.createdByEmployeeId,
          }), { success: true })
        : await addSale(newSale)
      if (!result?.success) {
        toast({
          title: "Error",
          description: "No se pudo registrar la venta con credito.",
          variant: "destructive",
        })
        return
      }

      const split = calculateCreditSplit(newSale)
      await updateGeneralCustomerDebt(customerId, split)

      setCurrentInvoice(newSale)
      clearCart()
      setCustomerName("")
      setCustomerPhone("")
      setPaymentMethod("cash")
      setAmountPaid("")
      setDiscount(0)
      setEditingQueuedSale(null)
      setShowPartialCreditDialog(false)
      setShowInvoiceDialog(true)

      toast({
        title: "Venta con credito registrada",
        description: buildCreditSplitToastDescription({
          customerName: customerNameForSale || "Cliente",
          generalCreditAmount: split.generalCreditAmount,
          almacenCreditAmount: split.almacenCreditAmount,
        }),
      })
    } catch (err) {
      console.error("Error registrando venta con credito:", err)
      toast({
        title: "Error",
        description: (err as any)?.message || "Ocurrio un error al guardar la venta con credito.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingPartialCredit(false)
    }
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return
    if (!requireMinPrices(cart, "completar la venta")) return

    const parsedPaid = Number.parseFloat(amountPaid)
    const paid = Math.max(0, Number.isFinite(parsedPaid) ? parsedPaid : total)
    const changeAmount = roundMoney(Math.max(0, paid - total))



    if (paid < total) {
      // Allow partial payments for all payment methods (cash, card, transfer)
      setPartialCashPaid(paid)
      setPartialCreditAmount(total - paid)
      setPartialCreditMode("existing")
      setSelectedCustomerForPartialCredit("")
      setNewCreditCustomerName("")
      setNewCreditCustomerPhone("")
      setNewCreditCustomerCedula("")
      setNewCreditCustomerEmail("")
      setNewCreditCustomerAddress("")
      setNewCreditCustomerNotes("")
      setNewCreditCustomerDebt("0")
      setShowCheckoutDialog(false)
      setShowPartialCreditDialog(true)
      return
    }

    const existingEditingSale = sales.find((sale) => sale.id === editingQueuedSale?.id)
    const editingSale = editingQueuedSale || existingEditingSale
    const newSale: Sale = {
      id: editingSale?.id || generateUUID(),
      invoiceNumber: editingSale?.invoiceNumber || generateInvoiceNumber(),
      date: new Date().toISOString(),
      createdAt: editingSale?.createdAt || new Date().toISOString(),
      items: [...cart],
      total,
      amountPaid: paid,
      change: changeAmount,
      paymentMethod,
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      discount: discount > 0 ? discount : undefined,
      customerId: editingSale?.customerId,
      status: "completada",
      isWholesale: isWholesalePage,
      createdByEmployeeId: currentUser?.id || editingSale?.createdByEmployeeId || undefined,
    }

    setIsProcessingCheckout(true)
    try {
      // Clear UI immediately
      setCurrentInvoice(newSale)
      clearCart()
      setCustomerName("")
      setCustomerPhone("")
      setPaymentMethod("cash")
      setAmountPaid("")
      setDiscount(0)
      setEditingQueuedSale(null)
      setShowCheckoutDialog(false)
      setShowInvoiceDialog(true)

      const result = existingEditingSale
        ? (await updateSale(newSale.id, {
            date: newSale.date,
            items: newSale.items,
            total: newSale.total,
            amountPaid: newSale.amountPaid,
            change: newSale.change,
            paymentMethod: newSale.paymentMethod,
            customerName: newSale.customerName,
            customerPhone: newSale.customerPhone,
            customerId: newSale.customerId,
            status: newSale.status,
            createdByEmployeeId: newSale.createdByEmployeeId,
          }), { success: true })
        : await addSale(newSale)

      if (editingSale?.customerId) {
        const linkedCustomer = customers.find((customer) => customer.id === editingSale.customerId)
        if (linkedCustomer) {
          await updateCustomer(linkedCustomer.id, {
            totalPurchases: linkedCustomer.totalPurchases + newSale.total,
          })
        }
      }

      if (result && result.success) {
        await syncRepairStatusForSale(newSale.items, "entregado")
        toast({
          title: "Venta completada",
          description: `Factura ${newSale.invoiceNumber} registrada correctamente.`,
        })
      } else {
        toast({
          title: "Error",
          description: "No se pudo registrar la venta.",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Error registrando venta:", err)
      toast({
        title: "Error",
        description: (err as any)?.message || "Ocurrio un error al completar la venta.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingCheckout(false)
    }
  }

  const generateInvoiceNumber = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const random = Math.floor(Math.random() * 10000000)
      .toString()
      .padStart(7, "0")
    return `INV-${year}${month}-${random}`
  }

  const openQueueDialog = useCallback(() => {
    if (cart.length === 0) {
      toast({
        title: "Carrito vacio",
        description: "Agrega productos antes de enviar a cola exclusiva.",
        variant: "destructive",
      })
      return
    }

    const existingEditingSale = sales.find((sale) => sale.id === editingQueuedSale?.id)
    const editingSale = editingQueuedSale || existingEditingSale
    setQueueCustomerType(editingSale?.customerId ? "credito" : "general")
    setQueueLabel(editingSale?.customerName || "")
    setQueueCreditCustomerId(editingSale?.customerId || "")
    setShowQueueDialog(true)
  }, [cart.length, editingQueuedSale, sales, toast])

  const handleSendToQueue = useCallback(async () => {
    if (cart.length === 0) return
    if (!requireMinPrices(cart, "enviar a cola exclusiva")) return

    const normalizedLabel = queueLabel.trim()
    const isGeneral = queueCustomerType === "general"

    if (!isGeneral && !queueCreditCustomerId) {
      toast({
        title: "Seleccione un cliente",
        description: "Elija el cliente a credito antes de enviar la pre-factura.",
        variant: "destructive",
      })
      return
    }

    const selectedCustomer = !isGeneral ? customers.find((c) => c.id === queueCreditCustomerId) : undefined
    if (!isGeneral && !selectedCustomer) {
      toast({
        title: "Cliente no encontrado",
        description: "Vuelva a seleccionar el cliente a credito.",
        variant: "destructive",
      })
      return
    }

    setIsSendingToQueue(true)
    try {
      const existingEditingSale = sales.find((sale) => sale.id === editingQueuedSale?.id)
      const editingSale = editingQueuedSale || existingEditingSale
      const queuedSale: Sale = {
        id: editingSale?.id || generateUUID(),
        invoiceNumber: editingSale?.invoiceNumber || generateInvoiceNumber(),
        date: new Date().toISOString(),
        createdAt: editingSale?.createdAt || new Date().toISOString(),
        items: [...cart],
        total,
        amountPaid: 0,
        change: 0,
        paymentMethod: "cash",
        customerName: isGeneral ? (normalizedLabel || undefined) : selectedCustomer?.name,
        customerPhone: selectedCustomer?.phone || undefined,
        customerId: selectedCustomer?.id,
        status: "pending",
        isWholesale: isWholesalePage,
        createdByEmployeeId: editingSale?.createdByEmployeeId || currentUser?.id || undefined,
      }

      const result = existingEditingSale
        ? (await updateSale(queuedSale.id, {
            date: queuedSale.date,
            items: queuedSale.items,
            total: queuedSale.total,
            amountPaid: 0,
            change: 0,
            paymentMethod: queuedSale.paymentMethod,
            customerName: queuedSale.customerName,
            customerPhone: queuedSale.customerPhone,
            customerId: queuedSale.customerId,
            status: "pending",
            createdByEmployeeId: queuedSale.createdByEmployeeId,
          }), { success: true })
        : await addSale(queuedSale)
      if (!result?.success) {
        throw result?.error || new Error("No se pudo enviar la pre-factura a cola exclusiva.")
      }
      const savedQueuedSale = result.sale || queuedSale

      await syncRepairStatusForSale(queuedSale.items, "listo")

      clearCart()
      setDiscount(0)
      setShowQueueDialog(false)
      setQueueLabel("")
      setQueueCustomerType("general")
      setQueueCreditCustomerId("")
      setEditingQueuedSale(null)
      setCurrentInvoice(savedQueuedSale)
      setShowInvoiceDialog(true)

      toast({
        title: "Enviado a cola exclusiva",
        description: `Se envio ${queuedSale.invoiceNumber} a /cola-exclusiva.`,
      })
    } catch (err) {
      console.error("Error sending queued sale:", err)
      toast({
        title: "Error",
        description: (err as any)?.message || "No se pudo enviar a cola exclusiva.",
        variant: "destructive",
      })
    } finally {
      setIsSendingToQueue(false)
    }
  }, [
    addSale,
    cart,
    clearCart,
    customers,
    currentUser,
    editingQueuedSale,
    queueCreditCustomerId,
    queueCustomerType,
    queueLabel,
    requireMinPrices,
    sales,
    syncRepairStatusForSale,
    updateSale,
    toast,
    total,
  ])

  const openFinalizeQueueDialog = useCallback((sale: Sale) => {
    setSelectedQueuedSale(sale)
    setQueuedPaymentMethod(
      sale.paymentMethod === "card" || sale.paymentMethod === "transfer" ? (sale.paymentMethod as any) : "cash",
    )
    setQueuedAmountPaid(String(sale.total ?? ""))
    setQueuedCustomerName(sale.customerName || "")
    setQueuedCustomerPhone(sale.customerPhone || "")
    setShowFinalizeQueueDialog(true)
  }, [])

  const handleFinalizeQueuedSale = useCallback(async () => {
    if (!selectedQueuedSale) return

    const saleTotal = Math.max(0, Number(selectedQueuedSale.total) || 0)
    const paidRaw = queuedAmountPaid === "" ? saleTotal : Number.parseFloat(queuedAmountPaid)
    const paid = Number.isFinite(paidRaw) ? paidRaw : 0

    setIsFinalizingQueuedSale(true)
    try {
      // Allow partial payments for all payment methods (cash, card, transfer)
      const saleStatus = paid < saleTotal ? "credito" : "completada"
      const creditAmount = paid < saleTotal ? saleTotal - paid : 0

      await updateSale(selectedQueuedSale.id, {
        status: saleStatus,
        paymentMethod: queuedPaymentMethod,
        amountPaid: paid,
        change: Math.max(0, paid - saleTotal),
        customerName: queuedCustomerName.trim() || selectedQueuedSale.customerName,
        customerPhone: queuedCustomerPhone.trim() || selectedQueuedSale.customerPhone,
      })
      await syncRepairStatusForSale(selectedQueuedSale.items, "entregado")

      // If it's a partial payment, update customer debt
      if (creditAmount > 0 && selectedQueuedSale.customerId) {
        const split = calculateCreditSplit({
          ...selectedQueuedSale,
          amountPaid: paid,
          paymentMethod: queuedPaymentMethod,
        })
        await updateGeneralCustomerDebt(selectedQueuedSale.customerId, split)
      }

      setShowFinalizeQueueDialog(false)
      setSelectedQueuedSale(null)
      setQueuedAmountPaid("")
      setQueuedCustomerName("")
      setQueuedCustomerPhone("")

      const statusText = saleStatus === "credito" ? "con crédito" : "completada"
      toast({
        title: "Pre-factura " + statusText,
        description: `Se finalizo ${selectedQueuedSale.invoiceNumber}.`,
      })
    } catch (err) {
      console.error("Error finalizing queued sale:", err)
      toast({
        title: "Error",
        description: (err as any)?.message || "No se pudo finalizar la pre-factura.",
        variant: "destructive",
      })
    } finally {
      setIsFinalizingQueuedSale(false)
    }
  }, [
    queuedAmountPaid,
    queuedCustomerName,
    queuedCustomerPhone,
    queuedPaymentMethod,
    selectedQueuedSale,
    syncRepairStatusForSale,
    toast,
    updateSale,
  ])

  return (
    <Tabs value={activeSalesTab} onValueChange={setCurrentTab} className="w-full h-full flex flex-col">
      <TabsList className="hidden">{/* TabsList content */}</TabsList>

      <TabsContent value="pos" className="mt-0 flex-1 overflow-x-hidden">
        <div className="grid gap-4 min-h-[calc(100vh-7rem)] overflow-x-hidden md:gap-6 md:grid-cols-[400px_1fr] md:h-[calc(100vh-6rem)]">
          <div className="flex h-full flex-col space-y-4 overflow-x-hidden md:order-2 md:space-y-6">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder={showAlmacenProductsOnly ? "Buscar por caja, nombre o ID..." : "Buscar productos..."}
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  autoFocus
                />
              </div>
              {canSeeAlmacen && (
                <Button
                  type="button"
                  variant={showAlmacenProductsOnly ? "default" : "outline"}
                  onClick={() =>
                    setShowAlmacenProductsOnly((prev) => {
                      const next = !prev
                      if (!next) {
                        setAlmacenCategoryFilter("all")
                        setAlmacenBoxFilter("all")
                      }
                      return next
                    })
                  }
                  className="shrink-0 w-full sm:w-auto"
                >
                  {showAlmacenProductsOnly ? "Ver Todo" : "Ver Almacen"}
                </Button>
              )}
            </div>

            {showAlmacenProductsOnly && (
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,230px)_minmax(0,140px)_auto]">
                <Select value={almacenCategoryFilter} onValueChange={setAlmacenCategoryFilter}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Componente" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                    <SelectItem value="all">Todos los componentes</SelectItem>
                    {almacenCategoryOptions.map((option) => (
                      <SelectItem key={`almacen-category-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={almacenBoxFilter} onValueChange={setAlmacenBoxFilter}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Caja" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                    <SelectItem value="all">Todas las cajas</SelectItem>
                    {almacenBoxOptions.map((box) => (
                      <SelectItem key={`almacen-box-${box}`} value={box}>
                        Caja {box}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {(almacenCategoryFilter !== "all" || almacenBoxFilter !== "all" || searchTerm.trim()) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full lg:w-auto"
                    onClick={() => {
                      setSearchTerm("")
                      setAlmacenCategoryFilter("all")
                      setAlmacenBoxFilter("all")
                    }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-24 pr-1 scroll-smooth sm:pr-2 md:pb-4">
              {/* Replaced inline grid with ProductGrid component for consistent CSS Grid layout */}
              {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
              {/* @ts-ignore-next-line */}
              { /* import dynamically to avoid TS errors if path resolution differs */}
              <ProductGrid
                products={productsToDisplay}
                onCardClick={addToCart}
                priceMode={isWholesalePage ? "wholesale" : "sell"}
              />
              {!searchTerm.trim() && hasMoreProducts && (
                <div className="flex justify-center py-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleLoadMoreProducts()}
                    disabled={loadingMoreProducts}
                  >
                    {loadingMoreProducts ? "Cargando..." : "Cargar 25 productos más"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="hidden h-full md:block">
            {renderCartCard()}
          </div>
        </div>

        <Dialog open={showMobileCartDialog} onOpenChange={setShowMobileCartDialog}>
          <DialogContent className="w-[95vw] max-w-[95vw] max-h-[calc(100vh-1rem)] overflow-y-auto p-3 sm:max-w-4xl sm:px-6">
            <div className="sr-only" role="document">
              <h2>Carrito de Venta</h2>
              <p>Revisa tu carrito antes de procesar la venta.</p>
            </div>
            <div className="mt-1">{renderCartCard()}</div>
          </DialogContent>
        </Dialog>

        <button
          type="button"
          aria-label="Abrir carrito de venta"
          onClick={() => setShowMobileCartDialog(true)}
          className="fixed bottom-4 right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/10 transition hover:bg-primary/90 md:hidden"
        >
          <ShoppingCart className="h-6 w-6" />
          {cartQuantity > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1.5 text-[0.65rem] font-semibold text-white">
              {cartQuantity}
            </span>
          )}
        </button>
      </TabsContent>

      <TabsContent value="history" className="mt-0">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle>Historial de Ventas</CardTitle>
            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2 lg:grid-cols-5">
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-full min-w-0 sm:w-[100px]">
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
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-full min-w-0 sm:w-[120px]">
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
              <Select value={filterDay} onValueChange={setFilterDay}>
                <SelectTrigger className="w-full min-w-0 sm:w-[100px]">
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
              <Select value={filterSaleType} onValueChange={setFilterSaleType}>
                <SelectTrigger className="w-full min-w-0 sm:w-[180px]">
                  <SelectValue placeholder="Tipo venta" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="almacen">Solo almacen</SelectItem>
                  <SelectItem value="general">Sin almacen</SelectItem>
                </SelectContent>
              </Select>
              {(filterDay !== "all" || filterMonth !== "all" || filterYear !== "all" || filterSaleType !== "all") && (
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setFilterDay("all")
                    setFilterMonth("all")
                    setFilterYear("all")
                    setFilterSaleType("all")
                  }}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {filteredSales.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No hay ventas registradas</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Productos facturados</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Metodo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="max-w-[280px] whitespace-normal text-xs font-medium">
                          {sale.items.length > 0 ? (
                            <div className="space-y-0.5">
                              {sale.items.map((item, index) => (
                                <div key={`${sale.id}-item-${index}`} className="leading-4">• {item.name || item.description || "Producto"}</div>
                              ))}
                            </div>
                          ) : "Sin productos"}
                        </TableCell>
                        <TableCell>{new Date(sale.date).toLocaleString("es-ES")}</TableCell>
                        <TableCell>{sale.customerName || "-"}</TableCell>
                        <TableCell>{sale.items.length}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {sale.status === "pending"
                              ? "En cola exclusiva"
                              : sale.paymentMethod === "cash"
                              ? "Efectivo"
                              : sale.paymentMethod === "card"
                                ? "Tarjeta"
                                : sale.paymentMethod === "credit"
                                  ? "A Crédito"
                                  : "Transferencia"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={sale.status === "pending" ? "secondary" : sale.status === "anulada" ? "destructive" : "default"}>
                            {sale.status === "pending"
                              ? "Pendiente"
                              : sale.status === "credito"
                                ? "Crédito"
                                : sale.status === "anulada"
                                  ? "Anulada"
                                  : "Completada"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">${formatCurrency(getSaleDisplayedAmount(sale))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => {
                              setCurrentInvoice(sale)
                              setShowInvoiceDialog(true)
                            }} title="Ver Factura">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                void printSaleInvoice(
                                  sale,
                                  customers,
                                  employeeForPrint,
                                  undefined,
                                  getSaleInvoicePersistOptions(currentUser?.adminId, sale.id, "tienda"),
                                )
                              }
                              title="Imprimir Factura"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {sale.status === "pending" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openFinalizeQueueDialog(sale)}
                                title="Finalizar y cobrar"
                              >
                                <CreditCard className="h-4 w-4 text-emerald-600" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar la factura ${sale.invoiceNumber}?`)) {
                                    deleteSale(sale.id)
                                    toast({ title: "Factura eliminada", description: `Se eliminó la factura ${sale.invoiceNumber}` })
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <Dialog open={showQueueDialog} onOpenChange={setShowQueueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Pre-factura a Cola Exclusiva</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {hasAlmacenItemsInCart && canSeeAlmacen && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                <p className="text-sm text-blue-900">
                  Este carrito incluye productos de almacén. Para crédito de almacén usa su módulo dedicado.
                </p>
                <Button type="button" variant="secondary" className="w-full" onClick={handleGoToClienteAlmacenCredit}>
                  Cliente Almacén
                </Button>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tipo de Cliente</Label>
              <Select
                value={queueCustomerType}
                onValueChange={(value) => {
                  const nextType = value as "general" | "credito"
                  setQueueCustomerType(nextType)
                  if (nextType === "general") {
                    setQueueCreditCustomerId("")
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Cliente general</SelectItem>
                  <SelectItem value="credito">Cliente a crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {queueCustomerType === "general" ? (
              <div className="space-y-2">
                <Label>Nombre de la Pre-factura (Opcional)</Label>
                <Input
                  placeholder="Ej: Maria - cambiar mica"
                  value={queueLabel}
                  onChange={(e) => setQueueLabel(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Seleccionar Cliente a Crédito</Label>
                <Select value={queueCreditCustomerId} onValueChange={setQueueCreditCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 ? (
                      <SelectItem value="no-customers" disabled>
                        No hay clientes registrados
                      </SelectItem>
                    ) : (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span>${formatCurrency(total)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQueueDialog(false)} disabled={isSendingToQueue}>
              Cancelar
            </Button>
            <Button onClick={handleSendToQueue} disabled={isSendingToQueue}>
              {isSendingToQueue ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                "Enviar a /cola-exclusiva"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCheckoutDialog} onOpenChange={setShowCheckoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{saleTypeMode === "wholesale" ? "Finalizar Venta por Mayor" : "Finalizar Venta"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre del Cliente (Opcional)</Label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Teléfono del Cliente (Opcional)</Label>
              <Input
                placeholder="Ej: 555-1234"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="border-t pt-4 space-y-2">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span>${formatCurrency(total)}</span>
              </div>
              <div className="space-y-2">
                <Label>Monto Pagado</Label>
                <Input
                  type="number"
                  placeholder={formatCurrency(total)}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                />
              </div>
              {amountPaid && Number.parseFloat(amountPaid) >= total && (
                <div className="flex justify-between text-lg font-bold text-green-600">
                  <span>Cambio:</span>
                  <span>${formatCurrency(Number.parseFloat(amountPaid) - total)}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCheckoutDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCheckout} disabled={isProcessingCheckout}>
              {isProcessingCheckout ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar Venta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalizeQueueDialog} onOpenChange={setShowFinalizeQueueDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Pre-factura en Cola Exclusiva</DialogTitle>
          </DialogHeader>
          {selectedQueuedSale && (
            <div className="grid gap-4 py-4">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Factura:</span>
                  <span className="font-medium">{selectedQueuedSale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold">${formatCurrency(selectedQueuedSale.total)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Metodo de Pago</Label>
                <Select value={queuedPaymentMethod} onValueChange={(v) => setQueuedPaymentMethod(v as "cash" | "card" | "transfer")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Nombre del Cliente (Opcional)</Label>
                <Input
                  placeholder="Ej: Juan Perez"
                  value={queuedCustomerName}
                  onChange={(e) => setQueuedCustomerName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Telefono del Cliente (Opcional)</Label>
                <Input
                  placeholder="Ej: 555-1234"
                  value={queuedCustomerPhone}
                  onChange={(e) => setQueuedCustomerPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto Pagado</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder={formatCurrency(selectedQueuedSale.total)}
                  value={queuedAmountPaid}
                  onChange={(e) => setQueuedAmountPaid(e.target.value)}
                />
              </div>

              {queuedAmountPaid && Number.parseFloat(queuedAmountPaid) >= selectedQueuedSale.total && (
                <div className="flex justify-between text-sm font-medium text-green-600">
                  <span>Cambio:</span>
                  <span>${formatCurrency(Number.parseFloat(queuedAmountPaid) - selectedQueuedSale.total)}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFinalizeQueueDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleFinalizeQueuedSale} disabled={isFinalizingQueuedSale || !selectedQueuedSale}>
              {isFinalizingQueuedSale ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalizando...
                </>
              ) : (
                "Finalizar y Cobrar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{currentInvoice?.status === "pending" ? "Pre-factura en Cola Exclusiva" : "Venta Completada"}</DialogTitle>
          </DialogHeader>
          {currentInvoice && (
            <div className="space-y-4">
              <div className={cn("text-center py-4 rounded-lg", currentInvoice.status === "pending" ? "bg-amber-50" : "bg-green-50")}>
                <div className={cn("text-2xl font-bold", currentInvoice.status === "pending" ? "text-amber-700" : "text-green-600")}>
                  {currentInvoice.status === "pending" ? "Pre-factura en Cola Exclusiva" : "Venta Exitosa"}
                </div>
                <div className="text-lg mt-2">Factura: {currentInvoice.invoiceNumber}</div>
                {currentInvoice.status === "pending" && (
                  <div className="text-sm mt-2 text-amber-700">
                    Esta pre-factura no registra dinero en caja hasta que sea finalizada.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span>{new Date(currentInvoice.date).toLocaleString("es-ES")}</span>
                </div>
                {currentInvoice.customerName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span>{currentInvoice.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Método de Pago:</span>
                  <span>
                    {currentInvoice.status === "pending"
                      ? "Pendiente de cobro"
                      : currentInvoice.paymentMethod === "cash"
                      ? "Efectivo"
                      : currentInvoice.paymentMethod === "card"
                        ? "Tarjeta"
                        : currentInvoice.paymentMethod === "credit"
                          ? "A Crédito"
                          : "Transferencia"}
                  </span>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentInvoice.items.map((item) => (
                    <TableRow key={item.cartId}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">${formatCurrency((item.customPrice ?? item.sellPrice ?? 0) * item.quantity)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t pt-4 space-y-2">
                {currentInvoice && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio Original:</span>
                      <span>${formatCurrency(currentInvoice.items.reduce((sum, item) => sum + (item.customPrice ?? item.sellPrice ?? 0) * item.quantity, 0))}</span>
                    </div>
                    {(() => {
                      const subtotalAmount = currentInvoice.items.reduce((sum, item) => sum + (item.customPrice ?? item.sellPrice ?? 0) * item.quantity, 0);
                      const discountAmount = currentInvoice.discount !== undefined
                        ? currentInvoice.discount
                        : Math.max(0, subtotalAmount - currentInvoice.total);

                      return discountAmount > 0 && (
                        <div className="flex justify-between text-orange-600">
                          <span className="text-muted-foreground">Descuento:</span>
                          <span>-${formatCurrency(discountAmount)}</span>
                        </div>
                      );
                    })()}
                  </>
                )}
                {currentInvoice.paymentMethod !== "credit" && currentInvoice.status !== "pending" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monto Pagado:</span>
                      <span>${formatCurrency(currentInvoice.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span className="text-muted-foreground">Cambio:</span>
                      <span>${formatCurrency(currentInvoice.change)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span>${formatCurrency(currentInvoice.total)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                void printSaleInvoice(
                  currentInvoice!,
                  customers,
                  employeeForPrint,
                  undefined,
                  getSaleInvoicePersistOptions(currentUser?.adminId, currentInvoice!.id, "tienda"),
                )
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button onClick={() => setShowInvoiceDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentSuccessDialog} onOpenChange={setShowPaymentSuccessDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Abono Registrado</DialogTitle>
          </DialogHeader>
          {currentPayment && (
            <div className="space-y-4">
              <div className="text-center py-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">¡Pago Exitoso!</div>
                <div className="text-lg mt-2">Recibo: {currentPayment.payment.invoiceNumber}</div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="font-medium text-muted-foreground">Cliente:</div>
                  <div className="text-right font-medium">{currentPayment.customer.name}</div>

                  <div className="font-medium text-muted-foreground">Fecha:</div>
                  <div className="text-right">{new Date(currentPayment.payment.date).toLocaleString()}</div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deuda Anterior:</span>
                    <span>${formatCurrency(currentPayment.payment.previousDebt)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-primary">
                    <span>Monto Abonado:</span>
                    <span>${formatCurrency(currentPayment.payment.amount)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-muted-foreground">Deuda Restante:</span>
                    <span>${formatCurrency(currentPayment.payment.remainingDebt)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto bg-transparent"
              onClick={() =>
                void printPaymentInvoice(
                  currentPayment!.payment,
                  currentPayment!.customer,
                  undefined,
                  currentUser?.adminId
                    ? {
                        ownerAdminId: currentUser.adminId,
                        source: "pago",
                        paymentId: currentPayment!.payment.id,
                      }
                    : undefined,
                )
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Recibo
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setShowPaymentSuccessDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={(open) => {
        setShowPaymentDialog(open);
        if (!open) {
          setPaymentAmountDraft("");
          setPaymentNoteAbono("");
          setPaymentMethodAbono("cash");
          setSelectedCustomerForPayment("");
          setSelectedPaymentSaleIds([]);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Abono a Deuda</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handlePaymentSubmit() }} className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentCustomerType === "general" ? "secondary" : "outline"}
                  onClick={() => {
                    setPaymentCustomerType("general")
                    setSelectedCustomerForPayment("")
                    setSelectedPaymentSaleIds([])
                  }}
                  className="w-full"
                >
                  Cliente
                </Button>
                <Button
                  type="button"
                  variant={paymentCustomerType === "almacen" ? "secondary" : "outline"}
                  onClick={() => {
                    setPaymentCustomerType("almacen")
                    setSelectedCustomerForPayment("")
                    setSelectedPaymentSaleIds([])
                  }}
                  className="w-full"
                >
                  Cliente de Almacén
                </Button>
              </div>

              <div className="space-y-2">
                <Label>{paymentCustomerType === "almacen" ? "Cliente de Almacén" : "Cliente"}</Label>
                <Select value={selectedCustomerForPayment} onValueChange={(value) => {
                  setSelectedCustomerForPayment(value)
                  setSelectedPaymentSaleIds([])
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={
                      paymentCustomerType === "almacen"
                        ? "Seleccione cliente de almacén"
                        : "Seleccione cliente"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentCustomerType === "almacen" ? (
                      almacenCustomersForCredit.filter((c) => c.debt > 0).length > 0 ? (
                        almacenCustomersForCredit
                          .filter((c) => c.debt > 0)
                          .map((c) => (
                            <SelectItem key={`almacen-${c.id}`} value={`almacen:${c.id}`}>
                              {c.name} (Deuda almacén: ${formatCurrency(c.debt)})
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="none" disabled>
                          No hay clientes de almacén con deuda
                        </SelectItem>
                      )
                    ) : customers.filter((c) => c.debt > 0).length > 0 ? (
                      customers
                        .filter((c) => c.debt > 0)
                        .map((c) => (
                          <SelectItem key={`general-${c.id}`} value={`general:${c.id}`}>
                            {c.name} (Deuda: ${formatCurrency(c.debt)})
                          </SelectItem>
                        ))
                    ) : (
                      <SelectItem value="none" disabled>
                        No hay clientes con deuda
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {currentPaymentCustomer && (
              <div className="rounded-md border-2 border-emerald-400 bg-emerald-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Resumen de pago</p>
                <p className="text-sm">
                  Dinero a pagar: <span className="font-bold">${paymentDraftAmountValue.toLocaleString()}</span>
                </p>
                <p className="text-sm">
                  Deuda pendiente despues del pago:{" "}
                  <span className="font-bold text-emerald-700">${projectedRemainingDebtAfterPayment.toLocaleString()}</span>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Monto a Abonar</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min="1"
                max={currentPaymentCustomer?.debt}
                placeholder="0.00"
                value={paymentAmountDraft}
                onChange={(e) => setPaymentAmountDraft(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Select value={paymentMethodAbono} onValueChange={(v) => setPaymentMethodAbono(v as "cash" | "card" | "transfer")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar método" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Nota (Opcional)</Label>
              <Textarea 
                id="note" 
                placeholder="Detalles del pago..." 
                value={paymentNoteAbono}
                onChange={(e) => setPaymentNoteAbono(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Facturas a pagar (opcional)</Label>
              <div className="max-h-36 overflow-auto rounded-md border p-2 space-y-2">
                {paymentPendingInvoices.map((sale) => (
                  <label key={sale.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedPaymentSaleIds.includes(sale.id)}
                        onCheckedChange={(checked) => {
                          setSelectedPaymentSaleIds((prev) =>
                            checked
                              ? [...prev, sale.id]
                              : prev.filter((id) => id !== sale.id),
                          )
                        }}
                      />
                      <span className="flex flex-col">
                        <span>{sale.invoiceNumber}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatSaleCreatedDateTime(sale)}
                        </span>
                      </span>
                    </span>
                    <span className="font-medium text-red-600">
                      Pendiente: ${getSaleCreditPendingAmount(sale).toLocaleString()}
                    </span>
                  </label>
                ))}
                {paymentPendingInvoices.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay facturas pendientes a crédito.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                La lista muestra la más nueva primero. Sin seleccionar, el abono se aplica FIFO (primero la más antigua).
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPaymentDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedCustomerForPayment || !paymentAmountDraft || Number(paymentAmountDraft) <= 0}>
                Registrar Pago
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de pago */}
      <Dialog open={isConfirmPaymentDialogOpen} onOpenChange={setIsConfirmPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirmar Pago</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea registrar un pago de <span className="font-bold text-green-600">${pendingPayment?.amount.toLocaleString()}</span> para el cliente <span className="font-bold">{currentPaymentCustomer?.name}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Deuda Actual:</span>
              <span>${currentPaymentCustomer?.debt.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Monto a Pagar:</span>
              <span className="text-green-600">-${pendingPayment?.amount.toLocaleString()}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Deuda Restante:</span>
              <span className="text-red-500">${((currentPaymentCustomer?.debt || 0) - (pendingPayment?.amount || 0)).toLocaleString()}</span>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsConfirmPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPayment} disabled={isProcessingPayment} className="bg-green-600 hover:bg-green-700 text-white min-w-[140px]">
              {isProcessingPayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                "Confirmar y Registrar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de recibo de pago */}
      <Dialog open={!!recentPaymentReceipt} onOpenChange={(open) => !open && setRecentPaymentReceipt(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Pago registrado</DialogTitle>
            <DialogDescription>El abono se guardó correctamente. Puedes imprimir el recibo ahora.</DialogDescription>
          </DialogHeader>
          {recentPaymentReceipt && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <p><span className="font-semibold">Cliente:</span> {recentPaymentReceipt.customer.name}</p>
                <p><span className="font-semibold">Teléfono:</span> {recentPaymentReceipt.customer.phone}</p>
              </div>
              <div className="flex justify-between text-lg font-bold text-primary">
                <span>Monto Abonado:</span>
                <span>${formatCurrency(recentPaymentReceipt.payment.amount)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-muted-foreground">Deuda Restante:</span>
                <span>${formatCurrency(recentPaymentReceipt.payment.remainingDebt)}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span className="text-muted-foreground">Realizado por:</span>
                <span>
                  {recentPaymentReceipt.payment.createdByEmployeeName ||
                    employees.find((employee) => employee.id === recentPaymentReceipt.payment.createdByEmployeeId)?.name ||
                    (recentPaymentReceipt.payment.createdByEmployeeId === currentUser?.id ? currentUser.name : "No identificado")}
                </span>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto bg-transparent"
              onClick={() =>
                void printPaymentInvoice(
                  recentPaymentReceipt!.payment,
                  recentPaymentReceipt!.customer,
                  undefined,
                  currentUser?.adminId
                    ? {
                        ownerAdminId: currentUser.adminId,
                        source: "pago",
                        paymentId: recentPaymentReceipt!.payment.id,
                      }
                    : undefined,
                )
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir Recibo
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => setRecentPaymentReceipt(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaleTypeDialog} onOpenChange={setShowSaleTypeDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Tipo de venta</DialogTitle>
            <DialogDescription>Selecciona cómo quieres registrar esta venta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 text-left"
              onClick={() => handleSelectSaleType("normal")}
            >
              <ShoppingCart className="h-5 w-5" />
              <div>
                <div className="font-semibold">Venta normal</div>
                <div className="text-xs text-muted-foreground">Cobro estándar</div>
              </div>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto flex-col items-start gap-2 p-4 text-left"
              onClick={() => handleSelectSaleType("credit")}
            >
              <CreditCard className="h-5 w-5" />
              <div>
                <div className="font-semibold">Venta a crédito</div>
                <div className="text-xs text-muted-foreground">Registrar deuda</div>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaleTypeDialog(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWholesaleDialog} onOpenChange={setShowWholesaleDialog}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Venta por mayor</DialogTitle>
            <DialogDescription>
              Revisa el precio por mayor tomado desde la base de datos antes de continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Precio por mayor</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Subtotal mayor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((item) => {
                  const wholesalePrice = getWholesalePriceForItem(item)
                  const isAvailable = wholesalePrice > 0
                  return (
                    <TableRow key={item.cartId}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted-foreground">{item.sku || item.sourceId || "Sin código"}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        {isAvailable ? (
                          <span className="font-semibold text-emerald-700">${formatCurrency(wholesalePrice)}</span>
                        ) : (
                          <span className="text-muted-foreground">No disponible</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        {isAvailable ? `$${formatCurrency(wholesalePrice * item.quantity)}` : "-"}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {cart.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No hay productos en el carrito.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Los productos sin precio por mayor seguirán con su precio actual. El resto se ajustará al precio guardado en
            <code className="px-1">products.wholesale_price</code>.
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowWholesaleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmWholesalePrices}>
              <BadgeDollarSign className="mr-2 h-4 w-4" />
              Usar precio mayor y continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para seleccionar tipo de crédito */}
      <Dialog open={showCreditTypeDialog} onOpenChange={setShowCreditTypeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Para quién es el crédito?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            Seleccione a dónde va el crédito de esta venta
          </p>
          {hasAlmacenItemsInCart && hasNonAlmacenItemsInCart && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Carrito mixto detectado. El sistema dividirá automáticamente entre caja, almacén y deudas.
            </div>
          )}
          <div className="flex flex-col gap-3">
            {canSeeAlmacen && (
              <Button
                variant="outline"
                className="h-auto p-4 justify-start flex-col items-start"
                onClick={() => {
                  setShowCreditTypeDialog(false)
                  if (hasAlmacenItemsInCart && hasNonAlmacenItemsInCart) {
                    setCreditDialogMode("regular")
                  } else {
                    setCreditDialogMode("almacen")
                  }
                  void loadAlmacenCustomersForCredit()
                  setShowCreditDialog(true)
                }}
              >
                <span className="font-semibold">Cliente del Almacén</span>
                <span className="text-xs text-muted-foreground">
                  {hasAlmacenItemsInCart && hasNonAlmacenItemsInCart
                    ? "Para carrito mixto abre flujo con selección de ambos clientes"
                    : "Para ventas y creditos del almacen"}
                </span>
              </Button>
            )}
            <Button
              variant="outline"
              className="h-auto p-4 justify-start flex-col items-start"
              onClick={() => {
                setShowCreditTypeDialog(false)
                setCreditDialogMode("regular")
                if (hasAlmacenItemsInCart) {
                  void loadAlmacenCustomersForCredit()
                }
                setShowCreditDialog(true)
              }}
            >
              <span className="font-semibold">Cliente Regular</span>
              <span className="text-xs text-muted-foreground">
                {hasAlmacenItemsInCart
                  ? "Recomendado para ventas mixtas (catalogo + almacen)"
                  : "Para clientes normales del negocio"}
              </span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddAlmacenCustomerDialog}
        onOpenChange={(open) => {
          setShowAddAlmacenCustomerDialog(open)
          if (!open) {
            resetNewAlmacenCustomerForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-[600px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Agregar Cliente</DialogTitle>
            <DialogDescription>Complete los datos del nuevo cliente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAlmacenCustomerForCredit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ventas-almacen-name">Nombre Completo</Label>
                <Input
                  id="ventas-almacen-name"
                  value={newAlmacenCustomerForm.name}
                  onChange={(event) =>
                    setNewAlmacenCustomerForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ventas-almacen-cedula">Cedula / ID</Label>
                <Input
                  id="ventas-almacen-cedula"
                  value={newAlmacenCustomerForm.cedula}
                  onChange={(event) =>
                    setNewAlmacenCustomerForm((prev) => ({ ...prev, cedula: event.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ventas-almacen-phone">Telefono</Label>
                <Input
                  id="ventas-almacen-phone"
                  value={newAlmacenCustomerForm.phone}
                  onChange={(event) =>
                    setNewAlmacenCustomerForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ventas-almacen-email">Correo Electronico</Label>
                <Input
                  id="ventas-almacen-email"
                  type="email"
                  value={newAlmacenCustomerForm.email}
                  onChange={(event) =>
                    setNewAlmacenCustomerForm((prev) => ({ ...prev, email: event.target.value }))
                  }
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ventas-almacen-debt">Deuda Inicial</Label>
                <Input
                  id="ventas-almacen-debt"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAlmacenCustomerForm.debt}
                  onChange={(event) =>
                    setNewAlmacenCustomerForm((prev) => ({ ...prev, debt: event.target.value }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ventas-almacen-credit-limit">Limite de Credito</Label>
                <Input
                  id="ventas-almacen-credit-limit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAlmacenCustomerForm.creditLimit}
                  onChange={(event) =>
                    setNewAlmacenCustomerForm((prev) => ({ ...prev, creditLimit: event.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ventas-almacen-address">Direccion</Label>
              <Input
                id="ventas-almacen-address"
                value={newAlmacenCustomerForm.address}
                onChange={(event) =>
                  setNewAlmacenCustomerForm((prev) => ({ ...prev, address: event.target.value }))
                }
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ventas-almacen-notes">Notas Internas</Label>
              <Textarea
                id="ventas-almacen-notes"
                value={newAlmacenCustomerForm.notes}
                onChange={(event) =>
                  setNewAlmacenCustomerForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Opcional"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowAddAlmacenCustomerDialog(false)
                  resetNewAlmacenCustomerForm()
                }}
                disabled={isCreatingAlmacenCustomer}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingAlmacenCustomer}>
                {isCreatingAlmacenCustomer ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Agregar Cliente"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditDialog} onOpenChange={(open) => {
        setShowCreditDialog(open)
        if (!open) {
          setCreditDialogMode("type")
          setSelectedAlmacenCustomerForCredit("")
          setSelectedGeneralCustomerForAlmacenCredit("none")
          setSelectedCustomerForCredit("")
          setAlmacenCustomerName("")
          setAlmacenCustomerPhone("")
          setAlmacenSourceCustomerId(null)
        }
      }}>
        <DialogContent className="sm:max-w-[640px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Agregar Venta a Crédito</DialogTitle>
          </DialogHeader>
          
          {creditDialogMode === "almacen" ? (
            // Modo Cliente del Almacén - Mostrar selector inline
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Seleccionar Cliente del Almacen</Label>
                <Select
                  value={selectedAlmacenCustomerForCredit}
                  onValueChange={handleAlmacenCustomerForCreditChange}
                >
                  <SelectTrigger disabled={isLoadingAlmacenCustomersForCredit}>
                    <SelectValue
                      placeholder={
                        isLoadingAlmacenCustomersForCredit
                          ? "Cargando clientes de Cliente Almacen..."
                          : "Seleccione un cliente de Cliente Almacen"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-[40vh]">
                    {almacenCustomersForCredit.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">
                        No hay clientes registrados en Cliente Almacen.
                      </div>
                    ) : (
                      almacenCustomersForCredit.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          <div className="flex flex-col">
                            <span>{customer.name}</span>
                            {customer.phone && (
                              <span className="text-xs text-muted-foreground">Telefono: {customer.phone}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Deuda: ${formatCurrency(customer.debt)}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadAlmacenCustomersForCredit()}
                    disabled={isLoadingAlmacenCustomersForCredit}
                    className="sm:flex-1"
                  >
                    Actualizar lista
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowAddAlmacenCustomerDialog(true)}
                    className="sm:flex-1"
                  >
                    Agregar cliente
                  </Button>
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <div className="space-y-1">
                    <Label>Tomar cliente de /clientes</Label>
                    <p className="text-xs text-muted-foreground">
                      Si no existe en Cliente Almacen, se creara automaticamente y quedara seleccionado.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      value={selectedGeneralCustomerForAlmacenCredit}
                      onValueChange={setSelectedGeneralCustomerForAlmacenCredit}
                    >
                      <SelectTrigger className="sm:flex-1">
                        <SelectValue placeholder="Selecciona un cliente general" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh]">
                        <SelectItem value="none">Seleccionar cliente</SelectItem>
                        {customers.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground">
                            No hay clientes en /clientes para importar.
                          </div>
                        ) : (
                          customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              <div className="flex flex-col">
                                <span>{customer.name}</span>
                                {customer.phone && (
                                  <span className="text-xs text-muted-foreground">Telefono: {customer.phone}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleImportGeneralCustomerForAlmacenCredit()}
                      disabled={
                        customers.length === 0 ||
                        selectedGeneralCustomerForAlmacenCredit === "none" ||
                        isImportingGeneralCustomerForAlmacenCredit
                      }
                      className="sm:w-auto"
                    >
                      {isImportingGeneralCustomerForAlmacenCredit ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        "Tomar de /clientes"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              {almacenCustomerName && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <div className="font-semibold">{almacenCustomerName}</div>
                  {almacenCustomerPhone && <div className="text-sm text-muted-foreground">Teléfono: {almacenCustomerPhone}</div>}
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">Crédito a registrar:</span>
                    <span className="font-medium text-primary">${total.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="border rounded-lg p-3 bg-background">
                <div className="text-sm font-medium mb-2">Resumen del Carrito</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {cart.map((item) => (
                    <div key={item.cartId} className="flex justify-between text-sm">
                      <span>
                        {item.name} x {item.quantity}
                      </span>
                      <span>${((item.customPrice ?? item.sellPrice ?? 0) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t font-bold">
                  <span>Total:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            // Modo Cliente Regular - Formulario original
            <div className="grid gap-4 py-4">
              {hasMixedCart ? (
                <>
                  <div className="space-y-2">
                    <Label>Cliente principal (Cliente Almacen)</Label>
                    <Select
                      value={selectedAlmacenCustomerForCredit}
                      onValueChange={handleAlmacenCustomerForCreditChange}
                    >
                      <SelectTrigger disabled={isLoadingAlmacenCustomersForCredit}>
                        <SelectValue
                          placeholder={
                            isLoadingAlmacenCustomersForCredit
                              ? "Cargando clientes de Cliente Almacen..."
                              : "Seleccione un cliente de Cliente Almacen"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh]">
                        {almacenCustomersForCredit.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground">
                            No hay clientes registrados en Cliente Almacen.
                          </div>
                        ) : (
                          almacenCustomersForCredit.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              <div className="flex flex-col">
                                <span>{customer.name}</span>
                                {customer.phone && (
                                  <span className="text-xs text-muted-foreground">Telefono: {customer.phone}</span>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  Deuda: ${formatCurrency(customer.debt)}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Importar rapido desde /clientes</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        value={selectedGeneralCustomerForAlmacenCredit}
                        onValueChange={setSelectedGeneralCustomerForAlmacenCredit}
                      >
                        <SelectTrigger className="sm:flex-1">
                          <SelectValue placeholder="Seleccionar cliente de /clientes" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[40vh]">
                          <SelectItem value="none">Seleccionar cliente</SelectItem>
                          {customers.length === 0 ? (
                            <div className="p-2 text-xs text-muted-foreground">
                              No hay clientes en /clientes para importar.
                            </div>
                          ) : (
                            customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                <div className="flex flex-col">
                                  <span>{customer.name}</span>
                                  {customer.phone && (
                                    <span className="text-xs text-muted-foreground">Telefono: {customer.phone}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleImportGeneralCustomerForAlmacenCredit()}
                        disabled={
                          customers.length === 0 ||
                          selectedGeneralCustomerForAlmacenCredit === "none" ||
                          isImportingGeneralCustomerForAlmacenCredit
                        }
                      >
                        {isImportingGeneralCustomerForAlmacenCredit ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Importando...
                          </>
                        ) : (
                          "Tomar de /clientes"
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void loadAlmacenCustomersForCredit()}
                      disabled={isLoadingAlmacenCustomersForCredit}
                      className="sm:flex-1"
                    >
                      Actualizar lista
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowAddAlmacenCustomerDialog(true)}
                      className="sm:flex-1"
                    >
                      Agregar cliente
                    </Button>
                  </div>

                  {selectedMixedAlmacenCustomer && (
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                      <div className="font-semibold">{selectedMixedAlmacenCustomer.name}</div>
                      {selectedMixedAlmacenCustomer.phone && (
                        <div className="text-sm text-muted-foreground">Telefono: {selectedMixedAlmacenCustomer.phone}</div>
                      )}
                      <div className="flex justify-between pt-2 border-t">
                        <span className="text-sm">Cliente general vinculado:</span>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            linkedMixedGeneralCustomer ? "text-primary" : "text-red-600",
                          )}
                        >
                          {linkedMixedGeneralCustomer?.name || "No vinculado"}
                        </span>
                      </div>
                      {!linkedMixedGeneralCustomer && (
                        <div className="text-xs text-red-600">
                          Selecciona un cliente de /clientes y pulsa "Tomar de /clientes".
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Seleccionar Cliente</Label>
                    <Select value={selectedCustomerForCredit} onValueChange={setSelectedCustomerForCredit}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione un cliente" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh]">
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex flex-col">
                              <span>{c.name}</span>
                              <span className="text-xs text-muted-foreground">Cédula: {c.cedula}</span>
                              <span className="text-xs text-muted-foreground">Teléfono: {c.phone}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCustomerForCredit && (
                    <div className="p-4 bg-muted rounded-lg space-y-2">
                      {(() => {
                        const customer = customers.find((c) => c.id === selectedCustomerForCredit)
                        if (!customer) return null
                        return (
                          <>
                            <div className="font-semibold">{customer.name}</div>
                            <div className="text-sm text-muted-foreground">Cédula: {customer.cedula}</div>
                            <div className="text-sm text-muted-foreground">Teléfono: {customer.phone}</div>
                            <div className="flex justify-between pt-2 border-t">
                              <span className="text-sm">Deuda Actual:</span>
                              <span className="font-medium text-orange-600">${customer.debt.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm">Nueva Compra:</span>
                              <span className="font-medium text-primary">${total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t">
                              <span className="text-sm font-semibold">Nueva Deuda Total:</span>
                              <span className="font-bold text-red-600">${(customer.debt + total).toLocaleString()}</span>
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </>
              )}

              <div className="border rounded-lg p-3 bg-background">
                <div className="text-sm font-medium mb-2">Resumen del Carrito</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {cart.map((item) => (
                    <div key={item.cartId} className="flex justify-between text-sm">
                      <span>
                        {item.name} x {item.quantity}
                      </span>
                      <span>${((item.customPrice ?? item.sellPrice ?? 0) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t font-bold">
                  <span>Total:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreditDialog(false)
              setCreditDialogMode("type")
            }}>
              Atrás
            </Button>
            <Button 
              onClick={handleCreditSale} 
              disabled={
                (
                  creditDialogMode === "almacen"
                    ? !almacenCustomerName
                    : hasMixedCart
                      ? !selectedAlmacenCustomerForCredit || !linkedMixedGeneralCustomer
                      : !selectedCustomerForCredit
                ) || 
                isProcessingCreditSale
              }
            >
              {isProcessingCreditSale ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar Venta a Crédito"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial Credit Dialog */}
      <Dialog open={showPartialCreditDialog} onOpenChange={setShowPartialCreditDialog}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Pago Parcial - Registrar Faltante a Crédito</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Summary */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total de la venta:</span>
                <span className="font-medium">${formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Pagado en efectivo:</span>
                <span className="font-medium text-green-600">${formatCurrency(partialCashPaid)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-sm font-semibold">Faltante a crédito:</span>
                <span className="font-bold text-red-600 text-lg">${formatCurrency(partialCreditAmount)}</span>
              </div>
            </div>

            {/* Mode selector */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={partialCreditMode === "existing" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setPartialCreditMode("existing")}
              >
                <Users className="h-4 w-4" /> Cliente Existente
              </Button>
              <Button
                type="button"
                variant={partialCreditMode === "new" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setPartialCreditMode("new")}
              >
                <UserPlus className="h-4 w-4" /> Nuevo Cliente
              </Button>
            </div>

            {partialCreditMode === "existing" ? (
              <div className="space-y-2">
                <Label>Seleccionar Cliente</Label>
                <Select value={selectedCustomerForPartialCredit} onValueChange={setSelectedCustomerForPartialCredit}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <div className="flex flex-col">
                          <span>{c.name}</span>
                          <span className="text-xs text-muted-foreground">Deuda actual: ${formatCurrency(c.debt)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCustomerForPartialCredit && (() => {
                  const c = customers.find((c) => c.id === selectedCustomerForPartialCredit)
                  if (!c) return null
                  return (
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deuda actual:</span>
                        <span className="font-medium text-orange-600">${formatCurrency(c.debt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">+ Faltante:</span>
                        <span className="font-medium text-red-600">${formatCurrency(partialCreditAmount)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t">
                        <span className="font-semibold">Nueva deuda total:</span>
                        <span className="font-bold text-red-600">${formatCurrency(c.debt + partialCreditAmount)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nombre Completo</Label>
                    <Input
                      placeholder="Opcional"
                      value={newCreditCustomerName}
                      onChange={(e) => setNewCreditCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cédula / ID</Label>
                    <Input
                      placeholder="Opcional"
                      value={newCreditCustomerCedula}
                      onChange={(e) => setNewCreditCustomerCedula(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input
                      placeholder="Opcional"
                      value={newCreditCustomerPhone}
                      onChange={(e) => setNewCreditCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Correo Electrónico</Label>
                    <Input
                      type="email"
                      placeholder="Opcional"
                      value={newCreditCustomerEmail}
                      onChange={(e) => setNewCreditCustomerEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Deuda Inicial</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newCreditCustomerDebt}
                      onChange={(e) => setNewCreditCustomerDebt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Límite de Crédito</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newCreditCustomerCreditLimit}
                      onChange={(e) => setNewCreditCustomerCreditLimit(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <Input
                    placeholder="Opcional"
                    value={newCreditCustomerAddress}
                    onChange={(e) => setNewCreditCustomerAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notas Internas</Label>
                  <Textarea
                    placeholder="Opcional"
                    value={newCreditCustomerNotes}
                    onChange={(e) => setNewCreditCustomerNotes(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setShowPartialCreditDialog(false)
              setShowCheckoutDialog(true)
            }}>
              Volver
            </Button>
            <Button
              onClick={handlePartialCreditConfirm}
              disabled={
                isProcessingPartialCredit ||
                (partialCreditMode === "existing"
                  ? !selectedCustomerForPartialCredit
                  : !newCreditCustomerName.trim())
              }
            >
              {isProcessingPartialCredit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar Venta con Crédito"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
