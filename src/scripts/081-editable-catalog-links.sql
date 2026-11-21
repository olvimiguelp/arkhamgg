-- Each new customer link retains its own explicit warehouse selection.
ALTER TABLE public.catalog_shares ADD COLUMN individual_categories boolean NOT NULL DEFAULT false;

CREATE FUNCTION catalog_private.link_categories(filter_value text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT ARRAY(SELECT DISTINCT public.normalize_catalog_almacen_category(name)
    FROM jsonb_array_elements_text(CASE WHEN left(filter_value,5) = 'json:'
      THEN substring(filter_value FROM 6)::jsonb ELSE jsonb_build_array(filter_value) END) AS names(name)
    WHERE btrim(name) <> '' ORDER BY 1)
$$;

DO $$
DECLARE
  signature regprocedure;
  def text;
  shared_categories text := 'catalog_private.shared_warehouse_category(share_row.owner_admin_id, ';
  old_list text := 'c.source_table = share_row.source_table';
  new_list text := 'c.source_table = share_row.source_table AND NOT share_row.individual_categories
    UNION SELECT unnest(catalog_private.link_categories(share_row.category_filter)) WHERE share_row.individual_categories';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::regprocedure,
    'public.get_public_catalog_products(text,integer,integer,text,text)'::regprocedure,
    'public.get_public_catalog_categories(text)'::regprocedure,
    'public.submit_catalog_order(text,text,text,jsonb)'::regprocedure
  ] LOOP
    def := pg_get_functiondef(signature);
    IF strpos(def,shared_categories) = 0 THEN RAISE EXCEPTION 'Falta el filtro de almacén en %',signature; END IF;
    def := replace(def, 'OR ' || shared_categories || 'a.category)', 'OR (NOT share_row.individual_categories AND ' || shared_categories || 'a.category))');
    def := replace(def, 'AND ' || shared_categories || 'p.category)', 'AND NOT share_row.individual_categories AND ' || shared_categories || 'p.category)');
    IF signature IN ('public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::regprocedure,
                     'public.get_public_catalog_categories(text)'::regprocedure) THEN
      IF strpos(def,old_list) = 0 THEN RAISE EXCEPTION 'Falta la lista de categorías en %',signature; END IF;
      def := replace(def,old_list,new_list);
    END IF;
    EXECUTE def;
  END LOOP;
END;
$$;

-- A row lock serializes concurrent additions and keeps the category filter and
-- the IDs of pre-existing items in the newly enabled categories consistent.
CREATE FUNCTION public.extend_warehouse_catalog_link(
  actor_id uuid, actor_password text, catalog_token text, add_categories text[] DEFAULT '{}'
) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  share public.catalog_shares%ROWTYPE;
  assigned text[];
  additions text[];
BEGIN
  IF NOT EXISTS (SELECT FROM public.employees e WHERE e.id = actor_id AND e.role = 'admin'
    AND e.status = 'active' AND e.password = actor_password AND btrim(actor_password) <> '') THEN
    RAISE EXCEPTION 'Se requiere una sesión de administrador activa';
  END IF;

  SELECT * INTO share FROM public.catalog_shares s WHERE s.token = catalog_token AND s.active
    AND s.source_table = 'armacen' AND s.owner_admin_id = actor_id
    AND (s.expires_at IS NULL OR s.expires_at > now()) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El enlace de almacén no está activo o no pertenece a tu empresa'; END IF;

  assigned := catalog_private.link_categories(share.category_filter);
  additions := ARRAY(SELECT DISTINCT public.normalize_catalog_almacen_category(n) FROM unnest(add_categories) n
    WHERE btrim(n) <> '' AND NOT (public.normalize_catalog_almacen_category(n) = ANY(assigned)));
  IF cardinality(additions) > 0 THEN
    assigned := ARRAY(SELECT DISTINCT n FROM unnest(assigned || additions) n ORDER BY n);
    UPDATE public.catalog_shares SET
      category_filter = 'json:' || to_jsonb(assigned)::text,
      product_ids = ARRAY(SELECT unnest(share.product_ids) UNION SELECT a.id FROM public.armacen a
        WHERE a.owner_admin_id = actor_id AND public.normalize_catalog_almacen_category(a.category) = ANY(additions))
    WHERE id = share.id;
  END IF;

  RETURN ARRAY(SELECT unnest(assigned) UNION SELECT c.name FROM catalog_private.managed_categories c
    WHERE NOT share.individual_categories AND c.owner_admin_id = actor_id AND c.source_table = 'armacen' ORDER BY 1);
END;
$$;
REVOKE ALL ON FUNCTION public.extend_warehouse_catalog_link(uuid,text,text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_warehouse_catalog_link(uuid,text,text,text[]) TO anon, authenticated;
