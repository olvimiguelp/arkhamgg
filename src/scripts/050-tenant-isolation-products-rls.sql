-- =========================================================
-- Tenant isolation RLS para todas las tablas de negocio
-- con owner_admin_id
-- Reemplaza políticas globales por políticas estrictas por tenant
-- =========================================================

-- Función helper para obtener el tenant autenticado actual.
-- Prioridad:
-- 1) app_metadata.tenant_id en el JWT
-- 2) user_metadata.tenant_id en el JWT
-- 3) sub del JWT / auth.uid() si el usuario está autenticado por Supabase Auth
-- 4) fallback compatible con el flujo actual del proyecto, donde la sesión se maneja en la app y no siempre llega como JWT de Supabase Auth
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid,
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'tenant_id', '')::uuid,
    NULLIF(auth.jwt() ->> 'sub', '')::uuid,
    auth.uid()
  );
$$;

DO $$
DECLARE
    target_table_name text;
    policy_to_drop text;
BEGIN
    FOR target_table_name IN SELECT unnest(ARRAY[
        'products',
        'sales',
        'returns',
        'payments',
        'repairs',
        'customers',
        'suppliers',
        'purchases',
        'supplier_payments',
        'cash_closings',
        'expenses',
        'armacen',
        'almacen_closings',
        'almacen_customer_accounts',
        'almacen_credit_sales',
        'almacen_payments',
        'saas_businesses',
        'admin_subscription_messages',
        'tenant_subscription_notifications',
        'client_invoices',
        'payment_allocations',
        'turn_sessions'
    ]) LOOP
        IF to_regclass(format('public.%s', target_table_name)) IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = target_table_name
              AND column_name = 'owner_admin_id'
        ) THEN
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', target_table_name);

            -- Eliminar políticas globales previas de cada tabla
            CASE target_table_name
                WHEN 'products' THEN policy_to_drop := 'Allow all operations on products';
                WHEN 'sales' THEN policy_to_drop := 'Allow all operations on sales';
                WHEN 'returns' THEN policy_to_drop := 'Allow all operations on returns';
                WHEN 'payments' THEN policy_to_drop := 'Allow all operations on payments';
                WHEN 'repairs' THEN policy_to_drop := 'Allow all operations on repairs';
                WHEN 'customers' THEN policy_to_drop := 'Allow all operations on customers';
                WHEN 'suppliers' THEN policy_to_drop := 'Allow all operations on suppliers';
                WHEN 'purchases' THEN policy_to_drop := 'Allow all operations on purchases';
                WHEN 'supplier_payments' THEN policy_to_drop := 'Allow all operations on supplier_payments';
                WHEN 'cash_closings' THEN policy_to_drop := 'Allow all operations on cash_closings';
                WHEN 'expenses' THEN policy_to_drop := 'Allow all operations on expenses';
                WHEN 'armacen' THEN policy_to_drop := 'Allow all operations on armacen';
                WHEN 'almacen_closings' THEN policy_to_drop := 'Allow all operations on almacen_closings';
                WHEN 'almacen_customer_accounts' THEN policy_to_drop := 'Allow all operations on almacen_customer_accounts';
                WHEN 'almacen_credit_sales' THEN policy_to_drop := 'Allow all operations on almacen_credit_sales';
                WHEN 'almacen_payments' THEN policy_to_drop := 'Allow all operations on almacen_payments';
                WHEN 'saas_businesses' THEN policy_to_drop := 'Allow all operations on saas_businesses';
                WHEN 'admin_subscription_messages' THEN policy_to_drop := 'Allow all on admin_subscription_messages';
                WHEN 'tenant_subscription_notifications' THEN policy_to_drop := 'Allow all on tenant_subscription_notifications';
                WHEN 'client_invoices' THEN policy_to_drop := 'Allow all on client_invoices';
                WHEN 'payment_allocations' THEN policy_to_drop := 'Allow all operations on payment_allocations';
                WHEN 'turn_sessions' THEN policy_to_drop := 'Allow all operations on turn_sessions';
                ELSE policy_to_drop := NULL;
            END CASE;

            IF policy_to_drop IS NOT NULL THEN
                EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_to_drop, target_table_name);
            END IF;

            -- Eliminar políticas previas generadas por esta migración si existen
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_table_name || '_select_own_tenant', target_table_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_table_name || '_insert_own_tenant', target_table_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_table_name || '_update_own_tenant', target_table_name);
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_table_name || '_delete_own_tenant', target_table_name);

            -- Políticas estrictas por operación
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR SELECT USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)',
                target_table_name || '_select_own_tenant',
                target_table_name
            );

            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)',
                target_table_name || '_insert_own_tenant',
                target_table_name
            );

            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR UPDATE USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL) WITH CHECK (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)',
                target_table_name || '_update_own_tenant',
                target_table_name
            );

            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR DELETE USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)',
                target_table_name || '_delete_own_tenant',
                target_table_name
            );
    END LOOP;
END $$;

-- =========================================================
-- Nota importante
-- Si alguna tabla no existe todavía en tu entorno, la migración
-- simplemente la omite. Si luego la creas, puedes volver a ejecutar
-- esta misma migración y se aplicarán las políticas automáticamente.
-- =========================================================
