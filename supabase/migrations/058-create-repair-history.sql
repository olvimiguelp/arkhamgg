-- Historial independiente de reparaciones.
-- Conserva la información aunque la orden activa o el cliente sean eliminados.
CREATE TABLE IF NOT EXISTS public.repair_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  original_repair_id UUID,
  repair_number VARCHAR(20),
  client VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(100),
  cedula VARCHAR(100),
  device VARCHAR(255),
  repair_date TIMESTAMPTZ,
  repair_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_history_owner ON public.repair_history(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_repair_history_client ON public.repair_history(owner_admin_id, client);
CREATE INDEX IF NOT EXISTS idx_repair_history_phone ON public.repair_history(owner_admin_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_repair_history_cedula ON public.repair_history(owner_admin_id, cedula);
CREATE INDEX IF NOT EXISTS idx_repair_history_date ON public.repair_history(owner_admin_id, repair_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_history_owner_original
  ON public.repair_history(owner_admin_id, original_repair_id)
  WHERE original_repair_id IS NOT NULL;

ALTER TABLE public.repair_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow tenant operations on repair history" ON public.repair_history;
CREATE POLICY "Allow tenant operations on repair history" ON public.repair_history
  FOR ALL USING (true) WITH CHECK (true);

-- Copia inicial de las reparaciones que ya existían antes de activar el historial.
INSERT INTO public.repair_history (
  owner_admin_id,
  original_repair_id,
  repair_number,
  client,
  customer_phone,
  cedula,
  device,
  repair_date,
  repair_data
)
SELECT
  r.owner_admin_id,
  r.id,
  r.repair_number,
  r.client,
  NULLIF(COALESCE((CASE WHEN LEFT(TRIM(COALESCE(r.notes, '')), 1) = '{' THEN r.notes::jsonb->>'customerPhone' END), ''), ''),
  NULLIF(COALESCE((CASE WHEN LEFT(TRIM(COALESCE(r.notes, '')), 1) = '{' THEN r.notes::jsonb->>'cedula' END), ''), ''),
  r.device,
  r.date::timestamptz,
  jsonb_build_object(
    'id', r.id,
    'repair_number', r.repair_number,
    'client', r.client,
    'device', r.device,
    'issue', r.issue,
    'status', r.status,
    'type', r.type,
    'date', r.date,
    'cost', r.cost,
    'password', r.password,
    'notes', r.notes
  ) || CASE
    WHEN LEFT(TRIM(COALESCE(r.notes, '')), 1) = '{' THEN r.notes::jsonb
    ELSE '{}'::jsonb
  END
FROM public.repairs r
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_history h
  WHERE h.owner_admin_id = r.owner_admin_id
    AND h.original_repair_id = r.id
);
