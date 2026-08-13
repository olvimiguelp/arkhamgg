-- Add return_to_inventory column to returns table
ALTER TABLE returns ADD COLUMN IF NOT EXISTS return_to_inventory BOOLEAN DEFAULT TRUE;
