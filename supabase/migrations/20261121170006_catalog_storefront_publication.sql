-- NULL retains the historical ID-based selection. An empty array means all
-- categories of this share's source and price mode, including future products.
ALTER TABLE public.catalog_shares ADD COLUMN catalog_categories text[];
CREATE TABLE catalog_private.storefront_sections (
  owner_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('normal','wholesale','warehouse')),
  share_id uuid NOT NULL UNIQUE REFERENCES public.catalog_shares(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_id,kind)
);

DO $$
DECLARE
  signature regprocedure;
  def text;
  alias text;
  old_scope text;
  new_scope text;
  warehouse_filter text := 'public.catalog_share_includes_almacen_category(share_row.category_filter, a.category)';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::regprocedure,
    'public.get_public_catalog_products(text,integer,integer,text,text)'::regprocedure,
    'public.get_public_catalog_categories(text)'::regprocedure,
    'public.submit_catalog_order(text,text,text,jsonb)'::regprocedure
  ] LOOP
    def := pg_get_functiondef(signature);
    IF strpos(def,warehouse_filter) = 0 THEN RAISE EXCEPTION 'Missing warehouse filter in %',signature; END IF;
    def := replace(def,warehouse_filter,'(share_row.catalog_categories IS NOT NULL OR ' || warehouse_filter || ')');
    FOREACH alias IN ARRAY ARRAY['p','a'] LOOP
      old_scope := alias || '.owner_admin_id = share_row.owner_admin_id AND ';
      IF strpos(def,old_scope) = 0 THEN
        IF alias = 'p' OR signature = 'public.submit_catalog_order(text,text,text,jsonb)'::regprocedure THEN
          RAISE EXCEPTION 'Missing owner scope in %',signature;
        END IF;
        CONTINUE;
      END IF;
      new_scope := alias || '.owner_admin_id = share_row.owner_admin_id AND (share_row.catalog_categories IS NULL OR
        cardinality(share_row.catalog_categories) = 0 OR (CASE WHEN share_row.source_table = ''armacen''
        THEN public.normalize_catalog_almacen_category(' || alias || '.category) ELSE ' || alias || '.category END) = ANY(share_row.catalog_categories)) AND ';
      def := replace(def,old_scope,new_scope);
      def := replace(def,alias || '.id = ANY (share_row.product_ids)', '(share_row.catalog_categories IS NOT NULL OR ' || alias || '.id = ANY (share_row.product_ids))');
    END LOOP;
    def := replace(def,'unnest(catalog_private.link_categories(share_row.category_filter))',
      'unnest(coalesce(share_row.catalog_categories,catalog_private.link_categories(share_row.category_filter)))');
    def := replace(def,'''category_filter'', CASE WHEN','''category_filter'', CASE WHEN share_row.catalog_categories IS NOT NULL THEN NULL WHEN');
    EXECUTE def;
  END LOOP;
END;
$$;

-- Governed shares are created and updated only through staff-validated RPCs.
CREATE FUNCTION catalog_private.protect_configured_share() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND (
    (TG_OP <> 'INSERT' AND OLD.catalog_categories IS NOT NULL) OR
    (TG_OP <> 'DELETE' AND NEW.catalog_categories IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Usa la administración del catálogo'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_configured_share BEFORE INSERT OR UPDATE OR DELETE ON public.catalog_shares
  FOR EACH ROW EXECUTE FUNCTION catalog_private.protect_configured_share();

CREATE FUNCTION public.catalog_storefront_sections(p_owner uuid)
RETURNS TABLE(kind text, token text, categories text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT f.kind,s.token,s.catalog_categories FROM catalog_private.storefront_sections f
  JOIN public.catalog_shares s ON s.id=f.share_id AND s.owner_admin_id=f.owner_id
  WHERE f.owner_id=p_owner AND s.active AND (s.expires_at IS NULL OR s.expires_at > now())
  ORDER BY CASE f.kind WHEN 'normal' THEN 1 WHEN 'wholesale' THEN 2 ELSE 3 END
$$;

CREATE FUNCTION public.configure_catalog_publication(actor_id uuid, actor_password text,
  p_kind text, p_categories text[], p_home boolean, p_visible boolean DEFAULT true)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  staff public.employees%ROWTYPE;
  owner_id uuid;
  category_names text[];
  section_id uuid;
  result_token text;
BEGIN
  SELECT * INTO staff FROM public.employees WHERE id=actor_id AND status='active' AND password=actor_password AND btrim(actor_password)<>'';
  IF NOT FOUND OR (staff.role IS DISTINCT FROM 'admin' AND (p_home OR NOT coalesce((staff.permissions->>'employees')::boolean,false))) THEN
    RAISE EXCEPTION 'Sin permiso para publicar este catálogo';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('normal','wholesale','warehouse') OR p_categories IS NULL OR p_home IS NULL OR p_visible IS NULL THEN
    RAISE EXCEPTION 'Selección de catálogo inválida';
  END IF;
  owner_id := CASE WHEN staff.role='admin' THEN staff.id ELSE staff.owner_admin_id END;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Empresa no asignada'; END IF;
  category_names := ARRAY(SELECT DISTINCT CASE WHEN p_kind='warehouse' THEN public.normalize_catalog_almacen_category(n) ELSE n END
    FROM unnest(p_categories) n WHERE btrim(n)<>'' ORDER BY 1);
  IF cardinality(p_categories)>0 AND cardinality(category_names)=0 THEN RAISE EXCEPTION 'Selecciona una categoría'; END IF;
  IF p_home THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text || p_kind,0));
    SELECT f.share_id INTO section_id FROM catalog_private.storefront_sections f
      WHERE f.owner_id=staff.id AND f.kind=p_kind;
  END IF;
  IF section_id IS NOT NULL THEN
    UPDATE public.catalog_shares SET active=p_visible,catalog_categories=category_names
      WHERE id=section_id RETURNING token INTO result_token;
  ELSIF p_visible THEN
    INSERT INTO public.catalog_shares(owner_admin_id,token,business_name,source_table,price_mode,category_filter,individual_categories,catalog_categories,product_ids)
    VALUES(owner_id,replace(gen_random_uuid()::text,'-',''),'Catálogo 049',
      CASE WHEN p_kind='warehouse' THEN 'armacen' ELSE 'products' END,
      CASE WHEN p_kind='wholesale' THEN 'wholesale' ELSE 'normal' END,
      CASE WHEN p_kind='warehouse' THEN 'json:[]' END,true,category_names,'{}')
    RETURNING id,token INTO section_id,result_token;
    IF p_home THEN INSERT INTO catalog_private.storefront_sections VALUES(owner_id,p_kind,section_id); END IF;
  END IF;
  RETURN result_token;
END;
$$;

CREATE FUNCTION public.manage_customer_catalog(actor_id uuid,actor_password text,p_token text,p_add text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  share public.catalog_shares%ROWTYPE;
  assigned text[];
  kind text;
BEGIN
  IF NOT EXISTS (SELECT FROM public.employees WHERE id=actor_id AND role='admin' AND status='active' AND password=actor_password AND btrim(actor_password)<>'') THEN
    RAISE EXCEPTION 'Se requiere una sesión de administrador activa';
  END IF;
  SELECT * INTO share FROM public.catalog_shares s WHERE s.owner_admin_id=actor_id AND s.token=p_token
    AND active AND (expires_at IS NULL OR expires_at>now())
    AND NOT EXISTS (SELECT FROM catalog_private.storefront_sections f WHERE f.share_id=s.id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Enlace de cliente no disponible'; END IF;
  kind := CASE WHEN share.source_table='armacen' THEN 'warehouse' ELSE share.price_mode END;
  IF share.catalog_categories IS NULL AND kind='warehouse' THEN
    assigned := public.extend_warehouse_catalog_link(actor_id,actor_password,p_token,p_add);
  ELSE
    assigned := coalesce(share.catalog_categories,'{}');
    IF cardinality(assigned)>0 AND cardinality(p_add)>0 THEN
      assigned := ARRAY(SELECT DISTINCT CASE WHEN kind='warehouse' THEN public.normalize_catalog_almacen_category(n) ELSE n END
        FROM unnest(assigned || p_add) n WHERE btrim(n)<>'' ORDER BY 1);
      UPDATE public.catalog_shares SET catalog_categories=assigned WHERE id=share.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('kind',kind,'categories',assigned);
END;
$$;
REVOKE ALL ON FUNCTION public.configure_catalog_publication(uuid,text,text,text[],boolean,boolean),
  public.manage_customer_catalog(uuid,text,text,text[]),public.catalog_storefront_sections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_catalog_publication(uuid,text,text,text[],boolean,boolean),
  public.manage_customer_catalog(uuid,text,text,text[]),public.catalog_storefront_sections(uuid) TO anon,authenticated;

CREATE FUNCTION public.save_catalog_storefront(actor_id uuid,actor_password text,p_sections jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  kind text;
  rule jsonb;
BEGIN
  FOREACH kind IN ARRAY ARRAY['normal','wholesale','warehouse'] LOOP
    rule := p_sections->kind;
    IF rule IS NULL OR jsonb_typeof(rule) NOT IN ('array','null') THEN RAISE EXCEPTION 'Configuración incompleta'; END IF;
    PERFORM public.configure_catalog_publication(actor_id,actor_password,kind,
      ARRAY(SELECT jsonb_array_elements_text(nullif(rule,'null'::jsonb))), true,rule <> 'null'::jsonb);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.save_catalog_storefront(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_catalog_storefront(uuid,text,jsonb) TO anon,authenticated;
