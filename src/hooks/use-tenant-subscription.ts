import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  computeSubscriptionStatus,
  DEFAULT_RENEWAL_GRACE_DAYS,
  type SubscriptionStatusResult,
} from "@/lib/subscription-status"

type TenantSubscriptionRow = {
  id: string
  owner_admin_id: string
  subscription: Record<string, unknown> | null
  renewal_grace_days: number | null
  is_blocked: boolean | null
  subscription_suspended: boolean | null
  open_access: boolean | null
  whatsapp_bot_access: boolean | null
  status: string | null
}

export function useTenantSubscription(ownerAdminId: string | null | undefined) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<TenantSubscriptionRow | null>(null)

  const refresh = useCallback(async () => {
    const adminId = String(ownerAdminId ?? "").trim()
    if (!adminId) {
      setRow(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from("saas_businesses")
        .select("id, owner_admin_id, subscription, renewal_grace_days, is_blocked, subscription_suspended, open_access, whatsapp_bot_access, status")
        .eq("owner_admin_id", adminId)
        .maybeSingle()

      if (fetchError) throw fetchError
      setRow((data as TenantSubscriptionRow | null) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRow(null)
    } finally {
      setLoading(false)
    }
  }, [ownerAdminId])

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const adminId = String(ownerAdminId ?? "").trim()
    if (!adminId) return

    const supabase = createClient()
    const channelName = `saas_business_${adminId}_${Math.random().toString(36).substring(2, 9)}`
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "saas_businesses",
          filter: `owner_admin_id=eq.${adminId}`,
        },
        () => {
          void refreshRef.current()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [ownerAdminId])

  const status: SubscriptionStatusResult | null = useMemo(() => {
    if (!row) return null

    const sub = row.subscription
    const endRaw = sub?.endDate ?? sub?.end_date
    const endDate =
      typeof endRaw === "string" || endRaw instanceof Date ? new Date(endRaw) : null
    const hasSubscription = Boolean(sub && endDate && !Number.isNaN(endDate.getTime()))

    return computeSubscriptionStatus({
      endDate: hasSubscription ? endDate : null,
      renewalGraceDays: Number(row.renewal_grace_days ?? DEFAULT_RENEWAL_GRACE_DAYS),
      subscriptionSuspended: Boolean(row.subscription_suspended ?? row.is_blocked),
      hasSubscription,
      openAccess: Boolean(row.open_access),
    })
  }, [row])

  return { loading, error, row, status, refresh }
}
