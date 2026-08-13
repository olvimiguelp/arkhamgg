-- Acceso abierto: el tenant usa el panel sin bloqueo por suscripcion vencida o sin plan.

ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS open_access BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.saas_businesses.open_access IS
  'Si es TRUE, el tenant accede al panel sin restricciones de suscripcion (vencida, sin plan o suspendida manualmente).';

CREATE INDEX IF NOT EXISTS idx_saas_businesses_open_access
  ON public.saas_businesses(open_access)
  WHERE open_access = TRUE;
