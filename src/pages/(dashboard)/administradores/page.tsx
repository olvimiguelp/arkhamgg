"use client"

import React, { useEffect, useState } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import { createClient } from "@/lib/supabase/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Plus, Search, User, MoreHorizontal, Eye, Pencil, Lock, Unlock, Trash2, 
  Building2, Mail, Phone, Calendar, Shield, Clock, X, Check, Users, CreditCard, Sparkles, Save
} from "lucide-react"
import type { Admin, UserStatus, Subscription, SubscriptionPlan, Business } from "@super_admin/lib/types"
import { PERMISSIONS, SUBSCRIPTION_PLANS } from "@super_admin/lib/types"
import { TENANT_PAGE_PERMISSION_OPTIONS } from "@/lib/tenant-permissions"

const PROVINCIAS_RD = [
  "Azua",
  "Bahoruco",
  "Barahona",
  "Dajabon",
  "Distrito Nacional",
  "Duarte",
  "El Seibo",
  "Elias Pina",
  "Espaillat",
  "Hato Mayor",
  "Hermanas Mirabal",
  "Independencia",
  "La Altagracia",
  "La Romana",
  "La Vega",
  "Maria Trinidad Sanchez",
  "Monsenor Nouel",
  "Monte Cristi",
  "Monte Plata",
  "Pedernales",
  "Peravia",
  "Puerto Plata",
  "Samana",
  "San Cristobal",
  "San Jose de Ocoa",
  "San Juan",
  "San Pedro de Macoris",
  "Sanchez Ramirez",
  "Santiago",
  "Santiago Rodriguez",
  "Santo Domingo",
  "Valverde",
]

