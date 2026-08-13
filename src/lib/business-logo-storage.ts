import { createClient } from "@/lib/supabase/client"
import { formatStorageError } from "@/lib/storage-error"

export const BRANDING_LOGOS_BUCKET = "branding-logos"

const MAX_LOGO_BYTES = 2 * 1024 * 1024

function getLogoExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && ["png", "jpg", "jpeg", "webp", "svg"].includes(fromName)) {
    return fromName === "jpg" ? "jpg" : fromName
  }
  if (file.type.includes("png")) return "png"
  if (file.type.includes("webp")) return "webp"
  if (file.type.includes("svg")) return "svg"
  return "jpg"
}

export function getBusinessLogoStoragePath(ownerAdminId: string, file: File): string {
  const ext = getLogoExtension(file)
  return `${ownerAdminId}/logo.${ext}`
}

export function extractBrandingLogoStoragePath(logoValue: string | null | undefined): string | null {
  if (!logoValue?.trim()) return null
  const value = logoValue.trim()

  if (value.startsWith("data:")) return null

  const marker = "/branding-logos/"
  const idx = value.indexOf(marker)
  if (idx >= 0) {
    return value.slice(idx + marker.length).split("?")[0]
  }

  if (/^[0-9a-f-]{36}\/logo\.[a-z0-9]+$/i.test(value)) return value

  return null
}

export function getBrandingLogoPublicUrl(storagePath: string): string {
  const supabase = createClient()
  const { data } = supabase.storage.from(BRANDING_LOGOS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function uploadBusinessLogoToStorage(
  ownerAdminId: string,
  file: File,
): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
  if (!ownerAdminId) {
    return { success: false, error: "Empresa sin administrador asignado" }
  }

  if (!file.type.startsWith("image/")) {
    return { success: false, error: "El archivo debe ser una imagen" }
  }

  if (file.size > MAX_LOGO_BYTES) {
    return { success: false, error: "El logo no puede superar 2 MB" }
  }

  try {
    const supabase = createClient()
    const storagePath = getBusinessLogoStoragePath(ownerAdminId, file)

    const { error } = await supabase.storage.from(BRANDING_LOGOS_BUCKET).upload(storagePath, file, {
      contentType: file.type || "image/png",
      cacheControl: "3600",
      upsert: true,
    })

    if (error) {
      return {
        success: false,
        error: formatStorageError(BRANDING_LOGOS_BUCKET, error, "No se pudo subir el logo"),
      }
    }

    const basePublicUrl = getBrandingLogoPublicUrl(storagePath)
    const cacheBuster = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const publicUrl = `${basePublicUrl}${basePublicUrl.includes("?") ? "&" : "?"}v=${cacheBuster}`
    return { success: true, publicUrl, storagePath }
  } catch (err) {
    console.error("uploadBusinessLogoToStorage:", err)
    return { success: false, error: "Error inesperado al subir el logo" }
  }
}

export async function deleteBusinessLogoFromStorage(
  logoValue: string | null | undefined,
): Promise<{ success: boolean; error?: string }> {
  const storagePath = extractBrandingLogoStoragePath(logoValue)
  if (!storagePath) return { success: true }

  try {
    const supabase = createClient()
    const { error } = await supabase.storage.from(BRANDING_LOGOS_BUCKET).remove([storagePath])
    if (error) {
      return {
        success: false,
        error: formatStorageError(BRANDING_LOGOS_BUCKET, error, "No se pudo eliminar el logo"),
      }
    }
    return { success: true }
  } catch (err) {
    console.error("deleteBusinessLogoFromStorage:", err)
    return { success: false, error: "Error inesperado al eliminar el logo" }
  }
}
