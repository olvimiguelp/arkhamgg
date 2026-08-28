CREATE OR REPLACE FUNCTION public.get_public_catalog_categories(
  p_token TEXT
)
RETURNS TABLE (category VARCHAR(100))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
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
  SELECT DISTINCT p.category
  FROM public.products p
  WHERE p.owner_admin_id = share_row.owner_admin_id
    AND p.id = ANY(share_row.product_ids)
    AND p.stock > 0
    AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
    AND NULLIF(TRIM(p.category), '') IS NOT NULL
  ORDER BY p.category;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_categories(TEXT) TO anon, authenticated;
