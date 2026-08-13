"use client"

import { useSystemMessages } from "@/hooks/use-system-messages"
import { Button } from "@/components/ui/button"
import { Download, X } from "lucide-react"
import { AppLogo } from "@/components/app-logo"
import { compareVersions, getAppVersion } from "@/lib/app-version"
import { openExternalLink } from "@/lib/message-links"

/**
 * Muestra actualizaciones globales (scope: "all") del sistema.
 * Se renderiza DENTRO del Layout (post-login) como un banner inline,
 * NO en el login, para evitar que aparezca a usuarios no identificados.
 */
export function AppUpdateCard() {
  const { messages, loading, error, dismiss } = useSystemMessages({ onlyActive: true })

  const update = messages
    .filter(
      (msg) =>
        Boolean(msg.target_version?.trim()) &&
        Boolean(msg.download_url?.trim()),
    )
    .sort((a, b) => {
      const byVersion = compareVersions(b.target_version!, a.target_version!)
      if (byVersion !== 0) return byVersion
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })[0]

  if (loading || error || !update) return null

  const installed = getAppVersion()
  const target = update.target_version!.trim()

  return (
    <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-emerald-700/50 bg-emerald-900/40">
          <AppLogo className="h-9 w-9" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-emerald-300">
              Actualizacion disponible — v{target}
            </p>
            <span className="text-xs text-muted-foreground">
              Su version: <span className="font-mono">{installed}</span>
            </span>
          </div>
          {update.content.trim() ? (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{update.content.trim()}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              Hay una nueva version {target} disponible. Descarguela e instale desde el enlace.
            </p>
          )}
          {update.download_url && (
            <Button
              type="button"
              size="sm"
              className="mt-2 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs"
              onClick={() => {
                openExternalLink(update.download_url!)
                dismiss(update.id)
              }}
            >
              <Download className="h-3.5 w-3.5" />
              Descargar actualizacion
            </Button>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismiss(update.id)}
          className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-emerald-500/20 hover:text-foreground transition"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
