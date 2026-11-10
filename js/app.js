// Main screen: your character top-left, the other agents next to it, then
// agent picture | skills + traits + pursued paths | development actions.

import { h, setChildren, toast, confirmBox } from "./ui.js";
import { avatar, flames } from "./avatar.js";
import { SUPABASE_URL } from "./config.js";
import * as dialogs from "./dialogs.js";

const root = document.getElementById("app");
const params = new URLSearchParams(location.search);
const demoMode = params.has("demo") || !SUPABASE_URL;

let api;
const state = {
  me: null,          // profile of the logged-in person
  profiles: [],      // everyone
  skills: [],        // the skill template
  items: [],         // heads, bodies, shirts, hats
  viewId: null,      // whose character is on screen
  agent: null,       // that agent's skills, traits, paths, actions, feedback, unlocks
};
const openActions = new Set();    // action cards that are expanded
const openFeedback = new Set();   // ...and whose feedback is unfolded

const ctx = {
  get api() { return api; },
  state,
  isAdmin: () => state.me.role === "admin",
  isSelf: () => state.viewId === state.me.id,
  viewing: () => state.profiles.find((p) => p.id === state.viewId),
  lookOf,
  refresh,
};

/** The items a profile wears. override = { shirt: item } previews something else. */
function lookOf(profile, override = {}) {
  const byId = (id) => state.items.find((i) => i.id === id);
  const fallback = (kind) => state.items.find((i) => i.kind === kind && i.unlocked_by_default);
  return {
    head: override.head || fallback("head"),
    body: override.body || byId(profile.body_id) || fallback("body"),
    shirt: override.shirt || byId(profile.shirt_id) || fallback("shirt"),
    hat: override.hat || byId(profile.hat_id) || fallback("hat"),
  };
}

// ----------------------------------------------------------------------- start-up

async function boot() {
  try {
    api = await import(demoMode ? "./api-demo.js" : "./api.js");
  } catch (e) {
    return showMessage("The site could not load.", "Check your internet connection and reload the page.");
  }
  api.onSignedOut(() => showLogin());
  window.addEventListener("hashchange", () => { if (state.me) view(location.hash.slice(1)); });

  try {
    const userId = await api.currentUserId();
    if (!userId) return showLogin();
    await start(userId);
  } catch (e) {
    showMessage("Could not load the tracker.", e.message, true);
  }
}

async function start(userId) {
  const base = await api.loadBase();
  Object.assign(state, base);
  state.me = state.profiles.find((p) => p.id === userId);
  if (!state.me) {
    return showMessage("Your login has no agent profile.", "Ask an admin to check your account.", true);
  }
  const wanted = location.hash.slice(1);
  state.viewId = state.profiles.some((p) => p.id === wanted) ? wanted : state.me.id;
  state.agent = await api.loadAgent(state.viewId);
  render();
}

/** Reloads everything from the server and redraws. Called after every change. */
async function refresh() {
  const base = await api.loadBase();
  Object.assign(state, base);
  state.me = state.profiles.find((p) => p.id === state.me.id) || state.me;
  if (!state.profiles.some((p) => p.id === state.viewId)) state.viewId = state.me.id;
  state.agent = await api.loadAgent(state.viewId);
  render();
}

async function view(agentId) {
  if (!state.profiles.some((p) => p.id === agentId)) agentId = state.me.id;
  if (agentId === state.viewId) return;
  try {
    const agent = await api.loadAgent(agentId);
    state.viewId = agentId;
    state.agent = agent;
    openActions.clear();
    openFeedback.clear();
    if (location.hash.slice(1) !== agentId) history.replaceState(null, "", "#" + agentId);
    render();
  } catch (e) {
    toast(e.message, true);
  }
}

// ------------------------------------------------------------------ simple screens

function showMessage(title, detail, offerSignOut = false) {
  setChildren(root, h("div", { class: "center-card" },
    h("h1", null, title),
    h("p", { class: "dim" }, detail),
    offerSignOut && h("button", { type: "button", class: "btn", onclick: async () => { await api.signOut(); showLogin(); } }, "Sign out")));
}

function showLogin() {
  state.me = null;
  const username = h("input", { type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true });
  const password = h("input", { type: "password", autocomplete: "current-password", required: true });
  const error = h("div", { class: "modal-error", role: "alert" });
  const button = h("button", { type: "submit", class: "btn primary" }, "Log in");

  setChildren(root, h("form", {
    class: "center-card",
    onsubmit: async (e) => {
      e.preventDefault();
      error.textContent = "";
      button.disabled = true;
      try {
        await api.signIn(username.value, password.value);
        await start(await api.currentUserId());
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
      }
    },
  },
    h("h1", null, "Agents Development Tracker"),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "Username"), username),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "Password"), password),
    error,
    button,
    h("p", { class: "dim" }, "Logins are created by an admin. Forgot your password? Ask an admin to reset it.")));
  username.focus();
}

