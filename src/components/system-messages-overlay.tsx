"use client"

import { useSystemMessages } from "@/hooks/use-system-messages"
import { Button } from "@/components/ui/button"
import { Download, X } from "lucide-react"
import { getAppVersion } from "@/lib/app-version"
import { openExternalLink, renderTextWithLinks } from "@/lib/message-links"

const IMPORTANCE_LABELS = {
  success: "Actualizacion",
  warning: "Alerta",
  info: "Mensaje informativo",
  error: "Alerta",
} as const

const TONE_STYLES = {
  success: { borderTop: "border-t-emerald-500", text: "text-emerald-600" },
  warning: { borderTop: "border-t-red-500", text: "text-red-600" },
  info: { borderTop: "border-t-sky-500", text: "text-sky-600" },
  error: { borderTop: "border-t-red-500", text: "text-red-600" },
} as const

export function SystemMessagesOverlay() {
  const { messages, loading, error, dismiss } = useSystemMessages({
    onlyActive: true,
  })

  if (loading || error || messages.length === 0) return null

  const mensajeReciente = messages
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]

  if (!mensajeReciente) return null

  const importanceLabel =
    IMPORTANCE_LABELS[mensajeReciente.message_type] ?? IMPORTANCE_LABELS.info
  const tone = TONE_STYLES[mensajeReciente.message_type] ?? TONE_STYLES.info
  const isUpdate = Boolean(mensajeReciente.target_version)

  return (
    <div className="fixed top-4 right-4 z-[100] w-[calc(100vw-2rem)] max-w-[480px]">
      <div
        className={`overflow-hidden rounded-xl border border-slate-200 border-t-4 bg-white shadow-xl ${tone.borderTop}`}
      >
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Notificaciones</h2>
            {isUpdate && (
              <p className="text-xs text-slate-500">
                Su version: {getAppVersion()}
                {mensajeReciente.target_version
                  ? ` · Actualizacion: ${mensajeReciente.target_version}`
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismiss(mensajeReciente.id)}
            className="rounded-full p-1 text-slate-400 transition hover:text-slate-700"
            aria-label="Cerrar notificacion"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">Importancia</p>
            <p className={`text-base font-semibold ${tone.text}`}>{importanceLabel}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-700">{mensajeReciente.title}</p>
            <p className="text-base whitespace-pre-wrap text-slate-700">
              {renderTextWithLinks(mensajeReciente.content)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">
          {mensajeReciente.download_url ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => openExternalLink(mensajeReciente.download_url!)}
            >
              <Download className="h-4 w-4" />
              Descargar actualizacion
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={() => dismiss(mensajeReciente.id)}>
            Listo
          </Button>
        </div>
      </div>
    </div>
  )
}
