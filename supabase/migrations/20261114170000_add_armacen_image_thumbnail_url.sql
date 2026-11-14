ALTER TABLE public.armacen
  ADD COLUMN IF NOT EXISTS image_thumbnail_url TEXT;

DO $$
DECLARE
  function_definition TEXT;
  thumbnail_pattern TEXT := 'a\.image_url[[:space:]]*,[[:space:]]*NULL[[:space:]]*::[[:space:]]*(text|character varying)';
  optimized_pattern TEXT := 'a\.image_url[[:space:]]*,[[:space:]]*a\.image_thumbnail_url';
  occurrence_count INTEGER;
  optimized_count INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::REGPROCEDURE
  ) INTO function_definition;

  SELECT COUNT(*) INTO occurrence_count
  FROM regexp_matches(function_definition, thumbnail_pattern, 'gi');

  IF occurrence_count = 0 THEN
    SELECT COUNT(*) INTO optimized_count
    FROM regexp_matches(function_definition, optimized_pattern, 'gi');
    IF optimized_count = 2 THEN
      RAISE NOTICE 'Las imágenes del almacén ya están habilitadas en get_public_catalog_snapshot';
    ELSE
      RAISE NOTICE 'No se pudo reconocer la consulta de miniaturas; el catálogo seguirá usando image_url';
    END IF;
  ELSE
    function_definition := regexp_replace(
      function_definition,
      thumbnail_pattern,
      'a.image_url, a.image_thumbnail_url',
      'gi'
    );
    EXECUTE function_definition;
    IF occurrence_count <> 2 THEN
      RAISE NOTICE 'Se actualizaron % consultas de imágenes del almacén', occurrence_count;
    END IF;
  END IF;
END;
$$;
