-- URL pública usada para generar enlaces del catálogo desde la aplicación Electron.
-- Ejecutar este archivo en Supabase SQL Editor.

INSERT INTO public.system_config (key, value, description)
VALUES (
  'public_catalog_url',
  '{"url":"https://arkhamgg.vercel.app"}'::jsonb,
  'URL pública utilizada para compartir el catálogo desde Electron'
)
ON CONFLICT (key) DO NOTHING;

-- Verificación opcional:
-- SELECT key, value, description
-- FROM public.system_config
-- WHERE key = 'public_catalog_url';
