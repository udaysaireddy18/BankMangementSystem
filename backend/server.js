// ============================================================================
//  SecureBank - Bank Management System (Express + Supabase backend)
//
//  This server:
//   1. Serves the static frontend (HTML / CSS / JS)
//   2. Serves the Supabase JS SDK locally (<script src="/vendor/supabase.js">)
//   3. Injects the real Supabase URL + anon key into js/config.js at runtime,
//      so no secret/keys ever need to be committed to the repository
//   4. Exposes a typed REST API (/api/*) used by every page. Every endpoint
//      validates the user's JWT server-side, then talks to Supabase AS that
//      user - so Row Level Security and the stored procedures (deposit,
//      withdraw, transfer_money, ...) continue to enforce permissions.
// ============================================================================

require("dotenv").config();

const path = require("path");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const PORT = parseInt(process.env.PORT, 10) || 5000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Missing Supabase configuration. Copy backend/.env.example to backend/.env and fill in SUPABASE_URL and SUPABASE_ANON_KEY."
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

// Supabase client used only for JWT verification (works with the public key).
const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Sanitise any error coming back from supabase-js into { message }.
function cleanError(error, fallback) {
  const msg = (error && error.message) || fallback || "Something went wrong.";
  return { error: msg };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

// Build a Supabase client that is logged in AS the user with the given JWT.
// This is what keeps RLS policies (auth.uid() / is_admin() / is_my_customer())
// working on the server - we never use the service role key against user data.
async function clientForUser(jwt) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await client.auth.setSession({ access_token: jwt, refresh_token: "refresh-token-not-needed" });
  return client;
}

// Verify the "Authorization: Bearer <jwt>" header and attach:
//   req.userId  - the authenticated user's uuid
//   req.db      - a Supabase client acting as that user
async function auth(req, res, next) {
  const raw = (req.headers.authorization || "").trim();
  const jwt = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
  if (!jwt) return res.status(401).json({ error: "Authentication required." });

  const { data, error } = await anonClient.auth.getUser(jwt);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }

  try {
    req.userId = data.user.id;
    req.db = await clientForUser(jwt);
  } catch (e) {
    return res.status(401).json({ error: "Could not start an authenticated Supabase session." });
  }
  next();
}

// Apply an optional { order } query parameter to a select query.
function applyOrder(query, req) {
  const order = req.query.order;
  if (order) {
    const ascending = String(req.query.asc === "true");
    query = query.order(order, { ascending });
  } else if (String(req.query.desc) === "true") {
    query = query.order("created_at", { ascending: false });
  }
  return query;
}

// ---------------------------------------------------------------------------
//  Config endpoints (frontend bootstrap)
// ---------------------------------------------------------------------------

// Serve js/config.js with the real values injected from the environment,
// so the repository itself holds no credentials.
app.get("/js/config.js", (req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.send(
    "const SUPABASE_URL = " + JSON.stringify(SUPABASE_URL) + ";\n" +
    "const SUPABASE_ANON_KEY = " + JSON.stringify(SUPABASE_ANON_KEY) + ";\n" +
    "window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);\n"
  );
});

// Serve the UMD build of supabase-js locally instead of a CDN.
app.get("/vendor/supabase.js", (req, res) => {
  let umd;
  try {
    umd = require.resolve("@supabase/supabase-js/dist/umd/supabase.js");
  } catch (e) {
    return res.status(500).send("supabase-js UMD build not found. Run: npm install");
  }
  res.type("application/javascript");
  res.sendFile(umd);
});

// Simple health check.
app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "SecureBank - Bank Management System", time: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
//  REST API - every route below requires a valid user JWT.
// ---------------------------------------------------------------------------
app.use("/api", auth);

// ---------------- dashboard helpers ----------------
app.get("/api/stats/counts", async (req, res) => {
  const [c, a] = await Promise.all([
    req.db.from("customers").select("*", { count: "exact", head: true }),
    req.db.from("accounts").select("*", { count: "exact", head: true }),
  ]);
  if (c.error) return res.status(400).json(cleanError(c.error));
  if (a.error) return res.status(400).json(cleanError(a.error));
  res.json({ customers: c.count || 0, accounts: a.count || 0 });
});

// Recent transactions with the joined account + customer (dashboard feed).
//   GET /api/transactions?limit=10
app.get("/api/transactions", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  let q = req.db
    .from("transactions")
    .select("*, accounts!transactions_account_id_fkey(account_number, customer_id, customers(first_name, last_name))")
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data, error } = await q;
  if (error) return res.status(400).json(cleanError(error));
  res.json(data || []);
});

// ---------------- customers ----------------
// List customers.  GET /api/customers?order=created_at&desc=true
app.get("/api/customers", async (req, res) => {
  let q = req.db.from("customers").select("*");
  q = applyOrder(q, req);
  if (req.query.limit) q = q.limit(Math.min(parseInt(req.query.limit, 10) || 10, 500));
  const { data, error } = await q;
  if (error) return res.status(400).json(cleanError(error));
  res.json(data || []);
});

// The logged-in user's own customer record + their accounts.
//   GET /api/customers/mine
app.get("/api/customers/mine", async (req, res) => {
  const { data, error } = await req.db
    .from("customers")
    .select("*, accounts(id, account_number, account_type, balance, status, created_at)")
    .eq("user_id", req.userId)
    .maybeSingle();
  if (error) return res.status(400).json(cleanError(error));
  res.json(data);
});

