import { createClient } from "@/lib/supabase/client"
import { formatStorageError } from "@/lib/storage-error"

export const PRODUCT_IMAGES_BUCKET = "product-images"

const MAX_IMAGE_BYTES = 4 * 1024 * 1024 // 4 MB
const FULL_IMAGE_MAX_EDGE = 1280
const THUMBNAIL_MAX_EDGE = 360
const FULL_IMAGE_QUALITY = 0.82
const THUMBNAIL_QUALITY = 0.72
const VERSIONED_CACHE_SECONDS = "31536000"
const MAX_LEGACY_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_LEGACY_SOURCE_PIXELS = 16_000_000

type ProductImageStoragePaths = {
  full: string
  thumbnail: string
}

function getProductImageStoragePaths(productId: string): ProductImageStoragePaths {
  // Cada versión se guarda en una ruta nueva. Así podemos usar caché larga sin
  // mostrar una foto anterior después de cambiarla.
  const version = `${Date.now()}-${crypto.randomUUID()}`
  return {
    full: `${productId}/${version}-full.webp`,
    thumbnail: `${productId}/${version}-thumb.webp`,
  }
}

export function getProductImagePublicUrl(storagePath: string): string {
  const supabase = createClient()
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

export async function deleteProductImageFromStorage(storagePath: string): Promise<void> {
  if (!storagePath) return

  try {
    const supabase = createClient()
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath])
    if (error) console.error("No se pudo borrar la imagen temporal:", error)
  } catch (error) {
    console.error("No se pudo borrar la imagen temporal:", error)
  }
}

/** Sólo intentamos procesar objetos propios: una URL externa puede no permitir CORS. */
export function isProductImageStorageUrl(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ""
    if (!supabaseUrl) return false
    const projectUrl = new URL(supabaseUrl)
    const image = new URL(imageUrl)
    const publicPath = `/storage/v1/object/public/${PRODUCT_IMAGES_BUCKET}/`
    return image.origin === projectUrl.origin && image.pathname.startsWith(publicPath)
  } catch {
    return false
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("No se pudo leer la imagen seleccionada"))
    }
    image.src = objectUrl
  })
}

function createWebpVariant(image: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob> {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  if (!sourceWidth || !sourceHeight) return Promise.reject(new Error("La imagen no tiene dimensiones válidas"))

  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) return Promise.reject(new Error("El navegador no pudo preparar la imagen"))

  context.drawImage(image, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error("No se pudo optimizar la imagen"))
    }, "image/webp", quality)
  })
}

async function createOptimizedProductImages(file: File): Promise<{ full: Blob; thumbnail: Blob }> {
  const image = await loadImage(file)
  const [full, thumbnail] = await Promise.all([
    createWebpVariant(image, FULL_IMAGE_MAX_EDGE, FULL_IMAGE_QUALITY),
    createWebpVariant(image, THUMBNAIL_MAX_EDGE, THUMBNAIL_QUALITY),
  ])
  return { full, thumbnail }
}

/**
 * Crea la miniatura de una imagen que ya estaba en Storage antes de esta
 * optimización. Descarga el original una sola vez, lo reduce en el navegador
 * del administrador y guarda únicamente la variante WebP pequeña.
 */
export async function createProductImageThumbnailFromUrl(
  productId: string,
  imageUrl: string,
): Promise<{ success: boolean; thumbnailUrl?: string; storagePath?: string; error?: string }> {
  if (!productId) return { success: false, error: "Product id required" }
  if (!imageUrl) return { success: false, error: "La imagen original no tiene una URL válida" }
  if (!isProductImageStorageUrl(imageUrl)) {
    return { success: false, error: "La imagen no está alojada en product-images y no se puede optimizar automáticamente" }
  }

  try {
    const response = await fetch(imageUrl, { cache: "force-cache" })
    if (!response.ok) {
      return { success: false, error: `No se pudo descargar la imagen original (${response.status})` }
    }

    const contentLength = Number(response.headers.get("content-length") || 0)
    if (Number.isFinite(contentLength) && contentLength > MAX_LEGACY_SOURCE_BYTES) {
      return { success: false, error: "La imagen original es demasiado grande para optimizarla en el navegador" }
    }

    const original = await response.blob()
    if (original.size > MAX_LEGACY_SOURCE_BYTES) {
      return { success: false, error: "La imagen original es demasiado grande para optimizarla en el navegador" }
    }
    if (!original.type.startsWith("image/")) {
      return { success: false, error: "El archivo original no es una imagen válida" }
    }

    const image = await loadImage(original)
    if ((image.naturalWidth || image.width) * (image.naturalHeight || image.height) > MAX_LEGACY_SOURCE_PIXELS) {
      return { success: false, error: "La imagen tiene demasiados píxeles para optimizarla en el navegador" }
    }
    const thumbnail = await createWebpVariant(image, THUMBNAIL_MAX_EDGE, THUMBNAIL_QUALITY)
    const path = getProductImageStoragePaths(productId).thumbnail
    const supabase = createClient()
    const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, thumbnail, {
      contentType: "image/webp",
      cacheControl: VERSIONED_CACHE_SECONDS,
      upsert: false,
    })

    if (error) {
      return { success: false, error: formatStorageError(PRODUCT_IMAGES_BUCKET, error, "No se pudo subir la miniatura") }
    }

    return {
      success: true,
      thumbnailUrl: getProductImagePublicUrl(path),
      storagePath: path,
    }
  } catch (err) {
    console.error("createProductImageThumbnailFromUrl:", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "No se pudo crear la miniatura de esta imagen",
    }
  }
}

export async function uploadProductImageToStorage(
  productId: string,
  file: File,
): Promise<{ success: boolean; publicUrl?: string; thumbnailUrl?: string; storagePath?: string; error?: string }> {
  if (!productId) return { success: false, error: "Product id required" }
  if (!file.type.startsWith("image/")) return { success: false, error: "El archivo debe ser una imagen" }
  if (file.size > MAX_IMAGE_BYTES) return { success: false, error: "La imagen no puede superar 4 MB" }

  try {
    const supabase = createClient()
    const paths = getProductImageStoragePaths(productId)
    const optimizedImages = await createOptimizedProductImages(file)

    const { error: fullError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(paths.full, optimizedImages.full, {
      contentType: "image/webp",
      cacheControl: VERSIONED_CACHE_SECONDS,
      upsert: false,
    })

    if (fullError) {
      return { success: false, error: formatStorageError(PRODUCT_IMAGES_BUCKET, fullError, "No se pudo subir la imagen") }
    }

    const { error: thumbnailError } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(paths.thumbnail, optimizedImages.thumbnail, {
      contentType: "image/webp",
      cacheControl: VERSIONED_CACHE_SECONDS,
      upsert: false,
    })

    if (thumbnailError) {
      // No dejamos un objeto huérfano si no se pudo completar el par de imágenes.
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([paths.full])
      return { success: false, error: formatStorageError(PRODUCT_IMAGES_BUCKET, thumbnailError, "No se pudo crear la miniatura") }
    }

    return {
      success: true,
      publicUrl: getProductImagePublicUrl(paths.full),
      thumbnailUrl: getProductImagePublicUrl(paths.thumbnail),
      storagePath: paths.full,
    }
  } catch (err) {
    console.error("uploadProductImageToStorage:", err)
    return { success: false, error: "Error inesperado al subir la imagen" }
  }
}
