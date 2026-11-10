// Agents Development Tracker - "admin-users" Edge Function
//
// The website cannot create logins by itself (that needs the project's secret key, which must
// never be in a browser). This small server function does it instead. Every request must come
// from a logged-in user whose profile role is "admin"; anyone else gets "Admins only".
//
// Deploy: Supabase Dashboard > Edge Functions > Deploy a new function > Via Editor,
// name it exactly  admin-users , paste this whole file, Deploy. No secrets need to be added.
//
// Actions (JSON body):
//   { action: "list" }                                              -> { users: [{ id, email }] }
//   { action: "create", email, password, display_name, role, title } -> { id }
//   { action: "reset_password", user_id, password }                 -> { ok: true }
//   { action: "delete", user_id }                                   -> { ok: true }

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_PASSWORD_LENGTH = 6;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The key that bypasses row level security. Supabase provides it to every Edge Function:
// new projects as SUPABASE_SECRET_KEYS (a JSON dictionary), older ones as SUPABASE_SERVICE_ROLE_KEY.
function adminKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      const key = keys["default"] ?? Object.values(keys)[0];
      if (key) return key;
    } catch (_) {
      // fall through to the legacy key
    }
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = adminKey();
  if (!url || !key) return json({ error: "The function cannot find the project keys." }, 500);

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Who is calling? The website sends the logged-in user's token.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not logged in." }, 401);
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return json({ error: "Not logged in." }, 401);

  // 2. Are they an admin?
  const { data: profile, error: profileError } = await admin
    .from("profiles").select("role").eq("id", caller.user.id).maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);
  if (profile?.role !== "admin") return json({ error: "Admins only." }, 403);

  // 3. Do what was asked.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "The request body must be JSON." }, 400);
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  switch (body.action) {
    case "list": {
      const users: { id: string; email: string }[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: error.message }, 500);
        for (const u of data.users) users.push({ id: u.id, email: u.email ?? "" });
        if (data.users.length < 200) break;
      }
      return json({ users });
    }

    case "create": {
      const email = text(body.email).toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      const displayName = text(body.display_name);
      const role = body.role === "admin" ? "admin" : "agent";
      const title = text(body.title);
      if (!email || !email.includes("@")) return json({ error: "A username is required." }, 400);
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
      }
      if (!displayName) return json({ error: "A display name is required." }, 400);

      // The database creates the profile and skill rows by itself when the login is created.
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });
      if (error || !data?.user) {
        const taken = /already/i.test(error?.message ?? "");
        return json({ error: taken ? "That username is already taken." : (error?.message ?? "Could not create the login.") }, 400);
      }

      const changes: Record<string, string> = { role };
      if (title) changes.title = title.slice(0, 60);
      const { error: updateError } = await admin.from("profiles").update(changes).eq("id", data.user.id);
      if (updateError) {
        // Do not leave a half-made agent behind.
        await admin.auth.admin.deleteUser(data.user.id);
        return json({ error: updateError.message }, 500);
      }
      return json({ id: data.user.id });
    }

    case "reset_password": {
      const userId = text(body.user_id);
      const password = typeof body.password === "string" ? body.password : "";
      if (!userId) return json({ error: "Missing user." }, 400);
      if (password.length < MIN_PASSWORD_LENGTH) {
        return json({ error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    case "delete": {
      const userId = text(body.user_id);
      if (!userId) return json({ error: "Missing user." }, 400);
      if (userId === caller.user.id) return json({ error: "You cannot delete your own login." }, 400);
      // Deleting the login removes the profile and everything attached to it.
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action." }, 400);
  }
});
