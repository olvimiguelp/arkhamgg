/**
 * Supabase connection utilities with retry logic
 * Handles network errors, timeouts, and provides better error detection
 */

export interface SupabaseConnectionConfig {
  maxRetries?: number
  retryDelay?: number
  timeout?: number
}

const DEFAULT_CONFIG: Required<SupabaseConnectionConfig> = {
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  timeout: 10000, // 10 seconds
}

/**
 * Detects if an error is a network/connection error
 */
export function isNetworkError(error: unknown): boolean {
  const message = String((error as any)?.message || "").toLowerCase()
  return (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("net::") ||
    message.includes("cors") ||
    message.includes("timeout") ||
    message.includes("connection refused") ||
    message.includes("econnrefused")
  )
}

/**
 * Detects if an error is an authentication error
 */
export function isAuthError(error: unknown): boolean {
  const message = String((error as any)?.message || "").toLowerCase()
  return (
    message.includes("invalid api key") ||
    message.includes("apikey") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("401") ||
    message.includes("403")
  )
}

/**
 * Detects if an error is a RLS (Row Level Security) error
 */
export function isRLSError(error: unknown): boolean {
  const message = String((error as any)?.message || "").toLowerCase()
  return (
    message.includes("permission denied") ||
    message.includes("row level security") ||
    message.includes("rls")
  )
}

/**
 * Get user-friendly error message from Supabase error
 */
export function getSupabaseErrorMessage(error: unknown, context = ""): string {
  if (isAuthError(error)) {
    return "Clave de Supabase inválida o no permitida para este origen."
  }
  
  if (isRLSError(error)) {
    return "Permiso denegado. Revisa las políticas RLS en Supabase."
  }
  
  if (isNetworkError(error)) {
    return "No se pudo conectar a Supabase. Verifica tu conexión a internet."
  }
  
  const message = String((error as any)?.message || "")
  if (message) {
    return `Error: ${message.substring(0, 100)}`
  }
  
  return context ? `Error en ${context}. Intenta nuevamente.` : "Error de conexión. Intenta nuevamente."
}

/**
 * Retry logic for async functions
 * Useful for handling temporary network issues
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: SupabaseConnectionConfig = {},
): Promise<T> {
  const { maxRetries, retryDelay, timeout } = { ...DEFAULT_CONFIG, ...config }
  
  let lastError: unknown
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout wrapper
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      try {
        const result = await fn()
        clearTimeout(timeoutId)
        return result
      } catch (err) {
        clearTimeout(timeoutId)
        throw err
      }
    } catch (err) {
      lastError = err
      
      // Don't retry on auth errors or RLS errors
      if (isAuthError(err) || isRLSError(err)) {
        throw err
      }
      
      // Retry on network errors
      if (isNetworkError(err) && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt) // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // Don't retry further
      throw err
    }
  }
  
  throw lastError
}

/**
 * Test Supabase connection
 * Useful for debugging connection issues
 */
export async function testSupabaseConnection(supabaseClient: any): Promise<{
  connected: boolean
  error?: string
  latency?: number
}> {
  try {
    const startTime = performance.now()
    
    const { data, error } = await supabaseClient
      .from("employees")
      .select("id")
      .limit(1)
    
    const latency = performance.now() - startTime
    
    if (error) {
      return {
        connected: false,
        error: getSupabaseErrorMessage(error),
      }
    }
    
    return {
      connected: true,
      latency: Math.round(latency),
    }
  } catch (err) {
    return {
      connected: false,
      error: getSupabaseErrorMessage(err, "test de conexión"),
    }
  }
}

/**
 * Format connection error with helpful suggestions
 */
export function formatConnectionError(error: unknown, operation = "operación"): string {
  const baseMessage = getSupabaseErrorMessage(error, operation)
  
  if (isNetworkError(error)) {
    return `${baseMessage}\n\nSugerencias:\n- Verifica tu conexión a internet\n- Intenta recargar la página\n- Verifica si el servidor de Supabase está disponible`
  }
  
  if (isAuthError(error)) {
    return `${baseMessage}\n\nSugerencias:\n- Verifica tu VITE_SUPABASE_URL\n- Verifica tu VITE_SUPABASE_KEY\n- Asegúrate de usar la clave correcta (anon key)`
  }
  
  if (isRLSError(error)) {
    return `${baseMessage}\n\nSugerencias:\n- Verifica las políticas RLS en tu tabla\n- Asegúrate de tener permisos de lectura/escritura`
  }
  
  return baseMessage
}