export default function AdministradoresPage() {
  const { admins, businesses, employees, updateAdmin, deleteAdmin, setAdminStatus, addAdmin, updateBusiness, error: contextError } = useBusinessContext()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"todos" | "activo" | "inactivo" | "suspendido">("todos")
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [viewingAdmin, setViewingAdmin] = useState<Admin | null>(null)
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState<{ admin: Admin; action: "activate" | "suspend" } | null>(null)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [catalogUrl, setCatalogUrl] = useState("")
  const [catalogUrlLoading, setCatalogUrlLoading] = useState(true)
  const [catalogUrlSaving, setCatalogUrlSaving] = useState(false)
  const [catalogUrlMessage, setCatalogUrlMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      const { data } = await createClient()
        .from("system_config")
        .select("value")
        .eq("key", "public_catalog_url")
        .maybeSingle()
      if (!mounted) return
      const value = data?.value
      setCatalogUrl(typeof value === "string" ? value : String((value as { url?: string } | null)?.url || ""))
      setCatalogUrlLoading(false)
    })()
    return () => { mounted = false }
  }, [])

  const saveCatalogUrl = async () => {
    const value = catalogUrl.trim()
    try {
      const parsed = new URL(value)
      if (parsed.protocol !== "https:") throw new Error("URL inválida")
      setCatalogUrlSaving(true)
      setCatalogUrlMessage(null)
      const { error } = await createClient().from("system_config").upsert({
        key: "public_catalog_url",
        value: { url: value.replace(/\/+$/, "") },
        description: "URL pública utilizada para compartir el catálogo desde Electron",
      }, { onConflict: "key" })
      if (error) throw error
      setCatalogUrl(value.replace(/\/+$/, ""))
      setCatalogUrlMessage("URL del catálogo guardada en la base de datos.")
    } catch (error) {
      setCatalogUrlMessage((error as Error).message === "URL inválida"
        ? "Introduce una URL válida que empiece por https://."
        : `No se pudo guardar la URL: ${(error as { message?: string })?.message || "error desconocido"}`)
    } finally {
      setCatalogUrlSaving(false)
    }
  }

  const filteredAdmins = admins.filter((admin) => {
    const matchesSearch =
      admin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.businessName.toLowerCase().includes(searchQuery.toLowerCase())

    if (!matchesSearch) return false

    if (filterStatus === "todos") return true
    return admin.status === filterStatus
  })

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const formatDateTime = (date?: Date) => {
    if (!date) return "Nunca"
    return new Date(date).toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getStatusLabel = (status: UserStatus) => {
    switch (status) {
      case "suspendido":
        return "Cuenta suspendida"
      case "inactivo":
        return "Inactivo"
      case "activo":
        return "Activo"
      default:
        return status
    }
  }

  const getStatusStyle = (status: UserStatus) => {
    switch (status) {
      case "activo":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-200"
      case "inactivo":
        return "bg-slate-500/10 text-slate-600 border-slate-200"
      case "suspendido":
        return "bg-red-500/10 text-red-600 border-red-200"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  const getEmployeeCount = (adminId: string) => {
    return employees.filter((e) => e.adminId === adminId).length
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Administradores</h1>
          <p className="text-muted-foreground mt-1">
            Suspender aqui bloquea el login (cuenta inactiva). La suspension por suscripcion se gestiona en Suscripciones.
            En Editar Administrador puedes habilitar o deshabilitar las nuevas paginas creadas, como Ventas por Mayor y Descuentos por Mayor.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 transition-all shadow-lg shadow-blue-500/25 font-medium text-sm"
        >
          <Plus className="h-4 w-4" />
          Nuevo Administrador
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <h2 className="font-semibold text-foreground">URL pública del catálogo</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Se guardará en Supabase y será utilizada automáticamente por la aplicación Electron al compartir catálogos.
            </p>
            <input
              type="url"
              value={catalogUrl}
              onChange={(event) => setCatalogUrl(event.target.value)}
              disabled={catalogUrlLoading || catalogUrlSaving}
              placeholder="https://arkhamgg.vercel.app"
              className="mt-3 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => void saveCatalogUrl()}
            disabled={catalogUrlLoading || catalogUrlSaving || !catalogUrl.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {catalogUrlSaving ? "Guardando..." : "Guardar URL"}
          </button>
        </div>
        {catalogUrlMessage && <p className="mt-3 text-sm text-muted-foreground">{catalogUrlMessage}</p>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">{admins.length}</p>
          <p className="text-sm text-muted-foreground">Total Admins</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-emerald-500">{admins.filter(a => a.status === "activo").length}</p>
          <p className="text-sm text-muted-foreground">Activos</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-slate-500">{admins.filter(a => a.status === "inactivo").length}</p>
          <p className="text-sm text-muted-foreground">Inactivos</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-red-500">{admins.filter(a => a.status === "suspendido").length}</p>
          <p className="text-sm text-muted-foreground">Cuenta suspendida</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o empresa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {(["todos", "activo", "inactivo", "suspendido"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                filterStatus === status
                  ? "bg-foreground text-background"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
              }`}
            >
              {status === "todos" ? "Todos" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filteredAdmins.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto mb-4">
            <User className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No hay administradores</h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery ? "No se encontraron administradores con esos criterios" : "Agrega tu primer administrador para comenzar"}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-4 font-semibold text-foreground">Administrador</th>
                  <th className="text-left p-4 font-semibold text-foreground">Empresa</th>
                  <th className="text-left p-4 font-semibold text-foreground">Empleados</th>
                  <th className="text-left p-4 font-semibold text-foreground">Ultimo acceso</th>
                  <th className="text-left p-4 font-semibold text-foreground">Estado</th>
                  <th className="text-right p-4 font-semibold text-foreground">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map((admin) => {
                  const business = businesses.find((b) => b.id === admin.businessId)
                  const employeeCount = getEmployeeCount(admin.id)

                  return (
                    <tr key={admin.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-4">
                          {admin.avatar ? (
                            <img
                              src={admin.avatar}
                              alt=""
                              className="h-11 w-11 rounded-xl object-cover border border-border"
                            />
                          ) : (
                            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-semibold">
                              {admin.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-foreground">{admin.name}</p>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[180px]">{admin.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {business?.logo ? (
                            <img src={business.logo} alt="" className="h-8 w-8 rounded-lg object-cover border border-border" />
                          ) : (
                            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center">
                              <Building2 className="h-4 w-4 text-slate-500" />
                            </div>
                          )}
                          <span className="text-foreground">{admin.businessName}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-foreground">{employeeCount}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{formatDateTime(admin.lastLogin)}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-sm font-medium border ${getStatusStyle(admin.status)}`}>
                          {admin.status === "suspendido" && <Lock className="h-3 w-3" />}
                          {getStatusLabel(admin.status)}
                        </span>
                      </td>
                      <td className="p-4">
                        <DropdownMenu open={openMenuId === admin.id} onOpenChange={(open) => setOpenMenuId(open ? admin.id : null)}>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 rounded-lg hover:bg-muted transition-colors">
                              <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => { setViewingAdmin(admin); setOpenMenuId(null) }}>
                              <Eye className="h-4 w-4" />
                              Ver detalles
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setEditingAdmin(admin); setOpenMenuId(null) }}>
                              <Pencil className="h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => { 
                                setShowStatusModal({ 
                                  admin, 
                                  action: admin.status === "suspendido" ? "activate" : "suspend" 
                                }); 
                                setOpenMenuId(null) 
                              }}
                              className={admin.status === "suspendido" ? "text-emerald-600" : "text-amber-600"}
                            >
                              {admin.status === "suspendido" ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                              {admin.status === "suspendido" ? "Activar cuenta" : "Suspender cuenta"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600 hover:bg-red-500/10 focus:text-red-600"
                              onClick={() => { deleteAdmin(admin.id); setOpenMenuId(null) }}
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View Admin Modal */}
      {viewingAdmin && (
        <ViewAdminModal 
          admin={viewingAdmin} 
          business={businesses.find((b) => b.id === viewingAdmin.businessId)}
          employeeCount={getEmployeeCount(viewingAdmin.id)}
          errorMessage={contextError}
          onClose={() => setViewingAdmin(null)}
          onUpdateSubscription={(subscription) => {
            const business = businesses.find((b) => b.id === viewingAdmin.businessId)
            if (business) {
              updateBusiness(business.id, { subscription })
            }
          }}
        />
      )}

      {/* Edit/Create Admin Modal */}
      {(showForm || editingAdmin) && (
        <AdminFormModal
            admin={editingAdmin}
            businesses={businesses}
            admins={admins}
            employees={employees}
            onSubmit={async (data) => {
              let success = false
              if (editingAdmin) {
                success = await updateAdmin(editingAdmin.id, data as any)
              } else {
                success = await addAdmin(data as any)
              }
              if (success) {
                setShowForm(false)
                setEditingAdmin(null)
              }
            }}
            onClose={() => {
              setShowForm(false)
              setEditingAdmin(null)
            }}
          />
      )}

      {/* Status Change Modal */}
      {showStatusModal && (
        <StatusModal
          admin={showStatusModal.admin}
          action={showStatusModal.action}
          loading={statusUpdating}
          errorMessage={contextError}
          onConfirm={async () => {
            setStatusUpdating(true)
            const ok = await setAdminStatus(
              showStatusModal.admin.id,
              showStatusModal.action === "activate" ? "activo" : "suspendido",
            )
            setStatusUpdating(false)
            if (ok) setShowStatusModal(null)
          }}
          onClose={() => {
            if (!statusUpdating) setShowStatusModal(null)
          }}
        />
      )}

      <div className="bg-gradient-to-r from-red-500/5 to-amber-500/5 border border-red-500/20 rounded-2xl p-6">
        <h3 className="font-semibold text-foreground mb-2">Diferencia con Suscripciones</h3>
        <p className="text-sm text-muted-foreground">
          Al <strong>suspender un administrador</strong>, el usuario no puede iniciar sesion y vera: &quot;La cuenta
          esta inactiva. Contacta al administrador para reactivarla.&quot; Los empleados de esa empresa tampoco entran.
          Para bloquear solo el acceso al panel por membresia (permitiendo login), use la pagina{" "}
          <strong>Suscripciones</strong>.
        </p>
      </div>
    </div>
  )
}

function ViewAdminModal({ 
  admin, 
  business,
  employeeCount,
  errorMessage,
  onClose,
  onUpdateSubscription
}: { 
  admin: Admin
  business?: Business
  employeeCount: number
  errorMessage?: string | null
  onClose: () => void
  onUpdateSubscription: (subscription: Subscription) => void
}) {
  const [showSubscriptionEditor, setShowSubscriptionEditor] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(business?.subscription?.plan || "gratis")
  const permissions = Array.isArray(admin.permissions) ? admin.permissions : []
  const adminName = admin.name || "Administrador"

  const formatDate = (date?: Date | string | null) => {
    const parsedDate = date ? new Date(date) : null
    if (!parsedDate || Number.isNaN(parsedDate.getTime())) return "No disponible"
    return parsedDate.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatPrice = (value: unknown) => {
    const price = Number(value)
    return Number.isFinite(price) ? price.toFixed(2) : "0.00"
  }

  const handleSaveSubscription = () => {
    const planData = SUBSCRIPTION_PLANS.find(p => p.value === selectedPlan)
    if (planData) {
      const startDate = new Date()
      const endDate = new Date()
      endDate.setMonth(endDate.getMonth() + planData.months)
      
      const newSubscription = {
        plan: selectedPlan,
        status: "activo" as const,
        startDate,
        endDate,
        price: planData.price
      }
      onUpdateSubscription(newSubscription)
      setShowSubscriptionEditor(false)
    }
  }

  const currentPlanData = business?.subscription 
    ? SUBSCRIPTION_PLANS.find(p => p.value === business.subscription?.plan)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-4">
            {admin.avatar ? (
              <img src={admin.avatar} alt="" className="h-16 w-16 rounded-xl object-cover border border-border" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl">
                {adminName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-foreground">{adminName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Shield className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Administrador</span>
              </div>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium text-foreground">{admin.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Telefono</p>
              <p className="font-medium text-foreground">{admin.phone}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estado</p>
              <span className={`inline-flex px-2 py-0.5 rounded-lg text-sm font-medium capitalize ${
                admin.status === "activo" ? "bg-emerald-500/10 text-emerald-600" :
                admin.status === "suspendido" ? "bg-red-500/10 text-red-600" :
                "bg-slate-500/10 text-slate-600"
              }`}>
                {admin.status}
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Fecha de registro</p>
              <p className="font-medium text-foreground">{formatDate(admin.createdAt)}</p>
            </div>
          </div>
          
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">Empresa asignada</p>
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              {business?.logo ? (
                <img src={business.logo} alt="" className="h-10 w-10 rounded-lg object-cover border border-border" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-slate-500" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-foreground">{admin.businessName}</p>
                <p className="text-sm text-muted-foreground">{employeeCount} empleados</p>
              </div>
              {business?.subscription && (
                <span className="px-2 py-1 bg-blue-500/10 text-blue-600 text-xs font-medium rounded-lg capitalize">
                  {business.subscription.plan}
                </span>
              )}
            </div>
          </div>

          {/* Subscription Section */}
          <div className="pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Suscripcion</p>
              </div>
              <button
                onClick={() => setShowSubscriptionEditor(!showSubscriptionEditor)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {showSubscriptionEditor ? "Cancelar" : business?.subscription ? "Cambiar plan" : "Asignar plan"}
              </button>
            </div>

            {!showSubscriptionEditor && business?.subscription ? (
              <div className={`p-4 rounded-xl bg-gradient-to-r ${currentPlanData?.color || "from-slate-500 to-slate-600"} text-white`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-lg capitalize">{business.subscription.plan}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    business.subscription.status === "activo" 
                      ? "bg-white/20 text-white" 
                      : "bg-red-500/80 text-white"
                  }`}>
                    {business.subscription.status}
                  </span>
                </div>
                <div className="text-sm text-white/80 space-y-1">
                  <p>Precio: ${formatPrice(business.subscription.price)}</p>
                  <p>Vence: {formatDate(business.subscription.endDate)}</p>
                </div>
              </div>
            ) : !showSubscriptionEditor ? (
              <div className="p-4 rounded-xl border-2 border-dashed border-border text-center">
                <CreditCard className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sin suscripcion activa</p>
                <button
                  onClick={() => setShowSubscriptionEditor(true)}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Asignar suscripcion
                </button>
              </div>
            ) : null}

            {showSubscriptionEditor && (
              <div className="space-y-3">
                {/* Show free plan option prominently if no subscription */}
                {!business?.subscription && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-2">
                    <p className="text-sm font-medium text-emerald-700">Primera suscripcion gratis por 1 mes</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {SUBSCRIPTION_PLANS.map((plan) => (
                    <button
                      key={plan.value}
                      onClick={() => setSelectedPlan(plan.value)}
                      className={`relative p-3 rounded-xl border-2 transition-all text-left ${
                        selectedPlan === plan.value
                          ? plan.isFree ? "border-emerald-500 bg-emerald-50" : "border-blue-500 bg-blue-50"
                          : "border-border hover:border-blue-200"
                      }`}
                    >
                      {plan.isFree ? (
                        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full">
                          GRATIS
                        </span>
                      ) : plan.discount > 0 && (
                        <span className="absolute -top-2 -right-2 px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full">
                          -{plan.discount}%
                        </span>
                      )}
                      <p className={`font-semibold text-sm ${
                        selectedPlan === plan.value 
                          ? plan.isFree ? "text-emerald-600" : "text-blue-600" 
                          : "text-foreground"
                      }`}>
                        {plan.label}
                      </p>
                      <p className={`text-xs ${
                        selectedPlan === plan.value 
                          ? plan.isFree ? "text-emerald-500" : "text-blue-500" 
                          : "text-muted-foreground"
                      }`}>
                        {plan.isFree ? "Sin costo" : `$${plan.price.toFixed(2)}`}
                      </p>
                    </button>
                  ))}
                </div>
                
                {/* Selected plan benefits */}
                {selectedPlan && (
                  <div className="p-3 bg-muted/50 rounded-xl">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Beneficios incluidos:</p>
                    <ul className="space-y-1">
                      {SUBSCRIPTION_PLANS.find(p => p.value === selectedPlan)?.benefits.map((benefit, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-foreground">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={handleSaveSubscription}
                  className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 transition-all font-medium text-sm"
                >
                  Guardar suscripcion
                </button>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-3">Permisos ({permissions.length})</p>
            {errorMessage && <div className="text-sm text-red-500 mb-2">{errorMessage}</div>}
            <div className="flex flex-wrap gap-2">
              {permissions.slice(0, 6).map((perm) => {
                const permission =
                  TENANT_PAGE_PERMISSION_OPTIONS.find((p) => p.superKey === perm) ??
                  PERMISSIONS.find((p) => p.value === perm)
                return (
                  <span key={perm} className="px-2 py-1 bg-muted text-muted-foreground text-xs rounded-lg">
                    {permission?.label || perm}
                  </span>
                )
              })}
              {permissions.length > 6 && (
                <span className="px-2 py-1 bg-blue-500/10 text-blue-600 text-xs rounded-lg">
                  +{permissions.length - 6} mas
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-border">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-foreground text-background hover:bg-foreground/90 transition-colors font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminFormModal({
  admin,
  businesses,
  admins,
  employees,
  onSubmit,
  onClose,
}: {
  admin: Admin | null
  businesses: { id: string; name: string }[]
  admins: Admin[]
  employees: { id: string; email: string }[]
  onSubmit: (data: Partial<Admin> & { password?: string }) => Promise<void> | Promise<boolean>
  onClose: () => void
}) {
  const [businessName, setBusinessName] = useState(admin?.businessName || "")
  const [name, setName] = useState(admin?.name || "")
  const [provincia, setProvincia] = useState(admin?.provincia || "")
  const [phone, setPhone] = useState(admin?.phone || "")
  const [email, setEmail] = useState(admin?.email || "")
  const [address, setAddress] = useState(admin?.address || "")
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(() =>
    admin?.permissions?.length
      ? admin.permissions
      : TENANT_PAGE_PERMISSION_OPTIONS.map((option) => option.superKey),
  )
  const { error: contextError } = useBusinessContext()

  const permissionsByCategory = TENANT_PAGE_PERMISSION_OPTIONS.reduce(
    (groups, option) => {
      if (!groups[option.category]) groups[option.category] = []
      groups[option.category].push(option)
      return groups
    },
    {} as Record<string, typeof TENANT_PAGE_PERMISSION_OPTIONS>,
  )

  const togglePermission = (superKey: string, enabled: boolean) => {
    setSelectedPermissions((current) => {
      if (enabled) return current.includes(superKey) ? current : [...current, superKey]
      return current.filter((key) => key !== superKey)
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Validaciones cliente
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setEmailError("El email es obligatorio")
      return
    }
    const duplicate = [...(admins || []), ...(employees || [])].some((u) => u.email === trimmedEmail && u.email !== admin?.email)
    if (duplicate) {
      setEmailError("El correo ya está en uso por otra cuenta.")
      return
    }
    if (!admin && (!password || password.trim().length === 0)) {
      setPasswordError("La contraseña es requerida")
      setEmailError(null)
      return
    }
    if (selectedPermissions.length === 0) {
      setPermissionsError("Seleccione al menos una pagina habilitada para el administrador.")
      return
    }
    setPermissionsError(null)

    onSubmit({
      name,
      email,
      phone,
      provincia,
      address,
      password: password.trim() || undefined,
      businessId: admin?.businessId || `business-${Date.now()}`,
      businessName,
      permissions: selectedPermissions,
      role: "admin",
      ...(!admin ? { status: "activo" as const } : {}),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">
            {admin ? "Editar Administrador" : "Nuevo Administrador"}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nombre de la empresa <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              placeholder="Ej: Mi Empresa S.A."
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Nombre del administrador <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Nombre completo del administrador"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Provincia</label>
              <select
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">Seleccionar provincia</option>
                {PROVINCIAS_RD.map((prov) => (
                  <option key={prov} value={prov}>{prov}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Telefono</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: +1 809 123-4567"
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="email@ejemplo.com"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Contraseña {admin ? "(solo si desea cambiarla)" : "*"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={admin ? "Dejar vacío para mantener la actual" : "Ingrese una contraseña"}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              required={!admin}
            />
              {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Direccion del administrador
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, numero, ciudad"
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div className="rounded-xl border border-border p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Paginas habilitadas</p>
              <p className="text-xs text-muted-foreground mt-1">
                Desactive las secciones que este administrador no debe ver en su panel. La suspension de cuenta
                (login) se gestiona con &quot;Suspender cuenta&quot;, no aqui. Habilite o deshabilite las nuevas paginas
                Ventas por Mayor y Descuentos por Mayor desde aqui.
              </p>
            </div>
            {permissionsError && <p className="text-xs text-red-500">{permissionsError}</p>}
            {Object.entries(permissionsByCategory).map(([category, options]) => (
              <div key={category}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  {category}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {options.map((option) => (
                    <label
                      key={option.superKey}
                      className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 cursor-pointer hover:bg-muted/40"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(option.superKey)}
                        onChange={(e) => togglePermission(option.superKey, e.target.checked)}
                        className="rounded border-border"
                      />
                      <span className="text-sm text-foreground">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-700 hover:to-violet-700 transition-all font-medium"
            >
              {admin ? "Guardar cambios" : "Crear administrador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StatusModal({
  admin,
  action,
  loading,
  errorMessage,
  onConfirm,
  onClose,
}: {
  admin: Admin
  action: "activate" | "suspend"
  loading?: boolean
  errorMessage?: string | null
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const isSuspending = action === "suspend"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl">
        <div className="p-6">
          <div className={`flex h-14 w-14 items-center justify-center rounded-2xl mx-auto mb-4 ${
            isSuspending ? "bg-red-500/10" : "bg-emerald-500/10"
          }`}>
            {isSuspending ? (
              <Lock className="h-7 w-7 text-red-500" />
            ) : (
              <Unlock className="h-7 w-7 text-emerald-500" />
            )}
          </div>
          <h2 className="text-xl font-bold text-foreground text-center mb-2">
            {isSuspending ? "Suspender cuenta de administrador" : "Activar cuenta de administrador"}
          </h2>
          <p className="text-muted-foreground text-center mb-6">
            {isSuspending
              ? `Al suspender a "${admin.name}", no podra iniciar sesion. En el login vera: "La cuenta esta inactiva. Contacta al administrador para reactivarla."`
              : `Al activar a "${admin.name}", podra iniciar sesion de nuevo. Si la suscripcion sigue vencida, vera la pantalla de suscripcion al entrar.`
            }
          </p>
          {isSuspending && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-red-700">
                <strong>No es suspension de suscripcion:</strong> esto desactiva la cuenta en employees. Los empleados
                del tenant tampoco podran iniciar sesion. Para bloquear solo por membresia, use Suscripciones.
              </p>
            </div>
          )}
          {errorMessage && (
            <p className="text-sm text-red-500 text-center mb-4">{errorMessage}</p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={loading}
              className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50 ${
                isSuspending
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-emerald-500 text-white hover:bg-emerald-600"
              }`}
            >
              {loading ? "Guardando..." : isSuspending ? "Suspender" : "Activar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
