-- Permite que un enlace del almacén incluya varias categorías seleccionadas.
CREATE OR REPLACE FUNCTION public.catalog_share_includes_almacen_category(
  p_category_filter TEXT,
  p_category TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN LEFT(BTRIM(COALESCE(p_category_filter, '')), 5) = 'json:' THEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(SUBSTRING(BTRIM(p_category_filter), 6)::JSONB) AS selected(value)
      WHERE public.normalize_catalog_almacen_category(selected.value) =
        public.normalize_catalog_almacen_category(p_category)
    )
    ELSE public.normalize_catalog_almacen_category(p_category) = p_category_filter
  END;
$$;

REVOKE ALL ON FUNCTION public.catalog_share_includes_almacen_category(TEXT, TEXT) FROM PUBLIC;

DO $$
DECLARE
  function_definition TEXT;
  category_condition TEXT := 'public.normalize_catalog_almacen_category(a.category) = share_row.category_filter';
  category_replacement TEXT := 'public.catalog_share_includes_almacen_category(share_row.category_filter, a.category)';
  category_filter_output TEXT := '''category_filter'', share_row.category_filter,';
  category_filter_replacement TEXT := '''category_filter'', CASE WHEN share_row.source_table = ''armacen'' AND LEFT(BTRIM(share_row.category_filter), 5) = ''json:'' THEN NULL ELSE share_row.category_filter END,';
  occurrence_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE
  ) INTO function_definition;
  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, category_condition, '')))
    / LENGTH(category_condition);
  IF occurrence_count <> 2 THEN
    RAISE EXCEPTION 'No se encontraron las dos validaciones esperadas en get_public_catalog_snapshot';
  END IF;
  function_definition := REPLACE(function_definition, category_condition, category_replacement);
  IF POSITION(category_filter_output IN function_definition) = 0 THEN
    RAISE EXCEPTION 'No se encontró category_filter en get_public_catalog_snapshot';
  END IF;
  function_definition := REPLACE(function_definition, category_filter_output, category_filter_replacement);
  EXECUTE function_definition;

  SELECT pg_get_functiondef(
    'public.submit_catalog_order(text,text,text,jsonb)'::REGPROCEDURE
  ) INTO function_definition;
  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, category_condition, '')))
    / LENGTH(category_condition);
  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION 'No se encontró la validación esperada en submit_catalog_order';
  END IF;
  EXECUTE REPLACE(function_definition, category_condition, category_replacement);

  SELECT pg_get_functiondef(
    'public.get_public_catalog_products(text,integer,integer,text,text)'::REGPROCEDURE
  ) INTO function_definition;
  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, category_condition, '')))
    / LENGTH(category_condition);
  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION 'No se encontró la validación esperada en get_public_catalog_products';
  END IF;
  EXECUTE REPLACE(function_definition, category_condition, category_replacement);

  SELECT pg_get_functiondef(
    'public.get_public_catalog_categories(text)'::REGPROCEDURE
  ) INTO function_definition;
  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, category_condition, '')))
    / LENGTH(category_condition);
  IF occurrence_count <> 1 THEN
    RAISE EXCEPTION 'No se encontró la validación esperada en get_public_catalog_categories';
  END IF;
  EXECUTE REPLACE(function_definition, category_condition, category_replacement);
END;
$$;
