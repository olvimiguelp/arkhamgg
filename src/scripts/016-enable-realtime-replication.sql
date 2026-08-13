-- Crear publicación si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Activar Realtime en tus tablas reales
DO $$
DECLARE
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
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables_to_enable LOOP
    
    -- Verificar si la tabla existe en el esquema public
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = t
    ) THEN

      -- FULL replica identity (envía toda la fila en updates)
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      
      -- Agregar a publicación
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END;
      
    END IF;

  END LOOP;
END $$;
