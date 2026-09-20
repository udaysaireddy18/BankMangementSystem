# SecureBank - Bank Management System (DBMS Project)

A **Bank Management System** built for a B.Tech CSE DBMS project with a proper
client-server architecture:

- **Frontend** : HTML, CSS, JavaScript (no frameworks, no build tools)
- **Backend**  : Node.js + Express - serves the app and a typed REST API
- **Database** : Supabase (PostgreSQL + Authentication + Row Level Security)

All data (customers, accounts, transactions) lives in **Supabase PostgreSQL**.
Nothing is stored in browser `localStorage`, and no keys are committed to the
repository - the backend injects the Supabase config at runtime.

```
bank-management-system/
├── backend/               # Node.js + Express server
│   ├── server.js          # Express app: static files + /api/* routes
│   ├── package.json       # express, dotenv, @supabase/supabase-js
│   ├── .env               # Supabase URL + anon key + port (NOT committed)
│   └── .env.example       # template for the .env file
├── index.html             Login / Register
├── dashboard.html         Role-based dashboard (admin & customer views)
├── customers.html         Customer management (admin CRUD + search)
├── accounts.html          Account management (open / edit / delete / search)
├── transactions.html      Deposit, withdraw & transaction history
├── transfers.html         Transfer money between accounts
├── profile.html           Update profile, customer record & password
├── css/
│   └── style.css          Full stylesheet
├── js/
│   ├── config.js          SERVED BY THE BACKEND with real values injected
│   ├── api.js             fetch() helper -> backend REST API
│   ├── auth.js            Auth helpers (session, profile, role checks)
│   ├── common.js          Shell renderer, toasts, modals, formatters
│   ├── index.js           Login / register logic
│   ├── dashboard.js       Admin & customer dashboards, 7-day cash flow chart
│   ├── customers.js       Customer CRUD
│   ├── accounts.js        Account CRUD
│   ├── transactions.js    Deposit / withdraw / history
│   ├── transfers.js       Money transfers
│   └── profile.js         Profile & password management
└── sql/
    ├── 01_schema.sql      Tables, primary/foreign keys, indexes
    ├── 02_functions.sql   Stored functions + signup trigger
    ├── 03_rls.sql         Row Level Security policies
    ├── 04_sample_data.sql Sample customers, accounts, transactions
    └── 05_admin.sql       Promote the admin account
```

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) -> **New project** (free tier is enough).
2. Note your **Project URL** and **anon / publishable key**:
   Settings -> **API** -> *Project URL* and *anon public* key.
3. Open **Authentication -> Sign In / Providers -> Email** and **disable**
   *"Confirm email"* so users can log in immediately after registration
   (recommended for a college demo).

## 2. Run the SQL scripts

Open the Supabase SQL Editor and run these files **in order**:

1. `sql/01_schema.sql` - creates the tables
2. `sql/02_functions.sql` - stored procedures + the signup trigger
3. `sql/03_rls.sql` - row level security policies
4. `sql/04_sample_data.sql` - some demo customers / accounts / transactions

5. Keep `sql/05_admin.sql` for later (admin setup, step 4 below).

## 3. Configure the backend

```bash
cd backend
npm install          # one time
```

Copy `.env.example` to `.env` and paste your project values:

```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR-ANON-PUBLISHABLE-KEY
PORT=5000
```

The anon/publishable key is public by design - it just enables the browser to
connect to Supabase Auth. Never put the *service role* secret key in `.env`; it
is not needed by this app (permissions are enforced per-user by RLS).

## 4. Run the app

```bash
cd backend
npm start
```

Open **http://localhost:5000** in your browser.

- The backend serves the static site AND `/vendor/supabase.js` (no CDN needed).
- `js/config.js` is generated on the fly from `.env`, so no keys live in the repo.
- Every page calls `/api/*`; the backend verifies your JWT and then talks to
  Supabase **as you**, so Row Level Security and the stored procedures still
  do the permission checking server-side.

## 5. Create the admin

The first registered user always becomes a **customer**. To make an **admin**:

1. On the login page switch to **Register** and sign up, e.g.:
   - Name: `System Admin`, Email: `admin@bank.com`, Phone: `9999999999`, Password: `Admin@123`
   - (the signup trigger auto-creates a profile, customer record and savings account)
2. Run `sql/05_admin.sql` in the SQL Editor. It promotes that user to **admin**
   and removes the unnecessary customer/account that was auto-created for them.
3. Log out and log in again as `admin@bank.com` / `Admin@123`.
   You will now see the admin sidebar (Customers / Accounts pages).

Regular users who register are customers and can deposit, withdraw, transfer and
manage **their own** accounts only - enforced by Row Level Security.

---

## Architecture

```
Browser (vanilla JS)
   │  supabase.auth.*  -> Supabase Auth (login / register / session)
   │  fetch('/api/*')  -> Express backend
   ▼
Express (backend/server.js)
   │  verifies the JWT (supabase.auth.getUser)
   │  creates a Supabase client acting as that user
   ▼
Supabase (PostgreSQL + RLS + stored procedures)
   │  deposit() / withdraw() / transfer_money() / create_customer() / ...
   ▼
Database rules: auth.uid(), is_admin(), is_my_customer()
```

