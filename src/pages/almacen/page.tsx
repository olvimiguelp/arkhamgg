"use client"

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Boxes,
  Eye,
  Edit,
  FileDown,
  FileText,
  Loader2,
  Minus,
  PackagePlus,
  Printer,
  Search,
  Trash2,
  Wallet,
} from "lucide-react"
import { printStorageLabel, STORAGE_LABEL_COMPANY_SHORT } from "@/components/invoice-printer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useStore, type Product, type Sale } from "@/components/store-context"
import { formatCurrency } from "@/lib/utils"
import { useDraggableScroll } from "@/hooks/use-draggable-scroll"
import {
  ALMACEN_CATEGORY_OPTIONS,
  buildAlmacenInternalSku,
  compareAlmacenBoxNumbers,
  formatAlmacenSku,
  getAlmacenCategoryFilterValue,
  getAlmacenCategoryLabel,
  getAlmacenCategoryRangeLabel,
  isAlmacenCategory,
  isValidAlmacenBoxNumber,
  normalizeAlmacenCategory,
  normalizeAlmacenBoxNumber,
} from "@/lib/almacen"
import { sameSaleItemSource } from "@/lib/transaction-classification"

type FormState = {
  boxNumber: string
  name: string
  imei: string
  category: string
  customCategory: string
  buyPrice: string
  sellPrice: string
  stock: string
  minStock: string
  supplier: string
}

const INITIAL_FORM: FormState = {
  boxNumber: "",
  name: "",
  imei: "",
  category: "",
  customCategory: "",
  buyPrice: "",
  sellPrice: "",
  stock: "",
  minStock: "1",
  supplier: "",
}

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()

const normalizeNumericSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^0-9]/g, "")
    .trim()

type ProductPurchaseRecord = {
  saleId: string
  invoiceId: string
  invoiceName: string
  customerName: string
  paymentLabel: string
  date: string
  quantity: number
}

const getSalePaymentLabel = (sale: Pick<Sale, "status" | "paymentMethod" | "amountPaid" | "total">) => {
  const hasCreditDebt =
    sale.status === "credito" || sale.paymentMethod === "credit" || Number(sale.amountPaid || 0) < Number(sale.total || 0)

  if (hasCreditDebt) return "Credito"
  if (sale.paymentMethod === "card") return "Tarjeta"
  if (sale.paymentMethod === "transfer") return "Transferencia"
  return "Efectivo"
}

const formatPurchaseDate = (value: string) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed)
}

const getSaleCustomerName = (sale: Pick<Sale, "almacenCustomerName" | "customerName">) => {
  const fromAlmacen = String(sale.almacenCustomerName || "").trim()
  if (fromAlmacen) return fromAlmacen
  const fromSale = String(sale.customerName || "").trim()
  if (fromSale) return fromSale
  return "Cliente no registrado"
}

const getSaleInvoiceName = (sale: Pick<Sale, "items">) => {
  const names = sale.items.map((item) => String(item.name || "").trim()).filter(Boolean)
  if (names.length === 0) return "Factura sin nombre"
  if (names.length === 1) return names[0]
  return `${names[0]} +${names.length - 1}`
}

