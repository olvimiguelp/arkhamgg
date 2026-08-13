-- Crear bucket para almacenar facturas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facturas',
  'facturas',
  true,
  10485760, -- 10MB máximo por archivo
  ARRAY['application/pdf', 'application/json', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir lectura pública
CREATE POLICY "Facturas son públicas para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'facturas');

-- Política para permitir subir archivos
CREATE POLICY "Permitir subir facturas"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'facturas');

-- Política para permitir actualizar archivos
CREATE POLICY "Permitir actualizar facturas"
ON storage.objects FOR UPDATE
USING (bucket_id = 'facturas');

-- Política para permitir eliminar archivos
CREATE POLICY "Permitir eliminar facturas"
ON storage.objects FOR DELETE
USING (bucket_id = 'facturas');
