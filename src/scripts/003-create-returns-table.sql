-- Tabla de devoluciones
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  return_number VARCHAR(50) NOT NULL,
  invoice_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  customer_id UUID,
  customer_name VARCHAR(255),
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  items JSONB NOT NULL DEFAULT '[]',
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  type VARCHAR(50) NOT NULL DEFAULT 'reembolso',
  reason TEXT,
  status VARCHAR(50) DEFAULT 'completa',
  new_invoice_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_owner_return_number ON returns(owner_admin_id, return_number);
CREATE INDEX IF NOT EXISTS idx_returns_owner_admin_id ON returns(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_returns_invoice_id ON returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_returns_date ON returns(date);
CREATE INDEX IF NOT EXISTS idx_returns_customer_id ON returns(customer_id);

-- Habilitar RLS
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
CREATE POLICY "Allow all operations on returns" ON returns
  FOR ALL
  USING (true)
  WITH CHECK (true);
