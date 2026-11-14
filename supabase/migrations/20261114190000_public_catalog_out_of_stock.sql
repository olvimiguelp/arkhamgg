DO $$
DECLARE
  function_definition TEXT;
  stock_condition TEXT := 'AND p.stock > 0';
  stock_replacement TEXT := 'AND TRUE';
  occurrence_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE
  ) INTO function_definition;
  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, stock_condition, '')))
    / LENGTH(stock_condition);
  IF occurrence_count = 2 THEN
    EXECUTE REPLACE(function_definition, stock_condition, stock_replacement);
  ELSIF occurrence_count <> 0 THEN
    RAISE EXCEPTION 'No se encontraron las dos condiciones esperadas en get_public_catalog_snapshot';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_public_catalog_products(text,integer,integer,text,text)'::REGPROCEDURE
  ) INTO function_definition;
  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, stock_condition, '')))
    / LENGTH(stock_condition);
  IF occurrence_count = 1 THEN
    EXECUTE REPLACE(function_definition, stock_condition, stock_replacement);
  ELSIF occurrence_count <> 0 THEN
    RAISE EXCEPTION 'No se encontró la condición esperada en get_public_catalog_products';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_armacen_catalog_category;
CREATE INDEX idx_armacen_catalog_category
  ON public.armacen(owner_admin_id, public.normalize_catalog_almacen_category(category), name, id);
