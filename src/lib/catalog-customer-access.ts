import { createClient } from "@/lib/supabase/client"

export type CatalogCustomerAccount = {
  id: string
  name: string
  phone: string
  is_active: boolean
  created_at: string
}

export type CatalogOrderHistoryItem = {
  id?: string
  name?: string
  quantity?: number
}

export type CatalogOrderHistory = {
  id: string
  catalog_customer_id: string | null
  invoice_number: string
  customer_name: string
  customer_phone: string
  items: CatalogOrderHistoryItem[]
  total: number
  created_at: string
}

type StaffCredentials = {
  actor_id: string
  actor_password: string
}

type CreateAccountRequest = StaffCredentials & {
  action: "create"
  name: string
  phone: string
  password: string
}

type OverviewRequest = StaffCredentials & {
  action: "overview"
}

type CreateAccountResponse = { customer: CatalogCustomerAccount }
type OverviewResponse = { customers: CatalogCustomerAccount[]; orders: CatalogOrderHistory[] }

export function invokeCatalogCustomerAccess(request: CreateAccountRequest): Promise<CreateAccountResponse>
export function invokeCatalogCustomerAccess(request: OverviewRequest): Promise<OverviewResponse>
export async function invokeCatalogCustomerAccess(
  request: CreateAccountRequest | OverviewRequest,
): Promise<CreateAccountResponse | OverviewResponse> {
  const { data, error } = await createClient().functions.invoke("catalog-customer-access", {
    body: request,
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

  return data as CreateAccountResponse | OverviewResponse
}
