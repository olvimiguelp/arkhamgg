-- Los enlaces del catálogo público no vencen. Solo dejan de funcionar
-- cuando se marcan explícitamente como inactivos.
UPDATE public.catalog_shares
SET expires_at = NULL
WHERE expires_at IS NOT NULL;