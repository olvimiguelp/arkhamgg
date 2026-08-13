-- ============================================================
-- 049: Create turn_sessions table
-- Tracks employee shift open/close history per day
-- ============================================================

CREATE TABLE IF NOT EXISTS public.turn_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  employee_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- 'open' | 'closed'
  cash_total NUMERIC(12,2) DEFAULT 0,
  card_total NUMERIC(12,2) DEFAULT 0,
  transfer_total NUMERIC(12,2) DEFAULT 0,
  credit_total NUMERIC(12,2) DEFAULT 0,
  total_sales NUMERIC(12,2) DEFAULT 0,
  sale_count INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.turn_sessions ENABLE ROW LEVEL SECURITY;

-- Open policy (tenant isolation handled in app layer)
DROP POLICY IF EXISTS "Allow all operations on turn_sessions" ON public.turn_sessions;
CREATE POLICY "Allow all operations on turn_sessions"
  ON public.turn_sessions FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_turn_sessions_owner_admin_id ON public.turn_sessions(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_employee_id ON public.turn_sessions(employee_id);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_date ON public.turn_sessions(date);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_status ON public.turn_sessions(status);
CREATE INDEX IF NOT EXISTS idx_turn_sessions_opened_at ON public.turn_sessions(opened_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.turn_sessions;