export default function AlmacenPage() {
  const { products, sales, suppliers, addProduct, updateProduct, deleteProduct, setOnDialogOpen, employees, currentUser } = useStore()
  const { toast } = useToast()

  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [stockQty, setStockQty] = useState("")
  const [labelProduct, setLabelProduct] = useState<Product | null>(null)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [visibleInvoiceIds, setVisibleInvoiceIds] = useState<string[]>([])
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [pdfReportType, setPdfReportType] = useState<"low" | "stop" | "total">("low")
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM)
  const deferredSearchTerm = useDeferredValue(searchTerm)

  const employeePermissions = employees.find((employee) => employee.email === currentUser?.email)?.permissions
  const canAddProducts = currentUser?.role === "admin" || Boolean(employeePermissions?.canAdd)
  const canEditProducts = currentUser?.role === "admin" || Boolean(employeePermissions?.canEdit)
  const canDeleteProducts = currentUser?.role === "admin" || Boolean(employeePermissions?.canDelete)

  const almacenProducts = products
    .filter((product) => Boolean(product.boxNumber) || isAlmacenCategory(product.category))
    .sort((a, b) => {
      const boxCompare = compareAlmacenBoxNumbers(a.boxNumber, b.boxNumber)
      if (boxCompare !== 0) return boxCompare

      const categoryCompare = getAlmacenCategoryLabel(a.category).localeCompare(getAlmacenCategoryLabel(b.category))
      if (categoryCompare !== 0) return categoryCompare

      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    })

  const suppliersById = useMemo(() => {
    const map = new Map<string, string>()
    suppliers.forEach((supplier) => {
      map.set(supplier.id, supplier.name || "")
    })
    return map
  }, [suppliers])

  const searchableProducts = useMemo(
    () =>
      almacenProducts.map((product, index) => {
        const normalizedBox = normalizeAlmacenBoxNumber(product.boxNumber)
        const normalizedSku = formatAlmacenSku(product.sku)
        const normalizedNumericSku = normalizeNumericSearchText(product.sku || "")
        const normalizedNumericFormattedSku = normalizeNumericSearchText(normalizedSku)
        const categoryLabel = getAlmacenCategoryLabel(product.category)
        const supplierName = suppliersById.get(product.supplier) || ""

        return {
          product,
          index,
          normalizedName: normalizeSearchText(product.name || ""),
          normalizedBox: normalizeSearchText(normalizedBox),
          normalizedSku: normalizeSearchText(product.sku || ""),
          normalizedFormattedSku: normalizeSearchText(normalizedSku),
          normalizedNumericSku,
          normalizedNumericFormattedSku,
          searchIndex: normalizeSearchText(
            `${product.name || ""} ${normalizedBox} ${product.sku || ""} ${normalizedSku} ${normalizedNumericSku} ${normalizedNumericFormattedSku} ${categoryLabel} ${supplierName}`,
          ),
        }
      }),
    [almacenProducts, suppliersById],
  )

  const filteredProducts = useMemo(() => {
    const normalizedSearch = normalizeSearchText(deferredSearchTerm)
    const searchTokens = normalizedSearch.split(/\s+/).filter(Boolean)

    const ranked = searchableProducts
      .filter(({ product, searchIndex }) => {
        const matchesCategory =
          filterCategory === "all" || getAlmacenCategoryFilterValue(product.category) === filterCategory
        if (!matchesCategory) return false
        if (searchTokens.length === 0) return true
        return searchTokens.every((token) => searchIndex.includes(token))
      })
      .map((entry) => {
        if (!normalizedSearch) return { ...entry, score: 0 }

        let score = 0
        if (
          entry.normalizedBox === normalizedSearch ||
          entry.normalizedSku === normalizedSearch ||
          entry.normalizedFormattedSku === normalizedSearch ||
          entry.normalizedNumericSku === normalizedSearch ||
          entry.normalizedNumericFormattedSku === normalizedSearch
        ) {
          score += 120
        } else {
          if (entry.normalizedBox.startsWith(normalizedSearch)) score += 80
          if (
            entry.normalizedSku.startsWith(normalizedSearch) ||
            entry.normalizedFormattedSku.startsWith(normalizedSearch) ||
            entry.normalizedNumericSku.startsWith(normalizedSearch) ||
            entry.normalizedNumericFormattedSku.startsWith(normalizedSearch)
          ) score += 70
          if (entry.searchIndex.startsWith(normalizedSearch)) score += 10
        }

        return { ...entry, score }
      })

    ranked.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })

    return ranked.map(({ product }) => product)
  }, [deferredSearchTerm, filterCategory, searchableProducts])

  const totalItems = almacenProducts.length
  const totalBoxes = new Set(
    almacenProducts
      .map((product) => normalizeAlmacenBoxNumber(product.boxNumber))
      .filter(Boolean),
  ).size
  const totalUnits = almacenProducts.reduce((acc, product) => acc + product.stock, 0)
  const lowStockCount = almacenProducts.filter((product) => product.stock <= (product.minStock || 0)).length
  const totalValue = almacenProducts.reduce((acc, product) => acc + product.sellPrice * product.stock, 0)
  const editingProduct = useMemo(
    () => (editingId ? almacenProducts.find((product) => product.id === editingId) || null : null),
    [almacenProducts, editingId],
  )
  const resolvedCustomCategory = formData.customCategory.trim()
  const resolvedFormCategoryForSave = useMemo(
    () => (formData.category === "otros" ? resolvedCustomCategory : formData.category),
    [formData.category, resolvedCustomCategory],
  )
  const resolvedFormCategoryForSku = useMemo(
    () => (formData.category === "otros" ? resolvedCustomCategory || "otros" : formData.category),
    [formData.category, resolvedCustomCategory],
  )
  const generatedSku = useMemo(
    () =>
      buildAlmacenInternalSku({
        products: almacenProducts,
        category: resolvedFormCategoryForSku,
        currentProductId: editingProduct?.id,
        preferredSku: editingProduct?.sku,
      }) || "",
    [almacenProducts, editingProduct?.id, editingProduct?.sku, resolvedFormCategoryForSku],
  )
  const categoryRangeLabel = useMemo(
    () => getAlmacenCategoryRangeLabel(resolvedFormCategoryForSku),
    [resolvedFormCategoryForSku],
  )
  const filterCategoryOptions = useMemo(() => {
    const optionsMap = new Map<string, string>()

    ALMACEN_CATEGORY_OPTIONS.forEach((option) => {
      optionsMap.set(option.value, option.label)
    })

    almacenProducts.forEach((product) => {
      const value = getAlmacenCategoryFilterValue(product.category)
      if (!value) return
      optionsMap.set(value, getAlmacenCategoryLabel(product.category))
    })

    return Array.from(optionsMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }))
  }, [almacenProducts])

  const savedCustomCategoryOptions = useMemo(() => {
    const optionsMap = new Map<string, { value: string; label: string }>()

    almacenProducts.forEach((product) => {
      const rawCategory = (product.category || "").trim()
      if (!rawCategory) return
      if (normalizeAlmacenCategory(rawCategory)) return

      const normalizedKey = getAlmacenCategoryFilterValue(rawCategory)
      if (!normalizedKey) return

      if (!optionsMap.has(normalizedKey)) {
        optionsMap.set(normalizedKey, {
          value: rawCategory,
          label: rawCategory,
        })
      }
    })

    return Array.from(optionsMap.values())
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: "base" }))
  }, [almacenProducts])

  const formCategoryOptions = useMemo(() => {
    const options = [...ALMACEN_CATEGORY_OPTIONS, ...savedCustomCategoryOptions]

    if (
      formData.category &&
      formData.category !== "otros" &&
      !options.some((option) => option.value === formData.category)
    ) {
      options.push({
        value: formData.category,
        label: getAlmacenCategoryLabel(formData.category),
      })
    }

    return options
  }, [formData.category, savedCustomCategoryOptions])

  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM)
    setEditingId(null)
  }, [])

  const openDialog = useCallback(() => {
    if (!canAddProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para agregar productos en almacen.",
        variant: "destructive",
      })
      return
    }

    resetForm()
    setIsDialogOpen(true)
  }, [canAddProducts, resetForm, toast])

  useEffect(() => {
    setOnDialogOpen(openDialog)
    return () => setOnDialogOpen(() => { })
  }, [openDialog, setOnDialogOpen])

  const handleInputChange = (field: keyof FormState, value: string) => {
    const normalizedValue = field === "boxNumber" ? value.replace(/\D/g, "") : value
    setFormData((prev) => ({ ...prev, [field]: normalizedValue }))
  }

  const handleCategoryChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      category: value,
      customCategory: value === "otros" ? prev.customCategory : "",
    }))
  }

  const handleEditProduct = (product: Product) => {
    if (!canEditProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para editar productos.",
        variant: "destructive",
      })
      return
    }

    const normalizedCategory = normalizeAlmacenCategory(product.category)

    setEditingId(product.id)
    setFormData({
      boxNumber: normalizeAlmacenBoxNumber(product.boxNumber),
      name: product.name,
      imei: product.imei || "",
      category: normalizedCategory || (product.category ? "otros" : ""),
      customCategory: normalizedCategory ? "" : (product.category || ""),
      buyPrice: product.buyPrice > 0 ? product.buyPrice.toString() : "",
      sellPrice: product.sellPrice.toString(),
      stock: product.stock.toString(),
      minStock: product.minStock?.toString() || "1",
      supplier: product.supplier || "",
    })
    setIsDialogOpen(true)
  }

  const handleDeleteClick = (id: string) => {
    if (!canDeleteProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para eliminar productos.",
        variant: "destructive",
      })
      return
    }

    setDeleteId(id)
  }

  const handleConfirmDelete = async () => {
    if (!deleteId) return

    try {
      await deleteProduct(deleteId)
      toast({
        title: "Producto eliminado",
        description: "El producto se elimino del almacen.",
      })
    } catch (error) {
      console.error("Error deleting almacen product:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar el producto.",
        variant: "destructive",
      })
    } finally {
      setDeleteId(null)
    }
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm()
    }

    setIsDialogOpen(open)
  }

  const handleOpenStockDialog = (product: Product) => {
    if (!canEditProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para actualizar stock.",
        variant: "destructive",
      })
      return
    }

    setStockProduct(product)
    setStockQty("")
  }

  const handleAddStock = async () => {
    if (!stockProduct) return

    const qty = Number.parseInt(stockQty, 10)

    if (!Number.isInteger(qty) || qty <= 0) {
      toast({
        title: "Error",
        description: "Ingresa una cantidad valida mayor que cero.",
        variant: "destructive",
      })
      return
    }

    const newStock = stockProduct.stock + qty

    try {
      await updateProduct(stockProduct.id, { stock: newStock })
      toast({
        title: "Stock actualizado",
        description: `${stockProduct.name}: ${stockProduct.stock} -> ${newStock}`,
      })
      const updatedProduct = { ...stockProduct, stock: newStock }
      setStockProduct(null)
      setStockQty("")
      setLabelProduct(updatedProduct)
    } catch (error) {
      console.error("Error updating almacen stock:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar el stock.",
        variant: "destructive",
      })
    }
  }

  const handleOpenLabelDialog = (product: Product) => {
    setLabelProduct(product)
  }

  const printAlmacenLabel = useCallback(
    async (
      product: Pick<Product, "name" | "category" | "boxNumber" | "capacity" | "sku" | "imei">,
      options?: {
        closeDialog?: boolean
        showSuccessToast?: boolean
        silent?: boolean
      },
    ) => {
      const normalizedBoxNumber = normalizeAlmacenBoxNumber(product.boxNumber)

      if (!isValidAlmacenBoxNumber(normalizedBoxNumber)) {
        toast({
          title: "Error",
          description: "El numero de caja debe ser mayor que cero.",
          variant: "destructive",
        })
        return false
      }

      const formattedSku = formatAlmacenSku(product.sku)
      const labelId = formattedSku || String(product.sku || "").trim() || normalizedBoxNumber

      try {
        const printResult = await printStorageLabel(
          {
            productName: product.name,
            caja: labelId,
            component: getAlmacenCategoryLabel(product.category),
            details: normalizedBoxNumber ? `Caja ${normalizedBoxNumber}` : undefined,
            imei: product.imei,
            copies: 1,
            boxLabel: "ID",
            printerProfile: "2c-lp281b",
          },
          {
            silent: options?.silent !== false,
          },
          currentUser?.adminId,
        )

        if (!printResult.success) {
          toast({
            title: "Error",
            description: printResult.error || "El producto se guardo, pero no se pudo imprimir la pegatina.",
            variant: "destructive",
          })
          return false
        }
      } catch (error) {
        console.error("Error printing almacen label:", error)
        toast({
          title: "Error",
          description: "El producto se guardo, pero no se pudo imprimir la pegatina.",
          variant: "destructive",
        })
        return false
      }

      if (options?.showSuccessToast !== false) {
        toast({
          title: "Impresion iniciada",
          description: `Etiqueta lista para ${product.name} en la caja ${normalizedBoxNumber}.`,
        })
      }

      if (options?.closeDialog !== false) {
        setLabelProduct(null)
      }

      return true
    },
    [toast],
  )

  const handlePrintLabel = async () => {
    if (!labelProduct) return

    await printAlmacenLabel(labelProduct, { silent: false })
  }

  const handleSaveProduct = async () => {
    if (editingId && !canEditProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para editar productos.",
        variant: "destructive",
      })
      return
    }

    if (!editingId && !canAddProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para agregar productos en almacen.",
        variant: "destructive",
      })
      return
    }

    const resolvedCategory = resolvedFormCategoryForSave
    const normalizedBoxNumber = normalizeAlmacenBoxNumber(formData.boxNumber)
    const trimmedName = formData.name.trim()
    const normalizedImei = formData.imei.trim()
    const resolvedSku = buildAlmacenInternalSku({
      products: almacenProducts,
      category: resolvedFormCategoryForSku,
      currentProductId: editingId,
      preferredSku: editingProduct?.sku,
    })

    if (formData.category === "otros" && !resolvedCustomCategory) {
      toast({
        title: "Error",
        description: "Escribe el nombre del nuevo componente.",
        variant: "destructive",
      })
      return
    }

    if (!normalizedBoxNumber || !trimmedName || !resolvedCategory || !formData.sellPrice || !formData.stock) {
      toast({
        title: "Error",
        description: "Completa caja, nombre, componente, venta y stock.",
        variant: "destructive",
      })
      return
    }

    if (!resolvedSku) {
      toast({
        title: "Error",
        description: "No quedan codigos disponibles para ese componente.",
        variant: "destructive",
      })
      return
    }

    const buyPrice = formData.buyPrice.trim() === "" ? 0 : Number.parseFloat(formData.buyPrice)
    const sellPrice = Number.parseFloat(formData.sellPrice)
    const stock = Number.parseInt(formData.stock, 10)
    const minStock = Number.parseInt(formData.minStock || "0", 10)

    if (!Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || !Number.isInteger(stock)) {
      toast({
        title: "Error",
        description: "Revisa los valores numericos del formulario.",
        variant: "destructive",
      })
      return
    }

    if (stock < 0 || minStock < 0) {
      toast({
        title: "Error",
        description: "El stock y el minimo no pueden ser negativos.",
        variant: "destructive",
      })
      return
    }

    if (!isValidAlmacenBoxNumber(normalizedBoxNumber)) {
      toast({
        title: "Error",
        description: "La caja debe ser numerica y mayor que cero.",
        variant: "destructive",
      })
      return
    }

    try {
      if (editingId) {
        await updateProduct(editingId, {
          sku: resolvedSku,
          name: trimmedName,
          category: resolvedCategory,
          boxNumber: normalizedBoxNumber,
          buyPrice,
          sellPrice,
          stock,
          minStock: Number.isInteger(minStock) ? minStock : 0,
          supplier: formData.supplier,
          capacity: editingProduct?.capacity,
          imei: normalizedImei || undefined,
        })

        toast({
          title: "Producto actualizado",
          description: `Los cambios del producto con ID ${resolvedSku} fueron guardados.`,
        })
      } else {
        await addProduct({
          sku: resolvedSku,
          name: trimmedName,
          category: resolvedCategory,
          boxNumber: normalizedBoxNumber,
          buyPrice,
          sellPrice,
          stock,
          minStock: Number.isInteger(minStock) ? minStock : 0,
          supplier: formData.supplier,
          capacity: undefined,
          imei: normalizedImei || undefined,
        })

        setLabelProduct({
          id: `almacen-label-${resolvedSku}`,
          sku: resolvedSku,
          name: trimmedName,
          category: resolvedCategory,
          boxNumber: normalizedBoxNumber,
          buyPrice,
          sellPrice,
          stock,
          minStock: Number.isInteger(minStock) ? minStock : 0,
          supplier: formData.supplier,
          capacity: undefined,
          imei: normalizedImei || undefined,
        })

        toast({
          title: "Producto agregado",
          description: `El componente fue guardado con ID ${resolvedSku} en la caja ${normalizedBoxNumber}. Ahora puedes imprimir la pegatina.`,
        })
      }

      resetForm()
      setIsDialogOpen(false)
    } catch (error) {
      console.error("Error saving almacen product:", error)
      toast({
        title: "Error",
        description: "No se pudo guardar el producto.",
        variant: "destructive",
      })
    }
  }

  const { ref: scrollRef } = useDraggableScroll<HTMLDivElement>({
    childSelector: '[data-slot="table-container"]',
  })

  const historyRecords = useMemo<ProductPurchaseRecord[]>(() => {
    if (!historyProduct) return []

    const normalizedHistoryProductName = normalizeSearchText(historyProduct.name || "")
    const normalizedHistorySku = normalizeSearchText(formatAlmacenSku(historyProduct.sku) || historyProduct.sku || "")

    const records = sales.flatMap((sale) => {
      const matchedItems = sale.items.filter((item) => {
        if (sameSaleItemSource(item, historyProduct, "armacen")) return true

        const normalizedItemName = normalizeSearchText(item.name || "")
        const normalizedItemSku = normalizeSearchText(formatAlmacenSku(item.sku) || item.sku || "")

        return normalizedItemName === normalizedHistoryProductName && normalizedItemSku === normalizedHistorySku
      })

      if (matchedItems.length === 0) return []

      const quantity = matchedItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0)

      return [{
        saleId: sale.id,
        invoiceId: sale.invoiceNumber || sale.id || "-",
        invoiceName: getSaleInvoiceName(sale),
        customerName: getSaleCustomerName(sale),
        paymentLabel: getSalePaymentLabel(sale),
        date: sale.date,
        quantity,
      }]
    })

    return records.sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
  }, [historyProduct, sales])

  const handleDownloadInventoryPDF = async () => {
    if (isGeneratingPdf) return

    setIsGeneratingPdf(true)
    try {
      const { default: jsPDF } = await import("jspdf")
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const generatedAt = new Date()

      const selectedByComponent = filterCategory === "all"
        ? [...almacenProducts]
        : almacenProducts.filter((product) => getAlmacenCategoryFilterValue(product.category) === filterCategory)

      const lowStockProducts = [...selectedByComponent]
        .filter((product) => product.stock <= (product.minStock || 0))
        .sort((a, b) => a.stock - b.stock)

      const stopProducts = [...selectedByComponent]
        .filter((product) => product.stock <= 0)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

      const totalInventoryProducts = [...selectedByComponent]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

      const selectedProducts =
        pdfReportType === "low" ? lowStockProducts : pdfReportType === "stop" ? stopProducts : totalInventoryProducts

      const componentLabel =
        filterCategory === "all"
          ? ""
          : ` - ${filterCategoryOptions.find((option) => option.value === filterCategory)?.label || filterCategory}`
      const selectedTitle =
        pdfReportType === "low"
          ? `Productos con stock bajo (${selectedProducts.length})${componentLabel}`
          : pdfReportType === "stop"
            ? `Productos en stop/sin stock (${selectedProducts.length})${componentLabel}`
            : `Inventario total almacen (${selectedProducts.length})${componentLabel}`

      let y = 22
      const left = 10
      const pageBottom = 287
      const productX = 10
      const stockX = 122
      const minX = 142
      const buyX = 168
      const sellX = 198

      const drawPageHeader = () => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(13)
        doc.text("REPORTE DE INVENTARIO DE ALMACEN", 105, 10, { align: "center" })
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.text(`Generado: ${generatedAt.toLocaleDateString("es-DO")} ${generatedAt.toLocaleTimeString("es-DO")}`, 105, 15, {
          align: "center",
        })
        y = 22
      }

      const drawTableHeader = () => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8.5)
        doc.text("Producto", productX, y)
        doc.text("Stock", stockX, y, { align: "right" })
        doc.text("Minimo", minX, y, { align: "right" })
        doc.text("Costo", buyX, y, { align: "right" })
        doc.text("Venta", sellX, y, { align: "right" })
        y += 1
        doc.setLineWidth(0.3)
        doc.line(left, y + 1.5, 200, y + 1.5)
        y += 5
      }

      const drawSection = (title: string, list: Product[]) => {
        if (y > pageBottom - 16) {
          doc.addPage()
          drawPageHeader()
        }

        doc.setFont("helvetica", "bold")
        doc.setFontSize(10.5)
        doc.text(title, left, y)
        y += 5
        drawTableHeader()

        if (list.length === 0) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(9)
          doc.text("No hay productos en esta seccion.", left, y)
          y += 7
          return
        }

        list.forEach((product) => {
          if (y > pageBottom - 6) {
            doc.addPage()
            drawPageHeader()
            doc.setFont("helvetica", "bold")
            doc.setFontSize(10.5)
            doc.text(`${title} (continuacion)`, left, y)
            y += 5
            drawTableHeader()
          }

          doc.setFont("helvetica", "normal")
          doc.setFontSize(8.5)
          doc.text((product.name || "-").slice(0, 44), productX, y)
          doc.text(String(product.stock), stockX, y, { align: "right" })
          doc.text(String(product.minStock || 0), minX, y, { align: "right" })
          doc.text(`$${formatCurrency(product.buyPrice)}`, buyX, y, { align: "right" })
          doc.text(`$${formatCurrency(product.sellPrice)}`, sellX, y, { align: "right" })
          y += 5
        })

        y += 3
      }

      drawPageHeader()
      drawSection(selectedTitle, selectedProducts)

      const fileDate = generatedAt.toISOString().slice(0, 10)
      const fileSuffix = pdfReportType === "low" ? "Stock-Bajo" : pdfReportType === "stop" ? "Stop-Sin-Stock" : "Inventario-Total"
      const componentSuffix = filterCategory === "all" ? "" : `-${filterCategory}`
      doc.save(`Almacen-${fileSuffix}${componentSuffix}-${fileDate}.pdf`)

      toast({
        title: "PDF descargado",
        description:
          pdfReportType === "low"
            ? `Se descargo el PDF de productos con stock bajo${componentLabel ? componentLabel : ""}.`
            : pdfReportType === "stop"
              ? `Se descargo el PDF de productos en stop/sin stock${componentLabel ? componentLabel : ""}.`
              : `Se descargo el PDF de inventario total${componentLabel ? componentLabel : ""}.`,
      })
    } catch (error) {
      console.error("Error generating almacen inventory PDF:", error)
      toast({
        title: "Error",
        description: "No se pudo generar el PDF del inventario de almacen.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 md:p-0 md:space-y-6">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Cajas activas</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-2xl">{totalBoxes}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">{totalItems} componentes registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Unidades disponibles</CardTitle>
            <PackagePlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-2xl">{totalUnits}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Suma total de existencias en cajas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Stock bajo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-2xl">{lowStockCount}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Productos bajo minimo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[0.8rem] font-medium leading-tight sm:text-sm">Valor estimado</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-2xl">${formatCurrency(totalValue)}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Calculado sobre precio de venta</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full min-w-0 lg:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por caja, nombre, SKU, componente o proveedor..."
            className="pl-8"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
          <Select value={pdfReportType} onValueChange={(value) => setPdfReportType(value as "low" | "stop" | "total")}>
            <SelectTrigger className="w-full min-w-0 sm:w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Productos con stock bajo</SelectItem>
              <SelectItem value="stop">Productos en stop/sin stock</SelectItem>
              <SelectItem value="total">Inventario total</SelectItem>
            </SelectContent>
          </Select>

          <Button className="w-full min-h-11 sm:w-auto" onClick={handleDownloadInventoryPDF} disabled={isGeneratingPdf}>
            {isGeneratingPdf ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando PDF...
              </>
            ) : (
              <>
                <FileDown className="mr-2 h-4 w-4" />
                Descargar PDF
              </>
            )}
          </Button>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full min-w-0 sm:w-[280px]">
              <SelectValue placeholder="Filtrar componente" />
            </SelectTrigger>
            <SelectContent
              position="popper"
              side="bottom"
              align="start"
              sideOffset={4}
              className="min-w-[var(--radix-select-trigger-width)] max-w-[92vw] max-h-[60vh] overflow-y-auto"
            >
              <SelectItem value="all" className="whitespace-normal break-words leading-tight">Todos los componentes</SelectItem>
              {filterCategoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="whitespace-normal break-words leading-tight">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {searchTerm.trim() && (
            <Button variant="outline" className="w-full min-h-11 sm:w-auto" onClick={() => setSearchTerm("")}>Limpiar busqueda</Button>
          )}

          {filterCategory !== "all" && (
            <Button variant="outline" className="w-full min-h-11 sm:w-auto" onClick={() => setFilterCategory("all")}>Limpiar filtro</Button>
          )}

        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {filteredProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No hay componentes en almacen con esos filtros.
          </div>
        ) : (
          filteredProducts.map((product) => {
            const supplierName = suppliers.find((supplier) => supplier.id === product.supplier)?.name || "-"
            const categoryLabel = getAlmacenCategoryLabel(product.category)
            const boxNumber = normalizeAlmacenBoxNumber(product.boxNumber)

            return (
              <div key={product.id} className="overflow-hidden rounded-lg border bg-background p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{product.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {boxNumber ? `Caja ${boxNumber}` : "Sin caja"} • {formatAlmacenSku(product.sku) || "-"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{categoryLabel}</Badge>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span>Stock</span>
                    <span className="font-medium text-foreground">{product.stock}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Mínimo</span>
                    <span className="font-medium text-foreground">{product.minStock || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Proveedor</span>
                    <span className="font-medium text-foreground">{supplierName}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => handleOpenLabelDialog(product)}>
                    <Printer className="mr-2 h-4 w-4" /> Etiqueta
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => setHistoryProduct(product)}>
                    <Eye className="mr-2 h-4 w-4" /> Compras
                  </Button>
                  {canEditProducts && (
                    <>
                      <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => handleOpenStockDialog(product)}>
                        <PackagePlus className="mr-2 h-4 w-4" /> Stock
                      </Button>
                      <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => handleEditProduct(product)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </Button>
                    </>
                  )}
                  {canDeleteProducts && (
                    <Button variant="destructive" size="sm" className="min-h-11 flex-1" onClick={() => handleDeleteClick(product.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div ref={scrollRef} className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caja</TableHead>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Componente</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Minimo</TableHead>
                  <TableHead>Costo</TableHead>
                  <TableHead>Venta</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      No hay componentes en almacen con esos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => {
                    const supplierName = suppliers.find((supplier) => supplier.id === product.supplier)?.name || "-"
                    const categoryLabel = getAlmacenCategoryLabel(product.category)
                    const boxNumber = normalizeAlmacenBoxNumber(product.boxNumber)

                    return (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col gap-1">
                            <span>{boxNumber || "-"}</span>
                            {!boxNumber && (
                              <span className="text-xs text-amber-600">Sin caja</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{formatAlmacenSku(product.sku) || "-"}</TableCell>
                        <TableCell>{product.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{categoryLabel}</Badge>
                        </TableCell>
                        <TableCell>{product.stock}</TableCell>
                        <TableCell>{product.minStock || 0}</TableCell>
                        <TableCell>${formatCurrency(product.buyPrice)}</TableCell>
                        <TableCell>${formatCurrency(product.sellPrice)}</TableCell>
                        <TableCell>{supplierName}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Imprimir etiqueta" onClick={() => handleOpenLabelDialog(product)}>
                              <Printer className="h-4 w-4 text-sky-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs"
                              title="Ver historial de compras"
                              onClick={() => setHistoryProduct(product)}
                            >
                              Compras
                            </Button>
                            {canEditProducts && (
                              <>
                                <Button variant="ghost" size="icon" title="Aumentar stock" onClick={() => handleOpenStockDialog(product)}>
                                  <PackagePlus className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" title="Editar producto" onClick={() => handleEditProduct(product)}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {canDeleteProducts && (
                              <Button variant="ghost" size="icon" title="Eliminar producto" onClick={() => handleDeleteClick(product.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!historyProduct}
        onOpenChange={(open) => {
          if (!open) {
            setHistoryProduct(null)
            setVisibleInvoiceIds([])
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[680px] max-h-[calc(100vh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de compras del producto</DialogTitle>
          </DialogHeader>

          {historyProduct && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-semibold">{historyProduct.name}</p>
                <p className="text-sm text-muted-foreground">
                  ID {formatAlmacenSku(historyProduct.sku) || "-"} | Caja {normalizeAlmacenBoxNumber(historyProduct.boxNumber) || "-"} |{" "}
                  {getAlmacenCategoryLabel(historyProduct.category)}
                </p>
              </div>

              {historyRecords.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Este producto aun no tiene compras registradas en ventas.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyRecords.map((record) => (
                    <div key={`${record.saleId}-${record.date}`} className="rounded-lg border p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium">{record.customerName}</p>
                        <Badge variant="secondary">{record.paymentLabel}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Fecha de compra: {formatPurchaseDate(record.date)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Factura: {record.invoiceName} | Cantidad: {record.quantity}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Ver ID de factura"
                          onClick={() =>
                            setVisibleInvoiceIds((prev) =>
                              prev.includes(record.saleId)
                                ? prev.filter((id) => id !== record.saleId)
                                : [...prev, record.saleId],
                            )
                          }
                        >
                          <Eye className="h-4 w-4 text-blue-600" />
                        </Button>
                        {visibleInvoiceIds.includes(record.saleId) && (
                          <p className="text-xs text-muted-foreground">ID de factura: {record.invoiceId}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[720px] max-h-[calc(100vh-2rem)] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar producto de almacen" : "Agregar producto a almacen"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2 min-w-0">
                <Label>Numero de caja</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Ej: 1"
                  value={formData.boxNumber}
                  onChange={(event) => handleInputChange("boxNumber", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Varias pantallas o componentes pueden compartir la misma caja.
                </p>
              </div>

              <div className="space-y-2 min-w-0">
                <Label>Componente</Label>
                <Select value={formData.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder="Selecciona un componente" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[40vh] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                    {formCategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="max-w-[280px] truncate sm:max-w-none">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.category === "otros" && (
                  <Input
                    placeholder="Escribe el nuevo componente"
                    value={formData.customCategory}
                    onChange={(event) => handleInputChange("customCategory", event.target.value)}
                  />
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <Label>Codigo / ID</Label>
                <Input
                  value={generatedSku}
                  readOnly
                  placeholder="Se genera al elegir el componente"
                />
                <p className="text-xs text-muted-foreground">
                  {categoryRangeLabel
                    ? `Rango disponible: ${categoryRangeLabel}`
                    : "Se genera automaticamente segun el componente."}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre del producto</Label>
                <Input
                  placeholder="Ej: Pantalla Samsung A14"
                  value={formData.name}
                  onChange={(event) => handleInputChange("name", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>IMEI (Opcional)</Label>
                <Input
                  placeholder="Ej: 351756051523999"
                  value={formData.imei}
                  onChange={(event) => handleInputChange("imei", event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label>Precio costo (opcional)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Dejar en blanco"
                  value={formData.buyPrice}
                  onChange={(event) => handleInputChange("buyPrice", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Precio venta</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.sellPrice}
                  onChange={(event) => handleInputChange("sellPrice", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Stock</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.stock}
                  onChange={(event) => handleInputChange("stock", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Minimo</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="1"
                  value={formData.minStock}
                  onChange={(event) => handleInputChange("minStock", event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select
                value={formData.supplier || "none"}
                onValueChange={(value) => handleInputChange("supplier", value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin proveedor</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProduct}>
              {editingId ? "Guardar cambios" : "Agregar producto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelProduct} onOpenChange={(open) => !open && setLabelProduct(null)}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[520px] max-h-[calc(100vh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Imprimir pegatina</DialogTitle>
          </DialogHeader>

          {labelProduct && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="font-semibold">{labelProduct.name}</p>
                <p className="hidden">
                  ID {formatAlmacenSku(labelProduct.sku)} · {getAlmacenCategoryLabel(labelProduct.category)}
                </p>
                <p className="hidden">
                  Caja {normalizeAlmacenBoxNumber(labelProduct.boxNumber) || "-"} · {getAlmacenCategoryLabel(labelProduct.category)}
                </p>
                <p className="text-sm text-muted-foreground">
                  ID {formatAlmacenSku(labelProduct.sku) || "-"} | Caja {normalizeAlmacenBoxNumber(labelProduct.boxNumber) || "-"} | {getAlmacenCategoryLabel(labelProduct.category)}
                </p>
                {labelProduct.imei && (
                  <p className="text-sm text-muted-foreground">IMEI: {labelProduct.imei}</p>
                )}
              </div>

              <div className="rounded-lg border-2 border-dashed p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
                <div className="mx-auto mt-3 max-w-[240px] rounded-xl border bg-white px-3 py-3 text-black shadow-sm">
                  <p className="text-[1.8rem] font-black uppercase leading-none">
                    {STORAGE_LABEL_COMPANY_SHORT}
                  </p>
                  <p className="mt-1 break-words text-[0.82rem] font-extrabold uppercase leading-tight">
                    {labelProduct.name}
                  </p>
                  <p className="mt-1 text-[0.65rem] font-semibold uppercase text-zinc-700">
                    {getAlmacenCategoryLabel(labelProduct.category)}
                  </p>
                  <p className="text-[0.62rem] font-semibold uppercase text-zinc-700">
                    Caja {normalizeAlmacenBoxNumber(labelProduct.boxNumber) || "-"}
                  </p>
                  {labelProduct.imei && (
                    <p className="text-[0.58rem] font-bold uppercase text-zinc-800">
                      IMEI: {labelProduct.imei}
                    </p>
                  )}
                  <div className="mt-2 h-7 w-full rounded-sm border border-zinc-200 bg-white px-1 py-[2px]">
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundImage: "repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 3px)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[0.8rem] font-black uppercase tracking-[0.08em]">
                    ID: {formatAlmacenSku(labelProduct.sku) || "-"}
                  </p>
                </div>
                <p className="mt-3 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Formato calibrado 38 x 27 mm (2C-LP281B)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelProduct(null)}>
              Cancelar
            </Button>
            <Button onClick={handlePrintLabel}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir etiqueta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion eliminara el producto del almacen de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-500 hover:bg-red-600">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!stockProduct} onOpenChange={(open) => !open && setStockProduct(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Aumentar stock</DialogTitle>
          </DialogHeader>

          {stockProduct && (
            <div className="space-y-4 py-4">
              <div>
                <p className="font-medium">{stockProduct.name}</p>
                <p className="text-sm text-muted-foreground">
                  Caja {normalizeAlmacenBoxNumber(stockProduct.boxNumber) || "-"} | {getAlmacenCategoryLabel(stockProduct.category)}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <span className="text-sm text-muted-foreground">Stock actual</span>
                <span className="text-lg font-bold">{stockProduct.stock}</span>
              </div>

              <div className="space-y-2">
                <Label>Cantidad a sumar</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setStockQty((prev) => String(Math.max(0, (Number.parseInt(prev, 10) || 0) - 1)))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min="0"
                    value={stockQty}
                    onChange={(event) => setStockQty(event.target.value)}
                    placeholder="0"
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setStockQty((prev) => String((Number.parseInt(prev, 10) || 0) + 1))}
                  >
                    <PackagePlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {stockQty && Number.parseInt(stockQty, 10) > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Nuevo stock</span>
                  <span className="text-lg font-bold text-green-600">
                    {stockProduct.stock + Number.parseInt(stockQty, 10)}
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStockProduct(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAddStock}>Actualizar stock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
