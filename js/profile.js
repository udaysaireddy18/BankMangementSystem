// ============================================================================
//  Profile page - update display name, linked customer record & password
//  ============================================================================

let linkedCustomer = null;

document.addEventListener("DOMContentLoaded", async () => {
    await requireAuth();
    await renderShell("profile", "Profile");
    await initProfile();
});

async function initProfile() {
    const profile = currentProfile;
    if (!profile) return;

    const name = profile.name || profile.email || "User";
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

    document.getElementById("profileName").textContent = name;
    document.getElementById("profileEmail").textContent = profile.email;
    document.getElementById("profileRole").innerHTML =
        escapeHtml(profile.role) + (isAdmin() ? " <span class='muted small'>(full access)</span>" : "");
    document.getElementById("profileAvatar").textContent = escapeHtml(initials);
    document.getElementById("editName").value = name;

    await loadCustomerSection();
}

// ---------------- customer record ----------------
async function loadCustomerSection() {
    const container = document.getElementById("customerSection");
    const { data, error } = await api("/api/customers/mine");
    if (error) {
        container.innerHTML = `<div class="table-empty">${escapeHtml(error.message)}</div>`;
        return;
    }

    if (!data) {
        container.innerHTML = `
            <div class="table-empty">
                No customer record linked to your login.
                <div class="small mt-16">An admin can link your customer record.</div>
            </div>`;
        return;
    }

    linkedCustomer = data;
    const accounts = linkedCustomer.accounts || [];

    container.innerHTML = `
        <form id="customerForm" onsubmit="event.preventDefault(); updateCustomerRecord()">
            <div class="form-group">
                <label>First name</label>
                <input type="text" id="cFirstName" value="${escapeHtml(linkedCustomer.first_name)}" />
            </div>
            <div class="form-group">
                <label>Last name</label>
                <input type="text" id="cLastName" value="${escapeHtml(linkedCustomer.last_name)}" />
            </div>
            <div class="form-group">
                <label>Date of birth</label>
                <input type="date" id="cDob" value="${escapeHtml(linkedCustomer.date_of_birth || "")}" />
            </div>
            <div class="form-group">
                <label>Phone *</label>
                <input type="tel" id="cPhone" value="${escapeHtml(linkedCustomer.phone)}" />
            </div>
            <div class="form-group">
                <label>Address</label>
                <input type="text" id="cAddress" value="${escapeHtml(linkedCustomer.address || "")}" />
            </div>
            <div class="form-error" id="customerError"></div>
            <button class="btn btn-outline" type="submit">Save customer details</button>
        </form>
        <hr style="border:none;border-top:1px solid var(--border);margin:22px 0" />
        <h3 style="font-size:15px;margin-bottom:12px">My Accounts (${accounts.length})</h3>
        ${accounts.length === 0
            ? `<div class="muted small">No accounts yet.</div>`
            : `<div class="table-wrap"><table><thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Status</th></tr></thead>
                <tbody>${accounts.map((a) => `
                    <tr>
                        <td class="mono">${escapeHtml(a.account_number)}</td>
                        <td><span class="badge ${a.account_type}">${accountTypeLabel(a.account_type)}</span></td>
                        <td><b>${formatCurrency(a.balance)}</b></td>
                        <td><span class="badge ${a.status}">${escapeHtml(a.status)}</span></td>
                    </tr>`).join("")}
               </tbody></table></div>`}`;
}

async function updateCustomerRecord() {
    const errorEl = document.getElementById("customerError");
    errorEl.textContent = "";

    const firstName = document.getElementById("cFirstName").value.trim();
    const lastName = document.getElementById("cLastName").value.trim();
    const phone = document.getElementById("cPhone").value.trim();
    const address = document.getElementById("cAddress").value.trim();
    const dob = document.getElementById("cDob").value;

    if (!firstName) { errorEl.textContent = "First name is required."; return; }
    if (!/^\d{10}$/.test(phone)) { errorEl.textContent = "Phone number must be 10 digits."; return; }

    const { error } = await api("/api/customers/" + linkedCustomer.id, {
        method: "PATCH",
        body: { first_name: firstName, last_name: lastName, phone, address, date_of_birth: dob || null },
    });
    if (error) { errorEl.textContent = error.message; return; }

    toast("Customer details updated.");
    await loadCustomerSection();
}

// ---------------- update name ----------------
async function updateName() {
    const name = document.getElementById("editName").value.trim();
    const errorEl = document.getElementById("nameError");
    errorEl.textContent = "";

    if (!name) { errorEl.textContent = "Name cannot be empty."; return; }

    const { error } = await api("/api/profiles/me", {
        method: "PATCH",
        body: { name },
    });
    if (error) { errorEl.textContent = error.message; return; }

    toast("Name updated.");
    currentProfile.name = name;
    document.getElementById("profileName").textContent = name;
    document.getElementById("editName").value = name;
}

// ---------------- change password ----------------
async function changePassword() {
    const password = document.getElementById("newPassword").value;
    const confirm = document.getElementById("confirmPassword").value;
    const errorEl = document.getElementById("passwordError");
    errorEl.textContent = "";

    if (password.length < 6) { errorEl.textContent = "Password must be at least 6 characters."; return; }
    if (password !== confirm) { errorEl.textContent = "Passwords do not match."; return; }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) { errorEl.textContent = error.message; return; }

    toast("Password updated successfully.");
    document.getElementById("newPassword").value = "";
    document.getElementById("confirmPassword").value = "";
}