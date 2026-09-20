// ============================================================================
//  Authentication helpers (built on top of Supabase Auth)
//  ============================================================================

// Returns the logged-in user object or null
async function getCurrentUser() {
    const { data } = await supabase.auth.getUser();
    return data.user;
}

async function getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
}

// Loads the profile row of the logged-in user into window.currentProfile
let currentProfile = null;

async function loadProfile() {
    const user = await getCurrentUser();
    if (!user) return null;

    let { data: profile, error } = await api("/api/profiles/" + user.id);

    // Safety net: if the DB trigger was not created, create a minimal
    // profile row here (allowed by RLS for your own row) so the app still works.
    if (!profile && !error) {
        await supabase.from("profiles").upsert({
            id: user.id,
            email: user.email,
            name: (user.user_metadata && user.user_metadata.name) || splitAt(user.email, "@"),
            role: "customer",
        }, { onConflict: "id", ignoreDuplicates: true });
        const r = await api("/api/profiles/" + user.id);
        profile = r.data;
    }

    currentProfile = profile;
    return profile;
}

function splitAt(value, sep) {
    if (!value) return "User";
    return String(value).split(sep)[0];
}

function isAdmin() {
    return !!(currentProfile && currentProfile.role === "admin");
}

// Redirect to the login page if there is no session
async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = "index.html";
        return null;
    }
    return user;
}

// Redirect non-admins away from admin-only pages
async function requireAdmin() {
    const user = await requireAuth();
    if (!user) return null;
    await loadProfile();
    if (!isAdmin()) {
        window.location.href = "dashboard.html";
        return null;
    }
    return user;
}

async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "index.html";
}