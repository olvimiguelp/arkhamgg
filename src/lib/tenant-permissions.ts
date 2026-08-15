import type { Employee } from "@/components/store-context"
import { MENU_ITEMS } from "@/components/sidebar"

export type TenantPermissionDbKey = keyof Employee["permissions"]

export type TenantPagePermissionOption = {
  dbKey: TenantPermissionDbKey
  superKey: string
  label: string
  category: string
}

/** Paginas del tenant alineadas con MENU_ITEMS / employees.permissions */
export const TENANT_PAGE_PERMISSION_OPTIONS: TenantPagePermissionOption[] = [
  { dbKey: "sales", superKey: "manage_sales", label: "Ventas y Facturacion", category: "ventas" },
  { dbKey: "invoiceHistory", superKey: "manage_invoices", label: "Historial de Facturas", category: "ventas" },
  { dbKey: "returns", superKey: "manage_returns", label: "Devoluciones", category: "ventas" },
  { dbKey: "repairs", superKey: "manage_repairs", label: "Reparaciones / Taller", category: "servicios" },
  { dbKey: "queueExclusive", superKey: "manage_queue", label: "Cola Exclusiva", category: "servicios" },
  { dbKey: "products", superKey: "manage_products", label: "Productos", category: "inventario" },
  { dbKey: "almacen", superKey: "manage_warehouse", label: "Almacen", category: "inventario" },
  { dbKey: "customers", superKey: "manage_customers", label: "Clientes", category: "ventas" },
  { dbKey: "importCustomers", superKey: "manage_customer_imports", label: "Importar Clientes", category: "ventas" },
  { dbKey: "clienteAlmacen", superKey: "manage_warehouse_customers", label: "Cliente Almacen", category: "ventas" },
  { dbKey: "suppliers", superKey: "manage_suppliers", label: "Proveedores", category: "inventario" },
  { dbKey: "purchases", superKey: "manage_purchases", label: "Registro de Facturas", category: "inventario" },
  { dbKey: "employees", superKey: "manage_employees", label: "Empleados", category: "admin" },
  { dbKey: "reports", superKey: "view_reports", label: "Reportes", category: "reportes" },
  { dbKey: "cashClosing", superKey: "manage_cash", label: "Cierre de Caja", category: "finanzas" },
  { dbKey: "almacenClosing", superKey: "manage_warehouse_closing", label: "Cierre de Almacen", category: "finanzas" },
  { dbKey: "almacenInvoiceHistory", superKey: "manage_warehouse_invoices", label: "Historial de Facturas Almacen", category: "ventas" },
  { dbKey: "wholesaleSales", superKey: "manage_wholesale_sales", label: "Ventas por Mayor", category: "ventas" },
  { dbKey: "wholesaleDiscounts", superKey: "manage_wholesale_discounts", label: "Descuentos por Mayor", category: "ventas" },
  { dbKey: "turnReport", superKey: "view_turn_report", label: "Informe de Cierre de Turno", category: "reportes" },
]

const SUPER_TO_DB = new Map(TENANT_PAGE_PERMISSION_OPTIONS.map((item) => [item.superKey, item.dbKey]))

const EMPTY_PERMISSIONS: Employee["permissions"] = {
  sales: false,
  inventory: false,
  customers: false,
  suppliers: false,
  reports: false,
  repairs: false,
  queueExclusive: false,
  returns: false,
  purchases: false,
  employees: false,
  cashClosing: false,
  invoiceHistory: false,
  products: false,
  almacen: false,
  clienteAlmacen: false,
  almacenClosing: false,
  almacenInvoiceHistory: false,
  wholesaleSales: false,
  wholesaleDiscounts: false,
  turnReport: false,
  importCustomers: false,
  canAdd: false,
  canEdit: false,
  canDelete: false,
}

