"use client"

import { useMemo } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import {
  buildMonthlyDashboardSeries,
  buildPlanDistribution,
  buildStatusDistribution,
  computeDashboardStats,
  getMonthlyPrice,
} from "@super_admin/lib/dashboard-stats"
import { Building2, Users, CreditCard, DollarSign, RefreshCcw } from "lucide-react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts"

const COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#64748b", "#ef4444"]

export default function ReportesPage() {
  const { businesses, loading, error, refresh } = useBusinessContext()

  const stats = useMemo(() => computeDashboardStats(businesses), [businesses])
  const monthlyData = useMemo(() => buildMonthlyDashboardSeries(businesses), [businesses])
  const planData = useMemo(() => buildPlanDistribution(businesses), [businesses])
  const statusData = useMemo(() => buildStatusDistribution(businesses), [businesses])

  const totalIngresosAnual = useMemo(
    () => monthlyData.reduce((acc, row) => acc + row.ingresos, 0),
    [monthlyData],
  )

  const topLocations = useMemo(() => {
    const locations = Array.from(
      new Set(businesses.map((b) => (b.location?.trim() || "Sin ubicacion"))),
    )
    return locations
      .map((location) => ({
        location,
        count: businesses.filter(
          (b) => (b.location?.trim() || "Sin ubicacion") === location,
        ).length,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [businesses])

  const suscripcionesActivas = useMemo(
    () =>
      businesses.filter((b) => {
        const price = getMonthlyPrice(b)
        return price > 0
      }).length,
    [businesses],
  )

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          <RefreshCcw className="h-4 w-4 animate-spin" />
          Cargando reportes...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reportes</h1>
          <p className="text-muted-foreground mt-1">Metricas reales del sistema SaaS</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" />
          Actualizar datos
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total empresas</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                ${totalIngresosAnual.toLocaleString("es-DO", { maximumFractionDigits: 0 })}
              </p>
              <p className="text-sm text-muted-foreground">Ingresos {new Date().getFullYear()} (est.)</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.totalEmpleados}</p>
              <p className="text-sm text-muted-foreground">Total empleados</p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{suscripcionesActivas}</p>
              <p className="text-sm text-muted-foreground">Con plan facturable</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Crecimiento Anual</h3>
              <p className="text-sm text-muted-foreground">
                Empresas registradas e ingresos por mes ({new Date().getFullYear()})
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-muted-foreground">Empresas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Ingresos</span>
              </div>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData}>
                <defs>
                  <linearGradient id="colorEmpresas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorIngresos2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
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
                  formatter={(value: number, name: string) => [
                    name === "ingresos"
                      ? `$${Number(value).toLocaleString()}`
                      : String(value),
                    name === "ingresos" ? "Ingresos" : "Empresas",
                  ]}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="empresas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorEmpresas)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="ingresos"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorIngresos2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-6">Distribucion de Planes</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {planData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {planData.map((plan, index) => (
              <div key={plan.name} className="flex items-center gap-2 text-sm">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-muted-foreground">{plan.name}</span>
                <span className="font-medium text-foreground ml-auto">{plan.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-6">Estado de Empresas</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-6">Top Ubicaciones</h3>
          <div className="space-y-4">
            {topLocations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin ubicaciones registradas</p>
            ) : (
              topLocations.map((item) => {
                const percentage =
                  stats.total > 0 ? (item.count / stats.total) * 100 : 0
                return (
                  <div key={item.location}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{item.location}</span>
                      <span className="text-sm text-muted-foreground">{item.count} empresas</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
