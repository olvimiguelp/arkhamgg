CREATE TABLE IF NOT EXISTS public.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category TEXT NOT NULL CHECK (category IN ('mercancia', 'nomina', 'servicios', 'alquiler', 'mantenimiento', 'activos', 'transporte', 'publicidad', 'seguros', 'financieros', 'impuestos', 'otros')),
  concept TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  supplier_name_freetext TEXT,
  supplier_rnc_freetext TEXT,
  has_ncf BOOLEAN NOT NULL DEFAULT FALSE,
  ncf TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_includes_itbis BOOLEAN NOT NULL DEFAULT TRUE,
  itbis_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  itbis_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'credito' CHECK (payment_type IN ('credito', 'contado')),
  due_date TIMESTAMPTZ,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'parcial', 'pagado')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accounts_payable_owner_admin_id_idx ON public.accounts_payable(owner_admin_id);
CREATE INDEX IF NOT EXISTS accounts_payable_supplier_id_idx ON public.accounts_payable(supplier_id);
CREATE INDEX IF NOT EXISTS accounts_payable_due_date_idx ON public.accounts_payable(due_date);

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounts_payable_tenant_access" ON public.accounts_payable;
CREATE POLICY "accounts_payable_tenant_access" ON public.accounts_payable
  FOR ALL USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)
  WITH CHECK (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL);

DROP TRIGGER IF EXISTS accounts_payable_updated_at ON public.accounts_payable;
CREATE TRIGGER accounts_payable_updated_at
  BEFORE UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.accounts_payable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id),
  account_payable_id UUID NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'transfer',
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS accounts_payable_payments_account_id_idx ON public.accounts_payable_payments(account_payable_id);
ALTER TABLE public.accounts_payable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounts_payable_payments_tenant_access" ON public.accounts_payable_payments;
CREATE POLICY "accounts_payable_payments_tenant_access" ON public.accounts_payable_payments
  FOR ALL USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)
  WITH CHECK (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL);
