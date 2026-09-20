-- ============================================================================
--  BANK MANAGEMENT SYSTEM - SAMPLE DATA
--  Run this AFTER 01, 02 and 03.
--
--  Inserts a few customers, accounts and transactions so the dashboard has
--  something to show immediately. Balances below are consistent with the
--  seeded transactions.
-- ============================================================================

-- --- CUSTOMERS --------------------------------------------------------------
insert into public.customers (first_name, last_name, email, phone, address, date_of_birth)
values
  ('Rahul',   'Sharma', 'rahul.sharma@example.com',  '9876543210', '42 Marine Drive, Mumbai',       '1992-04-12'),
  ('Priya',   'Patel',  'priya.patel@example.com',   '9876501234', '7 MG Road, Bengaluru',          '1995-08-23'),
  ('Amit',    'Verma',  'amit.verma@example.com',    '9822334455', '18 Raj Nagar, Delhi',           '1988-01-30'),
  ('Sneha',   'Gupta',  'sneha.gupta@example.com',   '9800011223', '55 FC Road, Pune',              '1998-11-05'),
  ('Vikram',  'Singh',  'vikram.singh@example.com',  '9866711223', '9 Pink City Market, Jaipur',    '1990-06-17');

-- --- ACCOUNTS ---------------------------------------------------------------
insert into public.accounts (account_number, customer_id, account_type, balance, status)
values
  ('ACC-1000000001', (select id from public.customers where email = 'rahul.sharma@example.com'), 'savings',      25000.00, 'active'),
  ('ACC-1000000002', (select id from public.customers where email = 'rahul.sharma@example.com'), 'current',      50000.00, 'active'),
  ('ACC-2000000001', (select id from public.customers where email = 'priya.patel@example.com'),  'savings',      15000.00, 'active'),
  ('ACC-3000000001', (select id from public.customers where email = 'amit.verma@example.com'),   'savings',      32000.00, 'active'),
  ('ACC-4000000001', (select id from public.customers where email = 'sneha.gupta@example.com'),  'savings',      12000.50, 'active'),
  ('ACC-5000000001', (select id from public.customers where email = 'vikram.singh@example.com'), 'fixed_deposit', 100000.00, 'active');

-- --- TRANSACTIONS -----------------------------------------------------------
insert into public.transactions (account_id, to_account_id, group_id, type, amount, balance_after, description, created_at)
values
  -- Rahul savings (ACC-1000000001) -> final 25000.00
  ((select id from public.accounts where account_number = 'ACC-1000000001'), null, null, 'deposit',      10000.00, 10000.00, 'Opening deposit',       now() - interval '30 days'),
  ((select id from public.accounts where account_number = 'ACC-1000000001'), null, null, 'deposit',      20000.00, 30000.00, 'Salary credit',          now() - interval '20 days'),
  ((select id from public.accounts where account_number = 'ACC-1000000001'), null, null, 'transfer_in',   5000.00, 35000.00, 'Fund transfer received', now() - interval '12 days'),
  ((select id from public.accounts where account_number = 'ACC-1000000001'), null, null, 'withdrawal',   10000.00, 25000.00, 'ATM withdrawal',         now() - interval '3 days'),

  -- Rahul current (ACC-1000000002) -> final 50000.00
  ((select id from public.accounts where account_number = 'ACC-1000000002'), null, null, 'deposit',      50000.00, 50000.00, 'Opening deposit',        now() - interval '28 days'),

  -- Priya savings (ACC-2000000001) -> final 15000.00 (transferred 5000 to Rahul)
  ((select id from public.accounts where account_number = 'ACC-2000000001'), null, null, 'deposit',      20000.00, 20000.00, 'Opening deposit',        now() - interval '25 days'),
  ((select id from public.accounts where account_number = 'ACC-2000000001'),
   (select id from public.accounts where account_number = 'ACC-1000000001'),
   'e0f00000-0000-4000-8000-000000000001', 'transfer_out', 5000.00, 15000.00, 'Fund transfer to Rahul', now() - interval '12 days'),

  -- Amit savings (ACC-3000000001) -> final 32000.00
  ((select id from public.accounts where account_number = 'ACC-3000000001'), null, null, 'deposit',      25000.00, 25000.00, 'Opening deposit',        now() - interval '18 days'),
  ((select id from public.accounts where account_number = 'ACC-3000000001'), null, null, 'deposit',       7000.00, 32000.00, 'Cash deposit',           now() - interval '6 days'),

  -- Sneha savings (ACC-4000000001) -> final 12000.50
  ((select id from public.accounts where account_number = 'ACC-4000000001'), null, null, 'deposit',      10000.50, 10000.50, 'Opening deposit',        now() - interval '15 days'),
  ((select id from public.accounts where account_number = 'ACC-4000000001'), null, null, 'deposit',       2000.00, 12000.50, 'Birthday gift',          now() - interval '2 days'),

  -- Vikram fixed deposit (ACC-5000000001) -> final 100000.00
  ((select id from public.accounts where account_number = 'ACC-5000000001'), null, null, 'deposit',      100000.00, 100000.00, 'FD placement',           now() - interval '10 days');