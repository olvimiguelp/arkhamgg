-- Script para modificar la tabla de productos
-- Renombrar SKU a Codigo y agregar campo RAM

-- Agregar columna RAM si no existe
ALTER TABLE products ADD COLUMN IF NOT EXISTS ram VARCHAR(50);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Crear índice para RAM
CREATE INDEX IF NOT EXISTS idx_products_ram ON products(ram);

-- Nota: La columna SKU se mantiene en la base de datos por compatibilidad,
-- pero en la interfaz se mostrará como "Codigo"
