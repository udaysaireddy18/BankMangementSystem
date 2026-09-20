// ============================================================================
//  Supabase configuration
//  ============================================================================
//  Where to find your values:
//  Supabase Dashboard -> your project -> Project Settings -> API
//
//  URL     : the "Project URL"       e.g. https://abcdefgh.supabase.co
//  anon key: the "anon" public key
//
//  Paste both between the quotes below and save.
// ============================================================================

const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

// NOTE: the UMD SDK already declares a global `supabase` (the SDK namespace),
// so we must NOT use `const supabase = ...` here - that throws
// "Identifier 'supabase' has already been declared" and breaks the app.
// Assigning onto window replaces the namespace with the ready-to-use client.
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);