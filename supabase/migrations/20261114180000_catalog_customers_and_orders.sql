CREATE TABLE IF NOT EXISTS public.catalog_customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(10) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalog_customer_accounts_owner_phone_key UNIQUE (owner_admin_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_catalog_customer_accounts_owner_created
  ON public.catalog_customer_accounts(owner_admin_id, created_at DESC);

ALTER TABLE public.catalog_customer_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_customer_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.catalog_customer_accounts TO service_role;

CREATE TABLE IF NOT EXISTS public.catalog_customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.catalog_customer_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_customer_sessions_customer
  ON public.catalog_customer_sessions(customer_id, expires_at DESC);

ALTER TABLE public.catalog_customer_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_customer_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.catalog_customer_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.catalog_order_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE CASCADE,
  catalog_customer_id UUID REFERENCES public.catalog_customer_accounts(id) ON DELETE SET NULL,
  invoice_number VARCHAR(50) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_order_history_owner_created
  ON public.catalog_order_history(owner_admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_order_history_customer
  ON public.catalog_order_history(catalog_customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_order_history_owner_phone
  ON public.catalog_order_history(owner_admin_id, customer_phone, created_at DESC);

ALTER TABLE public.catalog_order_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_order_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.catalog_order_history TO service_role;

INSERT INTO public.catalog_order_history (
  owner_admin_id,
  sale_id,
  invoice_number,
  customer_name,
  customer_phone,
  items,
  total,
  created_at
)
SELECT
  s.owner_admin_id,
  s.id,
  s.invoice_number,
  COALESCE(s.customer_name, 'Cliente'),
  COALESCE(s.customer_phone, ''),
  COALESCE(s.items, '[]'::JSONB),
  COALESCE(s.total, 0),
  COALESCE(s.date, s.created_at, NOW())
FROM public.sales s
WHERE s.invoice_number LIKE 'WEB-%'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(s.items, '[]'::JSONB)) AS catalog_item(item)
    WHERE catalog_item.item->>'sourceTable' = 'armacen'
  )
ON CONFLICT (sale_id) DO NOTHING;

DO $$
DECLARE
  function_definition TEXT;
  source_key TEXT := $key$'source_table'$key$;
  source_fragment TEXT := $fragment$'business_name', COALESCE(share_row.business_name, 'Catálogo de productos'),$fragment$;
  source_replacement TEXT := $replacement$'business_name', COALESCE(share_row.business_name, 'Catálogo de productos'), 'source_table', share_row.source_table,$replacement$;
  old_phone_check TEXT := $old$IF NULLIF(BTRIM(p_customer_phone), '') IS NULL THEN$old$;
  new_phone_check TEXT := $new$IF COALESCE(BTRIM(p_customer_phone), '') !~ '^[0-9]{10}$' THEN$new$;
  old_phone_message TEXT := $old$RAISE EXCEPTION 'El teléfono del cliente es obligatorio';$old$;
  new_phone_message TEXT := $new$RAISE EXCEPTION 'El teléfono debe tener exactamente 10 dígitos';$new$;
  history_insert TEXT := $insert$IF share_row.source_table = 'armacen' THEN
      INSERT INTO public.catalog_order_history (
        owner_admin_id, sale_id, invoice_number, customer_name, customer_phone, items, total
      ) VALUES (
        share_row.owner_admin_id, sale_id, invoice, BTRIM(p_customer_name),
        BTRIM(p_customer_phone), normalized_items, total
      );
    END IF;
    RETURN sale_id;$insert$;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró get_public_catalog_snapshot';
  END IF;

  IF POSITION(source_key IN function_definition) = 0 THEN
    IF POSITION(source_fragment IN function_definition) = 0 THEN
      RAISE EXCEPTION 'No se pudo agregar source_table a get_public_catalog_snapshot';
    END IF;
    function_definition := REPLACE(function_definition, source_fragment, source_replacement);
    EXECUTE function_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.submit_catalog_order(text,text,text,jsonb)'::REGPROCEDURE
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró submit_catalog_order';
  END IF;

  IF POSITION(new_phone_check IN function_definition) = 0 THEN
    IF POSITION(old_phone_check IN function_definition) = 0
      OR POSITION(old_phone_message IN function_definition) = 0 THEN
      RAISE EXCEPTION 'No se pudo reconocer la validación del teléfono en submit_catalog_order';
    END IF;
    function_definition := REPLACE(function_definition, old_phone_check, new_phone_check);
    function_definition := REPLACE(function_definition, old_phone_message, new_phone_message);
  END IF;

  IF POSITION('INSERT INTO public.catalog_order_history' IN function_definition) = 0 THEN
    IF POSITION('RETURN sale_id;' IN function_definition) = 0 THEN
      RAISE EXCEPTION 'No se pudo agregar el historial a submit_catalog_order';
    END IF;
    function_definition := REPLACE(function_definition, 'RETURN sale_id;', history_insert);
  END IF;

  EXECUTE function_definition;
END;
$$;

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

  IF share_row.id IS NULL OR share_row.source_table <> 'armacen' THEN
    RAISE EXCEPTION 'El enlace no corresponde a un catálogo de almacén activo';
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo asociar el pedido al historial del cliente';
  END IF;

  RETURN created_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_order_for_customer(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_catalog_order_for_customer(TEXT, UUID, JSONB) TO service_role;
