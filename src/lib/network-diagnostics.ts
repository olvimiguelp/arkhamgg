/**
 * Network diagnostics and fallback utilities
 * Helps diagnose connection issues and provides offline/retry capabilities
 */

/**
 * Test basic internet connectivity
 */
export async function testInternetConnectivity(): Promise<{
  hasInternet: boolean
  latency?: number
  provider?: string
}> {
  try {
    const startTime = performance.now()
    
    // Test with a fast, reliable endpoint
    const response = await fetch("https://1.1.1.1/dns-query", {
      method: "HEAD",
      mode: "no-cors",
      timeout: 5000,
    }).catch(() =>
      fetch("https://www.google.com/favicon.ico", {
        method: "HEAD",
        mode: "no-cors",
      })
    )
    
    const latency = performance.now() - startTime
    
    return {
      hasInternet: true,
      latency: Math.round(latency),
      provider: "generic",
    }
  } catch {
    return { hasInternet: false }
  }
}

/**
 * Test DNS resolution for Supabase domain
 */
export async function testSupabaseDNS(): Promise<{
  canResolve: boolean
  domain: string
  error?: string
}> {
  try {
    // Try to fetch from Supabase with a quick timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    
    await fetch("https://pqcgzkvnfvefzettyxkg.supabase.co/rest/v1/", {
      method: "HEAD",
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    return { canResolve: true, domain: "pqcgzkvnfvefzettyxkg.supabase.co" }
  } catch (err) {
    const message = String((err as any)?.message || "").toLowerCase()
    return {
      canResolve: false,
      domain: "pqcgzkvnfvefzettyxkg.supabase.co",
      error: message.includes("abort")
        ? "Timeout - posible problema de DNS"
        : message.includes("cors")
          ? "CORS bloqueado - posible firewall/proxy"
          : "No se puede resolver - verifica DNS",
    }
  }
}

/**
 * Test specific Supabase operations
 */
export async function testSupabaseOperations(
  supabaseClient: any,
  projectUrl: string,
): Promise<{
  canConnect: boolean
  tests: {
    dnsResolution: boolean
    apiResponse: boolean
    authentication: boolean
  }
  recommendations: string[]
}> {
  const recommendations: string[] = []
  const tests = {
    dnsResolution: false,
    apiResponse: false,
    authentication: false,
  }
  
  // Test 1: DNS Resolution
  const dnsTest = await testSupabaseDNS()
  tests.dnsResolution = dnsTest.canResolve
  
  if (!tests.dnsResolution) {
    recommendations.push("❌ DNS Resolution falla - Posibles causas:")
    recommendations.push("   1. Tu red WiFi tiene problemas de DNS")
    recommendations.push("   2. ISP está bloqueando Supabase")
    recommendations.push("   3. Proxy o firewall en la red")
    recommendations.push("   📝 Soluciones:")
    recommendations.push("   - Intenta con la red 'buena'")
    recommendations.push("   - Cambia DNS del router a 1.1.1.1 o 8.8.8.8")
    recommendations.push("   - Reinicia el router")
  }
  
  // Test 2: API Response
  try {
    const response = await fetch(`${projectUrl}/rest/v1/`, {
      method: "HEAD",
      headers: { "Accept": "application/json" },
    })
    tests.apiResponse = response.ok || response.status === 401
    
    if (!tests.apiResponse) {
      recommendations.push(`❌ API Response: HTTP ${response.status}`)
    }
  } catch (err) {
    const message = String((err as any)?.message || "")
    recommendations.push(`❌ API Response: ${message}`)
  }
  
  // Test 3: Authentication (simple test without credentials)
  try {
    const response = await fetch(
      `${projectUrl}/rest/v1/rpc/heartbeat`,
      { method: "GET" },
    )
    // 401 is ok - means server is reachable but we're not authenticated
    tests.authentication = response.status === 401 || response.status === 200
  } catch {
    tests.authentication = false
    recommendations.push("❌ No se puede alcanzar los endpoints de Supabase")
  }
  
  const canConnect = tests.dnsResolution && tests.apiResponse
  
  if (canConnect && !tests.authentication) {
    recommendations.push("⚠️  Supabase es alcanzable pero hay problemas de autenticación")
    recommendations.push("   - Verifica VITE_SUPABASE_KEY")
  }
  
  if (!recommendations.length && canConnect) {
    recommendations.push("✅ Conexión a Supabase funciona correctamente")
  }
  
  return { canConnect, tests, recommendations }
}

/**
 * Detailed network diagnostics
 */
export async function runNetworkDiagnostics(
  supabaseClient: any,
  projectUrl: string,
): Promise<{
  status: "connected" | "network-issue" | "dns-issue" | "unknown"
  details: {
    internetConnectivity: Awaited<ReturnType<typeof testInternetConnectivity>>
    supabaseDNS: Awaited<ReturnType<typeof testSupabaseDNS>>
    supabaseOperations: Awaited<ReturnType<typeof testSupabaseOperations>>
  }
  suggestions: string[]
}> {
  const internetTest = await testInternetConnectivity()
  const dnsTest = await testSupabaseDNS()
  const opsTest = await testSupabaseOperations(supabaseClient, projectUrl)
  
  const suggestions: string[] = []
  let status: "connected" | "network-issue" | "dns-issue" | "unknown" = "unknown"
  
  if (!internetTest.hasInternet) {
    status = "network-issue"
    suggestions.push("❌ No hay conexión a internet")
    suggestions.push("📝 Intenta:")
    suggestions.push("   1. Verifica que estés conectado a WiFi")
    suggestions.push("   2. Recarga la página")
    suggestions.push("   3. Reinicia el router")
  } else if (!dnsTest.canResolve) {
    status = "dns-issue"
    suggestions.push("❌ DNS de Supabase no responde desde tu red")
    suggestions.push("📝 Intenta:")
    suggestions.push("   1. Cambia a la red 'buena' temporalmente")
    suggestions.push("   2. En el router, cambia DNS a:")
    suggestions.push("      - 1.1.1.1 (Cloudflare)")
    suggestions.push("      - 8.8.8.8 (Google)")
    suggestions.push("   3. Reinicia el router y vuelve a conectarte")
  } else if (opsTest.canConnect) {
    status = "connected"
    suggestions.push("✅ Conexión a Supabase funciona")
  } else {
    suggestions.push(...opsTest.recommendations)
  }
  
  return {
    status,
    details: {
      internetConnectivity: internetTest,
      supabaseDNS: dnsTest,
      supabaseOperations: opsTest,
    },
    suggestions,
  }
}

/**
 * Get network info (online/offline status)
 */
export function getNetworkStatus(): {
  isOnline: boolean
  effectiveType: string
  downlink?: number
  rtt?: number
} {
  const navigator = (globalThis as any).navigator
  const connection =
    navigator?.connection ||
    navigator?.mozConnection ||
    navigator?.webkitConnection
  
  return {
    isOnline: navigator?.onLine ?? true,
    effectiveType: connection?.effectiveType || "unknown",
    downlink: connection?.downlink,
    rtt: connection?.rtt,
  }
}

/**
 * Retry with exponential backoff, specifically designed for network issues
 */
export async function retryWithNetworkCheck<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: Error | undefined
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const networkStatus = getNetworkStatus()
    
    if (!networkStatus.isOnline) {
      throw new Error("No hay conexión a internet")
    }
    
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error
      
      if (attempt < maxAttempts - 1) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError || new Error("Failed after multiple attempts")
}
