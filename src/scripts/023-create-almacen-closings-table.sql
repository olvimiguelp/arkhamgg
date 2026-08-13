-- Create almacen_closings table for daily warehouse inventory closings
CREATE TABLE IF NOT EXISTS public.almacen_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  closing_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ DEFAULT NOW(),
  cashier_id UUID REFERENCES public.employees(id),
  cashier_name VARCHAR(255) NOT NULL,
  total_products INTEGER DEFAULT 0,
  total_units_expected INTEGER DEFAULT 0,
  total_units_counted INTEGER DEFAULT 0,
  discrepancy_units INTEGER DEFAULT 0,
  total_cost_expected NUMERIC(12, 2) DEFAULT 0,
  total_cost_counted NUMERIC(12, 2) DEFAULT 0,
  discrepancy_cost NUMERIC(12, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  notes TEXT,
  snapshot JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_almacen_closings_date ON public.almacen_closings(date);
CREATE INDEX IF NOT EXISTS idx_almacen_closings_status ON public.almacen_closings(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_closings_owner_closing_number
ON public.almacen_closings(owner_admin_id, closing_number);
CREATE INDEX IF NOT EXISTS idx_almacen_closings_owner_admin_id ON public.almacen_closings(owner_admin_id);

-- Block multiple active closings on the same day (rejected can be repeated)
CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_closings_unique_active_date
ON public.almacen_closings(owner_admin_id, date)
WHERE status <> 'rejected';

DROP TRIGGER IF EXISTS trg_almacen_closings_updated_at ON public.almacen_closings;
CREATE TRIGGER trg_almacen_closings_updated_at
  BEFORE UPDATE ON public.almacen_closings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.almacen_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on almacen_closings" ON public.almacen_closings;
CREATE POLICY "Allow all operations on almacen_closings" ON public.almacen_closings
  FOR ALL USING (true) WITH CHECK (true);
