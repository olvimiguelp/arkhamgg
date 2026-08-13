"use client"

import { type FormEvent, useCallback, useMemo, useState } from "react"
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  DollarSign,
  Eye,
  Loader2,
  PackagePlus,
  Printer,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { useStore, type CartItem, type Customer, type Product, type Sale } from "@/components/store-context"
import { printSaleInvoice } from "@/components/invoice-printer"
import { getSaleInvoicePersistOptions } from "@/lib/invoice-storage"
import { formatCurrency } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { buildSourceRuntimeId, isAlmacenSourceRecord } from "@/lib/transaction-classification"
import { createClient } from "@/lib/supabase/client"
import { useNavigate } from "react-router-dom"

const getItemPrice = (item: CartItem) => item.customPrice ?? item.sellPrice ?? 0
const getItemsTotal = (items: CartItem[]) => items.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0)

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

export default function ColaExclusivaPage() {
  const { sales, updateSale, updateRepair, updateCustomer, deleteSale, repairs, customers, employees, currentUser, addCustomer, products } = useStore()
  const { toast } = useToast()
  const navigate = useNavigate()
  const supabase = useMemo(() => createClient(), [])
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false)
  const [showInventoryProductDialog, setShowInventoryProductDialog] = useState(false)
  const [showCreditDialog, setShowCreditDialog] = useState(false)
  const [showCreditTypeDialog, setShowCreditTypeDialog] = useState(false)
  const [creditTargetType, setCreditTargetType] = useState<"regular" | "almacen">("regular")
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
  const [showPartialCreditDialog, setShowPartialCreditDialog] = useState(false)
  const [showCompletedSaleDialog, setShowCompletedSaleDialog] = useState(false)
  const [selectedPrefactura, setSelectedPrefactura] = useState<Sale | null>(null)
  const [completedSale] = useState<Sale | null>(null)
  const [editableItems, setEditableItems] = useState<CartItem[]>([])
  const [editingPriceMap, setEditingPriceMap] = useState<Record<string, string>>({})
  const [queuedPaymentMethod, setQueuedPaymentMethod] = useState<"cash" | "card" | "transfer">("cash")
  const [queuedAmountPaid, setQueuedAmountPaid] = useState("")
  const [queuedCustomerName, setQueuedCustomerName] = useState("")
  const [queuedCustomerPhone, setQueuedCustomerPhone] = useState("")
  const [manualItemDescription, setManualItemDescription] = useState("")
  const [manualItemQuantity, setManualItemQuantity] = useState("1")
  const [manualItemPrice, setManualItemPrice] = useState("")
  const [manualItemCost, setManualItemCost] = useState("")
  const [inventorySearchTerm, setInventorySearchTerm] = useState("")
  const [inventoryQuantity, setInventoryQuantity] = useState("1")
  const [selectedInventoryProductId, setSelectedInventoryProductId] = useState("")
  const [selectedCustomerForCredit, setSelectedCustomerForCredit] = useState("")
  const [partialCashPaid, setPartialCashPaid] = useState(0)
  const [partialCreditAmount, setPartialCreditAmount] = useState(0)
  const [partialCreditMode, setPartialCreditMode] = useState<"existing" | "new">("existing")
  const [selectedCustomerForPartialCredit, setSelectedCustomerForPartialCredit] = useState("")
  const [newCreditCustomerName, setNewCreditCustomerName] = useState("")
  const [newCreditCustomerPhone, setNewCreditCustomerPhone] = useState("")
  const [newCreditCustomerCedula, setNewCreditCustomerCedula] = useState("")
  const [newCreditCustomerEmail, setNewCreditCustomerEmail] = useState("")
  const [newCreditCustomerAddress, setNewCreditCustomerAddress] = useState("")
  const [newCreditCustomerNotes, setNewCreditCustomerNotes] = useState("")
  const [newCreditCustomerDebt, setNewCreditCustomerDebt] = useState("0")
  const [newCreditCustomerCreditLimit, setNewCreditCustomerCreditLimit] = useState("0")
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isProcessingCreditSale, setIsProcessingCreditSale] = useState(false)
  const [isProcessingPartialCredit, setIsProcessingPartialCredit] = useState(false)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)

  const employee = employees.find((e) => e.email === currentUser?.email)
  const currentOwnerAdminId = useMemo(() => {
    const adminId = String(currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || "").trim()
    return adminId || null
  }, [currentUser])
  const canFinalizeQueue =
    currentUser?.role === "admin" || employee?.permissions.queueExclusive || employee?.permissions.canEdit
  const canDelete = currentUser?.role === "admin" || employee?.permissions.canDelete
  const employeeForPrint = employee
    ? { name: employee.name, phone: employee.phone }
    : { name: currentUser?.name ?? "", phone: "" }
  const finalizerEmployeeId = currentUser?.id || undefined

  const syncRepairStatusForSale = useCallback(async (sale: Sale, status: "listo" | "entregado") => {
    const relatedRepairs = repairs.filter((repair) =>
      sale.items?.some((item) => {
        const sourceId = String(item.sourceId || "")
        return sourceId === repair.id || sourceId.startsWith(`${repair.id}-`)
      }),
    )
    await Promise.all(relatedRepairs.map((repair) => updateRepair(repair.id, { status })))
  }, [repairs, updateRepair])

  const prefacturasEnCola = useMemo(() => {
    return sales
      .filter((sale) => sale.status === "pending")
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [sales])

  const totalEnCola = useMemo(
    () => prefacturasEnCola.reduce((acc, sale) => acc + (Number(sale.total) || 0), 0),
    [prefacturasEnCola],
  )

  const editableTotal = useMemo(() => getItemsTotal(editableItems), [editableItems])
  const selectedHasAlmacenItems = useMemo(
    () => editableItems.some((item) => isAlmacenSourceRecord(item as Record<string, unknown>)),
    [editableItems],
  )
  const safeProducts = Array.isArray(products) ? products : []
  const inventoryProducts = useMemo(() => {
    const term = inventorySearchTerm.trim().toLowerCase()
    return safeProducts
      .filter((product) => product.sourceTable !== "armacen")
      .filter((product) => Number(product.stock) > 0)
      .filter((product) => {
        if (!term) return true
        const haystack = `${product.name} ${product.sku || ""} ${product.category || ""}`.toLowerCase()
        return haystack.includes(term)
      })
  }, [inventorySearchTerm, safeProducts])
  const selectedInventoryProduct = useMemo(
    () => inventoryProducts.find((product) => product.id === selectedInventoryProductId) || null,
    [inventoryProducts, selectedInventoryProductId],
  )
  const ultimaPrefacturaFecha = prefacturasEnCola[0]?.date

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

      const mapped: AlmacenCustomerAccount[] = (data || []).map((row: any) => ({
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

  const handleCreateAlmacenCustomerForCredit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setIsCreatingAlmacenCustomer(true)
      try {
        const normalizeAmount = (value: string) => {
          const parsed = Number.parseFloat(value)
          if (!Number.isFinite(parsed) || parsed < 0) return 0
          return Math.round(parsed * 100) / 100
        }

        if (!currentOwnerAdminId) {
          throw new Error("No hay un administrador activo para asociar este cliente del almacén.")
        }

        const payload = {
          owner_admin_id: currentOwnerAdminId,
          source_customer_id: null,
          name: newAlmacenCustomerForm.name.trim() || "Cliente sin nombre",
          cedula: newAlmacenCustomerForm.cedula.trim() || null,
          phone: newAlmacenCustomerForm.phone.trim() || null,
          email: newAlmacenCustomerForm.email.trim() || null,
          address: newAlmacenCustomerForm.address.trim() || null,
          notes: newAlmacenCustomerForm.notes.trim() || null,
          debt: normalizeAmount(newAlmacenCustomerForm.debt),
          total_purchases: 0,
          credit_limit: normalizeAmount(newAlmacenCustomerForm.creditLimit),
          status: "En proceso",
        }

        const { data, error } = await supabase
          .from("almacen_customer_accounts")
          .insert(payload)
          .select("id, name, phone, debt, source_customer_id")
          .single()

        if (error || !data) throw error || new Error("No se pudo crear el cliente.")

        const created: AlmacenCustomerAccount = {
          id: String(data.id ?? ""),
          name: String(data.name ?? payload.name),
          phone: String(data.phone ?? payload.phone ?? ""),
          debt: Number(data.debt ?? 0) || 0,
          sourceCustomerId: data.source_customer_id ? String(data.source_customer_id) : null,
        }

        setAlmacenCustomersForCredit((prev) => [created, ...prev.filter((customer) => customer.id !== created.id)])
        handleAlmacenCustomerForCreditChange(created.id)
        setShowAddAlmacenCustomerDialog(false)
        setNewAlmacenCustomerForm(INITIAL_NEW_ALMACEN_CUSTOMER_FORM)

        toast({
          title: "Cliente agregado",
          description: `Se agrego ${created.name} para el credito del almacen.`,
        })
      } catch (error: any) {
        console.error("Error creating almacen customer from cola exclusiva:", error)
        toast({
          title: "Error",
          description: error?.message || "No se pudo guardar el cliente del almacen.",
          variant: "destructive",
        })
      } finally {
        setIsCreatingAlmacenCustomer(false)
      }
    },
    [currentOwnerAdminId, handleAlmacenCustomerForCreditChange, newAlmacenCustomerForm, supabase, toast],
  )

  const handleImportGeneralCustomerForAlmacenCredit = useCallback(async () => {
    if (selectedGeneralCustomerForAlmacenCredit === "none") return

    const sourceCustomer = customers.find((customer) => customer.id === selectedGeneralCustomerForAlmacenCredit)
    if (!sourceCustomer) return

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
          sourceCustomerId: existingBySource.source_customer_id ? String(existingBySource.source_customer_id) : sourceCustomer.id,
        }
        setAlmacenCustomersForCredit((prev) => [existing, ...prev.filter((customer) => customer.id !== existing.id)])
        handleAlmacenCustomerForCreditChange(existing.id)
        setSelectedGeneralCustomerForAlmacenCredit("none")
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
      handleAlmacenCustomerForCreditChange(created.id)
      setSelectedGeneralCustomerForAlmacenCredit("none")
    } catch (error) {
      console.error("Error importing customer from /clientes (cola exclusiva):", error)
      toast({
        title: "Error",
        description: "No se pudo importar el cliente desde /clientes.",
        variant: "destructive",
      })
    } finally {
      setIsImportingGeneralCustomerForAlmacenCredit(false)
    }
  }, [customers, handleAlmacenCustomerForCreditChange, selectedGeneralCustomerForAlmacenCredit, supabase, toast])

  const resetFinalizeState = () => {
    setShowFinalizeDialog(false)
    setShowCreditDialog(false)
    setShowCreditTypeDialog(false)
    setShowPartialCreditDialog(false)
    setSelectedPrefactura(null)
    setEditableItems([])
    setEditingPriceMap({})
    setQueuedAmountPaid("")
    setQueuedCustomerName("")
    setQueuedCustomerPhone("")
    setManualItemDescription("")
    setManualItemQuantity("1")
    setManualItemPrice("")
    setManualItemCost("")
    setSelectedCustomerForCredit("")
    setSelectedAlmacenCustomerForCredit("")
    setSelectedGeneralCustomerForAlmacenCredit("none")
    setAlmacenCustomerName("")
    setAlmacenCustomerPhone("")
    setAlmacenSourceCustomerId(null)
    setPartialCashPaid(0)
    setPartialCreditAmount(0)
    setSelectedCustomerForPartialCredit("")
  }

  const openViewDialog = (sale: Sale) => {
    setSelectedPrefactura(sale)
    setShowViewDialog(true)
  }

  const openFinalizeDialog = async (sale: Sale) => {
    if (!canFinalizeQueue) {
      toast({
        title: "Sin permisos",
        description: "No tienes permisos para modificar pre-facturas.",
        variant: "destructive",
      })
      return
    }

    try {
      // Retirar la pre-factura de la cola libera su lugar y evita duplicados.
      // /ventas conserva la información completa como borrador editable.
      await deleteSale(sale.id)
      const customerName = sale.customerName || customers.find((customer) => customer.id === sale.customerId)?.name
      navigate("/ventas", {
        state: {
          returnedInvoice: {
            ...sale,
            customerName: customerName || undefined,
          },
        },
      })
    } catch (error) {
      console.error("Error returning pre-invoice to sales:", error)
      toast({
        title: "No se pudo devolver la factura",
        description: "La pre-factura permanece en la cola. Intenta nuevamente.",
        variant: "destructive",
      })
    }
  }

  const updateEditableItemPrice = (cartId: string, value: string) => {
    setEditingPriceMap((prev) => ({ ...prev, [cartId]: value }))

    if (value === "") {
      setEditableItems((prev) =>
        prev.map((item) => (item.cartId === cartId ? { ...item, customPrice: undefined } : item)),
      )
      return
    }

    const newPrice = Number.parseFloat(value)
    if (!Number.isNaN(newPrice) && newPrice >= 0) {
      setEditableItems((prev) =>
        prev.map((item) => (item.cartId === cartId ? { ...item, customPrice: newPrice } : item)),
      )
    }
  }

  const updateEditableItemQuantity = (cartId: string, value: string) => {
    const parsed = Number.parseInt(value, 10)
    const nextQuantity = Number.isFinite(parsed) ? Math.max(1, parsed) : 1
    setEditableItems((prev) => prev.map((item) => (item.cartId === cartId ? { ...item, quantity: nextQuantity } : item)))
  }

  const addManualItemToEditableSale = () => {
    const description = manualItemDescription.trim()
    const quantity = Math.max(1, Number.parseInt(manualItemQuantity, 10) || 1)
    const price = Number.parseFloat(manualItemPrice)
    const cost = Number.parseFloat(manualItemCost)

    if (!description) {
      toast({
        title: "Descripcion requerida",
        description: "Ingrese el nombre o descripcion del producto manual.",
        variant: "destructive",
      })
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      toast({
        title: "Precio invalido",
        description: "Ingrese un precio valido para el producto manual.",
        variant: "destructive",
      })
      return
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast({
        title: "Costo invalido",
        description: "Ingrese un costo valido para el producto manual.",
        variant: "destructive",
      })
      return
    }

    const sourceId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const runtimeId = buildSourceRuntimeId("manual", sourceId)
    const manualItem: CartItem = {
      id: runtimeId,
      cartId: runtimeId,
      sourceTable: "manual",
      sourceId,
      sku: "MANUAL",
      name: description,
      category: "manual",
      stock: 0,
      minStock: 0,
      buyPrice: cost,
      wholesalePrice: cost,
      sellPrice: price,
      minimumSellPrice: 0,
      supplier: "",
      quantity,
    }

    setEditableItems((prev) => [...prev, manualItem])
    setManualItemDescription("")
    setManualItemQuantity("1")
    setManualItemPrice("")
    setManualItemCost("")
  }

  const openInventoryProductDialog = () => {
    setInventorySearchTerm("")
    setInventoryQuantity("1")
    setSelectedInventoryProductId("")
    setShowInventoryProductDialog(true)
  }

  const addInventoryProductToEditableSale = () => {
    if (!selectedInventoryProduct) {
      toast({
        title: "Seleccione un producto",
        description: "Elige un producto del inventario antes de agregarlo.",
        variant: "destructive",
      })
      return
    }

    const quantity = Math.max(1, Number.parseInt(inventoryQuantity, 10) || 1)
    const stock = Number(selectedInventoryProduct.stock) || 0
    if (quantity > stock) {
      toast({
        title: "Inventario insuficiente",
        description: `Solo hay ${stock} unidades disponibles de ${selectedInventoryProduct.name}.`,
        variant: "destructive",
      })
      return
    }

    const existingIndex = editableItems.findIndex(
      (item) =>
        item.sourceTable === selectedInventoryProduct.sourceTable &&
        item.sourceId === selectedInventoryProduct.sourceId,
    )

    if (existingIndex >= 0) {
      const currentQuantity = Number(editableItems[existingIndex].quantity) || 0
      const nextQuantity = currentQuantity + quantity
      if (nextQuantity > stock) {
        toast({
          title: "Inventario insuficiente",
          description: `No puedes superar el stock disponible de ${selectedInventoryProduct.name}.`,
          variant: "destructive",
        })
        return
      }

      setEditableItems((prev) =>
        prev.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: nextQuantity,
                buyPrice: Number(selectedInventoryProduct.buyPrice) || item.buyPrice,
                wholesalePrice: Number(selectedInventoryProduct.wholesalePrice) || item.wholesalePrice,
                sellPrice: Number(selectedInventoryProduct.sellPrice) || item.sellPrice,
                stock,
              }
            : item,
        ),
      )
    } else {
      const sourceTable = selectedInventoryProduct.sourceTable || "products"
      const sourceId = selectedInventoryProduct.sourceId || selectedInventoryProduct.id
      const runtimeId = buildSourceRuntimeId(sourceTable, sourceId)
      const inventoryItem: CartItem = {
        id: runtimeId,
        cartId: `${runtimeId}-${Date.now()}`,
        sourceTable,
        sourceId,
        sku: selectedInventoryProduct.sku || "",
        name: selectedInventoryProduct.name,
        category: selectedInventoryProduct.category || "",
        stock,
        minStock: Number(selectedInventoryProduct.minStock) || 0,
        buyPrice: Number(selectedInventoryProduct.buyPrice) || 0,
        wholesalePrice: Number(selectedInventoryProduct.wholesalePrice) || 0,
        sellPrice: Number(selectedInventoryProduct.sellPrice) || 0,
        minimumSellPrice: Number(selectedInventoryProduct.minimumSellPrice) || 0,
        supplier: selectedInventoryProduct.supplier || "",
        capacity: selectedInventoryProduct.capacity || undefined,
        imei: selectedInventoryProduct.imei || undefined,
        quantity,
      }

      setEditableItems((prev) => [...prev, inventoryItem])
    }

    setShowInventoryProductDialog(false)
    setInventorySearchTerm("")
    setInventoryQuantity("1")
    setSelectedInventoryProductId("")
  }

  const removeEditableItem = (cartId: string) => {
    setEditableItems((prev) => prev.filter((item) => item.cartId !== cartId))
    setEditingPriceMap((prev) => {
      const next = { ...prev }
      delete next[cartId]
      return next
    })
  }

  const openCreditFlow = () => {
    if (!selectedPrefactura) return
    setSelectedCustomerForCredit(selectedPrefactura.customerId || "")
    setSelectedAlmacenCustomerForCredit("")
    setSelectedGeneralCustomerForAlmacenCredit("none")
    setAlmacenCustomerName("")
    setAlmacenCustomerPhone("")
    setAlmacenSourceCustomerId(null)
    void loadAlmacenCustomersForCredit()
    setCreditTargetType("regular")
    setShowFinalizeDialog(false)
    setShowCreditTypeDialog(true)
  }

  const handleFinalizePayment = async () => {
    if (!selectedPrefactura) return

    const paid = Number.parseFloat(queuedAmountPaid) || editableTotal

    if (paid < editableTotal) {
      if (queuedPaymentMethod === "cash") {
        setPartialCashPaid(paid)
        setPartialCreditAmount(editableTotal - paid)
        setPartialCreditMode("existing")
        setSelectedCustomerForPartialCredit(selectedPrefactura.customerId || "")
        setNewCreditCustomerName("")
        setNewCreditCustomerPhone("")
        setNewCreditCustomerCedula("")
        setNewCreditCustomerEmail("")
        setNewCreditCustomerAddress("")
        setNewCreditCustomerNotes("")
        setNewCreditCustomerDebt("0")
        setNewCreditCustomerCreditLimit("0")
        setShowFinalizeDialog(false)
        setShowPartialCreditDialog(true)
        return
      }

      toast({
        title: "Monto invalido",
        description: "El monto pagado no puede ser menor al total.",
        variant: "destructive",
      })
      return
    }

    setIsFinalizing(true)
    try {
      const finalizedAt = new Date().toISOString()
      const finalizedSale: Sale = {
        ...selectedPrefactura,
        date: finalizedAt,
        items: editableItems.map((item) => ({ ...item })),
        total: editableTotal,
        paymentMethod: queuedPaymentMethod,
        amountPaid: paid,
        change: paid - editableTotal,
        customerName: queuedCustomerName.trim() || undefined,
        customerPhone: queuedCustomerPhone.trim() || undefined,
        status: "completada",
        createdByEmployeeId: finalizerEmployeeId,
      }

      await updateSale(selectedPrefactura.id, {
        date: finalizedSale.date,
        items: finalizedSale.items,
        total: finalizedSale.total,
        paymentMethod: finalizedSale.paymentMethod,
        amountPaid: finalizedSale.amountPaid,
        change: finalizedSale.change,
        customerName: finalizedSale.customerName,
        customerPhone: finalizedSale.customerPhone,
        status: finalizedSale.status,
        createdByEmployeeId: finalizedSale.createdByEmployeeId,
      })

      await syncRepairStatusForSale(finalizedSale, "entregado")

      if (selectedPrefactura.customerId) {
        const linkedCustomer = customers.find((customer) => customer.id === selectedPrefactura.customerId)
        if (linkedCustomer) {
          await updateCustomer(linkedCustomer.id, {
            totalPurchases: linkedCustomer.totalPurchases + editableTotal,
          })
        }
      }

      toast({
        title: "Pre-factura finalizada",
        description: `Factura ${selectedPrefactura.invoiceNumber} cobrada y registrada en caja.`,
      })

      resetFinalizeState()
      navigate("/ventas", { state: { returnedInvoice: finalizedSale } })
    } catch (error) {
      console.error("Error finalizing pre-invoice:", error)
      toast({
        title: "Error",
        description: "No se pudo finalizar el pago de la pre-factura.",
        variant: "destructive",
      })
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleCreditSale = async () => {
    if (!selectedPrefactura) return

    if (creditTargetType === "almacen") {
      if (!selectedAlmacenCustomerForCredit) {
        toast({
          title: "Cliente requerido",
          description: "Seleccione un cliente de Cliente Almacen.",
          variant: "destructive",
        })
        return
      }

      setIsProcessingCreditSale(true)
      try {
        const finalizedAt = new Date().toISOString()
        const selectedAlmacenCustomer = almacenCustomersForCredit.find((c) => c.id === selectedAlmacenCustomerForCredit)
        const linkedRegularCustomer =
          selectedAlmacenCustomer?.sourceCustomerId
            ? customers.find((c) => c.id === selectedAlmacenCustomer.sourceCustomerId)
            : undefined
        const resolvedCustomerName =
          selectedAlmacenCustomer?.name ||
          queuedCustomerName.trim() ||
          selectedPrefactura.customerName ||
          "Cliente de almacen"
        const resolvedCustomerPhone =
          selectedAlmacenCustomer?.phone || queuedCustomerPhone.trim() || selectedPrefactura.customerPhone || undefined

        const finalizedSale: Sale = {
          ...selectedPrefactura,
          date: finalizedAt,
          items: editableItems,
          total: editableTotal,
          amountPaid: 0,
          change: 0,
          paymentMethod: "credit",
          customerName: resolvedCustomerName,
          customerPhone: resolvedCustomerPhone,
          customerId: linkedRegularCustomer?.id,
          almacenCustomerAccountId: selectedAlmacenCustomerForCredit,
          almacenCustomerName: resolvedCustomerName,
          almacenCustomerPhone: resolvedCustomerPhone,
          almacenSourceCustomerId: linkedRegularCustomer?.id ?? almacenSourceCustomerId ?? null,
          status: "credito",
          createdByEmployeeId: finalizerEmployeeId,
        }

        await updateSale(selectedPrefactura.id, {
          date: finalizedSale.date,
          items: finalizedSale.items,
          total: finalizedSale.total,
          amountPaid: finalizedSale.amountPaid,
          change: finalizedSale.change,
          paymentMethod: finalizedSale.paymentMethod,
          customerName: finalizedSale.customerName,
          customerPhone: finalizedSale.customerPhone,
          customerId: finalizedSale.customerId,
          almacenCustomerAccountId: finalizedSale.almacenCustomerAccountId,
          almacenCustomerName: finalizedSale.almacenCustomerName,
          almacenCustomerPhone: finalizedSale.almacenCustomerPhone,
          almacenSourceCustomerId: finalizedSale.almacenSourceCustomerId,
          status: finalizedSale.status,
          createdByEmployeeId: finalizedSale.createdByEmployeeId,
        })

        await syncRepairStatusForSale(finalizedSale, "entregado")

        toast({
          title: "Venta a credito de almacen completada",
          description: `Se registro credito en /cliente-almacen para ${resolvedCustomerName}.`,
        })

        resetFinalizeState()
        navigate("/ventas", { state: { returnedInvoice: finalizedSale } })
      } catch (error) {
        console.error("Error finalizing almacen credit sale:", error)
        toast({
          title: "Error",
          description: "No se pudo enviar la pre-factura al credito de almacen.",
          variant: "destructive",
        })
      } finally {
        setIsProcessingCreditSale(false)
      }
      return
    }

    const customer = customers.find((c) => c.id === selectedCustomerForCredit)
    if (!customer) {
      toast({
        title: "Error",
        description: "Seleccione un cliente valido.",
        variant: "destructive",
      })
      return
    }

    const newDebt = customer.debt + editableTotal
    if (customer.creditLimit && customer.creditLimit > 0 && newDebt > customer.creditLimit) {
      toast({
        title: "Limite de credito excedido",
        description: `La deuda nueva ($${formatCurrency(newDebt)}) excederia el limite de credito ($${formatCurrency(customer.creditLimit)}).`,
        variant: "destructive",
      })
      return
    }

    setIsProcessingCreditSale(true)
    try {
      const finalizedAt = new Date().toISOString()
      const finalizedSale: Sale = {
        ...selectedPrefactura,
        date: finalizedAt,
        items: editableItems,
        total: editableTotal,
        amountPaid: 0,
        change: 0,
        paymentMethod: "credit",
        customerName: customer.name,
        customerPhone: customer.phone || undefined,
        customerId: customer.id,
        status: "credito",
        createdByEmployeeId: finalizerEmployeeId,
      }

      await updateSale(selectedPrefactura.id, {
        date: finalizedSale.date,
        items: finalizedSale.items,
        total: finalizedSale.total,
        amountPaid: finalizedSale.amountPaid,
        change: finalizedSale.change,
        paymentMethod: finalizedSale.paymentMethod,
        customerName: finalizedSale.customerName,
        customerPhone: finalizedSale.customerPhone,
        customerId: finalizedSale.customerId,
        status: finalizedSale.status,
        createdByEmployeeId: finalizedSale.createdByEmployeeId,
      })

      await updateCustomer(customer.id, {
        debt: customer.debt + editableTotal,
        totalPurchases: customer.totalPurchases + editableTotal,
        status: "En proceso",
        })

        await syncRepairStatusForSale(finalizedSale, "entregado")

        toast({
        title: "Venta a credito completada",
        description: selectedHasAlmacenItems
          ? `Se agrego $${formatCurrency(editableTotal)} a la deuda de ${customer.name}. Incluye productos de almacen y se registro tambien en /cliente-almacen.`
          : `Se agrego $${formatCurrency(editableTotal)} a la deuda de ${customer.name}.`,
      })

      resetFinalizeState()
      navigate("/ventas", { state: { returnedInvoice: finalizedSale } })
    } catch (error) {
      console.error("Error finalizing credit sale:", error)
      toast({
        title: "Error",
        description: "No se pudo enviar la pre-factura a credito.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingCreditSale(false)
    }
  }

  const handlePartialCreditConfirm = async () => {
    if (!selectedPrefactura) return

    let customer: Customer | undefined

    if (partialCreditMode === "existing") {
      customer = customers.find((c) => c.id === selectedCustomerForPartialCredit)
      if (!customer) {
        toast({
          title: "Error",
          description: "Seleccione un cliente valido.",
          variant: "destructive",
        })
        return
      }
    } else {
      const newCustomerData: Omit<Customer, "id"> = {
        name: newCreditCustomerName.trim(),
        phone: newCreditCustomerPhone.trim(),
        cedula: newCreditCustomerCedula.trim(),
        email: newCreditCustomerEmail.trim(),
        address: newCreditCustomerAddress.trim(),
        status: "En proceso",
        creditDevice: "",
        notes: newCreditCustomerNotes.trim(),
        debt: Number(newCreditCustomerDebt) || 0,
        totalPurchases: 0,
        creditLimit: Number(newCreditCustomerCreditLimit) || 0,
        creditBalance: 0,
      }

      const newCustomerId = await addCustomer(newCustomerData)
      if (!newCustomerId) {
        toast({
          title: "Error",
          description: "No se pudo crear el cliente.",
          variant: "destructive",
        })
        return
      }

      customer = { ...newCustomerData, id: newCustomerId }
    }

    if (!customer) {
      toast({
        title: "Error",
        description: "No se pudo encontrar o crear el cliente.",
        variant: "destructive",
      })
      return
    }

    setIsProcessingPartialCredit(true)
    try {
      const finalizedAt = new Date().toISOString()
      const finalizedSale: Sale = {
        ...selectedPrefactura,
        date: finalizedAt,
        items: editableItems,
        total: editableTotal,
        amountPaid: partialCashPaid,
        change: 0,
        paymentMethod: "cash",
        customerName: customer.name,
        customerPhone: customer.phone || undefined,
        customerId: customer.id,
        status: "credito",
        createdByEmployeeId: finalizerEmployeeId,
      }

      await updateSale(selectedPrefactura.id, {
        date: finalizedSale.date,
        items: finalizedSale.items,
        total: finalizedSale.total,
        amountPaid: finalizedSale.amountPaid,
        change: finalizedSale.change,
        paymentMethod: finalizedSale.paymentMethod,
        customerName: finalizedSale.customerName,
        customerPhone: finalizedSale.customerPhone,
        customerId: finalizedSale.customerId,
        status: finalizedSale.status,
        createdByEmployeeId: finalizedSale.createdByEmployeeId,
      })

      await updateCustomer(customer.id, {
        debt: customer.debt + partialCreditAmount,
        totalPurchases: customer.totalPurchases + editableTotal,
        status: "En proceso",
        })

        await syncRepairStatusForSale(finalizedSale, "entregado")

        toast({
        title: "Venta completada con credito",
        description: selectedHasAlmacenItems
          ? `Se cobro $${formatCurrency(partialCashPaid)} en efectivo y se envio $${formatCurrency(partialCreditAmount)} a credito. Incluye productos de almacen y se registro tambien en /cliente-almacen.`
          : `Se cobro $${formatCurrency(partialCashPaid)} en efectivo y se envio $${formatCurrency(partialCreditAmount)} a credito.`,
      })

      resetFinalizeState()
      navigate("/ventas", { state: { returnedInvoice: finalizedSale } })
    } catch (error) {
      console.error("Error finalizing partial credit sale:", error)
      toast({
        title: "Error",
        description: "No se pudo completar el pago parcial.",
        variant: "destructive",
      })
    } finally {
      setIsProcessingPartialCredit(false)
    }
  }

  const handleDeletePrefactura = async (sale: Sale) => {
    if (!canDelete) {
      toast({
        title: "Sin permisos",
        description: "No tienes permisos para eliminar pre-facturas.",
        variant: "destructive",
      })
      return
    }

    const confirmed = window.confirm(`Esta accion eliminara la pre-factura ${sale.invoiceNumber}. Deseas continuar?`)
    if (!confirmed) return

    setDeletingSaleId(sale.id)
    try {
      await deleteSale(sale.id)
      toast({
        title: "Pre-factura eliminada",
        description: `La factura ${sale.invoiceNumber} fue eliminada.`,
      })
    } catch (error) {
      console.error("Error deleting pre-invoice:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar la pre-factura.",
        variant: "destructive",
      })
    } finally {
      setDeletingSaleId(null)
    }
  }

  return (
    <div className="space-y-4 p-3 pb-20 sm:space-y-6 sm:p-4 md:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <div>
                <div className="text-sm text-muted-foreground">Pre-facturas en cola</div>
                <div className="text-2xl font-bold">{prefacturasEnCola.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="text-sm text-muted-foreground">Total pendiente</div>
                <div className="text-2xl font-bold">${formatCurrency(totalEnCola)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock3 className="h-5 w-5 text-blue-600" />
              <div>
                <div className="text-sm text-muted-foreground">Ultima pre-factura</div>
                <div className="text-sm font-semibold">
                  {ultimaPrefacturaFecha ? new Date(ultimaPrefacturaFecha).toLocaleString("es-DO") : "Sin registros"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl md:text-2xl">Cola Exclusiva de pre-facturas</CardTitle>
          <CardDescription className="text-sm md:text-base">
            Listado de pre-facturas guardadas en cola y pendientes de cobro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prefacturasEnCola.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground sm:p-10">
              No hay pre-facturas en cola por ahora.
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-md border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factura</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefono</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prefacturasEnCola.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">{sale.invoiceNumber}</TableCell>
                        <TableCell>{sale.customerName || "Cliente general"}</TableCell>
                        <TableCell>{sale.customerPhone || "-"}</TableCell>
                        <TableCell>{new Date(sale.date).toLocaleDateString("es-DO")}</TableCell>
                        <TableCell className="text-right">${formatCurrency(sale.total)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">En cola</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => openFinalizeDialog(sale)}
                              disabled={!canFinalizeQueue || isFinalizing}
                              className="min-h-11"
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Finalizar pago
                            </Button>

                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openViewDialog(sale)}
                              title="Ver pre-factura"
                              className="min-h-11 min-w-11"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="outline"
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
                              title="Imprimir pre-factura"
                              className="min-h-11 min-w-11"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="destructive"
                              size="icon"
                              onClick={() => handleDeletePrefactura(sale)}
                              disabled={!canDelete || deletingSaleId === sale.id}
                              title="Eliminar pre-factura"
                              className="min-h-11 min-w-11"
                            >
                              {deletingSaleId === sale.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 lg:hidden">
                {prefacturasEnCola.map((sale) => (
                  <div key={sale.id} className="rounded-lg border p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{sale.invoiceNumber}</div>
                        <div className="text-sm text-muted-foreground">{sale.customerName || "Cliente general"}</div>
                      </div>
                      <Badge variant="secondary">En cola</Badge>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Teléfono</span>
                        <span className="text-foreground">{sale.customerPhone || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Fecha</span>
                        <span className="text-foreground">{new Date(sale.date).toLocaleDateString("es-DO")}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Total</span>
                        <span className="font-semibold text-foreground">${formatCurrency(sale.total)}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => openFinalizeDialog(sale)}
                        disabled={!canFinalizeQueue || isFinalizing}
                        className="w-full min-h-11"
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Finalizar pago
                      </Button>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => openViewDialog(sale)}
                          title="Ver pre-factura"
                          className="min-h-11 min-w-11"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
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
                          title="Imprimir pre-factura"
                          className="min-h-11 min-w-11"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeletePrefactura(sale)}
                          disabled={!canDelete || deletingSaleId === sale.id}
                          title="Eliminar pre-factura"
                          className="min-h-11 min-w-11"
                        >
                          {deletingSaleId === sale.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCompletedSaleDialog} onOpenChange={setShowCompletedSaleDialog}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Venta Completada</DialogTitle>
          </DialogHeader>
          {completedSale && (
            <div className="space-y-4">
              <div className="text-center py-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">Venta Exitosa</div>
                <div className="text-lg mt-2">Factura: {completedSale.invoiceNumber}</div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span>{new Date(completedSale.date).toLocaleString("es-DO")}</span>
                </div>
                {completedSale.customerName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cliente:</span>
                    <span>{completedSale.customerName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Metodo de Pago:</span>
                  <span>
                    {completedSale.paymentMethod === "cash"
                      ? "Efectivo"
                      : completedSale.paymentMethod === "card"
                        ? "Tarjeta"
                        : completedSale.paymentMethod === "credit"
                          ? "A Crédito"
                          : "Transferencia"}
                  </span>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-md border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedSale.items.map((item) => (
                      <TableRow key={item.cartId}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          ${formatCurrency((item.customPrice ?? item.sellPrice) * item.quantity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 lg:hidden">
                {completedSale.items.map((item) => (
                  <div key={item.cartId} className="rounded-lg border p-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Cantidad</div>
                        <div className="font-semibold">{item.quantity}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="font-semibold">
                          ${formatCurrency((item.customPrice ?? item.sellPrice) * item.quantity)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                {completedSale.paymentMethod !== "credit" && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Monto Pagado:</span>
                      <span>${formatCurrency(completedSale.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span className="text-muted-foreground">Cambio:</span>
                      <span>${formatCurrency(completedSale.change)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span>${formatCurrency(completedSale.total)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                completedSale &&
                void printSaleInvoice(
                  completedSale,
                  customers,
                  employeeForPrint,
                  undefined,
                  getSaleInvoicePersistOptions(currentUser?.adminId, completedSale.id, "tienda"),
                )
              }
              disabled={!completedSale}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button onClick={() => setShowCompletedSaleDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ver pre-factura</DialogTitle>
          </DialogHeader>

          {selectedPrefactura && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Factura:</span>
                  <span className="font-medium">{selectedPrefactura.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span>{new Date(selectedPrefactura.date).toLocaleString("es-DO")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span>{selectedPrefactura.customerName || "Cliente general"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefono:</span>
                  <span>{selectedPrefactura.customerPhone || "-"}</span>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-md border lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPrefactura.items.map((item) => (
                      <TableRow key={item.cartId}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">${formatCurrency(item.customPrice ?? item.sellPrice)}</TableCell>
                        <TableCell className="text-right">${formatCurrency((item.customPrice ?? item.sellPrice) * item.quantity)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 lg:hidden">
                {selectedPrefactura.items.map((item) => (
                  <div key={item.cartId} className="rounded-lg border p-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Cantidad</div>
                        <div className="font-semibold">{item.quantity}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Precio</div>
                        <div className="font-semibold">${formatCurrency(item.customPrice ?? item.sellPrice)}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2 col-span-2">
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="font-semibold">
                          ${formatCurrency((item.customPrice ?? item.sellPrice) * item.quantity)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between border-t pt-3 text-lg font-bold">
                <span>Total</span>
                <span>${formatCurrency(selectedPrefactura.total)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                selectedPrefactura &&
                void printSaleInvoice(
                  selectedPrefactura,
                  customers,
                  employeeForPrint,
                  undefined,
                  getSaleInvoicePersistOptions(currentUser?.adminId, selectedPrefactura.id, "tienda"),
                )
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button onClick={() => setShowViewDialog(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFinalizeDialog} onOpenChange={setShowFinalizeDialog}>
        <DialogContent className="w-[95vw] max-w-[95vw] md:max-w-[42rem] lg:max-w-[78rem] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Finalizar pago de pre-factura</DialogTitle>
          </DialogHeader>

          {selectedPrefactura && (
            <div className="grid gap-4 py-4">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Factura:</span>
                  <span className="font-medium">{selectedPrefactura.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total editable:</span>
                  <span className="font-bold">${formatCurrency(editableTotal)}</span>
                </div>
              </div>

              <div className="hidden overflow-hidden rounded-md border max-h-[280px] lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-right">Cant.</TableHead>
                      <TableHead className="text-right">Costo</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Accion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editableItems.map((item) => (
                      <TableRow key={item.cartId}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateEditableItemQuantity(item.cartId, e.target.value)}
                            className="h-8 w-20 ml-auto text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={Number(item.buyPrice ?? 0)}
                            onChange={(e) => {
                              const value = Number.parseFloat(e.target.value)
                              const safeValue = Number.isFinite(value) && value >= 0 ? value : 0
                              setEditableItems((prev) =>
                                prev.map((entry) =>
                                  entry.cartId === item.cartId ? { ...entry, buyPrice: safeValue } : entry,
                                ),
                              )
                            }}
                            className="h-8 w-24 ml-auto text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editingPriceMap[item.cartId] ?? getItemPrice(item).toString()}
                            onChange={(e) => updateEditableItemPrice(item.cartId, e.target.value)}
                            onBlur={() => {
                              setEditingPriceMap((prev) => {
                                const next = { ...prev }
                                delete next[item.cartId]
                                return next
                              })
                            }}
                            className="h-8 w-24 ml-auto text-right"
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${formatCurrency(getItemPrice(item) * item.quantity)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeEditableItem(item.cartId)}
                            title="Quitar item"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 lg:hidden">
                {editableItems.map((item) => (
                  <div key={item.cartId} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium break-words">{item.name}</div>
                        <div className="text-xs text-muted-foreground">Total: ${formatCurrency(getItemPrice(item) * item.quantity)}</div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeEditableItem(item.cartId)}
                        title="Quitar item"
                        className="shrink-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Cant.</Label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) => updateEditableItemQuantity(item.cartId, e.target.value)}
                          className="h-9 text-right"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Costo</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={Number(item.buyPrice ?? 0)}
                          onChange={(e) => {
                            const value = Number.parseFloat(e.target.value)
                            const safeValue = Number.isFinite(value) && value >= 0 ? value : 0
                            setEditableItems((prev) =>
                              prev.map((entry) =>
                                entry.cartId === item.cartId ? { ...entry, buyPrice: safeValue } : entry,
                              ),
                            )
                          }}
                          className="h-9 text-right"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Precio</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editingPriceMap[item.cartId] ?? getItemPrice(item).toString()}
                          onChange={(e) => updateEditableItemPrice(item.cartId, e.target.value)}
                          onBlur={() => {
                            setEditingPriceMap((prev) => {
                              const next = { ...prev }
                              delete next[item.cartId]
                              return next
                            })
                          }}
                          className="h-9 text-right"
                        />
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Subtotal</div>
                        <div className="font-semibold">${formatCurrency(getItemPrice(item) * item.quantity)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="text-sm font-medium">Agregar producto manual a esta factura</div>
                <Button type="button" variant="outline" size="sm" onClick={openInventoryProductDialog} className="gap-2">
                  <PackagePlus className="h-4 w-4" />
                  Tomar del inventario
                </Button>
                <div className="grid gap-2 md:grid-cols-12">
                  <div className="md:col-span-4">
                    <Input
                      placeholder="Descripcion del producto manual"
                      value={manualItemDescription}
                      onChange={(e) => setManualItemDescription(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Cant."
                      value={manualItemQuantity}
                      onChange={(e) => setManualItemQuantity(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Costo"
                      value={manualItemCost}
                      onChange={(e) => setManualItemCost(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Precio"
                      value={manualItemPrice}
                      onChange={(e) => setManualItemPrice(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button type="button" className="w-full" onClick={addManualItemToEditableSale}>
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Metodo de pago</Label>
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
                <Label>Nombre del cliente (opcional)</Label>
                <Input
                  placeholder="Ej: Juan Perez"
                  value={queuedCustomerName}
                  onChange={(e) => setQueuedCustomerName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Telefono del cliente (opcional)</Label>
                <Input
                  placeholder="Ej: 8290000000"
                  value={queuedCustomerPhone}
                  onChange={(e) => setQueuedCustomerPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Monto pagado</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder={editableTotal.toString()}
                  value={queuedAmountPaid}
                  onChange={(e) => setQueuedAmountPaid(e.target.value)}
                />
              </div>

              {queuedAmountPaid && Number.parseFloat(queuedAmountPaid) >= editableTotal && (
                <div className="flex justify-between text-sm font-medium text-green-600">
                  <span>Cambio:</span>
                  <span>${formatCurrency(Number.parseFloat(queuedAmountPaid) - editableTotal)}</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowFinalizeDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="outline"
              onClick={openCreditFlow}
              disabled={isFinalizing || isProcessingCreditSale || isProcessingPartialCredit || !selectedPrefactura}
              className="gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Enviar a credito
            </Button>
            <Button onClick={handleFinalizePayment} disabled={isFinalizing || !selectedPrefactura}>
              {isFinalizing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalizando...
                </>
              ) : (
                "Finalizar pago"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInventoryProductDialog} onOpenChange={setShowInventoryProductDialog}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tomar producto del inventario</DialogTitle>
            <DialogDescription>
              Busca un producto existente y agrégalo a la misma pre-factura.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, código o categoría"
                value={inventorySearchTerm}
                onChange={(e) => setInventorySearchTerm(e.target.value)}
              />
            </div>

            <div className="hidden max-h-[320px] overflow-hidden rounded-md border lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Precio venta</TableHead>
                    <TableHead className="text-right">Precio mayor</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryProducts.map((product) => {
                    const isSelected = product.id === selectedInventoryProductId
                    return (
                      <TableRow key={product.id} className={isSelected ? "bg-muted/50" : ""}>
                        <TableCell>
                          <div className="font-medium">{product.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {product.sku || product.sourceId || "Sin código"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{product.stock}</TableCell>
                        <TableCell className="text-right">${formatCurrency(product.sellPrice || 0)}</TableCell>
                        <TableCell className="text-right">${formatCurrency(product.wholesalePrice || 0)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() => setSelectedInventoryProductId(product.id)}
                          >
                            {isSelected ? "Elegido" : "Elegir"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {inventoryProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No hay productos disponibles con ese filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 lg:hidden">
              {inventoryProducts.map((product) => {
                const isSelected = product.id === selectedInventoryProductId
                return (
                  <div key={product.id} className={`rounded-lg border p-3 ${isSelected ? "bg-muted/50" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium break-words">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.sku || product.sourceId || "Sin codigo"}</div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => setSelectedInventoryProductId(product.id)}
                        className="shrink-0"
                      >
                        {isSelected ? "Elegido" : "Elegir"}
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Stock</div>
                        <div className="font-semibold">{product.stock}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2">
                        <div className="text-xs text-muted-foreground">Precio venta</div>
                        <div className="font-semibold">${formatCurrency(product.sellPrice || 0)}</div>
                      </div>
                      <div className="rounded-md bg-muted p-2 col-span-2">
                        <div className="text-xs text-muted-foreground">Precio mayor</div>
                        <div className="font-semibold">${formatCurrency(product.wholesalePrice || 0)}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {inventoryProducts.length === 0 && (
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No hay productos disponibles con ese filtro.
                </div>
              )}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_160px]">
              <div className="rounded-md border p-3">
                <div className="text-sm font-medium">Producto seleccionado</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {selectedInventoryProduct ? (
                    <>
                      <div className="font-medium text-foreground">{selectedInventoryProduct.name}</div>
                      <div>{selectedInventoryProduct.sku || selectedInventoryProduct.sourceId || "Sin código"}</div>
                      <div>Stock disponible: {selectedInventoryProduct.stock}</div>
                    </>
                  ) : (
                    "Selecciona un producto de la lista."
                  )}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <Label className="text-sm">Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={inventoryQuantity}
                  onChange={(e) => setInventoryQuantity(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowInventoryProductDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={addInventoryProductToEditableSale} disabled={!selectedInventoryProduct}>
              Agregar a la pre-factura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto md:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar pre-factura a credito</DialogTitle>
          </DialogHeader>
          {selectedPrefactura && (
            <div className="grid gap-4 py-4">
              {creditTargetType === "almacen" ? (
                <div className="space-y-2">
                  <Label>Seleccionar Cliente del Almacen</Label>
                  <Select value={selectedAlmacenCustomerForCredit} onValueChange={handleAlmacenCustomerForCreditChange}>
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
                        <div className="p-2 text-xs text-muted-foreground">No hay clientes registrados en Cliente Almacen.</div>
                      ) : (
                        almacenCustomersForCredit.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            <div className="flex flex-col">
                              <span>{customer.name}</span>
                              {customer.phone && <span className="text-xs text-muted-foreground">Telefono: {customer.phone}</span>}
                              <span className="text-xs text-muted-foreground">Deuda: ${formatCurrency(customer.debt)}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-col gap-2 md:flex-row">
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
                    <div className="flex flex-col gap-2 md:flex-row">
                      <Select
                        value={selectedGeneralCustomerForAlmacenCredit}
                        onValueChange={setSelectedGeneralCustomerForAlmacenCredit}
                      >
                        <SelectTrigger className="md:flex-1">
                          <SelectValue placeholder="Seleccionar cliente" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[40vh]">
                          <SelectItem value="none">Seleccionar cliente</SelectItem>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              <div className="flex flex-col">
                                <span>{customer.name}</span>
                                {customer.phone && (
                                  <span className="text-xs text-muted-foreground">Telefono: {customer.phone}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
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
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Seleccionar cliente</Label>
                  <Select value={selectedCustomerForCredit} onValueChange={setSelectedCustomerForCredit}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex flex-col">
                            <span>{c.name}</span>
                            <span className="text-xs text-muted-foreground">Cedula: {c.cedula || "-"}</span>
                            <span className="text-xs text-muted-foreground">Telefono: {c.phone || "-"}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {creditTargetType === "almacen" && almacenCustomerName && (
                <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                  Cliente del Almacen: <strong>{almacenCustomerName}</strong>
                  {almacenCustomerPhone ? <> - Tel: <strong>{almacenCustomerPhone}</strong></> : null}
                </div>
              )}

              {selectedCustomerForCredit && (() => {
                const customer = customers.find((c) => c.id === selectedCustomerForCredit)
                if (!customer) return null
                return (
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="font-semibold">{customer.name}</div>
                    <div className="text-sm text-muted-foreground">Deuda actual: ${formatCurrency(customer.debt)}</div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-sm">Nueva pre-factura:</span>
                      <span className="font-medium">${formatCurrency(editableTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-semibold">Nueva deuda total:</span>
                      <span className="font-bold text-red-600">${formatCurrency(customer.debt + editableTotal)}</span>
                    </div>
                  </div>
                )
              })()}

              <div className="border rounded-lg p-3 bg-background">
                <div className="text-sm font-medium mb-2">Resumen de pre-factura</div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {editableItems.map((item) => (
                    <div key={item.cartId} className="flex justify-between text-sm">
                      <span>
                        {item.name} x {item.quantity}
                      </span>
                      <span>${formatCurrency(getItemPrice(item) * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t font-bold">
                  <span>Total:</span>
                  <span>${formatCurrency(editableTotal)}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreditDialog(false)
                setShowCreditTypeDialog(true)
              }}
            >
              Volver
            </Button>
            <Button
              onClick={handleCreditSale}
              disabled={creditTargetType === "regular" ? !selectedCustomerForCredit || isProcessingCreditSale : isProcessingCreditSale}
            >
              {isProcessingCreditSale ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                "Confirmar venta a credito"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditTypeDialog} onOpenChange={setShowCreditTypeDialog}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>¿Para quién es el crédito?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">Seleccione a dónde va el crédito de esta venta</p>
          <div className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="h-auto p-4 justify-start flex-col items-start"
              onClick={() => {
                setCreditTargetType("almacen")
                void loadAlmacenCustomersForCredit()
                setShowCreditTypeDialog(false)
                setShowCreditDialog(true)
              }}
            >
              <span className="font-semibold">Cliente del Almacén</span>
              <span className="text-xs text-muted-foreground">Para ventas y creditos del almacen</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto p-4 justify-start flex-col items-start"
              onClick={() => {
                setCreditTargetType("regular")
                setShowCreditTypeDialog(false)
                setShowCreditDialog(true)
              }}
            >
              <span className="font-semibold">Cliente Regular</span>
              <span className="text-xs text-muted-foreground">Para clientes normales del negocio</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddAlmacenCustomerDialog}
        onOpenChange={(open) => {
          setShowAddAlmacenCustomerDialog(open)
          if (!open) setNewAlmacenCustomerForm(INITIAL_NEW_ALMACEN_CUSTOMER_FORM)
        }}
      >
        <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar cliente de almacen</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAlmacenCustomerForCredit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre Completo</Label>
                <Input
                  value={newAlmacenCustomerForm.name}
                  onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label>Cedula / ID</Label>
                <Input
                  value={newAlmacenCustomerForm.cedula}
                  onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, cedula: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input
                  value={newAlmacenCustomerForm.phone}
                  onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label>Correo Electronico</Label>
                <Input
                  type="email"
                  value={newAlmacenCustomerForm.email}
                  onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label>Deuda Inicial</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAlmacenCustomerForm.debt}
                  onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, debt: event.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Limite de Credito</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAlmacenCustomerForm.creditLimit}
                  onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Direccion</Label>
              <Input
                value={newAlmacenCustomerForm.address}
                onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, address: event.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={newAlmacenCustomerForm.notes}
                onChange={(event) => setNewAlmacenCustomerForm((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddAlmacenCustomerDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isCreatingAlmacenCustomer}>
                {isCreatingAlmacenCustomer ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar cliente"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPartialCreditDialog} onOpenChange={setShowPartialCreditDialog}>
        <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pago parcial - enviar faltante a credito</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Total de la pre-factura:</span>
                <span className="font-medium">${formatCurrency(partialCashPaid + partialCreditAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Pagado en efectivo:</span>
                <span className="font-medium text-green-600">${formatCurrency(partialCashPaid)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-sm font-semibold">Faltante a credito:</span>
                <span className="font-bold text-red-600 text-lg">${formatCurrency(partialCreditAmount)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row">
              <Button
                type="button"
                variant={partialCreditMode === "existing" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setPartialCreditMode("existing")}
              >
                <Users className="h-4 w-4" /> Cliente existente
              </Button>
              <Button
                type="button"
                variant={partialCreditMode === "new" ? "default" : "outline"}
                className="flex-1 gap-2"
                onClick={() => setPartialCreditMode("new")}
              >
                <UserPlus className="h-4 w-4" /> Nuevo cliente
              </Button>
            </div>

            {partialCreditMode === "existing" ? (
              <div className="space-y-2">
                <Label>Seleccionar cliente</Label>
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
                  const customer = customers.find((c) => c.id === selectedCustomerForPartialCredit)
                  if (!customer) return null
                  return (
                    <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deuda actual:</span>
                        <span className="font-medium text-orange-600">${formatCurrency(customer.debt)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">+ Faltante:</span>
                        <span className="font-medium text-red-600">${formatCurrency(partialCreditAmount)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t">
                        <span className="font-semibold">Nueva deuda total:</span>
                        <span className="font-bold text-red-600">${formatCurrency(customer.debt + partialCreditAmount)}</span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nombre completo</Label>
                    <Input
                      placeholder="Requerido"
                      value={newCreditCustomerName}
                      onChange={(e) => setNewCreditCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cedula / ID</Label>
                    <Input
                      placeholder="Opcional"
                      value={newCreditCustomerCedula}
                      onChange={(e) => setNewCreditCustomerCedula(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefono</Label>
                    <Input
                      placeholder="Opcional"
                      value={newCreditCustomerPhone}
                      onChange={(e) => setNewCreditCustomerPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Correo</Label>
                    <Input
                      type="email"
                      placeholder="Opcional"
                      value={newCreditCustomerEmail}
                      onChange={(e) => setNewCreditCustomerEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Deuda inicial</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newCreditCustomerDebt}
                      onChange={(e) => setNewCreditCustomerDebt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Limite de credito</Label>
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
                  <Label>Direccion</Label>
                  <Input
                    placeholder="Opcional"
                    value={newCreditCustomerAddress}
                    onChange={(e) => setNewCreditCustomerAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notas internas</Label>
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
            <Button
              variant="outline"
              onClick={() => {
                setShowPartialCreditDialog(false)
                setShowFinalizeDialog(true)
              }}
            >
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
                "Confirmar venta con credito"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
