"use client"

import { useEffect, useState } from "react"
import { Bell, Download, X } from "lucide-react"
import { fetchTenantSubscriptionNotifications } from "@/lib/admin-subscription-messages"
import { createClient } from "@/lib/supabase/client"
import { openExternalLink, renderTextWithLinks } from "@/lib/message-links"

type Props = {
  ownerAdminId: string
}

export function TenantSubscriptionNotifications({ ownerAdminId }: Props) {
  const [notifications, setNotifications] = useState<
    Awaited<ReturnType<typeof fetchTenantSubscriptionNotifications>>
  >([])
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const rows = await fetchTenantSubscriptionNotifications(ownerAdminId)
        if (mounted) setNotifications(rows)
      } catch (err) {
        console.warn("[TenantNotifications]", err)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [ownerAdminId])

  const visible = notifications.filter((n) => !dismissedIds.has(n.id))
  if (visible.length === 0) return null

  const latest = visible[0]

  const dismiss = async (id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]))
    try {
      const supabase = createClient()
      await supabase
        .from("tenant_subscription_notifications")
        .update({ is_read: true, is_active: false })
        .eq("id", id)
    } catch {
      // ignore
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 shrink-0 text-blue-500 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">{latest.title}</p>
          {latest.target_version ? (
            <p className="text-xs text-muted-foreground">Version {latest.target_version}</p>
          ) : null}
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {renderTextWithLinks(latest.content)}
          </p>
          {latest.download_url ? (
            <button
              type="button"
              onClick={() => openExternalLink(latest.download_url!)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              <Download className="h-4 w-4" />
              Abrir enlace de descarga
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => dismiss(latest.id)}
          className="shrink-0 rounded-lg p-1 hover:bg-blue-500/20"
          aria-label="Cerrar notificacion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
