const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
const tpl = $("row");
const expanded = new Set();
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
let view = store.get("view", "all"); // "all", "desk" (only what's on my desk) or "done"
if (!["all", "desk", "done"].includes(view)) view = "all";
const groupLabels = { none: "No grouping", chat: "Chat", agent: "Agent", priority: "Priority", due: "Due date", time: "Date added" };
const orderLabels = { priority: "Priority", due: "Due date", added: "Date added", name: "Name", completed: "Date completed" };
const legacyGroup = Object.hasOwn(groupLabels, store.get("groupBy", "time")) ? store.get("groupBy", "time") : "time";
const layouts = {};
let savedLayouts = {};
try { savedLayouts = JSON.parse(store.get("listLayouts", "{}")) || {}; } catch {}
for (const name of ["all", "desk", "done"]) {
  const saved = savedLayouts[name] || {};
  const grouping = Object.hasOwn(groupLabels, saved.groupBy) ? saved.groupBy : name === "done" ? "none" : legacyGroup;
  const ordering = Object.hasOwn(orderLabels, saved.orderBy) && (saved.orderBy !== "completed" || name === "done")
    ? saved.orderBy : name === "done" ? "completed" : grouping === "due" ? "due" : "added";
  layouts[name] = { groupBy: grouping, orderBy: ordering,
    groupDescending: typeof saved.groupDescending === "boolean" ? saved.groupDescending : grouping === "priority" && store.get("lowFirst", "0") === "1",
    orderDescending: typeof saved.orderDescending === "boolean" ? saved.orderDescending : ["added", "completed"].includes(ordering) };
}
let groupBy, orderBy, groupDescending, orderDescending;
function useViewLayout() { ({ groupBy, orderBy, groupDescending, orderDescending } = layouts[view]); }
function saveLayout() {
  layouts[view] = { groupBy, orderBy, groupDescending, orderDescending };
  store.set("listLayouts", JSON.stringify(layouts));
  render();
}
useViewLayout();
const noteId = Number(new URLSearchParams(location.search).get("task")) || null;
if (noteId != null) {
  document.body.classList.add("sticky-note");
  $("note-handle").hidden = false;
}
const properties = { id: false, agent: true, chat: true, priority: true, due: true, added: true, completed: true, details: false };
try {
  const saved = JSON.parse(store.get("properties", "{}"));
  for (const key of Object.keys(properties)) if (typeof saved?.[key] === "boolean") properties[key] = saved[key];
} catch {}
let collapsedGroups = new Set();
try {
  const saved = JSON.parse(store.get("collapsedGroups", "[]"));
  if (Array.isArray(saved)) collapsedGroups = new Set(saved.filter(k => typeof k === "string"));
} catch {}
let tasks = [];
let lastJson = "";
const childrenOf = (id) => tasks.filter(t => t.parent_id === id).sort((a, b) => a.position - b.position || a.id - b.id);
let draggingSubtask = null;

// ---- time ----
const DAY = 86400;
function short(secs) {
  const s = Date.now() / 1000 - secs;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < DAY) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * DAY) return `${Math.floor(s / DAY)}d`;
  return new Date(secs * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const full = (secs) =>
  new Date(secs * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Due dates are plain YYYY-MM-DD days, compared in local time.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const daysFrom = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
function daysUntil(s) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((fromYmd(s) - today) / (DAY * 1000));
}
function dueText(s) {
  const n = daysUntil(s), d = fromYmd(s);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {};
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...year });
}
const dueLong = (s) => fromYmd(s).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
function dueBucket(s) {
  if (!s) return [9, "No due date"];
  const n = daysUntil(s);
  if (n < 0) return [0, "Overdue"];
  if (n === 0) return [1, "Today"];
  if (n === 1) return [2, "Tomorrow"];
  if (n < 7) return [3, "This week"];
  return [4, "Later"];
}

function timeBucket(secs) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = start.getTime() / 1000;
  if (secs >= today) return [0, "Today"];
  if (secs >= today - DAY) return [1, "Yesterday"];
  if (secs >= today - 6 * DAY) return [2, "This week"];
  return [3, "Earlier"];
}

// ---- rows ----
function source(t, { icon = true, chat = true } = {}) {
  const el = document.createElement("span");
  el.className = "src";
  const mine = !t.agent; // the user added it: no logo, no label
  if (icon && !mine) el.appendChild(agentIcon(t.agent));
  const label = chat ? t.chat || (icon && !mine ? agentInfo(t.agent).name : "") : "";
  if (label) {
    const c = document.createElement("span");
    c.className = "chat";
    c.textContent = label;
    el.appendChild(c);
  }
  return el;
}

