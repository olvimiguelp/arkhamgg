import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (client) return client

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en catalogo-publico/.env o en las variables de Vercel.",
    )
  }

  client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return client
}
