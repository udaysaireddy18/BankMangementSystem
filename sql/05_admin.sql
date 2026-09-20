-- ============================================================================
--  STEP 1 : Create the admin login through the app
--  ---------------------------------------------------------------------------
--  Open index.html -> click "Register" and sign up with:
--      Name     : System Admin
--      Email    : admin@bank.com
--      Phone    : 9999999999
--      Password : Admin@123
--
--  The database trigger automatically creates the profile + a customer record
--  + a savings account for this user (role = 'customer').
--
--  STEP 2 : Promote that user to ADMIN by running the UPDATE below.
--  ---------------------------------------------------------------------------
--  Run this in the Supabase SQL Editor ONLY AFTER signing up.
-- ============================================================================

update public.profiles
   set role = 'admin',
       name = 'System Admin'
 where email = 'admin@bank.com';

-- Optional: delete the default customer/account created for the admin user,
-- because the admin does not need a customer record.
delete from public.accounts
 where customer_id in (
     select id from public.customers where email = 'admin@bank.com'
 );

delete from public.customers where email = 'admin@bank.com';

-- Verify
select id, email, name, role from public.profiles;