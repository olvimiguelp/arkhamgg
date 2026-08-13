-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  name TEXT NOT NULL,
  rnc TEXT,
  razon_social TEXT,
  tipo_empresa TEXT,
  website TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  debt DECIMAL(12,2) DEFAULT 0,
  total_purchases DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_owner_rnc ON suppliers(owner_admin_id, rnc) WHERE rnc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_owner_admin_id ON suppliers(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on suppliers" ON suppliers
  FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW
  EXECUTE FUNCTION update_suppliers_updated_at();
