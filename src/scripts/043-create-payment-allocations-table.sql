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
