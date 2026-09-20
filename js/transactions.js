// ============================================================================
//  Transactions page - select an account, view history, deposit / withdraw
//  Works for both admins (all accounts) and customers (own accounts only).
//  ============================================================================

let accountsList = [];
let currentAccount = null;
let currentTransactions = [];
let actionMode = "deposit";

document.addEventListener("DOMContentLoaded", async () => {
    await requireAuth();
    await renderShell("transactions", "Transactions");
    // Deposit / Withdraw are admin-only; customers only view their history.
    if (!isAdmin()) {
        const actions = document.getElementById("accountActions");
        if (actions) actions.style.display = "none";
    }
    await loadAccounts();
});

async function loadAccounts() {
    const { data, error } = await api("/api/accounts?order=created_at&asc=true");
    if (error) { supabaseError(error); return; }
    accountsList = data || [];

    const select = document.getElementById("accountSelect");
    const previous = select.value;
    select.innerHTML = accountsList
        .map((a) => {
            const name = a.customers ? `${a.customers.first_name} ${a.customers.last_name}` : "";
            return `<option value="${a.id}">${a.account_number} - ${accountTypeLabel(a.account_type)}${name ? " - " + escapeHtml(name) : ""}</option>`;
        })
        .join("") || `<option value="">-- No accounts available --</option>`;

    if (previous) select.value = previous;

    // preselect from URL (?account=ID) if given
    const params = new URLSearchParams(window.location.search);
    const preselect = params.get("account");
    if (preselect && accountsList.some((a) => a.id === preselect)) {
        select.value = preselect;
    }

    select.addEventListener("change", onSelectAccount);
    if (accountsList.length > 0) onSelectAccount();
}

async function onSelectAccount() {
    const id = document.getElementById("accountSelect").value;
    currentAccount = accountsList.find((a) => a.id === id) || null;
    if (!currentAccount) return;

    document.getElementById("balanceDisplay").textContent = formatCurrency(currentAccount.balance);
    document.getElementById("accountMeta").textContent = `${currentAccount.account_number} | ${accountTypeLabel(currentAccount.account_type)} | ${currentAccount.status}`;
    document.getElementById("historyMeta").textContent = `Showing activity for ${currentAccount.account_number}`;

    const canOperate = currentAccount.status === "active";
    // (ownership is enforced server-side by the stored functions)
    document.getElementById("depositBtn").disabled = !canOperate;
    document.getElementById("withdrawBtn").disabled = !canOperate;

    await loadTransactions();
}

async function loadTransactions() {
    if (!currentAccount) return;
    document.getElementById("transactionsTable").innerHTML =
        `<div class="loading-row">Loading transactions...</div>`;

    const { data, error } = await api("/api/accounts/" + currentAccount.id + "/transactions?limit=100");
    if (error) { supabaseError(error); return; }
    currentTransactions = data || [];
    renderTransactions();
}

function renderTransactions() {
    const table = document.getElementById("transactionsTable");
    if (currentTransactions.length === 0) {
        table.innerHTML = `<div class="table-empty">No transactions for this account yet.</div>`;
        return;
    }

    table.innerHTML = `
        <table>
            <thead>
                <tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance after</th><th>Done by</th></tr>
            </thead>
            <tbody>
                ${currentTransactions.map((t) => {
                    const isDebit = t.type === "withdrawal" || t.type === "transfer_out";
                    const signed = (isDebit ? -1 : 1) * Number(t.amount);
                    const extra = t.to_account_id
                        ? `<div class="small muted">to ${shortAccount(t.to_account_id)}</div>` : "";
                    return `
                        <tr>
                            <td class="muted">${formatDate(t.created_at)}</td>
                            <td><span class="badge ${t.type}">${escapeHtml(t.type.replace("_", " "))}</span>${extra}</td>
                            <td>${escapeHtml(t.description || "-")}</td>
                            <td class="${isDebit ? "value-debit" : "value-credit"}">${signed > 0 ? "+" : "−"}${formatCurrency(Math.abs(signed))}</td>
                            <td>${formatCurrency(t.balance_after)}</td>
                            <td class="muted small">${escapeHtml(t.performed_by || "-")}</td>
                        </tr>`;
                }).join("")}
            </tbody>
        </table>`;
}

function shortAccount(accountId) {
    const a = accountsList.find((x) => x.id === accountId);
    return a ? a.account_number : accountId.slice(0, 8);
}

// ---------------- deposit / withdraw ----------------
function openActionModal(mode) {
    if (!currentAccount) return;
    if (!isAdmin()) return;
    actionMode = mode;
    document.getElementById("actionError").textContent = "";
    document.getElementById("actionTitle").textContent = mode === "deposit" ? "Deposit Money" : "Withdraw Money";
    document.getElementById("actionAccount").value =
        `${currentAccount.account_number} | ${formatCurrency(currentAccount.balance)}`;
    document.getElementById("actionAmount").value = "";
    document.getElementById("actionDescription").value = "";
    document.getElementById("actionSubmitBtn").textContent = mode === "deposit" ? "Deposit" : "Withdraw";
    document.getElementById("actionSubmitBtn").className = `btn ${mode === "deposit" ? "btn-success" : ""}`;
    openModal("actionModal");
}

async function submitAction() {
    const errorEl = document.getElementById("actionError");
    errorEl.textContent = "";
    const amount = parseFloat(document.getElementById("actionAmount").value);
    const description = document.getElementById("actionDescription").value.trim();

    if (!amount || amount <= 0) { errorEl.textContent = "Enter a valid amount greater than zero."; return; }

    if (actionMode === "withdraw" && Number(currentAccount.balance) < amount) {
        errorEl.textContent = `Insufficient balance. Available: ${formatCurrency(currentAccount.balance)}.`;
        return;
    }

    const btn = document.getElementById("actionSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Processing...";

    const fn = actionMode === "deposit" ? "deposit" : "withdraw";
    const { error } = await api("/api/accounts/" + currentAccount.id + "/" + fn, {
        method: "POST",
        body: {
            amount: amount,
            description: description || null,
        },
    });
    btn.disabled = false;
    btn.textContent = actionMode === "deposit" ? "Deposit" : "Withdraw";

    if (error) {
        errorEl.textContent = error.message;
        return;
    }

    closeModal("actionModal");
    toast(actionMode === "deposit" ? "Deposit successful." : "Withdrawal successful.");
    await refreshAfterAction();
}

// refresh account balance + list
async function refreshAfterAction() {
    await loadAccounts();
}