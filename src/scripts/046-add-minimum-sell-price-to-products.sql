-- Agrega precio minimo de venta a productos y almacen
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS minimum_sell_price NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.armacen
  ADD COLUMN IF NOT EXISTS minimum_sell_price NUMERIC NOT NULL DEFAULT 0;
