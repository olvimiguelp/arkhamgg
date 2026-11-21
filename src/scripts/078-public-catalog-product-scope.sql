-- Limit public catalog reads and orders to the product IDs saved on the share,
-- in addition to the tenant owner. This keeps a share from exposing unrelated
-- inventory if tenant metadata or a previously saved share is inconsistent.
DO $$
DECLARE
  function_definition TEXT;
  original_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró get_public_catalog_snapshot';
  END IF;

  IF POSITION('p.id = ANY (share_row.product_ids)' IN function_definition) = 0 THEN
    original_definition := function_definition;
    function_definition := REPLACE(
      function_definition,
      'WHERE p.owner_admin_id = share_row.owner_admin_id',
      'WHERE p.owner_admin_id = share_row.owner_admin_id AND p.id = ANY (share_row.product_ids)'
    );
    IF function_definition = original_definition THEN
      RAISE EXCEPTION 'No se encontró el filtro de propietario en get_public_catalog_snapshot';
    END IF;
    EXECUTE function_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.get_public_catalog_products(text,integer,integer,text,text)'::REGPROCEDURE
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró get_public_catalog_products';
  END IF;

  IF POSITION('p.id = ANY (share_row.product_ids)' IN function_definition) = 0 THEN
    original_definition := function_definition;
    function_definition := REPLACE(
      function_definition,
      'WHERE p.owner_admin_id = share_row.owner_admin_id',
      'WHERE p.owner_admin_id = share_row.owner_admin_id AND p.id = ANY (share_row.product_ids)'
    );
    IF function_definition = original_definition THEN
      RAISE EXCEPTION 'No se encontró el filtro de propietario en get_public_catalog_products';
    END IF;
    EXECUTE function_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.get_public_catalog_categories(text)'::REGPROCEDURE
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró get_public_catalog_categories';
  END IF;

  IF POSITION('p.id = ANY (share_row.product_ids)' IN function_definition) = 0 THEN
    original_definition := function_definition;
    function_definition := REPLACE(
      function_definition,
      'WHERE p.owner_admin_id = share_row.owner_admin_id',
      'WHERE p.owner_admin_id = share_row.owner_admin_id AND p.id = ANY (share_row.product_ids)'
    );
    IF function_definition = original_definition THEN
      RAISE EXCEPTION 'No se encontró el filtro de propietario en get_public_catalog_categories';
    END IF;
    EXECUTE function_definition;
  END IF;

  SELECT pg_get_functiondef(
    'public.submit_catalog_order(text,text,text,jsonb)'::REGPROCEDURE
  ) INTO function_definition;

  IF function_definition IS NULL THEN
    RAISE EXCEPTION 'No se encontró submit_catalog_order';
  END IF;

  IF POSITION('a.id = ANY (share_row.product_ids)' IN function_definition) = 0
    OR POSITION('p.id = ANY (share_row.product_ids)' IN function_definition) = 0 THEN
    original_definition := function_definition;
    function_definition := REPLACE(
      function_definition,
      'AND a.owner_admin_id = share_row.owner_admin_id',
      'AND a.owner_admin_id = share_row.owner_admin_id AND a.id = ANY (share_row.product_ids)'
    );
    function_definition := REPLACE(
      function_definition,
      'AND p.owner_admin_id = share_row.owner_admin_id',
      'AND p.owner_admin_id = share_row.owner_admin_id AND p.id = ANY (share_row.product_ids)'
    );

    IF function_definition = original_definition
      OR POSITION('a.id = ANY (share_row.product_ids)' IN function_definition) = 0
      OR POSITION('p.id = ANY (share_row.product_ids)' IN function_definition) = 0 THEN
      RAISE EXCEPTION 'No se encontraron los filtros de propietario en submit_catalog_order';
    END IF;
    EXECUTE function_definition;
  END IF;
END;
$$;
