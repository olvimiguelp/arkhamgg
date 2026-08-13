-- Crear bucket para almacenar reportes (PDF y Excel)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reportes',
  'reportes',
  true,
  20971520, -- 20MB máximo por archivo
  ARRAY[
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir lectura pública
CREATE POLICY "Reportes son públicos para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'reportes');

-- Política para permitir subir reportes
CREATE POLICY "Permitir subir reportes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reportes');

-- Política para permitir actualizar reportes
CREATE POLICY "Permitir actualizar reportes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'reportes');

-- Política para permitir eliminar reportes
CREATE POLICY "Permitir eliminar reportes"
ON storage.objects FOR DELETE
USING (bucket_id = 'reportes');
