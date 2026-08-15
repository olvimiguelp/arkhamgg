"use client"

import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useStore, type Employee } from "@/components/store-context"
import { createClient } from "@/lib/supabase/client"
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
} from "lucide-react"
import { useSystemConfig } from "@/hooks/use-system-config"
import { getPublicCatalogUrl } from "@/lib/public-catalog-url"

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
  const [publicCatalogLink, setPublicCatalogLink] = useState("")
  const [publicCatalogType, setPublicCatalogType] = useState<"normal" | "wholesale">("normal")
  const [isPublicCatalogDialogOpen, setIsPublicCatalogDialogOpen] = useState(false)
  const [isCreatingPublicCatalog, setIsCreatingPublicCatalog] = useState(false)

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

  const adminContact = useMemo(() => {
    const activeAdmins = employees.filter((employee) => employee.role === "admin" && employee.status === "active")
    return activeAdmins[0] ?? employees.find((employee) => employee.role === "admin") ?? null
  }, [employees])

  const createPublicCatalogLink = async (priceMode: "normal" | "wholesale") => {
    const ownerAdminId = String(currentUser?.adminId || currentUser?.ownerAdminId || currentUser?.id || "").trim()
    if (!ownerAdminId) return
    setIsCreatingPublicCatalog(true)
    try {
      const token = crypto.randomUUID().replaceAll("-", "")
      const catalogProducts = products.filter((product) => {
        if (product.stock <= 0 || product.boxNumber) return false
        return priceMode === "normal" || Number(product.wholesalePrice) > 0
      })
      const productIds = catalogProducts
        .map((product) => String((product as { sourceId?: string }).sourceId || product.id).replace(/^products::/, ""))
        .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      
      // Create expiration time: 1 hour from now
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      
      const { error } = await createClient().from("catalog_shares").insert({
        token,
        owner_admin_id: ownerAdminId,
        product_ids: productIds,
        price_mode: priceMode,
        business_name: adminContact?.name || "Catálogo de productos",
        expires_at: expiresAt,
        active: true,
      })
      if (error) throw error
      setPublicCatalogType(priceMode)
      setPublicCatalogLink(getPublicCatalogUrl(token))
      setIsPublicCatalogDialogOpen(true)
    } catch (error) {
      console.error("Error creating public catalog link:", error)
      toast({ title: "No se pudo crear el enlace", description: `${(error as { message?: string })?.message || "Verifica que la migración del catálogo público esté aplicada y configura VITE_PUBLIC_CATALOG_URL si usas la aplicación de escritorio."}`, variant: "destructive" })
    } finally {
      setIsCreatingPublicCatalog(false)
    }
  }

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
            <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => void createPublicCatalogLink("normal")} disabled={isCreatingPublicCatalog} className="min-h-11">
              {isCreatingPublicCatalog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
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

      <Dialog open={isPublicCatalogDialogOpen} onOpenChange={setIsPublicCatalogDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{publicCatalogType === "wholesale" ? "Catálogo por mayor listo" : "Catálogo normal listo"}</DialogTitle>
            <DialogDescription>Comparte este enlace con tu cliente. No necesita iniciar sesión y sus productos llegarán a Cola Exclusiva. ⏱️ Este enlace expirará en 1 hora por seguridad.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={publicCatalogLink} />
            <Button size="icon" onClick={() => { void navigator.clipboard.writeText(publicCatalogLink); toast({ title: "Enlace copiado" }) }}><Copy className="h-4 w-4" /></Button>
          </div>
          <DialogFooter className="flex gap-2">
            <Button onClick={() => void createPublicCatalogLink("normal")} disabled={isCreatingPublicCatalog}>Catálogo normal</Button>
            <Button onClick={() => void createPublicCatalogLink("wholesale")} disabled={isCreatingPublicCatalog}>Catálogo por mayor</Button>
          </DialogFooter>
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
