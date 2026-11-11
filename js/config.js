// ---------------------------------------------------------------------------------------
// The only file you need to edit to connect the website to your Supabase project.
//
// Both values are in the Supabase dashboard: Settings > API Keys (or the "Connect" button).
// They are safe to publish: the publishable key only lets people try to log in, and the
// database rules decide what a logged-in person may see or change.
//
// NEVER put a secret key (sb_secret_...) or the service_role key in this file.
// ---------------------------------------------------------------------------------------

// Looks like: "https://abcdefghijklmnop.supabase.co"
export const SUPABASE_URL = "https://ccdxigcfzgypbfbqjsdk.supabase.co";

// Looks like: "sb_publishable_..."   (on older projects: the long "anon" key)
export const SUPABASE_KEY = "sb_publishable_WzCIm-RUOrzpONpGjgxSjg_FlSJcKmD";

// Supabase logins are technically e-mail addresses. Agents only ever type a username;
// the site quietly adds this ending to it. No e-mail is ever sent to these addresses.
// Pick it once and do not change it after the first login has been created.
export const LOGIN_DOMAIN = "agents.internal";

// While SUPABASE_URL is empty the site runs in demo mode with made-up data that is not saved.
