import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co"
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key"

  client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return client
}