export const FULL_TENANT_PERMISSIONS: Employee["permissions"] = {
  ...EMPTY_PERMISSIONS,
  sales: true,
  inventory: true,
  customers: true,
  suppliers: true,
  reports: true,
  repairs: true,
  queueExclusive: true,
  returns: true,
  purchases: true,
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
  importCustomers: true,
  canAdd: true,
  canEdit: true,
  canDelete: true,
}

const readAccessFlag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["true", "1", "yes", "si", "on", "enabled", "active", "activo"].includes(normalized)
  }
  return false
}

export function superAdminPermissionsToDb(selected: string[]): Employee["permissions"] {
  const permissions: Employee["permissions"] = { ...EMPTY_PERMISSIONS }

  for (const superKey of selected) {
    const dbKey = SUPER_TO_DB.get(superKey)
    if (dbKey) permissions[dbKey] = true
  }

  if (permissions.sales || permissions.products || permissions.customers) {
    permissions.canAdd = true
    permissions.canEdit = true
    permissions.canDelete = true
  }

  if (permissions.products || permissions.almacen) {
    permissions.inventory = true
    permissions.purchases = true
  }

  return permissions
}

export function dbPermissionsToSuperAdmin(permissions: Record<string, unknown> | null | undefined): string[] {
  const result = new Set<string>()

  for (const option of TENANT_PAGE_PERMISSION_OPTIONS) {
    if (readAccessFlag(permissions?.[option.dbKey])) {
      result.add(option.superKey)
    }
  }

  if (result.size === 0) {
    return TENANT_PAGE_PERMISSION_OPTIONS.map((option) => option.superKey)
  }

  return Array.from(result)
}

type AuthLikeUser = {
  id?: string
  email?: string
  role?: string
}

export function getTenantEmployeeRecord(
  currentUser: AuthLikeUser | null | undefined,
  employees: Employee[],
): Employee | undefined {
  if (!currentUser?.email) return undefined
  return employees.find(
    (employee) =>
      employee.email === currentUser.email ||
      (currentUser.id && employee.id === currentUser.id),
  )
}

export function tenantCanAccessMenuItem(
  currentUser: AuthLikeUser | null | undefined,
  employees: Employee[],
  item: (typeof MENU_ITEMS)[number],
): boolean {
  if (!currentUser) return false

  const record = getTenantEmployeeRecord(currentUser, employees)
  const allowedRoles = item.allowedRoles as readonly string[]

  if (currentUser.role === "super_admin") return true

  if (currentUser.role === "admin") {
    if (!allowedRoles.includes("admin")) return false
    if (item.permissionKey === "sales" || item.permissionKey === "employees") return true
    if (!record) return true
    return record.permissions[item.permissionKey] === true
  }

  if (currentUser.role === "employee") {
    if (!record) return allowedRoles.includes("employee")
    return record.permissions[item.permissionKey] === true
  }

  return false
}

export function getFirstAccessibleTenantPath(
  currentUser: AuthLikeUser | null | undefined,
  employees: Employee[],
): string {
  if (currentUser?.role === "super_admin") return "/dashboard"
  const match = MENU_ITEMS.find((item) => tenantCanAccessMenuItem(currentUser, employees, item))
  return match?.to ?? "/bloqueo"
}

/**
 * Returns true if the current user has the `almacen` permission enabled.
 * Used to conditionally show almacen-related buttons INSIDE pages
 * (e.g. "Ver Almacen" toggle in Ventas) independently from sidebar routing.
 *
 * - SuperAdmins always have access.
 * - Admins without an employee record default to having access (legacy).
 * - Admins with an employee record respect `permissions.almacen`.
 */
export function tenantCanAccessAlmacen(
  currentUser: AuthLikeUser | null | undefined,
  employees: Employee[],
): boolean {
  if (!currentUser) return false

  const record = getTenantEmployeeRecord(currentUser, employees)

  if (currentUser.role === "admin") {
    if (!record) return true // legacy: no record → full access
    return record.permissions.almacen === true
  }

  if (currentUser.role === "employee") {
    if (!record) return false
    return record.permissions.almacen === true
  }

  return false
}
