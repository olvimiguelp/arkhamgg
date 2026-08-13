"use client"

import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, CalendarClock, LogOut, Mail, Phone, RefreshCcw, ShieldAlert } from "lucide-react"
import { useStore } from "@/components/store-context"
import { useTenantSubscription } from "@/hooks/use-tenant-subscription"
import { NOMBRECONFI } from "@/nombreconfi"

export default function SuscripcionVencidaPage() {
  const navigate = useNavigate()
  const { currentUser, logout } = useStore()
  const adminId = currentUser?.adminId ?? null
  const { status, loading, refresh } = useTenantSubscription(adminId)

  useEffect(() => {
    if (!loading && status && !status.shouldBlockAfterLogin) {
      navigate("/empleados", { replace: true })
    }
  }, [loading, status, navigate])

  const handleLogout = () => {
    logout()
    navigate("/login", { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
        <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4">
          <RefreshCcw className="h-4 w-4 animate-spin text-amber-400" />
          <span className="text-sm">Verificando suscripcion...</span>
        </div>
      </div>
    )
  }

  const isSubscriptionSuspended = status?.accessState === "suscripcion_suspendida"
  const isNoPlan = status?.accessState === "sin_suscripcion"
  const isExpired = status?.accessState === "bloqueado_suscripcion"

  const title = isSubscriptionSuspended
    ? "Suscripcion suspendida"
    : isNoPlan
      ? "Sin suscripcion activa"
      : "Suscripcion vencida"

  const message = isSubscriptionSuspended
    ? "El acceso al panel fue suspendido por motivos de suscripcion. Renueve o contacte soporte para reactivar el servicio."
    : isNoPlan
      ? "No tiene un plan de suscripcion asignado. Contacte al administrador de la plataforma para activar su membresia."
      : "Su periodo de renovacion ha finalizado. Renueve su suscripcion para continuar usando el sistema."

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1e293b_0%,#0f172a_50%,#020617_100%)] text-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-3xl border border-amber-500/30 bg-slate-900/70 backdrop-blur-sm p-6 md:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
            <ShieldAlert className="h-3.5 w-3.5" />
            Suspension por suscripcion
          </div>

          <h1 className="mt-5 text-2xl md:text-3xl font-extrabold leading-tight">{title}</h1>
          <p className="mt-4 text-slate-300">{message}</p>

          {status?.graceEndDate && isExpired && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <CalendarClock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-200">
                El plazo de renovacion de {status.renewalGraceDays} dias finalizo el{" "}
                {status.graceEndDate.toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                .
              </p>
            </div>
          )}

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <p className="text-sm text-slate-300">
              Puede iniciar sesion con su usuario, pero el acceso al panel de {NOMBRECONFI.appName} queda
              restringido hasta regularizar la suscripcion. Si su cuenta de administrador fue suspendida,
              no podra iniciar sesion y vera un mensaje distinto en la pantalla de acceso.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => refresh()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <RefreshCcw className="h-4 w-4" />
              Verificar de nuevo
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-700 px-4 py-3 text-sm font-medium hover:bg-slate-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesion
            </button>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> Soporte
              </p>
              <p className="mt-1 text-sm text-slate-200">Contacte al administrador de la plataforma</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> Renovacion
              </p>
              <p className="mt-1 text-sm text-slate-200">Solicite la renovacion de su plan</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
