-- Add reminder settings to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_interval_days INTEGER DEFAULT 15;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_last_sent_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reminder_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_reminder_interval_check'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_reminder_interval_check
      CHECK (reminder_interval_days IN (5, 15, 30));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_reminder_enabled ON public.customers(reminder_enabled);
CREATE INDEX IF NOT EXISTS idx_customers_reminder_last_sent_at ON public.customers(reminder_last_sent_at);
