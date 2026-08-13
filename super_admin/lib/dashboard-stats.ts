import {
  computeSubscriptionStatus,
  mapAccessStateToPlanStatus,
} from "@/lib/subscription-status"
import type { Business } from "./types"

export type BusinessPlanStatus = "activo" | "por_vencer" | "vencido" | "bloqueado" | "sin_plan"

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

const planDivisors: Record<string, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
  gratis: 1,
}

export function getMonthlyPrice(business: Business): number {
  const sub = business.subscription
  if (!sub || sub.price <= 0) return 0
  const divisor = planDivisors[sub.plan] ?? 1
  return sub.price / divisor
}

export function getBusinessPlanStatus(business: Business): BusinessPlanStatus {
  if (business.openAccess) return "activo"
  if (!business.subscription) return "sin_plan"

  const endDate = business.subscription.endDate
    ? new Date(business.subscription.endDate)
    : null

  const computed = computeSubscriptionStatus({
    endDate,
    renewalGraceDays: business.renewalGraceDays ?? 5,
    subscriptionSuspended: Boolean(business.subscriptionSuspended ?? business.isBlocked),
    hasSubscription: Boolean(endDate),
    openAccess: Boolean(business.openAccess),
  })

  return mapAccessStateToPlanStatus(computed.accessState)
}

export function isBusinessAccountSuspended(business: Business): boolean {
  return business.status === "suspendido"
}

export type DashboardStats = {
  total: number
  activos: number
  suspendidos: number
  vencidos: number
  bloqueados: number
  sinPlan: number
  ingresosMensuales: number
  totalEmpleados: number
  nuevosEsteMes: number
}

export function computeDashboardStats(businesses: Business[]): DashboardStats {
  let activos = 0
  let suspendidos = 0
  let vencidos = 0
  let bloqueados = 0
  let sinPlan = 0
  let ingresosMensuales = 0
  let totalEmpleados = 0

  const now = new Date()

  businesses.forEach((business) => {
    totalEmpleados += Number(business.employeeCount ?? 0)

    if (isBusinessAccountSuspended(business)) {
      suspendidos += 1
      return
    }

    const planStatus = getBusinessPlanStatus(business)

    switch (planStatus) {
      case "activo":
      case "por_vencer":
        activos += 1
        ingresosMensuales += getMonthlyPrice(business)
        break
      case "vencido":
        vencidos += 1
        break
      case "bloqueado":
        bloqueados += 1
        break
      case "sin_plan":
        sinPlan += 1
        break
      default:
        break
    }
  })

  const nuevosEsteMes = businesses.filter((b) => {
    const created = new Date(b.createdAt)
    return (
      created.getMonth() === now.getMonth() &&
      created.getFullYear() === now.getFullYear()
    )
  }).length

  return {
    total: businesses.length,
    activos,
    suspendidos,
    vencidos: vencidos + bloqueados,
    bloqueados,
    sinPlan,
    ingresosMensuales,
    totalEmpleados,
    nuevosEsteMes,
  }
}

export type MonthlyDashboardPoint = {
  month: string
  monthIndex: number
  year: number
  ingresos: number
  empresas: number
}

/** Ingresos y empresas acumuladas por mes del año en curso (datos reales). */
export function buildMonthlyDashboardSeries(businesses: Business[]): MonthlyDashboardPoint[] {
  const year = new Date().getFullYear()

  return MONTH_LABELS.map((month, monthIndex) => {
    const monthStart = new Date(year, monthIndex, 1)
    const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)

    const empresasEnMes = businesses.filter((b) => {
      const created = new Date(b.createdAt)
      return created <= monthEnd
    }).length

    const ingresos = businesses.reduce((acc, b) => {
      if (isBusinessAccountSuspended(b)) return acc
      const planStatus = getBusinessPlanStatus(b)
      if (planStatus !== "activo" && planStatus !== "por_vencer") return acc

      const sub = b.subscription
      if (!sub) return acc

      const start = new Date(sub.startDate)
      const end = new Date(sub.endDate)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return acc

      const activeInMonth = start <= monthEnd && end >= monthStart
      return activeInMonth ? acc + getMonthlyPrice(b) : acc
    }, 0)

    return {
      month,
      monthIndex,
      year,
      ingresos: Math.round(ingresos),
      empresas: empresasEnMes,
    }
  })
}

export function buildPlanDistribution(businesses: Business[]) {
  return [
    {
      name: "Mensual",
      value: businesses.filter((b) => b.subscription?.plan === "mensual").length,
      color: "#64748b",
    },
    {
      name: "Trimestral",
      value: businesses.filter((b) => b.subscription?.plan === "trimestral").length,
      color: "#3b82f6",
    },
    {
      name: "Semestral",
      value: businesses.filter((b) => b.subscription?.plan === "semestral").length,
      color: "#8b5cf6",
    },
    {
      name: "Anual",
      value: businesses.filter((b) => b.subscription?.plan === "anual").length,
      color: "#f59e0b",
    },
    {
      name: "Sin plan",
      value: businesses.filter((b) => !b.subscription).length,
      color: "#ef4444",
    },
  ]
}

export function buildStatusDistribution(businesses: Business[]) {
  const stats = computeDashboardStats(businesses)
  return [
    { name: "Activos", value: stats.activos, color: "#10b981" },
    { name: "Suspendidos", value: stats.suspendidos, color: "#ef4444" },
    { name: "Vencidos", value: stats.vencidos, color: "#f59e0b" },
    { name: "Sin plan", value: stats.sinPlan, color: "#64748b" },
  ]
}
