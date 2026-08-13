-- Tabla de pagos de clientes
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  invoice_number VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  previous_debt DECIMAL(12, 2) DEFAULT 0,
  remaining_debt DECIMAL(12, 2) DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_owner_invoice_number ON payments(owner_admin_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_payments_owner_admin_id ON payments(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date);

-- Habilitar RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
CREATE POLICY "Allow all operations on payments" ON payments
  FOR ALL
  USING (true)
  WITH CHECK (true);