// Create a customer (admin, via the stored function).
//   POST /api/customers  { first_name, last_name, email, phone, address, dob, user_id }
app.post("/api/customers", async (req, res) => {
  const { first_name, last_name, email, phone, address, dob, user_id } = req.body || {};
  const { data, error } = await req.db.rpc("create_customer", {
    p_first_name: first_name,
    p_last_name: last_name,
    p_email: email || null,
    p_phone: phone,
    p_address: address,
    p_dob: dob || null,
    p_user_id: user_id || null,
  });
  if (error) return res.status(400).json(cleanError(error));
  res.status(201).json(data);
});

// Update a customer (admin, or a customer editing their own record in profile).
app.patch("/api/customers/:id", async (req, res) => {
  const fields = {};
  for (const key of ["first_name", "last_name", "email", "phone", "address", "date_of_birth", "user_id"]) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: "Nothing to update." });
  const { error } = await req.db.from("customers").update(fields).eq("id", req.params.id);
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// Delete a customer (admin).
app.delete("/api/customers/:id", async (req, res) => {
  const { error } = await req.db.from("customers").delete().eq("id", req.params.id);
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// ---------------- profiles ----------------
// List profiles (used by the admin Customers page for the linked-login dropdown).
app.get("/api/profiles", async (req, res) => {
  const { data, error } = await req.db.from("profiles").select("id, email, name, role");
  if (error) return res.status(400).json(cleanError(error));
  res.json(data || []);
});

// A single profile (used to load the shell / own profile).
app.get("/api/profiles/:id", async (req, res) => {
  const { data, error } = await req.db.from("profiles").select("*").eq("id", req.params.id).maybeSingle();
  if (error) return res.status(400).json(cleanError(error));
  res.json(data);
});

// Update the caller's own display name.  { name }
app.patch("/api/profiles/me", async (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name cannot be empty." });
  const { error } = await req.db.from("profiles").update({ name: String(name).trim() }).eq("id", req.userId);
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// ---------------- accounts ----------------
// List accounts with the owning customer.  GET /api/accounts?order=created_at
app.get("/api/accounts", async (req, res) => {
  let q = req.db
    .from("accounts")
    .select("*, customers(first_name, last_name, email)");
  q = applyOrder(q, req);
  const { data, error } = await q;
  if (error) return res.status(400).json(cleanError(error));
  res.json(data || []);
});

// Look up an account by its number (Transfer page verification).
app.get("/api/accounts/by-number/:number", async (req, res) => {
  const { data, error } = await req.db
    .from("accounts")
    .select("*, customers(first_name, last_name, email)")
    .eq("account_number", String(req.params.number).toUpperCase())
    .maybeSingle();
  if (error) return res.status(400).json(cleanError(error));
  res.json(data);
});

// Transactions of one account.
//   GET /api/accounts/:id/transactions?limit=100&types=transfer_in,transfer_out
app.get("/api/accounts/:id/transactions", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  let q = req.db
    .from("transactions")
    .select("*")
    .eq("account_id", req.params.id);
  if (req.query.types) q = q.in("type", String(req.query.types).split(","));
  q = q.order("created_at", { ascending: false }).limit(limit);
  const { data, error } = await q;
  if (error) return res.status(400).json(cleanError(error));
  res.json(data || []);
});

// Open an account (admin, via the stored function).  { customer_id, account_type, initial_deposit }
app.post("/api/accounts", async (req, res) => {
  const { customer_id, account_type, initial_deposit } = req.body || {};
  const { error } = await req.db.rpc("create_account", {
    p_customer_id: customer_id,
    p_account_type: account_type,
    p_initial_deposit: initial_deposit || 0,
  });
  if (error) return res.status(400).json(cleanError(error));
  res.status(201).json({ ok: true });
});

// Update account type / status (admin).  { account_type, status }
app.patch("/api/accounts/:id", async (req, res) => {
  const fields = {};
  for (const key of ["account_type", "status"]) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: "Nothing to update." });
  const { error } = await req.db.from("accounts").update(fields).eq("id", req.params.id);
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// Delete an account (admin).
app.delete("/api/accounts/:id", async (req, res) => {
  const { error } = await req.db.from("accounts").delete().eq("id", req.params.id);
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// ---------------- money actions (stored procedures) ----------------
app.post("/api/accounts/:id/deposit", async (req, res) => {
  const { amount, description } = req.body || {};
  const { error } = await req.db.rpc("deposit", {
    p_account_id: req.params.id,
    p_amount: amount,
    p_description: description || null,
  });
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

app.post("/api/accounts/:id/withdraw", async (req, res) => {
  const { amount, description } = req.body || {};
  const { error } = await req.db.rpc("withdraw", {
    p_account_id: req.params.id,
    p_amount: amount,
    p_description: description || null,
  });
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// POST /api/transfers  { from_account, to_account_number, amount, description }
app.post("/api/transfers", async (req, res) => {
  const { from_account, to_account_number, amount, description } = req.body || {};
  const { error } = await req.db.rpc("transfer_money", {
    p_from_account: from_account,
    p_to_account: to_account_number,
    p_amount: amount,
    p_description: description || null,
  });
  if (error) return res.status(400).json(cleanError(error));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
//  Static frontend
// ---------------------------------------------------------------------------
const PROJECT_ROOT = path.join(__dirname, "..");
app.use(express.static(PROJECT_ROOT));

// SPA fallback: unknown routes that are not /api end at the dashboard
// (the login page redirects if there is no session).
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(PROJECT_ROOT, "index.html"));
});

// 404 for unknown API routes.
app.use("/api", (req, res) => res.status(404).json({ error: "API route not found." }));

// Error handler.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Internal server error." });
});

app.listen(PORT, () => {
  console.log("SecureBank - Bank Management System is running.");
  console.log("  Local:   http://localhost:" + PORT);
  console.log("  Health:  http://localhost:" + PORT + "/api/health");
});