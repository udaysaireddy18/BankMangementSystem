// ============================================================================
//  Login / Register page logic
//  ============================================================================

// If already logged in, go straight to the dashboard
getCurrentUser().then((user) => {
    if (user) window.location.href = "dashboard.html";
});

function switchTab(name) {
    const isLogin = name === "login";
    document.getElementById("tabLogin").classList.toggle("active", isLogin);
    document.getElementById("tabRegister").classList.toggle("active", !isLogin);
    document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
    document.getElementById("registerForm").classList.toggle("hidden", isLogin);
    document.getElementById("loginError").textContent = "";
    document.getElementById("registerError").textContent = "";
}

// ---------------- LOGIN ----------------
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("loginError");
    errorEl.textContent = "";

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        errorEl.textContent = "Please enter both email and password.";
        return;
    }

    const btn = document.getElementById("loginBtn");
    btn.disabled = true;
    btn.textContent = "Signing in...";

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = "Sign in";

    if (error) {
        errorEl.textContent = mapAuthError(error.message);
        return;
    }
    toast("Welcome back!");
    setTimeout(() => (window.location.href = "dashboard.html"), 600);
});

// ---------------- REGISTER ----------------
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("registerError");
    errorEl.textContent = "";

    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const phone = document.getElementById("regPhone").value.trim();
    const address = document.getElementById("regAddress").value.trim();
    const password = document.getElementById("regPassword").value;
    const confirm = document.getElementById("regConfirm").value;

    // ---- basic validation ----
    if (!name.trim()) {
        errorEl.textContent = "Please enter your full name.";
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorEl.textContent = "Please enter a valid email address.";
        return;
    }
    if (!/^\d{10}$/.test(phone)) {
        errorEl.textContent = "Phone number must be 10 digits.";
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = "Password must be at least 6 characters.";
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = "Passwords do not match.";
        return;
    }

    const btn = document.getElementById("registerBtn");
    btn.disabled = true;
    btn.textContent = "Creating account...";

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { name, phone, address },
        },
    });
    btn.disabled = false;
    btn.textContent = "Create account";

    if (error) {
        errorEl.textContent = mapAuthError(error.message);
        return;
    }

    // If email confirmation is turned ON, no session is returned yet.
    if (data.session) {
        toast("Account created! Signing you in...");
        setTimeout(() => (window.location.href = "dashboard.html"), 900);
    } else {
        toast("Account created! Confirm your email to sign in.", "info");
        switchTab("login");
        document.getElementById("loginEmail").value = email;
    }
});

// Make auth errors human-readable
function mapAuthError(message) {
    const m = message.toLowerCase();
    if (m.includes("invalid login")) return "Invalid email or password.";
    if (m.includes("already registered")) return "An account with this email already exists.";
    if (m.includes("email not confirmed")) return "Please confirm your email first (check your inbox).";
    if (m.includes("password should be")) return "Password must be at least 6 characters.";
    return message;
}