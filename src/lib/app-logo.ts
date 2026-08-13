import { NOMBRECONFI } from "@/nombreconfi"
import { getPublicAssetPath } from "@/lib/public-asset"

/** Ruta publica del logo (carpeta public/). */
export const getAppLogoPath = () => getPublicAssetPath(NOMBRECONFI.logoFile)

export const getAppLogoUrl = () => {
  if (typeof window === "undefined") return getAppLogoPath()

  try {
    return new URL(getAppLogoPath(), window.location.href).href
  } catch {
    return getAppLogoPath()
  }
}
