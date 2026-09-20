// ============================================================================
//  Dashboard logic (different view for admin and customer)
//  ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
    await requireAuth();
    await renderShell("dashboard", "Dashboard");
    if (isAdmin()) await renderAdminDashboard();
    else await renderCustomerDashboard();
});

// ---------------- shared bits ----------------

function statCard(iconKey, label, value, sub, bgClass) {
    return `
        <div class="card stat-card">
            <div class="stat-icon ${bgClass}">${ICONS[iconKey]}</div>
            <div class="stat-label">${escapeHtml(label)}</div>
            <div class="stat-value">${value}</div>
            ${sub ? `<div class="stat-sub">${escapeHtml(sub)}</div>` : ""}
        </div>`;
}

function txnRow(txn) {
    const account = txn.accounts ? txn.accounts.account_number : "";
    const holder = txn.accounts && txn.accounts.customers
        ? `${txn.accounts.customers.first_name} ${txn.accounts.customers.last_name}`.trim()
        : "";
    const isDebit = txn.type === "withdrawal" || txn.type === "transfer_out";
    const signed = (isDebit ? -1 : 1) * Number(txn.amount);

    return `
        <tr>
            <td>${formatDate(txn.created_at)}</td>
            <td>${escapeHtml(account)}${holder ? `<div class="small muted">${escapeHtml(holder)}</div>` : ""}</td>
            <td><span class="badge ${txn.type}">${escapeHtml(txn.type.replace("_", " "))}</span></td>
            <td class="${isDebit ? "value-debit" : "value-credit"}">${signed > 0 ? "+" : "−"}${formatCurrency(Math.abs(signed))}</td>
            <td class="muted">${formatCurrency(txn.balance_after)}</td>
        </tr>`;
}

