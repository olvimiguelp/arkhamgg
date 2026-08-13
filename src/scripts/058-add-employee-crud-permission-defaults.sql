-- Asegurar que los empleados tengan permisos CRUD definidos y que el valor por defecto sea false.
ALTER TABLE employees
  ALTER COLUMN permissions SET DEFAULT '{
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
    "products": true,
    "canAdd": false,
    "canEdit": false,
    "canDelete": false
  }'::jsonb;

-- Agregar las claves faltantes a los registros existentes sin sobrescribir valores ya definidos.
UPDATE employees
SET permissions = jsonb_set(
    jsonb_set(
      jsonb_set(
        permissions,
        '{canAdd}',
        COALESCE(permissions->'canAdd', 'false'::jsonb),
        true
      ),
      '{canEdit}',
      COALESCE(permissions->'canEdit', 'false'::jsonb),
      true
    ),
    '{canDelete}',
    COALESCE(permissions->'canDelete', 'false'::jsonb),
    true
  )
WHERE NOT (permissions ? 'canAdd' AND permissions ? 'canEdit' AND permissions ? 'canDelete');
