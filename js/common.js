// ============================================================================
//  Shared UI helpers + app shell renderer
//  ============================================================================

// ---------------- formatting helpers ----------------
function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}

function formatCurrency(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
}

function formatDate(d) {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateOnly(d) {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function accountTypeLabel(t) {
    return {
        savings: "Savings",
        current: "Current",
        fixed_deposit: "Fixed Deposit",
    }[t] || t;
}

// ---------------- toasts ----------------
function toast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${escapeHtml(message)}</span>
        <button class="close" onclick="this.parentElement.remove()">&times;</button>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4500);
}

// ---------------- modals ----------------
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("open");
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("open");
}
function openModalIfEscaped(e) {
    if (e.target && e.target.classList.contains("modal-overlay")) {
        e.target.classList.remove("open");
    }
}

// ---------------- icons (inline SVG) ----------------
const ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 5"/></svg>',
    accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
    transactions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h13"/><path d="M7 9l3-3-3-3"/><path d="M21 18H8"/><path d="M17 15l-3 3 3 3"/></svg>',
    transfers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4v13"/><path d="M4 11l3-3 3 3"/><path d="M17 20V7"/><path d="M14 13l3 3 3-3"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0 1 16 0"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M17 8l2 2 4-4"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><path d="M18 15h.01"/></svg>',
    cashIn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="M8 11l4 4 4-4"/><path d="M3 20h18"/></svg>',
    withdraw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M3 20h18"/></svg>',
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><path d="M6 15h3"/></svg>',
};

// ---------------- app shell ----------------
// Renders the sidebar + topbar. Every page has <div id="sidebar-root"></div>
// and <div id="topbar-root"></div>.
async function renderShell(activePage, pageTitle) {
    await loadProfile();
    const profile = currentProfile;

    const navItems = [
        { page: "dashboard",    label: "Dashboard",     href: "dashboard.html",    icon: "dashboard" },
        { page: "customers",    label: "Customers",     href: "customers.html",    icon: "customers", adminOnly: true },
        { page: "accounts",     label: "Accounts",      href: "accounts.html",     icon: "accounts",  adminOnly: true },
        { page: "transactions", label: "Transactions",  href: "transactions.html", icon: "transactions" },
        { page: "transfers",    label: "Transfers",     href: "transfers.html",    icon: "transfers" },
        { page: "profile",      label: "Profile",       href: "profile.html",      icon: "profile" },
    ];

    const visible = navItems.filter((item) => !item.adminOnly || isAdmin());
    const navHTML = visible
        .map((item) => `
            <a href="${item.href}" class="nav-link ${item.page === activePage ? "active" : ""}" data-page="${item.page}">
                ${ICONS[item.icon]}
                <span>${item.label}</span>
            </a>`)
        .join("");

    const name = profile ? (profile.name || profile.email || "User") : "User";
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    const role = profile ? profile.role : "customer";

    const sidebarRoot = document.getElementById("sidebar-root");
    if (sidebarRoot) {
        sidebarRoot.innerHTML = `
            <aside class="sidebar" id="sidebar">
                <div class="brand">
                    <div class="brand-badge">${ICONS.logo}</div>
                    <div>
                        <div class="brand-name">SecureBank</div>
                        <div class="brand-sub">Management System</div>
                    </div>
                </div>
                <nav>
                    <div class="nav-section">Main Menu</div>
                    ${navHTML}
                </nav>
                <div class="sidebar-footer">
                    <div class="avatar">${escapeHtml(initials)}</div>
                    <div class="user-mini" style="flex:1">
                        <b>${escapeHtml(name)}</b>
                        <small>${role}</small>
                    </div>
                    <button class="btn btn-outline btn-sm" style="background:transparent;color:#fff;border-color:rgba(255,255,255,.3)" onclick="signOut()">Logout</button>
                </div>
            </aside>
        `;
    }

    const topbarRoot = document.getElementById("topbar-root");
    if (topbarRoot) {
        topbarRoot.innerHTML = `
            <header class="topbar">
                <button class="menu-btn" onclick="document.getElementById('sidebar').classList.add('open');document.getElementById('backdrop').classList.add('open')">${ICONS.menu}</button>
                <div class="page-title">${escapeHtml(pageTitle)}</div>
                <div class="topbar-spacer"></div>
                <span class="role-chip ${role === "admin" ? "admin" : ""}">${role}</span>
            </header>
        `;
    }

    const backdrop = document.getElementById("backdrop");
    if (backdrop) {
        backdrop.onclick = () => {
            backdrop.classList.remove("open");
            const sidebar = document.getElementById("sidebar");
            if (sidebar) sidebar.classList.remove("open");
        };
    }

    if (profile) {
        document.title = `${pageTitle} | SecureBank`;
    }
}

// Small helper for a common error handler
function supabaseError(error) {
    const msg = (error && error.message) || "Something went wrong";
    toast(msg, "error");
    console.error(error);
}