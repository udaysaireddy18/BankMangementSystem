// ============================================================================
//  Transfer Money page - move funds from one account to another.
//  Both admins and customers can use it (customers only from their own
//  accounts, which is enforced server-side by RLS + the stored function).
//  ============================================================================

let accountsList = [];
let fromAccount = null;

document.addEventListener("DOMContentLoaded", async () => {
    await requireAuth();
    await renderShell("transfers", "Transfers");
    await loadAccounts();
});

async function loadAccounts() {
    const { data, error } = await api("/api/accounts?order=created_at&asc=true");
    if (error) { supabaseError(error); return; }
    accountsList = data || [];

    const select = document.getElementById("fromAccount");
    const previous = select.value;
    select.innerHTML = accountsList
        .map((a) => {
            const name = a.customers ? `${a.customers.first_name} ${a.customers.last_name}` : "";
            return `<option value="${a.id}">${a.account_number} - ${accountTypeLabel(a.account_type)}${name ? " - " + escapeHtml(name) : ""}</option>`;
        })
        .join("") || `<option value="">-- No accounts available --</option>`;

    if (previous) select.value = previous;
    select.addEventListener("change", onFromChange);
    if (accountsList.length > 0) onFromChange();
}

function onFromChange() {
    const id = document.getElementById("fromAccount").value;
    fromAccount = accountsList.find((a) => a.id === id) || null;
    document.getElementById("fromBalance").textContent = fromAccount ? formatCurrency(fromAccount.balance) : "-";
    document.getElementById("transferError").textContent = "";
    loadRecentTransfers();
}

async function loadRecentTransfers() {
    if (!fromAccount) return;
    document.getElementById("recentMeta").textContent = `Latest transfers for ${fromAccount.account_number}`;
    const container = document.getElementById("recentTransfers");
    container.innerHTML = `<div class="loading-row">Loading...</div>`;

    const { data, error } = await api("/api/accounts/" + fromAccount.id + "/transactions?types=transfer_in,transfer_out&limit=20");
    if (error) { supabaseError(error); return; }

    const rows = data || [];
    if (rows.length === 0) {
        container.innerHTML = `<div class="table-empty">No transfers yet for this account.</div>`;
        return;
    }

    container.innerHTML = `
        <table>
            <thead><tr><th>Date</th><th>Direction</th><th>Amount</th><th>Remarks</th></tr></thead>
            <tbody>
                ${rows.map((t) => {
                    const out = t.type === "transfer_out";
                    return `
                        <tr>
                            <td class="muted">${formatDate(t.created_at)}</td>
                            <td><span class="badge ${t.type}">${out ? "Sent" : "Received"}</span></td>
                            <td class="${out ? "value-debit" : "value-credit"}">${out ? "−" : "+"}${formatCurrency(t.amount)}</td>
                            <td class="muted small">${escapeHtml(t.description || "-")}</td>
                        </tr>`;
                }).join("")}
            </tbody>
        </table>`;
}

// ---------------- verify target account ----------------
async function verifyTarget() {
    document.getElementById("transferError").textContent = "";
    const number = document.getElementById("toAccountNumber").value.trim().toUpperCase();
    if (!number) return;

    // Admins can see all accounts; customers cannot see other people's
    // accounts (RLS), so for customers this just says "not visible to you".
    // The stored function validates the account on transfer regardless.
    const { data, error } = await api("/api/accounts/by-number/" + encodeURIComponent(number));
    if (error) { supabaseError(error); return; }

    const info = document.getElementById("toAccountInfo");
    if (data) {
        const holder = data.customers ? `${data.customers.first_name} ${data.customers.last_name}` : "";
        info.textContent = `Found: ${data.account_number} - ${accountTypeLabel(data.account_type)}${holder ? " (" + holder + ")" : ""} - balance ${formatCurrency(data.balance)}`;
    } else {
        info.textContent = isAdmin()
            ? "Account not found. Check the account number."
            : "Account not visible to you (that is normal). The bank server will validate it when you transfer.";
    }
}

// ---------------- submit transfer ----------------
async function submitTransfer() {
    const errorEl = document.getElementById("transferError");
    errorEl.textContent = "";

    if (!fromAccount) { errorEl.textContent = "Please select the sender account."; return; }

    const toNumber = document.getElementById("toAccountNumber").value.trim().toUpperCase();
    const amount = parseFloat(document.getElementById("transferAmount").value);
    const remarks = document.getElementById("transferRemarks").value.trim();

    if (!toNumber) { errorEl.textContent = "Enter the receiver's account number."; return; }
    if (toNumber === fromAccount.account_number) { errorEl.textContent = "Cannot transfer to the same account."; return; }
    if (!amount || amount <= 0) { errorEl.textContent = "Enter a valid amount greater than zero."; return; }
    if (Number(fromAccount.balance) < amount) {
        errorEl.textContent = `Insufficient balance. Available: ${formatCurrency(fromAccount.balance)}.`;
        return;
    }

    const btn = document.getElementById("transferBtn");
    btn.disabled = true;
    btn.textContent = "Transferring...";

    const { error } = await api("/api/transfers", {
        method: "POST",
        body: {
            from_account: fromAccount.id,
            to_account_number: toNumber,
            amount: amount,
            description: remarks || null,
        },
    });

    btn.disabled = false;
    btn.textContent = "Transfer Money";

    if (error) {
        errorEl.textContent = error.message;
        return;
    }

    toast("Transfer successful!");
    document.getElementById("transferAmount").value = "";
    document.getElementById("toAccountNumber").value = "";
    document.getElementById("transferRemarks").value = "";
    await loadAccounts();
}