function row(t, parent = null, index = 0) {
  const li = tpl.content.firstElementChild.cloneNode(true);
  li.dataset.taskId = t.id;
  const done = t.done_at != null;
  li.classList.toggle("done", done);
  li.classList.toggle("open", noteId === t.id || expanded.has(t.id));
  li.classList.toggle("subtask", parent != null);
  if (parent?.ordered) {
    const number = Object.assign(document.createElement("span"), { className: "subtask-number", textContent: `${index + 1}.` });
    number.setAttribute("aria-hidden", "true");
    li.querySelector(".line").prepend(number);
  }
  const titleText = li.querySelector(".title-text");
  titleText.textContent = t.title;
  if (!parent && view === "desk" && noteId == null && t.parent_id != null) {
    const origin = tasks.find(task => task.id === t.parent_id);
    const context = li.querySelector(".parent-context");
    context.hidden = false;
    context.querySelector("span").textContent = origin?.title || `Task #${t.parent_id}`;
    context.title = `Subtask of ${origin?.title || `task #${t.parent_id}`}`;
    context.setAttribute("aria-label", context.title);
  }
  const editText = (el, field) => {
    el.onclick = (e) => { e.stopPropagation(); if (!suppressSubtaskClick) startEdit(li, t, field); };
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (!suppressSubtaskClick) startEdit(li, t, field); }
    };
  };
  editText(titleText, "title");
  editText(li.querySelector(".body"), "details");
  const preview = li.querySelector(".preview");
  preview.textContent = t.details;
  preview.hidden = !properties.details || !t.details || noteId != null;
  const id = li.querySelector(".task-id");
  id.textContent = `#${t.id}`;
  id.hidden = !properties.id;

  // A row leaves out whatever its group header already says.
  const by = noteId != null || parent ? "" : groupBy;
  const showIcon = properties.agent && (parent ? t.agent !== parent.agent : by !== "chat" && by !== "agent");
  const showChat = properties.chat && (parent ? t.chat !== parent.chat : by !== "chat");
  if (showIcon || showChat) li.querySelector(".src").replaceWith(source(t, { icon: showIcon, chat: showChat }));

  const pill = li.querySelector(".prio");
  if (properties.priority && t.priority != null && by !== "priority") {
    pill.hidden = false;
    pill.dataset.p = t.priority;
    pill.textContent = `P${t.priority}`;
  }
  const due = li.querySelector(".due");
  // Grouped by due date, only the Today and Tomorrow headers name the day; other rows keep it.
  const headerSaysDay = by === "due" && t.due && [0, 1].includes(daysUntil(t.due));
  if (properties.due && t.due && !done && !headerSaysDay) {
    due.hidden = false;
    due.lastChild.textContent = dueText(t.due);
    const n = daysUntil(t.due);
    if (n <= 0) due.dataset.when = n < 0 ? "late" : "today";
    due.title = `Due ${dueLong(t.due)}`;
  }
  const dueBtn = li.querySelector(".set-due");
  dueBtn.classList.toggle("on", !!t.due);
  dueBtn.title = t.due ? `Due ${dueLong(t.due)}` : "Set a due date";
  dueBtn.onclick = (e) => { e.stopPropagation(); openDueMenu(dueBtn, t); };

  const deskBtn = li.querySelector(".set-desk");
  deskBtn.setAttribute("aria-pressed", t.mydesk);
  deskBtn.title = t.mydesk ? "Take off my desk" : "Put on my desk";
  deskBtn.onclick = async () => act("set_desk", { id: t.id, on: !t.mydesk });

  const prioBtn = li.querySelector(".set-prio");
  if (t.priority != null) prioBtn.dataset.p = t.priority;
  prioBtn.title = t.priority != null ? `Priority: P${t.priority}` : "Set priority";
  prioBtn.onclick = (e) => { e.stopPropagation(); openPrioMenu(prioBtn, t); };

  const when = done ? t.done_at : t.created_at;
  const time = li.querySelector(".time");
  time.textContent = li.querySelector(".time-sub").textContent = !parent && properties[done ? "completed" : "added"] ? short(when) : "";
  time.title = li.querySelector(".time-sub").title = done ? `Done ${full(when)}\nAdded ${full(t.created_at)}` : `Added ${full(when)}`;
  li.querySelector(".body").textContent = t.details || "Add details…";
  li.querySelector(".body").classList.toggle("placeholder", !t.details);

  const check = li.querySelector(".check");
  check.title = done ? "Mark not done" : "Mark done";
  const children = childrenOf(t.id);
  if (children.length && !done) {
    const count = children.filter(child => child.done_at != null).length;
    check.classList.add("has-progress");
    check.style.setProperty("--progress", `${count / children.length * 100}%`);
    check.title = `${count} of ${children.length} subtasks complete. Complete task and subtasks.`;
  }
  check.setAttribute("aria-label", check.title);
  check.onclick = async (e) => {
    e.stopPropagation();
    if (!done && !parent) {
      li.classList.add("checking");
      await new Promise((r) => setTimeout(r, 550));
    }
    act("set_done", { id: t.id, done: !done });
  };

  const line = li.querySelector(".line");
  line.tabIndex = 0;
  line.setAttribute("aria-label", `${t.title}: task details`);
  line.setAttribute("aria-expanded", noteId === t.id || expanded.has(t.id));
  li.querySelector(".details").id = `task-details-${t.id}`;
  line.setAttribute("aria-controls", `task-details-${t.id}`);
  line.onclick = () => {
    if (noteId === t.id || suppressSubtaskClick) return;
    const open = !expanded.has(t.id);
    open ? expanded.add(t.id) : expanded.delete(t.id);
    li.classList.toggle("open", open);
    line.setAttribute("aria-expanded", open);
    if (open) setTimeout(() => li.scrollIntoView({ block: "nearest", behavior: "smooth" }), 170);
  };
  line.onkeydown = (e) => {
    if (e.target !== line) return;
    if (parent && e.altKey && ["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const to = index + (e.key === "ArrowUp" ? -1 : 1);
      if (to >= 0 && to < childrenOf(parent.id).length) moveSubtask(parent.id, t.id, to, true);
    } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); line.onclick(); }
  };

  const link = li.querySelector(".open-link");
  if (t.link) {
    link.title = `Back to the conversation\n${t.link}`;
    // No alert(): it's a no-op in macOS webviews. Say it on the button instead.
    link.onclick = () =>
      invoke("open_link", { id: t.id }).catch((err) => {
        link.title = String(err);
        link.classList.add("failed");
        setTimeout(() => link.classList.remove("failed"), 1500);
      });
  } else {
    link.remove();
  }
  const deleteButton = li.querySelector(".delete");
  if (children.length) deleteButton.title = "Delete task and its subtasks";
  deleteButton.onclick = async () => act("delete_task", { id: t.id });
  const note = li.querySelector(".open-note");
  note.hidden = noteId === t.id;
  note.onclick = async () => {
    note.disabled = true;
    try { await invoke("open_note", { id: t.id }); }
    catch (e) { notice(String(e)); }
    finally { note.disabled = false; }
  };
  if (t.parent_id == null) {
    // A child selected for My desk has its own row there; don't render a duplicate inside its parent.
    const nestedChildren = children.map((child, i) => ({ child, i })).filter(({ child }) =>
      !(view === "desk" && noteId == null && child.mydesk && child.done_at == null));
    const section = li.querySelector(".subtasks");
    section.hidden = nestedChildren.length === 0;
    const firstSubtask = li.querySelector(".first-subtask");
    firstSubtask.hidden = nestedChildren.length > 0;
    firstSubtask.onclick = () => startNewSubtask(t.id);
    const mode = section.querySelector(".mode-chip");
    mode.setAttribute("aria-pressed", !!t.ordered);
    mode.title = t.ordered ? "Switch to checklist" : "Switch to ordered steps";
    mode.onclick = () => act("set_subtask_mode", { id: t.id, ordered: !t.ordered });
    section.querySelector(".add-subtask").onclick = () => startNewSubtask(t.id);
    section.querySelector(".subtask-list").append(...nestedChildren.map(({ child, i }) => row(child, t, i)));
  }
  if (parent) {
    line.title = "Drag to reorder. Alt + ↑ / ↓ also moves this subtask.";
    line.onpointerdown = (e) => beginSubtaskDrag(e, line, t.id, parent.id);
  }
  return li;
}

