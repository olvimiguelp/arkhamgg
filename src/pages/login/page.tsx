"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { AlertCircle, Download, Lock, User, X } from "lucide-react"
import { useStore } from "@/components/store-context"
import { AppLogo } from "@/components/app-logo"
import { LegalPoliciesModal } from "@/components/legal-policies-modal"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NetworkDiagnosticsDialog } from "@/components/network-diagnostics-dialog"
import { useSystemConfig } from "@/hooks/use-system-config"
import { useTenantSubscription } from "@/hooks/use-tenant-subscription"
import { NOMBRECONFI } from "@/nombreconfi"
import { getFirstAccessibleTenantPath } from "@/lib/tenant-permissions"
import { createClient } from "@/lib/supabase/client"
import {
  fetchTenantSubscriptionNotifications,
  type TenantSubscriptionNotification,
} from "@/lib/admin-subscription-messages"
import { openExternalLink, renderTextWithLinks } from "@/lib/message-links"
import { getAppVersion } from "@/lib/app-version"

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isAuthenticated, currentUser, employees } = useStore()
  const { config: systemConfig, loading: systemLoading } = useSystemConfig({
    keys: ["membership_block"],
    pollIntervalMs: 5000,
  })
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [tenantUpdateStatus, setTenantUpdateStatus] = useState<
    "idle" | "loading" | "showing" | "done"
  >("done")
  const [tenantUpdate, setTenantUpdate] = useState<TenantSubscriptionNotification | null>(null)
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false)
  const [showTermsOfService, setShowTermsOfService] = useState(false)
  const supabaseClient = createClient()

  useEffect(() => {
    const savedAuth = localStorage.getItem("saved_auth")
    if (!savedAuth) return

    try {
      const { username: savedUser, password: savedPass } = JSON.parse(atob(savedAuth))
      setUsername(savedUser)
      setPassword(savedPass)
      setRememberMe(true)
    } catch (err) {
      console.error("Error loading saved credentials", err)
      localStorage.removeItem("saved_auth")
    }
  }, [])

  const isBlocked = Boolean(systemConfig?.membership_block?.enabled)
  const allowLoginWhenBlocked = Boolean(systemConfig?.membership_block?.allow_login)
  const pendingAdminId = isAuthenticated && currentUser?.role !== "super_admin" ? currentUser?.adminId ?? null : null
  const { status: subscriptionStatus, loading: subscriptionLoading } =
    useTenantSubscription(pendingAdminId)

  useEffect(() => {
    if (!systemLoading && isBlocked && !allowLoginWhenBlocked) {
      navigate("/bloqueo", { replace: true })
    }
  }, [systemLoading, isBlocked, allowLoginWhenBlocked, navigate])

  // useEffect(() => {
  //   let mounted = true
  //   const ownerAdminId =
  //     isAuthenticated && currentUser && !currentUser.isSuperAdmin ? currentUser.adminId : null

  //   if (!ownerAdminId) {
  //     setTenantUpdateStatus("done")
  //     setTenantUpdate(null)
  //     return () => {
  //       mounted = false
  //     }
  //   }

  //   setTenantUpdateStatus("loading")

  //   const loadTenantUpdate = async () => {
  //     try {
  //       const rows = await fetchTenantSubscriptionNotifications(ownerAdminId)
  //       if (!mounted) return

  //       const latestUpdate = rows
  //         .filter(
  //           (row) =>
  //             row.message_type === "actualizacion" &&
  //             Boolean(row.target_version?.trim()) &&
  //             Boolean(row.download_url?.trim()),
  //         )
  //         .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  //       setTenantUpdate(latestUpdate ?? null)
  //       setTenantUpdateStatus(latestUpdate ? "showing" : "done")
  //     } catch (err) {
  //       if (mounted) {
  //         console.warn("[LoginUpdate]", err)
  //         setTenantUpdate(null)
  //         setTenantUpdateStatus("done")
  //       }
  //     }
  //   }

  //   loadTenantUpdate()

  //   return () => {
  //     mounted = false
  //   }
  // }, [isAuthenticated, currentUser?.adminId, currentUser?.isSuperAdmin])

  if (systemLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-400">Cargando configuracion...</p>
      </div>
    )
  }

  if (isBlocked && !allowLoginWhenBlocked) {
    return null
  }

  const dismissTenantUpdate = async () => {
    if (tenantUpdate?.id) {
      try {
        await supabaseClient
          .from("tenant_subscription_notifications")
          .update({ is_read: true, is_active: false })
          .eq("id", tenantUpdate.id)
      } catch {
        // ignore
      }
    }

    setTenantUpdate(null)
    setTenantUpdateStatus("done")
  }

  // if (
  //   isAuthenticated &&
  //   currentUser &&
  //   !currentUser.isSuperAdmin &&
  //   tenantUpdateStatus !== "done"
  // ) {
  //   if (tenantUpdateStatus === "showing" && tenantUpdate) {
  //     const installed = getAppVersion()
  //     const target = tenantUpdate.target_version?.trim() ?? ""

  //     return (
  //       <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 px-4">
  //         <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/40 bg-slate-900 shadow-2xl">
  //           <div className="flex items-start justify-between border-b border-slate-700 px-5 py-4">
  //             <div className="flex items-center gap-3">
  //               <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-slate-600 bg-slate-800">
  //                 <AppLogo className="h-11 w-11" />
  //               </div>
  //               <div>
  //                 <h2 className="text-lg font-semibold text-white">Actualizacion asignada</h2>
  //                 <p className="text-xs text-slate-400">
  //                   Su version: <span className="font-mono text-slate-300">{installed}</span>
  //                 </p>
  //               </div>
  //             </div>
  //             <button
  //               type="button"
  //               onClick={dismissTenantUpdate}
  //               className="rounded-full p-1 text-slate-500 transition hover:text-slate-200"
  //               aria-label="Cerrar"
  //             >
  //               <X className="h-4 w-4" />
  //             </button>
  //           </div>

  //           <div className="space-y-4 px-5 py-5 text-center">
  //             <p className="text-sm text-slate-400">Nueva version publicada para este usuario</p>
  //             <p className="font-mono text-4xl font-bold tracking-tight text-emerald-400">
  //               {target}
  //             </p>
  //             <p className="text-sm whitespace-pre-wrap text-slate-300">
  //               {renderTextWithLinks(tenantUpdate.content)}
  //             </p>
  //           </div>

  //           <div className="flex flex-col gap-2 border-t border-slate-700 px-5 py-4">
  //             <Button
  //               type="button"
  //               className="h-12 w-full gap-2 bg-emerald-600 text-base font-semibold hover:bg-emerald-500"
  //               onClick={() => openExternalLink(tenantUpdate.download_url!)}
  //             >
  //               <Download className="h-5 w-5" />
  //               Descargar actualizacion
  //             </Button>
  //             <Button
  //               type="button"
  //               variant="ghost"
  //               className="w-full text-slate-400 hover:text-white"
  //               onClick={dismissTenantUpdate}
  //             >
  //               Continuar al login
  //             </Button>
  //           </div>
  //         </div>
  //       </div>
  //     )
  //   }

  //   return (
  //     <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
  //       <p className="text-sm text-slate-400">Verificando actualizaciones...</p>
  //     </div>
  //   )
  // }

  if (isAuthenticated && currentUser) {
    if (subscriptionLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
          <p className="text-sm text-slate-400">Verificando suscripcion...</p>
        </div>
      )
    }

    if (currentUser.role !== "super_admin" && subscriptionStatus?.shouldBlockAfterLogin) {
      return <Navigate to="/suscripcion-vencida" replace />
    }

    const redirectTo = getFirstAccessibleTenantPath(currentUser, employees)

    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    if (!username || !password) {
      setError("Por favor complete usuario y contrasena")
      setIsLoading(false)
      return
    }

    try {
      const result = await login(username, password)

      if (result.success && result.role) {
        if (rememberMe) {
          const authData = btoa(JSON.stringify({ username, password }))
          localStorage.setItem("saved_auth", authData)
        } else {
          localStorage.removeItem("saved_auth")
        }
      } else {
        setError(result.message || "Usuario o contrasena incorrectos")
        setIsLoading(false)
      }
    } catch {
      setError("Error al iniciar sesion. Intente nuevamente.")
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Las actualizaciones se muestran DENTRO del sistema (post-login) en tenant-subscription-notifications */}
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-600/50 bg-slate-800/80 p-1">
              <AppLogo className="h-full w-full" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {NOMBRECONFI.appName}
            </h1>
          </div>

          <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8 shadow-2xl backdrop-blur-sm">
            <h2 className="mb-6 text-center text-xl font-semibold text-white">
              Iniciar Sesion
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-slate-300">
                  Usuario
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="ej: olvin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-12 border-slate-600 bg-slate-700/50 pl-11 text-white placeholder:text-slate-500 focus:border-amber-500 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                  Contrasena
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 border-slate-600 bg-slate-700/50 pl-11 text-white placeholder:text-slate-500 focus:border-amber-500 focus:ring-amber-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                  className="border-slate-500 data-[state=checked]:border-amber-500 data-[state=checked]:bg-amber-500"
                />
                <Label
                  htmlFor="remember"
                  className="cursor-pointer text-sm font-medium leading-none text-slate-300 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Recordar contrasena
                </Label>
              </div>

              {error && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                  {error.includes("Supabase") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-amber-500/30 text-sm text-amber-400 hover:bg-amber-500/10"
                      onClick={() => setShowDiagnostics(true)}
                    >
                      🔧 Ejecutar Diagnóstico de Red
                    </Button>
                  )}
                </div>
              )}

              <Button
                type="submit"
                className="h-12 w-full bg-gradient-to-r from-amber-500 to-orange-500 text-base font-semibold text-slate-900 shadow-lg shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600"
                disabled={isLoading}
              >
                {isLoading ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </div>

          <div className="mt-6 space-y-3">
            <p className="text-center text-xs text-slate-500">
              2025 {NOMBRECONFI.appName}. Todos los derechos reservados.
            </p>
            <div className="flex justify-center gap-4 text-xs">
              <button
                onClick={() => setShowPrivacyPolicy(true)}
                className="text-blue-400 hover:text-blue-300 underline transition-colors"
              >
                Política de Privacidad
              </button>
            </div>
          </div>
        </div>

        {showDiagnostics && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-screen overflow-y-auto">
              <NetworkDiagnosticsDialog
                supabaseClient={supabaseClient}
                onClose={() => setShowDiagnostics(false)}
              />
            </div>
          </div>
        )}

        <LegalPoliciesModal
          open={showPrivacyPolicy}
          onOpenChange={setShowPrivacyPolicy}
          type="privacy"
        />

        <LegalPoliciesModal
          open={showTermsOfService}
          onOpenChange={setShowTermsOfService}
          type="terms"
        />
      </div>
    </>
  )
}
