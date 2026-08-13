import { createClient } from "@/lib/supabase/client"
import { formatStorageError } from "@/lib/storage-error"

/**
 * Guarda un reporte (PDF o Excel) en Supabase Storage
 */
export async function uploadReportToStorage(
    file: Blob | File,
    fileName: string,
    type: "pdf" | "excel",
): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
        const supabase = createClient()
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, "0")

        // Path structure: reportes/year/month/fileName
        const path = `${year}/${month}/${fileName}`

        console.log("Intentando subir a bucket 'reportes', path:", path)
        const { data, error } = await supabase.storage.from("reportes").upload(path, file, {
            contentType: type === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: true,
        })

        if (error) {
            console.error("Error al subir reporte a Storage:", error)

            // Debug: Listar buckets disponibles
            try {
                const { data: buckets } = await supabase.storage.listBuckets()
                console.log("Buckets disponibles:", buckets?.map(b => b.name))
            } catch (e) {
                console.error("No se pudo listar buckets:", e)
            }

            return {
                success: false,
                error: formatStorageError("reportes", error, "Error al subir el reporte"),
            }
        }

        return { success: true, path: data.path }
    } catch (err) {
        console.error("Error inesperado al subir reporte:", err)
        return { success: false, error: "Error inesperado al subir el reporte" }
    }
}