function renderTxnTable(rows, containerId, emptyText) {
    const el = document.getElementById(containerId);
    if (!rows || rows.length === 0) {
        el.innerHTML = `<div class="table-empty">${emptyText || "No transactions yet."}</div>`;
        return;
    }
    el.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Date</th><th>Account</th><th>Type</th><th>Amount</th><th>Balance</th>
                </tr>
            </thead>
            <tbody>${rows.map(txnRow).join("")}</tbody>
        </table>`;
}

function buildCashFlowChart(rows, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // build 7 day buckets (local dates)
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ key: localDateKey(d), label: d.toLocaleDateString("en-IN", { weekday: "short" }), dep: 0, wd: 0 });
    }
    const index = {};
    days.forEach((d, i) => (index[d.key] = i));

    (rows || []).forEach((t) => {
        const i = index[localDateKey(new Date(t.created_at))];
        if (i === undefined) return;
        if (t.type === "deposit" || t.type === "transfer_in") days[i].dep += Number(t.amount);
        else days[i].wd += Number(t.amount);
    });

    const max = Math.max(1, ...days.map((d) => Math.max(d.dep, d.wd)));
    el.innerHTML = `
        <div class="chart">
            ${days.map((d) => `
                <div class="bar-group">
                    <div class="bar dep" style="height:${Math.round((d.dep / max) * 100)}%" title="Deposits ${formatCurrency(d.dep)}"></div>
                    <div class="bar wd" style="height:${Math.round((d.wd / max) * 100)}%" title="Withdrawals ${formatCurrency(d.wd)}"></div>
                    <div class="bar-label">${d.label}</div>
                </div>`).join("")}
        </div>
        <div class="legend">
            <span style="color:#16a34a"><span style="background:#16a34a"></span>Deposits</span>
            <span style="color:#dc2626"><span style="background:#dc2626"></span>Withdrawals</span>
        </div>`;
}

function localDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function loadTxns(limit) {
    const { data, error } = await api("/api/transactions?limit=" + (limit || 10));
    if (error) supabaseError(error);
    return data || [];
}

// Total customers / accounts (admin dashboard) - fetched via the backend.
async function loadCounts() {
    const { data, error } = await api("/api/stats/counts");
    if (error) supabaseError(error);
    return data || { customers: 0, accounts: 0 };
}

// ---------------- ADMIN dashboard ----------------

async function renderAdminDashboard() {
    document.getElementById("quickActions").innerHTML = `
        <h2 style="font-size:20px;font-weight:800">Welcome back, ${escapeHtml((currentProfile.name || "Admin").split(" ")[0])}</h2>
        <div class="flex">
            <a class="btn" href="customers.html">${ICONS.plus} Add Customer</a>
            <a class="btn btn-outline" href="accounts.html">${ICONS.plus} Open Account</a>
            <a class="btn btn-outline" href="transfers.html">${ICONS.transfers} Transfer</a>
        </div>`;

    const [stats, txnsAll, recentTxns, recentCustomers, allAccounts] = await Promise.all([
        loadCounts(),
        loadTxns(200),
        loadTxns(8),
        api("/api/customers?order=created_at&desc=true&limit=5"),
        api("/api/accounts"),
    ]);

    // total balance = sum of latest balance of every account
    const totalBalance = (allAccounts.data || []).reduce((s, a) => s + Number(a.balance), 0);

    let todayDeposits = 0, todayWithdrawals = 0;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    for (const t of txnsAll) {
        if (new Date(t.created_at) < startOfDay) break;
        if (t.type === "deposit" || t.type === "transfer_in") todayDeposits += Number(t.amount);
        else todayWithdrawals += Number(t.amount);
    }

    document.getElementById("statsGrid").innerHTML = [
        statCard("users", "Total Customers", stats.customers || 0, "Registered in the bank", "bg-indigo"),
        statCard("wallet", "Total Accounts", stats.accounts || 0, "Savings / Current / FD", "bg-sky"),
        statCard("cashIn", "Total Deposits", formatCurrency(totalBalance), "Across all accounts", "bg-green"),
        statCard("withdraw", "Today's Activity", formatCurrency(todayDeposits + todayWithdrawals), `${formatCurrency(todayDeposits)} in, ${formatCurrency(todayWithdrawals)} out`, "bg-amber"),
    ].join("");

    renderTxnTable(recentTxns, "recentTransactions", "No transactions yet.");

    const recentCustomersEl = document.getElementById("recentCustomers");
    const customers = recentCustomers.data || [];
    if (customers.length === 0) {
        recentCustomersEl.innerHTML = `<div class="table-empty">No customers yet.</div>`;
    } else {
        recentCustomersEl.innerHTML = `
            <table>
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Added</th></tr></thead>
                <tbody>
                    ${customers.map((c) => `
                        <tr>
                            <td><b>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</b></td>
                            <td>${escapeHtml(c.email || "-")}</td>
                            <td>${escapeHtml(c.phone)}</td>
                            <td class="muted">${formatDateOnly(c.created_at)}</td>
                        </tr>`).join("")}
                </tbody>
            </table>`;
    }

    buildCashFlowChart(txnsAll, "miniChart");
}

// ---------------- CUSTOMER dashboard ----------------

async function renderCustomerDashboard() {
    const profile = currentProfile;

    const [customer, accounts, recentTxns] = await Promise.all([
        api("/api/customers/mine"),
        api("/api/accounts?order=created_at&asc=true"),
        loadTxns(8),
    ]);

    const cust = customer.data;
    const ownedAccounts = accounts.data || [];

    const totalBalance = ownedAccounts.reduce((s, a) => s + Number(a.balance), 0);
    const active = ownedAccounts.filter((a) => a.status === "active").length;

    document.getElementById("quickActions").innerHTML = `
        <h2 style="font-size:20px;font-weight:800">Welcome back, ${escapeHtml(cust ? cust.first_name : "User")}</h2>
        <div class="flex">
            <a class="btn" href="transfers.html">${ICONS.transfers} Transfer</a>
        </div>`;

    document.getElementById("statsGrid").innerHTML = [
        statCard("wallet", "Total Balance", formatCurrency(totalBalance), `${active} active account(s)`, "bg-indigo"),
        statCard("accounts", "Accounts", ownedAccounts.length, "Linked to your profile", "bg-sky"),
        statCard("cashIn", "Registered", formatDateOnly(cust ? cust.created_at : profile.created_at), "Since your first day", "bg-green"),
        statCard("profile", "Role", "Customer", "You can view your account activity", "bg-amber"),
    ].join("");

    // account cards
    const container = document.getElementById("customerAccounts");
    if (ownedAccounts.length === 0) {
        container.innerHTML = "";
    } else {
        container.innerHTML = `
            <div class="card-header" style="margin-top:4px">
                <div><h2>My Accounts</h2><div class="sub">Balances at a glance</div></div>
                <a class="btn btn-ghost btn-sm" href="transactions.html">View</a>
            </div>
            <div class="account-cards">
                ${ownedAccounts.map((a) => `
                    <div class="acct-card">
                        <div class="acct-type">${accountTypeLabel(a.account_type)} Account</div>
                        <div class="acct-number">${escapeHtml(a.account_number)}</div>
                        <div class="acct-balance">${formatCurrency(a.balance)}</div>
                        <div class="acct-status">Status: ${escapeHtml(a.status)}</div>
                    </div>`).join("")}
            </div>`;
    }

    renderTxnTable(recentTxns, "recentTransactions", "No transactions yet.");

    document.getElementById("recentCustomersCard").innerHTML = `
        <div class="card-header">
            <div><h2>My Profile</h2><div class="sub">Your bank details</div></div>
            <a class="btn btn-ghost btn-sm" href="profile.html">Edit</a>
        </div>
        <div id="myProfile"></div>`;
    document.getElementById("myProfile").innerHTML = `
        <table>
            <tbody>
                <tr><td class="muted">Full name</td><td><b>${escapeHtml(cust ? cust.first_name + " " + cust.last_name : profile.name)}</b></td></tr>
                <tr><td class="muted">Email</td><td>${escapeHtml(profile.email)}</td></tr>
                <tr><td class="muted">Phone</td><td>${escapeHtml(cust ? cust.phone : "-")}</td></tr>
                <tr><td class="muted">Address</td><td>${escapeHtml(cust && cust.address ? cust.address : "-")}</td></tr>
            </tbody>
        </table>`;

    buildCashFlowChart(recentTxns, "miniChart");
}