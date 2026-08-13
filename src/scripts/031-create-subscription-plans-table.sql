-- Tabla de planes de suscripcion del dashboard de super administrador
-- Almacena las configuraciones de precio y beneficios para cada plan.

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

CREATE INDEX IF NOT EXISTS idx_subscription_plans_value ON public.subscription_plans(value);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_created_at ON public.subscription_plans(created_at);

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on subscription_plans" ON public.subscription_plans;
CREATE POLICY "Allow all operations on subscription_plans" ON public.subscription_plans
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Semilla de planes iniciales
INSERT INTO public.subscription_plans (value, label, months, discount, price, color, benefits)
VALUES
  ('mensual', 'Mensual', 1, 0, 29.99, 'from-slate-500 to-slate-600', ARRAY['Soporte basico', '1 usuario admin', 'Reportes mensuales']),
  ('trimestral', 'Trimestral', 3, 10, 80.97, 'from-blue-500 to-blue-600', ARRAY['Soporte prioritario', '3 usuarios admin', 'Reportes semanales', 'API acceso']),
  ('semestral', 'Semestral', 6, 15, 152.94, 'from-violet-500 to-violet-600', ARRAY['Soporte 24/7', '5 usuarios admin', 'Reportes diarios', 'API ilimitado', 'Marca blanca']),
  ('anual', 'Anual', 12, 25, 269.91, 'from-amber-500 to-amber-600', ARRAY['Soporte dedicado', 'Usuarios ilimitados', 'Reportes en tiempo real', 'API ilimitado', 'Marca blanca', 'Integraciones custom'])
ON CONFLICT (value) DO NOTHING;
