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
    AND NULLIF(TRIM(p.category), '') IS NOT NULL
  ORDER BY p.category;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_categories(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_catalog_products(
  p_token TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID, sku VARCHAR(50), name VARCHAR(255), category VARCHAR(100),
  stock INTEGER, sell_price NUMERIC(10,2), wholesale_price NUMERIC(10,2),
  image_url TEXT, total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
  safe_limit INTEGER := GREATEST(COALESCE(p_limit, 10000), 1);
  safe_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT * INTO share_row FROM public.catalog_shares
  WHERE token = p_token AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no es válido o ha vencido';
  END IF;

  RETURN QUERY
  WITH catalog_products AS (
    SELECT p.* FROM public.products p
    WHERE p.owner_admin_id = share_row.owner_admin_id
      AND p.stock > 0
      AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
      AND (NULLIF(TRIM(p_search), '') IS NULL
        OR p.name ILIKE '%' || TRIM(p_search) || '%'
        OR p.sku ILIKE '%' || TRIM(p_search) || '%')
      AND (NULLIF(TRIM(p_category), '') IS NULL OR p.category = p_category)
  )
  SELECT p.id, p.sku, p.name, p.category, p.stock,
    CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END,
    p.wholesale_price, p.image_url, COUNT(*) OVER ()
  FROM catalog_products p
  ORDER BY p.name, p.id
  LIMIT safe_limit OFFSET safe_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_products(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_catalog_order(
  p_token TEXT, p_customer_name TEXT, p_customer_phone TEXT, p_items JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  share_row catalog_shares%ROWTYPE;
  sale_id UUID := gen_random_uuid();
  invoice TEXT := 'WEB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  total NUMERIC := 0;
  item JSONB;
  normalized_items JSONB := '[]'::jsonb;
  current_price NUMERIC;
BEGIN
  SELECT * INTO share_row FROM catalog_shares
  WHERE token = p_token AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW());
  IF share_row.id IS NULL THEN RAISE EXCEPTION 'El enlace del catálogo no es válido'; END IF;
  IF NULLIF(trim(p_customer_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del cliente es obligatorio'; END IF;
  IF NULLIF(trim(p_customer_phone), '') IS NULL THEN RAISE EXCEPTION 'El teléfono del cliente es obligatorio'; END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'El carrito está vacío'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((item->>'quantity')::integer, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer) THEN RAISE EXCEPTION 'Un producto ya no tiene inventario suficiente'; END IF;
    SELECT CASE WHEN share_row.price_mode = 'wholesale' THEN wholesale_price ELSE sell_price END INTO current_price FROM products WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id;
    IF COALESCE(current_price, 0) <= 0 THEN RAISE EXCEPTION 'El producto no tiene precio configurado para este catálogo'; END IF;
    UPDATE products SET stock = stock - (item->>'quantity')::integer, updated_at = NOW()
      WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'El inventario cambió, vuelve a intentarlo'; END IF;
    item := jsonb_set(item, '{sellPrice}', to_jsonb(current_price));
    normalized_items := normalized_items || jsonb_build_array(item);
    total := total + (current_price * (item->>'quantity')::integer);
  END LOOP;

  INSERT INTO sales (id, owner_admin_id, invoice_number, items, subtotal, total, amount_paid, change, payment_method, customer_name, customer_phone, status, is_wholesale)
  VALUES (sale_id, share_row.owner_admin_id, invoice, normalized_items, total, total, 0, 0, 'cash', p_customer_name, p_customer_phone, 'pending', share_row.price_mode = 'wholesale');
  RETURN sale_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_catalog_order(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
