-- Agrega columna para identificar ventas al por mayor
ALTER TABLE IF EXISTS public.sales
  ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sales_is_wholesale ON public.sales(is_wholesale);
