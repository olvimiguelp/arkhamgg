const CATALOG_PATH = "/catalogo-publico/"

/**
 * Obtiene la dirección que debe recibir el cliente.
 *
 * En una aplicación web usamos el dominio desde el que se abrió ARKHAM.
 * Electron carga la aplicación con file://, que nunca debe compartirse;
 * en ese caso se requiere configurar VITE_PUBLIC_CATALOG_URL al compilar.
 */
export function getPublicCatalogUrl(token: string): string {
  const configuredUrl = String(import.meta.env.VITE_PUBLIC_CATALOG_URL || "").trim()

  if (configuredUrl) {
    const baseUrl = configuredUrl.endsWith("/") ? configuredUrl : `${configuredUrl}/`
    return `${baseUrl}?token=${encodeURIComponent(token)}`
  }

  if (/^https?:$/i.test(window.location.protocol)) {
    return `${window.location.origin}${CATALOG_PATH}?token=${encodeURIComponent(token)}`
  }

  throw new Error(
    "La aplicación de escritorio no tiene configurada la URL pública del catálogo. Define VITE_PUBLIC_CATALOG_URL y vuelve a compilar.",
  )
}
