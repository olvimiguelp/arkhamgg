-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid not null default gen_random_uuid (),
  owner_admin_id uuid not null references public.employees(id),
  name text not null,
  cedula text null,
  phone text null,
  email text null,
  address text null,
  status text null default 'En proceso'::text,
  credit_device text null,
  notes text null,
  debt numeric null default 0,
  total_purchases numeric null default 0,
  credit_balance numeric null default 0,
  credit_limit numeric null default 0,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  reminder_enabled boolean null default false,
  reminder_interval_days integer null default 15,
  reminder_last_sent_at timestamp with time zone null,
  reminder_message text null,
  constraint customers_pkey primary key (id),
  constraint customers_reminder_interval_check check ((reminder_interval_days = any (array[5, 15, 30]))),
  constraint customers_status_check check (
    (
      status = any (array['En proceso'::text, 'Finalizado'::text])
    )
  )
) TABLESPACE pg_default;

-- Create indexes
create unique index IF not exists idx_customers_owner_cedula on public.customers using btree (owner_admin_id, cedula) TABLESPACE pg_default
where cedula is not null;
create index IF not exists idx_customers_owner_admin_id on public.customers using btree (owner_admin_id) TABLESPACE pg_default;
create index IF not exists idx_customers_name on public.customers using btree (name) TABLESPACE pg_default;
create index IF not exists idx_customers_status on public.customers using btree (status) TABLESPACE pg_default;
create index IF not exists idx_customers_reminder_enabled on public.customers using btree (reminder_enabled) TABLESPACE pg_default;
create index IF not exists idx_customers_reminder_last_sent_at on public.customers using btree (reminder_last_sent_at) TABLESPACE pg_default;

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on customers" ON customers
  FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger
create trigger trg_customers_updated_at BEFORE
update on customers for EACH row
execute FUNCTION set_updated_at ();
