-- Tabla de ventas/facturas
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  invoice_number VARCHAR(50) NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(12, 2) DEFAULT 0,
  tax DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  change DECIMAL(12, 2) DEFAULT 0,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'cash',
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_id UUID,
  manual_paid_checked BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'completada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_owner_invoice_number ON sales(owner_admin_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_owner_admin_id ON sales(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- Habilitar RLS
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones (ajustar según necesidad)
CREATE POLICY "Allow all operations on sales" ON sales
  FOR ALL
  USING (true)
  WITH CHECK (true);
