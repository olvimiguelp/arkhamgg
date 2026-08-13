-- Create cash_closings table for storing daily cash closures
CREATE TABLE IF NOT EXISTS cash_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  closing_number VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  cashier_id UUID REFERENCES employees(id),
  cashier_name VARCHAR(255) NOT NULL,
  
  -- Opening balance
  opening_balance NUMERIC(12,2) DEFAULT 0,
  
  -- Sales breakdown
  total_sales NUMERIC(12,2) DEFAULT 0,
  sales_cash NUMERIC(12,2) DEFAULT 0,
  sales_card NUMERIC(12,2) DEFAULT 0,
  sales_transfer NUMERIC(12,2) DEFAULT 0,
  sales_credit NUMERIC(12,2) DEFAULT 0,
  sales_count INTEGER DEFAULT 0,
  
  -- Returns
  total_returns NUMERIC(12,2) DEFAULT 0,
  returns_count INTEGER DEFAULT 0,
  
  -- Payments received
  total_payments NUMERIC(12,2) DEFAULT 0,
  payments_count INTEGER DEFAULT 0,
  
  -- Repairs
  total_repairs NUMERIC(12,2) DEFAULT 0,
  repairs_count INTEGER DEFAULT 0,
  
  -- Expenses
  total_expenses NUMERIC(12,2) DEFAULT 0,
  expenses_count INTEGER DEFAULT 0,
  
  -- Cash count by denomination
  denomination_counts JSONB DEFAULT '{}',
  
  -- Totals
  expected_amount NUMERIC(12,2) DEFAULT 0,
  counted_amount NUMERIC(12,2) DEFAULT 0,
  discrepancy NUMERIC(12,2) DEFAULT 0,
  
  -- Status and notes
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  notes TEXT,
  supervisor_id UUID REFERENCES employees(id),
  supervisor_name VARCHAR(255),
  
  -- PDF storage
  pdf_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create expenses table for daily expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_admin_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category VARCHAR(100) NOT NULL, -- 'operativo', 'suministros', 'servicios', 'otros'
  payment_method VARCHAR(50) DEFAULT 'cash',
  user_id UUID REFERENCES employees(id),
  user_name VARCHAR(255),
  receipt_url TEXT,
  notes TEXT,
  cash_closing_id UUID REFERENCES cash_closings(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create policies
DROP POLICY IF EXISTS "Allow all operations on cash_closings" ON cash_closings;
CREATE POLICY "Allow all operations on cash_closings" ON cash_closings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on expenses" ON expenses;
CREATE POLICY "Allow all operations on expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_closings_owner_closing_number ON cash_closings(owner_admin_id, closing_number);
CREATE INDEX IF NOT EXISTS idx_cash_closings_owner_admin_id ON cash_closings(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_cash_closings_date ON cash_closings(date);
CREATE INDEX IF NOT EXISTS idx_cash_closings_status ON cash_closings(status);
CREATE INDEX IF NOT EXISTS idx_expenses_owner_admin_id ON expenses(owner_admin_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
