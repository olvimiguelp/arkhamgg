ALTER TABLE public.almacen_closings
  ADD COLUMN IF NOT EXISTS financial_summary JSONB;
