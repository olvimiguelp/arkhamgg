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
