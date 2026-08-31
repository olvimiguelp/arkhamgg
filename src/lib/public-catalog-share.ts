import { createClient } from "@/lib/supabase/client"

export type PublicCatalogPriceMode = "normal" | "wholesale"

type GetOrCreatePublicCatalogShareOptions = {
  ownerAdminId: string
  priceMode: PublicCatalogPriceMode
  businessName: string
  productIds: string[]
}

/**
 * Los enlaces públicos son permanentes. Reutilizarlos evita crear una nueva
 * fila (y una nueva URL que los clientes volverían a descargar) cada vez que
 * se pulsa compartir.
 */
export async function getOrCreatePublicCatalogShare({
  ownerAdminId,
  priceMode,
  businessName,
  productIds,
}: GetOrCreatePublicCatalogShareOptions): Promise<string> {
  const supabase = createClient()
  const { data: existing, error: lookupError } = await supabase
    .from("catalog_shares")
    .select("token")
    .eq("owner_admin_id", ownerAdminId)
    .eq("price_mode", priceMode)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) throw lookupError
  if (existing?.token) return existing.token

  const token = crypto.randomUUID().replaceAll("-", "")
  const { error: createError } = await supabase.from("catalog_shares").insert({
    token,
    owner_admin_id: ownerAdminId,
    product_ids: productIds,
    price_mode: priceMode,
    business_name: businessName,
    active: true,
  })

  if (createError) throw createError
  return token
}
