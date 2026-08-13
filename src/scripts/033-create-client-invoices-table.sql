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
