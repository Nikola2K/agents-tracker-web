// Everything that talks to Supabase lives in this file. The rest of the site only calls these
// functions, and api-demo.js offers the same functions with made-up data for demo mode.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY, LOGIN_DOMAIN } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const SPRITE_BUCKET = "sprites";

export const isDemo = false;

// ------------------------------------------------------------------------- helpers

function friendly(error) {
  const message = (error && error.message) || String(error);
  if (/invalid login credentials/i.test(message)) return "Wrong username or password.";
  if (/row-level security/i.test(message)) return "You are not allowed to change this.";
  if (/failed to fetch|networkerror|load failed/i.test(message)) return "Could not reach the server. Check your connection and try again.";
  if (error && error.code === "23505") return "That already exists.";
  if (/same.*password|different from the old/i.test(message)) return "The new password must be different from the current one.";
  return message;
}

/** Unwraps a Supabase result or throws a readable error. */
function ok({ data, error }) {
  if (error) throw new Error(friendly(error));
  return data;
}

/** For changes: the database rules silently skip rows you may not touch, so check something changed. */
function changed(result) {
  const rows = ok(result);
  if (!rows || rows.length === 0) throw new Error("You are not allowed to change this.");
  return rows;
}

function toEmail(username) {
  const name = username.trim().toLowerCase();
  return name.includes("@") ? name : `${name}@${LOGIN_DOMAIN}`;
}

// ---------------------------------------------------------------------------- login

export async function currentUserId() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user.id : null;
}

export function onSignedOut(callback) {
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") callback(); });
}

export async function signIn(username, password) {
  ok(await sb.auth.signInWithPassword({ email: toEmail(username), password }));
}

export async function signOut() {
  await sb.auth.signOut();
}

export async function changePassword(currentPassword, newPassword) {
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("You are not logged in.");
  const check = await sb.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
  if (check.error) throw new Error("The current password is wrong.");
  ok(await sb.auth.updateUser({ password: newPassword }));
}

// --------------------------------------------------------------------------- reading

/** Everything shared by all agents: who exists, the skill template, the item catalogue. */
export async function loadBase() {
  const [profiles, skills, items] = await Promise.all([
    sb.from("profiles").select("*").order("display_name"),
    sb.from("skills").select("*").order("sort").order("name"),
    sb.from("items").select("*").order("sort").order("name"),
  ]);
  return { profiles: ok(profiles), skills: ok(skills), items: ok(items) };
}

/** One agent's details. Feedback only comes back for yourself, or for anyone when you are an admin. */
export async function loadAgent(agentId) {
  const [skills, traits, paths, actions, feedback, unlocks] = await Promise.all([
    sb.from("agent_skills").select("*").eq("agent_id", agentId),
    sb.from("traits").select("*").eq("agent_id", agentId).order("created_at"),
    sb.from("agent_paths").select("*").eq("agent_id", agentId).order("sort").order("created_at"),
    sb.from("dev_actions").select("*").eq("agent_id", agentId).order("happened_at", { ascending: false }),
    sb.from("action_feedback").select("*").eq("agent_id", agentId),
    sb.from("agent_unlocks").select("item_id").eq("agent_id", agentId),
  ]);
  return {
    skills: ok(skills),
    traits: ok(traits),
    paths: ok(paths),
    actions: ok(actions),
    feedback: Object.fromEntries(ok(feedback).map((f) => [f.action_id, f.feedback])),
    unlocks: ok(unlocks).map((u) => u.item_id),
  };
}

