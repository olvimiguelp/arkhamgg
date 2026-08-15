-- Multi-tenant SaaS (3 niveles): super_admin, admin y employee
-- Este script:
-- 1) agrega owner_admin_id a tablas de negocio
-- 2) habilita rol super_admin en employees
-- 3) reestructura índices únicos para aislar por owner_admin_id

-- Asegurar columna y roles de empleados
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES public.employees(id) ON DELETE RESTRICT;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('super_admin', 'admin', 'employee'));

CREATE OR REPLACE FUNCTION public.set_employee_owner_admin_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.role IN ('super_admin', 'admin') THEN
    NEW.owner_admin_id := NEW.id;
  END IF;

  IF NEW.role = 'employee' AND NEW.owner_admin_id IS NULL THEN
    RAISE EXCEPTION 'owner_admin_id es obligatorio para empleados';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_employee_owner_admin_id ON public.employees;
CREATE TRIGGER trg_set_employee_owner_admin_id
  BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_employee_owner_admin_id();

-- Si no existe super_admin/admin, crear uno base
DO $$
DECLARE
  has_admin BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.employees
    WHERE role IN ('super_admin', 'admin')
  ) INTO has_admin;

  IF NOT has_admin THEN
    INSERT INTO public.employees (
      id,
      name,
      email,
      password,
      phone,
      role,
      owner_admin_id,
      cedula,
      address,
      salary,
      status,
      permissions
    )
    VALUES (
      gen_random_uuid(),
      'Super Administrador',
      'admin@techmobile.com',
      'admin123',
      '809-555-0001',
      'super_admin',
      gen_random_uuid(),
      '00100000001',
      'Santo Domingo, RD',
      50000.00,
      'active',
      '{
        "sales": true,
        "inventory": true,
        "customers": true,
        "suppliers": true,
        "reports": true,
        "repairs": true,
        "returns": true,
        "purchases": true,
        "employees": true,
        "cashClosing": true,
        "invoiceHistory": true,
        "products": true,
        "almacen": true,
        "clienteAlmacen": true,
        "almacenClosing": true,
        "canAdd": true,
        "canEdit": true,
        "canDelete": true
      }'::jsonb
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;
END $$;

-- Backfill owner_admin_id en employees
UPDATE public.employees
SET owner_admin_id = id
WHERE role IN ('super_admin', 'admin')
  AND (owner_admin_id IS NULL OR owner_admin_id <> id);

