"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { createClient } from "@/lib/supabase/client"
import { useStore } from "@/components/store-context"
import { clearTenantBrandingCache } from "@/lib/tenant-branding"
import {
  dbPermissionsToSuperAdmin,
  FULL_TENANT_PERMISSIONS,
  superAdminPermissionsToDb,
} from "@/lib/tenant-permissions"
import { PERMISSIONS, type Admin, type Business, type Employee, type Subscription, type SubscriptionPlanConfig, type UserStatus } from "./types"

type DbEmployeeRow = {
  id: string
  name: string
  email: string
  phone: string | null
  role: "super_admin" | "admin" | "employee"
  status: "active" | "inactive"
  owner_admin_id: string | null
  address: string | null
  permissions: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
}

type DbBusinessRow = {
  id: string
  owner_admin_id: string
  name: string
  description: string | null
  location: string | null
  address: string | null
  phone: string | null
  phones: string[] | null
  email: string | null
  emails: string[] | null
  logo: string | null
  invoice_subtitle: string | null
  brand_colors: Record<string, unknown> | null
  tax_id: string | null
  employee_count: number | null
  subscription: Record<string, unknown> | null
  renewal_grace_days: number | null
  is_blocked: boolean | null
  subscription_suspended: boolean | null
  open_access: boolean | null
  whatsapp_bot_access: boolean | null
  status: "activo" | "suspendido" | "vencido" | null
  created_at: string | null
  updated_at: string | null
}

type DbSubscriptionPlanRow = {
  id: string
  value: string
  label: string
  months: number
  discount: number
  price: number
  color: string
  benefits: string[] | null
  created_at: string | null
  updated_at: string | null
}

type BusinessContextType = {
  loading: boolean
  error: string | null
  businesses: Business[]
  admins: Admin[]
  employees: Employee[]
  refresh: () => Promise<void>
  addBusiness: (businessData: Partial<Business>) => Promise<void>
  updateBusiness: (businessId: string, updates: Partial<Business>) => Promise<void>
  deleteBusiness: (businessId: string) => Promise<void>
  toggleBlockBusiness: (businessId: string) => Promise<void>
  setBusinessOpenAccess: (businessId: string, openAccess: boolean) => Promise<void>
  setBusinessWhatsappBotAccess: (businessId: string, whatsappBotAccess: boolean) => Promise<void>
  subscriptionPlans: SubscriptionPlanConfig[]
  updateSubscriptionPlan: (plan: SubscriptionPlanConfig) => Promise<boolean>
  addAdmin: (adminData: Omit<Admin, "id" | "createdAt"> & { password?: string }) => Promise<boolean>
  updateAdmin: (adminId: string, updates: Partial<Admin> & { password?: string }) => Promise<boolean>
  deleteAdmin: (adminId: string) => Promise<void>
  setAdminStatus: (adminId: string, status: UserStatus) => Promise<boolean>
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

const DEFAULT_BRAND_COLORS = { primary: "#3b82f6", secondary: "#1d4ed8" }

const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlanConfig[] = [
  {
    value: "mensual",
    label: "Mensual",
    months: 1,
    discount: 0,
    price: 29.99,
    color: "from-slate-500 to-slate-600",
    benefits: ["Soporte basico", "1 usuario admin", "Reportes mensuales"],
  },
  {
    value: "trimestral",
    label: "Trimestral",
    months: 3,
    discount: 10,
    price: 80.97,
    color: "from-blue-500 to-blue-600",
    benefits: ["Soporte prioritario", "3 usuarios admin", "Reportes semanales", "API acceso"],
  },
  {
    value: "semestral",
    label: "Semestral",
    months: 6,
    discount: 15,
    price: 152.94,
    color: "from-violet-500 to-violet-600",
    benefits: ["Soporte 24/7", "5 usuarios admin", "Reportes diarios", "API ilimitado", "Marca blanca"],
  },
  {
    value: "anual",
    label: "Anual",
    months: 12,
    discount: 25,
    price: 269.91,
    color: "from-amber-500 to-amber-600",
    benefits: ["Soporte dedicado", "Usuarios ilimitados", "Reportes en tiempo real", "API ilimitado", "Marca blanca", "Integraciones custom"],
  },
]

const SUBSCRIPTION_PLANS = new Set(["gratis", "mensual", "trimestral", "semestral", "anual"])
const SUBSCRIPTION_STATUSES = new Set(["activo", "vencido", "cancelado"])

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toStringSafe = (value: unknown) => (typeof value === "string" ? value : "")

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value > 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["true", "1", "yes", "si", "on", "enabled", "active"].includes(normalized)
  }
  return false
}

