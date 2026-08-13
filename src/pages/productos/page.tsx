"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Search,
  Filter,
  Edit,
  Trash2,
  Printer,
  Package,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Plus,
  Minus,
  X,
  PackagePlus,
  FileDown,
  Loader2,
  ReceiptText,
  Share2,
  Copy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { printStorageLabel, STORAGE_LABEL_COMPANY_SHORT } from "@/components/invoice-printer"
import { SaleDetailsDialog } from "@/components/sale-details-dialog"
import { useStore, type Sale } from "@/components/store-context"
import { formatCurrency } from "@/lib/utils"
import { useDraggableScroll } from "@/hooks/use-draggable-scroll"
import { normalizeAlmacenBoxNumber } from "@/lib/almacen"
import { normalizeInventorySourceTable, sameSaleItemSource } from "@/lib/transaction-classification"
import { uploadProductImageToStorage } from "@/lib/product-image-storage"
import { getTenantBranding } from "@/lib/tenant-branding"
import { createClient } from "@/lib/supabase/client"

// Reusing the Product interface and Store logic since it's the same data source
// In a real app, this might be a distinct view or filter of the inventory
export interface Product {
  id: string
  sku: string
  name: string
  category: string
  imageUrl?: string
  stock: number
  minStock: number
  buyPrice: number
  wholesalePrice: number
  sellPrice: number
  minimumSellPrice: number
  supplier: string
  capacity?: string
  imei?: string
}

type ProductInvoiceLink = {
  id: string
  invoiceNumber: string
  date: string
  quantity: number
  total: number
  customerName?: string
  paymentMethod?: string
  sale?: Sale
}

