-- Preserve only live sessions of active customers. Revoked and expired tokens stay invalid.
UPDATE public.catalog_customer_sessions AS s
SET expires_at = 'infinity'::timestamptz
FROM public.catalog_customer_accounts AS a
WHERE a.id = s.customer_id AND a.is_active AND s.revoked_at IS NULL
  AND s.expires_at > now() AND isfinite(s.expires_at);
