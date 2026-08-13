-- Acceso al bot de WhatsApp (funcion Premium): habilitacion manual por empresa desde Suscripciones.

ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS whatsapp_bot_access BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.saas_businesses.whatsapp_bot_access IS
  'Si es TRUE, la empresa puede usar el bot de WhatsApp aunque no tenga Plan Premium.';

CREATE INDEX IF NOT EXISTS idx_saas_businesses_whatsapp_bot_access
  ON public.saas_businesses(whatsapp_bot_access)
  WHERE whatsapp_bot_access = TRUE;
