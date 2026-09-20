// ============================================================================
//  Account management (admin only) - Open / View / Update / Delete / Search
//  ============================================================================

let accountsData = [];
let customersData = [];

document.addEventListener("DOMContentLoaded", async () => {
    await requireAdmin();
    await renderShell("accounts", "Accounts");
    await Promise.all([loadAccounts(), loadCustomers()]);
});

async function loadAccounts() {
    const { data, error } = await api("/api/accounts?order=created_at&desc=true");
    if (error) { supabaseError(error); return; }
    accountsData = data || [];
    renderAccounts();
}

async function loadCustomers() {
    const { data } = await api("/api/customers?order=first_name&asc=true");
    customersData = data || [];
    const select = document.getElementById("aCustomer");
    select.innerHTML = customersData
        .map((c) => `<option value="${c.id}">${escapeHtml(`${c.first_name} ${c.last_name}`.trim())} (${escapeHtml(c.email || "no email")})</option>`)
        .join("") || `<option value="">-- No customers yet --</option>`;
}

function renderAccounts() {
    const search = (document.getElementById("searchInput").value || "").toLowerCase();
    const filtered = accountsData.filter((a) => {
        const name = `${a.customers ? a.customers.first_name + " " + a.customers.last_name : ""}`;
        return `${a.account_number} ${name} ${a.customer_id}`.toLowerCase().includes(search);
    });

    const totalBalance = filtered.reduce((s, a) => s + Number(a.balance), 0);
    document.getElementById("countMeta").textContent = `${filtered.length} accounts | Total ${formatCurrency(totalBalance)}`;
    const table = document.getElementById("accountsTable");

    if (filtered.length === 0) {
        table.innerHTML = `<div class="table-empty">No accounts found.</div>`;
        return;
    }

    table.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Account number</th><th>Customer</th><th>Type</th>
                    <th>Balance</th><th>Status</th><th>Opened</th><th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map((a) => `
                    <tr>
                        <td class="mono"><b>${escapeHtml(a.account_number)}</b></td>
                        <td>${escapeHtml(a.customers ? `${a.customers.first_name} ${a.customers.last_name}` : "Unknown")}</td>
                        <td><span class="badge ${a.account_type}">${accountTypeLabel(a.account_type)}</span></td>
                        <td><b>${formatCurrency(a.balance)}</b></td>
                        <td><span class="badge ${a.status}">${escapeHtml(a.status)}</span></td>
                        <td class="muted">${formatDateOnly(a.created_at)}</td>
                        <td style="text-align:right; white-space:nowrap">
                            <a class="btn btn-ghost btn-sm" href="transactions.html?account=${a.id}">Transactions</a>
                            <button class="btn btn-outline btn-sm" onclick="editAccount('${a.id}')">Edit</button>
                            <button class="btn btn-danger btn-sm" onclick="askDeleteAccount('${a.id}')">Delete</button>
                        </td>
                    </tr>`).join("")}
            </tbody>
        </table>`;
}

document.getElementById("searchInput").addEventListener("input", renderAccounts);

// ---------------- create / edit ----------------
function openAccountModal(id) {
    document.getElementById("accountError").textContent = "";

    if (id) {
        const a = accountsData.find((x) => x.id === id);
        document.getElementById("accountModalTitle").textContent = "Edit Account";
        document.getElementById("saveAccountBtn").textContent = "Update account";
        document.getElementById("accountId").value = id;
        document.getElementById("aCustomer").value = a.customer_id;
        document.getElementById("aCustomer").disabled = true;
        document.getElementById("aType").value = a.account_type;
        document.getElementById("aInitial").value = a.balance;
        document.getElementById("aInitial").disabled = true;
        document.getElementById("aStatus").value = a.status;
        document.getElementById("aInitial").parentElement.querySelector(".form-help").textContent =
            "Balance cannot be changed here - use Deposit / Withdraw.";
    } else {
        document.getElementById("accountModalTitle").textContent = "Open Account";
        document.getElementById("saveAccountBtn").textContent = "Save account";
        document.getElementById("accountId").value = "";
        document.getElementById("aCustomer").disabled = false;
        document.getElementById("aInitial").disabled = false;
        document.getElementById("aInitial").parentElement.querySelector(".form-help").textContent =
            "Optional amount credited when the account is opened.";
        document.getElementById("aInitial").value = "";
        document.getElementById("aType").value = "savings";
        document.getElementById("aStatus").value = "active";
    }
    openModal("accountModal");
}

function editAccount(id) { openAccountModal(id); }

async function saveAccount() {
    const errorEl = document.getElementById("accountError");
    errorEl.textContent = "";
    const id = document.getElementById("accountId").value;
    const customerId = document.getElementById("aCustomer").value;
    const type = document.getElementById("aType").value;
    const initial = parseFloat(document.getElementById("aInitial").value) || 0;
    const status = document.getElementById("aStatus").value;
    const btn = document.getElementById("saveAccountBtn");
    btn.disabled = true;

    if (id) {
        // --- UPDATE (type / status) ---
        const { error } = await api("/api/accounts/" + id, {
            method: "PATCH",
            body: { account_type: type, status },
        });
        btn.disabled = false;
        if (error) { errorEl.textContent = error.message; return; }
        toast("Account updated.");
    } else {
        // --- INSERT (through the stored function) ---
        if (!customerId) { btn.disabled = false; errorEl.textContent = "Please choose a customer."; return; }
        if (initial < 0) { btn.disabled = false; errorEl.textContent = "Initial deposit cannot be negative."; return; }

        const { error } = await api("/api/accounts", {
            method: "POST",
            body: { customer_id: customerId, account_type: type, initial_deposit: initial },
        });
        btn.disabled = false;
        if (error) { errorEl.textContent = error.message; return; }
        toast("Account opened successfully.");
    }

    closeModal("accountModal");
    await loadAccounts();
}

// ---------------- delete ----------------
let deletingAccountId = null;

function askDeleteAccount(id) {
    const a = accountsData.find((x) => x.id === id);
    deletingAccountId = id;
    document.getElementById("delAccNumber").textContent = a.account_number;
    document.getElementById("deleteError").textContent =
        Number(a.balance) > 0
            ? `Warning: this account still has ${formatCurrency(a.balance)}.`
            : "";
    openModal("deleteModal");
}

async function deleteAccount() {
    const btn = document.getElementById("deleteBtn");
    btn.disabled = true;
    const { error } = await api("/api/accounts/" + deletingAccountId, { method: "DELETE" });
    btn.disabled = false;
    if (error) { document.getElementById("deleteError").textContent = error.message; return; }
    closeModal("deleteModal");
    toast("Account deleted.");
    await loadAccounts();
}