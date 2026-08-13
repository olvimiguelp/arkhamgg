-- Permite actualizar el historial por (tenant, reparación original) usando
-- consultas normales sin depender de un índice parcial.
DROP INDEX IF EXISTS public.idx_repair_history_owner_original;
CREATE UNIQUE INDEX IF NOT EXISTS idx_repair_history_owner_original
  ON public.repair_history(owner_admin_id, original_repair_id);
