// Demo mode: the same functions as api.js, but with made-up data kept in memory.
// Used while js/config.js has no Supabase URL yet, or when the address ends in ?demo=admin or
// ?demo=agent. Nothing is saved; reloading the page resets everything.
// The real permission rules live in the database, so demo mode does not enforce them.

export const isDemo = true;

const ADMIN = "00000000-0000-4000-8000-000000000001";
const AGENT = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";

const demoRole = new URLSearchParams(location.search).get("demo") === "agent" ? "agent" : "admin";
const meId = demoRole === "agent" ? AGENT : ADMIN;

let counter = 100;
const newId = () => `demo-${++counter}`;
const copy = (value) => JSON.parse(JSON.stringify(value));

const item = (id, kind, name, byDefault, description, color, width, sort) => ({
  id, kind, name, sprite_path: null, unlocked_by_default: byDefault, unlock_description: description,
  placeholder_color: color, placeholder_width: width, sort,
});

const db = {
  profiles: [
    { id: ADMIN, display_name: "Team Lead", role: "admin", title: "Admin", body_id: null, shirt_id: null, hat_id: null },
    { id: AGENT, display_name: "Agent One", role: "agent", title: "Agent", body_id: null, shirt_id: "shirt_mock_1", hat_id: null },
    { id: OTHER, display_name: "Agent Two", role: "agent", title: "Agent", body_id: "body_hulk", shirt_id: null, hat_id: null },
  ],
  skills: Array.from({ length: 20 }, (_, i) => ({ id: `skill-${i + 1}`, name: `Skill ${i + 1}`, sort: i + 1 })),
  items: [
    item("head_default", "head", "Head", true, "", "#e2bc9a", 0.4, 0),
    item("body_standard", "body", "Standard", true, "", "#e2bc9a", 0.4, 1),
    item("body_thin", "body", "Thin", true, "", "#e2bc9a", 0.3, 2),
    item("body_hulk", "body", "Hulk", true, "", "#e2bc9a", 0.54, 3),
    item("body_fat", "body", "Fat", true, "", "#e2bc9a", 0.62, 4),
    item("shirt_default", "shirt", "Basic Shirt", true, "", "#688098", 0.4, 1),
    item("shirt_mock_1", "shirt", "Mock Shirt 1", false, "Reach level 10 in any skill.", "#965448", 0.4, 2),
    item("shirt_mock_2", "shirt", "Mock Shirt 2", false, "Complete 10 development actions.", "#588a60", 0.4, 3),
    item("shirt_mock_3", "shirt", "Mock Shirt 3", false, "Receive a 5-star rating on an action.", "#80649c", 0.4, 4),
    item("hat_default", "hat", "Basic Hat", true, "", "#8c744c", 0.4, 1),
    item("hat_mock_1", "hat", "Mock Hat 1", false, "Reach level 20 in any skill.", "#aa3c3c", 0.4, 2),
    item("hat_mock_2", "hat", "Mock Hat 2", false, "Earn 1000 experience towards a pursued path.", "#466eaa", 0.4, 3),
  ],
  agent_skills: [],
  traits: [
    { id: newId(), agent_id: AGENT, name: "Night owl", description: "Added by the agent.", by_admin: false },
    { id: newId(), agent_id: AGENT, name: "Team player", description: "Added by an admin.", by_admin: true },
    { id: newId(), agent_id: OTHER, name: "Fast learner", description: "", by_admin: true },
  ],
  agent_paths: [
    { id: "path-1", agent_id: AGENT, name: "Senior Agent", description: "", sort: 0 },
    { id: "path-2", agent_id: AGENT, name: "Team Lead", description: "", sort: 1 },
  ],
  dev_actions: [
    {
      id: "action-1", agent_id: AGENT, title: "Sample action: handled a difficult escalation",
      brief: "Short brief of what happened, visible without opening the action.", stars: 4, skill_id: "skill-1",
      action_type: "Skill developed", description: "Longer description of the action. Click the card to open or close it.",
      happened_at: new Date(Date.now() - 86400000).toISOString(), agents_impacted: "Agent Two", xp: 250, difficulty: 3,
      path_id: "path-1", path_xp: 100,
    },
    {
      id: "action-2", agent_id: AGENT, title: "Sample action: completed uptraining module", brief: "Another short brief.",
      stars: 3, skill_id: "skill-4", action_type: "Uptraining", description: "Longer description of the second sample action.",
      happened_at: new Date(Date.now() - 6 * 86400000).toISOString(), agents_impacted: "", xp: 120, difficulty: 2,
      path_id: "path-2", path_xp: 40,
    },
  ],
  feedback: { "action-1": "Feedback goes here. It stays folded away until it is clicked." },
  unlocks: [{ agent_id: AGENT, item_id: "shirt_mock_1" }],
  logins: { [ADMIN]: "lead", [AGENT]: "agent.one", [OTHER]: "agent.two" },
};

