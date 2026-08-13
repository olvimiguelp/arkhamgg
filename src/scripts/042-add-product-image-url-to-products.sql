-- Agregar columna image_url a las tablas de productos para almacenar la URL de la imagen
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.armacen ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_products_image_url ON public.products((image_url));
CREATE INDEX IF NOT EXISTS idx_armacen_image_url ON public.armacen((image_url));
