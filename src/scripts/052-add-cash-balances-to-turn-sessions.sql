-- 052: Registrar efectivo inicial y efectivo final de cada turno.
ALTER TABLE public.turn_sessions
  ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_cash_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(12,2);

COMMENT ON COLUMN public.turn_sessions.opening_cash IS
  'Efectivo contado en caja al abrir el turno.';

COMMENT ON COLUMN public.turn_sessions.closing_cash IS
  'Efectivo contado en caja al cerrar el turno.';

COMMENT ON COLUMN public.turn_sessions.opening_cash_confirmed IS
  'Indica que el usuario confirmó el efectivo inicial del turno.';