function giveSkills(agentId, sample) {
  db.skills.forEach((s, i) => db.agent_skills.push({
    agent_id: agentId, skill_id: s.id,
    level: sample ? (i * 11 + 5) % 21 : 0,
    passion: sample ? (i % 5 === 0 ? "major" : i % 3 === 0 ? "minor" : "none") : "none",
  }));
}
giveSkills(ADMIN, false);
giveSkills(AGENT, true);
giveSkills(OTHER, false);

// ---------------------------------------------------------------------------- login

export async function currentUserId() { return meId; }
export function onSignedOut() {}
export async function signIn() {}
export async function signOut() { location.reload(); }
export async function changePassword() {}

// --------------------------------------------------------------------------- reading

export async function loadBase() {
  return copy({
    profiles: [...db.profiles].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    skills: [...db.skills].sort((a, b) => a.sort - b.sort),
    items: [...db.items].sort((a, b) => a.sort - b.sort),
  });
}

export async function loadAgent(agentId) {
  const mine = (rows) => rows.filter((r) => r.agent_id === agentId);
  const actions = mine(db.dev_actions).sort((a, b) => b.happened_at.localeCompare(a.happened_at));
  const mayReadFeedback = demoRole === "admin" || agentId === meId;
  return copy({
    skills: mine(db.agent_skills),
    traits: mine(db.traits),
    paths: mine(db.agent_paths).sort((a, b) => a.sort - b.sort),
    actions,
    feedback: mayReadFeedback ? Object.fromEntries(actions.filter((a) => a.id in db.feedback).map((a) => [a.id, db.feedback[a.id]])) : {},
    unlocks: mine(db.unlocks).map((u) => u.item_id),
  });
}

export function spriteUrl(path) { return path; }

// --------------------------------------------------------------------------- writing

export async function updateProfile(agentId, changes) {
  Object.assign(db.profiles.find((p) => p.id === agentId), changes);
}

export async function saveAgentSkills(agentId, changes) {
  for (const { skill_id, ...values } of changes) {
    Object.assign(db.agent_skills.find((r) => r.agent_id === agentId && r.skill_id === skill_id), values);
  }
}

export async function saveRows(table, { inserts, updates, deletes }, extra = {}) {
  db[table] = db[table].filter((r) => !deletes.includes(r.id));
  for (const { id, ...values } of updates) Object.assign(db[table].find((r) => r.id === id), values);
  for (const row of inserts) {
    const created = { id: newId(), ...row, ...extra };
    if (table === "traits") created.by_admin = demoRole === "admin";
    db[table].push(created);
    if (table === "skills") db.profiles.forEach((p) => db.agent_skills.push({ agent_id: p.id, skill_id: created.id, level: 0, passion: "none" }));
  }
  if (table === "skills") db.agent_skills = db.agent_skills.filter((r) => db.skills.some((s) => s.id === r.skill_id));
}

export async function saveAction(agentId, action, feedback) {
  let id = action.id;
  if (id) Object.assign(db.dev_actions.find((a) => a.id === id), action);
  else db.dev_actions.push({ ...action, id: (id = newId()), agent_id: agentId });
  db.feedback[id] = feedback;
}

export async function deleteAction(actionId) {
  db.dev_actions = db.dev_actions.filter((a) => a.id !== actionId);
}

export async function unlockItem(agentId, itemId) {
  db.unlocks.push({ agent_id: agentId, item_id: itemId });
}

export async function lockItem(agentId, itemId) {
  db.unlocks = db.unlocks.filter((u) => !(u.agent_id === agentId && u.item_id === itemId));
  const profile = db.profiles.find((p) => p.id === agentId);
  for (const key of ["body_id", "shirt_id", "hat_id"]) if (profile[key] === itemId) profile[key] = null;
}

export async function saveItem(record, { isNew, file, removeSprite }) {
  const next = { ...record };
  if (file) next.sprite_path = URL.createObjectURL(file);
  else if (removeSprite) next.sprite_path = null;
  if (isNew) db.items.push(next);
  else Object.assign(db.items.find((i) => i.id === next.id), next);
}

export async function deleteItem(target) {
  db.items = db.items.filter((i) => i.id !== target.id);
  db.unlocks = db.unlocks.filter((u) => u.item_id !== target.id);
  for (const p of db.profiles) for (const key of ["body_id", "shirt_id", "hat_id"]) if (p[key] === target.id) p[key] = null;
}

// ---------------------------------------------------------------------- admin: logins

export async function listLogins() { return copy(db.logins); }

export async function createAgent({ username, display_name, role, title }) {
  if (Object.values(db.logins).includes(username)) throw new Error("That username is already taken.");
  const id = newId();
  db.profiles.push({ id, display_name, role, title: title || "Agent", body_id: null, shirt_id: null, hat_id: null });
  db.logins[id] = username;
  giveSkills(id, false);
  return { id };
}

export async function resetPassword() {}

export async function deleteAgent(userId) {
  db.profiles = db.profiles.filter((p) => p.id !== userId);
  delete db.logins[userId];
  for (const table of ["agent_skills", "traits", "agent_paths", "dev_actions", "unlocks"]) {
    db[table] = db[table].filter((r) => r.agent_id !== userId);
  }
}