export function spriteUrl(path) {
  return sb.storage.from(SPRITE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// --------------------------------------------------------------------------- writing

export async function updateProfile(agentId, changes) {
  changed(await sb.from("profiles").update(changes).eq("id", agentId).select());
}

/** changes: [{ skill_id, passion?, level? }] - agents may only send passion. */
export async function saveAgentSkills(agentId, changes) {
  await Promise.all(changes.map(async ({ skill_id, ...values }) => {
    changed(await sb.from("agent_skills").update(values).eq("agent_id", agentId).eq("skill_id", skill_id).select());
  }));
}

/** Applies a list-editor result to "traits", "agent_paths" or "skills". extra is added to new rows. */
export async function saveRows(table, { inserts, updates, deletes }, extra = {}) {
  if (deletes.length) changed(await sb.from(table).delete().in("id", deletes).select());
  for (const { id, ...values } of updates) {
    changed(await sb.from(table).update(values).eq("id", id).select());
  }
  if (inserts.length) ok(await sb.from(table).insert(inserts.map((row) => ({ ...row, ...extra }))));
}

/** Creates or updates an action together with its feedback text. */
export async function saveAction(agentId, action, feedback) {
  const { id, ...values } = action;
  let actionId = id;
  if (id) {
    changed(await sb.from("dev_actions").update(values).eq("id", id).select());
  } else {
    actionId = ok(await sb.from("dev_actions").insert({ ...values, agent_id: agentId }).select().single()).id;
  }
  ok(await sb.from("action_feedback").upsert({ action_id: actionId, agent_id: agentId, feedback }));
}

export async function deleteAction(actionId) {
  changed(await sb.from("dev_actions").delete().eq("id", actionId).select());
}

export async function unlockItem(agentId, itemId) {
  const { error } = await sb.from("agent_unlocks").insert({ agent_id: agentId, item_id: itemId });
  if (error && error.code !== "23505") throw new Error(friendly(error)); // 23505 = already unlocked
}

export async function lockItem(agentId, itemId) {
  changed(await sb.from("agent_unlocks").delete().eq("agent_id", agentId).eq("item_id", itemId).select());
}

// ------------------------------------------------------------------- item catalogue

/** options: { isNew, file (a PNG chosen by the admin, optional), removeSprite, oldPath } */
export async function saveItem(item, { isNew, file, removeSprite, oldPath }) {
  const record = { ...item };
  if (file) {
    const extension = file.type === "image/webp" ? "webp" : "png";
    // A fresh file name each time, so browsers never show a stale cached picture.
    const path = `${record.kind}/${record.id}-${Date.now()}.${extension}`;
    ok(await sb.storage.from(SPRITE_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" }));
    record.sprite_path = path;
  } else if (removeSprite) {
    record.sprite_path = null;
  }

  if (isNew) {
    ok(await sb.from("items").insert(record));
  } else {
    const { id, ...values } = record;
    changed(await sb.from("items").update(values).eq("id", id).select());
  }

  // Tidy up the picture that is no longer used. Not critical if it fails.
  if (oldPath && oldPath !== record.sprite_path) {
    await sb.storage.from(SPRITE_BUCKET).remove([oldPath]).catch(() => {});
  }
}

export async function deleteItem(item) {
  changed(await sb.from("items").delete().eq("id", item.id).select());
  if (item.sprite_path) await sb.storage.from(SPRITE_BUCKET).remove([item.sprite_path]).catch(() => {});
}

// ------------------------------------------------- admin: logins (via the Edge Function)

async function adminCall(body) {
  const { data, error } = await sb.functions.invoke("admin-users", { body });
  if (error) {
    let message = friendly(error);
    try {
      const details = await error.context.json();
      if (details && details.error) message = details.error;
    } catch (_) { /* the function did not send details */ }
    throw new Error(message);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

/** Returns { userId: username } for every login. Admins only. */
export async function listLogins() {
  const { users } = await adminCall({ action: "list" });
  const ending = "@" + LOGIN_DOMAIN;
  return Object.fromEntries(users.map((u) => [u.id, u.email.endsWith(ending) ? u.email.slice(0, -ending.length) : u.email]));
}

export async function createAgent({ username, password, display_name, role, title }) {
  return adminCall({ action: "create", email: toEmail(username), password, display_name, role, title });
}

export async function resetPassword(userId, password) {
  return adminCall({ action: "reset_password", user_id: userId, password });
}

export async function deleteAgent(userId) {
  return adminCall({ action: "delete", user_id: userId });
}