// ---------------------------------------------------------------------- main screen

function render() {
  const agent = ctx.viewing();
  setChildren(root, 
    demoMode && h("div", { class: "demo-banner" },
      "Demo mode - made-up data, nothing is saved. Viewing as: ",
      h("a", { href: "?demo=admin" }, "Admin"), " | ", h("a", { href: "?demo=agent" }, "Agent")),
    topBar(),
    h("main", { class: "columns" },
      agentBox(agent),
      h("div", { class: "middle" }, skillsBox(), h("div", { class: "lower" }, traitsBox(), pathsBox())),
      developmentBox()));
  document.title = `${agent.display_name} - Agents Development Tracker`;
}

function box(title, buttons, content, extraClass = "") {
  return h("section", { class: "box " + extraClass },
    h("header", { class: "box-header" }, h("h2", null, title), h("div", { class: "box-buttons" }, buttons)),
    h("div", { class: "box-content" }, content));
}

const button = (label, onclick, kind = "") => h("button", { type: "button", class: "btn " + kind, onclick }, label);

function agentTile(profile, label) {
  return h("button", {
    type: "button",
    class: "agent-tile" + (profile.id === state.viewId ? " selected" : ""),
    title: profile.display_name,
    "aria-pressed": String(profile.id === state.viewId),
    onclick: () => view(profile.id),
  },
    avatar(lookOf(profile), api.spriteUrl),
    h("span", { class: "agent-tile-name" }, label || profile.display_name));
}

function topBar() {
  const others = state.profiles.filter((p) => p.id !== state.me.id);
  return h("header", { class: "topbar" },
    h("div", { class: "me" }, agentTile(state.me), h("span", { class: "me-label" }, "You")),
    h("nav", { class: "agents-strip", "aria-label": "Other agents" }, others.map((p) => agentTile(p))),
    h("div", { class: "top-actions" },
      ctx.isAdmin() && [
        button("Manage agents", () => dialogs.openManageAgents(ctx)),
        button("Skill template", () => dialogs.openSkillTemplate(ctx)),
        button("Items", () => dialogs.openItems(ctx)),
      ],
      button("My account", () => dialogs.openAccount(ctx)),
      button("Sign out", async () => { await api.signOut(); showLogin(); })));
}

function agentBox(agent) {
  const look = lookOf(agent);
  const note = ctx.isSelf() ? null : ctx.isAdmin() ? "Editing as admin" : "View only";
  return box("Agent",
    [
      ctx.isAdmin() && button("Edit", () => dialogs.openAgentEdit(ctx)),
      button("Wardrobe", () => dialogs.openWardrobe(ctx)),
    ],
    h("div", { class: "portrait" },
      note && h("span", { class: "view-note" }, note),
      avatar(look, api.spriteUrl),
      h("div", { class: "portrait-name" }, agent.display_name),
      h("div", { class: "portrait-title" }, agent.title),
      h("div", { class: "dim" }, [look.shirt && look.shirt.name, look.hat && look.hat.name].filter(Boolean).join("  ·  "))),
    "agent-box");
}

const NEXT_PASSION = { none: "minor", minor: "major", major: "none" };
const PASSION_LABEL = { none: "no passion", minor: "minor passion", major: "major passion" };

function skillsBox() {
  const canEdit = ctx.isSelf() || ctx.isAdmin();
  const mine = new Map(state.agent.skills.map((s) => [s.skill_id, s]));

  async function cyclePassion(skill, row) {
    const before = row.passion;
    row.passion = NEXT_PASSION[before];
    render();
    try {
      await api.saveAgentSkills(state.viewId, [{ skill_id: skill.id, passion: row.passion }]);
    } catch (e) {
      row.passion = before;
      render();
      toast(e.message, true);
    }
  }

  return box("Skills", canEdit && button("Edit", () => dialogs.openSkillsEdit(ctx)),
    state.skills.length === 0
      ? h("p", { class: "dim" }, "No skills yet.")
      : h("div", { class: "skills" }, state.skills.map((skill) => {
          const row = mine.get(skill.id) || { level: 0, passion: "none" };
          const level = Math.max(0, Math.min(20, row.level));
          const canCycle = canEdit && mine.has(skill.id);
          return h("div", { class: "skill" },
            h("span", { class: "skill-name", title: skill.name }, skill.name),
            h("div", { class: "skill-bar", role: "img", "aria-label": `${skill.name}: level ${level} of 20, ${PASSION_LABEL[row.passion]}` },
              h("div", { class: "skill-fill", style: `width:${level * 5}%` }),
              h("span", { class: "skill-level" }, level)),
            canCycle
              ? h("button", { type: "button", class: "passion-button", title: `Passion: ${row.passion}. Click to change.`, "aria-label": `${skill.name}: ${PASSION_LABEL[row.passion]}. Click to change.`, onclick: () => cyclePassion(skill, row) }, flames(row.passion))
              : h("span", { class: "passion-static" }, row.passion !== "none" && flames(row.passion)));
        })),
    "skills-box");
}

