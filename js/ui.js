// Small DOM helpers shared by the whole site. Text is always inserted as text (never as HTML),
// so names and descriptions typed by one person can never run as code in someone else's browser.

const SVG_NS = "http://www.w3.org/2000/svg";

function fill(el, attrs, children) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false || key === "value") continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.setAttribute("class", value);
    else if (key === "checked" || key === "disabled") el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  // Set last: a <select> can only take a value once its options exist.
  if (attrs && attrs.value != null) el.value = attrs.value;
  return el;
}

/** h("div", { class: "box", onclick: fn }, "text", childNode, ...) */
export function h(tag, attrs, ...children) {
  return fill(document.createElement(tag), attrs, children);
}

export function svg(tag, attrs, ...children) {
  return fill(document.createElementNS(SVG_NS, tag), attrs, children);
}

/** Replaces an element's content. Like h(), it skips null / false and accepts nested arrays. */
export function setChildren(el, ...children) {
  el.replaceChildren();
  return fill(el, null, children);
}

/** A labelled form control. */
export function field(label, control, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, hint && h("span", { class: "field-hint" }, hint));
}

export function toast(message, isError = false) {
  const el = h("div", { class: "toast" + (isError ? " error" : ""), role: "status" }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3000);
}

// ---------------------------------------------------------------------------- modals

const openModals = [];

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openModals.length) openModals[openModals.length - 1].close();
});

/**
 * actions: [{ label, kind: "primary" | "danger" | "", run }]
 * run may be async. Throwing shows the message and keeps the modal open; returning false also
 * keeps it open; anything else closes it. An action without run just closes.
 */
export function openModal({ title, body, actions = [], size = "" }) {
  const error = h("div", { class: "modal-error", role: "alert" });
  const buttons = actions.map((action) =>
    h("button", {
      type: "button",
      class: "btn " + (action.kind || ""),
      onclick: async () => {
        if (!action.run) return api.close();
        buttons.forEach((b) => (b.disabled = true));
        error.textContent = "";
        try {
          if ((await action.run()) !== false) api.close();
        } catch (e) {
          error.textContent = e.message || String(e);
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      },
    }, action.label));

  const overlay = h("div", { class: "overlay" },
    h("div", { class: "modal " + size, role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal-header" },
        h("h2", null, title),
        h("button", { type: "button", class: "btn small", "aria-label": "Close", onclick: () => api.close() }, "✕")),
      h("div", { class: "modal-body" }, body),
      h("div", { class: "modal-footer" }, error, h("div", { class: "modal-buttons" }, buttons))));

  const api = {
    body,
    setError(message) { error.textContent = message || ""; },
    close() {
      overlay.remove();
      const i = openModals.indexOf(api);
      if (i >= 0) openModals.splice(i, 1);
    },
  };
  openModals.push(api);
  document.body.append(overlay);
  const first = overlay.querySelector(".modal-body input:not([disabled]), .modal-body select, .modal-body textarea");
  if (first) first.focus();
  return api;
}

/** Resolves true when the person confirms. */
export function confirmBox(title, message, okLabel = "Delete") {
  return new Promise((resolve) => {
    let answered = false;
    const modal = openModal({
      title,
      body: h("p", { class: "confirm-text" }, message),
      actions: [
        { label: "Cancel" },
        { label: okLabel, kind: "danger", run: () => { answered = true; resolve(true); } },
      ],
    });
    const close = modal.close;
    modal.close = () => { close(); if (!answered) resolve(false); };
  });
}

/**
 * Edits a simple list (traits, paths, the skill template).
 *   rows:     existing rows, each with an id
 *   columns:  [{ key, label, flex, max }]  - the first column is required
 *   isLocked: rows the current person may see but not change
 *   onSave:   receives { inserts, updates, deletes } containing only what changed
 */
export function openListEditor({ title, hint, rows, columns, addLabel = "Add", orderable = false, isLocked = () => false, lockedNote = "", onSave }) {
  const work = rows.map((r) => ({ ...r }));
  const list = h("div", { class: "list-editor" });
  const required = columns[0];

  function move(from, to) {
    const [row] = work.splice(from, 1);
    work.splice(to, 0, row);
    draw();
  }

  function draw() {
    list.replaceChildren(...work.map((row, i) => {
      const locked = isLocked(row);
      return h("div", { class: "list-row" + (locked ? " locked" : "") },
        columns.map((c) => h("input", {
          type: "text",
          style: `flex:${c.flex || 1}`,
          placeholder: c.label,
          "aria-label": c.label,
          maxlength: c.max || 200,
          value: row[c.key] ?? "",
          disabled: locked,
          oninput: (e) => { row[c.key] = e.target.value; },
        })),
        locked
          ? h("span", { class: "list-note" }, lockedNote)
          : [
              orderable && h("button", { type: "button", class: "btn small", title: "Move up", disabled: i === 0, onclick: () => move(i, i - 1) }, "▲"),
              orderable && h("button", { type: "button", class: "btn small", title: "Move down", disabled: i === work.length - 1, onclick: () => move(i, i + 1) }, "▼"),
              h("button", { type: "button", class: "btn small danger", onclick: () => { work.splice(i, 1); draw(); } }, "Remove"),
            ]);
    }));
    if (!work.length) list.append(h("p", { class: "dim" }, "Nothing here yet."));
  }
  draw();

  const body = h("div", null,
    hint && h("p", { class: "dim" }, hint),
    list,
    h("button", {
      type: "button", class: "btn", onclick: () => {
        work.push({});
        draw();
        const inputs = list.querySelectorAll(".list-row:last-child input");
        if (inputs[0]) inputs[0].focus();
      },
    }, "+ " + addLabel));

  openModal({
    title,
    body,
    size: "medium",
    actions: [
      { label: "Cancel" },
      {
        label: "Save", kind: "primary", run: async () => {
          const text = (row, c) => String(row[c.key] ?? "").trim();
          // Brand-new rows left empty are simply ignored.
          const kept = work.filter((r) => r.id || text(r, required));
          if (kept.some((r) => !text(r, required))) throw new Error(`Every row needs a ${required.label.toLowerCase()}.`);

          const inserts = [], updates = [];
          kept.forEach((row, index) => {
            const values = Object.fromEntries(columns.map((c) => [c.key, text(row, c)]));
            if (orderable) values.sort = index;
            if (!row.id) return inserts.push(values);
            const original = rows.find((o) => o.id === row.id);
            if (Object.keys(values).some((k) => values[k] !== (original[k] ?? ""))) updates.push({ id: row.id, ...values });
          });
          const deletes = rows.filter((o) => !kept.some((r) => r.id === o.id)).map((o) => o.id);

          if (inserts.length || updates.length || deletes.length) await onSave({ inserts, updates, deletes });
        },
      },
    ],
  });
}