WITH fallback_admin AS (
  SELECT id
  FROM public.employees
  WHERE role IN ('super_admin', 'admin')
  ORDER BY created_at NULLS FIRST, id
  LIMIT 1
)
UPDATE public.employees e
SET owner_admin_id = fa.id
FROM fallback_admin fa
WHERE e.role = 'employee'
  AND e.owner_admin_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_owner_admin_required'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_owner_admin_required CHECK (
        (role IN ('super_admin', 'admin') AND owner_admin_id = id)
        OR (role = 'employee' AND owner_admin_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employees_owner_admin_id ON public.employees(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_owner_admin_id ON public.employees(role, owner_admin_id);

-- Agregar owner_admin_id y backfill en tablas de negocio existentes
DO $$
DECLARE
  fallback_admin_id UUID;
  tbl TEXT;
BEGIN
  SELECT id
  INTO fallback_admin_id
  FROM public.employees
  WHERE role IN ('super_admin', 'admin')
  ORDER BY created_at NULLS FIRST, id
  LIMIT 1;

  IF fallback_admin_id IS NULL THEN
    RAISE EXCEPTION 'No existe super_admin/admin para completar owner_admin_id';
  END IF;

  FOR tbl IN
    SELECT unnest(ARRAY[
      'customers',
      'suppliers',
      'products',
      'armacen',
      'sales',
      'returns',
      'payments',
      'repairs',
      'cash_closings',
      'almacen_closings',
      'expenses',
      'detalle_costos_ventas',
      'almacen_customer_accounts',
      'almacen_credit_sales',
      'almacen_payments',
      'purchases',
      'supplier_payments'
    ])
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES public.employees(id) ON DELETE RESTRICT',
        tbl
      );
      EXECUTE format(
        'UPDATE public.%I SET owner_admin_id = %L WHERE owner_admin_id IS NULL',
        tbl,
        fallback_admin_id
      );
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN owner_admin_id SET NOT NULL',
        tbl
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%I_owner_admin_id ON public.%I(owner_admin_id)',
        tbl,
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- Reglas de unicidad por tenant
DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
    IF to_regclass('public.idx_products_owner_sku') IS NULL THEN
      CREATE UNIQUE INDEX idx_products_owner_sku ON public.products(owner_admin_id, sku);
    END IF;
  END IF;

  IF to_regclass('public.armacen') IS NOT NULL THEN
    ALTER TABLE public.armacen DROP CONSTRAINT IF EXISTS armacen_sku_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_armacen_owner_sku ON public.armacen(owner_admin_id, sku);
  END IF;

  IF to_regclass('public.sales') IS NOT NULL THEN
    ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_invoice_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_owner_invoice_number ON public.sales(owner_admin_id, invoice_number);
  END IF;

  IF to_regclass('public.returns') IS NOT NULL THEN
    ALTER TABLE public.returns DROP CONSTRAINT IF EXISTS returns_return_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_owner_return_number ON public.returns(owner_admin_id, return_number);
  END IF;

  IF to_regclass('public.payments') IS NOT NULL THEN
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_owner_invoice_number ON public.payments(owner_admin_id, invoice_number);
  END IF;

  IF to_regclass('public.repairs') IS NOT NULL THEN
    ALTER TABLE public.repairs DROP CONSTRAINT IF EXISTS repairs_repair_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_repairs_owner_repair_number ON public.repairs(owner_admin_id, repair_number);
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_cedula_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_owner_cedula
      ON public.customers(owner_admin_id, cedula)
      WHERE cedula IS NOT NULL;
  END IF;

  IF to_regclass('public.suppliers') IS NOT NULL THEN
    ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_rnc_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_owner_rnc
      ON public.suppliers(owner_admin_id, rnc)
      WHERE rnc IS NOT NULL;
  END IF;

  IF to_regclass('public.cash_closings') IS NOT NULL THEN
    ALTER TABLE public.cash_closings DROP CONSTRAINT IF EXISTS cash_closings_closing_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_closings_owner_closing_number
      ON public.cash_closings(owner_admin_id, closing_number);
  END IF;

  IF to_regclass('public.almacen_closings') IS NOT NULL THEN
    ALTER TABLE public.almacen_closings DROP CONSTRAINT IF EXISTS almacen_closings_closing_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_closings_owner_closing_number
      ON public.almacen_closings(owner_admin_id, closing_number);
    DROP INDEX IF EXISTS idx_almacen_closings_unique_active_date;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_closings_unique_active_date
      ON public.almacen_closings(owner_admin_id, date)
      WHERE status <> 'rejected';
  END IF;

  IF to_regclass('public.almacen_customer_accounts') IS NOT NULL THEN
    DROP INDEX IF EXISTS idx_almacen_customer_accounts_source_customer_id;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_customer_accounts_source_customer_id
      ON public.almacen_customer_accounts(owner_admin_id, source_customer_id)
      WHERE source_customer_id IS NOT NULL;
  END IF;

  IF to_regclass('public.almacen_payments') IS NOT NULL THEN
    DROP INDEX IF EXISTS idx_almacen_payments_invoice_number;
    ALTER TABLE public.almacen_payments DROP CONSTRAINT IF EXISTS almacen_payments_invoice_number_key;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_payments_owner_invoice_number
      ON public.almacen_payments(owner_admin_id, invoice_number);
  END IF;
END $$;