function traitsBox() {
  const canEdit = ctx.isSelf() || ctx.isAdmin();
  const traits = state.agent.traits;
  return box("Traits", canEdit && button("Edit", () => dialogs.openTraitsEdit(ctx)),
    traits.length === 0
      ? h("p", { class: "dim" }, "No traits yet.")
      : h("div", { class: "traits" }, traits.map((t) =>
          h("span", { class: "trait" + (t.by_admin ? " by-admin" : ""), title: [t.description, t.by_admin ? "Added by an admin" : ""].filter(Boolean).join("\n") }, t.name))));
}

function pathsBox() {
  const { paths, actions } = state.agent;
  const xp = (path) => actions.filter((a) => a.path_id === path.id).reduce((sum, a) => sum + a.path_xp, 0);
  return box("Pursued Paths", ctx.isAdmin() && button("Edit", () => dialogs.openPathsEdit(ctx)),
    paths.length === 0
      ? h("p", { class: "dim" }, "No pursued paths yet.")
      : h("div", { class: "paths" }, paths.map((p) =>
          h("div", { class: "path", title: p.description || "" }, h("span", { class: "path-name" }, p.name), h("span", { class: "path-xp" }, xp(p) + " xp")))));
}

function developmentBox() {
  const admin = ctx.isAdmin();
  const { actions, paths, feedback } = state.agent;
  const canSeeFeedback = admin || ctx.isSelf();
  const skillName = (id) => (state.skills.find((s) => s.id === id) || {}).name || "-";
  const pathName = (id) => (paths.find((p) => p.id === id) || {}).name || "-";
  const toggle = (set, id) => { set.has(id) ? set.delete(id) : set.add(id); render(); };
  const detail = (label, value) => [h("dt", null, label), h("dd", null, value || "-")];

  async function remove(action) {
    if (!(await confirmBox("Delete action", `Delete the action "${action.title}"? This cannot be undone.`))) return;
    try {
      await api.deleteAction(action.id);
      await refresh();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function card(a) {
    const open = openActions.has(a.id);
    const stars = Math.max(0, Math.min(5, a.stars));
    const difficulty = Math.max(1, Math.min(5, a.difficulty));
    const feedbackOpen = openFeedback.has(a.id);

    return h("article", { class: "action" + (open ? " open" : "") },
      h("button", { type: "button", class: "action-summary", "aria-expanded": String(open), onclick: () => toggle(openActions, a.id) },
        h("span", { class: "action-title" }, a.title),
        h("span", { class: "stars", role: "img", "aria-label": `${stars} of 5 stars` }, "★".repeat(stars) + "☆".repeat(5 - stars)),
        h("span", { class: "action-brief" }, a.brief),
        h("span", { class: "action-skill" }, "Skill: " + skillName(a.skill_id)),
        h("span", { class: "action-hint" }, open ? "▲ close" : "▼ details")),

      open && h("div", { class: "action-details" },
        a.description && h("p", { class: "action-description" }, a.description),
        h("dl", null,
          detail("Date / time", new Date(a.happened_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })),
          detail("Type of action", a.action_type),
          detail("Skill developed", skillName(a.skill_id)),
          detail("Experience gained", `+${a.xp} xp`),
          detail("Difficulty", `${"●".repeat(difficulty)}${"○".repeat(5 - difficulty)}  ${difficulty} / 5`),
          detail("Other agents impacted", a.agents_impacted),
          detail("Path pursued", pathName(a.path_id)),
          detail("Experience towards path", `+${a.path_xp} xp`)),
        canSeeFeedback && [
          h("button", { type: "button", class: "feedback-toggle", "aria-expanded": String(feedbackOpen), onclick: () => toggle(openFeedback, a.id) },
            (feedbackOpen ? "▼" : "▶") + "  Feedback"),
          feedbackOpen && h("div", { class: "feedback" + (feedback[a.id] ? "" : " dim") }, feedback[a.id] || "(no feedback yet)"),
        ]),

      admin && h("div", { class: "action-buttons" },
        button("Edit", () => dialogs.openActionEdit(ctx, a)),
        button("Delete", () => remove(a), "danger")));
  }

  return box("Development", admin && button("+ Add action", () => dialogs.openActionEdit(ctx, null)),
    actions.length === 0
      ? h("p", { class: "dim" }, admin ? "No development actions yet. Use \"+ Add action\" to add one." : "No development actions yet.")
      : h("div", { class: "actions" }, actions.map(card)),
    "development-box");
}

boot();
