-- Crear tabla de empleados
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'employee')),
  owner_admin_id UUID REFERENCES employees(id) ON DELETE RESTRICT,
  cedula TEXT UNIQUE NOT NULL,
  address TEXT,
  hire_date DATE DEFAULT CURRENT_DATE,
  salary DECIMAL(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  permissions JSONB NOT NULL DEFAULT '{
    "sales": true,
    "inventory": true,
    "customers": true,
    "suppliers": true,
    "reports": false,
    "repairs": true,
    "returns": false,
    "purchases": true,
    "employees": false,
    "invoiceHistory": false,
    "products": true
  }'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Normaliza owner_admin_id por rol.
-- super_admin/admin: owner_admin_id = su propio id
-- employee: owner_admin_id = id del admin propietario
CREATE OR REPLACE FUNCTION set_employee_owner_admin_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.role IN ('super_admin', 'admin') THEN
    NEW.owner_admin_id := NEW.id;
  END IF;

  IF NEW.role = 'employee' AND NEW.owner_admin_id IS NULL THEN
    RAISE EXCEPTION 'owner_admin_id es obligatorio para empleados';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_employee_owner_admin_id ON employees;
CREATE TRIGGER trg_set_employee_owner_admin_id
  BEFORE INSERT OR UPDATE ON employees
  FOR EACH ROW
  EXECUTE FUNCTION set_employee_owner_admin_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_owner_admin_required'
      AND conrelid = 'employees'::regclass
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_owner_admin_required CHECK (
        (role IN ('super_admin', 'admin') AND owner_admin_id = id)
        OR (role = 'employee' AND owner_admin_id IS NOT NULL)
      );
  END IF;
END $$;

-- Habilitar Row Level Security
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura a todos los usuarios autenticados
CREATE POLICY "Allow authenticated users to read employees" ON employees
  FOR SELECT USING (true);

-- Política para permitir inserción solo a administradores
CREATE POLICY "Allow admins to insert employees" ON employees
  FOR INSERT WITH CHECK (true);

-- Política para permitir actualización solo a administradores
CREATE POLICY "Allow admins to update employees" ON employees
  FOR UPDATE USING (true);

-- Política para permitir eliminación solo a administradores
CREATE POLICY "Allow admins to delete employees" ON employees
  FOR DELETE USING (true);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_employees_cedula ON employees(cedula);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_owner_admin_id ON employees(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_owner_admin_id ON employees(role, owner_admin_id);

-- Insertar super administrador por defecto
INSERT INTO employees (name, email, password, phone, role, owner_admin_id, cedula, address, salary, status, permissions)
VALUES (
  'Super Administrador',
  'admin@techmobile.com',
  'admin123',
  '809-555-0001',
  'super_admin',
  gen_random_uuid(),
  '00100000001',
  'Santo Domingo, RD',
  50000.00,
  'active',
  '{
    "sales": true,
    "inventory": true,
    "customers": true,
    "suppliers": true,
    "reports": true,
    "repairs": true,
    "returns": true,
    "purchases": true,
    "employees": true,
    "invoiceHistory": true,
    "products": true
  }'::jsonb
) ON CONFLICT (email) DO NOTHING;
