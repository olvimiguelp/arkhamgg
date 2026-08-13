-- Permite asignar cada abono de deuda al empleado que lo registró.
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_created_by_employee_id
ON public.payments(created_by_employee_id);
