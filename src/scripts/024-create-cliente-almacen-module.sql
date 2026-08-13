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
