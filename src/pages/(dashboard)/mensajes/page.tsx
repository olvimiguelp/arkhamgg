"use client"

import { useCallback, useEffect, useState } from "react"
import { useBusinessContext } from "@super_admin/lib/business-context"
import { useStore } from "@/components/store-context"
import {
  deleteAdminSubscriptionMessage,
  fetchAdminSubscriptionMessages,
  sendAdminSubscriptionMessage,
  type AdminMessageType,
  type AdminSubscriptionMessage,
} from "@/lib/admin-subscription-messages"
import { getAppVersion, isValidVersionInput } from "@/lib/app-version"
import { openExternalLink, renderTextWithLinks } from "@/lib/message-links"
import {
  computeSubscriptionStatus,
  mapAccessStateToPlanStatus,
} from "@/lib/subscription-status"
import type { Business } from "@super_admin/lib/types"
import { 
  Send, 
  Bell, 
  Clock, 
  AlertTriangle, 
  Ban, 
  Calendar,
  Building2,
  CreditCard,
  Search,
  CheckCircle,
  XCircle,
  RefreshCw,
  Users,
  Globe,
  User,
  Mail,
  Download,
  Package,
  ExternalLink,
  Trash2,
} from "lucide-react"
import type { Admin } from "@super_admin/lib/types"

interface AdminNotification {
  id: string
  name: string
  email: string
  businessName: string
  openAccess: boolean
  planStatus: "activo" | "por_vencer" | "vencido" | "bloqueado"
  daysRemaining: number
  renewalDeadline: number
  cancellationDate: Date | null
  blockDate: Date | null
}

function getAdminNotifications(admins: Admin[], businesses: Business[]): AdminNotification[] {
  return admins.map((admin) => {
    const business = businesses.find((b) => b.id === admin.businessId)
    const endDate = business?.subscription?.endDate
      ? new Date(business.subscription.endDate)
      : null

    const computed = computeSubscriptionStatus({
      endDate,
      renewalGraceDays: business?.renewalGraceDays ?? 5,
      subscriptionSuspended: Boolean(business?.subscriptionSuspended ?? business?.isBlocked),
      hasSubscription: Boolean(business?.subscription && endDate),
      openAccess: Boolean(business?.openAccess),
    })

    const planStatus = mapAccessStateToPlanStatus(computed.accessState)
    const daysRemaining =
      computed.accessState === "en_gracia" || computed.accessState === "bloqueado_suscripcion"
        ? computed.daysSinceExpiry
        : computed.daysUntilExpiry

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      businessName: admin.businessName,
      openAccess: Boolean(business?.openAccess),
      planStatus,
      daysRemaining,
      renewalDeadline: computed.graceDaysRemaining,
      cancellationDate: computed.graceEndDate,
      blockDate:
        computed.graceEndDate && computed.accessState === "en_gracia"
          ? computed.graceEndDate
          : null,
    }
  })
}

function StatusBadge({ status }: { status: AdminNotification["planStatus"] }) {
  const config = {
    activo: { 
      bg: "bg-emerald-500/10", 
      text: "text-emerald-400", 
      border: "border-emerald-500/20",
      icon: CheckCircle,
      label: "Activo" 
    },
    por_vencer: { 
      bg: "bg-amber-500/10", 
      text: "text-amber-400", 
      border: "border-amber-500/20",
      icon: Clock,
      label: "Por Vencer" 
    },
    vencido: { 
      bg: "bg-red-500/10", 
      text: "text-red-400", 
      border: "border-red-500/20",
      icon: XCircle,
      label: "Vencido" 
    },
    bloqueado: { 
      bg: "bg-slate-500/10", 
      text: "text-slate-400", 
      border: "border-slate-500/20",
      icon: Ban,
      label: "Bloqueado" 
    },
  }

  const { bg, text, border, icon: Icon, label } = config[status]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text} border ${border}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  )
}

