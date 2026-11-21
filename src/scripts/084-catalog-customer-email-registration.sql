ALTER TABLE public.catalog_customer_accounts
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS catalog_customer_accounts_owner_email_key
  ON public.catalog_customer_accounts(owner_admin_id, lower(email))
  WHERE email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_catalog_order_for_customer(
  p_token TEXT,
  p_customer_id UUID,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
  customer_row public.catalog_customer_accounts%ROWTYPE;
  created_sale_id UUID;
BEGIN
  SELECT * INTO share_row
  FROM public.catalog_shares
  WHERE token = p_token
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no está activo';
  END IF;

  SELECT * INTO customer_row
  FROM public.catalog_customer_accounts
  WHERE id = p_customer_id
    AND owner_admin_id = share_row.owner_admin_id
    AND is_active = TRUE
  LIMIT 1;

  IF customer_row.id IS NULL THEN
    RAISE EXCEPTION 'La cuenta del cliente no está activa para este catálogo';
  END IF;

  created_sale_id := public.submit_catalog_order(
    p_token,
    customer_row.name,
    customer_row.phone,
    p_items
  );

  UPDATE public.catalog_order_history AS history
  SET catalog_customer_id = customer_row.id
  WHERE history.sale_id = created_sale_id
    AND history.owner_admin_id = customer_row.owner_admin_id;

  RETURN created_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_order_for_customer(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_catalog_order_for_customer(TEXT, UUID, JSONB) TO service_role;
