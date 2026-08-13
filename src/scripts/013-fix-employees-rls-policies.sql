-- Fix RLS policies and adapt employees table for multi-tenant SaaS
-- Roles: super_admin, admin, employee

-- 1) Make cedula optional and keep backward compatibility
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_cedula_key;
ALTER TABLE employees ALTER COLUMN cedula DROP NOT NULL;

-- 2) Add/normalize owner_admin_id and 3-level roles
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS owner_admin_id UUID REFERENCES employees(id) ON DELETE RESTRICT;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('super_admin', 'admin', 'employee'));

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

-- Backfill:
-- admin/super_admin own themselves
UPDATE employees
SET owner_admin_id = id
WHERE role IN ('admin', 'super_admin')
  AND (owner_admin_id IS NULL OR owner_admin_id <> id);

-- employees without owner are attached to the oldest admin/super_admin
WITH fallback_admin AS (
  SELECT id
  FROM employees
  WHERE role IN ('admin', 'super_admin')
  ORDER BY created_at NULLS FIRST, id
  LIMIT 1
)
UPDATE employees e
SET owner_admin_id = fa.id
FROM fallback_admin fa
WHERE e.role = 'employee'
  AND e.owner_admin_id IS NULL;

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

-- 3) Drop and recreate generic policies (legacy project behavior)
DROP POLICY IF EXISTS "Allow authenticated users to read employees" ON employees;
DROP POLICY IF EXISTS "Allow admins to insert employees" ON employees;
DROP POLICY IF EXISTS "Allow admins to update employees" ON employees;
DROP POLICY IF EXISTS "Allow admins to delete employees" ON employees;
DROP POLICY IF EXISTS "Allow authenticated to read employees" ON employees;
DROP POLICY IF EXISTS "Allow public to read employees for login" ON employees;
DROP POLICY IF EXISTS "Allow insert employees" ON employees;
DROP POLICY IF EXISTS "Allow update employees" ON employees;
DROP POLICY IF EXISTS "Allow delete employees" ON employees;

CREATE POLICY "Allow authenticated to read employees" ON employees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow public to read employees for login" ON employees
  FOR SELECT USING (true);

CREATE POLICY "Allow insert employees" ON employees
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update employees" ON employees
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete employees" ON employees
  FOR DELETE USING (true);

-- 4) Indexes for login and tenant segmentation
CREATE INDEX IF NOT EXISTS idx_employees_email_active ON employees(email) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_employees_cedula ON employees(cedula) WHERE cedula IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_owner_admin_id ON employees(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_owner_admin_id ON employees(role, owner_admin_id);
