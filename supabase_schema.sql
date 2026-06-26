-- Supabase SQL Schema for CV DPJ Berkah Unggas

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Items Table
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Customers Table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Transactions Table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(100) NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'debt')),
  amount_paid DECIMAL(15, 2) NOT NULL,
  remaining_debt DECIMAL(15, 2) NOT NULL DEFAULT 0,
  date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  print_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- Transaction Items Table
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  price DECIMAL(15, 2) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(15, 2) NOT NULL,
  unit VARCHAR(50) NOT NULL
);

-- Debt Payments Table
CREATE TABLE debt_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  invoice_number VARCHAR(100) NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  amount_paid DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'transfer')),
  notes TEXT
);

-- Customer Debt Summary View (Optional, but helpful)
CREATE OR REPLACE VIEW customer_debt_summary AS
SELECT 
  c.id AS customer_id,
  c.name AS customer_name,
  COALESCE(SUM(t.total_amount), 0) AS total_debt,
  COALESCE((SELECT SUM(dp.amount_paid) FROM debt_payments dp WHERE dp.customer_id = c.id), 0) AS total_paid,
  (COALESCE(SUM(t.total_amount), 0) - COALESCE((SELECT SUM(dp.amount_paid) FROM debt_payments dp WHERE dp.customer_id = c.id), 0)) AS remaining_debt,
  MAX(t.date) AS last_active
FROM customers c
LEFT JOIN transactions t ON t.customer_id = c.id AND t.payment_method = 'debt'
GROUP BY c.id, c.name;

-- Price Memory Table (If you want to track latest price for items)
CREATE TABLE price_memory (
  item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  last_price DECIMAL(15, 2) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security (RLS) Policies (Optional, but recommended for Supabase)
-- Enable RLS for all tables
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_memory ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users (or anon if public) 
-- Adjust based on your auth needs. Here is a permissive policy for testing:
CREATE POLICY "Enable all operations for all users" ON items FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON customers FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON transactions FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON transaction_items FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON debt_payments FOR ALL USING (true);
CREATE POLICY "Enable all operations for all users" ON price_memory FOR ALL USING (true);
