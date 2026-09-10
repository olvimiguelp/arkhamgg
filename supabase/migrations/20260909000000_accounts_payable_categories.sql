ALTER TABLE public.accounts_payable
  DROP CONSTRAINT IF EXISTS accounts_payable_category_check;

ALTER TABLE public.accounts_payable
  ADD CONSTRAINT accounts_payable_category_check
  CHECK (category IN ('mercancia', 'nomina', 'servicios', 'alquiler', 'mantenimiento', 'activos', 'transporte', 'publicidad', 'seguros', 'financieros', 'impuestos', 'otros'));