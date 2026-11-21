export const PUBLIC_CATALOG_URL = "https://catalogo049.vercel.app/"

export function getPublicCatalogUrl(token: string): string {
  const url = new URL(PUBLIC_CATALOG_URL)
  url.searchParams.set("token", token)
  return url.toString()
}
