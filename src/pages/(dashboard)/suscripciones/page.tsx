"use client"

import { useState } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import { Search, Lock, Unlock, CreditCard, Calendar, Building2, Check, Star, Pencil, Plus, Trash2, X, DollarSign, Percent, Clock, Gift, DoorOpen, MessageCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import type { SubscriptionPlan, Subscription, SubscriptionPlanConfig } from "@super_admin/lib/types"

const PLAN_COLORS = [
  { value: "from-slate-500 to-slate-600", label: "Gris" },
  { value: "from-blue-500 to-blue-600", label: "Azul" },
  { value: "from-violet-500 to-violet-600", label: "Violeta" },
  { value: "from-amber-500 to-amber-600", label: "Ambar" },
  { value: "from-emerald-500 to-emerald-600", label: "Esmeralda" },
  { value: "from-rose-500 to-rose-600", label: "Rosa" },
  { value: "from-cyan-500 to-cyan-600", label: "Cyan" },
  { value: "from-orange-500 to-orange-600", label: "Naranja" },
]

export default function SuscripcionesPage() {
  const { businesses, updateBusiness, toggleBlockBusiness, setBusinessOpenAccess, setBusinessWhatsappBotAccess, subscriptionPlans, updateSubscriptionPlan } = useBusinessContext()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<
    "todos" | "activo" | "vencido" | "sin_plan" | "suscripcion_suspendida" | "acceso_abierto"
  >("todos")
  const [savingOpenAccessId, setSavingOpenAccessId] = useState<string | null>(null)
  const [savingWhatsappBotId, setSavingWhatsappBotId] = useState<string | null>(null)
  const [editingSubscription, setEditingSubscription] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("mensual")
  
  // Plan management state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlanConfig | null>(null)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [newBenefit, setNewBenefit] = useState("")
  const [customDays, setCustomDays] = useState<number>(30)
  const [renewalGraceDays, setRenewalGraceDays] = useState<number>(5)
  const [editingGraceBusinessId, setEditingGraceBusinessId] = useState<string | null>(null)
  const [graceDraft, setGraceDraft] = useState<number>(5)

  const filteredBusinesses = businesses.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.location.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    switch (filterStatus) {
      case "activo":
        return b.subscription?.status === "activo"
      case "vencido":
        return b.subscription?.status === "vencido"
      case "sin_plan":
        return !b.subscription
      case "suscripcion_suspendida":
        return Boolean(b.subscriptionSuspended ?? b.isBlocked) && !b.openAccess
      case "acceso_abierto":
        return Boolean(b.openAccess)
      default:
        return true
    }
  })

  const assignSubscription = async (businessId: string) => {
    const plan = subscriptionPlans.find((p) => p.value === selectedPlan)!
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + customDays)

    const subscription: Subscription = {
      plan: selectedPlan,
      status: "activo",
      startDate,
      endDate,
      price: plan.price,
    }

    await updateBusiness(businessId, {
      subscription,
      renewalGraceDays,
      isBlocked: false,
      subscriptionSuspended: false,
      status: "activo",
    })
    setEditingSubscription(null)
    setCustomDays(30)
    setRenewalGraceDays(5)
  }

  const saveRenewalGraceDays = async (businessId: string) => {
    await updateBusiness(businessId, { renewalGraceDays: graceDraft })
    setEditingGraceBusinessId(null)
  }

  const removeSubscription = async (businessId: string) => {
    await updateBusiness(businessId, { subscription: undefined })
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const handleOpenAccess = async (businessId: string, enable: boolean) => {
    if (businessId.startsWith("pending-")) return
    setSavingOpenAccessId(businessId)
    try {
      await setBusinessOpenAccess(businessId, enable)
    } finally {
      setSavingOpenAccessId(null)
    }
  }

  const handleWhatsappBotAccess = async (businessId: string, enable: boolean) => {
    if (businessId.startsWith("pending-")) return
    setSavingWhatsappBotId(businessId)
    try {
      await setBusinessWhatsappBotAccess(businessId, enable)
    } finally {
      setSavingWhatsappBotId(null)
    }
  }

  const getStatusColor = (status?: string, subscriptionSuspended?: boolean, openAccess?: boolean) => {
    if (openAccess) return "bg-cyan-500/10 text-cyan-700 border-cyan-200"
    if (subscriptionSuspended) return "bg-amber-500/10 text-amber-700 border-amber-200"
    switch (status) {
      case "activo":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-200"
      case "vencido":
        return "bg-amber-500/10 text-amber-600 border-amber-200"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  // Plan management functions
  const openEditPlan = (plan: SubscriptionPlanConfig) => {
    setEditingPlan({ ...plan, benefits: [...plan.benefits] })
    setShowPlanModal(true)
  }

  const savePlan = async () => {
    if (!editingPlan) return
    const saved = await updateSubscriptionPlan(editingPlan)
    if (!saved) return
    setShowPlanModal(false)
    setEditingPlan(null)
  }

  const addBenefit = () => {
    if (!newBenefit.trim() || !editingPlan) return
    setEditingPlan({
      ...editingPlan,
      benefits: [...editingPlan.benefits, newBenefit.trim()]
    })
    setNewBenefit("")
  }

  const removeBenefit = (index: number) => {
    if (!editingPlan) return
    setEditingPlan({
      ...editingPlan,
      benefits: editingPlan.benefits.filter((_, i) => i !== index)
    })
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Suscripciones</h1>
        <p className="text-muted-foreground mt-1">
          Gestiona los planes y suscripciones de todas las empresas
        </p>
      </div>

      {/* Plans Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Planes Disponibles</h2>
          <p className="text-sm text-muted-foreground">Haz clic en el icono de editar para modificar un plan</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {subscriptionPlans.map((plan) => {
            const count = businesses.filter((b) => b.subscription?.plan === plan.value && b.subscription?.status === "activo").length
            const isPopular = plan.value === "anual"

            return (
              <div 
                key={plan.value} 
                className={`relative bg-card border rounded-2xl p-6 transition-all hover:shadow-xl hover:-translate-y-1 ${
                  isPopular ? "border-amber-500/50 shadow-lg shadow-amber-500/10" : "border-border"
                }`}
              >
                {/* Edit button */}
                <button
                  onClick={() => openEditPlan(plan)}
                  className="absolute top-3 right-3 p-2 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Editar plan"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold shadow-lg">
                      <Star className="h-3 w-3" />
                      Popular
                    </span>
                  </div>
                )}
                <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-br ${plan.color} text-white mb-4`}>
                  <CreditCard className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{plan.label}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-bold text-foreground">${plan.price.toFixed(0)}</span>
                  <span className="text-muted-foreground">/{plan.months === 1 ? "mes" : `${plan.months} meses`}</span>
                </div>
                {plan.discount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium mb-4">
                    Ahorra {plan.discount}%
                  </span>
                )}
                <ul className="space-y-2 mb-4">
                  {plan.benefits.slice(0, 3).map((benefit, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                  {plan.benefits.length > 3 && (
                    <li className="text-xs text-muted-foreground pl-6">
                      +{plan.benefits.length - 3} beneficios mas
                    </li>
                  )}
                </ul>
                <div className="pt-4 border-t border-border">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{count}</span> {count === 1 ? "empresa activa" : "empresas activas"}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar empresas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { value: "todos", label: "Todos" },
            { value: "activo", label: "Activos" },
            { value: "vencido", label: "Vencidos" },
            { value: "sin_plan", label: "Sin plan" },
            { value: "suscripcion_suspendida", label: "Suscripcion suspendida" },
            { value: "acceso_abierto", label: "Acceso abierto" },
          ] as const).map((status) => (
            <button
              key={status.value}
              onClick={() => setFilterStatus(status.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filterStatus === status.value
                  ? "bg-foreground text-background"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      {/* Business list */}
      {businesses.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto mb-4">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No hay empresas</h3>
          <p className="text-muted-foreground">
            Primero agrega empresas para poder gestionar sus suscripciones.
          </p>
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <p className="text-muted-foreground">No se encontraron empresas con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-4 font-semibold text-foreground">Empresa</th>
                  <th className="text-left p-4 font-semibold text-foreground">Plan</th>
                  <th className="text-left p-4 font-semibold text-foreground">Estado</th>
                  <th className="text-left p-4 font-semibold text-foreground">Vencimiento</th>
                  <th className="text-left p-4 font-semibold text-foreground">Plazo renovacion</th>
                  <th className="text-left p-4 font-semibold text-foreground">Precio</th>
                  <th className="text-center p-4 font-semibold text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <MessageCircle className="h-4 w-4" />
                      Bot WhatsApp
                    </span>
                  </th>
                  <th className="text-right p-4 font-semibold text-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredBusinesses.map((business) => (
                  <tr key={business.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        {business.logo ? (
                          <img
                            src={business.logo}
                            alt=""
                            className="h-11 w-11 rounded-xl object-cover border border-border"
                          />
                        ) : (
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                            <Building2 className="h-5 w-5 text-slate-500" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-foreground">{business.name}</p>
                          <p className="text-sm text-muted-foreground">{business.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {editingSubscription === business.id ? (
                        <div className="space-y-2">
                          <select
                            value={selectedPlan}
                            onChange={(e) => {
                              setSelectedPlan(e.target.value as SubscriptionPlan)
                              const plan = subscriptionPlans.find((p) => p.value === e.target.value)
                              if (plan) setCustomDays(plan.months * 30)
                            }}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            {subscriptionPlans.map((plan) => (
                              <option key={plan.value} value={plan.value}>
                                {plan.label} - ${plan.price}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <input
                              type="number"
                              min="1"
                              value={customDays}
                              onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
                              className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <span className="text-sm text-muted-foreground">dias</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <input
                              type="number"
                              min="0"
                              max="365"
                              value={renewalGraceDays}
                              onChange={(e) => setRenewalGraceDays(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            <span className="text-sm text-muted-foreground">dias gracia tras vencer</span>
                          </div>
                        </div>
                      ) : business.subscription ? (
                        <span className={`inline-flex px-3 py-1.5 rounded-xl text-sm font-medium capitalize ${
                          business.subscription.plan === "anual" ? "bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-600" :
                          business.subscription.plan === "semestral" ? "bg-violet-500/10 text-violet-600" :
                          business.subscription.plan === "trimestral" ? "bg-blue-500/10 text-blue-600" :
                          "bg-slate-500/10 text-slate-600"
                        }`}>
                          {business.subscription.plan}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin plan</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border ${getStatusColor(
                          business.subscription?.status,
                          business.subscriptionSuspended ?? business.isBlocked,
                          business.openAccess,
                        )}`}
                      >
                        {business.openAccess ? (
                          <DoorOpen className="h-3 w-3" />
                        ) : (business.subscriptionSuspended ?? business.isBlocked) ? (
                          <Lock className="h-3 w-3" />
                        ) : null}
                        {business.openAccess
                          ? "Acceso abierto"
                          : business.subscriptionSuspended ?? business.isBlocked
                            ? "Suscripcion suspendida"
                            : business.subscription?.status || "Sin plan"}
                      </span>
                    </td>
                    <td className="p-4">
                      {business.subscription?.endDate ? (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-foreground">{formatDate(business.subscription.endDate)}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      {editingGraceBusinessId === business.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="365"
                            value={graceDraft}
                            onChange={(e) => setGraceDraft(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm"
                          />
                          <button
                            onClick={() => saveRenewalGraceDays(business.id)}
                            className="text-xs text-emerald-600 font-medium hover:underline"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditingGraceBusinessId(null)}
                            className="text-xs text-muted-foreground hover:underline"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGraceBusinessId(business.id)
                            setGraceDraft(business.renewalGraceDays ?? 5)
                          }}
                          className="text-sm font-medium text-foreground hover:text-blue-600 transition-colors"
                          title="Dias de gracia despues del vencimiento"
                        >
                          {business.renewalGraceDays ?? 5} dias
                        </button>
                      )}
                    </td>
                    <td className="p-4">
                      {business.subscription?.price ? (
                        <span className="font-semibold text-foreground">${business.subscription.price.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col items-center gap-1">
                        <Checkbox
                          id={`whatsapp-bot-${business.id}`}
                          checked={Boolean(business.whatsappBotAccess)}
                          disabled={
                            savingWhatsappBotId === business.id || business.id.startsWith("pending-")
                          }
                          onCheckedChange={(checked) =>
                            handleWhatsappBotAccess(business.id, checked === true)
                          }
                          title="Funcion exclusiva del Plan Premium"
                        />
                        <label
                          htmlFor={`whatsapp-bot-${business.id}`}
                          className="text-xs text-muted-foreground text-center cursor-pointer select-none"
                        >
                          {business.whatsappBotAccess ? "Activo" : "Premium"}
                        </label>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        {editingSubscription === business.id ? (
                          <>
                            <button
                              onClick={() => assignSubscription(business.id)}
                              className="px-4 py-2 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 text-sm font-medium transition-colors"
                            >
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingSubscription(null)}
                              className="px-4 py-2 rounded-xl border border-border hover:bg-muted text-sm font-medium transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setSelectedPlan(business.subscription?.plan || "mensual")
                                const plan = subscriptionPlans.find((p) => p.value === (business.subscription?.plan || "mensual"))
                                setCustomDays(plan ? plan.months * 30 : 30)
                                setRenewalGraceDays(business.renewalGraceDays ?? 5)
                                setEditingSubscription(business.id)
                              }}
                              className="px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 text-sm font-medium transition-colors"
                            >
                              {business.subscription ? "Cambiar" : "Asignar"}
                            </button>
                            {business.subscription && (
                              <button
                                onClick={() => removeSubscription(business.id)}
                                className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium transition-colors"
                              >
                                Quitar
                              </button>
                            )}
                            {business.openAccess ? (
                              <button
                                type="button"
                                onClick={() => handleOpenAccess(business.id, false)}
                                disabled={savingOpenAccessId === business.id || business.id.startsWith("pending-")}
                                className="px-3 py-2 rounded-xl border border-cyan-200 text-cyan-700 hover:bg-cyan-50 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                                title="Quitar acceso abierto y volver a validar suscripcion"
                              >
                                Quitar acceso abierto
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenAccess(business.id, true)}
                                disabled={savingOpenAccessId === business.id || business.id.startsWith("pending-")}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-cyan-300 bg-cyan-500/10 text-cyan-800 hover:bg-cyan-500/20 text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
                                title="Permite usar el panel sin bloqueo por suscripcion vencida o sin plan"
                              >
                                <DoorOpen className="h-4 w-4 shrink-0" />
                                Marcar como acceso abierto
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleBlockBusiness(business.id)}
                              disabled={business.openAccess}
                              className={`p-2 rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                business.subscriptionSuspended ?? business.isBlocked
                                  ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                  : "border-amber-200 text-amber-700 hover:bg-amber-50"
                              }`}
                              title={
                                business.openAccess
                                  ? "Desactiva acceso abierto primero"
                                  : business.subscriptionSuspended ?? business.isBlocked
                                    ? "Reactivar suscripcion"
                                    : "Suspender suscripcion (permite login)"
                              }
                            >
                              {business.subscriptionSuspended ?? business.isBlocked ? (
                                <Unlock className="h-4 w-4" />
                              ) : (
                                <Lock className="h-4 w-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-gradient-to-r from-blue-500/5 to-violet-500/5 border border-blue-500/20 rounded-2xl p-6">
        <h3 className="font-semibold text-foreground mb-2">Suscripcion vs suspension de administrador</h3>
        <p className="text-sm text-muted-foreground">
          <strong>Acceso abierto</strong>: el tenant entra al panel sin importar si el plan vencio o no tiene
          suscripcion. <strong>Bot WhatsApp</strong>: marca el check para habilitar el bot de WhatsApp en esa
          empresa (funcion del Plan Premium). <strong>Suscripcion suspendida</strong>: puede iniciar sesion pero ve la pantalla de suscripcion
          vencida. <strong>Administrador suspendido</strong> (pagina Administradores): no puede iniciar sesion. El plazo
          de renovacion son los dias de gracia tras el vencimiento (por defecto 5).
        </p>
      </div>

      {/* Edit Plan Modal */}
      {showPlanModal && editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPlanModal(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-card border-b border-border p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground">Editar Plan: {editingPlan.label}</h2>
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Plan Name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Nombre del Plan
                </label>
                <input
                  type="text"
                  value={editingPlan.label}
                  onChange={(e) => setEditingPlan({ ...editingPlan, label: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Price and Months */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <DollarSign className="h-4 w-4 inline mr-1" />
                    Precio (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingPlan.price}
                    onChange={(e) => setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Duracion (meses)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editingPlan.months}
                    onChange={(e) => setEditingPlan({ ...editingPlan, months: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Discount */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Percent className="h-4 w-4 inline mr-1" />
                  Descuento (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingPlan.discount}
                  onChange={(e) => setEditingPlan({ ...editingPlan, discount: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Color del Plan
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {PLAN_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => setEditingPlan({ ...editingPlan, color: color.value })}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                        editingPlan.color === color.value
                          ? "border-blue-500 bg-blue-500/5"
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${color.value}`} />
                      <span className="text-xs text-muted-foreground">{color.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Benefits */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  <Gift className="h-4 w-4 inline mr-1" />
                  Beneficios
                </label>
                <div className="space-y-2 mb-3">
                  {editingPlan.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1 px-4 py-2 rounded-xl border border-border bg-muted/30 text-sm text-foreground">
                        {benefit}
                      </div>
                      <button
                        onClick={() => removeBenefit(index)}
                        className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Agregar beneficio..."
                    value={newBenefit}
                    onChange={(e) => setNewBenefit(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addBenefit()}
                    className="flex-1 px-4 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                  />
                  <button
                    onClick={addBenefit}
                    className="px-4 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="p-4 rounded-xl bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Vista previa</p>
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${editingPlan.color} flex items-center justify-center text-white`}>
                    <CreditCard className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{editingPlan.label}</p>
                    <p className="text-sm text-muted-foreground">
                      ${editingPlan.price.toFixed(2)} / {editingPlan.months === 1 ? "mes" : `${editingPlan.months} meses`}
                      {editingPlan.discount > 0 && (
                        <span className="ml-2 text-emerald-600">({editingPlan.discount}% descuento)</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-card border-t border-border p-6 rounded-b-2xl">
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-border hover:bg-muted text-foreground font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={savePlan}
                  className="flex-1 px-4 py-3 rounded-xl bg-blue-500 text-white hover:bg-blue-600 font-medium transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


