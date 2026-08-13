# Regenera all_migrations.sql concatenando todas las migraciones numeradas.
# Uso: powershell -File src/scripts/build-all-migrations.ps1

$ErrorActionPreference = "Stop"
$scriptsDir = $PSScriptRoot
$outFile = Join-Path $scriptsDir "all_migrations.sql"
$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss K")

$preamble = @"
-- =============================================================================
-- ALL MIGRATIONS - ARCHIVO UNIFICADO (ARKHAM / Supabase)
-- =============================================================================
-- Un solo script con TODAS las migraciones de src/scripts/*.sql (excepto este archivo).
--
-- COMO EJECUTAR (una sola vez por proyecto o tras clonar):
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Copiar y pegar TODO este archivo (Ctrl+A en el editor local)
--   3. Run / Ejecutar (puede tardar 1-2 minutos)
--
-- ANTES DE EJECUTAR: Database -> Extensions -> activar "pgcrypto" (una vez, en el panel).
-- IDEMPOTENTE: IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.
-- Si algo falla a mitad, corrige el error y vuelve a ejecutar (las partes ya aplicadas no rompen).
--
-- REGENERAR tras editar cualquier .sql individual:
--   npm run build:migrations
--   o: powershell -File src/scripts/build-all-migrations.ps1
--
-- Generado: $generatedAt
-- Lista de archivos fuente al final del archivo (buscar "FIN DE MIGRACIONES")
-- =============================================================================

"@

$shared = @"

-- -----------------------------------------------------------------------------
-- Helpers compartidos
-- -----------------------------------------------------------------------------
-- NOTA: No usar CREATE EXTENSION aqui (falla en SQL Editor: read-only transaction).
-- En Supabase: Database -> Extensions -> activar "pgcrypto" si gen_random_uuid() falla.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS `$$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
`$$ LANGUAGE plpgsql;

"@

$files =
  Get-ChildItem -Path $scriptsDir -Filter "*.sql" -File |
  Where-Object { $_.Name -ne "all_migrations.sql" } |
  Sort-Object {
    if ($_.Name -match "^(\d{3})") { [int]$Matches[1] } else { 9999 }
  }, Name

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append($preamble)
[void]$sb.Append($shared)

$included = New-Object System.Collections.Generic.List[string]

foreach ($file in $files) {
  $included.Add($file.Name)
  [void]$sb.AppendLine("")
  [void]$sb.AppendLine("-- ====================================================")
  [void]$sb.AppendLine("-- Source: $($file.Name)")
  [void]$sb.AppendLine("-- ====================================================")
  [void]$sb.AppendLine("")
  $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
  # Supabase SQL Editor: transaccion de solo lectura para CREATE EXTENSION
  $content = [regex]::Replace(
    $content,
    '(?m)^\s*CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+pgcrypto\s*;\s*\r?\n',
    "-- (pgcrypto: activar en Database -> Extensions, no CREATE EXTENSION aqui)`n"
  )
  if (-not $content.EndsWith("`n")) { $content += "`n" }
  [void]$sb.Append($content)
}

[void]$sb.AppendLine("")
[void]$sb.AppendLine("-- =============================================================================")
[void]$sb.AppendLine("-- FIN DE MIGRACIONES")
[void]$sb.AppendLine("-- =============================================================================")
[void]$sb.AppendLine("-- Archivos concatenados ($($included.Count)):")
foreach ($name in $included) {
  [void]$sb.AppendLine("--   - $name")
}

[System.IO.File]::WriteAllText($outFile, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
Write-Host "OK: $outFile ($($included.Count) migraciones)"
