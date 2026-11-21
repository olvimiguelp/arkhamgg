"use client"

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useStore, type Employee } from "@/components/store-context"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  UserCheck,
  UserX,
  Shield,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  Eye,
  EyeOff,
  MessageCircle,
  BarChart3,
  Share2,
  Copy,
  Loader2,
  ArrowLeft,
} from "lucide-react"
import { useSystemConfig } from "@/hooks/use-system-config"
import { CatalogPublication } from "@/components/catalog-publication"
import {
  invokeCatalogCustomerAccess,
  type CatalogCustomerAccount,
  type CatalogOrderCustomer,
  type CatalogOrderHistory,
} from "@/lib/catalog-customer-access"
import { getAlmacenCategoryFilterValue, getAlmacenCategoryLabel, isAlmacenCategory } from "@/lib/almacen"

const readAccessFlag = (value: any): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "on",
        "enabled",
        "enable",
        "active",
        "activo",
        "activa",
      ].includes(normalized)
    ) {
      return true
    }
    if (
      [
        "false",
        "0",
        "no",
        "off",
        "disabled",
        "inactive",
        "inactivo",
        "inactiva",
      ].includes(normalized)
    ) {
      return false
    }
  }
  if (value && typeof value === "object") {
    if ("enabled" in value) return readAccessFlag((value as any).enabled)
    if ("allowed" in value) return readAccessFlag((value as any).allowed)
    if ("active" in value) return readAccessFlag((value as any).active)
    if ("value" in value) return readAccessFlag((value as any).value)
  }
  return false
}

const normalizeWhatsappPhone = (value?: string | null) =>
  String(value ?? "").replace(/[^0-9]/g, "")

const isProbablyUrl = (value: string) =>
  /^(https?:\/\/|wa\.me\/|www\.)/i.test(value) ||
  value.includes("wa.me") ||
  value.includes("whatsapp.com")

