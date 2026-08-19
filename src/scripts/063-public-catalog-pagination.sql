-- Devuelve solo una página del catálogo público. La lista completa de IDs
-- permanece en Supabase y nunca se envía al navegador del cliente.
CREATE OR REPLACE FUNCTION public.get_public_catalog_products(
  p_token TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sku VARCHAR(50),
  name VARCHAR(255),
  category VARCHAR(100),
  stock INTEGER,
  sell_price NUMERIC(10,2),
  wholesale_price NUMERIC(10,2),
  image_url TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
  safe_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT * INTO share_row
  FROM public.catalog_shares
  WHERE token = p_token
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no es válido o ha vencido';
  END IF;

  RETURN QUERY
  WITH catalog_products AS (
    SELECT p.*
    FROM public.products p
    WHERE p.owner_admin_id = share_row.owner_admin_id
      AND p.id = ANY(share_row.product_ids)
      AND p.stock > 0
      AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
      AND (NULLIF(TRIM(p_search), '') IS NULL
        OR p.name ILIKE '%' || TRIM(p_search) || '%'
        OR p.sku ILIKE '%' || TRIM(p_search) || '%')
      AND (NULLIF(TRIM(p_category), '') IS NULL OR p.category = p_category)
  )
  SELECT p.id, p.sku, p.name, p.category, p.stock,
    CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END,
    p.wholesale_price, p.image_url,
    COUNT(*) OVER ()
  FROM catalog_products p
  ORDER BY p.name, p.id
  LIMIT safe_limit OFFSET safe_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_products(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO anon, authenticated;
