-- Habilita Supabase Realtime en todas las tablas de la aplicacion (idempotente).
-- Ejecutar en SQL Editor si faltan tablas en la publicacion supabase_realtime.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enable_supabase_realtime(p_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table IS NULL OR to_regclass(p_table::text) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE %s REPLICA IDENTITY FULL', p_table);

  BEGIN
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', p_table);
  EXCEPTION
    WHEN duplicate_object THEN
      NULL;
  END;
END;
$$;

DO $$
DECLARE
  t TEXT;
  tables_to_enable TEXT[] := ARRAY[
    'employees',
    'sales',
    'returns',
    'payments',
    'products',
    'repairs',
    'customers',
    'suppliers',
    'system_config',
    'purchases',
    'supplier_payments',
    'cash_closings',
    'expenses',
    'detalle_costos_ventas',
    'armacen',
    'almacen_closings',
    'almacen_customer_accounts',
    'almacen_credit_sales',
    'almacen_payments',
    'saas_businesses',
    'subscription_plans',
    'admin_subscription_messages',
    'tenant_subscription_notifications',
    'client_invoices',
    'system_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_enable LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      PERFORM public.enable_supabase_realtime(to_regclass('public.' || t));
    END IF;
  END LOOP;
END $$;