const toDate = (value: unknown) => {
  const parsed = new Date(typeof value === "string" || value instanceof Date ? value : Date.now())
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const normalizeStringArray = (value: unknown, fallback?: string) => {
  const list = Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : []
  if (list.length > 0) return list
  if (fallback && fallback.trim().length > 0) return [fallback.trim()]
  return []
}

const normalizeSubscription = (value: unknown): Subscription | undefined => {
  if (!isObject(value)) return undefined

  const rawPlan = toStringSafe(value.plan).toLowerCase()
  const rawStatus = toStringSafe(value.status).toLowerCase()
  const plan = SUBSCRIPTION_PLANS.has(rawPlan) ? (rawPlan as Subscription["plan"]) : "mensual"
  const status = SUBSCRIPTION_STATUSES.has(rawStatus) ? (rawStatus as Subscription["status"]) : "activo"
  const price = Number(value.price ?? 0)

  return {
    plan,
    status,
    startDate: toDate(value.startDate ?? value.start_date),
    endDate: toDate(value.endDate ?? value.end_date),
    price: Number.isFinite(price) ? price : 0,
  }
}

const serializeSubscription = (subscription?: Subscription) => {
  if (!subscription) return null
  return {
    plan: subscription.plan,
    status: subscription.status,
    startDate: subscription.startDate.toISOString(),
    endDate: subscription.endDate.toISOString(),
    price: subscription.price,
  }
}

const normalizeBusinessStatus = (
  status: Business["status"] | undefined,
  subscriptionSuspended: boolean,
  subscription?: Subscription,
): Business["status"] => {
  if (subscriptionSuspended) return "vencido"
  if (status === "activo" || status === "suspendido" || status === "vencido") return status
  if (subscription?.status === "vencido") return "vencido"
  return "activo"
}

const mapPermissions = (permissions: unknown): string[] => {
  if (!isObject(permissions)) {
    return dbPermissionsToSuperAdmin(null)
  }
  return dbPermissionsToSuperAdmin(permissions)
}

const createUuid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

const createCedula = () => `SA-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`

const asDbEmployeeStatus = (status: UserStatus | undefined): "active" | "inactive" =>
  status === "activo" ? "active" : "inactive"

/** Estado de cuenta (admin/empleado). No mezclar con suspension de suscripcion. */
const asUserStatus = (employeeStatus: "active" | "inactive" | string | null | undefined): UserStatus => {
  if (employeeStatus === "inactive") return "suspendido"
  return "activo"
}

const isMissingSaasBusinessesError = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? error ?? "").toLowerCase()
  const code = String((error as { code?: string })?.code ?? "")
  return message.includes("saas_businesses") || code === "PGRST205"
}

const isMissingSubscriptionPlansError = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? error ?? "").toLowerCase()
  const code = String((error as { code?: string })?.code ?? "")
  return message.includes("subscription_plans") || code === "PGRST205"
}

