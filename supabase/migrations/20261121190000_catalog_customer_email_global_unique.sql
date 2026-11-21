DROP INDEX IF EXISTS public.catalog_customer_accounts_owner_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS catalog_customer_accounts_email_global_key
  ON public.catalog_customer_accounts(lower(email))
  WHERE email IS NOT NULL;
