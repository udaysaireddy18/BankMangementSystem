-- ============================================================================
--  BANK MANAGEMENT SYSTEM - RECONCILE PROJECT BEFORE APPLYING SCHEMA
--  Run this FIRST, before 01_schema.sql.
--
--  This project already contains a table named "customers" that belongs to
--  another app. It is NOT part of this bank system, so we move it out of the
--  way (rename = data is preserved, nothing is deleted). Any leftover bank
--  tables from earlier attempts are dropped so 01_schema.sql can recreate
--  them cleanly.
-- ============================================================================

-- Bank-owned tables (safe to drop / recreate)
drop table if exists public.transactions cascade;
drop table if exists public.accounts cascade;
drop table if exists public.profiles cascade;

-- "customers" is ambiguous -> inspect, never lose data.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'customers')
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'customers'
                       and column_name = 'first_name')
  then
    -- Not our bank table -> rename it away (data kept).
    execute 'alter table public.customers rename to customers_backup_pre_bank';
    raise notice 'renamed non-bank table public.customers -> public.customers_backup_pre_bank (data preserved)';
  elsif exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'customers')
  then
    -- It already matched the bank schema from a previous partially-run attempt.
    execute 'drop table public.customers cascade';
    raise notice 'dropped old bank-style public.customers for a clean start';
  else
    raise notice 'public.customers does not exist - nothing to reconcile';
  end if;
end $$;