import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { createClient as getAppClient } from "@/lib/supabase/client"

export const getDefaultSupabaseUrl = () =>
  (import.meta.env.VITE_SYSTEM_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)

export const getDefaultSupabaseKey = () =>
  (import.meta.env.VITE_SYSTEM_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

const systemClients = new Map<string, SupabaseClient>()

export function getSystemClient(url: string, key: string) {
  if (url === import.meta.env.VITE_SUPABASE_URL && key === import.meta.env.VITE_SUPABASE_ANON_KEY) {
    return getAppClient()
  }

  const cacheKey = JSON.stringify([url, key])
  let client = systemClients.get(cacheKey)
  if (!client) {
    client = createClient(url, key)
    systemClients.set(cacheKey, client)
  }
  return client
}