// Pointer dragging works consistently in desktop webviews and doesn't launch an OS text drag.
let suppressSubtaskClick = false;
function beginSubtaskDrag(event, line, id, parentId) {
  if (event.button !== 0 || editingId != null || event.target.closest("button, input, textarea")) return;
  const start = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  let destination = null;
  const move = (e) => {
    if (e.pointerId !== start.pointer) return;
    if (!line.isConnected) { end({ pointerId: start.pointer, type: "pointercancel" }); return; }
    if (!draggingSubtask && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
    e.preventDefault();
    if (!draggingSubtask) {
      draggingSubtask = { id, parentId };
      line.setPointerCapture(start.pointer);
      line.parentElement.classList.add("dragging");
    }
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".task.subtask");
    const siblings = childrenOf(parentId);
    destination = target ? siblings.findIndex(t => t.id === Number(target.dataset.taskId)) : -1;
    document.querySelectorAll(".drop-target").forEach(el => el.classList.remove("drop-target"));
    if (destination >= 0 && Number(target.dataset.taskId) !== id) target.classList.add("drop-target");
    const main = $("main"), bounds = main.getBoundingClientRect();
    if (e.clientY > bounds.bottom - 24) main.scrollBy(0, 12);
    else if (e.clientY < bounds.top + 24) main.scrollBy(0, -12);
  };
  const end = (e) => {
    if (e.pointerId !== start.pointer) return;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", end);
    document.removeEventListener("pointercancel", end);
    const dragged = draggingSubtask != null;
    draggingSubtask = null;
    if (line.hasPointerCapture(start.pointer)) line.releasePointerCapture(start.pointer);
    document.querySelectorAll(".dragging, .drop-target").forEach(el => el.classList.remove("dragging", "drop-target"));
    if (dragged) {
      suppressSubtaskClick = true;
      setTimeout(() => { suppressSubtaskClick = false; }, 0);
      if (e.type === "pointerup" && destination != null && destination >= 0) moveSubtask(parentId, id, destination);
      else render();
    }
  };
  document.addEventListener("pointermove", move, { passive: false });
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

async function moveSubtask(parentId, id, position, focus = false) {
  const ids = childrenOf(parentId).map(t => t.id);
  const from = ids.indexOf(id);
  if (editingId != null) return;
  if (from < 0 || from === position) { render(); return; }
  ids.splice(from, 1);
  ids.splice(position, 0, id);
  await act("reorder_subtasks", { parentId, ids });
  if (focus) document.querySelector(`.task[data-task-id="${id}"] > .line`)?.focus();
}

async function startNewSubtask(parentId) {
  if (editingId != null && !await finishEditing?.(true)) return;
  const parentRow = document.querySelector(`.task[data-task-id="${parentId}"]`);
  if (!parentRow) return;
  expanded.add(parentId);
  parentRow.classList.add("open");
  parentRow.querySelector(".subtasks").hidden = false;
  parentRow.querySelector(".first-subtask").hidden = true;
  const draft = document.createElement("li");
  draft.className = "subtask new-subtask";
  draft.innerHTML = '<form class="line"><span class="check"></span><input maxlength="300" aria-label="New subtask" placeholder="Add a subtask" autocomplete="off"></form>';
  parentRow.querySelector(".subtask-list").append(draft);
  const field = draft.querySelector("input");
  const editKey = `new:${parentId}`;
  editingId = editKey;
  let saving = false;
  const finish = async (save) => {
    if (saving || editingId !== editKey || finishEditing !== finish) return false;
    const title = field.value.trim();
    if (!save || !title) { editingId = null; render(); return true; }
    saving = true;
    field.readOnly = true;
    try {
      let list = await invoke("add_subtask", { parentId, title });
      if (noteId != null) list = await invoke("list_note", { id: noteId });
      editingId = null;
      update(list);
      return true;
    } catch (e) {
      saving = false;
      field.readOnly = false;
      notice(`Couldn't add subtask: ${e}`);
      field.focus();
      return false;
    }
  };
  finishEditing = finish;
  draft.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const title = field.value.trim();
    if (await finish(true) && title) startNewSubtask(parentId);
  };
  field.onkeydown = (e) => { if (e.key === "Escape") { e.stopPropagation(); finish(false); } };
  field.onblur = () => setTimeout(() => { if (document.activeElement !== field) finish(true); });
  field.focus();
}

