-- pgcrypto: activar en Supabase -> Database -> Extensions (no CREATE EXTENSION en SQL Editor)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.armacen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  box_number VARCHAR(50) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 1,
  buy_price NUMERIC NOT NULL DEFAULT 0,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  minimum_sell_price NUMERIC NOT NULL DEFAULT 0,
  supplier VARCHAR(255),
  capacity VARCHAR(50),
  imei VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_armacen_owner_sku ON public.armacen(owner_admin_id, sku);
CREATE INDEX IF NOT EXISTS idx_armacen_owner_admin_id ON public.armacen(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_armacen_name ON public.armacen(name);
CREATE INDEX IF NOT EXISTS idx_armacen_category ON public.armacen(category);
CREATE INDEX IF NOT EXISTS idx_armacen_box_number ON public.armacen(box_number);
CREATE INDEX IF NOT EXISTS idx_armacen_stock ON public.armacen(stock);

DROP TRIGGER IF EXISTS trg_armacen_updated_at ON public.armacen;
CREATE TRIGGER trg_armacen_updated_at
  BEFORE UPDATE ON public.armacen
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.armacen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on armacen" ON public.armacen;
CREATE POLICY "Allow all operations on armacen" ON public.armacen
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER TABLE public.armacen REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.armacen;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
