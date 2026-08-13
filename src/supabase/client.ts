import { createClient } from "@supabase/supabase-js"

// Cliente central de Supabase para toda la app.
// Asegurate de definir en tu `.env` o `.env.local`:
// VITE_SUPABASE_URL=https://xxxxx.supabase.co
// VITE_SUPABASE_ANON_KEY=eyJhbGciOi...

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://placeholder.supabase.co"
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "placeholder-anon-key"

if (!supabaseUrl || !supabaseAnonKey) {
  // Esto no rompe la app en tiempo de build, pero ayuda a detectar el problema en desarrollo.
  console.warn(
    "[Supabase] Falta configurar VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el entorno de Vite.",
  )
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "")