// ---- groups ----
const compareText = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
function orderedTasks(items) {
  const value = t => ({ priority: t.priority, due: t.due, added: t.created_at, completed: t.done_at, name: t.title })[orderBy];
  return [...items].sort((a, b) => {
    const av = value(a), bv = value(b);
    if (av == null || bv == null) return (av == null) - (bv == null) || a.id - b.id;
    const comparison = typeof av === "number" ? av - bv : compareText(av, bv);
    return comparison * (orderDescending ? -1 : 1) || a.id - b.id;
  });
}
function directionLabel(field, reverse, grouping = false) {
  if (field === "priority") return reverse ? "P3 first" : "P0 first";
  if (field === "due") return reverse ? "Latest first" : "Earliest first";
  if (grouping && field === "time") return reverse ? "Oldest first" : "Newest first";
  if (["added", "completed"].includes(field)) return reverse ? "Newest first" : "Oldest first";
  return reverse ? "Z to A" : "A to Z";
}
function groupsOf(open) {
  if (groupBy === "none") return [{ k: "", label: "", items: orderedTasks(open) }];
  const key = {
    time: (t) => timeBucket(t.created_at),
    chat: (t) => (t.chat ? ["c:" + t.chat, t.chat] : t.agent ? ["a:" + agentInfo(t.agent).name, agentInfo(t.agent).name] : ["", ""]),
    agent: (t) => (t.agent ? [agentInfo(t.agent).name, agentInfo(t.agent).name] : ["", ""]),
    // Headers show just the pill (the hint names like "Today" read as dates up here).
    priority: (t) => (t.priority == null ? [9, "No priority"] : [t.priority, `P${t.priority}`]),
    due: (t) => dueBucket(t.due),
  }[groupBy] || ((t) => [0, ""]);

  const map = new Map();
  for (const t of open) {
    const [k, label] = key(t);
    if (!map.has(k)) map.set(k, { k, label, sample: t, items: [] });
    map.get(k).items.push(t);
  }
  const groups = [...map.values()];
  const missing = g => ["priority", "due"].includes(groupBy) ? g.k === 9 : !g.label;
  groups.sort((a, b) => Number(missing(a)) - Number(missing(b)) ||
    (typeof a.k === "number" ? a.k - b.k : compareText(a.label, b.label)) * (groupDescending ? -1 : 1));
  for (const group of groups) group.items = orderedTasks(group.items);
  return groups;
}

