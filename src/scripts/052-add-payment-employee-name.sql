-- Conserva el nombre del empleado o administrador que registró el abono.
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
