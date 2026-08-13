-- Notas agregadas por el técnico durante el diagnóstico o reparación.
ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS technician_notes TEXT;

COMMENT ON COLUMN public.repairs.technician_notes IS
  'Notas del técnico: fallas encontradas, diagnóstico o imposibilidad de reparación.';