const VIEWS = {
  all: { name: "Tasks", empty: "All clear.", show: (t) => t.done_at == null },
  desk: { name: "My desk", empty: "Nothing on your desk.", show: (t) => t.done_at == null && t.mydesk },
  done: { name: "Completed", empty: "Nothing finished this week.", show: (t) => t.done_at != null },
};
const tasksForView = (name) => tasks.filter(t => (name === "desk" || t.parent_id == null) && VIEWS[name].show(t));

function render() {
  if (editingId != null || draggingSubtask != null) return;
  const v = VIEWS[view];
  const open = noteId != null ? tasks.filter(t => t.id === noteId) : tasksForView(view);
  const groups = noteId != null ? [{ label: "", items: open }] : groupsOf(open);
  const headers = groupBy !== "none" && noteId == null;

  $("open").replaceChildren(
    ...groups.map((g, index) => {
      const sec = document.createElement("section");
      const ul = document.createElement("ul");
      ul.id = `group-items-${index}`;
      if (headers) {
        const h = document.createElement("h2");
        const toggle = document.createElement("button");
        toggle.className = "group-head";
        const key = JSON.stringify([view, groupBy, g.k]);
        ul.hidden = collapsedGroups.has(key);
        toggle.setAttribute("aria-expanded", !ul.hidden);
        toggle.setAttribute("aria-controls", ul.id);
        toggle.setAttribute("aria-label", `${g.label || "Personal"}, ${g.items.length} tasks`);
        if (groupBy === "priority" && g.k !== 9) {
          toggle.appendChild(Object.assign(document.createElement("span"), { className: "prio", textContent: `P${g.k}` }));
          toggle.lastChild.dataset.p = g.k;
        } else if (groupBy === "chat" || groupBy === "agent") {
          toggle.appendChild(agentIcon(g.sample.agent));
        }
        // Overdue and Today read in the same red and orange as the due dates on rows.
        if (groupBy === "due" && g.k <= 1) toggle.dataset.when = g.k === 0 ? "late" : "today";
        const text = groupBy === "priority" && g.k !== 9 ? "" : g.label || "Personal";
        toggle.append(text, Object.assign(document.createElement("span"), { className: "n", textContent: g.items.length }));
        toggle.appendChild(Object.assign(document.createElement("span"), { className: "group-chevron", textContent: "›" }));
        toggle.onclick = () => {
          ul.hidden = !ul.hidden;
          toggle.setAttribute("aria-expanded", !ul.hidden);
          ul.hidden ? collapsedGroups.add(key) : collapsedGroups.delete(key);
          store.set("collapsedGroups", JSON.stringify([...collapsedGroups]));
        };
        h.appendChild(toggle);
        sec.appendChild(h);
      }
      ul.append(...g.items.map(t => row(t)));
      sec.appendChild(ul);
      return sec;
    })
  );
  $("count").textContent = open.length || "";
  $("problem").hidden = !problem;
  $("problem").querySelector("p").textContent = problem;
  $("empty").hidden = open.length > 0 || !form.hidden || !!problem;
  $("empty").textContent = noteId != null ? "This task was deleted." : v.empty;
  $("heading").textContent = noteId != null ? "Sticky note" : v.name;
  input.placeholder = view === "desk" ? "Add to your desk" : "Add a task";
  for (const b of viewMenu.querySelectorAll("[data-view]")) {
    b.setAttribute("aria-checked", b.dataset.view === view);
    b.querySelector(".n").textContent = tasksForView(b.dataset.view).length || "";
  }
  $("group-field").value = groupBy;
  $("order-field").value = orderBy;
  const completedOption = $("order-field").querySelector('[value="completed"]');
  completedOption.hidden = completedOption.disabled = view !== "done";
  for (const [id, field, reversed, grouping] of [["group-direction", groupBy, groupDescending, true], ["order-direction", orderBy, orderDescending, false]]) {
    const button = $(id);
    button.disabled = field === "none";
    button.textContent = reversed ? "↓" : "↑";
    button.title = field === "none" ? "No grouping" : `${directionLabel(field, reversed, grouping)}. Click to reverse.`;
    button.setAttribute("aria-label", `${grouping ? "Group" : "Task"} order: ${button.title}`);
  }
  $("group").title = `Grouping: ${groupLabels[groupBy]}. Ordering: ${orderLabels[orderBy]}, ${directionLabel(orderBy, orderDescending).toLowerCase()}.`;
  for (const b of document.querySelectorAll("[data-property]")) b.setAttribute("aria-pressed", properties[b.dataset.property]);
}

