// Every pop-up window of the site. Each function receives "ctx" from app.js:
//   ctx.api          the data functions (api.js or api-demo.js)
//   ctx.state        { me, profiles, skills, items, viewId, agent }
//   ctx.isAdmin()    is the logged-in person an admin
//   ctx.isSelf()     is the logged-in person looking at their own character
//   ctx.viewing()    profile of the agent on screen
//   ctx.lookOf(profile, override)   the items a profile is wearing
//   ctx.refresh()    reload everything from the server and redraw the page

import { h, setChildren, field, toast, openModal, confirmBox, openListEditor } from "./ui.js";
import { avatar } from "./avatar.js";

const USERNAME_RULE = /^[a-z0-9._-]{3,30}$/;
const MIN_PASSWORD = 6;
const KIND_LABEL = { head: "Head", body: "Body", shirt: "Shirt", hat: "Hat" };

const text = (attrs = {}) => h("input", { type: "text", ...attrs });
const number = (attrs = {}) => h("input", { type: "number", ...attrs });
const password = (attrs = {}) => h("input", { type: "password", autocomplete: "new-password", ...attrs });

function tabs(labels, current, onPick) {
  return h("div", { class: "tabs", role: "tablist" }, Object.entries(labels).map(([key, label]) =>
    h("button", { type: "button", role: "tab", "aria-selected": String(key === current), class: "btn tab" + (key === current ? " selected" : ""), onclick: () => onPick(key) }, label)));
}