export default function MensajesPage() {
  const { admins, businesses } = useBusinessContext()
  const { currentUser } = useStore()
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<"todos" | "activo" | "por_vencer" | "vencido" | "bloqueado">("todos")
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([])
  const [messageContent, setMessageContent] = useState("")
  const [messageType, setMessageType] = useState<AdminMessageType>("general")
  const [targetVersion, setTargetVersion] = useState("")
  const [downloadUrl, setDownloadUrl] = useState("")
  const [sentMessages, setSentMessages] = useState<AdminSubscriptionMessage[]>([])
  const [sendScope, setSendScope] = useState<"general" | "especificos">("general")
  const [sending, setSending] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    if (messageType === "actualizacion") {
      setSendScope("especificos")
    }
  }, [messageType])

  const loadMessageHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const rows = await fetchAdminSubscriptionMessages(100)
      setSentMessages(rows)
    } catch (err) {
      console.error("[Mensajes] load history:", err)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  useEffect(() => {
    loadMessageHistory()
  }, [loadMessageHistory])

  const adminNotifications = getAdminNotifications(admins, businesses)
  const openAccessAdminIds = adminNotifications
    .filter((admin) => admin.openAccess)
    .map((admin) => admin.id)

  const filteredAdmins = adminNotifications.filter((admin) => {
    const matchesSearch = admin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.businessName.toLowerCase().includes(searchQuery.toLowerCase())
    
    if (!matchesSearch) return false

    if (filterStatus === "todos") return true
    return admin.planStatus === filterStatus
  })

  const handleSelectAll = () => {
    if (selectedAdmins.length === filteredAdmins.length) {
      setSelectedAdmins([])
    } else {
      setSelectedAdmins(filteredAdmins.map((a) => a.id))
    }
  }

  const handleSelectAdmin = (id: string) => {
    setSelectedAdmins((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (deletingMessageId) return
    if (!window.confirm("¿Desea eliminar este mensaje enviado?")) return

    setDeletingMessageId(messageId)
    setSendError(null)

    try {
      await deleteAdminSubscriptionMessage(messageId)
      setSentMessages((prev) => prev.filter((msg) => msg.id !== messageId))
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "No se pudo eliminar el mensaje enviado.",
      )
    } finally {
      setDeletingMessageId(null)
    }
  }

  const handleSendMessage = async () => {
    if (sending) return
    if (messageType !== "actualizacion" && !messageContent.trim()) return

    if (messageType === "actualizacion") {
      if (!targetVersion.trim() || !isValidVersionInput(targetVersion)) {
        setSendError("Indique una version valida (ej: 1.1.2).")
        return
      }
      if (!downloadUrl.trim()) {
        setSendError("Indique el enlace de descarga de la actualizacion.")
        return
      }
    }

    const recipients =
      messageType === "actualizacion"
        ? sendScope === "general"
          ? openAccessAdminIds
          : selectedAdmins
        : sendScope === "general"
          ? adminNotifications.map((a) => a.id)
          : selectedAdmins

    if (messageType === "actualizacion" && recipients.length === 0) {
      setSendError("No hay usuarios con acceso abierto para recibir la actualizacion.")
      return
    }

    if (recipients.length === 0 && messageType !== "actualizacion") return

    setSending(true)
    setSendError(null)

    try {
      const saved = await sendAdminSubscriptionMessage({
        messageType,
        content: messageContent,
        scope:
          messageType === "actualizacion"
            ? sendScope === "general"
              ? "all"
              : "specific"
            : sendScope === "general"
              ? "all"
              : "specific",
        recipientAdminIds: recipients,
        sentBy: currentUser?.id ?? null,
        targetVersion: messageType === "actualizacion" ? targetVersion.trim() : null,
        downloadUrl: messageType === "actualizacion" ? downloadUrl.trim() : null,
        broadcastToLogin: messageType === "actualizacion" && sendScope === "general",
      })
      setSentMessages((prev) => [saved, ...prev])
      setMessageContent("")
      if (messageType === "actualizacion") {
        setTargetVersion("")
        setDownloadUrl("")
      }
      if (sendScope === "especificos") {
        setSelectedAdmins([])
      }
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el mensaje. Verifica que la migracion 038 este aplicada en Supabase.",
      )
    } finally {
      setSending(false)
    }
  }

  const getMessageTemplates = () => {
    switch (messageType) {
      case "vencimiento":
        return "Estimado cliente, le informamos que su plan esta proximo a vencer. Le recomendamos renovar antes de la fecha de vencimiento para mantener todos sus servicios activos."
      case "renovacion":
        return "Estimado cliente, su periodo de renovacion esta activo. Renueve ahora para continuar disfrutando de todos los beneficios de su plan sin interrupciones."
      case "bloqueo":
        return "AVISO IMPORTANTE: Su cuenta sera suspendida si no realiza la renovacion en los proximos dias. Para evitar la suspension de servicios, por favor renueve su plan lo antes posible."
      case "actualizacion":
        return `Nueva version ${targetVersion || "X.X.X"} disponible. Descargue e instale la actualizacion desde el enlace indicado. Version actual de su equipo: ${getAppVersion()}.`
      default:
        return ""
    }
  }

  const messageTypeLabels: Record<AdminMessageType, string> = {
    general: "General",
    vencimiento: "Vencimiento",
    renovacion: "Renovacion",
    bloqueo: "Bloqueo",
    actualizacion: "Actualizacion",
  }

  const applyTemplate = () => {
    const template = getMessageTemplates()
    if (template) {
      setMessageContent(template)
    }
  }

  const stats = {
    total: adminNotifications.length,
    activos: adminNotifications.filter((a) => a.planStatus === "activo").length,
    porVencer: adminNotifications.filter((a) => a.planStatus === "por_vencer").length,
    vencidos: adminNotifications.filter((a) => a.planStatus === "vencido").length,
    bloqueados: adminNotifications.filter((a) => a.planStatus === "bloqueado").length,
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              Mensajes y Notificaciones
            </h1>
            <p className="text-muted-foreground mt-1">
              Envie notificaciones a clientes sobre sus planes y suscripciones
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Building2 className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Clientes</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.activos}</p>
                <p className="text-xs text-muted-foreground">Activos</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.porVencer}</p>
                <p className="text-xs text-muted-foreground">Por Vencer</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <XCircle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.vencidos}</p>
                <p className="text-xs text-muted-foreground">Vencidos</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-500/10">
                <Ban className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.bloqueados}</p>
                <p className="text-xs text-muted-foreground">Bloqueados</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Message Composer Panel */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-card border border-border rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600">
                  <Send className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Redactar Mensaje</h2>
                  <p className="text-xs text-muted-foreground">Envie notificaciones a clientes</p>
                </div>
              </div>

              {/* Scope Selector - General o Clientes Especificos */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Enviar a
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (messageType === "actualizacion") return
                      setSendScope("general")
                      setSelectedAdmins([])
                    }}
                    disabled={messageType === "actualizacion"}
                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                      sendScope === "general"
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-background border-border text-muted-foreground " +
                          (messageType === "actualizacion" ? "opacity-50 cursor-not-allowed" : "hover:bg-muted")
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                    General (Todos)
                  </button>
                  <button
                    onClick={() => setSendScope("especificos")}
                    className={`flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-sm font-medium transition-all ${
                      sendScope === "especificos"
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Clientes Especificos
                  </button>
                </div>
                {sendScope === "general" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    El mensaje se enviara a todos los {adminNotifications.length} administradores
                  </p>
                )}
                {sendScope === "especificos" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Seleccione los clientes en la lista de la derecha
                  </p>
                )}
              </div>

              {/* Message Type Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Tipo de mensaje
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "general", label: "General", icon: Bell },
                    { value: "vencimiento", label: "Vencimiento", icon: Clock },
                    { value: "renovacion", label: "Renovacion", icon: RefreshCw },
                    { value: "bloqueo", label: "Bloqueo", icon: Ban },
                    { value: "actualizacion", label: "Actualizacion", icon: Package },
                  ].map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setMessageType(type.value as typeof messageType)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        messageType === type.value
                          ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                          : "bg-background border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <type.icon className="h-4 w-4" />
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {messageType === "actualizacion" && (
                <div className="mb-4 space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Version de la actualizacion
                    </label>
                    <input
                      type="text"
                      value={targetVersion}
                      onChange={(e) => setTargetVersion(e.target.value)}
                      placeholder="ej: 2 o 2.0.1"
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ej: publica version 3 → la veran quienes tengan 1 o 2; quien ya tenga 3 o mas, no.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Enlace de descarga
                    </label>
                    <input
                      type="url"
                      value={downloadUrl}
                      onChange={(e) => setDownloadUrl(e.target.value)}
                      placeholder="https://... o pegue el link en el mensaje"
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground"
                    />
                  </div>
                </div>
              )}

              {/* Template Button */}
              {messageType !== "general" && messageType !== "actualizacion" && (
                <button
                  onClick={applyTemplate}
                  className="w-full mb-4 px-4 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  Usar plantilla de {messageType}
                </button>
              )}

              {messageType !== "actualizacion" && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Contenido del mensaje
                  </label>
                  <textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Escriba el mensaje que desea enviar a los clientes seleccionados..."
                    rows={6}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  />
                </div>
              )}

              {messageType === "actualizacion" && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Nota adicional <span className="text-muted-foreground font-normal">(opcional)</span>
                  </label>
                  <textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Opcional: texto extra en el aviso del login..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
                  />
                </div>
              )}

              {/* Selected Clients Count */}
              <div className="mb-4 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Destinatarios</span>
                  <span className="text-sm font-semibold text-foreground">
                    {sendScope === "general" ? adminNotifications.length : selectedAdmins.length}
                    {sendScope === "general" && <span className="text-xs text-muted-foreground ml-1">(todos)</span>}
                  </span>
                </div>
              </div>

              {sendError && (
                <p className="mb-3 text-sm text-red-500">{sendError}</p>
              )}

              {/* Send Button */}
              <button
                onClick={handleSendMessage}
                disabled={
                  sending ||
                  (messageType !== "actualizacion" && !messageContent.trim()) ||
                  (messageType === "actualizacion" && selectedAdmins.length === 0) ||
                  (sendScope === "especificos" &&
                    selectedAdmins.length === 0 &&
                    messageType !== "actualizacion") ||
                  (messageType === "actualizacion" &&
                    (!targetVersion.trim() || !downloadUrl.trim()))
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white font-medium hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send className="h-4 w-4" />
                {sending
                  ? "Enviando..."
                  : messageType === "actualizacion"
                    ? "Publicar actualizacion"
                    : sendScope === "general"
                      ? "Enviar a Todos"
                      : "Enviar Mensaje"}
              </button>
            </div>

            {/* Recent Messages */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Mensajes Recientes</h3>
              {loadingHistory ? (
                <p className="text-xs text-muted-foreground">Cargando historial...</p>
              ) : sentMessages.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay mensajes enviados aun</p>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {sentMessages.slice(0, 5).map((msg) => (
                    <div key={msg.id} className="p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground mb-1">
                            {new Date(msg.created_at).toLocaleString("es-DO")} ·{" "}
                            {messageTypeLabels[msg.message_type]} · {msg.recipient_count} destinatarios
                          </p>
                          {msg.message_type === "actualizacion" && msg.target_version ? (
                            <p className="text-xs font-medium text-emerald-600 mb-1">
                              Version {msg.target_version}
                            </p>
                          ) : null}
                          <p className="text-sm text-foreground line-clamp-2">{msg.content}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMessage(msg.id)}
                          disabled={deletingMessageId === msg.id}
                          className="rounded-lg p-2 text-muted-foreground transition hover:bg-background hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Eliminar mensaje enviado"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Clients List Panel */}
          <div className="lg:col-span-2">
            <div className="bg-card border border-border rounded-2xl">
              {/* Panel Header */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Lista de Clientes</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sendScope === "general" 
                      ? "Vista informativa - El mensaje se enviara a todos"
                      : "Seleccione los clientes que recibiran el mensaje"}
                  </p>
                </div>
                {sendScope === "especificos" && selectedAdmins.length > 0 && (
                  <span className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
                    {selectedAdmins.length} seleccionados
                  </span>
                )}
              </div>
              
              {/* Filters */}
              <div className="p-4 border-b border-border">
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar cliente..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="todos">Todos los estados</option>
                    <option value="activo">Activos</option>
                    <option value="por_vencer">Por Vencer</option>
                    <option value="vencido">Vencidos</option>
                    <option value="bloqueado">Bloqueados</option>
                  </select>
                </div>
              </div>

              {/* Select All - Solo visible cuando es Clientes Especificos */}
              {sendScope === "especificos" && (
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                    checked={selectedAdmins.length === filteredAdmins.length && filteredAdmins.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="text-sm font-medium text-foreground">
                    Seleccionar todos ({filteredAdmins.length})
                    </span>
                  </label>
                </div>
              )}

              {/* Admin List */}
              <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                {filteredAdmins.map((admin) => {
                  const isSelected = selectedAdmins.includes(admin.id)
                  
                  return (
                    <div
                      key={admin.id}
                      onClick={() => sendScope === "especificos" && handleSelectAdmin(admin.id)}
                      className={`p-4 transition-colors ${
                        sendScope === "especificos" ? "cursor-pointer hover:bg-muted/30" : ""
                      } ${isSelected && sendScope === "especificos" ? "bg-blue-500/5" : ""}`}
                    >
                      <div className="flex items-start gap-4">
                        {sendScope === "especificos" && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectAdmin(admin.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-border mt-1"
                          />
                        )}
                        {sendScope === "general" && (
                          <div className="p-1.5 rounded-lg bg-emerald-500/10 mt-0.5">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <h3 className="font-semibold text-foreground truncate">
                                {admin.name}
                              </h3>
                            </div>
                            <StatusBadge status={admin.planStatus} />
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" />
                              {admin.email}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              {admin.businessName}
                            </span>
                          </div>

                          {/* Plan Info */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                            {/* Tiempo Restante */}
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Tiempo restante</p>
                                <p className={`text-sm font-semibold ${
                                  admin.planStatus === "vencido" ? "text-red-400" :
                                  admin.planStatus === "por_vencer" ? "text-amber-400" :
                                  "text-foreground"
                                }`}>
                                  {admin.planStatus === "bloqueado" ? "Bloqueado" :
                                   admin.planStatus === "vencido" ? `Vencido hace ${admin.daysRemaining} dias` :
                                   `${admin.daysRemaining} dias`}
                                </p>
                              </div>
                            </div>

                            {/* Renovacion */}
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                              <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Plazo renovacion</p>
                                <p className={`text-sm font-semibold ${
                                  admin.renewalDeadline <= 0 ? "text-red-400" :
                                  admin.renewalDeadline <= 7 ? "text-amber-400" :
                                  "text-foreground"
                                }`}>
                                  {admin.planStatus === "activo" || admin.planStatus === "por_vencer"
                                    ? `${admin.renewalDeadline} dias tras vencer`
                                    : admin.renewalDeadline <= 0
                                      ? "Plazo vencido"
                                      : `${admin.renewalDeadline} dias`}
                                </p>
                              </div>
                            </div>

                            {/* Plan */}
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50">
                              <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="text-xs text-muted-foreground">Plan actual</p>
                                <p className="text-sm font-semibold text-foreground capitalize">
                                  {businesses.find((b) => b.name === admin.businessName)?.subscription?.plan || "Sin plan"}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Warning Alerts */}
                          {(admin.planStatus === "vencido" || admin.planStatus === "por_vencer") && (
                            <div className="mt-3 space-y-2">
                              {admin.planStatus === "vencido" && admin.cancellationDate && (
                                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                                  <p className="text-xs text-amber-400">
                                    <span className="font-semibold">Plazo renovacion:</span> quedan{" "}
                                    {admin.renewalDeadline} dia{admin.renewalDeadline === 1 ? "" : "s"}.
                                    Bloqueo automatico el {admin.cancellationDate.toLocaleDateString()}.
                                  </p>
                                </div>
                              )}
                              {admin.planStatus === "por_vencer" && (
                                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                                  <p className="text-xs text-amber-400">
                                    <span className="font-semibold">Aviso:</span> El plan vencera en {admin.daysRemaining} dias. Se recomienda renovar pronto.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {filteredAdmins.length === 0 && (
                  <div className="p-12 text-center">
                    <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground">No se encontraron administradores</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Historial de mensajes enviados</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Incluye actualizaciones publicadas con version y enlace
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadMessageHistory()}
              className="text-sm text-blue-500 hover:underline"
            >
              Actualizar lista
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left">
                  <th className="p-3 font-semibold">Fecha</th>
                  <th className="p-3 font-semibold">Tipo</th>
                  <th className="p-3 font-semibold">Version</th>
                  <th className="p-3 font-semibold">Enlace</th>
                  <th className="p-3 font-semibold">Destinatarios</th>
                  <th className="p-3 font-semibold">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Cargando historial...
                    </td>
                  </tr>
                ) : sentMessages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      No hay mensajes enviados aun
                    </td>
                  </tr>
                ) : (
                  sentMessages.map((msg) => (
                    <tr key={msg.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">
                        {new Date(msg.created_at).toLocaleString("es-DO")}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${
                            msg.message_type === "actualizacion"
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {messageTypeLabels[msg.message_type]}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {msg.target_version || "—"}
                      </td>
                      <td className="p-3">
                        {msg.download_url ? (
                          <button
                            type="button"
                            onClick={() => openExternalLink(msg.download_url!)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Abrir
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3">
                        {msg.recipient_count} ({msg.scope === "all" ? "todos" : "especificos"})
                      </td>
                      <td className="p-3 max-w-md text-foreground">
                        <span className="line-clamp-2">{renderTextWithLinks(msg.content)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
