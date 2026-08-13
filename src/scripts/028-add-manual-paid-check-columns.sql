-- Persist manual paid check marks in DB (instead of localStorage)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.almacen_credit_sales
  ADD COLUMN IF NOT EXISTS manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE;
