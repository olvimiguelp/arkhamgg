"use client"

import { AlertTriangle, X } from "lucide-react"
import { useState } from "react"
import type { SubscriptionStatusResult } from "@/lib/subscription-status"

type Props = {
  status: SubscriptionStatusResult
}

export function SubscriptionRenewalBanner({ status }: Props) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || !status.showRenewalPrompt) return null

  const message =
    status.accessState === "en_gracia"
      ? `Su suscripcion vencio. Tiene ${status.graceDaysRemaining} dia${status.graceDaysRemaining === 1 ? "" : "s"} para renovar antes de que se bloquee el acceso.`
      : `Su plan vence en ${status.daysUntilExpiry} dia${status.daysUntilExpiry === 1 ? "" : "s"}. Renueve pronto para evitar interrupciones.`

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-950 dark:text-amber-100">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded-lg p-1 hover:bg-amber-500/20 transition-colors"
        aria-label="Cerrar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
