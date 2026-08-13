-- Tabla principal para el dashboard de super administrador
-- Guarda la configuracion SaaS por empresa/tenant y su relacion 1:1 con admin.

CREATE TABLE IF NOT EXISTS public.saas_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  email TEXT NOT NULL DEFAULT '',
  emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  logo TEXT,
  invoice_subtitle TEXT,
  brand_colors JSONB NOT NULL DEFAULT '{"primary":"#3b82f6","secondary":"#1d4ed8"}'::jsonb,
  tax_id TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  subscription JSONB,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'suspendido', 'vencido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_businesses_owner_admin_id ON public.saas_businesses(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_saas_businesses_name ON public.saas_businesses(name);
CREATE INDEX IF NOT EXISTS idx_saas_businesses_status ON public.saas_businesses(status);
CREATE INDEX IF NOT EXISTS idx_saas_businesses_is_blocked ON public.saas_businesses(is_blocked);

DROP TRIGGER IF EXISTS trg_saas_businesses_updated_at ON public.saas_businesses;
CREATE TRIGGER trg_saas_businesses_updated_at
  BEFORE UPDATE ON public.saas_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.saas_businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on saas_businesses" ON public.saas_businesses;
CREATE POLICY "Allow all operations on saas_businesses" ON public.saas_businesses
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Backfill para admins existentes sin empresa SaaS
INSERT INTO public.saas_businesses (
  owner_admin_id,
  name,
  description,
  location,
  address,
  phone,
  phones,
  email,
  emails,
  employee_count,
  is_blocked,
  status
)
SELECT
  e.id AS owner_admin_id,
  COALESCE(NULLIF(trim(e.name), ''), CONCAT('Empresa ', LEFT(e.id::text, 8))) AS name,
  '' AS description,
  '' AS location,
  COALESCE(e.address, '') AS address,
  COALESCE(e.phone, '') AS phone,
  CASE WHEN COALESCE(trim(e.phone), '') = '' THEN ARRAY[]::TEXT[] ELSE ARRAY[e.phone] END AS phones,
  COALESCE(e.email, '') AS email,
  CASE WHEN COALESCE(trim(e.email), '') = '' THEN ARRAY[]::TEXT[] ELSE ARRAY[e.email] END AS emails,
  0 AS employee_count,
  CASE WHEN e.status = 'inactive' THEN TRUE ELSE FALSE END AS is_blocked,
  CASE WHEN e.status = 'inactive' THEN 'suspendido' ELSE 'activo' END AS status
FROM public.employees e
WHERE e.role = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.saas_businesses sb
    WHERE sb.owner_admin_id = e.id
  );

-- Recalcula conteo de empleados por tenant
WITH employee_totals AS (
  SELECT owner_admin_id, COUNT(*)::int AS total
  FROM public.employees
  WHERE role = 'employee'
  GROUP BY owner_admin_id
)
UPDATE public.saas_businesses sb
SET employee_count = COALESCE(et.total, 0)
FROM employee_totals et
WHERE sb.owner_admin_id = et.owner_admin_id;

-- Semilla de configuracion de bloqueo global de membresia
INSERT INTO public.system_config (key, value, description)
VALUES (
  'membership_block',
  '{
    "enabled": false,
    "allow_login": true,
    "title": "Acceso temporalmente restringido",
    "subtitle": "Control de membresia SaaS",
    "message": "Contacta al administrador para regularizar el acceso de tu empresa.",
    "support_email": "olvimiguelp@gmail.com",
    "support_whatsapp": "829-963-3150"
  }'::jsonb,
  'Control global de bloqueo por membresia'
)
ON CONFLICT (key) DO NOTHING;