// ---- editing a task in place ----
// While one is being edited, incoming changes wait so they don't wipe out what you're typing.
let editingId = null;
let finishEditing = null;
async function startEdit(li, t, field) {
  if (editingId != null) {
    if (!await finishEditing?.(true)) return;
    li = document.querySelector(`.task[data-task-id="${t.id}"]`);
    t = tasks.find(task => task.id === t.id);
    if (!li || !t) return;
  }
  editingId = t.id;
  li.classList.add("editing");
  const target = li.querySelector(field === "title" ? ".title" : ".body");
  const input = Object.assign(document.createElement("textarea"), {
    className: field === "title" ? "edit-title" : "edit-details",
    value: t[field], rows: 1,
  });
  if (field === "title") input.maxLength = 300;
  input.setAttribute("aria-label", field === "title" ? "Task title" : "Task details");
  target.replaceChildren(input);
  input.title = "Click away to save. Esc cancels.";
  input.oninput = () => { input.style.height = "auto"; input.style.height = `${input.scrollHeight}px`; };
  input.oninput();
  let saving = false;
  const finish = async (save) => {
    if (saving || editingId !== t.id || finishEditing !== finish) return false;
    const value = field === "title" ? input.value.trim() : input.value.trimEnd();
    if (!save || value === t[field]) { editingId = null; render(); return true; }
    if (field === "title" && !value) { notice("A task needs a title. Esc cancels."); input.focus(); return false; }
    saving = true;
    input.readOnly = true;
    try {
      // Send only the field being edited, preserving concurrent agent changes to other fields.
      let list = await invoke("edit_task", { id: t.id, [field]: value });
      if (noteId != null) list = await invoke("list_note", { id: noteId });
      editingId = null;
      $("notice").hidden = true;
      update(list);
      return true;
    } catch (e) {
      saving = false;
      input.readOnly = false;
      notice(`Couldn't save: ${e}`);
      input.focus();
      return false;
    }
  };
  finishEditing = finish;
  input.onclick = (e) => e.stopPropagation();
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && (field === "title" || e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  };
  input.onblur = () => setTimeout(() => { if (document.activeElement !== input) finish(true); });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// Set when the list can't be read (say, its synced folder is offline). Shown instead of the list.
let problem = "";

function update(list) {
  tasks = list;
  lastJson = JSON.stringify(list);
  problem = "";
  if (editingId == null) render();
}

async function refresh() {
  try {
    const list = await invoke(noteId != null ? "list_note" : "list", noteId != null ? { id: noteId } : undefined);
    if (problem || JSON.stringify(list) !== lastJson) update(list);
  } catch (e) {
    problem = String(e);
    tasks = [];
    lastJson = "";
    render();
  }
}

// Changes go through here so a failure (the file went missing mid-way) shows up too.
async function act(cmd, args) {
  try {
    const list = await invoke(cmd, args);
    update(noteId != null ? await invoke("list_note", { id: noteId }) : list);
  } catch (e) {
    notice(String(e));
    refresh();
  }
}

// ---- adding your own task ----
const form = $("new-task");
const input = $("new-title");
const closeNew = () => { input.value = ""; form.hidden = true; };
$("add").onclick = () => {
  if (view === "done") { view = "all"; store.set("view", view); useViewLayout(); render(); }
  form.hidden = false;
  $("empty").hidden = true;
  $("main").scrollTop = 0;
  input.focus();
};
form.onsubmit = async (e) => {
  e.preventDefault();
  const title = input.value.trim();
  if (!title) return closeNew();
  input.value = ""; // stay open for the next one
  act("add_task", { title, mydesk: view === "desk" });
};
input.onkeydown = (e) => { if (e.key === "Escape") { closeNew(); render(); } };
input.onblur = () => { if (input.value.trim()) form.requestSubmit(); closeNew(); render(); };

// ---- header tools ----
// ---- the view menu (the header): what to show, and where the list lives ----
const viewMenu = $("view-menu");
const setViewMenu = (open) => {
  viewMenu.hidden = !open;
  $("view").setAttribute("aria-expanded", open);
};
$("view").onclick = async (e) => {
  e.stopPropagation();
  setMenu(false); setDisplayMenu(false); closeFloating();
  if (!viewMenu.hidden) return setViewMenu(false);
  const loc = await invoke("location");
  $("where").textContent = loc.short;
  $("where").title = loc.folder;
  setViewMenu(true);
};
viewMenu.onclick = (e) => {
  const b = e.target.closest("[data-view]");
  if (!b) return;
  view = b.dataset.view;
  store.set("view", view);
  useViewLayout();
  setViewMenu(false);
  render();
  $("main").scrollTop = 0;
};
let noticeTimer;
function notice(text) {
  $("notice").textContent = text;
  $("notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").hidden = true), 6000);
}
async function closeNote() {
  if (editingId != null && !await finishEditing?.(true)) return;
  invoke("close_note").catch(e => notice(String(e)));
}
$("close-note").onclick = closeNote;
$("note-handle").onmousedown = (e) => {
  if (e.button !== 0 || e.target.closest("button")) return;
  e.preventDefault();
  invoke("drag_note").catch(e => notice(String(e)));
};
async function pickFolder() {
  setViewMenu(false);
  try {
    const msg = await invoke("pick_folder");
    if (msg) notice(msg);
  } catch (e) {
    notice(String(e));
  }
  refresh();
}
$("change-folder").onclick = pickFolder;
document.querySelector("#problem .pick-folder").onclick = pickFolder;
$("open-file").onclick = () => {
  setViewMenu(false);
  invoke("open_file").catch((e) => notice(String(e)));
};
const displayMenu = $("display-menu");
function setDisplayMenu(open) {
  displayMenu.hidden = !open;
  $("display").setAttribute("aria-expanded", open);
}
$("display").onclick = (e) => {
  e.stopPropagation();
  setMenu(false); setViewMenu(false); closeFloating();
  setDisplayMenu(displayMenu.hidden);
};
displayMenu.onclick = (e) => {
  const b = e.target.closest("[data-property]");
  if (!b) return;
  const key = b.dataset.property;
  properties[key] = !properties[key];
  b.setAttribute("aria-pressed", properties[key]);
  store.set("properties", JSON.stringify(properties));
  render();
};

