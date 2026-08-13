import { useEffect, useMemo, useRef, useState } from "react"
import { createClient, RealtimeChannel } from "@supabase/supabase-js"

interface SystemConfigRow {
  id: string
  key: string
  value: Record<string, unknown>
  description?: string
  updated_at: string
}

interface UseSystemConfigOptions {
  keys?: string[]
  supabaseUrl?: string
  supabaseKey?: string
  pollIntervalMs?: number
}

const getDefaultSupabaseUrl = () =>
  (import.meta.env.VITE_SYSTEM_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)

const getDefaultSupabaseKey = () =>
  (import.meta.env.VITE_SYSTEM_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

export function useSystemConfig(options: UseSystemConfigOptions = {}) {
  const keysKey = useMemo(
    () => (options.keys?.length ? options.keys.join(",") : ""),
    [options.keys],
  )
  const pollIntervalMs = useMemo(
    () => (options.pollIntervalMs && options.pollIntervalMs > 0 ? options.pollIntervalMs : 0),
    [options.pollIntervalMs],
  )

  const [config, setConfig] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabaseUrl = options.supabaseUrl ?? getDefaultSupabaseUrl()
    const supabaseKey = options.supabaseKey ?? getDefaultSupabaseKey()

    if (!supabaseUrl || !supabaseKey) {
      setError(
        new Error(
          "Faltan credenciales de Supabase para cargar la configuracion del sistema.",
        ),
      )
      setLoading(false)
      return
    }

    let mounted = true
    let fetching = false
    let pollId: number | null = null
    const supabase = createClient(supabaseUrl, supabaseKey)
    const fetchConfig = async (silent = false) => {
      if (fetching) return
      fetching = true

      if (!silent && mounted) {
        setLoading(true)
      }

      try {
        let query = supabase.from("system_config").select("*")

        if (options.keys?.length) {
          query = query.in("key", options.keys)
        }

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError

        if (mounted) {
          const configMap =
            data?.reduce(
              (acc, item: SystemConfigRow) => {
                acc[item.key] = item.value
                return acc
              },
              {} as Record<string, any>,
            ) ?? {}

          setConfig(configMap)
          if (!silent) {
            setError(null)
          }
        }
      } catch (err) {
        if (mounted && !silent) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (mounted && !silent) {
          setLoading(false)
        }
        fetching = false
      }
    }

    const init = async () => {
      try {
        await fetchConfig(false)

        const filter = options.keys?.length
          ? `key=in.(${options.keys.join(",")})`
          : undefined

        const chan = supabase
          .channel(`system_config_changes_${Math.random().toString(36).substring(2, 9)}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "system_config",
              filter,
            },
            (payload: any) => {
              if (!mounted) return

              if (payload.eventType === "DELETE") {
                setConfig((prev) => {
                  const next = { ...prev }
                  delete next[payload.old.key]
                  return next
                })
                return
              }

              setConfig((prev) => ({
                ...prev,
                [payload.new.key]: payload.new.value,
              }))
            },
          )
          .subscribe()

        channelRef.current = chan

        if (mounted) {
          setLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)))
          setLoading(false)
        }
      }
    }

    init()

    const handleFocus = () => {
      void fetchConfig(true)
    }

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchConfig(true)
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleFocus)
      document.addEventListener("visibilitychange", handleVisibility)
    }

    if (pollIntervalMs > 0 && typeof window !== "undefined") {
      pollId = window.setInterval(() => {
        void fetchConfig(true)
      }, pollIntervalMs)
    }

    return () => {
      mounted = false
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }
      if (pollId) {
        window.clearInterval(pollId)
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleFocus)
        document.removeEventListener("visibilitychange", handleVisibility)
      }
    }
  }, [options.supabaseUrl, options.supabaseKey, keysKey, pollIntervalMs])

  return { config, loading, error }
}
