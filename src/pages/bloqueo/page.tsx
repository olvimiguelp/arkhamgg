"use client"

import { useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, CalendarClock, Lock, Mail, Phone, RefreshCcw, ShieldAlert } from "lucide-react"
import { useSystemConfig } from "@/hooks/use-system-config"
import { getMembershipSelection } from "@/lib/membership"
import { NOMBRECONFI } from "@/nombreconfi"

const formatDate = (value: string | null) => {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })
}

export default function BloqueoPage() {
  const navigate = useNavigate()
  const { config, loading, error } = useSystemConfig({
    keys: ["membership_block", "membership_payment_proof"],
    pollIntervalMs: 5000,
  })

  const blockConfig = (config?.membership_block ?? {}) as Record<string, unknown>
  const paymentSelection = getMembershipSelection(config)

  const isBlocked = Boolean(blockConfig.enabled)
  const allowLoginWhenBlocked = Boolean(blockConfig.allow_login)
  const supportEmail =
    (typeof blockConfig.support_email === "string" && blockConfig.support_email.trim()) ||
    NOMBRECONFI.supportEmail
  const supportPhone =
    (typeof blockConfig.support_whatsapp === "string" && blockConfig.support_whatsapp.trim()) ||
    NOMBRECONFI.supportPhone
  const supportPhoneDigits = supportPhone.replace(/\D/g, "")
  const supportTelHref =
    supportPhoneDigits.length === 10
      ? `tel:+1${supportPhoneDigits}`
      : supportPhoneDigits.length > 0
        ? `tel:+${supportPhoneDigits}`
        : undefined
  const expiresAt = formatDate(paymentSelection.expiresAt)
  const approvedAt = formatDate(paymentSelection.approvedAt)

  const title = useMemo(() => {
    if (!isBlocked) {
      return `Bienvenido a ${NOMBRECONFI.appName}`
    }
    if (typeof blockConfig.title === "string" && blockConfig.title.trim().length > 0) {
      return blockConfig.title
    }
    return "Acceso temporalmente bloqueado"
  }, [blockConfig.title, isBlocked])

  const subtitle =
    typeof blockConfig.subtitle === "string" && blockConfig.subtitle.trim().length > 0
      ? blockConfig.subtitle
      : "Panel de control y facturacion"

  const message =
    typeof blockConfig.message === "string" && blockConfig.message.trim().length > 0
      ? blockConfig.message
      : isBlocked
        ? "El acceso esta restringido por configuracion de membresia. Contacta al administrador para habilitar el sistema."
        : "Revisa el estado de tu membresia y continua al sistema cuando estes listo."

  const canContinue = !isBlocked || allowLoginWhenBlocked

  useEffect(() => {
    if (!loading && canContinue) {
      navigate("/login", { replace: true })
    }
  }, [loading, canContinue, navigate])

  if (loading || canContinue) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4">
          <RefreshCcw className="h-4 w-4 animate-spin text-amber-400" />
          <span className="text-sm">
            {loading ? "Cargando estado del sistema..." : "Redirigiendo al inicio de sesion..."}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_50%,#020617_100%)] text-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="rounded-3xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-6 md:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-400/10 px-3 py-1 text-xs text-red-200">
              <ShieldAlert className="h-3.5 w-3.5" />
              Acceso suspendido
            </div>
            <h1 className="mt-5 text-2xl md:text-4xl font-extrabold leading-tight">{title}</h1>
            <p className="mt-2 text-slate-300 text-sm md:text-base">{subtitle}</p>
            <p className="mt-5 text-slate-200/90">{message}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Estado global</p>
                <p className={`mt-1 font-semibold ${isBlocked ? "text-red-300" : "text-emerald-300"}`}>
                  {isBlocked ? "Bloqueado" : "Operativo"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Acceso al login</p>
                <p className={`mt-1 font-semibold ${canContinue ? "text-emerald-300" : "text-amber-300"}`}>
                  {canContinue ? "Permitido" : "Restringido"}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => navigate("/login")}
                disabled={!canContinue}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                {canContinue ? "Continuar al sistema" : "Acceso no disponible"}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-3 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <RefreshCcw className="h-4 w-4" />
                Actualizar estado
              </button>
            </div>

            {error && (
              <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                No se pudo leer la configuracion en vivo: {error.message}
              </div>
            )}
          </section>

          <aside className="rounded-3xl border border-slate-700/60 bg-slate-900/60 backdrop-blur-sm p-6 md:p-7 space-y-5">
            <h2 className="text-lg font-bold">Resumen de membresia</h2>

            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
                <p className="text-slate-400 text-xs">Plan seleccionado</p>
                <p className="mt-1 font-medium text-slate-100">
                  {paymentSelection.planName || paymentSelection.planId || "Sin plan registrado"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
                <p className="text-slate-400 text-xs">Estado del comprobante</p>
                <p className="mt-1 font-medium capitalize text-slate-100">
                  {paymentSelection.status || "Sin envio"}
                </p>
                {approvedAt && (
                  <p className="mt-1 text-xs text-emerald-300 inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Aprobado el {approvedAt}
                  </p>
                )}
                {expiresAt && (
                  <p className="mt-1 text-xs text-amber-300 inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Vigente hasta {expiresAt}
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
              <p className="font-semibold text-slate-100 inline-flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-300" />
                Contacto de soporte
              </p>
              <a
                href={`mailto:${supportEmail}`}
                className="text-sm text-slate-300 inline-flex items-center gap-2 hover:text-amber-300 transition-colors"
              >
                <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                {supportEmail}
              </a>
              <a
                href={supportTelHref}
                className="text-sm text-slate-300 inline-flex items-center gap-2 hover:text-amber-300 transition-colors"
              >
                <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                {supportPhone}
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

