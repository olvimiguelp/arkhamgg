-- Busca todas las palabras, en cualquier orden, entre nombre, código y categoría.
-- La normalización no interpreta % ni _ como comodines y no requiere extensiones.
CREATE OR REPLACE FUNCTION public.normalize_catalog_search(value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT regexp_replace(normalize(lower(COALESCE(value, '')), NFD), U&'[\0300-\036f]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.catalog_product_matches_search(
  product_name TEXT,
  product_sku TEXT,
  product_category TEXT,
  search_terms TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM unnest(search_terms) AS terms(term)
    WHERE term <> ''
      AND strpos(
        public.normalize_catalog_search(
          COALESCE(product_name, '') || ' ' || COALESCE(product_sku, '') || ' ' || COALESCE(product_category, '')
        ), term
      ) = 0
  );
$$;

-- Helpers internos: los RPC existentes conservan sus permisos y validan el enlace.
REVOKE ALL ON FUNCTION public.normalize_catalog_search(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_product_matches_search(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  target RECORD;
  function_definition TEXT;
  updated_definition TEXT;
  search_replacement TEXT := 'public.catalog_product_matches_search(p.name, p.sku, p.category, search_terms)';
  terms_declaration TEXT := $declaration$DECLARE
  search_terms TEXT[] := regexp_split_to_array(
    public.normalize_catalog_search(LEFT(COALESCE(p_search, ''), 100)), '[[:space:]]+'
  );$declaration$;
BEGIN
  -- Sólo sustituye el filtro de búsqueda: conserva categorías, precios, stock,
  -- paginación y aislamiento por propietario de las versiones ya instaladas.
  FOR target IN SELECT * FROM (VALUES
    (
      'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)',
      $pattern$\([[:space:]]*safe_search IS NULL[[:space:]]+OR p\.name ILIKE '%' \|\| safe_search \|\| '%'[[:space:]]+OR p\.sku ILIKE '%' \|\| safe_search \|\| '%'[[:space:]]*\)$pattern$
    ),
    (
      'public.get_public_catalog_products(text,integer,integer,text,text)',
      $pattern$\(NULLIF\(TRIM\(p_search\), ''\) IS NULL[[:space:]]+OR p\.name ILIKE '%' \|\| TRIM\(p_search\) \|\| '%'[[:space:]]+OR p\.sku ILIKE '%' \|\| TRIM\(p_search\) \|\| '%'\)$pattern$
    )
  ) AS functions(signature, search_pattern)
  LOOP
    SELECT pg_get_functiondef(target.signature::REGPROCEDURE) INTO function_definition;
    IF strpos(function_definition, search_replacement) > 0 THEN
      CONTINUE; -- Permite volver a ejecutar el script.
    END IF;
    IF (SELECT count(*) FROM regexp_matches(function_definition, target.search_pattern, 'g')) <> 1 THEN
      RAISE EXCEPTION 'No se encontró el filtro de búsqueda esperado en %', target.signature;
    END IF;
    updated_definition := regexp_replace(function_definition, target.search_pattern, search_replacement);
    IF strpos(updated_definition, 'DECLARE') = 0 THEN
      RAISE EXCEPTION 'No se encontró DECLARE en %', target.signature;
    END IF;
    -- replace conserva literalmente las barras del SQL insertado.
    EXECUTE replace(updated_definition, 'DECLARE', terms_declaration);
  END LOOP;
END;
$$;
