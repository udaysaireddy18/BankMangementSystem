// ============================================================================
//  API helper - talks to the backend (Express) instead of Supabase directly.
//
//  The backend validates the JWT, then acts as the logged-in user in Supabase,
//  so Row Level Security and the stored procedures keep enforcing permissions.
//  Every call returns { data, error } - the same shape as the Supabase SDK,
//  so the rest of the page code barely changes.
// ============================================================================

async function api(path, options = {}) {
    try {
        // Current Supabase access token (saved by the browser SDK on login).
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData && sessionData.session ? sessionData.session.access_token : null;

        const headers = Object.assign({}, options.headers || {});
        if (options.body !== undefined) headers["Content-Type"] = "application/json";
        if (token) headers["Authorization"] = "Bearer " + token;
       
        const API_URL = "https://bankmangementsystem.onrender.com";
          const res = await fetch(API_URL + path, Object.assign({}, options, {
            headers,
            body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        }));

        let body = null;
        if (res.status !== 204) {
            try { body = await res.json(); } catch (e) { body = null; }
        }

        if (!res.ok) {
            const message = (body && (body.error || body.message)) || "Request failed (" + res.status + ").";
            if (res.status === 401) {
                // Session expired or invalid - go back to login.
                window.location.href = "index.html";
                return { data: null, error: { message, status: res.status } };
            }
            return { data: null, error: { message, status: res.status } };
        }

        return { data: body, error: null };
    } catch (e) {
        return { data: null, error: { message: e.message || "Network error - is the backend running? (npm start)" } };
    }
}