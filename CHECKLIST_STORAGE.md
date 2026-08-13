# Lista de Solución: Error "Bucket not found"

Sigue estos pasos en orden para solucionar el error al guardar reportes o facturas:

## 1. Verificar el Proyecto Correcto
- Abre tu archivo `.env`.
- La URL debe ser: `https://lnzzvypyfytewghoyiwd.supabase.co`.
- **IMPORTANTE**: Verifica que el bucket que creaste esté en **ESTE** proyecto y no en otro (como el que termina en `...zettyxkg.supabase.co`).

## 2. Verificar el Nombre del Bucket
- En el dashboard de Supabase (sección Storage), los buckets deben llamarse exactamente `reportes` y `facturas` (todo en minúsculas).
- Asegúrate de que estén en modo **PUBLIC** y que el tamaño máximo coincida con lo esperado (20 MB para reportes, 10 MB para facturas).

## 3. Crear los buckets faltantes con el helper
1. Completa `SUPABASE_SERVICE_ROLE_KEY` en tu `.env` (no lo compartas públicamente).
2. Ejecuta el helper con:
   ```bash
   npm run setup:storage
   ```
   Este script usa la clave de servicio para crear `reportes` y `facturas`.
3. Copia y pega el SQL de los siguientes archivos en el editor SQL de Supabase para crear las políticas de `storage.objects`:
   - `src/scripts/005-create-invoices-bucket.sql`
   - `src/scripts/017-create-reports-bucket.sql`
4. Valida la conexión con `node verify_storage.js` (asegúrate de que indique que ambos buckets existen).

## 4. Reiniciar el Servidor de Desarrollo
- Detén el servidor (Ctrl+C).
- Ejecuta `npm run dev` otra vez para que Vite recoja los nuevos buckets.

## 5. Probar desde la Consola del Navegador
Si sigues teniendo problemas, abre la aplicación, presiona **F12**, ve a **Console** y pega este código para ver qué buckets detecta el cliente:
```javascript
const { data: buckets } = await (await import('@supabase/supabase-js')).createClient(
  'https://lnzzvypyfytewghoyiwd.supabase.co',
  'tu_anon_key_aqui',
).storage.listBuckets();
console.log("Buckets detectados por la web:", buckets.map(b => b.name));
```
