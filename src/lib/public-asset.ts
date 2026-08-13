/** Ruta publica (carpeta public/) con segmentos codificados para URL. */
export function encodePublicAssetSegments(filePath: string): string {
  return filePath.split("/").map(encodeURIComponent).join("/")
}

/** Ruta usable en img/src, favicon, etc. Respeta Vite base (./ en Electron). */
export function getPublicAssetPath(filePath: string): string {
  const base = import.meta.env.BASE_URL || "/"
  return `${base}${encodePublicAssetSegments(filePath)}`
}
