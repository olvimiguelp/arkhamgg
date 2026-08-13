import { createBrowserClient } from "@supabase/ssr"

let client: ReturnType<typeof createBrowserClient> | null = null

const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      if (attempt === 2) break
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }

  throw lastError
}

export function createClient() {
  if (client) return client

  console.log("[v0] === Supabase Client Debug ===")
  console.log("[v0] VITE_SUPABASE_URL:", import.meta.env.VITE_SUPABASE_URL)
  console.log(
    "[v0] VITE_SUPABASE_ANON_KEY:",
    import.meta.env.VITE_SUPABASE_ANON_KEY ? "***exists***" : "undefined",
  )

  // In browser environment, only VITE_ prefixed variables are available
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co"
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-anon-key"

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    console.warn("[v0] ⚠️ Missing Supabase environment variables. Using placeholder client.")
  }

  console.log("[v0] ✓ Creating Supabase client...")
  client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: fetchWithRetry },
  })
  console.log("[v0] ✓ Supabase client created successfully")

  return client
}
