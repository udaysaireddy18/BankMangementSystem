-- ============================================================================
--  BANK MANAGEMENT SYSTEM - FUNCTIONS & TRIGGERS
--  Run this AFTER 01_schema.sql
--
--  Functions used by the app (called with supabase.rpc):
--    1. is_admin()              -> role check helper
--    2. create_customer()       -> admin creates a new customer
--    3. create_account()        -> admin creates an account for a customer
--    4. deposit()               -> add money to an account
--    5. withdraw()              -> take money out of an account
--    6. transfer_money()        -> move money between two accounts
--
--  Trigger:
--    7. handle_new_user()       -> automatically creates the profile, customer
--                                  and a savings account when someone registers
--
--  All money functions run as the table owner (SECURITY DEFINER) and re-check
--  permissions inside, so the balances can never be changed from outside.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. IS ADMIN - helper used by RLS and by the other functions
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

-- ----------------------------------------------------------------------------
-- Helper: is the given customer owned by the currently logged-in user?
-- ----------------------------------------------------------------------------
create or replace function public.is_my_customer(p_customer_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.customers
        where id = p_customer_id and user_id = auth.uid()
    );
$$;

-- ----------------------------------------------------------------------------
-- 2. CREATE CUSTOMER - only an admin may call this
-- ----------------------------------------------------------------------------
create or replace function public.create_customer(
    p_first_name text,
    p_last_name  text default '',
    p_email      text default null,
    p_phone      text default null,
    p_address    text default '',
    p_dob        date default null,
    p_user_id    uuid default null
)
returns public.customers
language plpgsql security definer set search_path = public
as $$
declare
    v_customer public.customers;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can create customers';
    end if;
    if p_first_name is null or trim(p_first_name) = '' then
        raise exception 'First name is required';
    end if;
    if p_phone is null or trim(p_phone) = '' then
        raise exception 'Phone number is required';
    end if;

    insert into public.customers
        (user_id, first_name, last_name, email, phone, address, date_of_birth, created_by)
    values
        (p_user_id, p_first_name, p_last_name, p_email, p_phone, p_address, p_dob, auth.uid())
    returning * into v_customer;

    return v_customer;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. CREATE ACCOUNT - only an admin may call this
-- Account number: ACC-XXXXXXXXXX (10 random digits)
-- ----------------------------------------------------------------------------
create or replace function public.create_account(
    p_customer_id   uuid,
    p_account_type  text default 'savings',
    p_initial_deposit numeric(15, 2) default 0
)
returns public.accounts
language plpgsql security definer set search_path = public
as $$
declare
    v_account  public.accounts;
    v_number   text;
    v_customer public.customers;
begin
    if not public.is_admin() then
        raise exception 'Only an admin can create accounts';
    end if;
    if not exists (select 1 from public.customers where id = p_customer_id) then
        raise exception 'Customer not found';
    end if;
    if p_initial_deposit < 0 then
        raise exception 'Initial deposit cannot be negative';
    end if;

    -- generate a unique account number (retry on the very rare collision)
    loop
        v_number := 'ACC-' || lpad(floor(random() * 9999999999)::bigint::text, 10, '0');
        exit when not exists (select 1 from public.accounts where account_number = v_number);
    end loop;

    insert into public.accounts
        (account_number, customer_id, account_type, balance, status, created_by)
    values
        (v_number, p_customer_id, p_account_type, p_initial_deposit, 'active', auth.uid())
    returning * into v_account;

    -- record the initial deposit as the first transaction
    if p_initial_deposit > 0 then
        insert into public.transactions
            (account_id, type, amount, balance_after, description, performed_by)
        values
            (v_account.id, 'deposit', p_initial_deposit, p_initial_deposit,
             'Initial deposit while opening account', auth.uid());
    end if;

    return v_account;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. DEPOSIT - admin or the owner of the account