export default function ProductsPage() {
  const { products, suppliers, addProduct, updateProduct, deleteProduct, setOnDialogOpen, employees, currentUser, sales } = useStore()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false)
  const [isPublicCatalogDialogOpen, setIsPublicCatalogDialogOpen] = useState(false)
  const [publicCatalogLink, setPublicCatalogLink] = useState("")
  const [isCreatingPublicCatalog, setIsCreatingPublicCatalog] = useState(false)
  const [isInventoryDialogOpen, setIsInventoryDialogOpen] = useState(false)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [pdfReportType, setPdfReportType] = useState<"low" | "stop" | "total">("low")
  const [pdfCategoryFilter, setPdfCategoryFilter] = useState<string[]>([])
  const [managedCategories, setManagedCategories] = useState<string[]>([])
  const [newCategory, setNewCategory] = useState("")
  const [catalogOptions, setCatalogOptions] = useState({
    images: true,
    name: true,
    stock: true,
  })
  const [catalogPriceMode, setCatalogPriceMode] = useState<"sell" | "wholesale" | "buy" | "minimum">("sell")

  // Filter state
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterSupplier, setFilterSupplier] = useState<string>("all")
  const [filterStockStatus, setFilterStockStatus] = useState<string>("all")

  // Quick inventory dialog state
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [stockQty, setStockQty] = useState("")
  const [labelProduct, setLabelProduct] = useState<Product | null>(null)
  const [labelCopies, setLabelCopies] = useState("1")
  const [hideLabelName, setHideLabelName] = useState(false)
  const [tenantBusinessName, setTenantBusinessName] = useState(STORAGE_LABEL_COMPANY_SHORT)
  const [selectedProductForInvoices, setSelectedProductForInvoices] = useState<Product | null>(null)
  const [productInvoiceHistory, setProductInvoiceHistory] = useState<ProductInvoiceLink[]>([])
  const [isInvoiceHistoryDialogOpen, setIsInvoiceHistoryDialogOpen] = useState(false)
  const [selectedInvoiceForDetails, setSelectedInvoiceForDetails] = useState<Sale | null>(null)
  const [isInvoiceDetailDialogOpen, setIsInvoiceDetailDialogOpen] = useState(false)
  const employeePermissions = employees.find((employee) => employee.email === currentUser?.email)?.permissions
  const canAddProducts = currentUser?.role === "admin" || Boolean(employeePermissions?.canAdd)
  const canEditProducts = currentUser?.role === "admin" || Boolean(employeePermissions?.canEdit)
  const canDeleteProducts = currentUser?.role === "admin" || Boolean(employeePermissions?.canDelete)

  const catalogProducts = products.filter((product) => {
    const explicitSource = normalizeInventorySourceTable((product as { sourceTable?: unknown }).sourceTable)
    if (explicitSource) return explicitSource === "products"
    return !normalizeAlmacenBoxNumber((product as { boxNumber?: string }).boxNumber)
  })

  const totalInventory = catalogProducts.reduce((acc, product) => acc + product.stock, 0)
  const lowStockCount = catalogProducts.filter((product) => product.stock <= (product.minStock || 0)).length
  const totalCost = catalogProducts.reduce((acc, product) => acc + product.buyPrice * product.stock, 0)
  const totalValue = catalogProducts.reduce((acc, product) => acc + product.sellPrice * product.stock, 0)

  const createPublicCatalogLink = async () => {
    const ownerAdminId = String(currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || "").trim()
    if (!ownerAdminId) return
    setIsCreatingPublicCatalog(true)
    try {
      const token = crypto.randomUUID().replaceAll("-", "")
      const { error } = await createClient().from("catalog_shares").insert({
        token,
        owner_admin_id: ownerAdminId,
        product_ids: catalogProducts.filter((product) => product.stock > 0).map((product) => product.id),
        business_name: tenantBusinessName,
      })
      if (error) throw error
      const link = `${window.location.origin}/catalogo-publico/?token=${token}`
      setPublicCatalogLink(link)
      setIsPublicCatalogDialogOpen(true)
    } catch (error) {
      console.error("Error creating public catalog link:", error)
      toast({ title: "No se pudo crear el enlace", description: `${(error as { message?: string })?.message || "Verifica que la migración del catálogo público esté aplicada."}`, variant: "destructive" })
    } finally { setIsCreatingPublicCatalog(false) }
  }

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    category: "",
    imei: "",
    buyPrice: "",
    wholesalePrice: "",
    sellPrice: "",
    minimumSellPrice: "",
    stock: "",
    minStock: "",
    supplier: "",
    capacity: "",
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    // ... existing resetForm logic
    setFormData({
      sku: "",
      name: "",
      category: "",
      imei: "",
      buyPrice: "",
      wholesalePrice: "",
      sellPrice: "",
      minimumSellPrice: "",
      stock: "",
      minStock: "",
      supplier: "",
      capacity: "",
    })
    setEditingId(null)
    setImageFile(null)
    setImagePreview(null)
  }, [])

  // ... existing openDialog and useEffect

  // ... existing filteredProducts (sorted)

  // ... existing handleInputChange and handleSaveProduct logic

  // ... existing handleEditProduct

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

  const handleConfirmDelete = () => {
    if (deleteId) {
      deleteProduct(deleteId)
      setDeleteId(null)
      toast({
        title: "Producto eliminado",
        description: "El producto se ha eliminado del catálogo",
      })
    }
  }

  const openDialog = useCallback(() => {
    if (!canAddProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para agregar productos.",
        variant: "destructive",
      })
      return
    }

    setEditingId(null)
    resetForm()
    setIsDialogOpen(true)
  }, [canAddProducts, resetForm, toast])

  // Set the global dialog trigger to this page's add function when this page is active
  useEffect(() => {
    setOnDialogOpen(openDialog)
    return () => setOnDialogOpen(() => { })
  }, [setOnDialogOpen, openDialog])

  useEffect(() => {
    let cancelled = false

    const loadTenantBusinessName = async () => {
      const ownerAdminId = currentUser?.ownerAdminId || currentUser?.adminId
      if (!ownerAdminId) {
        if (!cancelled) setTenantBusinessName(STORAGE_LABEL_COMPANY_SHORT)
        return
      }

      const branding = await getTenantBranding(ownerAdminId)
      if (!cancelled) {
        setTenantBusinessName(branding.businessName?.trim() || STORAGE_LABEL_COMPANY_SHORT)
      }
    }

    void loadTenantBusinessName()

    return () => {
      cancelled = true
    }
  }, [currentUser?.adminId, currentUser?.ownerAdminId])

  const activeFilterCount = [filterCategory, filterSupplier, filterStockStatus].filter(f => f !== "all").length

  const clearFilters = () => {
    setFilterCategory("all")
    setFilterSupplier("all")
    setFilterStockStatus("all")
  }

  const handleAddCategory = () => {
    const category = newCategory.trim()
    if (!category) return
    if (categories.some((value) => value.toLowerCase() === category.toLowerCase())) {
      toast({ title: "Categoría existente", description: "Esa categoría ya está registrada." })
      return
    }
    persistManagedCategories([...managedCategories, category])
    setNewCategory("")
  }

  const handleDeleteCategory = (category: string) => {
    if (catalogProducts.some((product) => product.category === category)) {
      toast({
        title: "Categoría en uso",
        description: "No puedes eliminar una categoría que tiene productos asignados.",
        variant: "destructive",
      })
      return
    }
    persistManagedCategories(managedCategories.filter((value) => value !== category))
    setPdfCategoryFilter((selected) => selected.filter((value) => value !== category))
  }

  // Quick inventory handlers
  const handleOpenStockDialog = (product: Product) => {
    if (!canEditProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para actualizar inventario.",
        variant: "destructive",
      })
      return
    }

    setStockProduct(product)
    setStockQty("")
  }

  const handleAddStock = () => {
    if (!canEditProducts) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para actualizar inventario.",
        variant: "destructive",
      })
      return
    }

    if (!stockProduct) return
    const qty = parseInt(stockQty)
    if (isNaN(qty) || qty <= 0) {
      toast({
        title: "Error",
        description: "Ingresa una cantidad positiva válida",
        variant: "destructive",
      })
      return
    }
    const newStock = stockProduct.stock + qty
    if (newStock < 0) {
      toast({
        title: "Error",
        description: "El inventario no puede ser negativo",
        variant: "destructive",
      })
      return
    }
    updateProduct(stockProduct.id, { stock: newStock })
    toast({
      title: "Inventario actualizado",
      description: `${stockProduct.name}: ${stockProduct.stock} → ${newStock}`,
    })

    const updatedProduct = { ...stockProduct, stock: newStock }
    setStockProduct(null)
    setStockQty("")
    setLabelProduct(updatedProduct)
    setLabelCopies("1")
    setHideLabelName(false)
  }

  const handleOpenLabelDialog = (product: Product) => {
    setLabelProduct(product)
    setLabelCopies("1")
    setHideLabelName(false)
  }

  const closeLabelDialog = () => {
    setLabelProduct(null)
    setLabelCopies("1")
    setHideLabelName(false)
  }

  const handlePrintLabel = async () => {
    if (!labelProduct || !labelProduct.sku) {
      toast({
        title: "Error",
        description: "El producto debe tener un ID para imprimir la pegatina.",
        variant: "destructive",
      })
      return
    }

    const copies = Number.parseInt(labelCopies, 10)

    if (!Number.isInteger(copies) || copies <= 0) {
      toast({
        title: "Error",
        description: "La cantidad de etiquetas debe ser mayor que cero.",
        variant: "destructive",
      })
      return
    }

    const printResult = await printStorageLabel(
      {
        productName: labelProduct.name,
        caja: labelProduct.sku,
        component: labelProduct.category,
        details: labelProduct.capacity,
        imei: labelProduct.imei,
        copies,
        boxLabel: "ID",
        hideProductName: hideLabelName,
        printerProfile: "2c-lp281b",
        companyName: tenantBusinessName,
      },
      {
        silent: false,
      },
      currentUser?.ownerAdminId || currentUser?.adminId,
    )

    if (!printResult.success) {
      toast({
        title: "Error",
        description: printResult.error || "No se pudo imprimir la pegatina.",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Impresion iniciada",
      description: `${copies} etiqueta(s) lista(s) para ${labelProduct.name} con ID ${labelProduct.sku}.`,
    })

    closeLabelDialog()
  }

  useEffect(() => {
    const storageKey = `product-categories-${currentUser?.adminId ?? currentUser?.ownerAdminId ?? "default"}`
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]")
      setManagedCategories(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [])
    } catch {
      setManagedCategories([])
    }
  }, [currentUser?.adminId, currentUser?.ownerAdminId])

  const persistManagedCategories = (nextCategories: string[]) => {
    const storageKey = `product-categories-${currentUser?.adminId ?? currentUser?.ownerAdminId ?? "default"}`
    setManagedCategories(nextCategories)
    localStorage.setItem(storageKey, JSON.stringify(nextCategories))
  }

  // Unique categories from products plus categories created but not yet used.
  const categories = useMemo(() => {
    const uniqueCategories = [...new Set([...catalogProducts.map((p) => p.category), ...managedCategories].filter(Boolean))]
    if (formData.category && !uniqueCategories.includes(formData.category)) {
      uniqueCategories.unshift(formData.category)
    }
    return uniqueCategories
  }, [catalogProducts, formData.category, managedCategories])

  const filteredProducts = catalogProducts
    .filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    .filter((product) => filterCategory === "all" || product.category === filterCategory)
    .filter((product) => filterSupplier === "all" || product.supplier === filterSupplier)
    .filter((product) => {
      if (filterStockStatus === "all") return true
      if (filterStockStatus === "low") return product.stock <= (product.minStock || 0) && product.stock > 0
      if (filterStockStatus === "out") return product.stock === 0
      if (filterStockStatus === "ok") return product.stock > (product.minStock || 0)
      return true
    })
    .sort((a, b) => b.sku.localeCompare(a.sku, undefined, { numeric: true }))

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }
  const handleSaveProduct = async () => {
    if (editingId && !canEditProducts) {
      toast({ title: "Sin permiso", description: "Tu usuario no tiene permiso para editar productos.", variant: "destructive" })
      return
    }

    if (!editingId && !canAddProducts) {
      toast({ title: "Sin permiso", description: "Tu usuario no tiene permiso para agregar productos.", variant: "destructive" })
      return
    }

    if (!formData.name || !formData.category || !formData.buyPrice || !formData.sellPrice || !formData.stock) {
      toast({ title: "Error", description: "Por favor completa todos los campos obligatorios", variant: "destructive" })
      return
    }

    let uploadedImageUrl: string | undefined = undefined

    if (imageFile) {
      const uploadId = editingId ? (catalogProducts.find((p) => p.id === editingId)?.sourceId ?? String(Date.now())) : String(Date.now())
      const res = await uploadProductImageToStorage(uploadId, imageFile)
      if (!res.success) {
        toast({ title: "Error", description: res.error || "No se pudo subir la imagen", variant: "destructive" })
        return
      }
      uploadedImageUrl = res.publicUrl
    }

    if (editingId) {
      const updatedProduct: Product = {
        id: editingId,
        sku: formData.sku || catalogProducts.find((p) => p.id === editingId)?.sku || Date.now().toString(),
        name: formData.name,
        category: formData.category,
        buyPrice: Number.parseFloat(formData.buyPrice),
        wholesalePrice: Number.parseFloat(formData.wholesalePrice) || 0,
        sellPrice: Number.parseFloat(formData.sellPrice),
        minimumSellPrice: Number.parseFloat(formData.minimumSellPrice) || 0,
        stock: Number.parseInt(formData.stock),
        minStock: Number.parseInt(formData.minStock) || 0,
        supplier: formData.supplier,
        capacity: formData.capacity || undefined,
        imei: formData.imei || undefined,
        imageUrl: uploadedImageUrl || catalogProducts.find((p) => p.id === editingId)?.imageUrl,
      }
      updateProduct(editingId, updatedProduct)
      toast({ title: "Producto actualizado", description: "El producto se ha actualizado correctamente" })
    } else {
      const newProduct: Product = {
        id: Date.now().toString(),
        sku: formData.sku || Date.now().toString(),
        name: formData.name,
        category: formData.category,
        buyPrice: Number.parseFloat(formData.buyPrice),
        wholesalePrice: Number.parseFloat(formData.wholesalePrice) || 0,
        sellPrice: Number.parseFloat(formData.sellPrice),
        minimumSellPrice: Number.parseFloat(formData.minimumSellPrice) || 0,
        stock: Number.parseInt(formData.stock),
        minStock: Number.parseInt(formData.minStock) || 0,
        supplier: formData.supplier,
        capacity: formData.capacity || undefined,
        imei: formData.imei || undefined,
        imageUrl: uploadedImageUrl,
      }
      const { id, ...productWithoutId } = newProduct
      await addProduct(productWithoutId)
      toast({ title: "Producto agregado", description: "El producto se ha agregado al catálogo" })
    }

    resetForm()
    setIsDialogOpen(false)
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

    setEditingId(product.id)
    setFormData({
      sku: product.sku,
      name: product.name,
      category: product.category,
      buyPrice: product.buyPrice.toString(),
      wholesalePrice: product.wholesalePrice?.toString() || "0",
      sellPrice: product.sellPrice.toString(),
      minimumSellPrice: product.minimumSellPrice?.toString() || "0",
      stock: product.stock.toString(),
      minStock: product.minStock?.toString() || "0",
      supplier: product.supplier,
      capacity: product.capacity || "",
      imei: (product as any).imei || "",
    })
    setImagePreview((product as any).imageUrl || null)
    setImageFile(null)
    setIsDialogOpen(true)
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetForm()
    }
    setIsDialogOpen(open)
  }

  const openInvoiceHistoryDialog = useCallback((product: Product) => {
    const productMeta = product as Product & { sourceId?: string; sourceTable?: string }
    const inventoryCandidates = [product.id, productMeta.sourceId, `products::${product.id}`]
    if (productMeta.sourceId) {
      inventoryCandidates.push(`products::${productMeta.sourceId}`)
    }

    const history = sales.reduce<ProductInvoiceLink[]>((acc, sale) => {
      const matchingItems = (sale.items || []).filter((item) => {
        const itemRecord = item as unknown as Record<string, unknown>
        const itemProductId = String(itemRecord.productId ?? itemRecord.id ?? "")
        const itemName = String(itemRecord.productName ?? itemRecord.name ?? "").trim().toLowerCase()

        const directMatch = inventoryCandidates.some((candidate) => {
          const normalizedCandidate = String(candidate || "").trim()
          if (!normalizedCandidate) return false
          return itemProductId === normalizedCandidate || itemProductId === `products::${normalizedCandidate}`
        })

        if (directMatch) return true

        const sameName = product.name.trim().toLowerCase().length > 0 && itemName.length > 0 && itemName === product.name.trim().toLowerCase()
        if (!sameName) return false

        return sameSaleItemSource(itemRecord, { id: product.id, productId: product.id, sourceId: productMeta.sourceId }, "products")
      })

      if (matchingItems.length === 0) return acc

      const totalQuantity = matchingItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
      acc.push({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber || sale.id,
        date: sale.date || sale.createdAt || "",
        quantity: totalQuantity,
        total: Number(sale.total) || 0,
        customerName: sale.customerName || sale.almacenCustomerName,
        paymentMethod: sale.paymentMethod,
        sale,
      })
      return acc
    }, [])

    const sortedHistory = history.sort((a, b) => {
      const dateA = new Date(a.date).getTime()
      const dateB = new Date(b.date).getTime()
      if (Number.isNaN(dateA) || Number.isNaN(dateB)) return Number.isNaN(dateA) ? 1 : -1
      return dateB - dateA
    })

    setSelectedProductForInvoices(product)
    setProductInvoiceHistory(sortedHistory)
    setIsInvoiceHistoryDialogOpen(true)
  }, [sales])

  const handleCatalogOptionChange = (field: keyof typeof catalogOptions, checked: boolean) => {
    setCatalogOptions((prev) => ({ ...prev, [field]: checked }))
  }

  const handleDownloadCatalogPDF = async () => {
    if (isGeneratingPdf) return

    setIsGeneratingPdf(true)
    try {
      const { default: jsPDF } = await import("jspdf")
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const generatedAt = new Date()
      const productsToExport = [...catalogProducts].sort((a, b) => a.name.localeCompare(b.name))
      const blobToDataUrl = (blob: Blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(String(reader.result || ""))
          reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen"))
          reader.readAsDataURL(blob)
        })

      const pageWidth = 210
      const margin = 10
      const gap = 6
      const cardWidth = (pageWidth - margin * 2 - gap) / 2
      const cardHeight = 52
      const startY = 22
      const leftX = margin
      const rightX = margin + cardWidth + gap
      const bottomLimit = 280

      const drawHeader = () => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(15)
        doc.text("CATALOGO DE PRODUCTOS", 105, 10, { align: "center" })
        doc.setFont("helvetica", "normal")
        doc.setFontSize(9)
        doc.text(
          `Generado: ${generatedAt.toLocaleDateString("es-DO")} ${generatedAt.toLocaleTimeString("es-DO")}`,
          105,
          15,
          { align: "center" },
        )
      }

      const formatPdfPrice = (product: Product) => {
        let price = 0
        if (catalogPriceMode === "sell") price = product.sellPrice
        else if (catalogPriceMode === "wholesale") price = product.wholesalePrice || product.sellPrice
        else if (catalogPriceMode === "buy") price = product.buyPrice
        else if (catalogPriceMode === "minimum") price = product.minimumSellPrice || product.sellPrice
        const p = price % 1 === 0
          ? price.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
          : formatCurrency(price)
        return `$${p}`
      }

      const drawCard = async (product: Product, x: number, y: number) => {
        // Card background
        doc.setDrawColor(200)
        doc.setFillColor(255, 255, 255)
        doc.roundedRect(x, y, cardWidth, cardHeight, 3, 3, "S")

        // Image area (left side)
        const imgSize = cardHeight - 8
        const imgX = x + 4
        const imgY = y + 4
        let hasImage = false

        if (catalogOptions.images && product.imageUrl) {
          try {
            const imageBlob = await fetch(product.imageUrl).then((res) => res.blob())
            const imageDataUrl = await blobToDataUrl(imageBlob)
            const mimeType = imageBlob.type || (product.imageUrl.toLowerCase().includes(".png") ? "image/png" : "image/jpeg")
            doc.addImage(imageDataUrl, mimeType, imgX, imgY, imgSize, imgSize)
            hasImage = true
          } catch (error) {
            console.warn("No se pudo cargar la imagen del catálogo", error)
          }
        }

        const textX = hasImage ? (imgX + imgSize + 4) : (x + 4)
        const textRight = x + cardWidth - 4
        const textWidth = textRight - textX

        // Name (top-right, large bold)
        let nameEndY = y + 10
        if (catalogOptions.name) {
          doc.setFont("helvetica", "bold")
          doc.setFontSize(12)
          doc.setTextColor(30, 30, 30)
          const nameLines = doc.splitTextToSize(product.name || "Producto", textWidth)
          doc.text(nameLines, textX, y + 10)
          // each line ~5mm at size 12
          nameEndY = y + 10 + (nameLines.length * 5)
        }

        // Price (prominent, below name)
        const priceStr = formatPdfPrice(product)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(16)
        doc.setTextColor(15, 120, 60)
        doc.text(priceStr, textRight, nameEndY + 4, { align: "right" })
        doc.setTextColor(0, 0, 0)

        // Stock / quantity (bottom-right)
        if (catalogOptions.stock) {
          doc.setFont("helvetica", "normal")
          doc.setFontSize(11)
          doc.setTextColor(100, 100, 100)
          doc.text(`Cant: ${product.stock}`, textRight, y + cardHeight - 6, { align: "right" })
          doc.setTextColor(0, 0, 0)
        }
      }

      drawHeader()

      let index = 0
      let currentY = startY
      while (index < productsToExport.length) {
        for (let column = 0; column < 2 && index < productsToExport.length; column += 1) {
          const x = column === 0 ? leftX : rightX
          await drawCard(productsToExport[index], x, currentY)
          index += 1
        }

        currentY += cardHeight + gap
        if (currentY + cardHeight > bottomLimit && index < productsToExport.length) {
          doc.addPage()
          drawHeader()
          currentY = startY
        }
      }

      const fileDate = generatedAt.toISOString().slice(0, 10)
      doc.save(`Catalogo-Productos-${fileDate}.pdf`)

      toast({
        title: "Catalogo descargado",
        description: "Se descargo el PDF del catalogo de productos.",
      })
    } catch (error) {
      console.error("Error generating catalog PDF:", error)
      toast({
        title: "Error",
        description: "No se pudo generar el catalogo PDF.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingPdf(false)
      setIsCatalogDialogOpen(false)
    }
  }

  const handleDownloadInventoryPDF = async () => {
    if (isGeneratingPdf) return

    setIsGeneratingPdf(true)
    try {
      const { default: jsPDF } = await import("jspdf")
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const generatedAt = new Date()

      const lowStockProducts = [...catalogProducts]
        .filter((product) => product.stock <= (product.minStock || 0))
        .sort((a, b) => a.stock - b.stock)

      const totalInventoryProducts = [...catalogProducts]
        .sort((a, b) => a.name.localeCompare(b.name))

      const formatCategory = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
      const applyPdfCategoryFilter = (list: Product[]) =>
        pdfCategoryFilter.length === 0 ? list : list.filter((product) => pdfCategoryFilter.includes(product.category))

      const stopProducts = [...catalogProducts]
        .filter((product) => product.stock <= 0)
        .sort((a, b) => a.name.localeCompare(b.name))

      const selectedProducts = applyPdfCategoryFilter(
        pdfReportType === "low" ? lowStockProducts : pdfReportType === "stop" ? stopProducts : totalInventoryProducts
      )
      const categoryLabel = pdfCategoryFilter.length === 0 ? "" : ` - ${pdfCategoryFilter.map(formatCategory).join(", ")}`
      const selectedTitle =
        pdfReportType === "low"
          ? `Productos con stock bajo (${selectedProducts.length})${categoryLabel}`
          : pdfReportType === "stop"
            ? `Productos en stop/sin stock (${selectedProducts.length})${categoryLabel}`
            : `Inventario total (${selectedProducts.length})${categoryLabel}`

      let y = 22
      const left = 10
      const pageBottom = 287
      const skuX = 10
      const productX = 32
      const stockX = 120
      const minX = 134
      const buyX = 160
      const sellX = 198

      const drawPageHeader = () => {
        doc.setFont("helvetica", "bold")
        doc.setFontSize(13)
        doc.text("REPORTE DE INVENTARIO DE PRODUCTOS", 105, 10, { align: "center" })
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
        if (pdfReportType === "low") {
          doc.text("Producto", skuX, y)
          doc.text("Costo", stockX, y, { align: "right" })
          doc.text("Venta", buyX, y, { align: "right" })
          doc.text("Stock Min", sellX, y, { align: "right" })
        } else {
          doc.text("ID", skuX, y)
          doc.text("Producto", productX, y)
          doc.text("Stock", stockX, y, { align: "right" })
          doc.text("Min", minX, y, { align: "right" })
          doc.text("Costo", buyX, y, { align: "right" })
          doc.text("Venta", sellX, y, { align: "right" })
        }
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
          if (pdfReportType === "low") {
            doc.text((product.name || "-").slice(0, 44), skuX, y)
            doc.text(`$${formatCurrency(product.buyPrice)}`, stockX, y, { align: "right" })
            doc.text(`$${formatCurrency(product.sellPrice)}`, buyX, y, { align: "right" })
            doc.text(String(product.minStock || 0), sellX, y, { align: "right" })
          } else {
            doc.text((product.sku || "-").slice(0, 15), skuX, y)
            doc.text((product.name || "-").slice(0, 38), productX, y)
            doc.text(String(product.stock), stockX, y, { align: "right" })
            doc.text(String(product.minStock || 0), minX, y, { align: "right" })
            doc.text(`$${formatCurrency(product.buyPrice)}`, buyX, y, { align: "right" })
            doc.text(`$${formatCurrency(product.sellPrice)}`, sellX, y, { align: "right" })
          }
          y += 5
        })

        y += 3
      }

      drawPageHeader()
      drawSection(selectedTitle, selectedProducts)

      const fileDate = generatedAt.toISOString().slice(0, 10)
      const fileSuffix = pdfReportType === "low" ? "Stock-Bajo" : pdfReportType === "stop" ? "Stop-Sin-Stock" : "Inventario-Total"
      const categorySuffix = pdfCategoryFilter.length === 0 ? "" : `-${pdfCategoryFilter.join("-")}`
      doc.save(`Inventario-${fileSuffix}${categorySuffix}-${fileDate}.pdf`)

      toast({
        title: "PDF descargado",
        description:
          pdfReportType === "low"
            ? `Se descargo el PDF de productos con stock bajo${categoryLabel ? categoryLabel : ""}.`
            : pdfReportType === "stop"
              ? `Se descargo el PDF de productos en stop/sin stock${categoryLabel ? categoryLabel : ""}.`
              : `Se descargo el PDF de inventario total${categoryLabel ? categoryLabel : ""}.`,
      })
    } catch (error) {
      console.error("Error generating products inventory PDF:", error)
      toast({
        title: "Error",
        description: "No se pudo generar el PDF del inventario.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingPdf(false)
      setIsInventoryDialogOpen(false)
    }
  }

  // ... inside ProductsPage component
  const { ref: scrollRef } = useDraggableScroll<HTMLDivElement>({
    childSelector: '[data-slot="table-container"]',
  });

  return (
    <div className="space-y-4 p-3 sm:space-y-6 sm:p-4 md:p-0 md:space-y-6">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium leading-tight">Inventario Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">{totalInventory}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Productos en existencia</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium leading-tight">Inv. Minimo (Alertas)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">{lowStockCount}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Productos con stock bajo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium leading-tight">Valor Costo</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">${formatCurrency(totalCost)}</div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Costo total del inventario</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium leading-tight">Valor Venta</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">
              ${formatCurrency(totalValue)}
            </div>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Valor potencial de venta</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:max-w-sm lg:flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar productos..."
            className="w-full pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="relative w-full min-h-11 sm:w-auto">
              <Filter className="mr-2 h-4 w-4" /> Filtros
              {activeFilterCount > 0 && (
                <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-h-[calc(100vh-2rem)] w-[min(92vw,20rem)] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto" align="start" sideOffset={6}>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Filtros</h4>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearFilters}>
                    <X className="mr-1 h-3 w-3" /> Limpiar
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Categoría</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-8 w-full min-w-0 text-xs">
                    <SelectValue className="truncate" placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(50vh,20rem)] w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                    <SelectItem value="all">Todas</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Proveedor</Label>
                <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {suppliers.map((sup) => (
                      <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Estado de Inventario</Label>
                <Select value={filterStockStatus} onValueChange={setFilterStockStatus}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="ok">En Stock</SelectItem>
                    <SelectItem value="low">Stock Bajo</SelectItem>
                    <SelectItem value="out">Sin Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={() => setIsCatalogDialogOpen(true)} className="w-full min-h-11 sm:w-auto">
          <PackagePlus className="mr-2 h-4 w-4" />
          Catálogo
        </Button>
        <Button variant="outline" onClick={() => void createPublicCatalogLink()} disabled={isCreatingPublicCatalog} className="w-full min-h-11 sm:w-auto">
          {isCreatingPublicCatalog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
          Compartir catálogo
        </Button>
        <Button variant="outline" onClick={() => setIsCategoryDialogOpen(true)} className="w-full min-h-11 sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Categorías
        </Button>
        <Button onClick={() => setIsInventoryDialogOpen(true)} disabled={isGeneratingPdf} className="w-full min-h-11 sm:w-auto">
          {isGeneratingPdf ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generando PDF...
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Descargar PDF Inventario
            </>
          )}
        </Button>
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filterCategory !== "all" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {filterCategory.charAt(0).toUpperCase() + filterCategory.slice(1)}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setFilterCategory("all")} />
              </Badge>
            )}
            {filterSupplier !== "all" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {suppliers.find(s => s.id === filterSupplier)?.name || filterSupplier}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setFilterSupplier("all")} />
              </Badge>
            )}
            {filterStockStatus !== "all" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                {filterStockStatus === "ok" ? "En Stock" : filterStockStatus === "low" ? "Stock Bajo" : "Sin Stock"}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setFilterStockStatus("all")} />
              </Badge>
            )}
          </div>
        )}
      </div>

      <Dialog open={isInventoryDialogOpen} onOpenChange={setIsInventoryDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-x-hidden sm:w-[520px] sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Descargar PDF de inventario</DialogTitle>
          </DialogHeader>

          <div className="grid min-w-0 grid-cols-1 gap-4 py-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>Tipo de inventario</Label>
              <Select value={pdfReportType} onValueChange={(value) => setPdfReportType(value as "low" | "stop" | "total")}>
                <SelectTrigger className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Productos con stock bajo</SelectItem>
                  <SelectItem value="stop">Productos en stop/sin stock</SelectItem>
                  <SelectItem value="total">Inventario Total</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>Categoría</Label>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pdfCategoryFilter.length === 0}
                    onCheckedChange={(checked) => checked === true && setPdfCategoryFilter([])}
                  />
                  <span>Todas las categorías</span>
                </label>
                {categories.map((cat) => (
                  <label key={cat} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={pdfCategoryFilter.includes(cat)}
                      onCheckedChange={(checked) => {
                        setPdfCategoryFilter((selected) =>
                          checked === true ? [...selected, cat] : selected.filter((value) => value !== cat),
                        )
                      }}
                    />
                    <span className="truncate">{cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                  </label>
                ))}
              </div>
              {/* */}
              <Select value={pdfCategoryFilter.length ? pdfCategoryFilter[0] : "all"} onValueChange={() => undefined}>
                <SelectTrigger className="hidden">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInventoryDialogOpen(false)} disabled={isGeneratingPdf}>
              Cancelar
            </Button>
            <Button onClick={handleDownloadInventoryPDF} disabled={isGeneratingPdf}>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Gestionar categorías</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleAddCategory()}
                placeholder="Nueva categoría"
              />
              <Button onClick={handleAddCategory} className="shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay categorías registradas.</p>
              ) : (
                categories.map((category) => {
                  const inUse = catalogProducts.some((product) => product.category === category)
                  return (
                    <div key={category} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{category}</p>
                        <p className="text-xs text-muted-foreground">{inUse ? "En uso por productos" : "Sin productos asignados"}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive hover:text-destructive"
                        disabled={inUse}
                        onClick={() => handleDeleteCategory(category)}
                        title={inUse ? "No se puede eliminar una categoría en uso" : "Eliminar categoría"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCatalogDialogOpen} onOpenChange={setIsCatalogDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <p className="text-sm text-muted-foreground">
              Elige qué información quieres mostrar en el catálogo PDF de productos.
            </p>

            {/* Price mode selector */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Precio a mostrar</Label>
              <Select value={catalogPriceMode} onValueChange={(v) => setCatalogPriceMode(v as typeof catalogPriceMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sell">Precio de venta (predeterminado)</SelectItem>
                  <SelectItem value="wholesale">Precio por mayor</SelectItem>
                  <SelectItem value="buy">Precio de compra</SelectItem>
                  <SelectItem value="minimum">Precio mínimo de venta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Toggles */}
            <div className="grid gap-3">
              <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox
                  checked={catalogOptions.images}
                  onCheckedChange={(checked) => handleCatalogOptionChange("images", checked === true)}
                />
                <span className="text-sm">Incluir imágenes</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox
                  checked={catalogOptions.name}
                  onCheckedChange={(checked) => handleCatalogOptionChange("name", checked === true)}
                />
                <span className="text-sm">Mostrar nombre</span>
              </label>
              <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                <Checkbox
                  checked={catalogOptions.stock}
                  onCheckedChange={(checked) => handleCatalogOptionChange("stock", checked === true)}
                />
                <span className="text-sm">Mostrar cantidad en inventario</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCatalogDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDownloadCatalogPDF} disabled={isGeneratingPdf}>
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  Descargar Catálogo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPublicCatalogDialogOpen} onOpenChange={setIsPublicCatalogDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[520px]">
          <DialogHeader><DialogTitle>Catálogo público listo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Comparte este enlace con tu cliente. No necesita iniciar sesión. Sus selecciones llegarán a Cola Exclusiva.</p>
          <div className="flex gap-2"><Input readOnly value={publicCatalogLink} /><Button size="icon" onClick={() => { void navigator.clipboard.writeText(publicCatalogLink); toast({ title: "Enlace copiado" }) }}><Copy className="h-4 w-4" /></Button></div>
          <DialogFooter><Button onClick={() => window.open(publicCatalogLink, "_blank", "noopener,noreferrer")}>Abrir catálogo</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-3 md:hidden">
        {filteredProducts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No se encontraron productos
          </div>
        ) : (
          filteredProducts.map((product) => {
            const stockStatus = product.stock === 0 ? "Sin stock" : product.stock <= (product.minStock || 0) ? "Stock bajo" : "En stock"
            return (
              <div key={product.id} className="overflow-hidden rounded-lg border bg-background p-3 shadow-sm">
                <div className="flex items-start gap-3">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-16 w-16 rounded-md object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-muted/40" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold break-words">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">{product.category}</Badge>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Stock</span>
                        <span className="font-medium text-foreground">{product.stock}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Precio</span>
                        <span className="font-medium text-foreground">${formatCurrency(product.sellPrice)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span>Estado</span>
                        <span className="font-medium text-foreground">{stockStatus}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => openInvoiceHistoryDialog(product)}>
                    <ReceiptText className="mr-2 h-4 w-4" /> Facturas
                  </Button>
                  <Button variant="outline" size="sm" className="min-h-11 flex-1" onClick={() => handleOpenLabelDialog(product)}>
                    <Printer className="mr-2 h-4 w-4" /> Etiqueta
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
          <div className="hidden md:block overflow-x-auto" ref={scrollRef}>
            <Table>


              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Descripción del Producto</TableHead>
                  <TableHead>Capacidad</TableHead>
                  <TableHead>Precio Costo</TableHead>
                  <TableHead>Pr. por Mayor</TableHead>
                  <TableHead>Precio Venta</TableHead>
                  <TableHead>Precio Min. Venta</TableHead>
                  <TableHead>Inventario</TableHead>
                  <TableHead>Inv. Minimo</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No se encontraron productos
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.sku}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="h-8 w-8 object-cover rounded" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted/40" />
                          )}
                          <span>{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{product.capacity || "-"}</TableCell>
                      <TableCell>${formatCurrency(product.buyPrice)}</TableCell>
                      <TableCell>${formatCurrency(product.wholesalePrice || 0)}</TableCell>
                      <TableCell>${formatCurrency(product.sellPrice)}</TableCell>
                      <TableCell>${formatCurrency(product.minimumSellPrice || 0)}</TableCell>
                      <TableCell>{product.stock}</TableCell>
                      <TableCell>{product.minStock || 0}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{product.category}</Badge>
                      </TableCell>
                      <TableCell>
                        {product.supplier ? (
                          suppliers.find((s) => s.id === product.supplier)?.name || product.supplier
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Ver facturas asociadas" onClick={() => openInvoiceHistoryDialog(product)}>
                            <ReceiptText className="h-4 w-4 text-purple-600" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Imprimir etiqueta" onClick={() => handleOpenLabelDialog(product)}>
                            <Printer className="h-4 w-4 text-sky-600" />
                          </Button>
                          {canEditProducts && (
                            <>
                              <Button variant="ghost" size="icon" title="Ajustar inventario" onClick={() => handleOpenStockDialog(product)}>
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isInvoiceHistoryDialogOpen} onOpenChange={(open) => {
        setIsInvoiceHistoryDialogOpen(open)
        if (!open) {
          setSelectedProductForInvoices(null)
          setProductInvoiceHistory([])
        }
      }}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Facturas asociadas a {selectedProductForInvoices?.name || "este producto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {productInvoiceHistory.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay facturas registradas para este producto.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Factura</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Cantidad</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Cliente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productInvoiceHistory.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">{entry.invoiceNumber}</TableCell>
                        <TableCell>{entry.date ? new Date(entry.date).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" }) : "Sin fecha"}</TableCell>
                        <TableCell>{entry.quantity}</TableCell>
                        <TableCell>${formatCurrency(entry.total)}</TableCell>
                        <TableCell>{entry.customerName || "–"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedInvoiceForDetails(entry.sale ?? null)
                              setIsInvoiceDetailDialogOpen(true)
                            }}
                          >
                            Ver detalle
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInvoiceHistoryDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SaleDetailsDialog
        open={isInvoiceDetailDialogOpen}
        onOpenChange={(open) => {
          setIsInvoiceDetailDialogOpen(open)
          if (!open) {
            setSelectedInvoiceForDetails(null)
          }
        }}
        sale={selectedInvoiceForDetails}
      />

      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
              <div className="space-y-2">
                <Label>ID</Label>
                <Input
                  placeholder="Ingresar ID"
                  value={formData.sku}
                  onChange={(e) => handleInputChange("sku", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  placeholder="Ej: Producto"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Input
                  list="product-category-list"
                  placeholder="Ingresa una categoría o elige una existente"
                  value={formData.category}
                  onChange={(e) => handleInputChange("category", e.target.value)}
                />
                <datalist id="product-category-list">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Capacidad (Opcional)</Label>
                <Input
                  placeholder="Ej: 128, 256"
                  value={formData.capacity}
                  onChange={(e) => handleInputChange("capacity", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>IMEI (Opcional)</Label>
                <Input
                  placeholder="Ej: 123456789012345"
                  value={formData.imei}
                  onChange={(e) => handleInputChange("imei", e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
              <div className="space-y-2">
                <Label>Precio Compra</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.buyPrice}
                  onChange={(e) => handleInputChange("buyPrice", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Precio al Por Mayor</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.wholesalePrice}
                  onChange={(e) => handleInputChange("wholesalePrice", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Precio Venta</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.sellPrice}
                  onChange={(e) => handleInputChange("sellPrice", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Precio minimo de venta</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={formData.minimumSellPrice}
                  onChange={(e) => handleInputChange("minimumSellPrice", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Inventario</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.stock}
                  onChange={(e) => handleInputChange("stock", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Inv. Minimo</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.minStock}
                  onChange={(e) => handleInputChange("minStock", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Proveedor (Opcional)</Label>
              <Select value={formData.supplier} onValueChange={(value) => handleInputChange("supplier", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguno</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Imagen del producto (Opcional)</Label>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setImageFile(f)
                      setImagePreview(URL.createObjectURL(f))
                    } else {
                      setImageFile(null)
                      setImagePreview(null)
                    }
                  }}
                />
                {imagePreview && (
                  <img src={imagePreview} alt="preview" className="h-16 w-16 object-cover rounded-md" />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogClose(false)}>
              Cancelar
            </Button>
            <Button type="submit" onClick={handleSaveProduct}>
              {editingId ? "Actualizar" : "Guardar"} Producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelProduct} onOpenChange={(open) => !open && closeLabelDialog()}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Imprimir pegatina</DialogTitle>
          </DialogHeader>

          {labelProduct && (
            <div className="space-y-4 py-4">
              <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                <div className="space-y-2">
                  <Label>Cantidad de etiquetas</Label>
                  <Input
                    type="number"
                    min="1"
                    value={labelCopies}
                    onChange={(e) => setLabelCopies(e.target.value)}
                  />
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-3 rounded-lg border p-3 w-full">
                    <Checkbox
                      checked={hideLabelName}
                      onCheckedChange={(checked) => setHideLabelName(checked === true)}
                    />
                    <span className="text-sm">Ocultar nombre del producto</span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4">
                {!hideLabelName && <p className="font-semibold">{labelProduct.name}</p>}
                <p className="text-sm text-muted-foreground">
                  ID {labelProduct.sku} | {labelProduct.category}
                </p>
                {labelProduct.capacity && (
                  <p className="text-sm text-muted-foreground">
                    {labelProduct.capacity}
                  </p>
                )}
                {labelProduct.imei && (
                  <p className="text-sm text-muted-foreground">IMEI: {labelProduct.imei}</p>
                )}
              </div>

              <div className="rounded-lg border-2 border-dashed p-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
                  <div className="mx-auto mt-3 max-w-[240px] rounded-xl border bg-white px-3 py-3 text-black shadow-sm">
                    <p className="text-[1.8rem] font-black uppercase leading-none">
                    {tenantBusinessName}
                    </p>
                  {!hideLabelName && (
                    <p className="mt-1 break-words text-[0.82rem] font-extrabold uppercase leading-tight">
                      {labelProduct.name}
                    </p>
                  )}
                  <p className="mt-1 text-[0.65rem] font-semibold uppercase text-zinc-700">
                    {labelProduct.category}
                  </p>
                  {labelProduct.capacity && (
                    <p className="text-[0.62rem] font-semibold uppercase text-zinc-700">
                      {labelProduct.capacity}
                    </p>
                  )}
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
                    ID: {labelProduct.sku}
                  </p>
                </div>
                <p className="mt-3 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
                  Formato calibrado 38 x 27 mm (2C-LP281B)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeLabelDialog}>
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
        <AlertDialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[520px]">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el producto del inventario.
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

      {/* Quick Inventory Dialog */}
      <Dialog open={!!stockProduct} onOpenChange={(open) => !open && setStockProduct(null)}>
        <DialogContent className="w-[95vw] max-w-[calc(100vw-1rem)] sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ajustar Inventario</DialogTitle>
          </DialogHeader>
          {stockProduct && (
            <div className="space-y-4 py-4">
              <div>
                <p className="font-medium">{stockProduct.name}</p>
                <p className="text-sm text-muted-foreground">SKU: {stockProduct.sku}</p>
              </div>
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <span className="text-sm text-muted-foreground">Stock actual:</span>
                <span className="text-lg font-bold">{stockProduct.stock}</span>
              </div>
              <div className="space-y-2">
                <Label>Cantidad a agregar</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setStockQty((prev) => String(Math.max(0, (parseInt(prev) || 0) - 1)))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="0"
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setStockQty((prev) => String((parseInt(prev) || 0) + 1))}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Solo se permiten numeros positivos.</p>
              </div>
              {stockQty && !isNaN(parseInt(stockQty)) && parseInt(stockQty) !== 0 && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                  <span className="text-sm text-muted-foreground">Nuevo stock:</span>
                  <span className={`text-lg font-bold ${stockProduct.stock + parseInt(stockQty) < 0 ? "text-red-500" : "text-green-600"
                    }`}>
                    {stockProduct.stock + parseInt(stockQty)}
                  </span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockProduct(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAddStock}>
              Actualizar Inventario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
