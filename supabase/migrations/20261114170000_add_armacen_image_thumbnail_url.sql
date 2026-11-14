ALTER TABLE public.armacen
  ADD COLUMN IF NOT EXISTS image_thumbnail_url TEXT;

DO $$
DECLARE
  function_definition TEXT;
  thumbnail_placeholder TEXT := 'a.image_url, NULL::TEXT';
  thumbnail_column TEXT := 'a.image_url, a.image_thumbnail_url';
  occurrence_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE
  ) INTO function_definition;

  occurrence_count := (LENGTH(function_definition) - LENGTH(REPLACE(function_definition, thumbnail_placeholder, '')))
    / LENGTH(thumbnail_placeholder);
  IF occurrence_count <> 2 THEN
    RAISE EXCEPTION 'No se encontraron las dos consultas de imágenes del almacén en get_public_catalog_snapshot';
  END IF;

  EXECUTE REPLACE(function_definition, thumbnail_placeholder, thumbnail_column);
END;
$$;
