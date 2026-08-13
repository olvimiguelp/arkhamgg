import { NOMBRECONFI } from "@/nombreconfi"
import { getPublicAssetPath } from "@/lib/public-asset"

const PRINT_LOGO_FILE_NAME = NOMBRECONFI.logoFile

const getPublicAssetMimeType = (fileName: string) => {
  const lowerFileName = fileName.toLowerCase()

  if (lowerFileName.endsWith(".png")) return "image/png"
  if (lowerFileName.endsWith(".svg")) return "image/svg+xml"
  if (lowerFileName.endsWith(".webp")) return "image/webp"

  return "image/jpeg"
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen del logo"))
    reader.readAsDataURL(blob)
  })

const readFileAsDataUrlInElectron = (assetUrl: string) => {
  if (typeof window === "undefined" || !assetUrl.startsWith("file:")) return null

  try {
    const electronRequire = (window as Window & { require?: (module: string) => any }).require
    if (typeof electronRequire !== "function") return null

    const fs = electronRequire("fs")
    const { fileURLToPath } = electronRequire("url")
    const filePath = fileURLToPath(assetUrl)
    const fileBuffer = fs.readFileSync(filePath)

    return `data:${getPublicAssetMimeType(PRINT_LOGO_FILE_NAME)};base64,${fileBuffer.toString("base64")}`
  } catch (error) {
    console.error("No se pudo leer el logo de impresion desde Electron", error)
    return null
  }
}

export const getPrintLogoUrl = () => {
  if (typeof window === "undefined") return getPublicAssetPath(PRINT_LOGO_FILE_NAME)

  try {
    return new URL(getPublicAssetPath(PRINT_LOGO_FILE_NAME), window.location.href).href
  } catch (error) {
    console.error("No se pudo resolver la ruta del logo de impresion", error)
    return getPublicAssetPath(PRINT_LOGO_FILE_NAME)
  }
}

export const loadPrintLogoDataUrl = async () => {
  const assetUrl = getPrintLogoUrl()

  try {
    const response = await fetch(assetUrl)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await blobToDataUrl(await response.blob())
  } catch (error) {
    const electronFallback = readFileAsDataUrlInElectron(assetUrl)
    if (electronFallback) return electronFallback

    console.error("No se pudo cargar el logo de impresion", error)
    return null
  }
}
