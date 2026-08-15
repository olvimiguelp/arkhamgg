import { createClient } from "@/lib/supabase/client"
import { formatStorageError } from "@/lib/storage-error"

/**
 * Bucket dedicado a los adjuntos de facturas de proveedores (PDF o fotos de
 * facturas físicas) y a los comprobantes de abonos. Se usa un bucket propio
 * (distinto de "facturas", que solo acepta PDF/JSON para facturas de venta)
 * porque aquí también se suben fotos tomadas con el celular.
 *
 * Crear el bucket y sus políticas con: src/scripts/061-create-purchase-attachments.sql
 */
export const PURCHASE_ATTACHMENTS_BUCKET = "facturas-proveedores"

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // 10 MB

function getAttachmentExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase()
  if (fromName && ["pdf", "png", "jpg", "jpeg", "webp"].includes(fromName)) {
    return fromName === "jpg" ? "jpg" : fromName
  }
  if (file.type === "application/pdf") return "pdf"
  if (file.type.includes("png")) return "png"
  if (file.type.includes("webp")) return "webp"
  return "jpg"
}

export function isValidPurchaseAttachment(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/")
}

export function getPurchaseAttachmentPublicUrl(storagePath: string): string {
  const supabase = createClient()
  const { data } = supabase.storage.from(PURCHASE_ATTACHMENTS_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

/**
 * Sube el documento de una factura de compra o el comprobante de un abono.
 * `folder` agrupa los archivos, por ejemplo "facturas" o "abonos".
 */
export async function uploadPurchaseAttachment(
  file: File,
  folder: "facturas" | "abonos",
): Promise<{ success: boolean; publicUrl?: string; storagePath?: string; contentType?: string; error?: string }> {
  if (!isValidPurchaseAttachment(file)) {
    return { success: false, error: "Solo se permiten archivos PDF o imágenes (foto de la factura)." }
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { success: false, error: "El archivo no puede superar 10 MB." }
  }

  try {
    const supabase = createClient()
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const ext = getAttachmentExtension(file)
    const storagePath = `${folder}/${year}/${month}/${Date.now()}-${crypto.randomUUID()}.${ext}`

    const { error } = await supabase.storage.from(PURCHASE_ATTACHMENTS_BUCKET).upload(storagePath, file, {
      contentType: file.type || (ext === "pdf" ? "application/pdf" : "image/jpeg"),
      cacheControl: "3600",
      upsert: false,
    })

    if (error) {
      return {
        success: false,
        error: formatStorageError(PURCHASE_ATTACHMENTS_BUCKET, error, "No se pudo subir el archivo adjunto"),
      }
    }

    const publicUrl = getPurchaseAttachmentPublicUrl(storagePath)
    return { success: true, publicUrl, storagePath, contentType: file.type }
  } catch (err) {
    console.error("uploadPurchaseAttachment:", err)
    return { success: false, error: "Error inesperado al subir el archivo adjunto" }
  }
}
