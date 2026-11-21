-- Category names belong to the business, independently of its public links.
CREATE SCHEMA IF NOT EXISTS catalog_private;
REVOKE ALL ON SCHEMA catalog_private FROM PUBLIC, anon, authenticated;
CREATE TABLE catalog_private.managed_categories (
  owner_admin_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  source_table text NOT NULL CHECK (source_table IN ('products', 'armacen')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  name_key text GENERATED ALWAYS AS (lower(name)) STORED,
  PRIMARY KEY (owner_admin_id, source_table, name_key)
);

CREATE FUNCTION catalog_private.shared_warehouse_category(owner_id uuid, category_name text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT FROM catalog_private.managed_categories c WHERE c.owner_admin_id = owner_id
    AND c.source_table = 'armacen' AND c.name_key = public.normalize_catalog_almacen_category(category_name))
$$;

-- Staff sessions use employee credentials. Derive the owner from the verified
-- employee, and commit legacy imports and individual edits atomically.
CREATE FUNCTION public.manage_catalog_categories(
  actor_id uuid, actor_password text, add_names text[] DEFAULT '{}', remove_name text DEFAULT NULL, catalog_source text DEFAULT 'products'
) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  staff public.employees%ROWTYPE;
  owner_id uuid;
BEGIN
  SELECT * INTO staff FROM public.employees e WHERE e.id = actor_id
    AND e.status = 'active' AND e.password = actor_password AND btrim(actor_password) <> '';
  IF catalog_source IS NULL OR catalog_source NOT IN ('armacen','products') THEN RAISE EXCEPTION 'Catálogo inválido'; END IF;
  IF staff.id IS NULL OR (catalog_source = 'armacen' AND staff.role IS DISTINCT FROM 'admin') OR (staff.role IS DISTINCT FROM 'admin' AND NOT (
      coalesce((staff.permissions->>'products')::boolean, false)
      AND (cardinality(add_names) = 0 OR coalesce((staff.permissions->>'canAdd')::boolean, false))
      AND (remove_name IS NULL OR coalesce((staff.permissions->>'canDelete')::boolean, false))
    )) THEN RAISE EXCEPTION 'Sin permiso para gestionar categorías'; END IF;
  owner_id := CASE WHEN staff.role = 'admin' THEN staff.id ELSE staff.owner_admin_id END;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Empresa no asignada'; END IF;
  IF remove_name IS NOT NULL THEN
    IF catalog_source = 'products' AND EXISTS (SELECT FROM public.products WHERE owner_admin_id = owner_id AND lower(category) = lower(remove_name)) THEN
      RAISE EXCEPTION 'La categoría tiene productos asignados';
    END IF;
    DELETE FROM catalog_private.managed_categories WHERE owner_admin_id = owner_id AND source_table = catalog_source AND name_key = lower(remove_name);
  END IF;
  INSERT INTO catalog_private.managed_categories(owner_admin_id, source_table, name)
    SELECT owner_id, catalog_source, CASE WHEN catalog_source = 'armacen' THEN public.normalize_catalog_almacen_category(n) ELSE btrim(n) END FROM unnest(add_names) n WHERE btrim(n) <> ''
    ON CONFLICT DO NOTHING;
  RETURN ARRAY(SELECT name FROM catalog_private.managed_categories WHERE owner_admin_id = owner_id AND source_table = catalog_source ORDER BY name);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_catalog_categories(uuid,text,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_catalog_categories(uuid,text,text[],text,text) TO anon, authenticated;

DO $$
DECLARE
  signature regprocedure;
  def text;
  membership text := 'public.catalog_share_includes_almacen_category(share_row.category_filter, a.category)';
  scope text;
  shared_names text := 'SELECT c.name FROM catalog_private.managed_categories c WHERE c.owner_admin_id = share_row.owner_admin_id AND c.source_table = share_row.source_table';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::regprocedure,
    'public.get_public_catalog_products(text,integer,integer,text,text)'::regprocedure,
    'public.get_public_catalog_categories(text)'::regprocedure,
    'public.submit_catalog_order(text,text,text,jsonb)'::regprocedure
  ] LOOP
    def := pg_get_functiondef(signature);
    IF strpos(def, membership) = 0 THEN RAISE EXCEPTION 'Missing warehouse scope in %', signature; END IF;
    def := replace(def, membership, '(' || membership || ' OR catalog_private.shared_warehouse_category(share_row.owner_admin_id, a.category))');
    IF signature = 'public.submit_catalog_order(text,text,text,jsonb)'::regprocedure THEN
      scope := '(a.id = ANY (share_row.product_ids) OR a.created_at >= share_row.created_at)';
      IF strpos(def,scope) = 0 THEN RAISE EXCEPTION 'Missing order scope'; END IF;
      def := replace(def, scope, '(' || scope || ' OR catalog_private.shared_warehouse_category(share_row.owner_admin_id, a.category))');
    ELSE
      scope := '(p.id = ANY (share_row.product_ids) OR p.created_at >= share_row.created_at)';
      IF strpos(def,scope) = 0 THEN RAISE EXCEPTION 'Missing inventory scope'; END IF;
      def := replace(def, scope, '(' || scope || ' OR (share_row.source_table = ''armacen'' AND catalog_private.shared_warehouse_category(share_row.owner_admin_id, p.category)))');
    END IF;
    IF signature = 'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::regprocedure THEN
      IF strpos(def, ') AS visible_categories') = 0 THEN RAISE EXCEPTION 'Missing category list'; END IF;
      def := replace(def, ') AS visible_categories', ' UNION ' || shared_names || ') AS visible_categories');
      -- A formerly fixed warehouse link becomes filterable as its selection grows.
      def := replace(def, '''category_filter'', CASE WHEN', '''category_filter'', CASE WHEN (jsonb_array_length(catalog_categories) > 1 OR (jsonb_array_length(catalog_categories) = 1 AND catalog_categories->>0 <> share_row.category_filter)) THEN NULL WHEN');
    ELSIF signature = 'public.get_public_catalog_categories(text)'::regprocedure THEN
      IF strpos(def, 'ORDER BY p.category') = 0 THEN RAISE EXCEPTION 'Missing category order'; END IF;
      def := replace(def, 'ORDER BY p.category', ' UNION SELECT n::varchar(100) FROM (' || shared_names || ') names(n) ORDER BY 1');
    END IF;
    EXECUTE def;
  END LOOP;
END;
$$;
