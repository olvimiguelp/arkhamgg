ALTER TABLE public.catalog_customer_accounts ADD COLUMN custom_catalog boolean NOT NULL DEFAULT false;
ALTER TABLE public.catalog_shares ADD COLUMN assigned_customer_id uuid REFERENCES public.catalog_customer_accounts(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX catalog_account_section ON public.catalog_shares(assigned_customer_id,source_table,price_mode)
  WHERE assigned_customer_id IS NOT NULL;
CREATE POLICY account_shares_are_private ON public.catalog_shares AS RESTRICTIVE
  FOR ALL TO anon,authenticated USING (assigned_customer_id IS NULL) WITH CHECK (assigned_customer_id IS NULL);

-- Old public RPCs must not serve an account's private inventory or accept a guest order with its token.
DO $$
DECLARE sig regprocedure; definition text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_public_catalog_products(text,integer,integer,text,text)'::regprocedure,
    'public.get_public_catalog_categories(text)'::regprocedure,
    'public.get_public_catalog_snapshot(text,integer,integer,text,text,boolean)'::regprocedure,
    'public.submit_catalog_order(text,text,text,jsonb)'::regprocedure
  ] LOOP
    definition := pg_get_functiondef(sig);
    IF strpos(definition,'WHERE token = p_token')=0 THEN RAISE EXCEPTION 'Missing token check in %',sig; END IF;
    EXECUTE replace(definition,'WHERE token = p_token','WHERE token = p_token AND
      (assigned_customer_id IS NULL OR current_setting(''role'') NOT IN (''anon'',''authenticated''))');
  END LOOP;
END;
$$;

CREATE FUNCTION public.account_catalog_sections(p_customer uuid)
RETURNS TABLE(kind text,token text,categories text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT f.kind,f.token,f.categories FROM public.catalog_customer_accounts a
  CROSS JOIN LATERAL public.catalog_storefront_sections(a.owner_admin_id) f
  WHERE a.id=p_customer AND a.is_active AND NOT a.custom_catalog
  UNION ALL
  SELECT CASE WHEN s.source_table='armacen' THEN 'warehouse' ELSE s.price_mode END,s.token,s.catalog_categories
  FROM public.catalog_customer_accounts a JOIN public.catalog_shares s
    ON s.assigned_customer_id=a.id AND s.owner_admin_id=a.owner_admin_id
  WHERE a.id=p_customer AND a.is_active AND a.custom_catalog AND s.active AND (s.expires_at IS NULL OR s.expires_at>now())
$$;

CREATE FUNCTION public.account_can_open_catalog(p_customer uuid,p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (SELECT FROM public.catalog_customer_accounts a JOIN public.catalog_shares s ON s.owner_admin_id=a.owner_admin_id
    WHERE a.id=p_customer AND a.is_active AND s.token=p_token AND s.active AND (s.expires_at IS NULL OR s.expires_at>now())
      AND ((a.custom_catalog AND s.assigned_customer_id=a.id) OR (NOT a.custom_catalog AND s.assigned_customer_id IS NULL)))
$$;

CREATE FUNCTION public.account_catalog_settings(actor_id uuid,actor_password text,p_customer uuid,p_sections jsonb DEFAULT NULL)
RETURNS TABLE(kind text,categories text[]) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k text; rule jsonb; names text[]; section_token text;
BEGIN
  IF NOT EXISTS (SELECT FROM public.employees e WHERE e.id=actor_id AND e.role='admin' AND e.status='active'
    AND e.password=actor_password AND btrim(actor_password)<>'') THEN RAISE EXCEPTION 'Acceso de administrador requerido'; END IF;
  PERFORM 1 FROM public.catalog_customer_accounts a WHERE a.id=p_customer AND a.owner_admin_id=actor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta no disponible'; END IF;
  IF p_sections IS NOT NULL THEN
    FOR k IN SELECT unnest(ARRAY['normal','wholesale','warehouse']) LOOP
      rule := p_sections->k;
      IF rule IS NULL OR jsonb_typeof(rule) NOT IN ('array','null') THEN RAISE EXCEPTION 'Selección incompleta'; END IF;
      names := ARRAY(SELECT DISTINCT CASE WHEN k='warehouse' THEN public.normalize_catalog_almacen_category(n) ELSE n END
        FROM jsonb_array_elements_text(nullif(rule,'null'::jsonb)) AS n WHERE btrim(n)<>'' ORDER BY 1);
      IF jsonb_array_length(nullif(rule,'null'::jsonb))>0 AND cardinality(names)=0 THEN RAISE EXCEPTION 'Categoría inválida'; END IF;
      UPDATE public.catalog_shares s SET active=rule<>'null'::jsonb,catalog_categories=names
        WHERE s.assigned_customer_id=p_customer AND s.owner_admin_id=actor_id
        AND (CASE WHEN s.source_table='armacen' THEN 'warehouse' ELSE s.price_mode END)=k;
      IF NOT FOUND AND rule<>'null'::jsonb THEN
        section_token := public.configure_catalog_publication(actor_id,actor_password,k,names,false);
        UPDATE public.catalog_shares SET assigned_customer_id=p_customer WHERE token=section_token;
      END IF;
    END LOOP;
    UPDATE public.catalog_customer_accounts SET custom_catalog=true WHERE id=p_customer;
  END IF;
  RETURN QUERY SELECT s.kind,s.categories FROM public.account_catalog_sections(p_customer) s;
END;
$$;
REVOKE ALL ON FUNCTION public.account_catalog_settings(uuid,text,uuid,jsonb),public.account_catalog_sections(uuid),
  public.account_can_open_catalog(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_catalog_settings(uuid,text,uuid,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_catalog_sections(uuid),public.account_can_open_catalog(uuid,text) TO service_role;

-- Serialize account permission changes with order submission.
DO $$
DECLARE definition text := pg_get_functiondef('public.submit_catalog_order_for_customer(text,uuid,jsonb)'::regprocedure);
BEGIN
  IF strpos(definition,'BEGIN')=0 THEN RAISE EXCEPTION 'No se encontró submit_catalog_order_for_customer'; END IF;
  EXECUTE regexp_replace(definition,'BEGIN', 'BEGIN
    PERFORM 1 FROM public.catalog_customer_accounts WHERE id=p_customer_id FOR SHARE;
    IF NOT public.account_can_open_catalog(p_customer_id,p_token) THEN RAISE EXCEPTION ''Catálogo no autorizado''; END IF;');
END;
$$;
