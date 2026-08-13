-- Metodo de pago en abonos de clientes (efectivo, tarjeta, transferencia, credito).

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NOT NULL DEFAULT 'cash';

COMMENT ON COLUMN public.payments.payment_method IS
  'Metodo de pago del abono: cash, card, transfer o credit.';

CREATE INDEX IF NOT EXISTS idx_payments_payment_method ON public.payments(payment_method);
