import { createClient } from "@/lib/supabase/client"

export const REPAIR_PHOTOS_BUCKET = "repair-photos"
export const REPAIR_PHOTO_MAX_BYTES = 4 * 1024 * 1024

export interface RepairPhoto {
  id: string
  repairId: string
  storagePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
  expiresAt: string
  url?: string
}

const extensionFor = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")
  return extension || (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg")
}

export const mapRepairPhoto = (row: any): RepairPhoto => ({
  id: row.id,
  repairId: row.repair_id,
  storagePath: row.storage_path,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes) || 0,
  uploadedAt: row.uploaded_at,
  expiresAt: row.expires_at,
})

export async function uploadRepairPhoto(ownerAdminId: string, repairId: string, file: File) {
  if (!ownerAdminId) throw new Error("No hay tenant activo para guardar la imagen.")
  if (!file.type.startsWith("image/")) throw new Error("Solo se permiten imágenes.")
  if (file.size > REPAIR_PHOTO_MAX_BYTES) throw new Error("Cada imagen debe pesar 4 MB o menos.")

  const supabase = createClient()
  const path = `${ownerAdminId}/repairs/${repairId}/${crypto.randomUUID()}.${extensionFor(file)}`
  const { error: uploadError } = await supabase.storage.from(REPAIR_PHOTOS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw uploadError

  const { data, error: rowError } = await supabase
    .from("repair_photos")
    .insert({
      owner_admin_id: ownerAdminId,
      repair_id: repairId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
    .select()
    .single()

  if (rowError) {
    await supabase.storage.from(REPAIR_PHOTOS_BUCKET).remove([path])
    throw rowError
  }
  return mapRepairPhoto(data)
}

export async function getRepairPhotoUrl(storagePath: string) {
  const { data, error } = await createClient().storage
    .from(REPAIR_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteRepairPhoto(photo: Pick<RepairPhoto, "id" | "storagePath">) {
  const supabase = createClient()
  const { error: storageError } = await supabase.storage.from(REPAIR_PHOTOS_BUCKET).remove([photo.storagePath])
  if (storageError) throw storageError
  const { error } = await supabase.from("repair_photos").delete().eq("id", photo.id)
  if (error) throw error
}
