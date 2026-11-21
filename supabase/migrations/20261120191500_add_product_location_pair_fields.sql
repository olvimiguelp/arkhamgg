ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS location_box_number TEXT,
  ADD COLUMN IF NOT EXISTS location_zone TEXT;

UPDATE public.products
SET location_box_number = location_value
WHERE location_type = 'box'
  AND location_box_number IS NULL
  AND location_value IS NOT NULL;

UPDATE public.products
SET location_zone = location_value
WHERE location_type = 'zone'
  AND location_zone IS NULL
  AND location_value IS NOT NULL;
