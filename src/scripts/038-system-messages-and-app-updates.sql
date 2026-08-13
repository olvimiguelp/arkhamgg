-- Mensajes globales en login (actualizaciones de app) + campos de version/enlace en mensajes SaaS

CREATE TABLE IF NOT EXISTS public.system_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Notificacion',
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'info'
    CHECK (message_type IN ('info', 'warning', 'error', 'success')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  target_version TEXT,
  download_url TEXT,
  admin_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_messages_active
  ON public.system_messages(is_active, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_messages_target_version
  ON public.system_messages(target_version)
  WHERE target_version IS NOT NULL;

ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on system_messages" ON public.system_messages;
CREATE POLICY "Allow all on system_messages" ON public.system_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Ampliar tipos de mensaje del dashboard
ALTER TABLE public.admin_subscription_messages
  DROP CONSTRAINT IF EXISTS admin_subscription_messages_message_type_check;

ALTER TABLE public.admin_subscription_messages
  ADD CONSTRAINT admin_subscription_messages_message_type_check
  CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo', 'actualizacion'));

ALTER TABLE public.admin_subscription_messages
  ADD COLUMN IF NOT EXISTS target_version TEXT,
  ADD COLUMN IF NOT EXISTS download_url TEXT;

ALTER TABLE public.tenant_subscription_notifications
  DROP CONSTRAINT IF EXISTS tenant_subscription_notifications_message_type_check;

ALTER TABLE public.tenant_subscription_notifications
  ADD CONSTRAINT tenant_subscription_notifications_message_type_check
  CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo', 'auto_renovacion', 'actualizacion'));

ALTER TABLE public.tenant_subscription_notifications
  ADD COLUMN IF NOT EXISTS target_version TEXT,
  ADD COLUMN IF NOT EXISTS download_url TEXT;