const buildBusinessFromRow = (
  row: DbBusinessRow,
  adminName: string,
  employeeCount: number,
): Business => {
  const subscription = normalizeSubscription(row.subscription)
  const subscriptionSuspended = Boolean(row.subscription_suspended ?? row.is_blocked)
  const businessStatus = normalizeBusinessStatus(row.status ?? undefined, subscriptionSuspended, subscription)
  const phones = normalizeStringArray(row.phones, row.phone ?? undefined)
  const emails = normalizeStringArray(row.emails, row.email ?? undefined)
  const brandColors = isObject(row.brand_colors)
    ? {
        primary: toStringSafe(row.brand_colors.primary) || DEFAULT_BRAND_COLORS.primary,
        secondary: toStringSafe(row.brand_colors.secondary) || DEFAULT_BRAND_COLORS.secondary,
      }
    : DEFAULT_BRAND_COLORS

  return {
    id: row.id,
    name: row.name || "Empresa sin nombre",
    description: row.description ?? "",
    location: row.location ?? "",
    address: row.address ?? "",
    phone: row.phone ?? phones[0] ?? "",
    phones,
    email: row.email ?? emails[0] ?? "",
    emails,
    logo: row.logo ?? undefined,
    invoiceSubtitle: row.invoice_subtitle ?? undefined,
    brandColors,
    adminId: row.owner_admin_id,
    adminName: adminName || "Administrador",
    employeeCount: Number.isFinite(employeeCount) ? employeeCount : Number(row.employee_count ?? 0),
    subscription,
    renewalGraceDays: Math.max(0, Number(row.renewal_grace_days ?? 5)),
    isBlocked: subscriptionSuspended,
    subscriptionSuspended,
    openAccess: Boolean(row.open_access),
    whatsappBotAccess: Boolean(row.whatsapp_bot_access),
    status: businessStatus,
    createdAt: toDate(row.created_at),
    taxId: row.tax_id ?? undefined,
  }
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useStore()
  // La sesión de la aplicación guarda el rol en `role`/`tenantRole`; no
  // existe un campo `isSuperAdmin` en AuthUser. Usar ese campo dejaba todo el
  // contexto vacío y evitaba cualquier consulta a Supabase.
  const canAccess = currentUser?.role === "super_admin" || currentUser?.tenantRole === "super_admin"
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlanConfig[]>(DEFAULT_SUBSCRIPTION_PLANS)

  const refresh = useCallback(async () => {
    if (!canAccess) {
      setBusinesses([])
      setAdmins([])
      setEmployees([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const [adminsResult, employeesResult, businessesResult, subscriptionPlansResult] = await Promise.all([
        supabase
          .from("employees")
          .select("id,name,email,phone,role,status,owner_admin_id,address,permissions,created_at,updated_at")
          .eq("role", "admin")
          .order("created_at", { ascending: false }),
        supabase
          .from("employees")
          .select("id,name,email,phone,role,status,owner_admin_id,address,permissions,created_at,updated_at")
          .eq("role", "employee")
          .order("created_at", { ascending: false }),
        supabase.from("saas_businesses").select("*").order("created_at", { ascending: false }),
        supabase.from("subscription_plans").select("*").order("created_at", { ascending: false }),
      ])

      if (adminsResult.error) throw adminsResult.error
      if (employeesResult.error) throw employeesResult.error
      if (businessesResult.error && !isMissingSaasBusinessesError(businessesResult.error)) throw businessesResult.error
      if (subscriptionPlansResult.error && !isMissingSubscriptionPlansError(subscriptionPlansResult.error)) throw subscriptionPlansResult.error

      const adminRows = (adminsResult.data ?? []) as unknown as DbEmployeeRow[]
      const employeeRows = (employeesResult.data ?? []) as unknown as DbEmployeeRow[]
      const businessRows = businessesResult.error ? [] : ((businessesResult.data ?? []) as unknown as DbBusinessRow[])
      const subscriptionPlanRows = subscriptionPlansResult.error
        ? []
        : ((subscriptionPlansResult.data ?? []) as unknown as DbSubscriptionPlanRow[])

      const adminById = new Map<string, DbEmployeeRow>()
      adminRows.forEach((row) => adminById.set(row.id, row))

      const employeeCountByAdminId = new Map<string, number>()
      employeeRows.forEach((row) => {
        const ownerAdminId = row.owner_admin_id ?? ""
        if (!ownerAdminId) return
        employeeCountByAdminId.set(ownerAdminId, (employeeCountByAdminId.get(ownerAdminId) ?? 0) + 1)
      })

      const businessByAdminId = new Map<string, DbBusinessRow>()
      businessRows.forEach((row) => {
        businessByAdminId.set(row.owner_admin_id, row)
      })

      const mappedSubscriptionPlans: SubscriptionPlanConfig[] =
        subscriptionPlanRows.length > 0
          ? subscriptionPlanRows.map((row) => ({
              value: row.value as SubscriptionPlan,
              label: row.label,
              months: row.months,
              discount: row.discount,
              price: row.price,
              color: row.color,
              benefits: normalizeStringArray(row.benefits),
            }))
          : DEFAULT_SUBSCRIPTION_PLANS

      const mappedBusinesses = businessRows.map((row) =>
        buildBusinessFromRow(
          row,
          adminById.get(row.owner_admin_id)?.name ?? "Administrador",
          employeeCountByAdminId.get(row.owner_admin_id) ?? Number(row.employee_count ?? 0),
        ),
      )

      adminRows.forEach((adminRow) => {
        if (businessByAdminId.has(adminRow.id)) return

        const accountSuspended = adminRow.status === "inactive"
        mappedBusinesses.push({
          id: `pending-${adminRow.id}`,
          name: `Empresa de ${adminRow.name || "Administrador"}`,
          description: "",
          location: "",
          address: adminRow.address ?? "",
          phone: adminRow.phone ?? "",
          phones: normalizeStringArray(null, adminRow.phone ?? undefined),
          email: adminRow.email ?? "",
          emails: normalizeStringArray(null, adminRow.email ?? undefined),
          adminId: adminRow.id,
          adminName: adminRow.name || "Administrador",
          employeeCount: employeeCountByAdminId.get(adminRow.id) ?? 0,
          subscription: undefined,
          renewalGraceDays: 5,
          isBlocked: false,
          subscriptionSuspended: false,
          openAccess: false,
          whatsappBotAccess: false,
          status: accountSuspended ? "suspendido" : "activo",
          createdAt: toDate(adminRow.created_at),
        })
      })

      const mappedAdmins: Admin[] = adminRows.map((row) => {
        const businessRow = businessByAdminId.get(row.id)
        const business = mappedBusinesses.find((item) => item.adminId === row.id)
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone ?? "",
          provincia: undefined,
          address: row.address ?? undefined,
          role: "admin",
          status: asUserStatus(row.status),
          businessId: business?.id ?? "",
          businessName: business?.name ?? "Empresa sin asignar",
          permissions: mapPermissions(row.permissions),
          createdAt: toDate(row.created_at),
          lastLogin: row.updated_at ? toDate(row.updated_at) : undefined,
        }
      })

      const mappedEmployees: Employee[] = employeeRows.map((row) => {
        const ownerAdminId = row.owner_admin_id ?? ""
        const business = mappedBusinesses.find((item) => item.adminId === ownerAdminId)
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone ?? "",
          role: "employee",
          status: asUserStatus(row.status),
          businessId: business?.id ?? "",
          businessName: business?.name ?? "Empresa sin asignar",
          adminId: ownerAdminId,
          position: "Empleado",
          permissions: mapPermissions(row.permissions),
          createdAt: toDate(row.created_at),
          lastLogin: row.updated_at ? toDate(row.updated_at) : undefined,
        }
      })

      setBusinesses(mappedBusinesses)
      setAdmins(mappedAdmins)
      setEmployees(mappedEmployees)
      setSubscriptionPlans(mappedSubscriptionPlans)
    } catch (err) {
      const message = String((err as { message?: string })?.message ?? err ?? "")
      console.error("[BusinessContext] refresh error:", err)
      if (isMissingSaasBusinessesError(err)) {
        setError(
          "Falta la tabla saas_businesses. El administrador se cargará, pero algunas funciones de negocio no estarán disponibles. Ejecuta la migracion 030-create-saas-businesses-table.sql.",
        )
      } else if (isMissingSubscriptionPlansError(err)) {
        setError(
          "Falta la tabla subscription_plans. Los planes se mostraran con valores predeterminados. Ejecuta la migracion 031-create-subscription-plans-table.sql.",
        )
      } else {
        setError(message || "No se pudo cargar la informacion del dashboard de super administrador.")
      }
      setBusinesses([])
      setAdmins([])
      setEmployees([])
      setSubscriptionPlans(DEFAULT_SUBSCRIPTION_PLANS)
    } finally {
      setLoading(false)
    }
  }, [canAccess])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!canAccess) return

    const supabase = createClient()
    const channel = supabase
      .channel(`super_admin_dashboard_${Math.random().toString(36).substring(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        void refresh()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "saas_businesses" }, () => {
        void refresh()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, () => {
        void refresh()
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_subscription_messages" }, () => {
        void refresh()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [canAccess, refresh])

  const updateSubscriptionPlan = useCallback(
    async (plan: SubscriptionPlanConfig) => {
      if (!canAccess) return false
      setError(null)

      try {
        const supabase = createClient()
        const now = new Date().toISOString()
        const payload = {
          value: plan.value,
          label: plan.label.trim(),
          months: plan.months,
          discount: plan.discount,
          price: plan.price,
          color: plan.color,
          benefits: plan.benefits,
          updated_at: now,
        }

        const { error: upsertError } = await supabase.from("subscription_plans").upsert(payload, {
          onConflict: "value",
        })
        if (upsertError) throw upsertError

        setSubscriptionPlans((prev) => prev.map((item) => (item.value === plan.value ? plan : item)))
        return true
      } catch (err) {
        console.error("[BusinessContext] updateSubscriptionPlan error:", err)
        if (isMissingSubscriptionPlansError(err)) {
          setError(
            "Falta la tabla subscription_plans. Crea la migracion 031-create-subscription-plans-table.sql para guardar los planes.",
          )
        } else {
          setError("No se pudo guardar el plan de suscripcion.")
        }
        return false
      }
    },
    [canAccess],
  )

  const addAdmin = useCallback(
    async (adminData: Omit<Admin, "id" | "createdAt"> & { password?: string }) => {
      if (!canAccess) return
      setError(null)

      const adminId = createUuid()
      const adminStatus = adminData.status ?? "activo"
      const isAdminSuspended = adminStatus === "suspendido"
      const businessName = adminData.businessName?.trim() || `Empresa de ${adminData.name}`
      const password = adminData.password?.trim() || "admin123"
      const now = new Date().toISOString()
      const supabase = createClient()

      // Allow shorter passwords (do not enforce 8-character minimum here).

      try {
        // Comprobar si el email ya existe
        if (adminData.email) {
          const { data: existing, error: checkError } = await supabase
            .from("employees")
            .select("id")
            .eq("email", adminData.email.trim().toLowerCase())
            .limit(1)

          if (checkError) {
            console.warn("[BusinessContext] addAdmin email check error:", checkError)
          }

          if (existing && (existing as any).length > 0) {
            setError("El correo ya está en uso por otra cuenta.")
            return false
          }
        }
        const { error: adminError } = await supabase.from("employees").insert({
          id: adminId,
          name: adminData.name,
          email: adminData.email.trim().toLowerCase(),
          password,
          phone: adminData.phone ?? "",
          role: "admin",
          owner_admin_id: adminId,
          cedula: createCedula(),
          address: adminData.address ?? "",
          salary: 0,
          status: asDbEmployeeStatus(adminStatus),
          permissions:
            adminData.permissions !== undefined
              ? superAdminPermissionsToDb(adminData.permissions)
              : FULL_TENANT_PERMISSIONS,
        })
        if (adminError) throw adminError

        const { error: businessError } = await supabase.from("saas_businesses").insert({
          owner_admin_id: adminId,
          name: businessName,
          description: "",
          location: adminData.provincia ?? "",
          address: adminData.address ?? "",
          phone: adminData.phone ?? "",
          phones: adminData.phone ? [adminData.phone] : [],
          email: adminData.email.trim().toLowerCase(),
          emails: [adminData.email.trim().toLowerCase()],
          employee_count: 0,
          subscription: null,
          renewal_grace_days: 5,
          is_blocked: false,
          subscription_suspended: false,
          open_access: false,
          status: "activo",
          created_at: now,
          updated_at: now,
        })
        if (businessError) {
          if (!isMissingSaasBusinessesError(businessError)) {
            await supabase.from("employees").delete().eq("id", adminId)
            throw businessError
          }
          console.warn("[BusinessContext] addAdmin missing saas_businesses table, admin row kept.", businessError)
          await refresh()
          return true
        }

        await refresh()
        return true
      } catch (err) {
        console.error("[BusinessContext] addAdmin error:", err)
        if (isMissingSaasBusinessesError(err)) {
          setError(
            "Administrador creado en employees, pero no se pudo crear el negocio asociado porque falta la tabla saas_businesses.",
          )
        } else {
          // Detectar violacion de unicidad por si el DB lanzó error
          const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase()
          if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("employees_email")) {
            setError("El correo ya está en uso por otra cuenta.")
            return false
          }
          setError("No se pudo crear el administrador. Verifica que el email no exista y que la migracion este aplicada.")
        }
        return false
      }
    },
    [canAccess, refresh],
  )

  const addBusiness = useCallback(
    async (businessData: Partial<Business>) => {
      if (!canAccess) return
      setError(null)

      const adminId = createUuid()
      const adminName = businessData.adminName?.trim() || "Administrador"
      const email = (businessData.email ?? `admin.${Date.now()}@saas.local`).trim().toLowerCase()
      const phone = businessData.phone ?? ""
      const now = new Date().toISOString()
      const supabase = createClient()

      const subscription = businessData.subscription
      const subscriptionSuspended = Boolean(
        businessData.subscriptionSuspended ?? businessData.isBlocked,
      )
      const status = normalizeBusinessStatus(businessData.status ?? "activo", subscriptionSuspended, subscription)

      try {
        const { error: adminError } = await supabase.from("employees").insert({
          id: adminId,
          name: adminName,
          email,
          password: "admin123",
          phone,
          role: "admin",
          owner_admin_id: adminId,
          cedula: createCedula(),
          address: businessData.address ?? "",
          salary: 0,
          status: "active",
          permissions: FULL_TENANT_PERMISSIONS,
        })
        if (adminError) throw adminError

        const phones = normalizeStringArray(businessData.phones, phone)
        const emails = normalizeStringArray(businessData.emails, email)
        const { error: businessError } = await supabase.from("saas_businesses").insert({
          owner_admin_id: adminId,
          name: businessData.name?.trim() || `Empresa de ${adminName}`,
          description: businessData.description ?? "",
          location: businessData.location ?? "",
          address: businessData.address ?? "",
          phone: phone || phones[0] || "",
          phones,
          email: email || emails[0] || "",
          emails,
          logo: businessData.logo ?? null,
          invoice_subtitle: businessData.invoiceSubtitle ?? null,
          brand_colors: businessData.brandColors ?? DEFAULT_BRAND_COLORS,
          tax_id: businessData.taxId ?? null,
          employee_count: businessData.employeeCount ?? 0,
          subscription: serializeSubscription(subscription),
          renewal_grace_days: businessData.renewalGraceDays ?? 5,
          is_blocked: subscriptionSuspended,
          subscription_suspended: subscriptionSuspended,
          open_access: Boolean(businessData.openAccess),
          whatsapp_bot_access: Boolean(businessData.whatsappBotAccess),
          status,
          created_at: now,
          updated_at: now,
        })

        if (businessError) {
          if (!isMissingSaasBusinessesError(businessError)) {
            await supabase.from("employees").delete().eq("id", adminId)
            throw businessError
          }
          console.warn("[BusinessContext] addBusiness missing saas_businesses table, admin row kept.", businessError)
          await refresh()
          return
        }

        await refresh()
      } catch (err) {
        console.error("[BusinessContext] addBusiness error:", err)
        setError("No se pudo crear la empresa.")
      }
    },
    [canAccess, refresh],
  )

  const setAdminStatus = useCallback(
    async (adminId: string, status: UserStatus): Promise<boolean> => {
      if (!canAccess) return false

      const supabase = createClient()
      const now = new Date().toISOString()
      const shouldSuspend = status === "suspendido"

      try {
        const { error: adminError } = await supabase
          .from("employees")
          .update({ status: asDbEmployeeStatus(status), updated_at: now })
          .eq("id", adminId)
        if (adminError) throw adminError

        if (status === "activo" || status === "suspendido") {
          const { error: tenantUsersError } = await supabase
            .from("employees")
            .update({ status: shouldSuspend ? "inactive" : "active", updated_at: now })
            .eq("owner_admin_id", adminId)
            .neq("id", adminId)
          if (tenantUsersError) throw tenantUsersError
        }

        await refresh()
        setError(null)
        return true
      } catch (err) {
        console.error("[BusinessContext] setAdminStatus error:", err)
        setError("No se pudo actualizar el estado del administrador.")
        return false
      }
    },
    [canAccess, refresh],
  )

  const updateBusiness = useCallback(
    async (businessId: string, updates: Partial<Business>) => {
      if (!canAccess) return

      const business = businesses.find((item) => item.id === businessId)
      if (!business) return

      const nextSubscription = Object.prototype.hasOwnProperty.call(updates, "subscription")
        ? updates.subscription
        : business.subscription
      const nextOpenAccess = Object.prototype.hasOwnProperty.call(updates, "openAccess")
        ? Boolean(updates.openAccess)
        : business.openAccess
      const nextSubscriptionSuspended = nextOpenAccess
        ? false
        : Object.prototype.hasOwnProperty.call(updates, "subscriptionSuspended")
          ? Boolean(updates.subscriptionSuspended)
          : Object.prototype.hasOwnProperty.call(updates, "isBlocked")
            ? Boolean(updates.isBlocked)
            : business.subscriptionSuspended ?? business.isBlocked
      const nextStatus = nextOpenAccess
        ? "activo"
        : normalizeBusinessStatus(
            updates.status ?? business.status,
            nextSubscriptionSuspended,
            nextSubscription,
          )
      const nextPhones = normalizeStringArray(updates.phones ?? business.phones, updates.phone ?? business.phone)
      const nextEmails = normalizeStringArray(updates.emails ?? business.emails, updates.email ?? business.email)

      const optimisticBusiness: Business = {
        ...business,
        ...updates,
        subscription: nextSubscription,
        isBlocked: nextSubscriptionSuspended,
        subscriptionSuspended: nextSubscriptionSuspended,
        openAccess: nextOpenAccess,
        status: nextStatus,
        phones: nextPhones,
        phone: updates.phone ?? nextPhones[0] ?? business.phone,
        emails: nextEmails,
        email: updates.email ?? nextEmails[0] ?? business.email,
      }

      setBusinesses((prev) => prev.map((item) => (item.id === businessId ? optimisticBusiness : item)))
      setAdmins((prev) =>
        prev.map((admin) =>
          admin.businessId === businessId
            ? {
                ...admin,
                businessName: optimisticBusiness.name,
              }
            : admin,
        ),
      )

      try {
        const supabase = createClient()
        const now = new Date().toISOString()
        const payload: Record<string, unknown> = {
          updated_at: now,
        }

        if (Object.prototype.hasOwnProperty.call(updates, "name")) payload.name = optimisticBusiness.name
        if (Object.prototype.hasOwnProperty.call(updates, "description")) payload.description = optimisticBusiness.description
        if (Object.prototype.hasOwnProperty.call(updates, "location")) payload.location = optimisticBusiness.location
        if (Object.prototype.hasOwnProperty.call(updates, "address")) payload.address = optimisticBusiness.address

        if (
          Object.prototype.hasOwnProperty.call(updates, "phone") ||
          Object.prototype.hasOwnProperty.call(updates, "phones")
        ) {
          payload.phone = optimisticBusiness.phone
          payload.phones = optimisticBusiness.phones ?? []
        }

        if (
          Object.prototype.hasOwnProperty.call(updates, "email") ||
          Object.prototype.hasOwnProperty.call(updates, "emails")
        ) {
          payload.email = optimisticBusiness.email
          payload.emails = optimisticBusiness.emails ?? []
        }

        if (Object.prototype.hasOwnProperty.call(updates, "logo")) payload.logo = optimisticBusiness.logo ?? null
        if (Object.prototype.hasOwnProperty.call(updates, "invoiceSubtitle")) {
          payload.invoice_subtitle = optimisticBusiness.invoiceSubtitle ?? null
        }
        if (Object.prototype.hasOwnProperty.call(updates, "brandColors")) {
          payload.brand_colors = optimisticBusiness.brandColors ?? DEFAULT_BRAND_COLORS
        }
        if (Object.prototype.hasOwnProperty.call(updates, "taxId")) payload.tax_id = optimisticBusiness.taxId ?? null
        if (Object.prototype.hasOwnProperty.call(updates, "employeeCount")) payload.employee_count = optimisticBusiness.employeeCount
        if (Object.prototype.hasOwnProperty.call(updates, "subscription")) {
          payload.subscription = serializeSubscription(nextSubscription)
        }
        if (Object.prototype.hasOwnProperty.call(updates, "renewalGraceDays")) {
          payload.renewal_grace_days = Math.max(0, optimisticBusiness.renewalGraceDays ?? 5)
        }

        if (Object.prototype.hasOwnProperty.call(updates, "openAccess")) {
          payload.open_access = nextOpenAccess
        }

        if (Object.prototype.hasOwnProperty.call(updates, "whatsappBotAccess")) {
          payload.whatsapp_bot_access = Boolean(updates.whatsappBotAccess)
        }

        if (
          Object.prototype.hasOwnProperty.call(updates, "status") ||
          Object.prototype.hasOwnProperty.call(updates, "isBlocked") ||
          Object.prototype.hasOwnProperty.call(updates, "subscriptionSuspended") ||
          Object.prototype.hasOwnProperty.call(updates, "openAccess")
        ) {
          payload.status = nextStatus
          payload.is_blocked = nextSubscriptionSuspended
          payload.subscription_suspended = nextSubscriptionSuspended
        }

        if (businessId.startsWith("pending-")) {
          const ownerAdminId = businessId.replace(/^pending-/, "")
          const { data: existingBusinessRow, error: findError } = await supabase
            .from("saas_businesses")
            .select("id")
            .eq("owner_admin_id", ownerAdminId)
            .maybeSingle()

          if (findError) throw findError

          if (existingBusinessRow?.id) {
            const { error: updateError } = await supabase
              .from("saas_businesses")
              .update(payload)
              .eq("id", existingBusinessRow.id)
            if (updateError) throw updateError
          } else {
            const { error: insertError } = await supabase.from("saas_businesses").insert({
              ...payload,
              owner_admin_id: ownerAdminId,
              name: optimisticBusiness.name || `Empresa de ${optimisticBusiness.adminName || "Administrador"}`,
              description: optimisticBusiness.description ?? "",
              location: optimisticBusiness.location ?? "",
              address: optimisticBusiness.address ?? "",
              phone: optimisticBusiness.phone ?? "",
              phones: optimisticBusiness.phones ?? [],
              email: optimisticBusiness.email ?? "",
              emails: optimisticBusiness.emails ?? [],
              logo: optimisticBusiness.logo ?? null,
              invoice_subtitle: optimisticBusiness.invoiceSubtitle ?? null,
              brand_colors: optimisticBusiness.brandColors ?? DEFAULT_BRAND_COLORS,
              tax_id: optimisticBusiness.taxId ?? null,
              employee_count: optimisticBusiness.employeeCount ?? 0,
              subscription: serializeSubscription(nextSubscription),
              renewal_grace_days: Math.max(0, optimisticBusiness.renewalGraceDays ?? 5),
              is_blocked: nextSubscriptionSuspended,
              subscription_suspended: nextSubscriptionSuspended,
              open_access: nextOpenAccess,
              whatsapp_bot_access: Boolean(optimisticBusiness.whatsappBotAccess),
              status: nextStatus,
              created_at: now,
              updated_at: now,
            })
            if (insertError) throw insertError
          }
        } else {
          const { error: updateError } = await supabase.from("saas_businesses").update(payload).eq("id", businessId)
          if (updateError) throw updateError
        }

        clearTenantBrandingCache(business.adminId)
      } catch (err) {
        console.error("[BusinessContext] updateBusiness error:", err)
        setError("No se pudo actualizar la empresa. Se recargaran los datos para mantener consistencia.")
        await refresh()
      }
    },
    [businesses, canAccess, refresh],
  )

  const updateAdmin = useCallback(
    async (adminId: string, updates: Partial<Admin> & { password?: string }) => {
      if (!canAccess) return

      try {
        const supabase = createClient()
        const now = new Date().toISOString()
        const payload: Record<string, unknown> = { updated_at: now }

        if (Object.prototype.hasOwnProperty.call(updates, "name")) payload.name = updates.name
        if (Object.prototype.hasOwnProperty.call(updates, "email")) {
          payload.email = updates.email?.trim().toLowerCase()
        }
        if (Object.prototype.hasOwnProperty.call(updates, "phone")) payload.phone = updates.phone
        if (Object.prototype.hasOwnProperty.call(updates, "address")) payload.address = updates.address
        if (Object.prototype.hasOwnProperty.call(updates, "password") && updates.password) {
          const password = updates.password.trim()
          if (password.length === 0) {
            setError("La contraseña no puede estar vacía.")
            return false
          }
          payload.password = password
        }
        if (Object.prototype.hasOwnProperty.call(updates, "status")) {
          payload.status = asDbEmployeeStatus(updates.status)
        }
        if (Object.prototype.hasOwnProperty.call(updates, "permissions")) {
          payload.permissions = superAdminPermissionsToDb(updates.permissions ?? [])
        }

        const hasEmployeeFields = Object.keys(payload).length > 1
        if (hasEmployeeFields) {
          // Si se intenta cambiar el email, verificar que no exista otra cuenta con ese email
          if (payload.email) {
            const { data: existing, error: checkError } = await supabase
              .from("employees")
              .select("id")
              .eq("email", String(payload.email))
              .neq("id", adminId)
              .limit(1)

            if (checkError) {
              console.warn("[BusinessContext] updateAdmin email check error:", checkError)
            }
            if (existing && (existing as any).length > 0) {
              setError("El correo ya está en uso por otra cuenta.")
              return false
            }
          }

          const { error: updateError } = await supabase.from("employees").update(payload).eq("id", adminId)
          if (updateError) throw updateError
        }

        if (updates.businessName !== undefined) {
          const businessId = updates.businessId || admins.find((admin) => admin.id === adminId)?.businessId
          if (businessId) {
            const { error: businessError } = await supabase
              .from("saas_businesses")
              .update({ name: updates.businessName, updated_at: now })
              .eq("id", businessId)
            if (businessError) throw businessError
          }
        }

        if (updates.status) {
          const statusOk = await setAdminStatus(adminId, updates.status)
          return statusOk
        }

        await refresh()
        setError(null)
        return true
      } catch (err) {
        console.error("[BusinessContext] updateAdmin error:", err)
        const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase()
        if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("employees_email")) {
          setError("El correo ya está en uso por otra cuenta.")
          return false
        }
        setError("No se pudo actualizar el administrador.")
        return false
      }
    },
    [admins, canAccess, refresh, setAdminStatus],
  )

  const deleteAdmin = useCallback(
    async (adminId: string) => {
      if (!canAccess) return

      try {
        const supabase = createClient()
        const { error: deleteError } = await supabase.rpc("delete_admin_data", {
          p_admin_id: adminId,
        })

        if (deleteError) throw deleteError

        await refresh()
      } catch (err) {
        console.error("[BusinessContext] deleteAdmin error:", err)
        setError(
          `No se pudo eliminar el administrador. Ejecuta la migración 054-delete-admin-data.sql en Supabase. ${String((err as { message?: string })?.message ?? "")}`,
        )
      }
    },
    [canAccess, refresh, setAdminStatus],
  )

  const deleteBusiness = useCallback(
    async (businessId: string) => {
      if (!canAccess) return
      const business = businesses.find((item) => item.id === businessId)
      if (!business) return

      try {
        const supabase = createClient()
        const { error: deleteError } = await supabase.from("saas_businesses").delete().eq("id", businessId)
        if (deleteError) throw deleteError

        await supabase
          .from("employees")
          .update({ status: "inactive", updated_at: new Date().toISOString() })
          .eq("id", business.adminId)

        await refresh()
      } catch (err) {
        console.error("[BusinessContext] deleteBusiness error:", err)
        setError("No se pudo eliminar la empresa.")
      }
    },
    [businesses, canAccess, refresh],
  )

  const toggleBlockBusiness = useCallback(
    async (businessId: string) => {
      const business = businesses.find((item) => item.id === businessId)
      if (!business) return

      const nextSuspended = !(business.subscriptionSuspended ?? business.isBlocked)
      const nextStatus = normalizeBusinessStatus(business.status, nextSuspended, business.subscription)

      await updateBusiness(businessId, {
        subscriptionSuspended: nextSuspended,
        isBlocked: nextSuspended,
        openAccess: nextSuspended ? false : business.openAccess,
        status: nextStatus,
      })
    },
    [businesses, updateBusiness],
  )

  const setBusinessOpenAccess = useCallback(
    async (businessId: string, openAccess: boolean) => {
      const business = businesses.find((item) => item.id === businessId)
      if (!business || business.id.startsWith("pending-")) return

      await updateBusiness(businessId, {
        openAccess,
        subscriptionSuspended: openAccess ? false : business.subscriptionSuspended,
        isBlocked: openAccess ? false : business.isBlocked,
        status: openAccess ? "activo" : business.status,
      })
    },
    [businesses, updateBusiness],
  )

  const setBusinessWhatsappBotAccess = useCallback(
    async (businessId: string, whatsappBotAccess: boolean) => {
      const business = businesses.find((item) => item.id === businessId)
      if (!business || business.id.startsWith("pending-")) return

      await updateBusiness(businessId, { whatsappBotAccess })
    },
    [businesses, updateBusiness],
  )

  const value = useMemo<BusinessContextType>(
    () => ({
      loading,
      error,
      businesses,
      admins,
      employees,
      refresh,
      addBusiness,
      updateBusiness,
      deleteBusiness,
      toggleBlockBusiness,
      setBusinessOpenAccess,
      setBusinessWhatsappBotAccess,
      subscriptionPlans,
      updateSubscriptionPlan,
      addAdmin,
      updateAdmin,
      deleteAdmin,
      setAdminStatus,
    }),
    [
      loading,
      error,
      businesses,
      admins,
      employees,
      refresh,
      addBusiness,
      updateBusiness,
      deleteBusiness,
      toggleBlockBusiness,
      setBusinessOpenAccess,
      setBusinessWhatsappBotAccess,
      subscriptionPlans,
      updateSubscriptionPlan,
      addAdmin,
      updateAdmin,
      deleteAdmin,
      setAdminStatus,
    ],
  )

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusinessContext() {
  const context = useContext(BusinessContext)
  if (!context) {
    throw new Error("useBusinessContext must be used within a BusinessProvider")
  }
  return context
}
