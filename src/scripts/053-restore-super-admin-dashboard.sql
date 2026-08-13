-- Restaura las tablas requeridas por /dashboard si se ejecutó
-- 051-remove-super-admin-dashboard.sql.

-- El dashboard necesita que el rol super_admin siga siendo válido.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('super_admin', 'admin', 'employee'));

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
  renewal_grace_days INTEGER NOT NULL DEFAULT 5,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  open_access BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_bot_access BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'suspendido', 'vencido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  discount INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  benefits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_subscription_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  recipient_admin_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  target_version TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  admin_message_id UUID REFERENCES public.admin_subscription_messages(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL DEFAULT 'Aviso de suscripcion',
  content TEXT NOT NULL,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  target_version TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.saas_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_subscription_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscription_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on saas_businesses" ON public.saas_businesses;
CREATE POLICY "Allow all operations on saas_businesses" ON public.saas_businesses FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all operations on subscription_plans" ON public.subscription_plans;
CREATE POLICY "Allow all operations on subscription_plans" ON public.subscription_plans FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on admin_subscription_messages" ON public.admin_subscription_messages;
CREATE POLICY "Allow all on admin_subscription_messages" ON public.admin_subscription_messages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications;
CREATE POLICY "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.subscription_plans (value, label, months, discount, price, color, benefits)
VALUES
  ('mensual', 'Mensual', 1, 0, 29.99, 'from-slate-500 to-slate-600', ARRAY['Soporte basico']),
  ('trimestral', 'Trimestral', 3, 10, 80.97, 'from-blue-500 to-blue-600', ARRAY['Soporte prioritario']),
  ('semestral', 'Semestral', 6, 15, 152.94, 'from-violet-500 to-violet-600', ARRAY['Soporte 24/7']),
  ('anual', 'Anual', 12, 25, 269.91, 'from-amber-500 to-amber-600', ARRAY['Soporte dedicado'])
ON CONFLICT (value) DO NOTHING;