## API reference (all require `Authorization: Bearer <jwt>`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/stats/counts` | Customer + account totals |
| GET | `/api/transactions?limit=` | Recent transactions (dashboard feed) |
| GET | `/api/customers?order=&lim...` | List customers (admin) |
| GET | `/api/customers/mine` | Own customer record + accounts |
| POST | `/api/customers` | Add customer (admin, stored fn) |
| PATCH | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer (admin) |
| GET | `/api/profiles` | List profiles (admin) |
| GET | `/api/profiles/:id` | One profile |
| PATCH | `/api/profiles/me` | Update own display name |
| GET | `/api/accounts?order=` | List accounts (+ customer) |
| GET | `/api/accounts/by-number/:n` | Verify target account for transfers |
| GET | `/api/accounts/:id/transactions` | Transaction history of an account |
| POST | `/api/accounts` | Open account (admin, stored fn) |
| PATCH | `/api/accounts/:id` | Update type / status (admin) |
| DELETE | `/api/accounts/:id` | Delete account (admin) |
| POST | `/api/accounts/:id/deposit` | Deposit (stored fn) |
| POST | `/api/accounts/:id/withdraw` | Withdraw (stored fn) |
| POST | `/api/transfers` | Transfer between accounts (stored fn) |

---

## Database design

### Tables
| Table | Primary key | Foreign keys |
|---|---|---|
| `profiles` | `id uuid` -> `auth.users(id)` | - |
| `customers` | `id uuid` (gen_random_uuid) | `user_id` -> `auth.users(id)`<br>`created_by` -> `auth.users(id)` |
| `accounts` | `id uuid` (gen_random_uuid) | `customer_id` -> `customers(id)`<br>`created_by` -> `auth.users(id)` |
| `transactions` | `id uuid` (gen_random_uuid) | `account_id` -> `accounts(id)`<br>`to_account_id` -> `accounts(id)`<br>`performed_by` -> `auth.users(id)` |

A **transfer** creates two transaction rows (one `transfer_out` on the sender,
one `transfer_in` on the receiver) linked by a shared `group_id` so money can
never be created or destroyed.

### Stored procedures (called by the backend via supabase.rpc)
- `create_customer(...)`  - admin adds a customer
- `create_account(...)`   - admin opens an account
- `deposit(...)`          - credit money
- `withdraw(...)`         - debit money (checks balance + account status)
- `transfer_money(...)`   - move money between two accounts (account *number* + checks)
- `is_admin()` / `is_my_customer()` - permission helpers used by RLS

Money functions are `SECURITY DEFINER` and re-check permissions internally, so
row level security keeps the data safe while the procedures do the work.

### Row Level Security
| Table | Admin | Customer |
|---|---|---|
| `profiles` | all | view / edit own |
| `customers` | all | view / edit own record |
| `accounts` | all | view own accounts only |
| `transactions` | read all | read own accounts only, **no direct writes** (must use stored functions) |

---

## Features checklist

- [x] Admin login & customer login / registration (Supabase Auth)
- [x] Add, view, update, delete customers
- [x] Create & manage bank accounts (savings / current / fixed deposit)
- [x] Deposit, withdraw & transfer money (stored procedures)
- [x] View account balance & full transaction history
- [x] Search customers and accounts
- [x] Dashboard with stats + 7-day deposit/withdrawal chart
- [x] Profile page (name, customer details, password change)
- [x] Backend: Express REST API that validates JWTs server-side
- [x] Extension points for a DBMS viva: triggers, RLS, FK constraints, indexes, sample data

## Sample data (from `sql/04_sample_data.sql`)

| Customer | Account | Type | Balance |
|---|---|---|---|
| Rahul Sharma | ACC-1000000001 | Savings | ₹25,000.00 |
| Rahul Sharma | ACC-1000000002 | Current | ₹50,000.00 |
| Priya Patel  | ACC-2000000001 | Savings | ₹15,000.00 |
| Amit Verma   | ACC-3000000001 | Savings | ₹32,000.00 |
| Sneha Gupta  | ACC-4000000001 | Savings | ₹12,000.50 |
| Vikram Singh | ACC-5000000001 | Fixed Deposit | ₹100,000.00 |

## Notes / troubleshooting

- **"relation does not exist" / RLS errors**: make sure you ran all SQL files
  in order in the Supabase SQL Editor.
- **"Could not connect" / network error in the browser**: the backend is not
  running. Start it with `cd backend && npm start`.
- **401 "Invalid or expired session"**: log out and log in again; your JWT is
  verified by the backend on every request.
- **Signup returns but login fails**: enable the trigger by re-running
  `02_functions.sql` (the `on_auth_user_created` trigger creates the profile,
  customer and savings account). The app has a small fallback that creates the
  profile row, but the customer + account creation need the trigger.
- **Customer cannot see other customers / accounts**: that is Row Level
  Security working as intended.
- The signup **trigger** (`handle_new_user`) auto-creates a profile, a customer
  record and a savings account for every new registration, so a new user can
  immediately log in and deposit / withdraw / transfer on their own account.