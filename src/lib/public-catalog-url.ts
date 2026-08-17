const CATALOG_PATH = "/catalogo-publico/"
const STORED_CATALOG_URL_KEY = "arkham_public_catalog_url"

export function getStoredPublicCatalogUrl(): string {
  try {
    return localStorage.getItem(STORED_CATALOG_URL_KEY)?.trim() || ""
  } catch {
    return ""
  }
}

export function savePublicCatalogUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "")
  localStorage.setItem(STORED_CATALOG_URL_KEY, normalized)
  return normalized
}

function normalizeCatalogBaseUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== "https:") {
    throw new Error("La URL pública del catálogo debe usar HTTPS")
  }
  const path = url.pathname.replace(/\/+$/, "")
  if (!path.endsWith("/catalogo-publico")) {
    url.pathname = `${path}/catalogo-publico`.replace(/^\/\//, "/")
  }
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}

/**
 * Obtiene la dirección que debe recibir el cliente.
 *
 * En una aplicación web usamos el dominio desde el que se abrió ARKHAM.
 * Electron carga la aplicación con file://, que nunca debe compartirse;
 * en ese caso se requiere configurar VITE_PUBLIC_CATALOG_URL al compilar.
 */
export function getPublicCatalogUrl(token: string, databaseUrl = ""): string {
  const configuredUrl = databaseUrl.trim() || String(import.meta.env.VITE_PUBLIC_CATALOG_URL || "").trim() || getStoredPublicCatalogUrl()

  if (configuredUrl) {
    const baseUrl = normalizeCatalogBaseUrl(configuredUrl)
    return `${baseUrl}/?token=${encodeURIComponent(token)}`
  }

  if (window.location.protocol === "https:") {
    return `${window.location.origin}${CATALOG_PATH}?token=${encodeURIComponent(token)}`
  }

  throw new Error(
    "La aplicación de escritorio no tiene configurada la URL pública del catálogo. Define VITE_PUBLIC_CATALOG_URL y vuelve a compilar.",
  )
}
