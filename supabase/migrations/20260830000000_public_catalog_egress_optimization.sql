-- Catálogo público: evita descargar el inventario completo y las mismas
-- categorías en cada búsqueda. La respuesta contiene sólo una página y un
-- elemento extra para saber si hay más resultados.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image_thumbnail_url TEXT;

-- Índices para las dos rutas más frecuentes del catálogo: listado general y
-- listado por categoría. Sólo indexamos productos que pueden aparecer.
CREATE INDEX IF NOT EXISTS idx_products_catalog_visible_order
  ON public.products(owner_admin_id, name, id)
  WHERE stock > 0;

CREATE INDEX IF NOT EXISTS idx_products_catalog_visible_category_order
  ON public.products(owner_admin_id, category, name, id)
  WHERE stock > 0;

CREATE OR REPLACE FUNCTION public.get_public_catalog_snapshot(
  p_token TEXT,
  p_limit INTEGER DEFAULT 24,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_include_categories BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 24), 1), 48);
  safe_offset INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 100000);
  safe_search TEXT := NULLIF(BTRIM(LEFT(COALESCE(p_search, ''), 100)), '');
  safe_category TEXT := NULLIF(BTRIM(LEFT(COALESCE(p_category, ''), 100)), '');
  catalog_categories JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO share_row
  FROM public.catalog_shares
  WHERE token = p_token
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no es válido o ha vencido';
  END IF;

  IF p_include_categories THEN
    SELECT COALESCE(jsonb_agg(category ORDER BY category), '[]'::JSONB)
    INTO catalog_categories
    FROM (
      SELECT DISTINCT p.category
      FROM public.products p
      WHERE p.owner_admin_id = share_row.owner_admin_id
        AND p.stock > 0
        AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
        AND NULLIF(BTRIM(p.category), '') IS NOT NULL
    ) AS visible_categories;
  END IF;

  RETURN (
    WITH selected_products AS (
      SELECT
        p.id,
        p.sku,
        p.name,
        p.category,
        p.stock,
        CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END AS sell_price,
        p.image_url,
        p.image_thumbnail_url
      FROM public.products p
      WHERE p.owner_admin_id = share_row.owner_admin_id
        AND p.stock > 0
        AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
        AND (
          safe_search IS NULL
          OR p.name ILIKE '%' || safe_search || '%'
          OR p.sku ILIKE '%' || safe_search || '%'
        )
        AND (safe_category IS NULL OR p.category = safe_category)
      ORDER BY p.name, p.id
      LIMIT safe_limit + 1
      OFFSET safe_offset
    ),
    page_products AS (
      SELECT *
      FROM selected_products
      LIMIT safe_limit
    )
    SELECT jsonb_build_object(
      'business_name', COALESCE(share_row.business_name, 'Catálogo de productos'),
      'price_mode', COALESCE(share_row.price_mode, 'normal'),
      'categories', catalog_categories,
      'products', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', id,
              'sku', sku,
              'name', name,
              'category', category,
              'stock', stock,
              'sell_price', sell_price,
              'image_url', image_url,
              'image_thumbnail_url', image_thumbnail_url
            )
            ORDER BY name, id
          )
          FROM page_products
        ),
        '[]'::JSONB
      ),
      'has_more', (SELECT COUNT(*) > safe_limit FROM selected_products)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalog_snapshot(TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_catalog_snapshot(TEXT, INTEGER, INTEGER, TEXT, TEXT, BOOLEAN)
  TO anon, authenticated;

-- El navegador sólo envía id y cantidad. Los campos que se guardan en la venta
-- se reconstruyen desde la base de datos para mantener la factura completa y
-- no aceptar precios, stock o nombres manipulados por el cliente.
CREATE OR REPLACE FUNCTION public.submit_catalog_order(
  p_token TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
  product_row public.products%ROWTYPE;
  sale_id UUID := gen_random_uuid();
  invoice TEXT := 'WEB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  total NUMERIC := 0;
  item JSONB;
  normalized_items JSONB := '[]'::JSONB;
  current_price NUMERIC;
  requested_quantity INTEGER;
BEGIN
  SELECT * INTO share_row
  FROM public.catalog_shares
  WHERE token = p_token
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no es válido';
  END IF;
  IF NULLIF(BTRIM(p_customer_name), '') IS NULL THEN
    RAISE EXCEPTION 'El nombre del cliente es obligatorio';
  END IF;
  IF NULLIF(BTRIM(p_customer_phone), '') IS NULL THEN
    RAISE EXCEPTION 'El teléfono del cliente es obligatorio';
  END IF;
  IF COALESCE(jsonb_array_length(p_items), 0) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    requested_quantity := COALESCE((item->>'quantity')::INTEGER, 0);
    IF requested_quantity <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida';
    END IF;

    SELECT * INTO product_row
    FROM public.products
    WHERE id = (item->>'id')::UUID
      AND owner_admin_id = share_row.owner_admin_id
    FOR UPDATE;

    IF product_row.id IS NULL OR product_row.stock < requested_quantity THEN
      RAISE EXCEPTION 'Un producto ya no tiene inventario suficiente';
    END IF;

    current_price := CASE
      WHEN share_row.price_mode = 'wholesale' THEN product_row.wholesale_price
      ELSE product_row.sell_price
    END;
    IF COALESCE(current_price, 0) <= 0 THEN
      RAISE EXCEPTION 'El producto no tiene precio configurado para este catálogo';
    END IF;

    UPDATE public.products
    SET stock = stock - requested_quantity,
        updated_at = NOW()
    WHERE id = product_row.id
      AND owner_admin_id = share_row.owner_admin_id
      AND stock >= requested_quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El inventario cambió, vuelve a intentarlo';
    END IF;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'id', product_row.id,
      'sku', product_row.sku,
      'name', product_row.name,
      'category', product_row.category,
      'sellPrice', current_price,
      'stock', product_row.stock,
      'quantity', requested_quantity,
      'sourceTable', 'products',
      'sourceId', product_row.id,
      'cartId', product_row.id
    ));
    total := total + (current_price * requested_quantity);
  END LOOP;

  INSERT INTO public.sales (
    id, owner_admin_id, invoice_number, items, subtotal, total, amount_paid,
    change, payment_method, customer_name, customer_phone, status, is_wholesale
  )
  VALUES (
    sale_id, share_row.owner_admin_id, invoice, normalized_items, total, total, 0,
    0, 'cash', BTRIM(p_customer_name), BTRIM(p_customer_phone), 'pending',
    share_row.price_mode = 'wholesale'
  );
  RETURN sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_order(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_catalog_order(TEXT, TEXT, TEXT, JSONB)
  TO anon, authenticated;