-- ----------------------------------------------------------------------------
create or replace function public.deposit(
    p_account_id uuid,
    p_amount     numeric(15, 2),
    p_description text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
    v_account    public.accounts;
    v_transaction public.transactions;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Amount must be greater than zero';
    end if;

    select * into v_account from public.accounts where id = p_account_id;
    if not found then
        raise exception 'Account not found';
    end if;
    if v_account.status <> 'active' then
        raise exception 'This account is not active';
    end if;
    if not (public.is_admin() or public.is_my_customer(v_account.customer_id)) then
        raise exception 'You are not allowed to operate this account';
    end if;

    update public.accounts
       set balance = balance + p_amount
     where id = p_account_id;

    insert into public.transactions
        (account_id, type, amount, balance_after, description, performed_by)
    values
        (p_account_id, 'deposit', p_amount,
         (select balance from public.accounts where id = p_account_id),
         coalesce(p_description, 'Cash Deposit'), auth.uid())
    returning * into v_transaction;

    return v_transaction;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. WITHDRAW
-- ----------------------------------------------------------------------------
create or replace function public.withdraw(
    p_account_id uuid,
    p_amount     numeric(15, 2),
    p_description text default null
)
returns public.transactions
language plpgsql security definer set search_path = public
as $$
declare
    v_account    public.accounts;
    v_transaction public.transactions;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Amount must be greater than zero';
    end if;

    select * into v_account from public.accounts where id = p_account_id;
    if not found then
        raise exception 'Account not found';
    end if;
    if v_account.status <> 'active' then
        raise exception 'This account is not active';
    end if;
    if not (public.is_admin() or public.is_my_customer(v_account.customer_id)) then
        raise exception 'You are not allowed to operate this account';
    end if;
    if v_account.balance < p_amount then
        raise exception 'Insufficient balance. Available balance is %', v_account.balance;
    end if;

    update public.accounts
       set balance = balance - p_amount
     where id = p_account_id;

    insert into public.transactions
        (account_id, type, amount, balance_after, description, performed_by)
    values
        (p_account_id, 'withdrawal', p_amount,
         (select balance from public.accounts where id = p_account_id),
         coalesce(p_description, 'Cash Withdrawal'), auth.uid())
    returning * into v_transaction;

    return v_transaction;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. TRANSFER MONEY
-- p_to_account is the account NUMBER (text) so that customers who cannot see
-- other people's accounts (RLS) can still make transfers - the function runs
-- with elevated privileges and validates the target itself.
-- Creates one 'transfer_out' row on the sender account and one 'transfer_in'
-- row on the receiver account, both linked with a shared group_id.
-- ----------------------------------------------------------------------------
create or replace function public.transfer_money(
    p_from_account uuid,
    p_to_account   text,
    p_amount       numeric(15, 2),
    p_description  text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
    v_from    public.accounts;
    v_to      public.accounts;
    v_group   uuid := gen_random_uuid();
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Amount must be greater than zero';
    end if;

    select * into v_from from public.accounts where id = p_from_account;
    select * into v_to   from public.accounts where account_number = upper(p_to_account);

    if v_from.id is null then
        raise exception 'Sender account not found';
    end if;
    if v_to.id is null then
        raise exception 'Receiver account not found';
    end if;
    if upper(p_to_account) = v_from.account_number then
        raise exception 'You cannot transfer to the same account';
    end if;
    if v_from.status <> 'active' then
        raise exception 'Sender account is not active';
    end if;
    if v_to.status <> 'active' then
        raise exception 'Receiver account is not active';
    end if;
    if not (public.is_admin() or public.is_my_customer(v_from.customer_id)) then
        raise exception 'You are not allowed to send money from this account';
    end if;
    if v_from.balance < p_amount then
        raise exception 'Insufficient balance. Available balance is %', v_from.balance;
    end if;

    -- debit sender
    update public.accounts set balance = balance - p_amount where id = p_from_account;
    insert into public.transactions
        (account_id, to_account_id, group_id, type, amount, balance_after, description, performed_by)
    values
        (p_from_account, v_to.id, v_group, 'transfer_out', p_amount,
         (select balance from public.accounts where id = p_from_account),
         coalesce(p_description, 'Fund transfer'), auth.uid());

    -- credit receiver
    update public.accounts set balance = balance + p_amount where id = v_to.id;
    insert into public.transactions
        (account_id, group_id, type, amount, balance_after, description, performed_by)
    values
        (v_to.id, v_group, 'transfer_in', p_amount,
         (select balance from public.accounts where id = v_to.id),
         coalesce(p_description, 'Fund transfer received'), auth.uid());
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. TRIGGER - create profile + customer + savings account on registration
-- Fires automatically when a new row is inserted into auth.users.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
    v_name      text := coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1));
    v_phone     text := coalesce(new.raw_user_meta_data ->> 'phone', '');
    v_address   text := coalesce(new.raw_user_meta_data ->> 'address', '');
    v_customer  public.customers;
begin
    -- 1. profile
    insert into public.profiles (id, email, name, role)
    values (new.id, new.email, v_name, 'customer')
    on conflict (id) do nothing;

    -- 2. customer record
    insert into public.customers (user_id, first_name, last_name, email, phone, address)
    values (new.id, v_name, '', new.email, v_phone, v_address)
    returning * into v_customer;

    -- 3. default savings account
    -- (reuse the account-number generator logic)
    declare
        v_number text;
    begin
        loop
            v_number := 'ACC-' || lpad(floor(random() * 9999999999)::bigint::text, 10, '0');
            exit when not exists (select 1 from public.accounts where account_number = v_number);
        end loop;

        insert into public.accounts
            (account_number, customer_id, account_type, balance, status)
        values
            (v_number, v_customer.id, 'savings', 0, 'active');
    end;

    return new;
end;
$$;

create or replace trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();