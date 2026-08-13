import { createClient } from "@/lib/supabase/client"
import { formatStorageError } from "@/lib/storage-error"

export const PRODUCT_IMAGES_BUCKET = "product-images"

const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // 4 MB

function getImageExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && ["png", "jpg", "jpeg", "webp", "svg"].includes(fromName)) {
    return fromName === "jpg" ? "jpg" : fromName
  }
  if (file.type.includes("png")) return "png"
  if (file.type.includes("webp")) return "webp"
  return "jpg"
}

export function getProductImageStoragePath(productId: string, file: File): string {
  const ext = getImageExtension(file)
  // use timestamp to avoid collisions
  return `${productId}/${Date.now()}.${ext}`
}

export function getProductImagePublicUrl(storagePath: string): string {
  const supabase = createClient()
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function uploadProductImageToStorage(
  productId: string,
  file: File,
): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; error?: string }> {
  if (!productId) return { success: false, error: "Product id required" }
  if (!file.type.startsWith("image/")) return { success: false, error: "El archivo debe ser una imagen" }
  if (file.size > MAX_IMAGE_BYTES) return { success: false, error: "La imagen no puede superar 4 MB" }

  try {
    const supabase = createClient()
    const storagePath = getProductImageStoragePath(productId, file)

    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(storagePath, file, {
      contentType: file.type || "image/png",
      cacheControl: "3600",
      upsert: false,
    })

    if (error) {
      return { success: false, error: formatStorageError(PRODUCT_IMAGES_BUCKET, error, "No se pudo subir la imagen") }
    }

    const publicUrl = getProductImagePublicUrl(storagePath)
    return { success: true, publicUrl, storagePath }
  } catch (err) {
    console.error("uploadProductImageToStorage:", err)
    return { success: false, error: "Error inesperado al subir la imagen" }
  }
}
