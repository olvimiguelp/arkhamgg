import type { createClient } from "./supabase/client"

type SupabaseClient = ReturnType<typeof createClient>

export async function invokeCatalogCustomerAccess(
  supabase: SupabaseClient,
  request: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("catalog-customer-access", {
    body: request,
    signal,
  })

  if (error) {
    let message = error.message
    if ("context" in error && error.context instanceof Response) {
      try {
        const body: unknown = await error.context.clone().json()
        if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
          message = body.error
        }
      } catch {
        // Keep the original Supabase error when the response is not JSON.
      }
    }
    throw new Error(message)
  }

  if (!data || typeof data !== "object") {
    throw new Error("La función de clientes del catálogo devolvió una respuesta inválida")
  }

  return data as Record<string, unknown>
}
