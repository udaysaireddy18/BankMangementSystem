-- ============================================================================
--  BANK MANAGEMENT SYSTEM - SCHEMA
--  Database : Supabase PostgreSQL
--
--  Tables:
--    1. profiles     -> linked to auth.users (Supabase Authentication)
--    2. customers    -> bank customers
--    3. accounts     -> bank accounts (each belongs to one customer)
--    4. transactions -> all deposits / withdrawals / transfers
--
--  Run this file first in the Supabase SQL Editor.
-- ============================================================================

-- Enable the pgcrypto extension (provides gen_random_uuid)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. PROFILES ---------------------------------------------------------------
-- One row per login user. role = 'admin' OR 'customer'
-- ----------------------------------------------------------------------------
create table public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    email       text not null,
    name        text not null,
    role        text not null default 'customer'
                check (role in ('admin', 'customer')),
    created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. CUSTOMERS --------------------------------------------------------------
-- A customer is a real person. user_id links a customer to a login account
-- (not every customer must have a login).
-- ----------------------------------------------------------------------------
create table public.customers (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid references auth.users (id) on delete set null,
    first_name    text not null,
    last_name     text not null default '',
    email         text unique,
    phone         text not null,
    address       text default '',
    date_of_birth date,
    created_at    timestamptz not null default now(),
    created_by    uuid references auth.users (id) on delete set null
);

-- ----------------------------------------------------------------------------
-- 3. ACCOUNTS ---------------------------------------------------------------
-- Each account belongs to exactly one customer.
-- ----------------------------------------------------------------------------
create table public.accounts (
    id             uuid primary key default gen_random_uuid(),
    account_number text unique not null,
    customer_id    uuid not null references public.customers (id) on delete cascade,
    account_type   text not null default 'savings'
                   check (account_type in ('savings', 'current', 'fixed_deposit')),
    balance        numeric(15, 2) not null default 0 check (balance >= 0),
    status         text not null default 'active'
                   check (status in ('active', 'dormant', 'closed')),
    created_at     timestamptz not null default now(),
    created_by     uuid references auth.users (id) on delete set null
);

-- ----------------------------------------------------------------------------
-- 4. TRANSACTIONS -----------------------------------------------------------
-- Every money movement is recorded here.
--   account_id  -> the account whose balance changed
--   to_account_id -> only used for transfer_in rows (the receiving account)
--   group_id    -> links the two rows of one transfer together
-- ----------------------------------------------------------------------------
create table public.transactions (
    id            uuid primary key default gen_random_uuid(),
    account_id    uuid not null references public.accounts (id) on delete cascade,
    to_account_id uuid references public.accounts (id) on delete set null,
    group_id      uuid,                                   -- transfer grouping
    type          text not null
                  check (type in ('deposit', 'withdrawal', 'transfer_in', 'transfer_out')),
    amount        numeric(15, 2) not null check (amount > 0),
    balance_after numeric(15, 2),                        -- balance of account_id after the action
    description   text default '',
    performed_by  uuid references auth.users (id) on delete set null,
    created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INDEXES (speed up the most common queries)
-- ----------------------------------------------------------------------------
create index if not exists idx_customers_email    on public.customers (email);
create index if not exists idx_customers_user     on public.customers (user_id);
create index if not exists idx_accounts_customer  on public.accounts (customer_id);
create index if not exists idx_accounts_number    on public.accounts (account_number);
create index if not exists idx_txns_account       on public.transactions (account_id);
create index if not exists idx_txns_created       on public.transactions (created_at desc);
create index if not exists idx_txns_group         on public.transactions (group_id);