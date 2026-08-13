CREATE TABLE IF NOT EXISTS detalle_costos_ventas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  venta_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL,
  descripcion TEXT,
  costo_unitario DECIMAL(10, 2) DEFAULT 0,
  precio_unitario DECIMAL(10, 2) DEFAULT 0,
  ganancia_unitaria DECIMAL(10, 2) DEFAULT 0,
  importe_total DECIMAL(10, 2) DEFAULT 0,
  ganancia_total DECIMAL(10, 2) DEFAULT 0,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  usuario_id UUID
);

-- Add index for performance on reporting
CREATE INDEX IF NOT EXISTS idx_detalle_costos_ventas_fecha ON detalle_costos_ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_detalle_costos_ventas_venta_id ON detalle_costos_ventas(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalle_costos_ventas_owner_admin_id ON detalle_costos_ventas(owner_admin_id);

-- Enable RLS
ALTER TABLE detalle_costos_ventas ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to insert
CREATE POLICY "Enable insert for authenticated users" ON detalle_costos_ventas
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create policy to allow all authenticated users to select
CREATE POLICY "Enable select for authenticated users" ON detalle_costos_ventas
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy to allow all authenticated users to update
CREATE POLICY "Enable update for authenticated users" ON detalle_costos_ventas
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Create policy to allow all authenticated users to delete
CREATE POLICY "Enable delete for authenticated users" ON detalle_costos_ventas
    FOR DELETE USING (auth.role() = 'authenticated');
