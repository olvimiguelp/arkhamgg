-- Logos de empresa para facturas (branding por tenant)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding-logos',
  'branding-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Branding logos public read" ON storage.objects;
CREATE POLICY "Branding logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding-logos');

DROP POLICY IF EXISTS "Branding logos insert" ON storage.objects;
CREATE POLICY "Branding logos insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding-logos');

DROP POLICY IF EXISTS "Branding logos update" ON storage.objects;
CREATE POLICY "Branding logos update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding-logos');

DROP POLICY IF EXISTS "Branding logos delete" ON storage.objects;
CREATE POLICY "Branding logos delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding-logos');
