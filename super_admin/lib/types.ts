export type SubscriptionPlan = "gratis" | "mensual" | "trimestral" | "semestral" | "anual"
export type SubscriptionStatus = "activo" | "vencido" | "cancelado"
export type BusinessStatus = "activo" | "suspendido" | "vencido"
export type UserRole = "super_admin" | "admin" | "employee"
export type UserStatus = "activo" | "inactivo" | "suspendido"

export interface Subscription {
  plan: SubscriptionPlan
  status: SubscriptionStatus
  startDate: Date
  endDate: Date
  price: number
}

export interface SubscriptionPlanConfig {
  value: SubscriptionPlan
  label: string
  months: number
  discount: number
  price: number
  color: string
  benefits: string[]
}

export interface Business {
  id: string
  name: string
  description: string
  location: string
  address: string
  phone: string
  phones?: string[]
  email: string
  emails?: string[]
  logo?: string
  invoiceSubtitle?: string
  brandColors?: { primary: string; secondary: string }
  adminId: string
  adminName: string
  employeeCount: number
  subscription?: Subscription
  /** Dias de gracia despues del vencimiento antes de bloquear acceso (default 5) */
  renewalGraceDays: number
  /** Suspension manual de suscripcion (permite login, bloquea panel) */
  subscriptionSuspended: boolean
  /** Alias de subscriptionSuspended (compatibilidad) */
  isBlocked: boolean
  /** Acceso al panel sin validar suscripcion (vencida, sin plan, etc.) */
  openAccess: boolean
  /** Acceso al bot de WhatsApp (funcion Premium) habilitado manualmente por super admin */
  whatsappBotAccess: boolean
  status: BusinessStatus
  createdAt: Date
  taxId?: string
}

export interface Admin {
  id: string
  name: string
  email: string
  phone: string
  provincia?: string
  address?: string
  avatar?: string
  role: "admin"
  status: UserStatus
  businessId: string
  businessName: string
  permissions: string[]
  createdAt: Date
  lastLogin?: Date
}

export interface Employee {
  id: string
  name: string
  email: string
  phone: string
  avatar?: string
  role: "employee"
  status: UserStatus
  businessId: string
  businessName: string
  adminId: string
  position: string
  permissions: string[]
  salary?: number
  createdAt: Date
  lastLogin?: Date
}

export interface SuperAdmin {
  id: string
  name: string
  email: string
  phone: string
  avatar?: string
  role: "super_admin"
  status: UserStatus
  createdAt: Date
  lastLogin?: Date
}

export type User = SuperAdmin | Admin | Employee

export const PERMISSIONS = [
  { value: "view_dashboard", label: "Ver Dashboard", category: "general" },
  { value: "manage_products", label: "Gestionar Productos", category: "inventario" },
  { value: "manage_customers", label: "Gestionar Clientes", category: "ventas" },
  { value: "manage_sales", label: "Gestionar Ventas", category: "ventas" },
  { value: "manage_inventory", label: "Gestionar Inventario", category: "inventario" },
  { value: "manage_suppliers", label: "Gestionar Suplidores", category: "inventario" },
  { value: "manage_repairs", label: "Gestionar Reparaciones", category: "servicios" },
  { value: "manage_returns", label: "Gestionar Devoluciones", category: "ventas" },
  { value: "view_reports", label: "Ver Reportes", category: "reportes" },
  { value: "manage_cash", label: "Gestionar Caja", category: "finanzas" },
  { value: "manage_employees", label: "Gestionar Empleados", category: "admin" },
  { value: "manage_settings", label: "Configuracion", category: "admin" },
]

export const SUBSCRIPTION_PLANS: { 
  value: SubscriptionPlan
  label: string
  months: number
  discount: number
  price: number
  color: string
  benefits: string[]
  isFree?: boolean
}[] = [
  { 
    value: "gratis", 
    label: "Gratis", 
    months: 1, 
    discount: 100, 
    price: 0,
    color: "from-emerald-500 to-emerald-600",
    benefits: ["Primera suscripcion gratis", "Soporte basico", "1 usuario admin", "Prueba todas las funciones"],
    isFree: true
  },
  { 
    value: "mensual", 
    label: "Mensual", 
    months: 1, 
    discount: 0, 
    price: 29.99,
    color: "from-slate-500 to-slate-600",
    benefits: ["Soporte basico", "1 usuario admin", "Reportes mensuales"]
  },
  { 
    value: "trimestral", 
    label: "Trimestral", 
    months: 3, 
    discount: 10, 
    price: 80.97,
    color: "from-blue-500 to-blue-600",
    benefits: ["Soporte prioritario", "3 usuarios admin", "Reportes semanales", "API acceso"]
  },
  { 
    value: "semestral", 
    label: "Semestral", 
    months: 6, 
    discount: 15, 
    price: 152.94,
    color: "from-violet-500 to-violet-600",
    benefits: ["Soporte 24/7", "5 usuarios admin", "Reportes diarios", "API ilimitado", "Marca blanca"]
  },
  { 
    value: "anual", 
    label: "Anual", 
    months: 12, 
    discount: 25, 
    price: 269.91,
    color: "from-amber-500 to-amber-600",
    benefits: ["Soporte dedicado", "Usuarios ilimitados", "Reportes en tiempo real", "API ilimitado", "Marca blanca", "Integraciones custom"]
  },
]
