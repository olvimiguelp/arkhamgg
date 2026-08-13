-- Habilita busqueda exacta por ID (SKU) en inventario.
-- Normaliza IDs numericos para que "03040" y "3040" coincidan.

CREATE OR REPLACE FUNCTION public.normalize_inventory_search_id(raw_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw_value IS NULL THEN ''
    WHEN regexp_replace(trim(raw_value), '\s+', '', 'g') = '' THEN ''
    WHEN regexp_replace(trim(raw_value), '\s+', '', 'g') ~ '^[0-9]+$' THEN
      COALESCE(
        NULLIF(ltrim(regexp_replace(trim(raw_value), '\s+', '', 'g'), '0'), ''),
        '0'
      )
    ELSE lower(trim(raw_value))
  END
$$;

CREATE INDEX IF NOT EXISTS idx_products_sku_search_exact
  ON public.products ((public.normalize_inventory_search_id(sku)));

CREATE INDEX IF NOT EXISTS idx_armacen_sku_search_exact
  ON public.armacen ((public.normalize_inventory_search_id(sku)));

CREATE OR REPLACE FUNCTION public.search_inventory_by_id_exact(search_value TEXT)
RETURNS TABLE (
  source_table TEXT,
  row_id UUID,
  sku TEXT,
  name TEXT,
  category TEXT,
  box_number TEXT,
  stock INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH needle AS (
    SELECT public.normalize_inventory_search_id(search_value) AS normalized
  )
  SELECT
    'products'::TEXT AS source_table,
    p.id AS row_id,
    p.sku,
    p.name,
    p.category,
    NULL::TEXT AS box_number,
    p.stock
  FROM public.products p
  CROSS JOIN needle n
  WHERE n.normalized <> ''
    AND (
      public.normalize_inventory_search_id(p.sku) = n.normalized
      OR lower(p.id::text) = n.normalized
    )

  UNION ALL

  SELECT
    'armacen'::TEXT AS source_table,
    a.id AS row_id,
    a.sku,
    a.name,
    a.category,
    a.box_number,
    a.stock
  FROM public.armacen a
  CROSS JOIN needle n
  WHERE n.normalized <> ''
    AND (
      public.normalize_inventory_search_id(a.sku) = n.normalized
      OR lower(a.id::text) = n.normalized
    );
$$;

COMMENT ON FUNCTION public.search_inventory_by_id_exact(TEXT) IS
  'Busca por ID exacto en products y armacen; normaliza IDs numericos (ej: 03040 = 3040).';