const menu = $("group-menu");
const setMenu = (open) => {
  menu.hidden = !open;
  if (open) menu.style.top = `${$("group").getBoundingClientRect().bottom + 5}px`;
  $("group").setAttribute("aria-expanded", open);
};
$("group").onclick = (e) => { e.stopPropagation(); setViewMenu(false); setDisplayMenu(false); closeFloating(); setMenu(menu.hidden); };
$("group-field").onchange = () => { groupBy = $("group-field").value; groupDescending = false; saveLayout(); };
$("order-field").onchange = () => {
  orderBy = $("order-field").value;
  orderDescending = ["added", "completed"].includes(orderBy);
  saveLayout();
};
$("group-direction").onclick = () => { groupDescending = !groupDescending; saveLayout(); };
$("order-direction").onclick = () => { orderDescending = !orderDescending; saveLayout(); };

// ---- priority picker (one floating menu, placed next to whichever task's button) ----
const prioMenu = $("prio-menu");
let prioTask = null;
function openPrioMenu(btn, t) {
  prioTask = t;
  for (const b of prioMenu.querySelectorAll("button")) {
    b.setAttribute("aria-checked", b.dataset.p === (t.priority == null ? "" : String(t.priority)));
  }
  place(prioMenu, btn);
}
function place(menu, btn) {
  closeFloating();
  menu.hidden = false;
  const r = btn.getBoundingClientRect();
  const h = menu.offsetHeight;
  menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
  // Open downward if it fits, otherwise upward.
  menu.style.top = r.bottom + 4 + h < innerHeight ? `${r.bottom + 4}px` : `${Math.max(8, r.top - 4 - h)}px`;
}
function closeFloating() {
  prioMenu.hidden = true;
  dueMenu.hidden = true;
}
prioMenu.onclick = async (e) => {
  const b = e.target.closest("button[data-p]");
  if (!b || !prioTask) return;
  prioMenu.hidden = true;
  const priority = b.dataset.p === "" ? null : Number(b.dataset.p);
  act("set_priority", { id: prioTask.id, priority });
};

