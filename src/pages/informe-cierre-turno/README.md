# Informe de Cierre de Turno

## Descripción
Componente nuevo que permite controlar y registrar el cierre de turno para múltiples empleados. Cada empleado puede tener un registro independiente de sus ventas por método de pago, permitiendo hacer cierre de turno antes del cierre de caja general.

## Características

### ✅ Implementadas
- **Interfaz de Ingreso de Datos**: Permite al administrador ingresar/editar montos de venta por empleado
- **Control por Método de Pago**: Registra ventas en Efectivo, Tarjeta, Transferencia y Crédito
- **Resumen de Totales**: Muestra totales generales con gráficos de distribución
- **Historial de Cierres**: Mantiene registro de todos los cierres realizados
- **Control de Turno**: Marcar turno como cerrado/abierto por empleado
- **Notas**: Permite agregar observaciones en cada cierre de turno

### 📱 Interfaz
1. **Header** - Información y botón de actualizar
2. **Filtro de Fecha** - Seleccionar qué fecha revisar
3. **Tarjetas de Resumen** - Totales por método de pago
4. **Gráfico** - Distribución de ventas en gráfico de barras
5. **Tabla de Empleados** - Ingreso/edición de montos por empleado
6. **Historial** - Cierres registrados para la fecha

## Configuración Requerida

### 1. Crear Tabla en Supabase

Ejecutar esta migración en la consola SQL de Supabase:

```sql
-- Crear tabla para registrar los cierres de turno por empleado
CREATE TABLE IF NOT EXISTS public.turn_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  employee_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  cash_total DECIMAL(12, 2) DEFAULT 0,
  card_total DECIMAL(12, 2) DEFAULT 0,
  transfer_total DECIMAL(12, 2) DEFAULT 0,
  credit_total DECIMAL(12, 2) DEFAULT 0,
  total_sales DECIMAL(12, 2) NOT NULL,
  sale_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)
);

-- Crear índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_turn_closings_date ON public.turn_closings(date);
CREATE INDEX IF NOT EXISTS idx_turn_closings_employee_id ON public.turn_closings(employee_id);
CREATE INDEX IF NOT EXISTS idx_turn_closings_employee_date ON public.turn_closings(employee_id, date);
```

### 2. Habilitar RLS (Row Level Security) - Opcional

Si utilizas RLS, agregar policy:

```sql
CREATE POLICY "Enable insert for authenticated users" ON turn_closings
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Enable read for authenticated users" ON turn_closings
  FOR SELECT 
  TO authenticated 
  USING (true);
```

## Uso

### Acceso
- **URL**: `/informe-cierre-turno`
- **Rol Requerido**: Admin
- **Ubicación en Sidebar**: Entre "Cierre de Caja" e "Cierre de Almacén"

### Flujo de Trabajo

1. **Seleccionar Fecha**
   - Usar el filtro de fecha para elegir qué día revisar
   - Por defecto muestra el día actual

2. **Ingresar Montos por Empleado**
   - Click en el botón ✏️ (Editar) en la fila del empleado
   - Ingresar montos por método de pago:
     - Efectivo 💵
     - Tarjeta 💳
     - Transferencia 🔄
     - Crédito ⚠️
   - Click en ✓ (Guardar) para confirmar

3. **Registrar Cierre de Turno**
   - Una vez ingresados los montos, click en "Cerrar Turno"
   - Se abre un diálogo de confirmación
   - Opcionalmente, agregar notas
   - Click en "Confirmar Cierre"

4. **Revisar Historial**
   - Ver tabla "Historial de Cierres de Turno"
   - Muestra hora de cierre y notas
   - No se puede cerrar turno duplicado (mismo empleado, misma fecha)

## Mejoras Futuras

### 1. Rastreo Automático (Prioridad Alta)
Se recomienda agregar campo `created_by_employee_id` a la tabla `sales` para rastrear automáticamente qué empleado realizó cada venta. Esto eliminaría la necesidad de ingreso manual.

### 2. Interfaz Multi-Caja
Implementar sistema de cajas/registros para manejar múltiples puntos de venta simultáneamente.

### 3. Reportes PDF
Agregar opción para descargar PDF del cierre de turno.

## Notas Técnicas

### Ubicación de Archivos
```
src/
  ├── pages/informe-cierre-turno/
  │   ├── page.tsx       (Componente principal)
  │   └── loading.tsx    (Skeleton loading)
  ├── App.tsx            (Ruta agregada)
  └── components/sidebar.tsx  (Menú actualizado)
```

### Componentes Usados
- UI: Card, Table, Button, Badge, Dialog, Input, Textarea
- Gráficos: Recharts (BarChart)
- Iconos: lucide-react
- Hook: useRealtimeTableRefresh (sincronización en tiempo real)

### Tabla Supabase
- **Nombre**: `turn_closings`
- **Campos Clave**: employee_id, date, cash_total, card_total, transfer_total, credit_total, total_sales, notes, created_at
- **Constraint Único**: (employee_id, date) - Previene cierres duplicados

## Troubleshooting

### "Tabla turn_closings no existe"
Ejecutar la migración SQL desde el panel de Supabase

### "No puedo ingresar dos cierres para el mismo empleado en el mismo día"
Es por diseño. El constraint UNIQUE previene duplicados. Editar el cierre anterior si es necesario.

### Los datos no se actualizan en tiempo real
Hacer click en "Actualizar" o recargar la página

## Soporte
Para agregar features o reportar problemas, revisar las notas en `/memories/repo/informe-cierre-turno-notes.md`
