ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS location_type TEXT,
  ADD COLUMN IF NOT EXISTS location_value TEXT,
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_location_type_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_location_type_check
      CHECK (location_type IS NULL OR location_type IN ('box', 'zone'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_products_owner_location
  ON public.products(owner_admin_id, location_type, location_value)
  WHERE location_type IS NOT NULL AND location_value IS NOT NULL;
