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
