-- ============================================================================
--  BANK MANAGEMENT SYSTEM - ROW LEVEL SECURITY (RLS)
--  Run this AFTER 01_schema.sql and 02_functions.sql
--
--  Rule summary:
--    * Admin  -> full access to every table
--    * Customer -> sees ONLY their own profile, customer record and accounts,
--                  and only the transactions of their own accounts.
--    * Transactions can only be created through the stored functions
--      (deposit / withdraw / transfer_money), never directly.
-- ============================================================================

-- --- PROFILES ---------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles: view own profile" on public.profiles;
create policy "Profiles: view own profile"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles: update own profile" on public.profiles;
create policy "Profiles: update own profile"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles: insert own profile" on public.profiles;
create policy "Profiles: insert own profile"
  on public.profiles for insert
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "Profiles: admins can delete" on public.profiles;
create policy "Profiles: admins can delete"
  on public.profiles for delete
  using (public.is_admin());

-- --- CUSTOMERS --------------------------------------------------------------
alter table public.customers enable row level security;

-- admin: full control
drop policy if exists "Customers: admin all" on public.customers;
create policy "Customers: admin all"
  on public.customers for all
  using (public.is_admin())
  with check (public.is_admin());

-- customer: read only their own record
drop policy if exists "Customers: view own record" on public.customers;
create policy "Customers: view own record"
  on public.customers for select
  using (public.is_my_customer(id));

-- customer: update their own record (profile page).
-- they cannot reassign user_id to someone else, because the WITH CHECK
-- requires the row to still belong to them after the update.
drop policy if exists "Customers: edit own record" on public.customers;
create policy "Customers: edit own record"
  on public.customers for update
  using (public.is_my_customer(id))
  with check (public.is_my_customer(id));

-- --- ACCOUNTS ---------------------------------------------------------------
alter table public.accounts enable row level security;

-- admin: full control
drop policy if exists "Accounts: admin all" on public.accounts;
create policy "Accounts: admin all"
  on public.accounts for all
  using (public.is_admin())
  with check (public.is_admin());

-- customer: read only accounts of their own customer record
drop policy if exists "Accounts: view own accounts" on public.accounts;
create policy "Accounts: view own accounts"
  on public.accounts for select
  using (public.is_my_customer(customer_id));

-- --- TRANSACTIONS -----------------------------------------------------------
alter table public.transactions enable row level security;

-- admin: read everything
drop policy if exists "Transactions: admin read" on public.transactions;
create policy "Transactions: admin read"
  on public.transactions for select
  using (public.is_admin());

-- customer: read only transactions of their own accounts
drop policy if exists "Transactions: view own transactions" on public.transactions;
create policy "Transactions: view own transactions"
  on public.transactions for select
  using (exists (
      select 1 from public.accounts a
      where a.id = transactions.account_id
        and public.is_my_customer(a.customer_id)
  ));

-- NO insert / update / delete policies on transactions are defined on purpose.
-- RLS denies all direct writes; money movement is only possible through the
-- stored functions deposit() / withdraw() / transfer_money().

-- Revoke write access from the client role, so even a misconfigured client
-- cannot modify transactions directly (belt and suspenders).
revoke insert, update, delete on public.transactions from anon, authenticated;