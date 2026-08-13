const bucketPolicyScripts: Record<string, string> = {
  facturas: "src/scripts/005-create-invoices-bucket.sql",
  reportes: "src/scripts/017-create-reports-bucket.sql",
  "product-images": "src/scripts/041-create-product-images-bucket.sql",
  "branding-logos": "src/scripts/036-create-branding-logos-bucket.sql",
}

function describeMissingBucket(bucketId: string): string {
  const scriptPath = bucketPolicyScripts[bucketId]
  const policyHint = scriptPath
    ? `aplica el SQL de ${scriptPath}`
    : "aplica las políticas necesarias desde el editor SQL de Supabase"

  return `Bucket '${bucketId}' no existe. Ejecuta \`npm run setup:storage\` (requiere SUPABASE_SERVICE_ROLE_KEY), ${policyHint} y luego corre \`node verify_storage.js\` para confirmar.`
}

export function formatStorageError(
  bucketId: string,
  error?: { message?: string },
  fallback?: string,
): string {
  const message = error?.message
  if (message?.includes("Bucket not found")) {
    return describeMissingBucket(bucketId)
  }

  if (message) return message
  if (fallback) return fallback

  return `Error al acceder al bucket '${bucketId}'.`
}
