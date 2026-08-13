-- Normaliza categorias antiguas del almacen para usar "flex"
UPDATE public.armacen
SET category = 'flex'
WHERE LOWER(TRIM(category)) IN ('flesh', 'flash');
