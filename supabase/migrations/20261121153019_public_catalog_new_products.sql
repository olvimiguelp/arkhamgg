-- Conservar la selección original e incluir las altas posteriores del mismo catálogo.
DO $$
DECLARE
  signature REGPROCEDURE;
  definition TEXT;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE,
    'public.get_public_catalog_products(text,integer,integer,text,text)'::REGPROCEDURE,
    'public.get_public_catalog_categories(text)'::REGPROCEDURE,
    'public.submit_catalog_order(text,text,text,jsonb)'::REGPROCEDURE
  ] LOOP
    definition := pg_get_functiondef(signature);
    IF strpos(definition, 'p.created_at >= share_row.created_at') > 0 THEN
      CONTINUE;
    END IF;
    IF strpos(definition, 'AND p.id = ANY (share_row.product_ids)') = 0 THEN
      RAISE EXCEPTION 'Falta el filtro de productos en %', signature;
    END IF;

    -- Las consultas de lectura unifican ambas tablas antes de aplicar el alcance.
    definition := replace(definition, 'SELECT p.id, p.owner_admin_id,',
      'SELECT p.id, p.created_at, p.owner_admin_id,');
    definition := replace(definition, 'SELECT a.id, a.owner_admin_id,',
      'SELECT a.id, a.created_at, a.owner_admin_id,');
    definition := replace(definition, 'AND p.id = ANY (share_row.product_ids)',
      'AND (p.id = ANY (share_row.product_ids) OR p.created_at >= share_row.created_at)');
    definition := replace(definition, 'AND a.id = ANY (share_row.product_ids)',
      'AND (a.id = ANY (share_row.product_ids) OR a.created_at >= share_row.created_at)');
    EXECUTE definition;
  END LOOP;
END;
$$;
