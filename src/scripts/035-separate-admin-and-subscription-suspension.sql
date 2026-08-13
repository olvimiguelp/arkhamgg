-- Separar suspension de administrador (employees.status) vs suspension de suscripcion (saas_businesses)

ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS subscription_suspended BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.saas_businesses.subscription_suspended IS
  'Bloqueo manual por suscripcion: el tenant puede iniciar sesion pero ve la pantalla de suscripcion vencida.';

COMMENT ON COLUMN public.saas_businesses.is_blocked IS
  'DEPRECATED: usar subscription_suspended. Se mantiene por compatibilidad.';

-- Migrar bloqueos de suscripcion solo si el admin sigue activo (no era suspension de cuenta)
UPDATE public.saas_businesses sb
SET subscription_suspended = COALESCE(sb.is_blocked, FALSE)
FROM public.employees e
WHERE e.id = sb.owner_admin_id
  AND e.role = 'admin'
  AND e.status = 'active';

-- Si el admin esta inactivo, el bloqueo era de cuenta: limpiar flags de suscripcion
UPDATE public.saas_businesses sb
SET subscription_suspended = FALSE,
    is_blocked = FALSE,
    status = CASE
      WHEN sb.subscription IS NOT NULL THEN 'vencido'
      ELSE 'activo'
    END
FROM public.employees e
WHERE e.id = sb.owner_admin_id
  AND e.role = 'admin'
  AND e.status = 'inactive';

CREATE INDEX IF NOT EXISTS idx_saas_businesses_subscription_suspended
  ON public.saas_businesses(subscription_suspended)
  WHERE subscription_suspended = TRUE;
