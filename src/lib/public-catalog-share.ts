import { createClient } from "@/lib/supabase/client"

export type PublicCatalogPriceMode = "normal" | "wholesale"
export type PublicCatalogSource = "products" | "armacen"

type GetOrCreatePublicCatalogShareOptions = {
  ownerAdminId: string
  priceMode: PublicCatalogPriceMode
  businessName: string
  productIds: string[]
  sourceTable?: PublicCatalogSource
  categoryFilter?: string
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
  sourceTable = "products",
  categoryFilter,
}: GetOrCreatePublicCatalogShareOptions): Promise<string> {
  const category = sourceTable === "armacen" ? categoryFilter?.trim() : null
  if (sourceTable === "armacen" && !category) {
    throw new Error("Selecciona una categoría del almacén.")
  }
  const supabase = createClient()
  let lookup = supabase
    .from("catalog_shares")
    .select("token")
    .eq("owner_admin_id", ownerAdminId)
    .eq("price_mode", priceMode)
    .eq("source_table", sourceTable)
    .eq("active", true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  lookup = category ? lookup.eq("category_filter", category) : lookup.is("category_filter", null)
  const { data: existing, error: lookupError } = await lookup
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
    source_table: sourceTable,
    category_filter: category,
    business_name: businessName,
    active: true,
  })

  if (createError) throw createError
  return token
}
