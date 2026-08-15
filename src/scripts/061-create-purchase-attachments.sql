-- 061-create-purchase-attachments.sql
-- Soporte para adjuntar el documento real de una factura de compra (PDF o
-- foto) y el comprobante de un abono, además de clasificar el tipo de
-- compra (piezas / productos / otros gastos).

-- 1. Bucket para los adjuntos de facturas de proveedores y comprobantes de
--    abono. Se usa un bucket separado del bucket "facturas" (que solo
--    permite PDF/JSON para facturas de venta) porque aquí también se suben
--    fotos tomadas con el celular.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facturas-proveedores',
  'facturas-proveedores',
  true,
  10485760, -- 10MB máximo por archivo
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Adjuntos de facturas de proveedores públicos para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'facturas-proveedores');

CREATE POLICY "Permitir subir adjuntos de facturas de proveedores"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'facturas-proveedores');

CREATE POLICY "Permitir actualizar adjuntos de facturas de proveedores"
ON storage.objects FOR UPDATE
USING (bucket_id = 'facturas-proveedores');

CREATE POLICY "Permitir eliminar adjuntos de facturas de proveedores"
ON storage.objects FOR DELETE
USING (bucket_id = 'facturas-proveedores');

-- 2. Columnas nuevas en "purchases": tipo de compra y adjunto del
--    documento original.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS purchase_kind text NOT NULL DEFAULT 'productos'
    CHECK (purchase_kind IN ('piezas', 'productos', 'otros')),
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text;

-- 3. Columna nueva en "supplier_payments": comprobante del abono.
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS attachment_url text;
