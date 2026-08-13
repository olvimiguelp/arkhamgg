-- Add created_by_employee_id to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS created_by_employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_created_by_employee_id ON public.sales(created_by_employee_id);
