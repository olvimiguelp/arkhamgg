"use client"

import React, { useMemo } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import {
  buildMonthlyDashboardSeries,
  buildPlanDistribution,
  computeDashboardStats,
  getBusinessPlanStatus,
  isBusinessAccountSuspended,
} from "@super_admin/lib/dashboard-stats"
import {
  Building2,
  CreditCard,
  AlertTriangle,
  TrendingUp,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
} from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts"

export default function DashboardPage() {
  const { businesses, loading, error, refresh } = useBusinessContext()

  const stats = useMemo(() => computeDashboardStats(businesses), [businesses])
  const revenueData = useMemo(() => buildMonthlyDashboardSeries(businesses), [businesses])
  const planDistribution = useMemo(() => buildPlanDistribution(businesses), [businesses])

  const activityData = useMemo(() => {
    return businesses
      .map((b) => {
        let actionState = "Nueva empresa registrada"
        let actType: "new" | "renewal" | "blocked" | "upgrade" = "new"

        if (isBusinessAccountSuspended(b)) {
          actionState = "Cuenta suspendida"
          actType = "blocked"
        } else {
          const planStatus = getBusinessPlanStatus(b)
          if (planStatus === "vencido" || planStatus === "bloqueado") {
            actionState = "Suscripcion vencida o bloqueada"
            actType = "blocked"
          } else if (planStatus === "por_vencer") {
            actionState = "Suscripcion por vencer"
            actType = "renewal"
          } else if (b.subscription) {
            actionState = `Plan activo: ${b.subscription.plan.toUpperCase()}`
            actType = "renewal"
          } else {
            actionState = "Sin plan de suscripcion"
            actType = "new"
          }
        }

        const timeDiff = Date.now() - new Date(b.createdAt).getTime()
        const hours = Math.floor(timeDiff / (1000 * 60 * 60))
        const days = Math.floor(hours / 24)
        let timeString = "Recientemente"
        if (days > 0) {
          timeString = `Hace ${days} ${days === 1 ? "dia" : "dias"}`
        } else if (hours > 0) {
          timeString = `Hace ${hours} ${hours === 1 ? "hora" : "horas"}`
        }

        return {
          action: actionState,
          company: b.name,
          time: timeString,
          type: actType,
        }
      })
      .reverse()
      .slice(0, 5)
  }, [businesses])

  const revenueTrend = useMemo(() => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const current = revenueData[currentMonth]?.ingresos ?? 0
    const previous = currentMonth > 0 ? revenueData[currentMonth - 1]?.ingresos ?? 0 : 0
    if (previous === 0) {
      return { label: current > 0 ? "Mes actual" : "Sin datos", up: current >= previous }
    }
    const pct = ((current - previous) / previous) * 100
    return {
      label: `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`,
      up: pct >= 0,
    }
  }, [revenueData])

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <RefreshCcw className="h-4 w-4 animate-spin" />
          Cargando metricas del panel...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Panel de Super Administrador con datos en vivo</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <StatCard title="Total Empresas" value={stats.total} icon={Building2} color="blue" />
        <StatCard title="Empresas Activas" value={stats.activos} icon={CreditCard} color="emerald" />
        <StatCard title="Suspendidas" value={stats.suspendidos} icon={AlertTriangle} color="red" />
        <StatCard title="Vencidas" value={stats.vencidos} icon={Clock} color="amber" />
        <StatCard
          title="Ingresos Mensuales"
          value={`$${stats.ingresosMensuales.toLocaleString("es-DO", { maximumFractionDigits: 0 })}`}
          icon={TrendingUp}
          color="violet"
        />
        <StatCard title="Total Empleados" value={stats.totalEmpleados} icon={Users} color="slate" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Ingresos Mensuales</h3>
              <p className="text-sm text-muted-foreground">Suscripciones activas por mes ({new Date().getFullYear()})</p>
            </div>
            <div
              className={`flex items-center gap-2 text-sm font-medium ${
                revenueTrend.up ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {revenueTrend.up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              <span>{revenueTrend.label}</span>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickFormatter={(v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                  formatter={(value: number) => [`$${Number(value).toLocaleString()}`, "Ingresos"]}
                />
                <Area
                  type="monotone"
                  dataKey="ingresos"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorIngresos)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-6">Distribucion de Planes</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planDistribution} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {planDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {planDistribution.map((plan) => (
              <div key={plan.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: plan.color }} />
                  <span className="text-muted-foreground">{plan.name}</span>
                </div>
                <span className="font-medium text-foreground">{plan.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-6">Actividad Reciente</h3>
          <div className="space-y-4">
            {activityData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay empresas registradas. Crea un administrador para comenzar.
              </div>
            ) : (
              activityData.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 pb-4 border-b border-border last:border-0 last:pb-0"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      activity.type === "new"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : activity.type === "renewal"
                          ? "bg-blue-500/10 text-blue-500"
                          : activity.type === "blocked"
                            ? "bg-red-500/10 text-red-500"
                            : "bg-violet-500/10 text-violet-500"
                    }`}
                  >
                    {activity.type === "new" && <Building2 className="h-5 w-5" />}
                    {activity.type === "renewal" && <CreditCard className="h-5 w-5" />}
                    {activity.type === "blocked" && <AlertTriangle className="h-5 w-5" />}
                    {activity.type === "upgrade" && <TrendingUp className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{activity.action}</p>
                    <p className="text-sm text-muted-foreground truncate">{activity.company}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{activity.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-foreground">Empresas Recientes</h3>
            <span className="text-xs text-muted-foreground">Ultimas 5</span>
          </div>
          <div className="space-y-4">
            {businesses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay empresas en el sistema.
              </div>
            ) : (
              businesses.slice(0, 5).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                >
                  {b.logo ? (
                    <img
                      src={b.logo}
                      alt=""
                      className="h-11 w-11 rounded-xl object-cover border border-border"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{b.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {b.adminName} - {b.location || "Sin ubicacion"}
                    </p>
                  </div>
                  <StatusBadge business={b} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  color: "blue" | "emerald" | "red" | "amber" | "violet" | "slate"
}) {
  const colorStyles = {
    blue: "bg-blue-500/10 text-blue-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    red: "bg-red-500/10 text-red-500",
    amber: "bg-amber-500/10 text-amber-500",
    violet: "bg-violet-500/10 text-violet-500",
    slate: "bg-slate-500/10 text-slate-500",
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorStyles[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
    </div>
  )
}

function StatusBadge({ business }: { business: import("@super_admin/lib/types").Business }) {
  if (isBusinessAccountSuspended(business)) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium">
        Suspendido
      </span>
    )
  }

  const planStatus = getBusinessPlanStatus(business)
  const styles: Record<string, string> = {
    activo: "bg-emerald-500/10 text-emerald-500",
    por_vencer: "bg-amber-500/10 text-amber-500",
    vencido: "bg-amber-500/10 text-amber-600",
    bloqueado: "bg-red-500/10 text-red-500",
    sin_plan: "bg-muted text-muted-foreground",
  }

  const labels: Record<string, string> = {
    activo: "Activo",
    por_vencer: "Por vencer",
    vencido: "Vencido",
    bloqueado: "Bloqueado",
    sin_plan: "Sin plan",
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
        styles[planStatus] || styles.sin_plan
      }`}
    >
      {labels[planStatus] || planStatus}
    </span>
  )
}
