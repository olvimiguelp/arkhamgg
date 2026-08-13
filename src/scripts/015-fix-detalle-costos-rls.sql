-- Fix RLS policy for detalle_costos_ventas to allow insertion
-- Drop restrictive policy if it exists
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON detalle_costos_ventas;

-- Create permissive policy similar to sales table
CREATE POLICY "Allow all operations for everyone on detalle_costos_ventas"
ON detalle_costos_ventas
FOR ALL
USING (true)
WITH CHECK (true);

-- Ensure RLS is enabled (or kept enabled)
ALTER TABLE detalle_costos_ventas ENABLE ROW LEVEL SECURITY;
