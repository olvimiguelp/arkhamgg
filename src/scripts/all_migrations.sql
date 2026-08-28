-- =============================================================================
-- ALL MIGRATIONS - ARCHIVO UNIFICADO (ARKHAM / Supabase)
-- =============================================================================
-- Un solo script con TODAS las migraciones de src/scripts/*.sql (excepto este archivo).
--
-- COMO EJECUTAR (una sola vez por proyecto o tras clonar):
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Copiar y pegar TODO este archivo (Ctrl+A en el editor local)
--   3. Run / Ejecutar (puede tardar 1-2 minutos)
--
-- ANTES DE EJECUTAR: Database -> Extensions -> activar "pgcrypto" (una vez, en el panel).
-- IDEMPOTENTE: IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING, etc.
-- Si algo falla a mitad, corrige el error y vuelve a ejecutar (las partes ya aplicadas no rompen).
--
-- REGENERAR tras editar cualquier .sql individual:
--   npm run build:migrations
--   o: powershell -File src/scripts/build-all-migrations.ps1
--
-- Generado: 2026-08-19 15:32:48 -04:00
-- Lista de archivos fuente al final del archivo (buscar "FIN DE MIGRACIONES")
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers compartidos
-- -----------------------------------------------------------------------------
-- NOTA: No usar CREATE EXTENSION aqui (falla en SQL Editor: read-only transaction).
-- En Supabase: Database -> Extensions -> activar "pgcrypto" si gen_random_uuid() falla.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ====================================================
-- Source: 001-create-employees-table.sql
-- ====================================================

-- Crear tabla de empleados
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'employee')),
  owner_admin_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
  cedula TEXT UNIQUE NOT NULL,
  address TEXT,
  hire_date DATE DEFAULT CURRENT_DATE,
  salary DECIMAL(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  permissions JSONB NOT NULL DEFAULT '{
    "sales": true,
    "inventory": true,
    "customers": true,
    "suppliers": true,
    "reports": false,
    "repairs": true,
    "returns": false,
    "purchases": true,
    "employees": false,
    "invoiceHistory": false,
    "products": true
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Normaliza owner_admin_id por rol.
-- super_admin/admin: owner_admin_id = su propio id
-- employee: owner_admin_id = id del admin propietario
CREATE OR REPLACE FUNCTION set_employee_owner_admin_id()
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

DROP TRIGGER IF EXISTS trg_set_employee_owner_admin_id ON employees;
CREATE TRIGGER trg_set_employee_owner_admin_id
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION set_employee_owner_admin_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_owner_admin_required'
      AND conrelid = 'employees'::regclass
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_owner_admin_required CHECK (
        (role IN ('super_admin', 'admin') AND owner_admin_id = id)
        OR (role = 'employee' AND owner_admin_id IS NOT NULL)
      );
  END IF;
END $$;

-- Habilitar Row Level Security
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura a todos los usuarios autenticados
CREATE POLICY "Allow authenticated users to read employees" ON employees
  FOR SELECT USING (true);

-- Política para permitir inserción solo a administradores
CREATE POLICY "Allow admins to insert employees" ON employees
  FOR INSERT WITH CHECK (true);

-- Política para permitir actualización solo a administradores
CREATE POLICY "Allow admins to update employees" ON employees
  FOR UPDATE USING (true);

-- Política para permitir eliminación solo a administradores
CREATE POLICY "Allow admins to delete employees" ON employees
  FOR DELETE USING (true);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_cedula ON employees(cedula);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_owner_admin_id ON employees(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_owner_admin_id ON employees(role, owner_admin_id);

-- Insertar super administrador por defecto
INSERT INTO employees (name, email, password, phone, role, owner_admin_id, cedula, address, salary, status, permissions)
VALUES (
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
    "invoiceHistory": true,
    "products": true
  }'::jsonb
) ON CONFLICT (email) DO NOTHING;

-- ====================================================
-- Source: 002-create-sales-table.sql
-- ====================================================

-- Tabla de ventas/facturas
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  invoice_number VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  change DECIMAL(12, 2) DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_id UUID,
  manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'completada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_owner_invoice_number ON sales(owner_admin_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_owner_admin_id ON sales(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- Habilitar RLS
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones (ajustar según necesidad)
CREATE POLICY "Allow all operations on sales" ON sales
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ====================================================
-- Source: 003-create-returns-table.sql
-- ====================================================

-- Tabla de devoluciones
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  return_number VARCHAR(50) NOT NULL,
  invoice_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  customer_id UUID,
  customer_name VARCHAR(255),
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL DEFAULT '[]',
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  type VARCHAR(50) NOT NULL DEFAULT 'reembolso',
  reason TEXT,
  status VARCHAR(50) DEFAULT 'completa',
  new_invoice_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_owner_return_number ON returns(owner_admin_id, return_number);
CREATE INDEX IF NOT EXISTS idx_returns_owner_admin_id ON returns(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice_id ON returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(date);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON returns(customer_id);

-- Habilitar RLS
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
CREATE POLICY "Allow all operations on returns" ON returns
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ====================================================
-- Source: 004-create-payments-table.sql
-- ====================================================

-- Tabla de pagos de clientes
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  invoice_number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  previous_debt DECIMAL(12, 2) DEFAULT 0,
  remaining_debt DECIMAL(12, 2) DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_owner_invoice_number ON payments(owner_admin_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_payments_owner_admin_id ON payments(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);

-- Habilitar RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
CREATE POLICY "Allow all operations on payments" ON payments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ====================================================
-- Source: 005-create-invoices-bucket.sql
-- ====================================================

-- Crear bucket para almacenar facturas
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facturas',
  'facturas',
  true,
  10485760, -- 10MB máximo por archivo
  ARRAY['application/pdf', 'application/json', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir lectura pública
CREATE POLICY "Facturas son públicas para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'facturas');

-- Política para permitir subir archivos
CREATE POLICY "Permitir subir facturas"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'facturas');

-- Política para permitir actualizar archivos
CREATE POLICY "Permitir actualizar facturas"
ON storage.objects FOR UPDATE
USING (bucket_id = 'facturas');

-- Política para permitir eliminar archivos
CREATE POLICY "Permitir eliminar facturas"
ON storage.objects FOR DELETE
USING (bucket_id = 'facturas');

-- ====================================================
-- Source: 006-create-products-table.sql
-- ====================================================

-- Tabla de productos/inventario
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  buy_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  minimum_sell_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  supplier VARCHAR(255),
  capacity VARCHAR(50),
  imei VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
-- IF NOT EXISTS no evita conflictos cuando existe otra relación con el mismo
-- nombre (por ejemplo, un índice creado manualmente en una instalación previa).
DO $$
BEGIN
  IF to_regclass('public.idx_products_owner_sku') IS NULL THEN
    CREATE UNIQUE INDEX idx_products_owner_sku ON public.products(owner_admin_id, sku);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_products_owner_admin_id ON products(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_products_updated_at ON products;
CREATE TRIGGER trigger_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- Habilitar RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
DROP POLICY IF EXISTS "Allow all operations on products" ON products;
CREATE POLICY "Allow all operations on products" ON products
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ====================================================
-- Source: 007-create-repairs-table.sql
-- ====================================================

-- Tabla de reparaciones
CREATE TABLE IF NOT EXISTS repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  repair_number VARCHAR(20) NOT NULL,
  client VARCHAR(255) NOT NULL,
  device VARCHAR(255) NOT NULL,
  issue TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  type VARCHAR(100) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  password VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE UNIQUE INDEX IF NOT EXISTS idx_repairs_owner_repair_number ON repairs(owner_admin_id, repair_number);
CREATE INDEX IF NOT EXISTS idx_repairs_owner_admin_id ON repairs(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_repairs_client ON repairs(client);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_date ON repairs(date);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_repairs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_repairs_updated_at ON repairs;
CREATE TRIGGER trigger_repairs_updated_at
  BEFORE UPDATE ON repairs
  FOR EACH ROW
  EXECUTE FUNCTION update_repairs_updated_at();

-- Habilitar RLS
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
DROP POLICY IF EXISTS "Allow all operations on repairs" ON repairs;
CREATE POLICY "Allow all operations on repairs" ON repairs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ====================================================
-- Source: 008-create-customers-table.sql
-- ====================================================

-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid not null default gen_random_uuid (),
  owner_admin_id uuid not null references public.employees(id),
  name text not null,
  cedula text null,
  phone text null,
  email text null,
  address text null,
  status text null default 'En proceso'::text,
  credit_device text null,
  notes text null,
  debt numeric null default 0,
  total_purchases numeric null default 0,
  credit_balance numeric null default 0,
  credit_limit numeric null default 0,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  reminder_enabled boolean null default false,
  reminder_interval_days integer null default 15,
  reminder_last_sent_at timestamp with time zone null,
  reminder_message text null,
  constraint customers_pkey primary key (id),
  constraint customers_reminder_interval_check check ((reminder_interval_days = any (array[5, 15, 30]))),
  constraint customers_status_check check (
    (
      status = any (array['En proceso'::text, 'Finalizado'::text])
    )
  )
) TABLESPACE pg_default;

-- Create indexes
create unique index IF not exists idx_customers_owner_cedula on public.customers using btree (owner_admin_id, cedula) TABLESPACE pg_default
where cedula is not null;
create index IF not exists idx_customers_owner_admin_id on public.customers using btree (owner_admin_id) TABLESPACE pg_default;
create index IF not exists idx_customers_name on public.customers using btree (name) TABLESPACE pg_default;
create index IF not exists idx_customers_status on public.customers using btree (status) TABLESPACE pg_default;
create index IF not exists idx_customers_reminder_enabled on public.customers using btree (reminder_enabled) TABLESPACE pg_default;
create index IF not exists idx_customers_reminder_last_sent_at on public.customers using btree (reminder_last_sent_at) TABLESPACE pg_default;

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on customers" ON customers
  FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger
create trigger trg_customers_updated_at BEFORE
update on customers for EACH row
execute FUNCTION set_updated_at ();

-- ====================================================
-- Source: 009-create-suppliers-table.sql
-- ====================================================

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  name TEXT NOT NULL,
  rnc TEXT,
  razon_social TEXT,
  tipo_empresa TEXT,
  website TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  debt DECIMAL(12,2) DEFAULT 0,
  total_purchases DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_owner_rnc ON suppliers(owner_admin_id, rnc) WHERE rnc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_owner_admin_id ON suppliers(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on suppliers" ON suppliers
  FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_suppliers_updated_at();

-- ====================================================
-- Source: 009-create-system-config-and-purchases.sql
-- ====================================================

-- Create system configuration table for key/value settings
CREATE TABLE IF NOT EXISTS public.system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_config_key ON public.system_config(key);
CREATE INDEX IF NOT EXISTS idx_system_config_key_search ON public.system_config(key);

DROP TRIGGER IF EXISTS trg_system_config_updated_at ON public.system_config;
CREATE TRIGGER trg_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on system_config" ON public.system_config;
CREATE POLICY "Allow all operations on system_config" ON public.system_config
  FOR ALL USING (true) WITH CHECK (true);

-- Create purchases table for supplier orders and inventory restocks
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  invoice_number VARCHAR(255) NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_name VARCHAR(255),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_type VARCHAR(50) NOT NULL DEFAULT 'contado',
  payment_method VARCHAR(50),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_date TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'pendiente',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_owner_admin_id ON public.purchases(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(date);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON public.purchases(invoice_number);

DROP TRIGGER IF EXISTS trg_purchases_updated_at ON public.purchases;
CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on purchases" ON public.purchases;
CREATE POLICY "Allow all operations on purchases" ON public.purchases
  FOR ALL USING (true) WITH CHECK (true);

-- Create supplier payments table for purchase supplier repayments
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  purchase_id UUID REFERENCES public.purchases(id),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW(),
  payment_method VARCHAR(50),
  previous_debt NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_debt NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_owner_admin_id ON public.supplier_payments(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier_id ON public.supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase_id ON public.supplier_payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_date ON public.supplier_payments(date);

DROP TRIGGER IF EXISTS trg_supplier_payments_updated_at ON public.supplier_payments;
CREATE TRIGGER trg_supplier_payments_updated_at
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on supplier_payments" ON public.supplier_payments;
CREATE POLICY "Allow all operations on supplier_payments" ON public.supplier_payments
  FOR ALL USING (true) WITH CHECK (true);

-- ====================================================
-- Source: 010-create-cash-closings-table.sql
-- ====================================================

-- Create cash_closings table for storing daily cash closures
CREATE TABLE IF NOT EXISTS cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  closing_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cashier_id UUID REFERENCES employees(id),
  cashier_name VARCHAR(255) NOT NULL,
  
  -- Opening balance
  opening_balance NUMERIC(12,2) DEFAULT 0,
  
  -- Sales breakdown
  total_sales NUMERIC(12,2) DEFAULT 0,
  sales_cash NUMERIC(12,2) DEFAULT 0,
  sales_card NUMERIC(12,2) DEFAULT 0,
  sales_transfer NUMERIC(12,2) DEFAULT 0,
  sales_credit NUMERIC(12,2) DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  
  -- Returns
  total_returns NUMERIC(12,2) DEFAULT 0,
  returns_count INTEGER DEFAULT 0,
  
  -- Payments received
  total_payments NUMERIC(12,2) DEFAULT 0,
  payments_count INTEGER DEFAULT 0,
  
  -- Repairs
  total_repairs NUMERIC(12,2) DEFAULT 0,
  repairs_count INTEGER DEFAULT 0,
  
  -- Expenses
  total_expenses NUMERIC(12,2) DEFAULT 0,
  expenses_count INTEGER DEFAULT 0,
  
  -- Cash count by denomination
  denomination_counts JSONB DEFAULT '{}',
  
  -- Totals
  expected_amount NUMERIC(12,2) DEFAULT 0,
  counted_amount NUMERIC(12,2) DEFAULT 0,
  discrepancy NUMERIC(12,2) DEFAULT 0,
  
  -- Status and notes
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  notes TEXT,
  supervisor_id UUID REFERENCES employees(id),
  supervisor_name VARCHAR(255),
  
  -- PDF storage
  pdf_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expenses table for daily expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'operativo', 'suministros', 'servicios', 'otros'
  payment_method VARCHAR(50) DEFAULT 'cash',
  user_id UUID REFERENCES employees(id),
  user_name VARCHAR(255),
  receipt_url TEXT,
  notes TEXT,
  cash_closing_id UUID REFERENCES cash_closings(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Allow all operations on cash_closings" ON cash_closings;
CREATE POLICY "Allow all operations on cash_closings" ON cash_closings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;
CREATE POLICY "Allow all operations on expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_closings_owner_closing_number ON cash_closings(owner_admin_id, closing_number);
CREATE INDEX IF NOT EXISTS idx_cash_closings_owner_admin_id ON cash_closings(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_cash_closings_date ON cash_closings(date);
CREATE INDEX IF NOT EXISTS idx_cash_closings_status ON cash_closings(status);
CREATE INDEX IF NOT EXISTS idx_expenses_owner_admin_id ON expenses(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ====================================================
-- Source: 010-create-repair-tickets-bucket.sql
-- ====================================================

-- Create storage bucket for repair tickets
INSERT INTO storage.buckets (id, name, public)
VALUES ('repair-tickets', 'repair-tickets', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for repair tickets
CREATE POLICY "Allow public read access to repair tickets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'repair-tickets');

CREATE POLICY "Allow authenticated users to upload repair tickets"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'repair-tickets');

CREATE POLICY "Allow authenticated users to update repair tickets"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'repair-tickets');

CREATE POLICY "Allow authenticated users to delete repair tickets"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'repair-tickets');

-- ====================================================
-- Source: 011-add-ticket-url-to-repairs.sql
-- ====================================================

-- Add ticket_pdf_url column to repairs table to store the PDF URL
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS ticket_pdf_url TEXT;

-- ====================================================
-- Source: 012-add-return-to-inventory-column.sql
-- ====================================================

-- Add return_to_inventory column to returns table
ALTER TABLE returns ADD COLUMN IF NOT EXISTS return_to_inventory BOOLEAN DEFAULT TRUE;

-- ====================================================
-- Source: 012-modify-products-table.sql
-- ====================================================

-- Script para modificar la tabla de productos
-- Renombrar SKU a Codigo y agregar campo RAM

-- Agregar columna RAM si no existe
ALTER TABLE products ADD COLUMN IF NOT EXISTS ram VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Crear índice para RAM
CREATE INDEX IF NOT EXISTS idx_products_ram ON products(ram);

-- Nota: La columna SKU se mantiene en la base de datos por compatibilidad,
-- pero en la interfaz se mostrará como "Codigo"

-- ====================================================
-- Source: 013-fix-employees-rls-policies.sql
-- ====================================================

-- Fix RLS policies and adapt employees table for multi-tenant SaaS
-- Roles: super_admin, admin, employee

-- 1) Make cedula optional and keep backward compatibility
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_cedula_key;
ALTER TABLE employees ALTER COLUMN cedula DROP NOT NULL;

-- 2) Add/normalize owner_admin_id and 3-level roles
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('super_admin', 'admin', 'employee'));

CREATE OR REPLACE FUNCTION set_employee_owner_admin_id()
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

DROP TRIGGER IF EXISTS trg_set_employee_owner_admin_id ON employees;
CREATE TRIGGER trg_set_employee_owner_admin_id
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION set_employee_owner_admin_id();

-- Backfill:
-- admin/super_admin own themselves
UPDATE employees
SET owner_admin_id = id
WHERE role IN ('admin', 'super_admin')
  AND (owner_admin_id IS NULL OR owner_admin_id <> id);

-- employees without owner are attached to the oldest admin/super_admin
WITH fallback_admin AS (
  SELECT id
  FROM employees
  WHERE role IN ('admin', 'super_admin')
  ORDER BY created_at NULLS FIRST, id
  LIMIT 1
)
UPDATE employees e
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
      AND conrelid = 'employees'::regclass
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_owner_admin_required CHECK (
        (role IN ('super_admin', 'admin') AND owner_admin_id = id)
        OR (role = 'employee' AND owner_admin_id IS NOT NULL)
      );
  END IF;
END $$;

-- 3) Drop and recreate generic policies (legacy project behavior)
DROP POLICY IF EXISTS "Allow authenticated users to read employees" ON employees;
DROP POLICY IF EXISTS "Allow admins to insert employees" ON employees;
DROP POLICY IF EXISTS "Allow admins to update employees" ON employees;
DROP POLICY IF EXISTS "Allow admins to delete employees" ON employees;
DROP POLICY IF EXISTS "Allow authenticated to read employees" ON employees;
DROP POLICY IF EXISTS "Allow public to read employees for login" ON employees;
DROP POLICY IF EXISTS "Allow insert employees" ON employees;
DROP POLICY IF EXISTS "Allow update employees" ON employees;
DROP POLICY IF EXISTS "Allow delete employees" ON employees;

CREATE POLICY "Allow authenticated to read employees" ON employees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow public to read employees for login" ON employees
  FOR SELECT USING (true);

CREATE POLICY "Allow insert employees" ON employees
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update employees" ON employees
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete employees" ON employees
  FOR DELETE USING (true);

-- 4) Indexes for login and tenant segmentation
CREATE INDEX IF NOT EXISTS idx_employees_email_active ON employees(email) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_employees_cedula ON employees(cedula) WHERE cedula IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_owner_admin_id ON employees(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_owner_admin_id ON employees(role, owner_admin_id);

-- ====================================================
-- Source: 014-create-manual-item-costs-table.sql
-- ====================================================

CREATE TABLE IF NOT EXISTS detalle_costos_ventas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  venta_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL,
  descripcion TEXT,
  costo_unitario DECIMAL(10, 2) DEFAULT 0,
  precio_unitario DECIMAL(10, 2) DEFAULT 0,
  ganancia_unitaria DECIMAL(10, 2) DEFAULT 0,
  importe_total DECIMAL(10, 2) DEFAULT 0,
  ganancia_total DECIMAL(10, 2) DEFAULT 0,
  fecha TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  usuario_id UUID
);

-- Add index for performance on reporting
CREATE INDEX IF NOT EXISTS idx_detalle_costos_ventas_fecha ON detalle_costos_ventas(fecha);
CREATE INDEX IF NOT EXISTS idx_detalle_costos_ventas_venta_id ON detalle_costos_ventas(venta_id);
CREATE INDEX IF NOT EXISTS idx_detalle_costos_ventas_owner_admin_id ON detalle_costos_ventas(owner_admin_id);

-- Enable RLS
ALTER TABLE detalle_costos_ventas ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to insert
CREATE POLICY "Enable insert for authenticated users" ON detalle_costos_ventas
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create policy to allow all authenticated users to select
CREATE POLICY "Enable select for authenticated users" ON detalle_costos_ventas
    FOR SELECT USING (auth.role() = 'authenticated');

-- Create policy to allow all authenticated users to update
CREATE POLICY "Enable update for authenticated users" ON detalle_costos_ventas
    FOR UPDATE USING (auth.role() = 'authenticated');

-- Create policy to allow all authenticated users to delete
CREATE POLICY "Enable delete for authenticated users" ON detalle_costos_ventas
    FOR DELETE USING (auth.role() = 'authenticated');

-- ====================================================
-- Source: 015-fix-detalle-costos-rls.sql
-- ====================================================

-- Fix RLS policy for detalle_costos_ventas to allow insertion
-- Drop restrictive policy if it exists
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON detalle_costos_ventas;

-- Create permissive policy similar to sales table
CREATE POLICY "Allow all operations for everyone on detalle_costos_ventas"
ON detalle_costos_ventas
FOR ALL
USING (true)
WITH CHECK (true);

-- Ensure RLS is enabled (or kept enabled)
ALTER TABLE detalle_costos_ventas ENABLE ROW LEVEL SECURITY;

-- ====================================================
-- Source: 016-enable-realtime-replication.sql
-- ====================================================

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

-- ====================================================
-- Source: 017-create-reports-bucket.sql
-- ====================================================

-- Crear bucket para almacenar reportes (PDF y Excel)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reportes',
  'reportes',
  true,
  20971520, -- 20MB máximo por archivo
  ARRAY[
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir lectura pública
CREATE POLICY "Reportes son públicos para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'reportes');

-- Política para permitir subir reportes
CREATE POLICY "Permitir subir reportes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'reportes');

-- Política para permitir actualizar reportes
CREATE POLICY "Permitir actualizar reportes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'reportes');

-- Política para permitir eliminar reportes
CREATE POLICY "Permitir eliminar reportes"
ON storage.objects FOR DELETE
USING (bucket_id = 'reportes');

-- ====================================================
-- Source: 018-add-customer-reminders.sql
-- ====================================================

-- Add reminder settings to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_interval_days INTEGER DEFAULT 15;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_last_sent_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_reminder_interval_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_reminder_interval_check
      CHECK (reminder_interval_days IN (5, 15, 30));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_reminder_enabled ON public.customers(reminder_enabled);
CREATE INDEX IF NOT EXISTS idx_customers_reminder_last_sent_at ON public.customers(reminder_last_sent_at);

-- ====================================================
-- Source: 020-create-armacen-table.sql
-- ====================================================

-- pgcrypto: activar en Supabase -> Database -> Extensions (no CREATE EXTENSION en SQL Editor)

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.armacen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  sku VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  box_number VARCHAR(50) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 1,
  buy_price NUMERIC NOT NULL DEFAULT 0,
  sell_price NUMERIC NOT NULL DEFAULT 0,
  minimum_sell_price NUMERIC NOT NULL DEFAULT 0,
  supplier VARCHAR(255),
  capacity VARCHAR(50),
  imei VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_armacen_owner_sku ON public.armacen(owner_admin_id, sku);
CREATE INDEX IF NOT EXISTS idx_armacen_owner_admin_id ON public.armacen(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_armacen_name ON public.armacen(name);
CREATE INDEX IF NOT EXISTS idx_armacen_category ON public.armacen(category);
CREATE INDEX IF NOT EXISTS idx_armacen_box_number ON public.armacen(box_number);
CREATE INDEX IF NOT EXISTS idx_armacen_stock ON public.armacen(stock);

DROP TRIGGER IF EXISTS trg_armacen_updated_at ON public.armacen;
CREATE TRIGGER trg_armacen_updated_at
  BEFORE UPDATE ON public.armacen
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.armacen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on armacen" ON public.armacen;
CREATE POLICY "Allow all operations on armacen" ON public.armacen
  FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER TABLE public.armacen REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.armacen;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- ====================================================
-- Source: 021-rename-flesh-to-flex.sql
-- ====================================================

-- Normaliza categorias antiguas del almacen para usar "flex"
UPDATE public.armacen
SET category = 'flex'
WHERE LOWER(TRIM(category)) IN ('flesh', 'flash');

-- ====================================================
-- Source: 022-add-imei-to-inventory-tables.sql
-- ====================================================

-- Ensure IMEI column exists for both inventory tables in legacy databases
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS imei VARCHAR(50);

ALTER TABLE public.armacen
ADD COLUMN IF NOT EXISTS imei VARCHAR(50);


-- ====================================================
-- Source: 023-create-almacen-closings-table.sql
-- ====================================================

-- Create almacen_closings table for daily warehouse inventory closings
CREATE TABLE IF NOT EXISTS public.almacen_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  closing_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ DEFAULT NOW(),
  cashier_id UUID REFERENCES public.employees(id),
  cashier_name VARCHAR(255) NOT NULL,
  total_products INTEGER DEFAULT 0,
  total_units_expected INTEGER DEFAULT 0,
  total_units_counted INTEGER DEFAULT 0,
  discrepancy_units INTEGER DEFAULT 0,
  total_cost_expected NUMERIC(12, 2) DEFAULT 0,
  total_cost_counted NUMERIC(12, 2) DEFAULT 0,
  discrepancy_cost NUMERIC(12, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  notes TEXT,
  snapshot JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_almacen_closings_date ON public.almacen_closings(date);
CREATE INDEX IF NOT EXISTS idx_almacen_closings_status ON public.almacen_closings(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_closings_owner_closing_number
ON public.almacen_closings(owner_admin_id, closing_number);
CREATE INDEX IF NOT EXISTS idx_almacen_closings_owner_admin_id ON public.almacen_closings(owner_admin_id);

-- Block multiple active closings on the same day (rejected can be repeated)
CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_closings_unique_active_date
ON public.almacen_closings(owner_admin_id, date)
WHERE status <> 'rejected';

DROP TRIGGER IF EXISTS trg_almacen_closings_updated_at ON public.almacen_closings;
CREATE TRIGGER trg_almacen_closings_updated_at
  BEFORE UPDATE ON public.almacen_closings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.almacen_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on almacen_closings" ON public.almacen_closings;
CREATE POLICY "Allow all operations on almacen_closings" ON public.almacen_closings
  FOR ALL USING (true) WITH CHECK (true);

-- ====================================================
-- Source: 024-create-cliente-almacen-module.sql
-- ====================================================

-- Modulo cliente-almacen (independiente del modulo general /clientes)
-- Tablas:
-- 1) almacen_customer_accounts: estado de cuenta separado por cliente
-- 2) almacen_credit_sales: ventas a credito asociadas a inventario de almacen
-- 3) almacen_payments: abonos/pagos aplicados a deuda de almacen

CREATE TABLE IF NOT EXISTS public.almacen_customer_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  source_customer_id UUID,
  name VARCHAR(255) NOT NULL,
  cedula VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  debt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_purchases NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'En proceso',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_customer_accounts_source_customer_id
ON public.almacen_customer_accounts(owner_admin_id, source_customer_id)
WHERE source_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_almacen_customer_accounts_name ON public.almacen_customer_accounts(name);
CREATE INDEX IF NOT EXISTS idx_almacen_customer_accounts_debt ON public.almacen_customer_accounts(debt);
CREATE INDEX IF NOT EXISTS idx_almacen_customer_accounts_status ON public.almacen_customer_accounts(status);
CREATE INDEX IF NOT EXISTS idx_almacen_customer_accounts_owner_admin_id ON public.almacen_customer_accounts(owner_admin_id);

DROP TRIGGER IF EXISTS trg_almacen_customer_accounts_updated_at ON public.almacen_customer_accounts;
CREATE TRIGGER trg_almacen_customer_accounts_updated_at
  BEFORE UPDATE ON public.almacen_customer_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.almacen_customer_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on almacen_customer_accounts" ON public.almacen_customer_accounts;
CREATE POLICY "Allow all operations on almacen_customer_accounts" ON public.almacen_customer_accounts
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.almacen_credit_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  invoice_number VARCHAR(50) NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  customer_account_id UUID NOT NULL REFERENCES public.almacen_customer_accounts(id) ON DELETE CASCADE,
  customer_name VARCHAR(255),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) NOT NULL DEFAULT 'credito',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_credit_sales_sale_id
ON public.almacen_credit_sales(sale_id)
WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_almacen_credit_sales_customer_account_id
ON public.almacen_credit_sales(customer_account_id);
CREATE INDEX IF NOT EXISTS idx_almacen_credit_sales_date ON public.almacen_credit_sales(date);
CREATE INDEX IF NOT EXISTS idx_almacen_credit_sales_invoice_number ON public.almacen_credit_sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_almacen_credit_sales_owner_admin_id ON public.almacen_credit_sales(owner_admin_id);

DROP TRIGGER IF EXISTS trg_almacen_credit_sales_updated_at ON public.almacen_credit_sales;
CREATE TRIGGER trg_almacen_credit_sales_updated_at
  BEFORE UPDATE ON public.almacen_credit_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.almacen_credit_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on almacen_credit_sales" ON public.almacen_credit_sales;
CREATE POLICY "Allow all operations on almacen_credit_sales" ON public.almacen_credit_sales
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.almacen_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  invoice_number VARCHAR(50) NOT NULL,
  customer_account_id UUID NOT NULL REFERENCES public.almacen_customer_accounts(id) ON DELETE CASCADE,
  credit_sale_id UUID REFERENCES public.almacen_credit_sales(id) ON DELETE SET NULL,
  applied_allocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_customer_id UUID,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  previous_debt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_debt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  date TIMESTAMPTZ DEFAULT NOW(),
  note TEXT,
  created_by UUID,
  created_by_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_almacen_payments_owner_invoice_number ON public.almacen_payments(owner_admin_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_almacen_payments_customer_account_id ON public.almacen_payments(customer_account_id);
CREATE INDEX IF NOT EXISTS idx_almacen_payments_date ON public.almacen_payments(date);
CREATE INDEX IF NOT EXISTS idx_almacen_payments_payment_method ON public.almacen_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_almacen_payments_owner_admin_id ON public.almacen_payments(owner_admin_id);

DROP TRIGGER IF EXISTS trg_almacen_payments_updated_at ON public.almacen_payments;
CREATE TRIGGER trg_almacen_payments_updated_at
  BEFORE UPDATE ON public.almacen_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.almacen_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on almacen_payments" ON public.almacen_payments;
CREATE POLICY "Allow all operations on almacen_payments" ON public.almacen_payments
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.almacen_payments
  ADD COLUMN IF NOT EXISTS applied_allocations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ====================================================
-- Source: 025-create-almacen-closing-totals-function.sql
-- ====================================================

-- Calcula los totales del cierre de almacen para una fecha.
-- Reglas implementadas:
-- 1) Solo cuenta ventas de items que pertenezcan al inventario de almacen.
-- 2) Total facturado = ventas brutas de almacen (antes de devoluciones).
-- 3) En efectivo = solo flujo fisico en efectivo
--    (ventas cash + abonos cash de deuda de almacen - devoluciones cash).
-- 4) Las devoluciones se descuentan por el metodo original de la venta.
--
-- Uso:
--   select * from public.get_almacen_closing_totals('2026-04-15'::date);

CREATE OR REPLACE FUNCTION public.get_almacen_closing_totals(p_date DATE)
RETURNS TABLE (
  closure_date DATE,
  total_facturado NUMERIC(14, 2),
  en_efectivo NUMERIC(14, 2),
  en_tarjeta NUMERIC(14, 2),
  en_transferencia NUMERIC(14, 2),
  a_credito NUMERIC(14, 2),
  devoluciones NUMERIC(14, 2),
  facturas INTEGER,
  devoluciones_count INTEGER
)
LANGUAGE sql
STABLE
AS $$
WITH day_sales AS (
  SELECT s.*
  FROM public.sales s
  WHERE s.date::date = p_date
),
sale_items AS (
  SELECT
    s.id AS sale_id,
    s.invoice_number,
    s.status,
    s.payment_method,
    GREATEST(COALESCE(s.total, 0)::numeric, 0) AS sale_total,
    LEAST(GREATEST(COALESCE(s.amount_paid, 0)::numeric, 0), GREATEST(COALESCE(s.total, 0)::numeric, 0)) AS amount_paid,
    item AS raw_item,
    COALESCE(
      NULLIF(item->>'subtotal', '')::numeric,
      COALESCE(NULLIF(item->>'customPrice', '')::numeric, NULLIF(item->>'sellPrice', '')::numeric, NULLIF(item->>'price', '')::numeric, 0)
        * COALESCE(NULLIF(item->>'quantity', '')::numeric, 0),
      0
    ) AS line_total,
    COALESCE(NULLIF(item->>'id', ''), NULLIF(item->>'productId', '')) AS product_id
  FROM day_sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) item
),
classified_sale_items AS (
  SELECT
    si.*,
    CASE
      WHEN NULLIF(si.raw_item->>'boxNumber', '') IS NOT NULL THEN TRUE
      WHEN lower(COALESCE(si.raw_item->>'category', '')) IN ('flex', 'pantallas', 'baterias', 'tapas') THEN TRUE
      WHEN EXISTS (SELECT 1 FROM public.armacen a WHERE a.id::text = si.product_id) THEN TRUE
      WHEN EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id::text = si.product_id
          AND lower(COALESCE(p.category, '')) IN ('flex', 'pantallas', 'baterias', 'tapas')
      ) THEN TRUE
      ELSE FALSE
    END AS is_almacen
  FROM sale_items si
),
sale_ratio AS (
  SELECT
    csi.sale_id,
    MAX(csi.invoice_number) AS invoice_number,
    MAX(csi.status) AS status,
    MAX(csi.payment_method) AS payment_method,
    MAX(csi.sale_total) AS sale_total,
    MAX(csi.amount_paid) AS amount_paid,
    SUM(csi.line_total) AS items_total,
    SUM(CASE WHEN csi.is_almacen THEN csi.line_total ELSE 0 END) AS almacen_items_total,
    BOOL_OR(csi.is_almacen) AS has_almacen,
    BOOL_OR(NOT csi.is_almacen) AS has_non_almacen
  FROM classified_sale_items csi
  GROUP BY csi.sale_id
),
sale_breakdown AS (
  SELECT
    sr.*,
    CASE
      WHEN sr.items_total > 0 THEN LEAST(1, GREATEST(0, sr.almacen_items_total / NULLIF(sr.items_total, 0)))
      WHEN sr.has_almacen AND NOT sr.has_non_almacen THEN 1
      ELSE 0
    END AS almacen_ratio,
    CASE
      WHEN lower(COALESCE(sr.payment_method, '')) IN ('cash', 'card', 'transfer', 'credit')
      THEN lower(sr.payment_method)
      ELSE 'cash'
    END AS normalized_method
  FROM sale_ratio sr
),
sales_by_method AS (
  SELECT
    sb.sale_id,
    sb.invoice_number,
    CASE
      WHEN sb.normalized_method = 'credit' THEN sb.sale_total * sb.almacen_ratio
      WHEN sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total AND sb.normalized_method <> 'credit'
      THEN (sb.sale_total - sb.amount_paid) * sb.almacen_ratio
      ELSE 0
    END AS credit_sales,
    CASE
      WHEN sb.normalized_method = 'cash' AND sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total
      THEN sb.amount_paid * sb.almacen_ratio
      WHEN sb.normalized_method = 'cash' THEN sb.sale_total * sb.almacen_ratio
      ELSE 0
    END AS cash_sales,
    CASE
      WHEN sb.normalized_method = 'card' AND sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total
      THEN sb.amount_paid * sb.almacen_ratio
      WHEN sb.normalized_method = 'card' THEN sb.sale_total * sb.almacen_ratio
      ELSE 0
    END AS card_sales,
    CASE
      WHEN sb.normalized_method = 'transfer' AND sb.amount_paid > 0 AND sb.amount_paid < sb.sale_total
      THEN sb.amount_paid * sb.almacen_ratio
      WHEN sb.normalized_method = 'transfer' THEN sb.sale_total * sb.almacen_ratio
      ELSE 0
    END AS transfer_sales
  FROM sale_breakdown sb
  WHERE sb.almacen_ratio > 0
    AND lower(COALESCE(sb.status, '')) NOT IN ('pending', 'anulada', 'cancelled')
),
day_returns AS (
  SELECT r.*
  FROM public.returns r
  WHERE r.date::date = p_date
),
return_items AS (
  SELECT
    r.id AS return_id,
    r.invoice_id AS sale_id,
    item AS raw_item,
    COALESCE(
      NULLIF(item->>'subtotal', '')::numeric,
      COALESCE(NULLIF(item->>'unitPrice', '')::numeric, 0) * COALESCE(NULLIF(item->>'quantity', '')::numeric, 0),
      0
    ) AS line_total,
    COALESCE(NULLIF(item->>'productId', ''), NULLIF(item->>'id', '')) AS product_id,
    lower(COALESCE(item->>'productName', item->>'name', '')) AS product_name
  FROM day_returns r
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.items, '[]'::jsonb)) item
),
matched_return_items AS (
  SELECT
    ri.*,
    matched.item AS matched_sale_item
  FROM return_items ri
  LEFT JOIN LATERAL (
    SELECT si.item
    FROM public.sales s
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.items, '[]'::jsonb)) si(item)
    WHERE s.id = ri.sale_id
      AND (
        COALESCE(NULLIF(si.item->>'id', ''), NULLIF(si.item->>'productId', '')) = COALESCE(ri.product_id, '')
        OR lower(COALESCE(si.item->>'name', '')) = ri.product_name
      )
    LIMIT 1
  ) matched ON TRUE
),
classified_return_items AS (
  SELECT
    mri.return_id,
    mri.sale_id,
    mri.line_total,
    CASE
      WHEN NULLIF(COALESCE(mri.matched_sale_item->>'boxNumber', mri.raw_item->>'boxNumber'), '') IS NOT NULL THEN TRUE
      WHEN lower(COALESCE(mri.matched_sale_item->>'category', mri.raw_item->>'category', '')) IN ('flex', 'pantallas', 'baterias', 'tapas') THEN TRUE
      WHEN EXISTS (SELECT 1 FROM public.armacen a WHERE a.id::text = mri.product_id) THEN TRUE
      WHEN EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id::text = mri.product_id
          AND lower(COALESCE(p.category, '')) IN ('flex', 'pantallas', 'baterias', 'tapas')
      ) THEN TRUE
      ELSE FALSE
    END AS is_almacen
  FROM matched_return_items mri
),
returns_almacen AS (
  SELECT
    cri.return_id,
    cri.sale_id,
    SUM(CASE WHEN cri.is_almacen THEN cri.line_total ELSE 0 END) AS almacen_return_total
  FROM classified_return_items cri
  GROUP BY cri.return_id, cri.sale_id
  HAVING SUM(CASE WHEN cri.is_almacen THEN cri.line_total ELSE 0 END) > 0
),
return_sales_source AS (
  SELECT DISTINCT ra.sale_id
  FROM returns_almacen ra
),
return_sales_breakdown AS (
  SELECT
    s.id AS sale_id,
    GREATEST(COALESCE(s.total, 0)::numeric, 0) AS sale_total,
    LEAST(GREATEST(COALESCE(s.amount_paid, 0)::numeric, 0), GREATEST(COALESCE(s.total, 0)::numeric, 0)) AS amount_paid,
    CASE
      WHEN lower(COALESCE(s.payment_method, '')) IN ('cash', 'card', 'transfer', 'credit')
      THEN lower(s.payment_method)
      ELSE 'cash'
    END AS normalized_method
  FROM public.sales s
  INNER JOIN return_sales_source rss ON rss.sale_id = s.id
),
return_method_base AS (
  SELECT
    rsb.sale_id,
    rsb.sale_total,
    rsb.normalized_method,
    CASE
      WHEN rsb.normalized_method = 'credit' THEN rsb.sale_total
      WHEN rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total AND rsb.normalized_method <> 'credit'
      THEN rsb.sale_total - rsb.amount_paid
      ELSE 0
    END AS credit_amount,
    CASE
      WHEN rsb.normalized_method = 'cash' AND rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total
      THEN rsb.amount_paid
      WHEN rsb.normalized_method = 'cash' THEN rsb.sale_total
      ELSE 0
    END AS cash_amount,
    CASE
      WHEN rsb.normalized_method = 'card' AND rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total
      THEN rsb.amount_paid
      WHEN rsb.normalized_method = 'card' THEN rsb.sale_total
      ELSE 0
    END AS card_amount,
    CASE
      WHEN rsb.normalized_method = 'transfer' AND rsb.amount_paid > 0 AND rsb.amount_paid < rsb.sale_total
      THEN rsb.amount_paid
      WHEN rsb.normalized_method = 'transfer' THEN rsb.sale_total
      ELSE 0
    END AS transfer_amount
  FROM return_sales_breakdown rsb
),
returns_by_method AS (
  SELECT
    ra.return_id,
    ra.almacen_return_total,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.cash_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'cash' THEN ra.almacen_return_total
      WHEN rmb.sale_id IS NULL THEN ra.almacen_return_total
      ELSE 0
    END AS cash_returns,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.card_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'card' THEN ra.almacen_return_total
      ELSE 0
    END AS card_returns,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.transfer_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'transfer' THEN ra.almacen_return_total
      ELSE 0
    END AS transfer_returns,
    CASE
      WHEN rmb.sale_total > 0 THEN ra.almacen_return_total * (rmb.credit_amount / rmb.sale_total)
      WHEN rmb.normalized_method = 'credit' THEN ra.almacen_return_total
      ELSE 0
    END AS credit_returns
  FROM returns_almacen ra
  LEFT JOIN return_method_base rmb ON rmb.sale_id = ra.sale_id
),
agg_sales AS (
  SELECT
    COALESCE(SUM(cash_sales), 0) AS cash_sales,
    COALESCE(SUM(card_sales), 0) AS card_sales,
    COALESCE(SUM(transfer_sales), 0) AS transfer_sales,
    COALESCE(SUM(credit_sales), 0) AS credit_sales,
    COUNT(*)::int AS invoices_count
  FROM sales_by_method
),
agg_returns AS (
  SELECT
    COALESCE(SUM(cash_returns), 0) AS cash_returns,
    COALESCE(SUM(card_returns), 0) AS card_returns,
    COALESCE(SUM(transfer_returns), 0) AS transfer_returns,
    COALESCE(SUM(credit_returns), 0) AS credit_returns,
    COALESCE(SUM(almacen_return_total), 0) AS returns_total,
    COUNT(*)::int AS returns_count
  FROM returns_by_method
),
agg_payments AS (
  SELECT
    COALESCE(
      SUM(
        CASE
          WHEN lower(COALESCE(ap.payment_method, 'cash')) = 'cash' THEN COALESCE(ap.amount, 0)
          ELSE 0
        END
      ),
      0
    ) AS cash_payments
  FROM public.almacen_payments ap
  WHERE ap.date::date = p_date
)
SELECT
  p_date AS closure_date,
  ROUND((asales.cash_sales + asales.card_sales + asales.transfer_sales + asales.credit_sales)::numeric, 2) AS total_facturado,
  ROUND((asales.cash_sales + apay.cash_payments - aret.cash_returns)::numeric, 2) AS en_efectivo,
  ROUND((asales.card_sales - aret.card_returns)::numeric, 2) AS en_tarjeta,
  ROUND((asales.transfer_sales - aret.transfer_returns)::numeric, 2) AS en_transferencia,
  ROUND((asales.credit_sales - aret.credit_returns)::numeric, 2) AS a_credito,
  ROUND(aret.returns_total::numeric, 2) AS devoluciones,
  asales.invoices_count AS facturas,
  aret.returns_count AS devoluciones_count
FROM agg_sales asales
CROSS JOIN agg_returns aret
CROSS JOIN agg_payments apay;
$$;

-- ====================================================
-- Source: 026-normalize-payment-and-origin-metadata.sql
-- ====================================================

-- Refuerzo de trazabilidad para pagos y ventas.
-- Esta migracion es compatible con la estructura actual y agrega columnas
-- opcionales que la aplicacion ya sabe aprovechar cuando existen.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_kind VARCHAR(30) NOT NULL DEFAULT 'debt_payment',
  ADD COLUMN IF NOT EXISTS customer_type VARCHAR(30) NOT NULL DEFAULT 'general';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_payment_kind_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_payment_kind_check
      CHECK (payment_kind IN ('sale', 'debt_payment'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_customer_type_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_customer_type_check
      CHECK (customer_type IN ('general', 'almacen'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_payment_kind ON public.payments(payment_kind);
CREATE INDEX IF NOT EXISTS idx_payments_customer_type ON public.payments(customer_type);

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS almacen_customer_account_id UUID,
  ADD COLUMN IF NOT EXISTS almacen_customer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS almacen_customer_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS almacen_source_customer_id UUID;

COMMENT ON COLUMN public.sales.payment_breakdown IS
  'Detalle explicito de metodos de pago cuando exista pago dividido.';

COMMENT ON COLUMN public.sales.almacen_customer_account_id IS
  'Cuenta de Cliente Almacen asociada cuando la venta incluye credito de almacen.';

COMMENT ON COLUMN public.sales.almacen_source_customer_id IS
  'Referencia opcional al cliente general vinculado con la cuenta de almacen.';

COMMENT ON COLUMN public.payments.payment_kind IS
  'Clasificacion del registro: venta o pago de deuda.';

COMMENT ON COLUMN public.payments.customer_type IS
  'Origen del cliente asociado al pago: general o almacen.';

-- ====================================================
-- Source: 027-enable-inventory-id-search.sql
-- ====================================================

-- Habilita busqueda exacta por ID (SKU) en inventario.
-- Normaliza IDs numericos para que "03040" y "3040" coincidan.

CREATE OR REPLACE FUNCTION public.normalize_inventory_search_id(raw_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw_value IS NULL THEN ''
    WHEN regexp_replace(trim(raw_value), '\s+', '', 'g') = '' THEN ''
    WHEN regexp_replace(trim(raw_value), '\s+', '', 'g') ~ '^[0-9]+$' THEN
      COALESCE(
        NULLIF(ltrim(regexp_replace(trim(raw_value), '\s+', '', 'g'), '0'), ''),
        '0'
      )
    ELSE lower(trim(raw_value))
  END
$$;

CREATE INDEX IF NOT EXISTS idx_products_sku_search_exact
  ON public.products ((public.normalize_inventory_search_id(sku)));

CREATE INDEX IF NOT EXISTS idx_armacen_sku_search_exact
  ON public.armacen ((public.normalize_inventory_search_id(sku)));

CREATE OR REPLACE FUNCTION public.search_inventory_by_id_exact(search_value TEXT)
RETURNS TABLE (
  source_table TEXT,
  row_id UUID,
  sku TEXT,
  name TEXT,
  category TEXT,
  box_number TEXT,
  stock INTEGER
)
LANGUAGE sql
STABLE
AS $$
  WITH needle AS (
    SELECT public.normalize_inventory_search_id(search_value) AS normalized
  )
  SELECT
    'products'::TEXT AS source_table,
    p.id AS row_id,
    p.sku,
    p.name,
    p.category,
    NULL::TEXT AS box_number,
    p.stock
  FROM public.products p
  CROSS JOIN needle n
  WHERE n.normalized <> ''
    AND (
      public.normalize_inventory_search_id(p.sku) = n.normalized
      OR lower(p.id::text) = n.normalized
    )

  UNION ALL

  SELECT
    'armacen'::TEXT AS source_table,
    a.id AS row_id,
    a.sku,
    a.name,
    a.category,
    a.box_number,
    a.stock
  FROM public.armacen a
  CROSS JOIN needle n
  WHERE n.normalized <> ''
    AND (
      public.normalize_inventory_search_id(a.sku) = n.normalized
      OR lower(a.id::text) = n.normalized
    );
$$;

COMMENT ON FUNCTION public.search_inventory_by_id_exact(TEXT) IS
  'Busca por ID exacto en products y armacen; normaliza IDs numericos (ej: 03040 = 3040).';

-- ====================================================
-- Source: 028-add-manual-paid-check-columns.sql
-- ====================================================

-- Persist manual paid check marks in DB (instead of localStorage)
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.almacen_credit_sales
  ADD COLUMN IF NOT EXISTS manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE;

-- ====================================================
-- Source: 029-enable-multi-tenant-saas.sql
-- ====================================================

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

-- ====================================================
-- Source: 030-create-saas-businesses-table.sql
-- ====================================================

-- Tabla principal para el dashboard de super administrador
-- Guarda la configuracion SaaS por empresa/tenant y su relacion 1:1 con admin.

CREATE TABLE IF NOT EXISTS public.saas_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  email TEXT NOT NULL DEFAULT '',
  emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  logo TEXT,
  invoice_subtitle TEXT,
  brand_colors JSONB NOT NULL DEFAULT '{"primary":"#3b82f6","secondary":"#1d4ed8"}'::jsonb,
  tax_id TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  subscription JSONB,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'suspendido', 'vencido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saas_businesses_owner_admin_id ON public.saas_businesses(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_saas_businesses_name ON public.saas_businesses(name);
CREATE INDEX IF NOT EXISTS idx_saas_businesses_status ON public.saas_businesses(status);
CREATE INDEX IF NOT EXISTS idx_saas_businesses_is_blocked ON public.saas_businesses(is_blocked);

DROP TRIGGER IF EXISTS trg_saas_businesses_updated_at ON public.saas_businesses;
CREATE TRIGGER trg_saas_businesses_updated_at
  BEFORE UPDATE ON public.saas_businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.saas_businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on saas_businesses" ON public.saas_businesses;
CREATE POLICY "Allow all operations on saas_businesses" ON public.saas_businesses
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Backfill para admins existentes sin empresa SaaS
INSERT INTO public.saas_businesses (
  owner_admin_id,
  name,
  description,
  location,
  address,
  phone,
  phones,
  email,
  emails,
  employee_count,
  is_blocked,
  status
)
SELECT
  e.id AS owner_admin_id,
  COALESCE(NULLIF(trim(e.name), ''), CONCAT('Empresa ', LEFT(e.id::text, 8))) AS name,
  '' AS description,
  '' AS location,
  COALESCE(e.address, '') AS address,
  COALESCE(e.phone, '') AS phone,
  CASE WHEN COALESCE(trim(e.phone), '') = '' THEN ARRAY[]::TEXT[] ELSE ARRAY[e.phone] END AS phones,
  COALESCE(e.email, '') AS email,
  CASE WHEN COALESCE(trim(e.email), '') = '' THEN ARRAY[]::TEXT[] ELSE ARRAY[e.email] END AS emails,
  0 AS employee_count,
  CASE WHEN e.status = 'inactive' THEN TRUE ELSE FALSE END AS is_blocked,
  CASE WHEN e.status = 'inactive' THEN 'suspendido' ELSE 'activo' END AS status
FROM public.employees e
WHERE e.role = 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.saas_businesses sb
    WHERE sb.owner_admin_id = e.id
  );

-- Recalcula conteo de empleados por tenant
WITH employee_totals AS (
  SELECT owner_admin_id, COUNT(*)::int AS total
  FROM public.employees
  WHERE role = 'employee'
  GROUP BY owner_admin_id
)
UPDATE public.saas_businesses sb
SET employee_count = COALESCE(et.total, 0)
FROM employee_totals et
WHERE sb.owner_admin_id = et.owner_admin_id;

-- Semilla de configuracion de bloqueo global de membresia
INSERT INTO public.system_config (key, value, description)
VALUES (
  'membership_block',
  '{
    "enabled": false,
    "allow_login": true,
    "title": "Acceso temporalmente restringido",
    "subtitle": "Control de membresia SaaS",
    "message": "Contacta al administrador para regularizar el acceso de tu empresa.",
    "support_email": "olvimiguelp@gmail.com",
    "support_whatsapp": "829-963-3150"
  }'::jsonb,
  'Control global de bloqueo por membresia'
)
ON CONFLICT (key) DO NOTHING;


-- ====================================================
-- Source: 031-create-subscription-plans-table.sql
-- ====================================================

-- Tabla de planes de suscripcion del dashboard de super administrador
-- Almacena las configuraciones de precio y beneficios para cada plan.

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  discount INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  benefits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_value ON public.subscription_plans(value);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_created_at ON public.subscription_plans(created_at);

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on subscription_plans" ON public.subscription_plans;
CREATE POLICY "Allow all operations on subscription_plans" ON public.subscription_plans
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Semilla de planes iniciales
INSERT INTO public.subscription_plans (value, label, months, discount, price, color, benefits)
VALUES
  ('mensual', 'Mensual', 1, 0, 29.99, 'from-slate-500 to-slate-600', ARRAY['Soporte basico', '1 usuario admin', 'Reportes mensuales']),
  ('trimestral', 'Trimestral', 3, 10, 80.97, 'from-blue-500 to-blue-600', ARRAY['Soporte prioritario', '3 usuarios admin', 'Reportes semanales', 'API acceso']),
  ('semestral', 'Semestral', 6, 15, 152.94, 'from-violet-500 to-violet-600', ARRAY['Soporte 24/7', '5 usuarios admin', 'Reportes diarios', 'API ilimitado', 'Marca blanca']),
  ('anual', 'Anual', 12, 25, 269.91, 'from-amber-500 to-amber-600', ARRAY['Soporte dedicado', 'Usuarios ilimitados', 'Reportes en tiempo real', 'API ilimitado', 'Marca blanca', 'Integraciones custom'])
ON CONFLICT (value) DO NOTHING;

-- ====================================================
-- Source: 032-subscription-renewal-and-messages.sql
-- ====================================================

-- Plazo de renovacion por empresa (dias despues del vencimiento de la suscripcion)
ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS renewal_grace_days INTEGER NOT NULL DEFAULT 5;

ALTER TABLE public.saas_businesses
  DROP CONSTRAINT IF EXISTS saas_businesses_renewal_grace_days_check;

ALTER TABLE public.saas_businesses
  ADD CONSTRAINT saas_businesses_renewal_grace_days_check
  CHECK (renewal_grace_days >= 0 AND renewal_grace_days <= 365);

-- Historial de mensajes enviados desde el dashboard de super admin
CREATE TABLE IF NOT EXISTS public.admin_subscription_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL DEFAULT 'general'
    CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo')),
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all'
    CHECK (scope IN ('all', 'specific')),
  recipient_admin_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_subscription_messages_created_at
  ON public.admin_subscription_messages(created_at DESC);

-- Notificaciones visibles para administradores/empleados del tenant
CREATE TABLE IF NOT EXISTS public.tenant_subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  admin_message_id UUID REFERENCES public.admin_subscription_messages(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'general'
    CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo', 'auto_renovacion')),
  title TEXT NOT NULL DEFAULT 'Aviso de suscripcion',
  content TEXT NOT NULL,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_notifications_owner
  ON public.tenant_subscription_notifications(owner_admin_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscription_notifications_active
  ON public.tenant_subscription_notifications(owner_admin_id, is_active, created_at DESC);

ALTER TABLE public.admin_subscription_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscription_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on admin_subscription_messages" ON public.admin_subscription_messages;
CREATE POLICY "Allow all on admin_subscription_messages" ON public.admin_subscription_messages
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications;
CREATE POLICY "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications
  FOR ALL USING (true) WITH CHECK (true);

-- ====================================================
-- Source: 033-create-client-invoices-table.sql
-- ====================================================

-- Facturas de clientes: solo metadatos JSON (sin PDF). El PDF se genera al imprimir o descargar.
CREATE TABLE IF NOT EXISTS public.client_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  source TEXT NOT NULL DEFAULT 'tienda'
    CHECK (source IN ('tienda', 'almacen', 'pago', 'manual')),
  invoice_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_invoices_owner_invoice_unique UNIQUE (owner_admin_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_client_invoices_owner_admin_id
  ON public.client_invoices(owner_admin_id);

CREATE INDEX IF NOT EXISTS idx_client_invoices_sale_id
  ON public.client_invoices(sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_invoices_invoice_date
  ON public.client_invoices(invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_client_invoices_created_at
  ON public.client_invoices(created_at DESC);

ALTER TABLE public.client_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on client_invoices" ON public.client_invoices;
CREATE POLICY "Allow all on client_invoices" ON public.client_invoices
  FOR ALL USING (true) WITH CHECK (true);

-- ====================================================
-- Source: 034-client-invoices-drop-pdf-columns.sql
-- ====================================================

-- Si ya ejecutaste una version anterior de 033 con PDF en BYTEA, elimina esas columnas.
ALTER TABLE public.client_invoices DROP COLUMN IF EXISTS pdf_content;
ALTER TABLE public.client_invoices DROP COLUMN IF EXISTS file_size;
ALTER TABLE public.client_invoices DROP COLUMN IF EXISTS mime_type;

-- Asegurar borrado en cascada al eliminar venta/pago
ALTER TABLE public.client_invoices DROP CONSTRAINT IF EXISTS client_invoices_sale_id_fkey;
ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

ALTER TABLE public.client_invoices DROP CONSTRAINT IF EXISTS client_invoices_payment_id_fkey;
ALTER TABLE public.client_invoices
  ADD CONSTRAINT client_invoices_payment_id_fkey
  FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE CASCADE;

-- ====================================================
-- Source: 035-separate-admin-and-subscription-suspension.sql
-- ====================================================

-- Separar suspension de administrador (employees.status) vs suspension de suscripcion (saas_businesses)

ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS subscription_suspended BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.saas_businesses.subscription_suspended IS
  'Bloqueo manual por suscripcion: el tenant puede iniciar sesion pero ve la pantalla de suscripcion vencida.';

COMMENT ON COLUMN public.saas_businesses.is_blocked IS
  'DEPRECATED: usar subscription_suspended. Se mantiene por compatibilidad.';

-- Migrar bloqueos de suscripcion solo si el admin sigue activo (no era suspension de cuenta)
UPDATE public.saas_businesses sb
SET subscription_suspended = COALESCE(sb.is_blocked, FALSE)
FROM public.employees e
WHERE e.id = sb.owner_admin_id
  AND e.role = 'admin'
  AND e.status = 'active';

-- Si el admin esta inactivo, el bloqueo era de cuenta: limpiar flags de suscripcion
UPDATE public.saas_businesses sb
SET subscription_suspended = FALSE,
    is_blocked = FALSE,
    status = CASE
      WHEN sb.subscription IS NOT NULL THEN 'vencido'
      ELSE 'activo'
    END
FROM public.employees e
WHERE e.id = sb.owner_admin_id
  AND e.role = 'admin'
  AND e.status = 'inactive';

CREATE INDEX IF NOT EXISTS idx_saas_businesses_subscription_suspended
  ON public.saas_businesses(subscription_suspended)
  WHERE subscription_suspended = TRUE;

-- ====================================================
-- Source: 036-create-branding-logos-bucket.sql
-- ====================================================

-- Logos de empresa para facturas (branding por tenant)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding-logos',
  'branding-logos',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Branding logos public read" ON storage.objects;
CREATE POLICY "Branding logos public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'branding-logos');

DROP POLICY IF EXISTS "Branding logos insert" ON storage.objects;
CREATE POLICY "Branding logos insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'branding-logos');

DROP POLICY IF EXISTS "Branding logos update" ON storage.objects;
CREATE POLICY "Branding logos update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'branding-logos');

DROP POLICY IF EXISTS "Branding logos delete" ON storage.objects;
CREATE POLICY "Branding logos delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'branding-logos');

-- ====================================================
-- Source: 037-add-open-access.sql
-- ====================================================

-- Acceso abierto: el tenant usa el panel sin bloqueo por suscripcion vencida o sin plan.

ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS open_access BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.saas_businesses.open_access IS
  'Si es TRUE, el tenant accede al panel sin restricciones de suscripcion (vencida, sin plan o suspendida manualmente).';

CREATE INDEX IF NOT EXISTS idx_saas_businesses_open_access
  ON public.saas_businesses(open_access)
  WHERE open_access = TRUE;

-- ====================================================
-- Source: 038-system-messages-and-app-updates.sql
-- ====================================================

-- Mensajes globales en login (actualizaciones de app) + campos de version/enlace en mensajes SaaS

CREATE TABLE IF NOT EXISTS public.system_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Notificacion',
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'info'
    CHECK (message_type IN ('info', 'warning', 'error', 'success')),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  target_version TEXT,
  download_url TEXT,
  admin_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_messages_active
  ON public.system_messages(is_active, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_messages_target_version
  ON public.system_messages(target_version)
  WHERE target_version IS NOT NULL;

ALTER TABLE public.system_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on system_messages" ON public.system_messages;
CREATE POLICY "Allow all on system_messages" ON public.system_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Ampliar tipos de mensaje del dashboard
ALTER TABLE public.admin_subscription_messages
  DROP CONSTRAINT IF EXISTS admin_subscription_messages_message_type_check;

ALTER TABLE public.admin_subscription_messages
  ADD CONSTRAINT admin_subscription_messages_message_type_check
  CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo', 'actualizacion'));

ALTER TABLE public.admin_subscription_messages
  ADD COLUMN IF NOT EXISTS target_version TEXT,
  ADD COLUMN IF NOT EXISTS download_url TEXT;

ALTER TABLE public.tenant_subscription_notifications
  DROP CONSTRAINT IF EXISTS tenant_subscription_notifications_message_type_check;

ALTER TABLE public.tenant_subscription_notifications
  ADD CONSTRAINT tenant_subscription_notifications_message_type_check
  CHECK (message_type IN ('general', 'vencimiento', 'renovacion', 'bloqueo', 'auto_renovacion', 'actualizacion'));

ALTER TABLE public.tenant_subscription_notifications
  ADD COLUMN IF NOT EXISTS target_version TEXT,
  ADD COLUMN IF NOT EXISTS download_url TEXT;

-- ====================================================
-- Source: 039-update-membership-block-contact.sql
-- ====================================================

-- Contacto de soporte en pagina de bloqueo
UPDATE public.system_config
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'support_email', 'olvimiguelp@gmail.com',
  'support_whatsapp', '829-963-3150'
)
WHERE key = 'membership_block';

-- ====================================================
-- Source: 040-enable-realtime-all-tables.sql
-- ====================================================

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

-- ====================================================
-- Source: 041-create-product-images-bucket.sql
-- ====================================================

-- Crear bucket para almacenar imágenes de productos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  4194304, -- 4MB máximo por archivo
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir lectura pública
CREATE POLICY "Product images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Política para permitir subir imágenes
CREATE POLICY "Product images insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

-- Política para permitir actualizar imágenes
CREATE POLICY "Product images update"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

-- Política para permitir eliminar imágenes
CREATE POLICY "Product images delete"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');

-- ====================================================
-- Source: 042-add-product-image-url-to-products.sql
-- ====================================================

-- Agregar columna image_url a las tablas de productos para almacenar la URL de la imagen
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.armacen ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE INDEX IF NOT EXISTS idx_products_image_url ON public.products((image_url));
CREATE INDEX IF NOT EXISTS idx_armacen_image_url ON public.armacen((image_url));

-- ====================================================
-- Source: 043-create-payment-allocations-table.sql
-- ====================================================

-- Distribución de abonos entre facturas pendientes
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50),
  applied_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  pending_before DECIMAL(12, 2) NOT NULL DEFAULT 0,
  pending_after DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_owner_admin_id ON public.payment_allocations(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_sale_id ON public.payment_allocations(sale_id);

ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on payment_allocations" ON public.payment_allocations;
CREATE POLICY "Allow all operations on payment_allocations" ON public.payment_allocations
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.payment_allocations IS
  'Detalle de cómo cada abono se aplicó a una o más facturas a crédito.';

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS credit_resolved BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.sales.credit_resolved IS
  'Marca facturas de crédito saldadas al 100% para ocultarlas de la deuda pendiente.';

-- ====================================================
-- Source: 044-add-whatsapp-bot-access.sql
-- ====================================================

-- Acceso al bot de WhatsApp (funcion Premium): habilitacion manual por empresa desde Suscripciones.

ALTER TABLE public.saas_businesses
  ADD COLUMN IF NOT EXISTS whatsapp_bot_access BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.saas_businesses.whatsapp_bot_access IS
  'Si es TRUE, la empresa puede usar el bot de WhatsApp aunque no tenga Plan Premium.';

CREATE INDEX IF NOT EXISTS idx_saas_businesses_whatsapp_bot_access
  ON public.saas_businesses(whatsapp_bot_access)
  WHERE whatsapp_bot_access = TRUE;

-- ====================================================
-- Source: 045-add-payment-method-to-payments.sql
-- ====================================================

-- Metodo de pago en abonos de clientes (efectivo, tarjeta, transferencia, credito).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NOT NULL DEFAULT 'cash';

COMMENT ON COLUMN public.payments.payment_method IS
  'Metodo de pago del abono: cash, card, transfer o credit.';

CREATE INDEX IF NOT EXISTS idx_payments_payment_method ON public.payments(payment_method);

-- ====================================================
-- Source: 046-add-minimum-sell-price-to-products.sql
-- ====================================================

-- Agrega precio minimo de venta a productos y almacen
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS minimum_sell_price NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.armacen
  ADD COLUMN IF NOT EXISTS minimum_sell_price NUMERIC NOT NULL DEFAULT 0;

-- ====================================================
-- Source: 047-add-is-wholesale-to-sales.sql
-- ====================================================

-- Agrega columna para identificar ventas al por mayor
ALTER TABLE IF EXISTS public.sales
  ADD COLUMN IF NOT EXISTS is_wholesale BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sales_is_wholesale ON public.sales(is_wholesale);

-- ====================================================
-- Source: 048-add-created-by-to-sales.sql
-- ====================================================

-- Add created_by_employee_id to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_created_by_employee_id ON public.sales(created_by_employee_id);

-- ====================================================
-- Source: 049-create-turn-sessions-table.sql
-- ====================================================

-- ============================================================
-- 049: Create turn_sessions table
-- Tracks employee shift open/close history per day
-- ============================================================

CREATE TABLE IF NOT EXISTS public.turn_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  cash_total NUMERIC(12,2) DEFAULT 0,
  card_total NUMERIC(12,2) DEFAULT 0,
  transfer_total NUMERIC(12,2) DEFAULT 0,
  credit_total NUMERIC(12,2) DEFAULT 0,
  total_sales NUMERIC(12,2) DEFAULT 0,
  sale_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.turn_sessions ENABLE ROW LEVEL SECURITY;

-- Open policy (tenant isolation handled in app layer)
DROP POLICY IF EXISTS "Allow all operations on turn_sessions" ON public.turn_sessions;
CREATE POLICY "Allow all operations on turn_sessions"
  ON public.turn_sessions FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_turn_sessions_owner_admin_id ON public.turn_sessions(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_employee_id ON public.turn_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_date ON public.turn_sessions(date);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_status ON public.turn_sessions(status);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_opened_at ON public.turn_sessions(opened_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.turn_sessions;

-- ====================================================
-- Source: 050-tenant-isolation-products-rls.sql
-- ====================================================

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

-- ====================================================
-- Source: 051-add-created-by-to-payments.sql
-- ====================================================

-- Asociar abonos de deuda con el empleado que los registró.
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_created_by_employee_id
ON public.payments(created_by_employee_id);

-- ====================================================
-- Source: 052-add-cash-balances-to-turn-sessions.sql
-- ====================================================

-- 052: Registrar efectivo inicial y efectivo final de cada turno.
ALTER TABLE public.turn_sessions
  ADD COLUMN IF NOT EXISTS opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_cash_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(12,2);

COMMENT ON COLUMN public.turn_sessions.opening_cash IS
  'Efectivo contado en caja al abrir el turno.';

COMMENT ON COLUMN public.turn_sessions.closing_cash IS
  'Efectivo contado en caja al cerrar el turno.';

COMMENT ON COLUMN public.turn_sessions.opening_cash_confirmed IS
  'Indica que el usuario confirmó el efectivo inicial del turno.';

-- ====================================================
-- Source: 052-add-payment-employee-name.sql
-- ====================================================

-- Conserva el nombre del empleado o administrador que registró el abono.
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);

-- ====================================================
-- Source: 053-restore-super-admin-dashboard.sql
-- ====================================================

-- Restaura las tablas requeridas por /dashboard si se ejecutó
-- 051-remove-super-admin-dashboard.sql.

-- El dashboard necesita que el rol super_admin siga siendo válido.
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('super_admin', 'admin', 'employee'));

CREATE TABLE IF NOT EXISTS public.saas_businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL UNIQUE REFERENCES public.employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  phones TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  email TEXT NOT NULL DEFAULT '',
  emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  logo TEXT,
  invoice_subtitle TEXT,
  brand_colors JSONB NOT NULL DEFAULT '{"primary":"#3b82f6","secondary":"#1d4ed8"}'::jsonb,
  tax_id TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  subscription JSONB,
  renewal_grace_days INTEGER NOT NULL DEFAULT 5,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  open_access BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_bot_access BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'suspendido', 'vencido')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  discount INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  color TEXT NOT NULL,
  benefits TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_subscription_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  recipient_admin_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  target_version TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscription_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  admin_message_id UUID REFERENCES public.admin_subscription_messages(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL DEFAULT 'Aviso de suscripcion',
  content TEXT NOT NULL,
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  target_version TEXT,
  download_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.saas_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_subscription_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscription_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on saas_businesses" ON public.saas_businesses;
CREATE POLICY "Allow all operations on saas_businesses" ON public.saas_businesses FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all operations on subscription_plans" ON public.subscription_plans;
CREATE POLICY "Allow all operations on subscription_plans" ON public.subscription_plans FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on admin_subscription_messages" ON public.admin_subscription_messages;
CREATE POLICY "Allow all on admin_subscription_messages" ON public.admin_subscription_messages FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications;
CREATE POLICY "Allow all on tenant_subscription_notifications" ON public.tenant_subscription_notifications FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.subscription_plans (value, label, months, discount, price, color, benefits)
VALUES
  ('mensual', 'Mensual', 1, 0, 29.99, 'from-slate-500 to-slate-600', ARRAY['Soporte basico']),
  ('trimestral', 'Trimestral', 3, 10, 80.97, 'from-blue-500 to-blue-600', ARRAY['Soporte prioritario']),
  ('semestral', 'Semestral', 6, 15, 152.94, 'from-violet-500 to-violet-600', ARRAY['Soporte 24/7']),
  ('anual', 'Anual', 12, 25, 269.91, 'from-amber-500 to-amber-600', ARRAY['Soporte dedicado'])
ON CONFLICT (value) DO NOTHING;


-- ====================================================
-- Source: 054-delete-admin-data.sql
-- ====================================================

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

-- ====================================================
-- Source: 055-repair-photos-cloud-retention.sql
-- ====================================================

-- Fotografías de reparaciones almacenadas en Supabase Storage.
-- Las filas y los objetos caducan 25 días después de subirlos.

CREATE TABLE IF NOT EXISTS public.repair_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '25 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_photos_repair_id ON public.repair_photos(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_photos_expiration ON public.repair_photos(expires_at);
CREATE INDEX IF NOT EXISTS idx_repair_photos_owner_admin_id ON public.repair_photos(owner_admin_id);

ALTER TABLE public.repair_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repair_photos_select_tenant" ON public.repair_photos;
CREATE POLICY "repair_photos_select_tenant" ON public.repair_photos
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "repair_photos_insert_tenant" ON public.repair_photos;
CREATE POLICY "repair_photos_insert_tenant" ON public.repair_photos
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "repair_photos_delete_tenant" ON public.repair_photos;
CREATE POLICY "repair_photos_delete_tenant" ON public.repair_photos
  FOR DELETE TO anon, authenticated USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('repair-photos', 'repair-photos', false, 4194304, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 4194304;

DROP POLICY IF EXISTS "repair_photos_storage_select" ON storage.objects;
CREATE POLICY "repair_photos_storage_select" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'repair-photos');

DROP POLICY IF EXISTS "repair_photos_storage_insert" ON storage.objects;
CREATE POLICY "repair_photos_storage_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'repair-photos');

DROP POLICY IF EXISTS "repair_photos_storage_delete" ON storage.objects;
CREATE POLICY "repair_photos_storage_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'repair-photos');

-- Limpieza segura: elimina primero el objeto y luego su registro.
CREATE OR REPLACE FUNCTION public.cleanup_expired_repair_photos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  photo RECORD;
  deleted_count INTEGER := 0;
BEGIN
  FOR photo IN SELECT id, storage_path FROM public.repair_photos WHERE expires_at <= NOW() LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'repair-photos' AND name = photo.storage_path;
    DELETE FROM public.repair_photos WHERE id = photo.id;
    deleted_count := deleted_count + 1;
  END LOOP;
  RETURN deleted_count;
END;
$$;

-- En Supabase suele estar disponible pg_cron. Si no lo está, la función puede
-- ejecutarse diariamente desde un cron externo o Edge Function.
DO $schedule$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-expired-repair-photos';
    PERFORM cron.schedule('cleanup-expired-repair-photos', '15 3 * * *', $cron$SELECT public.cleanup_expired_repair_photos();$cron$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron no disponible; ejecutar cleanup_expired_repair_photos diariamente desde un cron externo';
END $schedule$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_repair_photos() TO anon, authenticated;

-- ====================================================
-- Source: 056-repair-service-items.sql
-- ====================================================

-- Detalle normalizado de cada servicio de una reparación.
-- Permite que cada servicio tenga su propio costo de pieza y monto a cobrar.
CREATE TABLE IF NOT EXISTS public.repair_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  repair_id UUID NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  piece_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  charge NUMERIC(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_services_repair_id ON public.repair_services(repair_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_repair_services_owner_admin_id ON public.repair_services(owner_admin_id);

ALTER TABLE public.repair_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "repair_services_all" ON public.repair_services;
CREATE POLICY "repair_services_all" ON public.repair_services
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ====================================================
-- Source: 057-add-technician-notes-to-repairs.sql
-- ====================================================

-- Notas agregadas por el técnico durante el diagnóstico o reparación.
ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS technician_notes TEXT;

COMMENT ON COLUMN public.repairs.technician_notes IS
  'Notas del técnico: fallas encontradas, diagnóstico o imposibilidad de reparación.';

-- ====================================================
-- Source: 058-add-employee-crud-permission-defaults.sql
-- ====================================================

-- Asegurar que los empleados tengan permisos CRUD definidos y que el valor por defecto sea false.
ALTER TABLE employees
  ALTER COLUMN permissions SET DEFAULT '{
    "sales": true,
    "inventory": true,
    "customers": true,
    "suppliers": true,
    "reports": false,
    "repairs": true,
    "returns": false,
    "purchases": true,
    "employees": false,
    "invoiceHistory": false,
    "products": true,
    "canAdd": false,
    "canEdit": false,
    "canDelete": false
  }'::jsonb;

-- Agregar las claves faltantes a los registros existentes sin sobrescribir valores ya definidos.
UPDATE employees
SET permissions = jsonb_set(
    jsonb_set(
      jsonb_set(
        permissions,
        '{canAdd}',
        COALESCE(permissions->'canAdd', 'false'::jsonb),
        true
      ),
      '{canEdit}',
      COALESCE(permissions->'canEdit', 'false'::jsonb),
      true
    ),
    '{canDelete}',
    COALESCE(permissions->'canDelete', 'false'::jsonb),
    true
  )
WHERE NOT (permissions ? 'canAdd' AND permissions ? 'canEdit' AND permissions ? 'canDelete');

-- ====================================================
-- Source: 059-public-catalog.sql
-- ====================================================

-- Catálogos públicos ligados a un administrador y pedidos que entran a Cola Exclusiva.
CREATE TABLE IF NOT EXISTS public.catalog_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), token TEXT NOT NULL UNIQUE,
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  product_ids UUID[] NOT NULL DEFAULT '{}', business_name TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE, expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_catalog_shares_token ON public.catalog_shares(token);
ALTER TABLE public.catalog_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public catalog shares access" ON public.catalog_shares;
CREATE POLICY "public catalog shares access" ON public.catalog_shares FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.submit_catalog_order(
  p_token TEXT, p_customer_name TEXT, p_customer_phone TEXT, p_items JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE share_row catalog_shares%ROWTYPE; sale_id UUID := gen_random_uuid(); invoice TEXT := 'WEB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'); total NUMERIC := 0; item JSONB; normalized_items JSONB := '[]'::jsonb; current_price NUMERIC;
BEGIN
  SELECT * INTO share_row FROM catalog_shares WHERE token = p_token AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW());
  IF share_row.id IS NULL THEN RAISE EXCEPTION 'El enlace del catálogo no es válido'; END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'El carrito está vacío'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((item->>'quantity')::integer, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    IF NOT ((item->>'id')::uuid = ANY(share_row.product_ids)) THEN RAISE EXCEPTION 'Producto no autorizado en este catálogo'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer) THEN RAISE EXCEPTION 'Un producto ya no tiene inventario suficiente'; END IF;
    UPDATE products SET stock = stock - (item->>'quantity')::integer, updated_at = NOW()
      WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'El inventario cambió, vuelve a intentarlo'; END IF;
    SELECT sell_price INTO current_price FROM products WHERE id = (item->>'id')::uuid;
    item := jsonb_set(item, '{sellPrice}', to_jsonb(current_price));
    normalized_items := normalized_items || jsonb_build_array(item);
    total := total + (current_price * (item->>'quantity')::integer);
  END LOOP;
  INSERT INTO sales (id, owner_admin_id, invoice_number, items, subtotal, total, amount_paid, change, payment_method, customer_name, customer_phone, status)
  VALUES (sale_id, share_row.owner_admin_id, invoice, normalized_items, total, total, 0, 0, 'cash', p_customer_name, p_customer_phone, 'pending');
  RETURN sale_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_catalog_order(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ====================================================
-- Source: 060-public-catalog-wholesale.sql
-- ====================================================

-- Permite compartir catálogos normales y catálogos con precio por mayor.
ALTER TABLE public.catalog_shares
  ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'normal';

ALTER TABLE public.catalog_shares
  DROP CONSTRAINT IF EXISTS catalog_shares_price_mode_check;

ALTER TABLE public.catalog_shares
  ADD CONSTRAINT catalog_shares_price_mode_check
  CHECK (price_mode IN ('normal', 'wholesale'));

CREATE OR REPLACE FUNCTION public.submit_catalog_order(
  p_token TEXT, p_customer_name TEXT, p_customer_phone TEXT, p_items JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  share_row catalog_shares%ROWTYPE;
  sale_id UUID := gen_random_uuid();
  invoice TEXT := 'WEB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  total NUMERIC := 0;
  item JSONB;
  normalized_items JSONB := '[]'::jsonb;
  current_price NUMERIC;
BEGIN
  SELECT * INTO share_row FROM catalog_shares
  WHERE token = p_token AND active = TRUE AND (expires_at IS NULL OR expires_at > NOW());
  IF share_row.id IS NULL THEN RAISE EXCEPTION 'El enlace del catálogo no es válido'; END IF;
  IF NULLIF(trim(p_customer_name), '') IS NULL THEN RAISE EXCEPTION 'El nombre del cliente es obligatorio'; END IF;
  IF NULLIF(trim(p_customer_phone), '') IS NULL THEN RAISE EXCEPTION 'El teléfono del cliente es obligatorio'; END IF;
  IF jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'El carrito está vacío'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((item->>'quantity')::integer, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
    IF NOT ((item->>'id')::uuid = ANY(share_row.product_ids)) THEN RAISE EXCEPTION 'Producto no autorizado en este catálogo'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer) THEN RAISE EXCEPTION 'Un producto ya no tiene inventario suficiente'; END IF;
    SELECT CASE WHEN share_row.price_mode = 'wholesale' THEN wholesale_price ELSE sell_price END INTO current_price FROM products WHERE id = (item->>'id')::uuid;
    IF COALESCE(current_price, 0) <= 0 THEN RAISE EXCEPTION 'El producto no tiene precio configurado para este catálogo'; END IF;
    UPDATE products SET stock = stock - (item->>'quantity')::integer, updated_at = NOW()
      WHERE id = (item->>'id')::uuid AND owner_admin_id = share_row.owner_admin_id AND stock >= (item->>'quantity')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'El inventario cambió, vuelve a intentarlo'; END IF;
    item := jsonb_set(item, '{sellPrice}', to_jsonb(current_price));
    normalized_items := normalized_items || jsonb_build_array(item);
    total := total + (current_price * (item->>'quantity')::integer);
  END LOOP;

  INSERT INTO sales (id, owner_admin_id, invoice_number, items, subtotal, total, amount_paid, change, payment_method, customer_name, customer_phone, status, is_wholesale)
  VALUES (sale_id, share_row.owner_admin_id, invoice, normalized_items, total, total, 0, 0, 'cash', p_customer_name, p_customer_phone, 'pending', share_row.price_mode = 'wholesale');
  RETURN sale_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_catalog_order(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ====================================================
-- Source: 061-create-purchase-attachments.sql
-- ====================================================

-- 061-create-purchase-attachments.sql
-- Soporte para adjuntar el documento real de una factura de compra (PDF o
-- foto) y el comprobante de un abono, además de clasificar el tipo de
-- compra (piezas / productos / otros gastos).

-- 1. Bucket para los adjuntos de facturas de proveedores y comprobantes de
--    abono. Se usa un bucket separado del bucket "facturas" (que solo
--    permite PDF/JSON para facturas de venta) porque aquí también se suben
--    fotos tomadas con el celular.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facturas-proveedores',
  'facturas-proveedores',
  true,
  10485760, -- 10MB máximo por archivo
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Adjuntos de facturas de proveedores públicos para lectura"
ON storage.objects FOR SELECT
USING (bucket_id = 'facturas-proveedores');

CREATE POLICY "Permitir subir adjuntos de facturas de proveedores"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'facturas-proveedores');

CREATE POLICY "Permitir actualizar adjuntos de facturas de proveedores"
ON storage.objects FOR UPDATE
USING (bucket_id = 'facturas-proveedores');

CREATE POLICY "Permitir eliminar adjuntos de facturas de proveedores"
ON storage.objects FOR DELETE
USING (bucket_id = 'facturas-proveedores');

-- 2. Columnas nuevas en "purchases": tipo de compra y adjunto del
--    documento original.
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS purchase_kind text NOT NULL DEFAULT 'productos'
    CHECK (purchase_kind IN ('piezas', 'productos', 'otros')),
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_type text;

-- 3. Columna nueva en "supplier_payments": comprobante del abono.
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- ====================================================
-- Source: 062-public-catalog-url.sql
-- ====================================================

-- URL pública usada para generar enlaces del catálogo desde la aplicación Electron.
-- Ejecutar este archivo en Supabase SQL Editor.

INSERT INTO public.system_config (key, value, description)
VALUES (
  'public_catalog_url',
  '{"url":"https://arkhamgg.vercel.app"}'::jsonb,
  'URL pública utilizada para compartir el catálogo desde Electron'
)
ON CONFLICT (key) DO NOTHING;

-- Verificación opcional:
-- SELECT key, value, description
-- FROM public.system_config
-- WHERE key = 'public_catalog_url';

-- ====================================================
-- Source: 063-public-catalog-pagination.sql
-- ====================================================

-- Devuelve solo una página del catálogo público. La lista completa de IDs
-- permanece en Supabase y nunca se envía al navegador del cliente.
CREATE OR REPLACE FUNCTION public.get_public_catalog_products(
  p_token TEXT,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  sku VARCHAR(50),
  name VARCHAR(255),
  category VARCHAR(100),
  stock INTEGER,
  sell_price NUMERIC(10,2),
  wholesale_price NUMERIC(10,2),
  image_url TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
  safe_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  SELECT * INTO share_row
  FROM public.catalog_shares
  WHERE token = p_token
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no es válido o ha vencido';
  END IF;

  RETURN QUERY
  WITH catalog_products AS (
    SELECT p.*
    FROM public.products p
    WHERE p.owner_admin_id = share_row.owner_admin_id
      AND p.id = ANY(share_row.product_ids)
      AND p.stock > 0
      AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
      AND (NULLIF(TRIM(p_search), '') IS NULL
        OR p.name ILIKE '%' || TRIM(p_search) || '%'
        OR p.sku ILIKE '%' || TRIM(p_search) || '%')
      AND (NULLIF(TRIM(p_category), '') IS NULL OR p.category = p_category)
  )
  SELECT p.id, p.sku, p.name, p.category, p.stock,
    CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END,
    p.wholesale_price, p.image_url,
    COUNT(*) OVER ()
  FROM catalog_products p
  ORDER BY p.name, p.id
  LIMIT safe_limit OFFSET safe_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_products(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO anon, authenticated;

-- Devuelve todas las categorías disponibles en el catálogo, sin limitarse a la página actual.
CREATE OR REPLACE FUNCTION public.get_public_catalog_categories(
  p_token TEXT
)
RETURNS TABLE (category VARCHAR(100))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  share_row public.catalog_shares%ROWTYPE;
BEGIN
  SELECT * INTO share_row
  FROM public.catalog_shares
  WHERE token = p_token
    AND active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());

  IF share_row.id IS NULL THEN
    RAISE EXCEPTION 'El enlace del catálogo no es válido o ha vencido';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.category
  FROM public.products p
  WHERE p.owner_admin_id = share_row.owner_admin_id
    AND p.id = ANY(share_row.product_ids)
    AND p.stock > 0
    AND (CASE WHEN share_row.price_mode = 'wholesale' THEN p.wholesale_price ELSE p.sell_price END) > 0
    AND NULLIF(TRIM(p.category), '') IS NOT NULL
  ORDER BY p.category;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_catalog_categories(TEXT) TO anon, authenticated;

-- =============================================================================
-- FIN DE MIGRACIONES
-- =============================================================================
-- Archivos concatenados (66):
--   - 001-create-employees-table.sql
--   - 002-create-sales-table.sql
--   - 003-create-returns-table.sql
--   - 004-create-payments-table.sql
--   - 005-create-invoices-bucket.sql
--   - 006-create-products-table.sql
--   - 007-create-repairs-table.sql
--   - 008-create-customers-table.sql
--   - 009-create-suppliers-table.sql
--   - 009-create-system-config-and-purchases.sql
--   - 010-create-cash-closings-table.sql
--   - 010-create-repair-tickets-bucket.sql
--   - 011-add-ticket-url-to-repairs.sql
--   - 012-add-return-to-inventory-column.sql
--   - 012-modify-products-table.sql
--   - 013-fix-employees-rls-policies.sql
--   - 014-create-manual-item-costs-table.sql
--   - 015-fix-detalle-costos-rls.sql
--   - 016-enable-realtime-replication.sql
--   - 017-create-reports-bucket.sql
--   - 018-add-customer-reminders.sql
--   - 020-create-armacen-table.sql
--   - 021-rename-flesh-to-flex.sql
--   - 022-add-imei-to-inventory-tables.sql
--   - 023-create-almacen-closings-table.sql
--   - 024-create-cliente-almacen-module.sql
--   - 025-create-almacen-closing-totals-function.sql
--   - 026-normalize-payment-and-origin-metadata.sql
--   - 027-enable-inventory-id-search.sql
--   - 028-add-manual-paid-check-columns.sql
--   - 029-enable-multi-tenant-saas.sql
--   - 030-create-saas-businesses-table.sql
--   - 031-create-subscription-plans-table.sql
--   - 032-subscription-renewal-and-messages.sql
--   - 033-create-client-invoices-table.sql
--   - 034-client-invoices-drop-pdf-columns.sql
--   - 035-separate-admin-and-subscription-suspension.sql
--   - 036-create-branding-logos-bucket.sql
--   - 037-add-open-access.sql
--   - 038-system-messages-and-app-updates.sql
--   - 039-update-membership-block-contact.sql
--   - 040-enable-realtime-all-tables.sql
--   - 041-create-product-images-bucket.sql
--   - 042-add-product-image-url-to-products.sql
--   - 043-create-payment-allocations-table.sql
--   - 044-add-whatsapp-bot-access.sql
--   - 045-add-payment-method-to-payments.sql
--   - 046-add-minimum-sell-price-to-products.sql
--   - 047-add-is-wholesale-to-sales.sql
--   - 048-add-created-by-to-sales.sql
--   - 049-create-turn-sessions-table.sql
--   - 050-tenant-isolation-products-rls.sql
--   - 051-add-created-by-to-payments.sql
--   - 052-add-cash-balances-to-turn-sessions.sql
--   - 052-add-payment-employee-name.sql
--   - 053-restore-super-admin-dashboard.sql
--   - 054-delete-admin-data.sql
--   - 055-repair-photos-cloud-retention.sql
--   - 056-repair-service-items.sql
--   - 057-add-technician-notes-to-repairs.sql
--   - 058-add-employee-crud-permission-defaults.sql
--   - 059-public-catalog.sql
--   - 060-public-catalog-wholesale.sql
--   - 061-create-purchase-attachments.sql
--   - 062-public-catalog-url.sql
--   - 063-public-catalog-pagination.sql
