-- Crear bucket para almacenar imágenes de productos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  4194304, -- 4MB máximo por archivo
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir lectura pública
CREATE POLICY "Product images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Política para permitir subir imágenes
CREATE POLICY "Product images insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

-- Política para permitir actualizar imágenes
CREATE POLICY "Product images update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

-- Política para permitir eliminar imágenes
CREATE POLICY "Product images delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');
