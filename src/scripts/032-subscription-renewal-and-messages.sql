-- Plazo de renovacion por empresa (dias despues del vencimiento de la suscripcion)
ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS renewal_grace_days INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.saas_businesses
  DROP CONSTRAINT IF EXISTS saas_businesses_renewal_grace_days_check;

ALTER TABLE public.saas_businesses
  ADD CONSTRAINT saas_businesses_renewal_grace_days_check
  CHECK (renewal_grace_days >= 0 AND renewal_grace_days <= 365);

-- Historial de mensajes enviados desde el dashboard de super admin
CREATE TABLE IF NOT EXISTS public.admin_subscription_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL DEFAULT 'general'
    CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo')),
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'specific')),
  recipient_admin_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_subscription_messages_created_at
  ON public.admin_subscription_messages(created_at DESC);

-- Notificaciones visibles para administradores/empleados del tenant
CREATE TABLE IF NOT EXISTS public.tenant_subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  admin_message_id UUID REFERENCES public.admin_subscription_messages(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'general'
    CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo', 'auto_renovacion')),
  title TEXT NOT NULL DEFAULT 'Aviso de suscripcion',
  content TEXT NOT NULL,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_notifications_owner
  ON public.tenant_subscription_notifications(owner_admin_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_notifications_active
  ON public.tenant_subscription_notifications(owner_admin_id, is_active, created_at DESC);

ALTER TABLE public.admin_subscription_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscription_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on admin_subscription_messages" ON public.admin_subscription_messages;
CREATE POLICY "Allow all on admin_subscription_messages" ON public.admin_subscription_messages
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications;
CREATE POLICY "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications
  FOR ALL USING (true) WITH CHECK (true);
