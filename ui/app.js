const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (id) => document.getElementById(id);
const tpl = $("row");
const expanded = new Set();
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
let showDone = store.get("showDone", "0") === "1";
let groupBy = store.get("groupBy", "time");
let lowFirst = store.get("lowFirst", "0") === "1"; // grouped by priority: P3 first instead of P0
let deskOnly = store.get("deskOnly", "0") === "1"; // only what's on my desk
let pinned = false;
let tasks = [];
let lastJson = "";

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

function row(t) {
  const li = tpl.content.firstElementChild.cloneNode(true);
  const done = t.done_at != null;
  li.classList.toggle("done", done);
  li.classList.toggle("open", expanded.has(t.id));
  li.querySelector(".title").textContent = t.title;

  // What the second line shows depends on what the group header already says.
  const showIcon = done || (groupBy !== "chat" && groupBy !== "agent");
  const showChat = done || groupBy !== "chat";
  if (showIcon || showChat) li.querySelector(".src").replaceWith(source(t, { icon: showIcon, chat: showChat }));

  const pill = li.querySelector(".prio");
  if (t.priority != null && groupBy !== "priority") {
    pill.hidden = false;
    pill.dataset.p = t.priority;
    pill.textContent = `P${t.priority}`;
  }
  const due = li.querySelector(".due");
  if (t.due && !done) {
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
  deskBtn.onclick = async () => update(await invoke("set_desk", { id: t.id, on: !t.mydesk }));

  const prioBtn = li.querySelector(".set-prio");
  if (t.priority != null) prioBtn.dataset.p = t.priority;
  prioBtn.title = t.priority != null ? `Priority: P${t.priority}` : "Set priority";
  prioBtn.onclick = (e) => { e.stopPropagation(); openPrioMenu(prioBtn, t); };

  const when = done ? t.done_at : t.created_at;
  const time = li.querySelector(".time");
  time.textContent = li.querySelector(".time-sub").textContent = short(when);
  time.title = `${done ? "Done" : "Added"} ${full(when)}`;

  const added = t.agent ? `From ${agentInfo(t.agent).name}, ${full(t.created_at)}` : `Added ${full(t.created_at)}`;
  li.querySelector(".stamp").textContent = added + (done ? `. Done ${full(t.done_at)}` : "");
  li.querySelector(".body").textContent = t.details;

  const check = li.querySelector(".check");
  check.title = done ? "Mark not done" : "Mark done";
  check.onclick = async (e) => {
    e.stopPropagation();
    if (!done) {
      li.classList.add("checking");
      await new Promise((r) => setTimeout(r, 550));
    }
    update(await invoke("set_done", { id: t.id, done: !done }));
  };

  li.querySelector(".line").onclick = () => {
    const open = !expanded.has(t.id);
    open ? expanded.add(t.id) : expanded.delete(t.id);
    li.classList.toggle("open", open);
    if (open) setTimeout(() => li.scrollIntoView({ block: "nearest", behavior: "smooth" }), 170);
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
  li.querySelector(".delete").onclick = async () => update(await invoke("delete_task", { id: t.id }));
  return li;
}

// ---- groups ----
function groupsOf(open) {
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
  // Time groups in calendar order; others by their newest task (tasks arrive newest-first).
  if (groupBy === "time") groups.sort((a, b) => a.k - b.k);
  else if (groupBy === "due") {
    groups.sort((a, b) => a.k - b.k);
    for (const g of groups) g.items.sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  }
  else if (groupBy === "priority") {
    // "No priority" (k = 9) stays last either way.
    groups.sort((a, b) => (a.k === 9) - (b.k === 9) || (lowFirst ? b.k - a.k : a.k - b.k));
  }
  else groups.sort((a, b) => (a.label ? 1 : 0) - (b.label ? 1 : 0)); // unlabeled (yours) first
  return groups;
}

function render() {
  const shown = (t) => !deskOnly || t.mydesk;
  const open = tasks.filter((t) => t.done_at == null && shown(t));
  const done = tasks.filter((t) => t.done_at != null && shown(t));
  const groups = groupsOf(open);
  const headers = groupBy !== "time" || groups.length > 1;

  $("open").replaceChildren(
    ...groups.map((g) => {
      const sec = document.createElement("section");
      if (headers && g.label) {
        const h = document.createElement("h2");
        h.className = "group-head";
        if (groupBy === "priority" && g.k !== 9) {
          h.appendChild(Object.assign(document.createElement("span"), { className: "prio", textContent: `P${g.k}` }));
          h.lastChild.dataset.p = g.k;
        } else if (groupBy === "chat" || groupBy === "agent") {
          h.appendChild(agentIcon(g.sample.agent));
        }
        const text = groupBy === "priority" && g.k !== 9 ? "" : g.label; // the pill already says P1
        h.append(text, Object.assign(document.createElement("span"), { className: "n", textContent: g.items.length }));
        sec.appendChild(h);
      }
      const ul = document.createElement("ul");
      ul.append(...g.items.map(row));
      sec.appendChild(ul);
      return sec;
    })
  );
  $("done").replaceChildren(...done.map(row));
  $("count").textContent = open.length || "";
  $("empty").hidden = open.length > 0 || !form.hidden;
  $("empty").textContent = deskOnly ? "Nothing on your desk." : "All clear.";
  $("heading").textContent = deskOnly ? "My desk" : "Tasks";
  $("desk").setAttribute("aria-pressed", deskOnly);
  $("desk").title = deskOnly ? "Show all tasks" : "My desk";
  input.placeholder = deskOnly ? "Add to your desk" : "Add a task";
  $("done-section").hidden = !showDone || done.length === 0;
  $("toggle-done").setAttribute("aria-pressed", showDone);
  $("toggle-done").title = showDone ? "Hide completed" : "Show completed";
  for (const b of document.querySelectorAll("[data-group]")) b.setAttribute("aria-checked", b.dataset.group === groupBy);
  document.querySelector('[data-group="priority"]').dataset.order = lowFirst ? "P3 first" : "P0 first";
  $("group").title = `Group by: ${{ time: "time added", chat: "chat", agent: "agent", priority: "priority", due: "due date" }[groupBy]}`;
}

function update(list) {
  tasks = list;
  lastJson = JSON.stringify(list);
  render();
}

async function refresh() {
  const list = await invoke("list");
  if (JSON.stringify(list) !== lastJson) update(list);
}

// ---- adding your own task ----
const form = $("new-task");
const input = $("new-title");
const closeNew = () => { input.value = ""; form.hidden = true; };
$("add").onclick = () => {
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
  update(await invoke("add_task", { title, mydesk: deskOnly }));
};
input.onkeydown = (e) => { if (e.key === "Escape") { closeNew(); render(); } };
input.onblur = () => { if (input.value.trim()) form.requestSubmit(); closeNew(); render(); };

// ---- header tools ----
$("toggle-done").onclick = () => {
  showDone = !showDone;
  store.set("showDone", showDone ? "1" : "0");
  render();
};
$("desk").onclick = () => {
  deskOnly = !deskOnly;
  store.set("deskOnly", deskOnly ? "1" : "0");
  render();
};
$("pin").onclick = async () => {
  pinned = !pinned;
  await invoke("set_pinned", { pinned });
  $("pin").setAttribute("aria-pressed", pinned);
  $("pin").title = pinned ? "Stop keeping on top" : "Keep on top";
};

const menu = $("group-menu");
const setMenu = (open) => {
  menu.hidden = !open;
  $("group").setAttribute("aria-expanded", open);
};
$("group").onclick = (e) => { e.stopPropagation(); setMenu(menu.hidden); };
menu.onclick = (e) => {
  const b = e.target.closest("[data-group]");
  if (!b) return;
  // Picking Priority again flips the order.
  if (b.dataset.group === "priority" && groupBy === "priority") store.set("lowFirst", (lowFirst = !lowFirst) ? "1" : "0");
  groupBy = b.dataset.group;
  store.set("groupBy", groupBy);
  setMenu(false);
  render();
};

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
  update(await invoke("set_priority", { id: prioTask.id, priority }));
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
  update(await invoke("set_due", { id: dueTask.id, due }));
};

document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target)) setMenu(false);
  if (!prioMenu.hidden && !prioMenu.contains(e.target)) prioMenu.hidden = true;
  if (!dueMenu.hidden && !dueMenu.contains(e.target)) dueMenu.hidden = true;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { setMenu(false); closeFloating(); }
});
$("main").addEventListener("scroll", closeFloating);

listen("tasks-changed", refresh);
window.addEventListener("focus", () => render()); // keeps "2h" labels fresh
refresh();
