-- Crear tabla para registrar los cierres de turno por empleado
CREATE TABLE IF NOT EXISTS public.turn_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  employee_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  cash_total DECIMAL(12, 2) DEFAULT 0,
  card_total DECIMAL(12, 2) DEFAULT 0,
  transfer_total DECIMAL(12, 2) DEFAULT 0,
  credit_total DECIMAL(12, 2) DEFAULT 0,
  total_sales DECIMAL(12, 2) NOT NULL,
  sale_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_turn_closings_date ON public.turn_closings(date);
CREATE INDEX IF NOT EXISTS idx_turn_closings_employee_id ON public.turn_closings(employee_id);
CREATE INDEX IF NOT EXISTS idx_turn_closings_employee_date ON public.turn_closings(employee_id, date);

-- Agregar columna para rastrear quien creó la venta (empleado que realizó la venta)
-- Esta columna se agrega a la tabla de ventas para mejorar el seguimiento
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID;

ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS created_by_employee_name VARCHAR(255);

-- Crear índices para esta nueva columna
CREATE INDEX IF NOT EXISTS idx_sales_created_by_employee_id ON public.sales(created_by_employee_id);
