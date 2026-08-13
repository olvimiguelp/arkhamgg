# 🔧 Fix for Database Insert Errors (Code 42883)

## Problema

Estás recibiendo el error:
```
Error: function realtime.broadcast(text, text) does not exist
Code: 42883
```

Este error ocurre cuando intentas insertar datos en `expenses` o `sales` porque hay triggers en la base de datos que llaman a una función no existente.

## Solución

Hay dos formas de arreglarlo:

### Opción 1: Comando Automático (Recomendado)

Ejecuta este comando en tu terminal:

```bash
npm run fix:database
```

Este comando automáticamente:
- Se conecta a tu base de datos Supabase
- Elimina los 12 triggers problemáticos
- Elimina la función broadcast_table_changes()
- Permite que funcionen los inserts en sales y expenses

### Opción 2: Manual (Si la Opción 1 no funciona)

1. Ve a [Supabase Dashboard](https://supabase.com)
2. Abre tu proyecto
3. Ve a **SQL Editor**
4. Crea una nueva query
5. Copia el contenido de [src/scripts/drop-broadcast-triggers.sql](drop-broadcast-triggers.sql)
6. Ejecuta la query

## Lo que se está corrigiendo

Se están eliminando estos triggers que llaman a la función no existente `realtime.broadcast()`:

- ❌ employees_broadcast_trigger
- ❌ products_broadcast_trigger
- ❌ armacen_broadcast_trigger
- ❌ sales_broadcast_trigger
- ❌ customers_broadcast_trigger
- ❌ suppliers_broadcast_trigger
- ❌ system_messages_broadcast_trigger
- ❌ payments_broadcast_trigger
- ❌ returns_broadcast_trigger
- ❌ repairs_broadcast_trigger
- ❌ expenses_broadcast_trigger
- ❌ cash_closings_broadcast_trigger

## Verificación

Después de ejecutar el fix, intenta:

1. **Agregar un gasto**
2. **Agregar una venta**

Si ambas operaciones funcionan sin errores, ¡el fix fue exitoso! 🎉

## ¿Por qué sucedió esto?

El archivo `src/scripts/030-create-system-messages-and-broadcast-triggers.sql` fue creado con triggers que usan `realtime.broadcast()`, pero Supabase no proporciona esta función. La forma correcta de usar realtime en Supabase es a través de:

- **Supabase Realtime Client** (que ya está configurado en tu app)
- **PostgreSQL LISTEN/NOTIFY** (alternativa nativa)
- **Supabase Publications** (para replicate data)

Puedes eliminar el archivo `030-create-system-messages-and-broadcast-triggers.sql` de futuras migraciones, ya que tu aplicación ya maneja realtime correctamente desde el frontend con `use-system-messages.ts`.

## Soporte

Si aún tienes problemas, verifica:

1. ¿Tus variables de entorno están configuradas? (VITE_SUPABASE_URL, VITE_SUPABASE_KEY)
2. ¿Tu usuario de Supabase tiene permisos de admin en la BD?
3. ¿Puedes ejecutar queries SQL manualmente en Supabase Dashboard?

---

Creado: 17 abril 2026
