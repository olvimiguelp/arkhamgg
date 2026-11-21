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
  const requestedProductIds = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))]
  if (requestedProductIds.length === 0) {
    throw new Error("No hay productos disponibles para compartir en este catálogo.")
  }

  const supabase = createClient()
  const productIdChunks = Array.from(
    { length: Math.ceil(requestedProductIds.length / 200) },
    (_, index) => requestedProductIds.slice(index * 200, (index + 1) * 200),
  )
  const productResults = await Promise.all(
    productIdChunks.map((ids) =>
      supabase.from(sourceTable).select("id").eq("owner_admin_id", ownerAdminId).in("id", ids),
    ),
  )
  const productsError = productResults.find((result) => result.error)?.error
  if (productsError) throw productsError

  const allowedProductIds = new Set(
    productResults.flatMap((result) => (result.data || []).map((product) => String(product.id))),
  )
  const unauthorizedProducts = requestedProductIds.filter((id) => !allowedProductIds.has(id))
  if (unauthorizedProducts.length > 0) {
    throw new Error("El catálogo contiene productos que no pertenecen a esta empresa. Recarga los productos e inténtalo de nuevo.")
  }

  if (sourceTable === "products") {
    const lookup = supabase
      .from("catalog_shares")
      .select("id, token")
      .eq("owner_admin_id", ownerAdminId)
      .eq("price_mode", priceMode)
      .eq("source_table", sourceTable)
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .is("category_filter", null)
      .is("catalog_categories", null)
    const { data: existing, error: lookupError } = await lookup
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (existing?.token) {
      const { error: updateError } = await supabase
        .from("catalog_shares")
        .update({ product_ids: requestedProductIds, business_name: businessName })
        .eq("id", existing.id)
        .eq("owner_admin_id", ownerAdminId)

      if (updateError) throw updateError
      return existing.token
    }
  }

  const token = crypto.randomUUID().replace(/-/g, "")
  const { error: createError } = await supabase.from("catalog_shares").insert({
    token,
    owner_admin_id: ownerAdminId,
    product_ids: requestedProductIds,
    price_mode: priceMode,
    source_table: sourceTable,
    category_filter: category,
    ...(sourceTable === "armacen" ? { individual_categories: true } : {}),
    business_name: businessName,
    active: true,
  })

  if (createError) throw createError
  return token
}
