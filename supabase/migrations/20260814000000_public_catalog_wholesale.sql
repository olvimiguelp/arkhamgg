ALTER TABLE public.catalog_shares
  ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE public.catalog_shares
  DROP CONSTRAINT IF EXISTS catalog_shares_price_mode_check;

ALTER TABLE public.catalog_shares
  ADD CONSTRAINT catalog_shares_price_mode_check
  CHECK (price_mode IN ('normal', 'wholesale'));

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
    IF NOT ((item->>'id')::uuid = ANY(share_row.product_ids)) THEN RAISE EXCEPTION 'Producto no autorizado en este catálogo'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer) THEN RAISE EXCEPTION 'Un producto ya no tiene inventario suficiente'; END IF;
    SELECT CASE WHEN share_row.price_mode = 'wholesale' THEN wholesale_price ELSE sell_price END INTO current_price FROM products WHERE id = (item->>'id')::uuid;
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