const buildWhatsappUrl = (phone: string, message: string) =>
  `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

type CatalogCustomerDirectoryEntry = {
  key: string
  accountId: string | null
  name: string
  email: string
  phone: string
  phoneVariants: string[]
  isActive: boolean | null
  createdAt: string | null
  orderCount: number
  lastOrderAt: string | null
}

const normalizeCatalogCustomerPhone = (phone: string) => phone.replace(/\D/g, "")

const resolveSupportLink = (raw: any, message: string) => {
  if (!raw) return ""
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (!trimmed) return ""
    if (isProbablyUrl(trimmed)) return trimmed
    const phone = normalizeWhatsappPhone(trimmed)
    return phone ? buildWhatsappUrl(phone, message) : ""
  }
  if (typeof raw === "object") {
    const url = String(raw.url ?? raw.link ?? raw.href ?? "").trim()
    if (url) return url
    const phone = normalizeWhatsappPhone(raw.phone ?? raw.number ?? "")
    return phone ? buildWhatsappUrl(phone, message) : ""
  }
  return ""
}

const DEFAULT_EMPLOYEE_PERMISSIONS: Employee["permissions"] = {
  sales: true,
  inventory: true,
  customers: true,
  suppliers: true,
  reports: false,
  repairs: true,
  queueExclusive: true,
  returns: false,
  purchases: true,
  importCustomers: false,
  employees: false,
  cashClosing: false,
  invoiceHistory: false,
  products: true,
  almacen: false,
  clienteAlmacen: false,
  almacenClosing: false,
  almacenInvoiceHistory: false,
  wholesaleSales: false,
  wholesaleDiscounts: false,
  turnReport: false,
  canAdd: true,
  canEdit: true,
  canDelete: true,
}

const ADMIN_EMPLOYEE_PERMISSIONS: Employee["permissions"] = {
  sales: true,
  inventory: true,
  customers: true,
  suppliers: true,
  reports: true,
  repairs: true,
  queueExclusive: true,
  returns: true,
  purchases: true,
  importCustomers: true,
  employees: true,
  cashClosing: true,
  invoiceHistory: true,
  products: true,
  almacen: true,
  clienteAlmacen: true,
  almacenClosing: true,
  almacenInvoiceHistory: true,
  wholesaleSales: true,
  wholesaleDiscounts: true,
  turnReport: true,
  canAdd: true,
  canEdit: true,
  canDelete: true,
}

export default function EmpleadosPage() {
  const navigate = useNavigate()
  const { employees, products, addEmployee, updateEmployee, deleteEmployee, currentUser, canCurrentUserPerform } = useStore()
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all")
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "employee">("all")
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [isPublicCatalogDialogOpen, setIsPublicCatalogDialogOpen] = useState(false)
  const [isCatalogCustomerDialogOpen, setIsCatalogCustomerDialogOpen] = useState(false)
  const [catalogCustomerView, setCatalogCustomerView] = useState<"customers" | "history">("customers")
  const [selectedCatalogCustomerKey, setSelectedCatalogCustomerKey] = useState<string | null>(null)
  const [catalogCustomerName, setCatalogCustomerName] = useState("")
  const [catalogCustomerEmail, setCatalogCustomerEmail] = useState("")
  const [catalogCustomerPhone, setCatalogCustomerPhone] = useState("")
  const [catalogCustomerPassword, setCatalogCustomerPassword] = useState("")
  const [accessCustomer, setAccessCustomer] = useState<CatalogCustomerDirectoryEntry | null>(null)
  const [catalogDirectoryError, setCatalogDirectoryError] = useState("")
  const [catalogCustomers, setCatalogCustomers] = useState<CatalogCustomerAccount[]>([])
  const [catalogBuyers, setCatalogBuyers] = useState<CatalogOrderCustomer[]>([])
  const [catalogOrderHistory, setCatalogOrderHistory] = useState<CatalogOrderHistory[]>([])
  const [catalogHistoryHasMore, setCatalogHistoryHasMore] = useState(false)
  const [catalogHistoryNextOffset, setCatalogHistoryNextOffset] = useState(0)
  const [isLoadingCatalogCustomers, setIsLoadingCatalogCustomers] = useState(false)
  const [isCreatingCatalogCustomer, setIsCreatingCatalogCustomer] = useState(false)
  const [createdCatalogCredentials, setCreatedCatalogCredentials] = useState<{ email: string; phone: string; password: string } | null>(null)
  const almacenCatalogCategories = useMemo(() => {
    const options = new Map<string, string>()
    products.filter((product) => product.sourceTable === "armacen" ||
      (!product.sourceTable && (Boolean(product.boxNumber) || isAlmacenCategory(product.category))))
      .forEach((product) => {
        const category = getAlmacenCategoryFilterValue(product.category)
        if (category) options.set(category, getAlmacenCategoryLabel(product.category))
      })
    return Array.from(options, ([value, label]) => ({ value, label }))
  }, [products])
  const productCategoryOptions = Array.from(new Set(products.filter(p => p.sourceTable ? p.sourceTable === "products" :
              !p.boxNumber && !isAlmacenCategory(p.category)).map(p => p.category).filter(Boolean))).sort().map(value => ({value,label:value}))
  const catalogCustomerDirectory = useMemo(() => {
    const entries = new Map<string, CatalogCustomerDirectoryEntry>()
    const accountKeys = new Map<string, string>()
    const accountsByKey = new Map<string, CatalogCustomerAccount>()
    const phoneKeys = new Map<string, string>()

    catalogCustomers.forEach((customer) => {
      const key = `account:${customer.id}`
      accountKeys.set(customer.id, key)
      accountsByKey.set(key, customer)
      const phone = normalizeCatalogCustomerPhone(customer.phone)
      if (phone) phoneKeys.set(phone, key)
      entries.set(key, {
        key,
        accountId: customer.id,
        name: customer.name,
        email: customer.email ?? "",
        phone: customer.phone,
        phoneVariants: [customer.phone],
        isActive: customer.is_active,
        createdAt: customer.created_at,
        orderCount: 0,
        lastOrderAt: null,
      })
    })

    catalogBuyers.forEach((buyer) => {
      const phone = normalizeCatalogCustomerPhone(buyer.customer_phone)
      const key =
        (buyer.catalog_customer_id && accountKeys.get(buyer.catalog_customer_id)) ||
        (phone && phoneKeys.get(phone)) ||
        `guest:${phone || buyer.customer_name.trim().toLowerCase()}`
      const account = accountsByKey.get(key)
      const existing = entries.get(key)
      entries.set(key, {
        key,
        accountId: account?.id ?? buyer.catalog_customer_id,
        name: account?.name ?? existing?.name ?? buyer.customer_name,
        email: account?.email ?? existing?.email ?? "",
        phone: account?.phone ?? existing?.phone ?? buyer.customer_phone,
        phoneVariants: Array.from(new Set([
          account?.phone ?? "",
          existing?.phone ?? "",
          ...buyer.customer_phones,
        ].filter(Boolean))),
        isActive: account?.is_active ?? existing?.isActive ?? null,
        createdAt: account?.created_at ?? existing?.createdAt ?? null,
        orderCount: buyer.order_count,
        lastOrderAt: buyer.last_order_at,
      })
    })

    return Array.from(entries.values()).sort((left, right) => {
      const leftDate = left.lastOrderAt || left.createdAt || ""
      const rightDate = right.lastOrderAt || right.createdAt || ""
      return rightDate.localeCompare(leftDate) || left.name.localeCompare(right.name, "es")
    })
  }, [catalogCustomers, catalogBuyers])
  const selectedCatalogCustomer = useMemo(
    () => catalogCustomerDirectory.find((customer) => customer.key === selectedCatalogCustomerKey) ?? null,
    [catalogCustomerDirectory, selectedCatalogCustomerKey],
  )
  const selectedCatalogCustomerOrders = useMemo(() => {
    if (!selectedCatalogCustomer) return []
    return catalogOrderHistory
  }, [catalogOrderHistory, selectedCatalogCustomer])

  const { config: systemConfig, loading: systemConfigLoading } = useSystemConfig({
    keys: ["whatsapp_support_link", "whatsapp_support_access"],
  })

  const supportAccessConfig = systemConfig?.whatsapp_support_access
  const supportAccessEnabled =
    supportAccessConfig === undefined || supportAccessConfig === null
      ? true
      : readAccessFlag(supportAccessConfig)
  const canSeeWhatsappButton = !systemConfigLoading && supportAccessEnabled
  const isSuperAdmin = currentUser?.role === "admin"
  const isAdmin = currentUser?.role === "admin"
  const currentEmployee = useMemo(() => {
    if (!currentUser || isAdmin) return null
    const currentEmail = currentUser.email.trim().toLowerCase()
    return employees.find((employee) => employee.id === currentUser.id || employee.email.trim().toLowerCase() === currentEmail) ?? null
  }, [currentUser, employees, isAdmin])
  const canAccessEmployees = isAdmin || Boolean(currentEmployee?.permissions.employees ?? currentUser?.permissions?.employees)
  const canAddEmployees = canCurrentUserPerform("canAdd")
  const canEditEmployees = canCurrentUserPerform("canEdit")
  const canDeleteEmployees = canCurrentUserPerform("canDelete")

  const getCatalogStaffCredentials = () => {
    if (!currentUser || !canAccessEmployees) {
      throw new Error("No tienes permiso para administrar usuarios del catálogo.")
    }
    const employee = employees.find((candidate) => candidate.id === currentUser.id)
    if (!employee?.password) {
      throw new Error("No se pudo validar la sesión del empleado. Vuelve a iniciar sesión.")
    }
    return { actor_id: employee.id, actor_password: employee.password }
  }

  const loadCatalogCustomerOverview = async () => {
    setIsLoadingCatalogCustomers(true)
    setCatalogDirectoryError("")
    try {
      const response = await invokeCatalogCustomerAccess({
        action: "overview",
        ...getCatalogStaffCredentials(),
      })
      setCatalogCustomers(response.customers)
      setCatalogBuyers(response.buyers)
    } catch (error) {
      setCatalogDirectoryError(error instanceof Error ? error.message : "No se pudieron cargar las cuentas.")
      console.error("Error al cargar clientes del catálogo:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo cargar la información del catálogo.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingCatalogCustomers(false)
    }
  }

  const loadCatalogCustomerHistory = async (
    customer: CatalogCustomerDirectoryEntry,
    offset = 0,
    append = false,
  ) => {
    setIsLoadingCatalogCustomers(true)
    try {
      const response = await invokeCatalogCustomerAccess({
        action: "history",
        ...getCatalogStaffCredentials(),
        customer_phone: customer.phone || undefined,
        customer_phones: customer.phoneVariants,
        customer_name: customer.phone ? undefined : customer.name,
        offset,
      })
      setSelectedCatalogCustomerKey(customer.key)
      setCatalogCustomerView("history")
      setCatalogOrderHistory((current) => append ? [...current, ...response.orders] : response.orders)
      setCatalogHistoryHasMore(response.has_more)
      setCatalogHistoryNextOffset(response.next_offset)
    } catch (error) {
      console.error("Error al cargar historial del cliente del catálogo:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo cargar el historial del cliente.",
        variant: "destructive",
      })
    } finally {
      setIsLoadingCatalogCustomers(false)
    }
  }

  const openCatalogCustomerDialog = () => {
    setCatalogCustomerView("customers")
    setSelectedCatalogCustomerKey(null)
    setCatalogOrderHistory([])
    setIsCatalogCustomerDialogOpen(true)
    void loadCatalogCustomerOverview()
  }

  const handleCreateCatalogCustomer = async () => {
    if (!canAddEmployees) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para crear cuentas de clientes.",
        variant: "destructive",
      })
      return
    }
    if (!catalogCustomerName.trim()) {
      toast({ title: "Nombre requerido", description: "Escribe el nombre del cliente.", variant: "destructive" })
      return
    }
    if (catalogCustomerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(catalogCustomerEmail.trim())) {
      toast({ title: "Correo inválido", description: "Escribe un correo válido para el cliente.", variant: "destructive" })
      return
    }
    if (!/^\d{10}$/.test(catalogCustomerPhone)) {
      toast({ title: "Teléfono inválido", description: "El teléfono debe tener exactamente 10 dígitos.", variant: "destructive" })
      return
    }
    if (catalogCustomerPassword.length < 8) {
      toast({ title: "Contraseña inválida", description: "Usa al menos 8 caracteres.", variant: "destructive" })
      return
    }

    setIsCreatingCatalogCustomer(true)
    try {
      const response = await invokeCatalogCustomerAccess({
        action: "create",
        ...getCatalogStaffCredentials(),
        name: catalogCustomerName.trim(),
        email: catalogCustomerEmail.trim().toLowerCase(),
        phone: catalogCustomerPhone,
        password: catalogCustomerPassword,
      })
      setCatalogCustomers((current) => [response.customer, ...current.filter((customer) => customer.id !== response.customer.id)])
      setCreatedCatalogCredentials({
        email: response.customer.email ?? catalogCustomerEmail.trim().toLowerCase(),
        phone: response.customer.phone,
        password: catalogCustomerPassword,
      })
      setCatalogCustomerName("")
      setCatalogCustomerEmail("")
      setCatalogCustomerPhone("")
      setCatalogCustomerPassword("")
      toast({ title: "Cuenta creada", description: "El cliente podrá iniciar sesión solo en el catálogo externo." })
    } catch (error) {
      console.error("Error al crear cuenta de cliente del catálogo:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear la cuenta del catálogo.",
        variant: "destructive",
      })
    } finally {
      setIsCreatingCatalogCustomer(false)
    }
  }

  const copyCreatedCatalogCredentials = async () => {
    if (!createdCatalogCredentials) return
    try {
      await navigator.clipboard.writeText(
        [createdCatalogCredentials.email, createdCatalogCredentials.phone, createdCatalogCredentials.password].filter(Boolean).join("\n"),
      )
      toast({ title: "Credenciales copiadas" })
    } catch (error) {
      console.error("Error al copiar credenciales del catálogo:", error)
      toast({
        title: "No se pudieron copiar",
        description: "Copia el correo, teléfono y contraseña manualmente antes de cerrar esta ventana.",
        variant: "destructive",
      })
    }
  }

  const adminContact = useMemo(() => {
    const activeAdmins = employees.filter((employee) => employee.role === "admin" && employee.status === "active")
    return activeAdmins[0] ?? employees.find((employee) => employee.role === "admin") ?? null
  }, [employees])

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "employee" as "admin" | "employee",
    cedula: "",
    address: "",
    hireDate: new Date().toISOString().split("T")[0],
    salary: 0,
    status: "active" as "active" | "inactive",
    permissions: { ...DEFAULT_EMPLOYEE_PERMISSIONS },
  })

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      phone: "",
      role: "employee",
      cedula: "",
      address: "",
      hireDate: new Date().toISOString().split("T")[0],
      salary: 0,
      status: "active",
      permissions: { ...DEFAULT_EMPLOYEE_PERMISSIONS },
    })
    setShowPassword(false)
  }

  const filteredEmployees = employees.filter((emp) => {
    const normalizedSearch = searchTerm.toLowerCase()
    const empName = (emp.name || "").toLowerCase()
    const empEmail = (emp.email || "").toLowerCase()
    const empCedula = emp.cedula || ""

    const matchesSearch =
      empName.includes(normalizedSearch) ||
      empEmail.includes(normalizedSearch) ||
      empCedula.includes(searchTerm)
    const matchesStatus = filterStatus === "all" || emp.status === filterStatus
    const matchesRole = filterRole === "all" || emp.role === filterRole
    return matchesSearch && matchesStatus && matchesRole
  })

  const stats = {
    total: employees.length,
    active: employees.filter((e) => e.status === "active").length,
    inactive: employees.filter((e) => e.status === "inactive").length,
    admins: employees.filter((e) => e.role === "admin").length,
  }

  const handleAddEmployee = async () => {
    if (!canAddEmployees) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para agregar empleados.",
        variant: "destructive",
      })
      return
    }

    // Validaciones
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es requerido",
        variant: "destructive",
      })
      return
    }
    if (!formData.email.trim()) {
      toast({
        title: "Error",
        description: "El email es requerido",
        variant: "destructive",
      })
      return
    }
    if (!formData.password.trim()) {
      toast({
        title: "Error",
        description: "La contraseña es requerida",
        variant: "destructive",
      })
      return
    }

    try {
      if (!isSuperAdmin && formData.role === "admin") {
        toast({
          title: "Acceso restringido",
          description: "Solo los administradores pueden crear otros administradores.",
          variant: "destructive",
        })
        return
      }

      await addEmployee({
        ...formData,
        role: isSuperAdmin ? formData.role : "employee",
      })
      setIsAddDialogOpen(false)
      resetForm()
      toast({
        title: "Éxito",
        description: "Empleado agregado correctamente",
      })
    } catch (error) {
      console.error("Error al agregar empleado:", error)
      toast({
        title: "Error",
        description: "No se pudo agregar el empleado. Verifique los datos ingresados.",
        variant: "destructive",
      })
    }
  }

  const handleEditEmployee = async () => {
    if (!selectedEmployee) {
      return
    }

    if (!canEditEmployees) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para editar empleados.",
        variant: "destructive",
      })
      return
    }

    if (selectedEmployee.role === "super_admin") {
      toast({
        title: "Acción bloqueada",
        description: "El rol de super administrador ya no está disponible en esta versión.",
        variant: "destructive",
      })
      return
    }

    // Validaciones
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre es requerido",
        variant: "destructive",
      })
      return
    }
    if (!formData.email.trim()) {
      toast({
        title: "Error",
        description: "El email es requerido",
        variant: "destructive",
      })
      return
    }

    try {
      if (!isSuperAdmin && formData.role === "admin" && selectedEmployee.role !== "admin") {
        toast({
          title: "Acceso restringido",
          description: "Solo los administradores pueden promover empleados a administrador.",
          variant: "destructive",
        })
        return
      }
      await updateEmployee(selectedEmployee.id, formData)
      setIsEditDialogOpen(false)
      setSelectedEmployee(null)
      resetForm()
      toast({
        title: "Éxito",
        description: "Empleado actualizado correctamente",
      })
    } catch (error) {
      console.error("Error al actualizar empleado:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar el empleado",
        variant: "destructive",
      })
    }
  }

  const handleDeleteEmployee = async () => {
    if (!selectedEmployee) return
    if (!canDeleteEmployees) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para eliminar empleados.",
        variant: "destructive",
      })
      return
    }

    if (selectedEmployee.role === "super_admin") {
      toast({
        title: "Acción bloqueada",
        description: "El rol de super administrador ya no está disponible en esta versión.",
        variant: "destructive",
      })
      return
    }
    try {
      await deleteEmployee(selectedEmployee.id)
      setIsDeleteDialogOpen(false)
      setSelectedEmployee(null)
      toast({
        title: "Éxito",
        description: "Empleado eliminado correctamente",
      })
    } catch (error) {
      console.error("Error al eliminar empleado:", error)
      toast({
        title: "Error",
        description: "No se pudo eliminar el empleado",
        variant: "destructive",
      })
    }
  }

  const openEditDialog = (employee: Employee) => {
    if (!canEditEmployees) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para editar empleados.",
        variant: "destructive",
      })
      return
    }

    setSelectedEmployee(employee)
    setFormData({
      name: employee.name,
      email: employee.email,
      password: employee.password,
      phone: employee.phone,
      role: employee.role === "super_admin" ? "admin" : employee.role,
      cedula: employee.cedula,
      address: employee.address,
      hireDate: employee.hireDate,
      salary: employee.salary,
      status: employee.status,
      permissions: { ...DEFAULT_EMPLOYEE_PERMISSIONS, ...employee.permissions },
    })
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (employee: Employee) => {
    if (!canDeleteEmployees) {
      toast({
        title: "Sin permiso",
        description: "Tu usuario no tiene permiso para eliminar empleados.",
        variant: "destructive",
      })
      return
    }

    setSelectedEmployee(employee)
    setIsDeleteDialogOpen(true)
  }

  const handleOpenAdminWhatsapp = () => {
    const requester = currentUser?.name ?? "un usuario"
    const adminName = adminContact?.name || "Administrador"
    const message = `Hola ${adminName}, soy ${requester} y necesito ayuda con el sistema.`
    const supportLink = resolveSupportLink(systemConfig?.whatsapp_support_link, message)

    if (supportLink) {
      window.open(supportLink, "_blank", "noopener,noreferrer")
      return
    }

    if (!adminContact?.phone) {
      toast({
        title: "Sin teléfono de administrador",
        description: "Agrega un teléfono al administrador para abrir WhatsApp.",
        variant: "destructive",
      })
      return
    }

    const phone = normalizeWhatsappPhone(adminContact.phone)
    if (!phone) {
      toast({
        title: "Teléfono inválido",
        description: "El teléfono del administrador no es válido para WhatsApp.",
        variant: "destructive",
      })
      return
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const permissionLabels: Record<keyof Employee["permissions"], string> = {
    sales: "Ventas",
    inventory: "Inventario",
    customers: "Clientes",
    suppliers: "Proveedores",
    reports: "Reportes",
    repairs: "Reparaciones / Taller",
    queueExclusive: "Cola Exclusiva",
    returns: "Devoluciones",
    purchases: "Compras",
    importCustomers: "Importar Clientes",
    employees: "Empleados",
    cashClosing: "Cierre de Caja",
    invoiceHistory: "Historial de Facturas",
    products: "Productos",
    almacen: "Almacén",
    clienteAlmacen: "Cliente Almacén",
    almacenClosing: "Cierre de Almacén",
    almacenInvoiceHistory: "Historial Almacén",
    wholesaleSales: "Acceso a Ventas por Mayor",
    wholesaleDiscounts: "Descuentos en Ventas por Mayor",
    turnReport: "Informe de Cierre de Turno",
    canAdd: "Puede Agregar",
    canEdit: "Puede Editar",
    canDelete: "Puede Eliminar",
  }

  if (!canAccessEmployees) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Acceso Restringido</h2>
        <p className="text-muted-foreground">Tu usuario no tiene permiso para acceder a esta seccion.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-3 py-3 sm:gap-6 sm:px-6 sm:py-6">
      {/* Estadísticas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="min-h-[104px] sm:min-h-[124px]">
          <CardHeader className="flex flex-col items-start gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle className="text-xs font-medium sm:text-sm">Total Empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold sm:text-2xl">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="min-h-[104px] sm:min-h-[124px]">
          <CardHeader className="flex flex-col items-start gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle className="text-xs font-medium sm:text-sm">Activos</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-green-600 sm:text-2xl">{stats.active}</div>
          </CardContent>
        </Card>
        <Card className="min-h-[104px] sm:min-h-[124px]">
          <CardHeader className="flex flex-col items-start gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle className="text-xs font-medium sm:text-sm">Inactivos</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-red-600 sm:text-2xl">{stats.inactive}</div>
          </CardContent>
        </Card>
        <Card className="min-h-[104px] sm:min-h-[124px]">
          <CardHeader className="flex flex-col items-start gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
            <CardTitle className="text-xs font-medium sm:text-sm">Administradores</CardTitle>
            <Shield className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-xl font-bold text-amber-600 sm:text-2xl">{stats.admins}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros y Búsqueda */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <div>
              <CardTitle>Empleados</CardTitle>
              <CardDescription>Lista de todos los empleados registrados</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
            {canAccessEmployees && <Button variant="outline" onClick={openCatalogCustomerDialog} className="min-h-11">
              <Users className="mr-2 h-4 w-4" />
              Usuarios del catálogo de almacén
            </Button>}
            <Button variant="outline" onClick={() => setIsPublicCatalogDialogOpen(true)} className="min-h-11">
              <Share2 className="mr-2 h-4 w-4" />
              Compartir catálogo
            </Button>
            {canAddEmployees && <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="hidden min-h-11 sm:inline-flex">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Empleado
                </Button>
              </DialogTrigger>
              <DialogContent className="mx-2 max-h-[90vh] max-w-[95vw] overflow-y-auto sm:mx-0 sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Agregar Nuevo Empleado</DialogTitle>
                  <DialogDescription>Complete los datos del nuevo empleado.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre Completo</Label>
                      <Input
                        id="name"
                        name="fullName"
                        autoComplete="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Juan Pérez"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cedula">Cédula</Label>
                      <Input
                        id="cedula"
                        name="cedula"
                        autoComplete="off"
                        value={formData.cedula}
                        onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                        placeholder="001-0000000-0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        autoComplete="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="empleado@empresa.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          name="password"
                          autoComplete="new-password"
                          type={showPassword ? "text" : "password"}
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          placeholder="••••••••"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono</Label>
                      <Input
                        id="phone"
                        name="phone"
                        autoComplete="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="809-555-0000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Rol</Label>
                      <Select
                        value={formData.role}
                        onValueChange={(value: "admin" | "employee") =>
                          setFormData({
                            ...formData,
                            role: value,
                            permissions:
                              value === "admin"
                                ? { ...ADMIN_EMPLOYEE_PERMISSIONS }
                                : formData.permissions,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="employee">Empleado</SelectItem>
                          {isSuperAdmin && <SelectItem value="admin">Administrador</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hireDate">Fecha de Contratación</Label>
                      <Input
                        id="hireDate"
                        type="date"
                        value={formData.hireDate}
                        onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="salary">Salario (RD$)</Label>
                      <Input
                        id="salary"
                        type="number"
                        value={formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })}
                        placeholder="25000"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Input
                      id="address"
                      name="address"
                      autoComplete="street-address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Calle Principal #123"
                    />
                  </div>
                  {formData.role === "employee" && (
                    <div className="space-y-3">
                      <Label>Permisos del Sistema</Label>
                      <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/50 p-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                        {Object.entries(permissionLabels).map(([key, label]) => (
                          <div key={key} className="flex items-center space-x-2">
                            <Checkbox
                              id={`perm-${key}`}
                              checked={formData.permissions[key as keyof Employee["permissions"]]}
                              onCheckedChange={(checked) =>
                                setFormData({
                                  ...formData,
                                  permissions: {
                                    ...formData.permissions,
                                    [key]: checked === true,
                                  },
                                })
                              }
                            />
                            <label htmlFor={`perm-${key}`} className="text-sm cursor-pointer">
                              {label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="min-h-11 w-full sm:w-auto">
                    Cancelar
                  </Button>
                  <Button onClick={handleAddEmployee} className="min-h-11 w-full sm:w-auto">
                    Agregar Empleado
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:mb-6 md:flex-row md:items-center md:gap-4">
            <div className="relative w-full md:flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, email o cédula..."
                type="search"
                name="employeeSearch"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoComplete="new-password"
                disabled={isAddDialogOpen || isEditDialogOpen}
                className="w-full pl-10"
              />
            </div>
            <Select
              value={filterStatus}
              onValueChange={(value: "all" | "active" | "inactive") => setFilterStatus(value)}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activos</SelectItem>
                <SelectItem value="inactive">Inactivos</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterRole}
              onValueChange={(value: "all" | "admin" | "employee") => setFilterRole(value)}
            >
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
                <SelectItem value="employee">Empleados</SelectItem>
              </SelectContent>
            </Select>
            {canAddEmployees && <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={resetForm} className="w-full min-h-11 sm:hidden">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Empleado
                </Button>
              </DialogTrigger>
            </Dialog>}
          </div>

          <div className="overflow-hidden rounded-md border">
            <div className="block space-y-3 p-3 sm:hidden">
              {filteredEmployees.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No se encontraron empleados
                </div>
              ) : (
                filteredEmployees.map((employee) => (
                  <div key={employee.id} className="rounded-lg border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{employee.name}</div>
                        <div className="text-xs text-muted-foreground">{employee.cedula || "Sin cédula"}</div>
                      </div>
                      <Badge
                        variant={
                          employee.role === "super_admin"
                            ? "default"
                            : employee.role === "admin"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {employee.role === "admin" ? "Admin" : "Empleado"}
                      </Badge>
                    </div>

                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="break-all">{employee.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{employee.phone || "N/A"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>{new Date(employee.hireDate).toLocaleDateString("es-DO")}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                        <span>{employee.salary.toLocaleString("es-DO")}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant={employee.status === "active" ? "default" : "destructive"}>
                        {employee.status === "active" ? "Activo" : "Inactivo"}
                      </Badge>
                      {currentUser?.role === "admin" && (
                        <Button variant="outline" size="sm" onClick={() => navigate("/informe-cierre-turno")}>
                          <BarChart3 className="mr-1 h-4 w-4" />
                          Ver
                        </Button>
                      )}
                    </div>

                    {(canEditEmployees || canDeleteEmployees) && (
                      <div className="mt-3 flex gap-2">
                        {canEditEmployees && (
                          <Button variant="outline" className="flex-1 min-h-11" onClick={() => openEditDialog(employee)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                        )}
                        {canDeleteEmployees && (
                          <Button
                            variant="outline"
                            className="flex-1 min-h-11"
                            onClick={() => openDeleteDialog(employee)}
                            disabled={employee.email === currentUser?.email || employee.role === "super_admin"}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Contacto</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Fecha Ingreso</TableHead>
                    <TableHead>Salario</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Informe</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No se encontraron empleados
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{employee.name}</span>
                            <span className="text-sm text-muted-foreground">{employee.cedula}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3" />
                              {employee.email}
                            </div>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {employee.phone || "N/A"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              employee.role === "super_admin"
                                ? "default"
                                : employee.role === "admin"
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {employee.role === "admin" ? "Administrador" : "Empleado"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <Calendar className="h-3 w-3" />
                            {new Date(employee.hireDate).toLocaleDateString("es-DO")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {employee.salary.toLocaleString("es-DO")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={employee.status === "active" ? "default" : "destructive"}>
                            {employee.status === "active" ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {currentUser?.role === "admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate("/informe-cierre-turno")}
                            >
                              <BarChart3 className="mr-1 h-4 w-4" />
                              Ver
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canEditEmployees && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(employee)}
                                disabled={employee.role === "super_admin"}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            {canDeleteEmployees && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openDeleteDialog(employee)}
                                disabled={employee.email === currentUser?.email || employee.role === "super_admin"}
                              >
                                <Trash2 className="h-4 w-4" />
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
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={isCatalogCustomerDialogOpen}
        onOpenChange={(open) => {
          setIsCatalogCustomerDialogOpen(open)
          if (!open) {
            setCreatedCatalogCredentials(null)
            setCatalogCustomerPassword("")
            setSelectedCatalogCustomerKey(null)
            setCatalogCustomerView("customers")
          }
        }}
      >
        <DialogContent className="mx-2 max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto sm:mx-0">
          <DialogHeader>
            <DialogTitle>Usuarios del catálogo de almacén</DialogTitle>
            <DialogDescription>
              Crea cada cuenta con un correo y una contraseña. El cliente inicia sesión desde el enlace principal del catálogo y queda vinculado a tu empresa; las cuentas aparecen aquí aunque todavía no hayan realizado pedidos.
            </DialogDescription>
          </DialogHeader>

          {catalogCustomerView === "customers" ? (
            <div className="space-y-4">
              {createdCatalogCredentials && (
                <div className="flex flex-col gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">Cuenta creada. Comparte las credenciales con el cliente.</p>
                    {createdCatalogCredentials.email && <p>Correo: {createdCatalogCredentials.email}</p>}
                    <p>Teléfono: {createdCatalogCredentials.phone}</p>
                    <p>Contraseña: {createdCatalogCredentials.password}</p>
                    <p className="text-xs">La contraseña no se guarda en texto y no podrá recuperarse después de cerrar esta ventana.</p>
                  </div>
                  <Button type="button" variant="outline" onClick={() => void copyCreatedCatalogCredentials()}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar credenciales
                  </Button>
                </div>
              )}

              {!canAddEmployees && (
                <p className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
                  Tu usuario puede consultar las cuentas y el historial, pero no tiene permiso para crear cuentas nuevas.
                </p>
              )}
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="catalog-customer-name">Nombre del cliente</Label>
                  <Input
                    id="catalog-customer-name"
                    autoComplete="name"
                    value={catalogCustomerName}
                    onChange={(event) => setCatalogCustomerName(event.target.value)}
                    placeholder="Nombre completo"
                    disabled={isCreatingCatalogCustomer}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-customer-email">Correo del cliente (opcional)</Label>
                  <Input
                    id="catalog-customer-email"
                    type="email"
                    autoComplete="email"
                    value={catalogCustomerEmail}
                    onChange={(event) => setCatalogCustomerEmail(event.target.value)}
                    placeholder="cliente@correo.com"
                    disabled={isCreatingCatalogCustomer}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-customer-phone">Teléfono (10 dígitos)</Label>
                  <Input
                    id="catalog-customer-phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={catalogCustomerPhone}
                    onChange={(event) => setCatalogCustomerPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="8095550100"
                    disabled={isCreatingCatalogCustomer}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="catalog-customer-password">Contraseña inicial</Label>
                  <Input
                    id="catalog-customer-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={catalogCustomerPassword}
                    onChange={(event) => setCatalogCustomerPassword(event.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    disabled={isCreatingCatalogCustomer}
                  />
                </div>
                <Button
                  type="button"
                  className="sm:col-span-2 lg:col-span-4"
                  onClick={() => void handleCreateCatalogCustomer()}
                  disabled={
                    isCreatingCatalogCustomer ||
                    !canAddEmployees ||
                    !catalogCustomerName.trim() ||
                    Boolean(catalogCustomerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(catalogCustomerEmail.trim())) ||
                    !/^\d{10}$/.test(catalogCustomerPhone) ||
                    catalogCustomerPassword.length < 8
                  }
                >
                  {isCreatingCatalogCustomer && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Crear cuenta exclusiva del catálogo
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Clientes del catálogo ({catalogCustomerDirectory.length})</h3>
                <Button type="button" variant="outline" onClick={() => void loadCatalogCustomerOverview()} disabled={isLoadingCatalogCustomers}>
                  {isLoadingCatalogCustomers && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Actualizar clientes
                </Button>
              </div>
              {catalogDirectoryError ? <p role="alert">{catalogDirectoryError}</p> : isLoadingCatalogCustomers ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Cargando clientes y pedidos del catálogo…</p>
              ) : catalogCustomerDirectory.length ? (
                <div className="max-h-[55vh] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Teléfono</TableHead>
                        <TableHead>Pedidos</TableHead>
                        <TableHead>Último pedido</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Historial</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalogCustomerDirectory.map((customer) => (
                        <TableRow key={customer.key}>
                          <TableCell className="font-medium">{customer.name}</TableCell>
                          <TableCell>{customer.email || "—"}</TableCell>
                          <TableCell>{customer.phone}</TableCell>
                          <TableCell>{customer.orderCount}</TableCell>
                          <TableCell>
                            {customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString("es-DO") : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={customer.accountId ? (customer.isActive === false ? "secondary" : "default") : "outline"}>
                              {customer.accountId
                                ? customer.isActive === false ? "Cuenta inactiva" : "Cuenta de catálogo"
                                : "Invitado"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isAdmin && customer.accountId && <Button size="sm" variant="outline" onClick={() => setAccessCustomer(customer)}>Categorías</Button>}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!customer.orderCount || isLoadingCatalogCustomers}
                              onClick={() => void loadCatalogCustomerHistory(customer)}
                            >
                              Ver historial
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Todavía no hay clientes que hayan pedido por el catálogo.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCatalogCustomerView("customers")}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Volver a clientes
                  </Button>
                  <div>
                    <h3 className="font-semibold">{selectedCatalogCustomer?.name ?? "Cliente"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedCatalogCustomer?.phone || "Sin teléfono"} · {selectedCatalogCustomerOrders.length} de {selectedCatalogCustomer?.orderCount ?? 0} pedidos
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectedCatalogCustomer && void loadCatalogCustomerHistory(selectedCatalogCustomer)}
                  disabled={isLoadingCatalogCustomers || !selectedCatalogCustomer}
                >
                  {isLoadingCatalogCustomers && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Actualizar historial
                </Button>
              </div>
              {isLoadingCatalogCustomers ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Cargando historial…</p>
              ) : selectedCatalogCustomerOrders.length ? (
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                  {selectedCatalogCustomerOrders.map((order) => (
                    <div key={order.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">{order.customer_name} · {order.customer_phone}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.invoice_number} · {new Date(order.created_at).toLocaleString("es-DO")}
                          </p>
                        </div>
                        <p className="font-semibold">RD$ {Number(order.total).toLocaleString("es-DO", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        {order.items.map((item, index) => (
                          <span key={`${order.id}-${item.id ?? index}`} className="rounded bg-muted px-2 py-1">
                            {Number(item.quantity ?? 1)} × {item.name || "Artículo"}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No se encontraron pedidos para este cliente.
                </p>
              )}
              {catalogHistoryHasMore && !isLoadingCatalogCustomers && selectedCatalogCustomer && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => void loadCatalogCustomerHistory(selectedCatalogCustomer, catalogHistoryNextOffset, true)}
                >
                  Cargar más pedidos
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isPublicCatalogDialogOpen} onOpenChange={setIsPublicCatalogDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Compartir catálogo</DialogTitle></DialogHeader>
          <Button variant="outline" onClick={() => {setIsPublicCatalogDialogOpen(false);openCatalogCustomerDialog()}}>Usuarios del catálogo de almacén</Button>
          {isPublicCatalogDialogOpen && <CatalogPublication isAdmin={isAdmin} ownerId={currentUser?.id || ""}
            credentials={getCatalogStaffCredentials} warehouse={almacenCatalogCategories}
            products={productCategoryOptions} />}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(accessCustomer)} onOpenChange={open => { if (!open) setAccessCustomer(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Categorías de {accessCustomer?.name}</DialogTitle>
            <DialogDescription>Esta selección se carga al entrar con el teléfono o correo y la contraseña de esta cuenta.</DialogDescription></DialogHeader>
          {accessCustomer?.accountId && <CatalogPublication key={accessCustomer.accountId} customerId={accessCustomer.accountId}
            isAdmin={isAdmin} ownerId={currentUser?.id || ""} credentials={getCatalogStaffCredentials} warehouse={almacenCatalogCategories}
            products={productCategoryOptions} />}
        </DialogContent>
      </Dialog>

      {/* Dialog de Edición */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="mx-2 max-h-[90vh] max-w-[95vw] overflow-y-auto sm:mx-0 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Empleado</DialogTitle>
            <DialogDescription>Modifique los datos del empleado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre Completo</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cedula">Cédula</Label>
                <Input
                  id="edit-cedula"
                  value={formData.cedula}
                  onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Rol</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: "admin" | "employee") =>
                    setFormData({
                      ...formData,
                      role: value,
                      permissions:
                        value === "admin"
                          ? { ...ADMIN_EMPLOYEE_PERMISSIONS }
                          : formData.permissions,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Empleado</SelectItem>
                    {isSuperAdmin && <SelectItem value="admin">Administrador</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-hireDate">Fecha de Contratación</Label>
                <Input
                  id="edit-hireDate"
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-salary">Salario (RD$)</Label>
                <Input
                  id="edit-salary"
                  type="number"
                  value={formData.salary}
                  onChange={(e) => setFormData({ ...formData, salary: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-address">Dirección</Label>
              <Input
                id="edit-address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label>Estado del Empleado</Label>
                <p className="text-sm text-muted-foreground">
                  {formData.status === "active"
                    ? "El empleado puede acceder al sistema"
                    : "El empleado no puede acceder"}
                </p>
              </div>
              <Switch
                checked={formData.status === "active"}
                onCheckedChange={(checked) => setFormData({ ...formData, status: checked ? "active" : "inactive" })}
              />
            </div>
            {formData.role === "employee" && (
              <div className="space-y-3">
                <Label>Permisos del Sistema</Label>
                <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/50 p-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
                  {Object.entries(permissionLabels).map(([key, label]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-perm-${key}`}
                        checked={formData.permissions[key as keyof Employee["permissions"]]}
                        onCheckedChange={(checked) =>
                          setFormData({
                            ...formData,
                            permissions: {
                              ...formData.permissions,
                              [key]: checked === true,
                            },
                          })
                        }
                      />
                      <label htmlFor={`edit-perm-${key}`} className="text-sm cursor-pointer">
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="min-h-11 w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleEditEmployee} className="min-h-11 w-full sm:w-auto">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmación de Eliminación */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="mx-2 max-w-[95vw] sm:mx-0 sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente a <strong>{selectedEmployee?.name}</strong>{" "}
              del sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEmployee} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canSeeWhatsappButton && (
        <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
          <Button
            size="icon-lg"
            className="rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600"
            onClick={handleOpenAdminWhatsapp}
            title="Contactar administrador por WhatsApp"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  )
}
