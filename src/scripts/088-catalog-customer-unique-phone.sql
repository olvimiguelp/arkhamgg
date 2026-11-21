-- Keep pre-existing accounts, including numbers shared by older tenants. One
-- reservation per number makes a new claim atomic across all administrators.
LOCK TABLE public.catalog_customer_accounts IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE catalog_private.customer_phone_reservations (
  phone text PRIMARY KEY,
  account_count integer NOT NULL CHECK (account_count >= 0)
);
INSERT INTO catalog_private.customer_phone_reservations(phone, account_count)
SELECT phone, count(*) FROM public.catalog_customer_accounts GROUP BY phone;

CREATE FUNCTION catalog_private.reserve_customer_phone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE remaining integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.phone = OLD.phone THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO catalog_private.customer_phone_reservations VALUES (NEW.phone, 1);
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE catalog_private.customer_phone_reservations SET account_count = account_count - 1
      WHERE phone = OLD.phone RETURNING account_count INTO STRICT remaining;
    IF remaining = 0 THEN DELETE FROM catalog_private.customer_phone_reservations WHERE phone = OLD.phone; END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION catalog_private.reserve_customer_phone() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER reserve_customer_phone AFTER INSERT OR UPDATE OF phone OR DELETE
  ON public.catalog_customer_accounts FOR EACH ROW EXECUTE FUNCTION catalog_private.reserve_customer_phone();

CREATE UNIQUE INDEX catalog_customer_email_normalized_key ON public.catalog_customer_accounts(lower(btrim(email)))
  WHERE email IS NOT NULL;
DROP INDEX public.catalog_customer_accounts_email_global_key;