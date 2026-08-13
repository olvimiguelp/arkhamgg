-- Eliminacion completa y transaccional de un administrador y su tenant.
-- Ejecutar en Supabase antes de usar la opcion "Eliminar administrador".

CREATE OR REPLACE FUNCTION public.delete_admin_data(p_admin_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_role TEXT;
  v_table_name TEXT;
BEGIN
  SELECT role INTO target_role
  FROM public.employees
  WHERE id = p_admin_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'El administrador no existe: %', p_admin_id;
  END IF;

  IF target_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo se puede eliminar un usuario con rol admin';
  END IF;

  -- Eliminar primero las tablas con dependencias entre sí y luego el resto
  -- de las tablas pertenecientes al tenant.
  FOREACH v_table_name IN ARRAY ARRAY[
    'payment_allocations',
    'client_invoices',
    'detalle_costos_ventas',
    'almacen_payments',
    'almacen_credit_sales',
    'supplier_payments',
    'purchases',
    'payments',
    'returns',
    'sales',
    'repairs',
    'products',
    'customers',
    'suppliers',
    'cash_closings',
    'expenses',
    'armacen',
    'almacen_closings',
    'almacen_customer_accounts',
    'turn_sessions',
    'tenant_subscription_notifications',
    'admin_subscription_messages',
    'saas_businesses'
  ] LOOP
    IF to_regclass(format('public.%I', v_table_name)) IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND information_schema.columns.table_name = v_table_name
           AND column_name = 'owner_admin_id'
       ) THEN
      EXECUTE format('DELETE FROM public.%I WHERE owner_admin_id = $1', v_table_name)
      USING p_admin_id;
    END IF;
  END LOOP;

  -- Cierres de turno pueden no tener owner_admin_id.
  IF to_regclass('public.turn_closings') IS NOT NULL THEN
    DELETE FROM public.turn_closings
    WHERE employee_id = p_admin_id
       OR employee_id IN (SELECT id FROM public.employees WHERE owner_admin_id = p_admin_id);
  END IF;

  -- Estas referencias representan al empleado que operó la transacción y no
  -- deben impedir la eliminación histórica del tenant.
  IF to_regclass('public.cash_closings') IS NOT NULL THEN
    UPDATE public.cash_closings SET cashier_id = NULL WHERE cashier_id = p_admin_id;
    UPDATE public.cash_closings SET supervisor_id = NULL WHERE supervisor_id = p_admin_id;
  END IF;
  IF to_regclass('public.expenses') IS NOT NULL THEN
    UPDATE public.expenses SET user_id = NULL WHERE user_id = p_admin_id;
  END IF;
  IF to_regclass('public.sales') IS NOT NULL THEN
    UPDATE public.sales SET created_by_employee_id = NULL WHERE created_by_employee_id = p_admin_id;
  END IF;
  IF to_regclass('public.payments') IS NOT NULL THEN
    UPDATE public.payments SET created_by_employee_id = NULL WHERE created_by_employee_id = p_admin_id;
  END IF;

  -- Eliminar empleados del tenant antes del administrador por la FK
  -- employees.owner_admin_id -> employees.id.
  DELETE FROM public.employees WHERE owner_admin_id = p_admin_id AND id <> p_admin_id;
  DELETE FROM public.employees WHERE id = p_admin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_admin_data(UUID) TO anon, authenticated;