// ---- due date picker ----
const dueMenu = $("due-menu");
let dueTask = null;
let month = new Date();
function weekStart() {
  try {
    const loc = new Intl.Locale(navigator.language);
    const info = loc.getWeekInfo?.() || loc.weekInfo;
    if (info) return info.firstDay % 7; // 7 = Sunday
  } catch {}
  return 0;
}
function openDueMenu(btn, t) {
  dueTask = t;
  const base = t.due ? fromYmd(t.due) : new Date();
  month = new Date(base.getFullYear(), base.getMonth(), 1);
  drawMonth();
  place(dueMenu, btn);
}
function drawMonth() {
  $("cal-title").textContent = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const first = weekStart();
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 7 + ((first + i) % 7)); // Jan 7 2024 was a Sunday
    cells.push(Object.assign(document.createElement("span"), { className: "dow", textContent: d.toLocaleDateString(undefined, { weekday: "narrow" }) }));
  }
  for (let i = (month.getDay() - first + 7) % 7; i > 0; i--) cells.push(document.createElement("span"));
  const today = ymd(new Date());
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let n = 1; n <= days; n++) {
    const s = ymd(new Date(month.getFullYear(), month.getMonth(), n));
    const b = Object.assign(document.createElement("button"), { textContent: n, title: dueLong(s) });
    b.dataset.date = s;
    b.classList.toggle("today", s === today);
    b.classList.toggle("past", s < today);
    b.setAttribute("aria-checked", dueTask?.due === s);
    cells.push(b);
  }
  $("cal-grid").replaceChildren(...cells);
}
dueMenu.onclick = async (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    month.setMonth(month.getMonth() + Number(nav.dataset.nav));
    return drawMonth();
  }
  const b = e.target.closest("[data-date], [data-quick]");
  if (!b || !dueTask) return;
  const q = b.dataset.quick;
  const due = b.dataset.date || (q === "clear" ? null : daysFrom(Number(q)));
  dueMenu.hidden = true;
  act("set_due", { id: dueTask.id, due });
};

document.addEventListener("click", (e) => {
  if (!displayMenu.hidden && !displayMenu.contains(e.target)) setDisplayMenu(false);
  if (!menu.hidden && !menu.contains(e.target)) setMenu(false);
  if (!viewMenu.hidden && !viewMenu.contains(e.target)) setViewMenu(false);
  if (!prioMenu.hidden && !prioMenu.contains(e.target)) prioMenu.hidden = true;
  if (!dueMenu.hidden && !dueMenu.contains(e.target)) dueMenu.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setDisplayMenu(false); setMenu(false); setViewMenu(false); closeFloating(); }
});
document.addEventListener("keydown", (e) => {
  if (noteId != null && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
    e.preventDefault(); e.stopPropagation(); closeNote();
  }
}, true);
$("main").addEventListener("scroll", closeFloating);

listen("tasks-changed", refresh);
window.addEventListener("storage", (e) => {
  if (e.key === "properties") {
    try {
      const saved = JSON.parse(e.newValue || "{}");
      for (const key of Object.keys(properties)) if (typeof saved?.[key] === "boolean") properties[key] = saved[key];
      render();
    } catch {}
  }
});
// Coming back to the window: fresh "2h" labels, and yesterday's desk cleared.
window.addEventListener("focus", () => { if (editingId == null) { render(); refresh(); } });
refresh();
