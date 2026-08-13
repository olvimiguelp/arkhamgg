-- Tabla de reparaciones
CREATE TABLE IF NOT EXISTS repairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  repair_number VARCHAR(20) NOT NULL,
  client VARCHAR(255) NOT NULL,
  device VARCHAR(255) NOT NULL,
  issue TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  type VARCHAR(100) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  password VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE UNIQUE INDEX IF NOT EXISTS idx_repairs_owner_repair_number ON repairs(owner_admin_id, repair_number);
CREATE INDEX IF NOT EXISTS idx_repairs_owner_admin_id ON repairs(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_repairs_client ON repairs(client);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_date ON repairs(date);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_repairs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_repairs_updated_at ON repairs;
CREATE TRIGGER trigger_repairs_updated_at
  BEFORE UPDATE ON repairs
  FOR EACH ROW
  EXECUTE FUNCTION update_repairs_updated_at();

-- Habilitar RLS
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas las operaciones
DROP POLICY IF EXISTS "Allow all operations on repairs" ON repairs;
CREATE POLICY "Allow all operations on repairs" ON repairs
  FOR ALL
  USING (true)
  WITH CHECK (true);
