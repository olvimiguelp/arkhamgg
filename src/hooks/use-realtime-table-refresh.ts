import { useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { REALTIME_APP_TABLES } from "@/lib/realtime-tables"

export const REALTIME_TABLE_EVENT = "arkham:realtime-table" as const

export type RealtimeTableEventDetail = {
  table: string
  payload?: unknown
}

/** Dispara un evento local para que paginas que cargan su propio estado refresquen. */
export function broadcastRealtimeTableChange(table: string, payload?: unknown) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<RealtimeTableEventDetail>(REALTIME_TABLE_EVENT, {
      detail: { table, payload },
    }),
  )
}

type UseRealtimeTableRefreshOptions = {
  enabled?: boolean
  ownerAdminId?: string | null
}

/**
 * Suscribe a cambios postgres en una o mas tablas y ejecuta onRefresh.
 * Si ownerAdminId se indica, ignora filas de otros tenants.
 */
export function useRealtimeTableRefresh(
  tables: string | string[],
  onRefresh: () => void,
  options: UseRealtimeTableRefreshOptions = {},
) {
  const { enabled = true, ownerAdminId = null } = options
  const tablesKey = useMemo(() => {
    const list = (Array.isArray(tables) ? tables : [tables]).filter(Boolean)
    return list.join(",")
  }, [Array.isArray(tables) ? tables.join(",") : String(tables || "")])

  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    if (!enabled || !tablesKey) return

    const tableList = tablesKey.split(",").filter(Boolean)
    if (tableList.length === 0) return

    const supabase = createClient()
    const channelName = `refresh_${tablesKey.replace(/[^a-z0-9_]/gi, "_")}_${ownerAdminId ?? "all"}_${Math.random().toString(36).substring(2, 9)}`
    let channel = supabase.channel(channelName)

    const matchesTenant = (record: Record<string, unknown> | undefined) => {
      if (!ownerAdminId || !record) return true
      return String(record.owner_admin_id ?? "") === ownerAdminId
    }

    const handlePayload = (table: string, payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const rec = payload.new ?? payload.old
      if (!matchesTenant(rec)) return
      onRefreshRef.current()
      broadcastRealtimeTableChange(table, payload)
    }

    for (const table of tableList) {
      if (!REALTIME_APP_TABLES.includes(table as (typeof REALTIME_APP_TABLES)[number])) {
        console.warn(`[realtime] tabla no registrada en REALTIME_APP_TABLES: ${table}`)
      }
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => handlePayload(table, payload as { new?: Record<string, unknown>; old?: Record<string, unknown> }),
      )
    }

    channel.subscribe()

    const onWindowEvent = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeTableEventDetail>).detail
      if (!detail?.table || !tableList.includes(detail.table)) return
      onRefreshRef.current()
    }

    window.addEventListener(REALTIME_TABLE_EVENT, onWindowEvent)

    return () => {
      window.removeEventListener(REALTIME_TABLE_EVENT, onWindowEvent)
      void supabase.removeChannel(channel)
    }
  }, [enabled, ownerAdminId, tablesKey])
}
