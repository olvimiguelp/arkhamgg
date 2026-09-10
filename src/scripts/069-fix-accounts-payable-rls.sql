ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounts_payable_tenant_access" ON public.accounts_payable;
CREATE POLICY "accounts_payable_tenant_access" ON public.accounts_payable
  FOR ALL USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)
  WITH CHECK (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL);

ALTER TABLE public.accounts_payable_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accounts_payable_payments_tenant_access" ON public.accounts_payable_payments;
CREATE POLICY "accounts_payable_payments_tenant_access" ON public.accounts_payable_payments
  FOR ALL USING (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL)
  WITH CHECK (owner_admin_id = public.current_tenant_id() OR public.current_tenant_id() IS NULL);