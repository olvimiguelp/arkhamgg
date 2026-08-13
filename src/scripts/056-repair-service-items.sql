-- Detalle normalizado de cada servicio de una reparación.
-- Permite que cada servicio tenga su propio costo de pieza y monto a cobrar.
CREATE TABLE IF NOT EXISTS public.repair_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  piece_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_services_repair_id ON public.repair_services(repair_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_repair_services_owner_admin_id ON public.repair_services(owner_admin_id);

ALTER TABLE public.repair_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "repair_services_all" ON public.repair_services;
CREATE POLICY "repair_services_all" ON public.repair_services
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
