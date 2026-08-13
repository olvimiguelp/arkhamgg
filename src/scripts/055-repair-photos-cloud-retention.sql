-- Fotografías de reparaciones almacenadas en Supabase Storage.
-- Las filas y los objetos caducan 25 días después de subirlos.

CREATE TABLE IF NOT EXISTS public.repair_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '25 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_photos_repair_id ON public.repair_photos(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_photos_expiration ON public.repair_photos(expires_at);
CREATE INDEX IF NOT EXISTS idx_repair_photos_owner_admin_id ON public.repair_photos(owner_admin_id);

ALTER TABLE public.repair_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_photos_select_tenant" ON public.repair_photos;
CREATE POLICY "repair_photos_select_tenant" ON public.repair_photos
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "repair_photos_insert_tenant" ON public.repair_photos;
CREATE POLICY "repair_photos_insert_tenant" ON public.repair_photos
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "repair_photos_delete_tenant" ON public.repair_photos;
CREATE POLICY "repair_photos_delete_tenant" ON public.repair_photos
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('repair-photos', 'repair-photos', false, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 4194304;

DROP POLICY IF EXISTS "repair_photos_storage_select" ON storage.objects;
CREATE POLICY "repair_photos_storage_select" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'repair-photos');

DROP POLICY IF EXISTS "repair_photos_storage_insert" ON storage.objects;
CREATE POLICY "repair_photos_storage_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'repair-photos');

DROP POLICY IF EXISTS "repair_photos_storage_delete" ON storage.objects;
CREATE POLICY "repair_photos_storage_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'repair-photos');

-- Limpieza segura: elimina primero el objeto y luego su registro.
CREATE OR REPLACE FUNCTION public.cleanup_expired_repair_photos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  photo RECORD;
  deleted_count INTEGER := 0;
BEGIN
  FOR photo IN SELECT id, storage_path FROM public.repair_photos WHERE expires_at <= NOW() LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'repair-photos' AND name = photo.storage_path;
    DELETE FROM public.repair_photos WHERE id = photo.id;
    deleted_count := deleted_count + 1;
  END LOOP;
  RETURN deleted_count;
END;
$$;

-- En Supabase suele estar disponible pg_cron. Si no lo está, la función puede
-- ejecutarse diariamente desde un cron externo o Edge Function.
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-expired-repair-photos';
    PERFORM cron.schedule('cleanup-expired-repair-photos', '15 3 * * *', $cron$SELECT public.cleanup_expired_repair_photos();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible; ejecutar cleanup_expired_repair_photos diariamente desde un cron externo';
END $schedule$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_repair_photos() TO anon, authenticated;
