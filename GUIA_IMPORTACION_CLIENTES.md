# Guía de Importación de Clientes

## Descripción General

La función de importación de clientes permite subir información de clientes desde archivos CSV o SQL directamente a su base de datos. Esto es útil para migrar clientes existentes o cargar información en lotes.

## Ubicación

Puede acceder a la página de importación desde el menú lateral: **Importar Clientes** o navegando a `/importar-clientes`.

## Formatos Soportados

### Archivo CSV

El archivo CSV debe tener una primera fila con los encabezados. Las columnas soportadas son:

- **name** (obligatorio): Nombre del cliente
- **cedula**: Número de cédula o identificación
- **phone**: Número de teléfono
- **email**: Correo electrónico
- **address**: Dirección
- **status**: Estado (por defecto "En proceso")
- **creditDevice**: Dispositivo de crédito
- **notes**: Notas o comentarios
- **debt**: Deuda pendiente (número)
- **totalPurchases**: Total de compras (número)
- **creditBalance**: Saldo de crédito (número)
- **creditLimit**: Límite de crédito (número)

#### Ejemplo CSV:

```csv
name,cedula,phone,email,address,status,creditDevice,notes,debt,totalPurchases,creditBalance,creditLimit
Olvin Miguel,12345678,8095551234,olvin@example.com,Calle Principal 123,En proceso,Dispositivo A,Cliente VIP,1500.00,5000.00,500.00,2000.00
Juan Pérez,87654321,8095559876,juan@example.com,Avenida 2 456,Finalizado,Dispositivo B,Cliente regular,0,3000.00,0,1000.00
```

### Archivo SQL

El archivo SQL debe contener statements `INSERT INTO customers`. La función analizará automáticamente los valores y los mapeará a las columnas correctas.

#### Ejemplo SQL:

```sql
INSERT INTO customers (name, cedula, phone, email, address, status, credit_device, notes, debt, total_purchases, credit_balance, credit_limit) 
VALUES 
('Olvin Miguel', '12345678', '8095551234', 'olvin@example.com', 'Calle Principal 123', 'En proceso', 'Dispositivo A', 'Cliente VIP', 1500.00, 5000.00, 500.00, 2000.00),
('Juan Pérez', '87654321', '8095559876', 'juan@example.com', 'Avenida 2 456', 'Finalizado', 'Dispositivo B', 'Cliente regular', 0, 3000.00, 0, 1000.00);
```

## Cómo Usar

1. **Abra la página de importación**: Vaya a "Importar Clientes" desde el menú
2. **Seleccione un archivo**: Haga clic en el área de carga o arrastra un archivo CSV o SQL
3. **Analice el archivo**: Haga clic en "Analizar Archivo" para ver una vista previa
4. **Revise los datos**: Verificar que los clientes se mapearon correctamente
5. **Importe**: Haga clic en "Importar Ahora" para guardar los clientes en la base de datos
6. **Revise los resultados**: Se mostrará un resumen de clientes importados exitosamente y cualquier error

## Validaciones

- **Archivo requerido**: Debe seleccionar un archivo CSV o SQL
- **Datos válidos**: Solo se importarán clientes con un nombre válido
- **Duplicados**: Si un cliente con el mismo nombre ya existe, se creará un nuevo registro (no hay validación de duplicados automática)
- **Números válidos**: Los campos numéricos se validarán y se usarán como 0 si son inválidos

## Ejemplos de Archivos

Se proporcionan dos archivos de ejemplo en el directorio raíz del proyecto:

- `EJEMPLO_IMPORTACION_CLIENTES.csv` - Ejemplo de formato CSV
- `EJEMPLO_IMPORTACION_CLIENTES.sql` - Ejemplo de formato SQL

## Notas Importantes

- Los nombres de cliente son **obligatorios**
- Los campos vacíos o no especificados se usarán con valores por defecto
- El estado por defecto es "En proceso"
- Se recomenda hacer una copia de seguridad antes de importar grandes cantidades de clientes
- Los clientes se crearán con ID único automático generado

## Solución de Problemas

### El archivo no se procesa

- Asegúrese de que está usando un archivo .csv o .sql
- Verifique que el archivo no esté corrupto

### No se encontraron clientes

- Verifique que el archivo tiene al menos una fila de datos además de los encabezados
- Asegúrese de que la columna "name" (nombre) tiene valores válidos

### Algunos clientes fallaron en la importación

- Revise los errores mostrados en el diálogo de resultados
- Puede reintentar solo esos clientes editando el archivo y volviendo a cargar

## Archivos Generados

Los archivos de importación se encuentran en:
- `src/lib/import-customers.ts` - Lógica de parseo y importación
- `src/pages/importar-clientes/page.tsx` - Interfaz de usuario