function checkPassword(value, repeat) {
  if (value.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters.`);
  if (repeat !== undefined && value !== repeat) throw new Error("The two new passwords do not match.");
}

// ------------------------------------------------------------------------- account

/** Your own display name and password. */
export function openAccount(ctx) {
  const name = text({ value: ctx.state.me.display_name, maxlength: 40 });
  const current = password({ autocomplete: "current-password" });
  const next = password();
  const repeat = password();

  const modal = openModal({
    title: "My account",
    actions: [{ label: "Close" }],
    body: h("div", { class: "form" },
      h("h3", null, "Display name"),
      h("p", { class: "dim" }, "The name other agents see. Your username stays private."),
      field("Display name", name),
      h("button", { type: "button", class: "btn primary", onclick: () => run(async () => {
        const value = name.value.trim();
        if (!value) throw new Error("The display name cannot be empty.");
        await ctx.api.updateProfile(ctx.state.me.id, { display_name: value });
        await ctx.refresh();
        toast("Display name saved.");
      }) }, "Save name"),

      h("h3", null, "Password"),
      field("Current password", current),
      field("New password", next),
      field("New password again", repeat),
      h("button", { type: "button", class: "btn primary", onclick: () => run(async () => {
        checkPassword(next.value, repeat.value);
        await ctx.api.changePassword(current.value, next.value);
        current.value = next.value = repeat.value = "";
        toast("Password changed.");
      }) }, "Change password")),
  });

  async function run(work) {
    modal.setError("");
    try { await work(); } catch (e) { modal.setError(e.message); }
  }
}

// ---------------------------------------------------------------- agent details (admin)

/** Admin: name, title and role of the agent on screen. */
export function openAgentEdit(ctx) {
  const agent = ctx.viewing();
  const isMe = agent.id === ctx.state.me.id;
  const name = text({ value: agent.display_name, maxlength: 40 });
  const title = text({ value: agent.title, maxlength: 60 });
  const role = h("select", { value: agent.role, disabled: isMe },
    h("option", { value: "agent" }, "Agent"), h("option", { value: "admin" }, "Admin"));

  openModal({
    title: "Edit agent",
    body: h("div", { class: "form" },
      field("Display name", name),
      field("Title (shown under the name)", title),
      field("Role", role, isMe ? "You cannot change your own role." : "Admins can edit every agent and manage logins.")),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "primary", run: async () => {
        if (!name.value.trim()) throw new Error("The display name cannot be empty.");
        await ctx.api.updateProfile(agent.id, { display_name: name.value.trim(), title: title.value.trim(), role: role.value });
        await ctx.refresh();
      } },
    ],
  });
}

// --------------------------------------------------------------------------- skills

/** Levels (admin only) and passions (the agent or an admin) of the agent on screen. */
export function openSkillsEdit(ctx) {
  const admin = ctx.isAdmin();
  const current = new Map(ctx.state.agent.skills.map((s) => [s.skill_id, s]));
  const rows = ctx.state.skills.map((skill) => {
    const mine = current.get(skill.id) || { level: 0, passion: "none" };
    return {
      skill, mine,
      level: number({ min: 0, max: 20, step: 1, value: mine.level, disabled: !admin, "aria-label": `${skill.name} level` }),
      passion: h("select", { value: mine.passion, "aria-label": `${skill.name} passion` },
        h("option", { value: "none" }, "None"), h("option", { value: "minor" }, "Minor"), h("option", { value: "major" }, "Major")),
    };
  });

  openModal({
    title: `Skills - ${ctx.viewing().display_name}`,
    size: "medium",
    body: h("div", null,
      h("p", { class: "dim" }, admin ? "Level is 0 to 20. Passion: none, minor (one flame) or major (two flames)." : "You can set your passions. Skill levels are set by an admin."),
      h("div", { class: "skill-edit" },
        h("div", { class: "skill-edit-row head" }, h("span", null, "Skill"), h("span", null, "Level"), h("span", null, "Passion")),
        rows.map((r) => h("div", { class: "skill-edit-row" }, h("span", null, r.skill.name), r.level, r.passion)))),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "primary", run: async () => {
        const changes = [];
        for (const r of rows) {
          const level = Math.round(Number(r.level.value));
          if (!(level >= 0 && level <= 20)) throw new Error(`${r.skill.name}: the level must be between 0 and 20.`);
          const change = { skill_id: r.skill.id };
          if (admin && level !== r.mine.level) change.level = level;
          if (r.passion.value !== r.mine.passion) change.passion = r.passion.value;
          if (Object.keys(change).length > 1) changes.push(change);
        }
        if (changes.length) {
          await ctx.api.saveAgentSkills(ctx.state.viewId, changes);
          await ctx.refresh();
        }
      } },
    ],
  });
}

// ------------------------------------------------------------------ traits and paths

export function openTraitsEdit(ctx) {
  const admin = ctx.isAdmin();
  openListEditor({
    title: `Traits - ${ctx.viewing().display_name}`,
    hint: admin
      ? "Traits you add here are marked as added by an admin (yellow) and cannot be changed by the agent."
      : "Add traits that describe you. Traits added by an admin are yellow and cannot be changed.",
    rows: ctx.state.agent.traits,
    columns: [{ key: "name", label: "Trait", flex: 2, max: 60 }, { key: "description", label: "Description (shown on hover)", flex: 4, max: 500 }],
    addLabel: "Add trait",
    isLocked: (row) => !admin && row.by_admin === true,
    lockedNote: "Added by admin",
    onSave: async (diff) => {
      await ctx.api.saveRows("traits", diff, { agent_id: ctx.state.viewId });
      await ctx.refresh();
    },
  });
}

export function openPathsEdit(ctx) {
  openListEditor({
    title: `Pursued paths - ${ctx.viewing().display_name}`,
    hint: "Job titles this agent is working towards. The experience shown next to each comes from the development actions.",
    rows: ctx.state.agent.paths,
    columns: [{ key: "name", label: "Job title", flex: 2, max: 80 }, { key: "description", label: "Description", flex: 4, max: 500 }],
    addLabel: "Add path",
    orderable: true,
    onSave: async (diff) => {
      await ctx.api.saveRows("agent_paths", diff, { agent_id: ctx.state.viewId });
      await ctx.refresh();
    },
  });
}

/** Admin: the skills every agent has. */
export function openSkillTemplate(ctx) {
  openListEditor({
    title: "Skill template",
    hint: "Every agent has exactly these skills. A new skill is added to all agents at level 0. Removing a skill removes it, with its levels, from all agents.",
    rows: ctx.state.skills,
    columns: [{ key: "name", label: "Skill", flex: 1, max: 60 }],
    addLabel: "Add skill",
    orderable: true,
    onSave: async (diff) => {
      if (diff.deletes.length) {
        const sure = await confirmBox("Remove skills", `Remove ${diff.deletes.length} skill(s) from every agent? Their levels and passions in those skills are lost. This cannot be undone.`, "Remove");
        if (!sure) throw new Error("Nothing was saved.");
      }
      await ctx.api.saveRows("skills", diff);
      await ctx.refresh();
    },
  });
}

// -------------------------------------------------------------- development actions

function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** Admin: add (action = null) or edit a development action of the agent on screen. */
export function openActionEdit(ctx, action) {
  const a = action || { stars: 3, difficulty: 1, xp: 0, path_xp: 0 };
  const { skills } = ctx.state;
  const { paths, actions, feedback } = ctx.state.agent;
  const types = [...new Set([...actions.map((x) => x.action_type), "Skill developed", "Uptraining", "Coaching"].filter(Boolean))];

  const f = {
    title: text({ value: a.title || "", maxlength: 200 }),
    brief: h("textarea", { rows: 2, value: a.brief || "" }),
    stars: number({ min: 0, max: 5, value: a.stars }),
    skill: h("select", { value: a.skill_id || "" }, h("option", { value: "" }, "(none)"), skills.map((s) => h("option", { value: s.id }, s.name))),
    type: text({ value: a.action_type || "", list: "action-types" }),
    when: h("input", { type: "datetime-local", value: toLocalInput(a.happened_at) }),
    agents: text({ value: a.agents_impacted || "" }),
    xp: number({ min: 0, value: a.xp }),
    difficulty: number({ min: 1, max: 5, value: a.difficulty }),
    path: h("select", { value: a.path_id || "" }, h("option", { value: "" }, "(none)"), paths.map((p) => h("option", { value: p.id }, p.name))),
    pathXp: number({ min: 0, value: a.path_xp }),
    description: h("textarea", { rows: 5, value: a.description || "" }),
    feedback: h("textarea", { rows: 5, value: (action && feedback[action.id]) || "" }),
  };

  const whole = (input, label, min, max) => {
    const n = Math.round(Number(input.value));
    if (!(n >= min && n <= max)) throw new Error(`${label} must be between ${min} and ${max}.`);
    return n;
  };

  openModal({
    title: action ? "Edit development action" : "Add development action",
    size: "medium",
    body: h("div", { class: "form" },
      h("datalist", { id: "action-types" }, types.map((t) => h("option", { value: t }))),
      field("Title", f.title),
      field("Short brief", f.brief),
      h("div", { class: "form-row" }, field("Star rating (0-5)", f.stars), field("Difficulty (1-5)", f.difficulty), field("Date / time", f.when)),
      h("div", { class: "form-row" }, field("Skill impacted", f.skill), field("Type of action", f.type), field("Experience gained", f.xp)),
      h("div", { class: "form-row" }, field("Path pursued", f.path), field("Experience towards path", f.pathXp)),
      field("Other agents impacted", f.agents),
      field("Long description", f.description),
      field("Feedback", f.feedback, "Only this agent and admins can read the feedback.")),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "primary", run: async () => {
        if (!f.title.value.trim()) throw new Error("The action needs a title.");
        const when = new Date(f.when.value);
        if (isNaN(when)) throw new Error("Please enter a valid date and time.");
        const record = {
          title: f.title.value.trim(),
          brief: f.brief.value.trim(),
          stars: whole(f.stars, "The star rating", 0, 5),
          skill_id: f.skill.value || null,
          action_type: f.type.value.trim(),
          happened_at: when.toISOString(),
          agents_impacted: f.agents.value.trim(),
          xp: whole(f.xp, "Experience gained", 0, 1000000),
          difficulty: whole(f.difficulty, "The difficulty", 1, 5),
          path_id: f.path.value || null,
          path_xp: whole(f.pathXp, "Experience towards path", 0, 1000000),
          description: f.description.value.trim(),
        };
        if (action) record.id = action.id;
        await ctx.api.saveAction(ctx.state.viewId, record, f.feedback.value.trim());
        await ctx.refresh();
      } },
    ],
  });
}

// ------------------------------------------------------------------------- wardrobe

/**
 * Body / Shirts / Hats of the agent on screen. Available items come first, locked ones after
 * them, dimmed, with what unlocks them. Agents can only use unlocked items; admins unlock.
 */
export function openWardrobe(ctx, startKind = "shirt") {
  const canWear = ctx.isSelf() || ctx.isAdmin();
  const canUnlock = ctx.isAdmin();
  const column = { body: "body_id", shirt: "shirt_id", hat: "hat_id" };
  let kind = startKind;

  const body = h("div");
  const modal = openModal({ title: `Wardrobe - ${ctx.viewing().display_name}`, body, size: "wide", actions: [{ label: "Close" }] });

  async function act(work) {
    modal.setError("");
    try {
      await work();
      await ctx.refresh();
    } catch (e) {
      modal.setError(e.message);
    }
    draw();
  }

  function draw() {
    const agent = ctx.viewing();
    const unlocked = (item) => item.unlocked_by_default || ctx.state.agent.unlocks.includes(item.id);
    const wearing = ctx.lookOf(agent)[kind];
    const items = ctx.state.items.filter((i) => i.kind === kind);
    const ordered = [...items.filter(unlocked), ...items.filter((i) => !unlocked(i))];

    setChildren(body, 
      tabs({ body: "Body", shirt: "Shirts", hat: "Hats" }, kind, (k) => { kind = k; draw(); }),
      !canWear && h("p", { class: "dim" }, "You can look at another agent's wardrobe, but only they or an admin can change it."),
      h("div", { class: "tiles" }, ordered.map((item) => {
        const isUnlocked = unlocked(item);
        const inUse = wearing && wearing.id === item.id;
        return h("div", { class: "tile" + (inUse ? " in-use" : "") + (isUnlocked ? "" : " locked") },
          h("div", { class: "tile-preview" }, avatar(ctx.lookOf(agent, { [kind]: item }), ctx.api.spriteUrl), !isUnlocked && h("span", { class: "tile-lock" }, "LOCKED")),
          h("div", { class: "tile-name" }, item.name),
          h("div", { class: "tile-status" }, isUnlocked ? (inUse ? "In use" : "Available") : "To unlock: " + (item.unlock_description || "ask an admin.")),
          h("div", { class: "tile-buttons" },
            isUnlocked && canWear && h("button", { type: "button", class: "btn", disabled: inUse, onclick: () => act(() => ctx.api.updateProfile(agent.id, { [column[kind]]: item.id })) }, inUse ? "In use" : "Use"),
            isUnlocked && canUnlock && !item.unlocked_by_default && h("button", { type: "button", class: "btn", onclick: () => act(() => ctx.api.lockItem(agent.id, item.id)) }, "Lock"),
            !isUnlocked && canUnlock && h("button", { type: "button", class: "btn primary", onclick: () => act(() => ctx.api.unlockItem(agent.id, item.id)) }, "Unlock")));
      })),
      !ordered.length && h("p", { class: "dim" }, "No items of this kind yet."));
  }
  draw();
}

// ------------------------------------------------------------- admin: manage logins

export function openManageAgents(ctx) {
  let logins = null;
  const body = h("div");
  const modal = openModal({ title: "Manage agents", body, size: "wide", actions: [{ label: "Close" }] });

  // Kept outside draw() so typed values survive a redraw.
  const form = {
    username: text({ maxlength: 30, autocomplete: "off", placeholder: "e.g. john.smith" }),
    password: text({ autocomplete: "off" }),
    name: text({ maxlength: 40 }),
    title: text({ maxlength: 60, value: "Agent" }),
    role: h("select", { value: "agent" }, h("option", { value: "agent" }, "Agent"), h("option", { value: "admin" }, "Admin")),
  };

  async function act(work, done) {
    modal.setError("");
    try {
      await work();
      await ctx.refresh();
      logins = await ctx.api.listLogins();
      if (done) toast(done);
    } catch (e) {
      modal.setError(e.message);
    }
    draw();
  }

  function resetPassword(agent) {
    const next = text({ autocomplete: "off" });
    openModal({
      title: `New password for ${agent.display_name}`,
      body: h("div", { class: "form" }, field("New password", next, "Tell the agent this password. They can change it after logging in under My account.")),
      actions: [
        { label: "Cancel" },
        { label: "Set password", kind: "primary", run: async () => {
          checkPassword(next.value);
          await ctx.api.resetPassword(agent.id, next.value);
          toast("Password changed.");
        } },
      ],
    });
  }

  async function remove(agent) {
    const sure = await confirmBox("Delete agent",
      `Delete "${agent.display_name}" with their login, skills, traits, paths and development actions? This cannot be undone.`);
    if (sure) act(() => ctx.api.deleteAgent(agent.id), "Agent deleted.");
  }

  function draw() {
    setChildren(body, 
      h("h3", null, "Add an agent"),
      h("p", { class: "dim" }, "The username is only used to log in and is never shown to other agents. Give the agent their username and password; they can change the password and their display name themselves."),
      h("div", { class: "form-row" },
        field("Username", form.username), field("Password", form.password), field("Display name", form.name),
        field("Title", form.title), field("Role", form.role)),
      h("button", { type: "button", class: "btn primary", onclick: () => {
        const username = form.username.value.trim().toLowerCase();
        const record = { username, password: form.password.value, display_name: form.name.value.trim(), title: form.title.value.trim(), role: form.role.value };
        try {
          if (!USERNAME_RULE.test(username)) throw new Error("The username must be 3-30 characters: lowercase letters, numbers, dot, dash or underscore.");
          checkPassword(record.password);
          if (!record.display_name) throw new Error("A display name is required.");
        } catch (e) {
          return modal.setError(e.message);
        }
        act(async () => {
          await ctx.api.createAgent(record);
          form.username.value = form.password.value = form.name.value = "";
        }, "Agent created.");
      } }, "Create agent"),

      h("h3", null, "Everyone"),
      h("table", { class: "table" },
        h("thead", null, h("tr", null, h("th", null, "Display name"), h("th", null, "Username"), h("th", null, "Title"), h("th", null, "Role"), h("th", null, ""))),
        h("tbody", null, ctx.state.profiles.map((p) => h("tr", null,
          h("td", null, p.display_name, p.id === ctx.state.me.id && h("span", { class: "dim" }, " (you)")),
          h("td", null, logins ? (logins[p.id] || "?") : "…"),
          h("td", null, p.title),
          h("td", null, p.role === "admin" ? "Admin" : "Agent"),
          h("td", { class: "cell-buttons" },
            h("button", { type: "button", class: "btn small", onclick: () => resetPassword(p) }, "Reset password"),
            p.id !== ctx.state.me.id && h("button", { type: "button", class: "btn small danger", onclick: () => remove(p) }, "Delete")))))),
      h("p", { class: "dim" }, "To change someone's display name, title or role, open their character and press Edit on the Agent box."));
  }

  draw();
  ctx.api.listLogins().then((result) => { logins = result; draw(); }, (e) => modal.setError("Could not load usernames: " + e.message));
}

// ------------------------------------------------------------ admin: item catalogue

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "item";
}

function openItemForm(ctx, existing, onDone) {
  const isNew = !existing;
  const it = existing || { kind: "shirt", name: "", unlocked_by_default: false, unlock_description: "", placeholder_color: "#787878", placeholder_width: 0.4, sort: 10, sprite_path: null };

  const f = {
    kind: h("select", { value: it.kind, disabled: !isNew },
      Object.entries(KIND_LABEL).filter(([k]) => k !== "head" || it.kind === "head").map(([k, label]) => h("option", { value: k }, label))),
    name: text({ value: it.name, maxlength: 60 }),
    file: h("input", { type: "file", accept: "image/png,image/webp" }),
    remove: h("input", { type: "checkbox" }),
    byDefault: h("input", { type: "checkbox", checked: it.unlocked_by_default }),
    description: text({ value: it.unlock_description || "", maxlength: 200 }),
    color: h("input", { type: "color", value: it.placeholder_color || "#787878" }),
    width: number({ min: 0.2, max: 0.8, step: 0.02, value: it.placeholder_width }),
    sort: number({ step: 1, value: it.sort }),
  };

  openModal({
    title: isNew ? "Add item" : `Edit ${it.name}`,
    size: "medium",
    body: h("div", { class: "form" },
      h("div", { class: "form-row" }, field("Kind", f.kind), field("Name", f.name), field("Order in the list", f.sort)),
      field("Picture (PNG)", f.file, "Square PNG with a transparent background, the same size as your other sprites (for example 256x256), with the part painted where it sits on the agent. Max 2 MB. Leave empty to keep the current picture."),
      it.sprite_path && h("label", { class: "check" }, f.remove, " Remove the current picture (use the placeholder shape again)"),
      h("label", { class: "check" }, f.byDefault, " Unlocked for everyone from the start"),
      field("What unlocks it (shown on the locked item)", f.description),
      h("div", { class: "form-row" }, field("Placeholder colour (used while there is no picture)", f.color), field("Placeholder width (bodies only)", f.width))),
    actions: [
      { label: "Cancel" },
      { label: "Save", kind: "primary", run: async () => {
        const name = f.name.value.trim();
        if (!name) throw new Error("The item needs a name.");
        const file = f.file.files[0] || null;
        if (file && !["image/png", "image/webp"].includes(file.type)) throw new Error("The picture must be a PNG (or WebP) file.");
        if (file && file.size > 2 * 1024 * 1024) throw new Error("The picture is larger than 2 MB.");
        const kind = isNew ? f.kind.value : it.kind;
        const record = {
          id: isNew ? `${kind}_${slug(name)}_${Math.random().toString(36).slice(2, 6)}` : it.id,
          kind,
          name,
          unlocked_by_default: f.byDefault.checked,
          unlock_description: f.description.value.trim(),
          placeholder_color: f.color.value,
          placeholder_width: Math.min(0.8, Math.max(0.2, Number(f.width.value) || 0.4)),
          sort: Math.round(Number(f.sort.value)) || 0,
        };
        await ctx.api.saveItem(record, { isNew, file, removeSprite: f.remove.checked, oldPath: it.sprite_path });
        await ctx.refresh();
        onDone();
      } },
    ],
  });
}

/** Admin: every head, body, shirt and hat, with their pictures. */
export function openItems(ctx) {
  const body = h("div");
  const modal = openModal({ title: "Items", body, size: "wide", actions: [{ label: "Close" }] });

  async function remove(item) {
    const sameKindDefaults = ctx.state.items.filter((i) => i.kind === item.kind && i.unlocked_by_default);
    if (item.kind === "head" || (item.unlocked_by_default && sameKindDefaults.length === 1)) {
      return modal.setError(`"${item.name}" is the only ${KIND_LABEL[item.kind].toLowerCase()} available to everyone, so it cannot be deleted. Edit it instead.`);
    }
    const sure = await confirmBox("Delete item", `Delete "${item.name}"? Agents wearing it go back to the default. This cannot be undone.`);
    if (!sure) return;
    modal.setError("");
    try {
      await ctx.api.deleteItem(item);
      await ctx.refresh();
    } catch (e) {
      modal.setError(e.message);
    }
    draw();
  }

  function draw() {
    const me = ctx.state.me;
    setChildren(body, 
      h("p", { class: "dim" }, "Pictures are layered in this order: body, shirt, head, hat. An item without a picture is drawn as a coloured placeholder."),
      h("button", { type: "button", class: "btn primary", onclick: () => openItemForm(ctx, null, draw) }, "+ Add item"),
      ["head", "body", "shirt", "hat"].map((kind) => [
        h("h3", null, { head: "Head", body: "Bodies", shirt: "Shirts", hat: "Hats" }[kind]),
        h("div", { class: "item-list" }, ctx.state.items.filter((i) => i.kind === kind).map((item) =>
          h("div", { class: "item-row" },
            h("div", { class: "item-thumb" }, avatar(ctx.lookOf(me, { [kind]: item }), ctx.api.spriteUrl)),
            h("div", { class: "item-info" },
              h("div", { class: "item-name" }, item.name),
              h("div", { class: "dim" },
                item.sprite_path ? "Has a picture" : "Placeholder (no picture yet)",
                kind !== "head" && (item.unlocked_by_default ? " · unlocked for everyone" : " · locked: " + (item.unlock_description || "no description")))),
            h("div", { class: "cell-buttons" },
              h("button", { type: "button", class: "btn small", onclick: () => openItemForm(ctx, item, draw) }, "Edit"),
              kind !== "head" && h("button", { type: "button", class: "btn small danger", onclick: () => remove(item) }, "Delete"))))),
      ]));
  }
  draw();
}
