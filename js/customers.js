// ============================================================================
//  Customer management (admin only) - Add / View / Update / Delete / Search
//  ============================================================================

let customersData = [];
let accountsData = [];
let profilesData = [];

document.addEventListener("DOMContentLoaded", async () => {
    await requireAdmin();
    await renderShell("customers", "Customers");

    await loadCustomers();
    await loadProfiles();
});

async function loadCustomers() {
    document.getElementById("loading").innerHTML = `<div>Loading customers...</div>`;
    const { data, error } = await api("/api/customers?order=created_at&desc=true");
    if (error) { supabaseError(error); return; }
    customersData = data || [];

    const { data: accs } = await api("/api/accounts");
    accountsData = accs || [];

    renderCustomers();
}

async function loadProfiles() {
    const { data, error } = await api("/api/profiles");
    if (error) return;
    profilesData = data || [];
    populateUserSelect();
}

function profileLabel(userId) {
    const p = profilesData.find((x) => x.id === userId);
    if (!p) return "-";
    return `${p.name || p.email} <small class="muted">(${escapeHtml(p.email)})</small>`;
}

function accountCount(customerId) {
    return accountsData.filter((a) => a.customer_id === customerId).length;
}

function renderCustomers() {
    const search = (document.getElementById("searchInput").value || "").toLowerCase();
    const filtered = customersData.filter((c) =>
        `${c.first_name} ${c.last_name} ${c.email || ""} ${c.phone}`.toLowerCase().includes(search)
    );

    document.getElementById("countMeta").textContent = `${filtered.length} of ${customersData.length} customers`;
    const table = document.getElementById("customersTable");

    if (filtered.length === 0) {
        table.innerHTML = `<div class="table-empty">No customers found.</div>`;
        return;
    }

    table.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Customer</th><th>Email</th><th>Phone</th><th>Date of birth</th>
                    <th>Linked login</th><th>Accounts</th><th>Added</th><th style="text-align:right">Actions</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map((c) => `
                    <tr>
                        <td><b>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</b></td>
                        <td>${escapeHtml(c.email || "-")}</td>
                        <td>${escapeHtml(c.phone)}</td>
                        <td>${c.date_of_birth ? escapeHtml(formatDateOnly(c.date_of_birth)) : "-"}</td>
                        <td>${profileLabel(c.user_id)}</td>
                        <td><span class="badge savings">${accountCount(c.id)}</span></td>
                        <td class="muted">${formatDateOnly(c.created_at)}</td>
                        <td style="text-align:right; white-space:nowrap">
                            <button class="btn btn-ghost btn-sm" onclick="viewCustomer('${c.id}')">View</button>
                            <button class="btn btn-outline btn-sm" onclick="editCustomer('${c.id}')">Edit</button>
                            <button class="btn btn-danger btn-sm" onclick="askDeleteCustomer('${c.id}')">Delete</button>
                        </td>
                    </tr>`).join("")}
            </tbody>
        </table>`;
}

document.getElementById("searchInput").addEventListener("input", renderCustomers);

// ---------------- populate linked-login dropdown ----------------
function populateUserSelect() {
    const select = document.getElementById("cUserId");
    const linked = new Set(customersData.map((c) => c.user_id).filter(Boolean));
    const options = profilesData
        .filter((p) => p.role !== "admin")
        .map((p) => {
            const taken = linked.has(p.id) && select.value !== p.id;
            return `<option value="${p.id}" ${taken ? "disabled" : ""}>
                ${p.name || p.email} (${p.email})${taken ? " - already linked" : ""}
            </option>`;
        })
        .join("");
    select.innerHTML = `<option value="">-- None (no login) --</option>${options}`;
}

// ---------------- add / edit ----------------
function openCustomerModal(customerId) {
    document.getElementById("customerError").textContent = "";
    document.getElementById("customerModalTitle").textContent = customerId ? "Edit Customer" : "Add Customer";
    document.getElementById("saveCustomerBtn").textContent = customerId ? "Update customer" : "Save customer";

    if (customerId) {
        document.getElementById("saveCustomerBtn").dataset.id = customerId;
        const c = customersData.find((x) => x.id === customerId);
        document.getElementById("customerId").value = c.id;
        document.getElementById("cFirstName").value = c.first_name || "";
        document.getElementById("cLastName").value = c.last_name || "";
        document.getElementById("cEmail").value = c.email || "";
        document.getElementById("cPhone").value = c.phone || "";
        document.getElementById("cAddress").value = c.address || "";
        document.getElementById("cDob").value = c.date_of_birth || "";
        document.getElementById("cUserId").value = c.user_id || "";
    } else {
        document.getElementById("saveCustomerBtn").dataset.id = "";
        ["customerId", "cFirstName", "cLastName", "cEmail", "cPhone", "cAddress", "cDob", "cUserId"].forEach((id) => {
            document.getElementById(id).value = "";
        });
    }
    openModal("customerModal");
}

function editCustomer(id) { openCustomerModal(id); }

async function saveCustomer() {
    const errorEl = document.getElementById("customerError");
    errorEl.textContent = "";

    const firstName = document.getElementById("cFirstName").value.trim();
    const lastName = document.getElementById("cLastName").value.trim();
    const email = document.getElementById("cEmail").value.trim();
    const phone = document.getElementById("cPhone").value.trim();
    const address = document.getElementById("cAddress").value.trim();
    const dob = document.getElementById("cDob").value;
    const userId = document.getElementById("cUserId").value;
    const id = document.getElementById("customerId").value;

    if (!firstName) { errorEl.textContent = "First name is required."; return; }
    if (!/^\d{10}$/.test(phone)) { errorEl.textContent = "Phone number must be 10 digits."; return; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorEl.textContent = "Enter a valid email."; return; }

    const btn = document.getElementById("saveCustomerBtn");
    btn.disabled = true;

    if (id) {
        // --- UPDATE ---
        const { error } = await api("/api/customers/" + id, {
            method: "PATCH",
            body: { first_name: firstName, last_name: lastName, email: email || null, phone, address, date_of_birth: dob || null, user_id: userId || null },
        });
        btn.disabled = false;
        if (error) { errorEl.textContent = friendlyDbError(error); return; }
        toast("Customer updated.");
    } else {
        // --- INSERT (through the stored function) ---
        const { data, error } = await api("/api/customers", {
            method: "POST",
            body: {
                first_name: firstName,
                last_name: lastName,
                email: email || null,
                phone: phone,
                address: address,
                dob: dob || null,
                user_id: userId || null,
            },
        });
        btn.disabled = false;
        if (error) { errorEl.textContent = friendlyDbError(error); return; }
        toast("Customer added.");
    }

    closeModal("customerModal");
    await loadCustomers();
    await loadProfiles();
}

// ---------------- view ----------------
function viewCustomer(id) {
    const c = customersData.find((x) => x.id === id);
    const accDetails = accountsData.filter((a) => a.customer_id === id);

    document.getElementById("viewBody").innerHTML = `
        <div class="grid-2">
            <div class="form-group"><label>Name</label><div><b>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</b></div></div>
            <div class="form-group"><label>Email</label><div>${escapeHtml(c.email || "-")}</div></div>
            <div class="form-group"><label>Phone</label><div>${escapeHtml(c.phone)}</div></div>
            <div class="form-group"><label>Date of birth</label><div>${c.date_of_birth ? escapeHtml(formatDateOnly(c.date_of_birth)) : "-"}</div></div>
            <div class="form-group full"><label>Address</label><div>${escapeHtml(c.address || "-")}</div></div>
            <div class="form-group"><label>Linked login</label><div>${profileLabel(c.user_id)}</div></div>
            <div class="form-group"><label>Registered on</label><div>${formatDate(c.created_at)}</div></div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:8px 0"/>
        <h3 style="font-size:14px;margin:12px 0">Accounts (${accDetails.length})</h3>
        ${accDetails.length === 0
            ? `<div class="muted small">No accounts yet.</div>`
            : `<div class="table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Status</th></tr></thead>
                 <tbody>${accDetails.map((a) => `
                    <tr>
                        <td class="mono">${escapeHtml(a.account_number)}</td>
                        <td><span class="badge ${a.account_type}">${accountTypeLabel(a.account_type)}</span></td>
                        <td><b>${formatCurrency(a.balance)}</b></td>
                        <td><span class="badge ${a.status}">${escapeHtml(a.status)}</span></td>
                    </tr>`).join("")}
               </tbody></table></div>`}
    `;
    openModal("viewModal");
}

// ---------------- delete ----------------
let deletingCustomerId = null;

function askDeleteCustomer(id) {
    const c = customersData.find((x) => x.id === id);
    deletingCustomerId = id;
    document.getElementById("deleteName").textContent = `${c.first_name} ${c.last_name}`;
    document.getElementById("deleteError").textContent = "";
    openModal("deleteModal");
}

async function deleteCustomer() {
    const btn = document.getElementById("deleteBtn");
    btn.disabled = true;
    const { error } = await api("/api/customers/" + deletingCustomerId, { method: "DELETE" });
    btn.disabled = false;
    if (error) { document.getElementById("deleteError").textContent = friendlyDbError(error); return; }
    closeModal("deleteModal");
    toast("Customer deleted.");
    await loadCustomers();
    await loadProfiles();
}

// ---------------- helpers ----------------
function friendlyDbError(error) {
    const m = (error && error.message) || "Operation failed";
    if (m.includes("duplicate key")) return "A customer with this email already exists.";
    if (m.includes("already exists")) return "That email is already in use.";
    return m;
}