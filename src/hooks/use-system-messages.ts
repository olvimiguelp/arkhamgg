import { useEffect, useMemo, useRef, useState } from "react"
import { createClient, RealtimeChannel } from "@supabase/supabase-js"

export interface SystemMessage {
  id: string
  title: string
  content: string
  message_type: "info" | "warning" | "error" | "success"
  priority: number
  is_active: boolean
  created_at: string
  expires_at?: string | null
  target_version?: string | null
  download_url?: string | null
}

interface UseSystemMessagesOptions {
  supabaseUrl?: string
  supabaseKey?: string
  onlyActive?: boolean
}

const getDefaultSupabaseUrl = () =>
  (import.meta.env.VITE_SYSTEM_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)

const getDefaultSupabaseKey = () =>
  (import.meta.env.VITE_SYSTEM_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

const isExpired = (message: SystemMessage) => {
  if (!message.expires_at) return false
  return new Date(message.expires_at) < new Date()
}

export function useSystemMessages(options: UseSystemMessagesOptions = {}) {
  const onlyActive = options.onlyActive !== false
  const [messages, setMessages] = useState<SystemMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [dismissedUntil, setDismissedUntil] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const configKey = useMemo(
    () =>
      [
        options.supabaseUrl ?? getDefaultSupabaseUrl(),
        options.supabaseKey ? "custom" : "default",
        onlyActive ? "active" : "all",
      ].join("|"),
    [options.supabaseUrl, options.supabaseKey, onlyActive],
  )

  const storageKey = useMemo(() => {
    const url = options.supabaseUrl ?? getDefaultSupabaseUrl() ?? "default"
    return `system_messages_dismissed_until|${url}`
  }, [options.supabaseUrl])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        setDismissedUntil(stored)
      }
    } catch {
      // ignore storage errors
    }
  }, [storageKey])

  useEffect(() => {
    const supabaseUrl = options.supabaseUrl ?? getDefaultSupabaseUrl()
    const supabaseKey = options.supabaseKey ?? getDefaultSupabaseKey()

    if (!supabaseUrl || !supabaseKey) {
      setError(
        new Error(
          "Faltan credenciales de Supabase para cargar mensajes del sistema.",
        ),
      )
      setLoading(false)
      return
    }

    let mounted = true
    const supabase = createClient(supabaseUrl, supabaseKey)

    const init = async () => {
      try {
        let query = supabase
          .from("system_messages")
          .select("*")
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })

        if (onlyActive) {
          query = query.eq("is_active", true)
        }

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError

        if (mounted) {
          const filtered = (data ?? [])
            .filter((msg) => (onlyActive ? !isExpired(msg as SystemMessage) : true))
          setMessages(filtered as SystemMessage[])
        }

        const chan = supabase
          .channel(`system_messages_changes_${Math.random().toString(36).substring(2, 9)}`)
          .on(
            "broadcast",
            { event: "table_changes" },
            (payload: any) => {
              if (!mounted) return

              const data = JSON.parse(payload.payload);
              if (data.table !== "system_messages") return;

              if (data.type === "DELETE") {
                setMessages((prev) =>
                  prev.filter((msg) => msg.id !== data.record.id),
                )
                return
              }

              const nextMessage = data.record as SystemMessage

              if (onlyActive) {
                if (
                  !nextMessage.is_active ||
                  isExpired(nextMessage)
                ) {
                  setMessages((prev) =>
                    prev.filter((msg) => msg.id !== nextMessage.id),
                  )
                  return
                }
              }

              setMessages((prev) => {
                const existingIndex = prev.findIndex(
                  (msg) => msg.id === nextMessage.id,
                )

                if (existingIndex === -1) {
                  return [nextMessage, ...prev].sort(
                    (a, b) => b.priority - a.priority,
                  )
                }

                const next = [...prev]
                next[existingIndex] = nextMessage
                return next
              })
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

    return () => {
      mounted = false
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }
    }
  }, [configKey, onlyActive])

  const dismiss = (messageId: string) => {
    const target = messages.find((msg) => msg.id === messageId)
    const cutoff = target?.created_at || new Date().toISOString()
    setDismissedUntil(cutoff)
    setDismissedIds((prev) => new Set([...prev, messageId]))
  }

  useEffect(() => {
    try {
      if (dismissedUntil) {
        localStorage.setItem(storageKey, dismissedUntil)
      }
    } catch {
      // ignore storage errors
    }
  }, [dismissedUntil, storageKey])

  const visibleMessages = messages.filter((msg) => {
    if (dismissedIds.has(msg.id)) return false
    if (dismissedUntil) {
      const msgTime = new Date(msg.created_at).getTime()
      const cutoffTime = new Date(dismissedUntil).getTime()
      if (!Number.isNaN(msgTime) && msgTime <= cutoffTime) {
        return false
      }
    }
    return true
  })

  return { messages: visibleMessages, loading, error, dismiss, dismissedIds }
}
