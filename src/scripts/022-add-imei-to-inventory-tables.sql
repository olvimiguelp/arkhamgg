-- Ensure IMEI column exists for both inventory tables in legacy databases
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS imei VARCHAR(50);

ALTER TABLE public.armacen
ADD COLUMN IF NOT EXISTS imei VARCHAR(50);

