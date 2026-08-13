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
