// My Desk is one day's overlay on existing tasks. All writes go through the native
// store; proposal IDs and dates keep a stale window from accepting a different plan.
class DeskController {
  constructor({ invoke, refresh, finishEditing, place }) {
    this.invoke = invoke;
    this.refresh = refresh;
    this.finishEditing = finishEditing;
    this.place = place;
    this.state = null;
    this.sequence = 0;
    this.renderedJson = "";
    this.busy = false;
    this.error = "";
    this.$ = id => document.getElementById(id);
    this.$("desk-accept").onclick = () => this.review(true);
    this.$("desk-decline").onclick = () => this.review(false);
    this.$("desk-time-form").onsubmit = event => { event.preventDefault(); this.saveTime(); };
    for (const id of ["desk-start", "desk-duration"]) {
      const input = this.$(id);
      input.onclick = () => this.showChoices(id);
      input.oninput = () => { this.dirty = true; this.updateClearButtons(); this.$("desk-time-error").hidden = true; this.showChoices(id, true); };
      input.onblur = () => { if (!this.$("desk-time-dialog").hidden && this.dirty) this.saveTime(); };
      input.onkeydown = event => this.choiceKey(event, id);
      this.$(`${id}-toggle`).onpointerdown = event => event.preventDefault();
      this.$(`${id}-toggle`).onclick = () => {
        if (this.choiceField === id) this.hideChoices();
        else { input.focus({preventScroll:true}); this.showChoices(id); }
      };
      this.$(`${id}-clear`).onpointerdown = event => event.preventDefault();
      this.$(`${id}-clear`).onclick = () => {
        input.value = "";
        if (id === "desk-start") this.$("desk-duration").value = "";
        this.dirty = true; this.updateClearButtons(); this.saveTime();
      };
    }
    document.addEventListener("pointerdown", event => {
      if (!this.$("desk-time-dialog").hidden && !this.$("desk-time-dialog").contains(event.target)) this.closeTime(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || this.$("desk-time-dialog").hidden) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.choiceField) this.hideChoices(); else this.closeTime();
    }, true);
    window.addEventListener("resize", () => {
      this.updateClock();
      if (this.$("desk-time-dialog").hidden) return;
      this.positionTime();
      if (this.choiceField) this.positionChoices(this.choiceField);
    });
  }
  minutes(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(":").map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  time(value, period = false) {
    const minute = this.minutes(value);
    if (minute == null) return "—";
    const date = new Date(); date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", ...(period ? {} : { hour12: false }) });
  }
  async load() {
    const sequence = ++this.sequence;
    const state = await this.invoke("get_desk");
    if (sequence !== this.sequence) return false;
    const changed = JSON.stringify(state) !== this.renderedJson;
    if (this.state?.proposal?.id !== state.proposal?.id) this.error = "";
    this.state = state;
    return changed;
  }
  entries(tasks) {
    const ids = new Set(tasks.filter(task => task.done_at == null).map(task => task.id));
    return (this.state?.proposal?.items || this.state?.items || []).filter(item => ids.has(item.id))
      .map((item, index) => ({ ...item, index }))
      .sort((a, b) => (this.minutes(a.start) ?? Infinity) - (this.minutes(b.start) ?? Infinity) || a.index - b.index);
  }
  render(active, tasks) {
    this.active = active;
    this.tasks = tasks;
    document.body.classList.toggle("desk-view", active);
    this.hasTimes = this.entries(tasks).some(item => item.start);
    document.body.classList.toggle("desk-has-times", active && this.hasTimes);
    this.renderedJson = JSON.stringify(this.state);
    this.$("desk-head").hidden = !active || !this.state;
    if (!active || !this.state) return;
    const state = this.state, proposal = state.proposal;
    // Local noon avoids UTC date shifts and DST edges for date-only values.
    const [y, m, d] = state.date.split("-").map(Number);
    this.$("desk-date").textContent = new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    this.$("desk-review").hidden = !proposal;
    this.$("desk-proposal-label").textContent = proposal?.agent ? `${agentInfo(proposal.agent).name}’s suggestion` : "Suggested arrangement";
    this.$("desk-accept").disabled = this.busy || !!state.proposal_error;
    this.$("desk-decline").disabled = this.busy;
    this.$("desk-error").hidden = !(this.error || state.proposal_error);
    this.$("desk-error").textContent = this.error || state.proposal_error || "";
    this.$("desk-timeline").hidden = !this.hasTimes;
    this.renderTimeline();
    this.updateClock();
  }
  updateClock() {
    if (!this.active || !this.state || !this.hasTimes && !this.timelineDrag) return;
    const now = new Date(), minute = now.getHours() * 60 + now.getMinutes();
    this.$("desk-now-pill").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const start = this.minutes(this.state.work_start), end = this.minutes(this.state.work_end);
    const progress = Math.max(0, Math.min(100, (minute - start) / (end - start) * 100));
    this.$("desk-now-marker").style.left = `${progress}%`;
    const track = this.$("desk-markers").clientWidth, pill = this.$("desk-now-pill").offsetWidth, position = progress / 100 * track;
    this.$("desk-now-pill").style.left = `${Math.max(-position, Math.min(-pill / 2, track - position - pill))}px`;
  }
  renderTimeline() {
    const start = this.minutes(this.state.work_start), end = this.minutes(this.state.work_end), span = end - start;
    this.$("desk-timeline").setAttribute("aria-label", `Work day, ${this.time(this.state.work_start, true)} to ${this.time(this.state.work_end, true)}`);
    const labels = Array.from({ length: 5 }, (_, i) => {
      const minute = i === 0 ? start : i === 4 ? end : Math.round((start + span * i / 4) / 5) * 5;
      const value = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      return Object.assign(document.createElement("span"), { textContent: this.time(value, true) });
    });
    this.$("desk-hours").replaceChildren(...labels);
    this.$("desk-markers").replaceChildren(...this.entries(this.tasks).flatMap(item => {
      const minute = this.minutes(item.start);
      if (minute == null || minute >= end || (item.duration ? minute + item.duration <= start : minute < start)) return [];
      const task = this.tasks.find(t => t.id === item.id), from = Math.max(start, minute), to = Math.min(end, minute + (item.duration || 0));
      const marker = Object.assign(document.createElement("button"), { type: "button", className: "desk-marker" });
      marker.dataset.taskId = item.id;
      marker.dataset.point = !item.duration;
      marker.style.left = `${(from - start) / span * 100}%`;
      marker.style.width = `${(to - from) / span * 100}%`;
      marker.title = `${task.title} · ${this.time(item.start, true)}${item.duration ? ` · ${item.duration} min` : ""}`;
      marker.setAttribute("aria-label", `Edit desk time: ${marker.title}`);
      const highlight = on => document.querySelector(`.desk-task[data-task-id="${item.id}"]`)?.classList.toggle("timeline-active", on);
      marker.onpointerenter = () => highlight(true); marker.onpointerleave = () => highlight(false);
      marker.onfocus = () => highlight(true); marker.onblur = () => highlight(false);
      marker.onclick = () => this.openTime(task, item, marker);
      return [marker];
    }));
  }
  decorate(li, task, item) {
    li.classList.add("desk-task");
    li.classList.toggle("desk-timed", !!item.start);
    const baseline = this.state.items.find(entry => entry.id === item.id);
    li.dataset.change = !this.state.proposal ? "same" : !baseline ? "added" : baseline.start !== item.start || baseline.duration !== item.duration ? "changed" : "same";
    if (item.start) {
      const button = Object.assign(document.createElement("button"), { type: "button", className: "desk-time" });
      const time = Object.assign(document.createElement("span"), { textContent: this.time(item.start) });
      const duration = Object.assign(document.createElement("span"), { className: "desk-duration", textContent: item.duration ? `${item.duration}m` : "" });
      button.append(time, duration);
      button.title = baseline?.start && li.dataset.change === "changed" ? `Previously ${this.time(baseline.start, true)}${baseline.duration ? ` · ${baseline.duration} min` : ""}` : "Edit desk time";
      button.setAttribute("aria-label", `Edit desk time for ${task.title}: ${this.time(item.start, true)}${item.duration ? `, ${item.duration} minutes` : ""}`);
      button.onclick = event => { event.stopPropagation(); this.openTime(task, item, button); };
      li.querySelector(".line").prepend(button);
      li.querySelector(".time").textContent = li.querySelector(".time-sub").textContent = "";
      li.querySelector(".time").hidden = li.querySelector(".time-sub").hidden = true;
      li.querySelector(".preview").hidden = true;
    }
    // Review the arrangement as a whole before completing its tasks.
    li.querySelector(".check").disabled = !!this.state.proposal;
    if (this.state.proposal) li.querySelector(".check").title = "Accept the arrangement before completing this task";
  }
  contextItem(task) {
    const proposal = this.active && this.state?.proposal;
    const item = (proposal ? proposal.items : this.state?.items || []).find(item => item.id === task.id);
    return item && task.done_at == null ? { item, proposalId: proposal?.id || null } : null;
  }
  beginTimelineDrag(task) {
    if (!this.active || this.dropSaving) return;
    const context = this.contextItem(task);
    if (!context) return;
    this.timelineDrag = { task, context, date: this.state.date, workStart: this.state.work_start, workEnd: this.state.work_end };
    document.body.classList.add("desk-timeline-dragging");
    this.$("desk-timeline").hidden = false;
    this.updateClock();
  }
  previewTimelineDrop(event) {
    if (!this.timelineDrag) return null;
    const timeline = this.$("desk-timeline").getBoundingClientRect(), track = this.$("desk-markers").getBoundingClientRect();
    const start = this.minutes(this.timelineDrag.workStart), end = this.minutes(this.timelineDrag.workEnd);
    const minimum = Math.ceil(start / 15) * 15, maximum = Math.floor((end - 1) / 15) * 15;
    const hit = track.width > 0 && minimum <= maximum && event.clientX >= track.left && event.clientX <= track.right && event.clientY >= timeline.top - 22 && event.clientY <= timeline.bottom + 10;
    this.$("desk-drop-preview").hidden = !hit;
    this.$("desk-timeline").classList.toggle("desk-drop-target", hit);
    if (!hit) return null;
    const minute = Math.max(minimum, Math.min(maximum, Math.round((start + (event.clientX - track.left) / track.width * (end - start)) / 15) * 15));
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    this.$("desk-drop-preview").style.left = `${(minute - start) / (end - start) * 100}%`;
    this.$("desk-drop-time").textContent = this.time(time, true);
    const width = this.$("desk-drop-time").offsetWidth, position = (minute - start) / (end - start) * track.width;
    this.$("desk-drop-time").style.left = `${Math.max(-position, Math.min(-width / 2, track.width - position - width))}px`;
    return time;
  }
  endTimelineDrag() {
    this.timelineDrag = null;
    document.body.classList.remove("desk-timeline-dragging");
    this.$("desk-drop-preview").hidden = true;
    this.$("desk-timeline").classList.remove("desk-drop-target");
    this.$("desk-timeline").hidden = !this.hasTimes;
  }
  async scheduleDrop(drag, start) {
    this.dropSaving = true;
    let duration = drag.context.item.duration;
    if (duration && this.minutes(start) + duration > 1440) duration = null;
    const item = { id: drag.task.id, start, duration };
    try {
      const result = await this.invoke("edit_desk_time", { date: drag.date, proposalId: drag.context.proposalId, item });
      await this.refresh();
      this.endTimelineDrag();
      const marker = this.$("desk-markers").querySelector(`[data-task-id="${item.id}"]`);
      await this.openTime(drag.task, item, marker, drag.context.proposalId ? result.proposal?.id || drag.context.proposalId : null, "desk-duration", true);
    } catch (error) {
      this.endTimelineDrag();
      this.error = String(error);
      this.render(this.active, this.tasks);
    } finally { this.dropSaving = false; }
  }
  async openTime(task, item, anchor, proposalId = this.active ? this.state.proposal?.id || null : null, focusField = "desk-start", showChoices = false) {
    if (this.savingTime) return;
    const editing = { id: task.id, date: this.state.date, proposalId, saved: { start: item.start, duration: item.duration } };
    if (!await this.finishEditing()) return;
    this.closeTime(false);
    this.editing = editing;
    this.dirty = false;
    this.anchor = anchor?.isConnected ? anchor : document.querySelector(`.task[data-task-id="${task.id}"] > .line`) || this.$("view");
    this.$("desk-start").value = item.start ? this.time(item.start, true) : "";
    this.$("desk-duration").value = item.duration ? this.durationLabel(item.duration) : "";
    this.$("desk-time-error").hidden = true;
    this.updateClearButtons();
    this.$("desk-time-dialog").setAttribute("aria-label", `Desk time for ${task.title}`);
    this.place(this.$("desk-time-dialog"), this.anchor);
    this.$(focusField).focus({preventScroll:true});
    this.$(focusField).select();
    if (showChoices) this.showChoices(focusField);
  }
  closeTime(focus = true) {
    if (this.$("desk-time-dialog").hidden) return;
    if (this.dirty && !this.savingTime) this.saveTime();
    this.$("desk-time-dialog").hidden = true;
    this.hideChoices();
    if (focus) (document.querySelector(`.task[data-task-id="${this.editing?.id}"] .desk-time`) || document.querySelector(`.task[data-task-id="${this.editing?.id}"] > .line`) || this.$("view")).focus({ preventScroll: true });
  }
  updateClearButtons() {
    for (const id of ["desk-start", "desk-duration"]) this.$(`${id}-clear`).hidden = !this.$(id).value;
  }
  positionTime() {
    const anchor = this.anchor?.isConnected ? this.anchor : document.querySelector(`.task[data-task-id="${this.editing?.id}"] > .line`) || this.$("view");
    const rect = anchor.getBoundingClientRect(), panel = this.$("desk-time-dialog");
    panel.style.right = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, innerWidth - rect.right))}px`;
    panel.style.top = `${rect.bottom + 4 + panel.offsetHeight < innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - 4 - panel.offsetHeight)}px`;
  }
  parseTime(value) {
    const text = value.trim().toLowerCase().replace(/[.\s]/g, "");
    if (!text) return null;
    const match = text.match(/^(\d{1,2})(?::(\d{1,2})|(\d{2}))?(am|pm)?$/);
    if (!match) return undefined;
    let hour = Number(match[1]); const minute = Number(match[2] || match[3] || 0), period = match[4];
    if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return undefined;
    if (period) hour = hour % 12 + (period === "pm" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  parseDuration(value) {
    const text = value.trim().toLowerCase().replace(/hours?|hrs?/g, "h").replace(/minutes?|mins?/g, "m").replace(/\s/g, "");
    if (!text || ["none", "noduration"].includes(text)) return null;
    if (/^\d+$/.test(text)) return Number(text);
    const match = text.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m)?$/);
    return match && (match[1] || match[2]) ? Number(match[1] || 0) * 60 + Number(match[2] || 0) : undefined;
  }
  durationLabel(value) { return value % 60 ? value < 60 ? `${value} min` : `${Math.floor(value / 60)} hr ${value % 60} min` : `${value / 60} hr`; }
  hideChoices() {
    for (const [input, list] of [["desk-start", "desk-time-options"], ["desk-duration", "desk-duration-options"]]) {
      this.$(list).hidden = true; this.$(input).setAttribute("aria-expanded", "false"); this.$(input).removeAttribute("aria-activedescendant");
    }
    this.choiceField = null;
  }
  showChoices(field, typed = false) {
    if (this.$("desk-time-dialog").hidden || this.savingTime) return;
    this.hideChoices(); this.choiceField = field; this.choiceIndex = -1;
    const time = field === "desk-start", list = this.$(time ? "desk-time-options" : "desk-duration-options"), input = this.$(field);
    this.choices = time ? [{ value: null, label: "No time" }, ...Array.from({ length: 96 }, (_, i) => {
      const value = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String(i % 4 * 15).padStart(2, "0")}`;
      return { value, label: this.time(value, true) };
    })] : [null, 15, 30, 45, 60, 90, 120, 180].map(value => ({ value, label: value == null ? "No duration" : this.durationLabel(value) }));
    const parsed = time ? this.parseTime(input.value) : this.parseDuration(input.value);
    const now = new Date(), nearest = Math.min(95, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15)) + 1;
    this.choiceHint = time ? parsed ? Math.round(this.minutes(parsed) / 15) + 1 : nearest : Math.max(0, this.choices.findIndex(choice => choice.value === parsed));
    list.replaceChildren(...this.choices.map((choice, index) => {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: choice.label, tabIndex: -1 });
      button.id = `${field}-choice-${index}`; button.setAttribute("role", "option"); button.setAttribute("aria-selected", "false");
      button.dataset.value = choice.value ?? "";
      button.onpointerdown = event => event.preventDefault();
      button.onclick = () => this.choose(index);
      return button;
    }));
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    this.positionChoices(field);
    const hint = list.children[Math.min(this.choiceHint, list.children.length - 1)];
    if (hint) list.scrollTop = Math.max(0, hint.offsetTop - list.clientHeight / 2);
    if (!typed && parsed != null) this.choiceIndex = this.choices.findIndex(choice => choice.value === parsed);
    this.highlightChoice();
  }
  positionChoices(field) {
    const input = this.$(field), rect = input.getBoundingClientRect(), list = this.$(field === "desk-start" ? "desk-time-options" : "desk-duration-options");
    const panel = this.$("desk-time-dialog").getBoundingClientRect();
    const below = innerHeight - panel.bottom - 12, above = panel.top - 12, down = above < 80 && below > above;
    list.style.width = `${rect.width}px`; list.style.left = `${rect.left}px`;
    list.style.maxHeight = `${Math.max(50, Math.min(240, down ? below : above))}px`;
    list.style.top = `${down ? panel.bottom + 4 : Math.max(8, panel.top - list.offsetHeight - 4)}px`;
  }
  highlightChoice() {
    if (!this.choiceField) return;
    const list = this.$(this.choiceField === "desk-start" ? "desk-time-options" : "desk-duration-options");
    [...list.children].forEach((button, index) => button.setAttribute("aria-selected", String(index === this.choiceIndex)));
    if (this.choiceIndex >= 0) this.$(this.choiceField).setAttribute("aria-activedescendant", list.children[this.choiceIndex].id);
    else this.$(this.choiceField).removeAttribute("aria-activedescendant");
  }
  choose(index) {
    const field = this.choiceField, choice = this.choices[index];
    this.$(field).value = choice.value == null ? "" : field === "desk-start" ? this.time(choice.value, true) : this.durationLabel(choice.value);
    if (field === "desk-start" && choice.value == null) this.$("desk-duration").value = "";
    this.dirty = true; this.updateClearButtons();
    this.hideChoices(); this.$("desk-time-error").hidden = true;
    this.saveTime();
  }
  choiceKey(event, field) {
    if (event.isComposing) return;
    if (event.key === "Tab") { this.hideChoices(); return; }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!this.choiceField) this.showChoices(field);
      this.choiceIndex = this.choiceIndex < 0 ? Math.min(this.choices.length - 1, this.choiceHint) : Math.max(0, Math.min(this.choices.length - 1, this.choiceIndex + (event.key === "ArrowDown" ? 1 : -1)));
      this.highlightChoice();
      this.$(field === "desk-start" ? "desk-time-options" : "desk-duration-options").children[this.choiceIndex].scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && this.choiceField) {
      event.preventDefault();
      if (this.choiceIndex >= 0) this.choose(this.choiceIndex); else { this.hideChoices(); this.saveTime(); }
    } else if (event.key === "Enter") {
      event.preventDefault(); this.saveTime();
    }
  }
  async saveTime() {
    if (this.savingTime || !this.editing || !this.$("desk-time-form").reportValidity()) return;
    const editing = this.editing;
    const start = this.parseTime(this.$("desk-start").value);
    const duration = this.parseDuration(this.$("desk-duration").value);
    const error = start === undefined ? "Enter a time like 9:30 AM or 14:30." : duration === undefined || duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440) ? "Enter a duration like 30 min or 1 hr." : duration != null && (!start || this.minutes(start) + duration > 1440) ? "Duration needs a time and must end within today." : "";
    if (error) { this.$("desk-time-error").textContent = error; this.$("desk-time-error").hidden = false; this.hideChoices(); this.positionTime(); return; }
    if (start === editing.saved.start && duration === editing.saved.duration) { this.dirty = false; return; }
    this.hideChoices();
    this.savingTime = true;
    this.$("desk-start").readOnly = this.$("desk-duration").readOnly = true;
    try {
      const result = await this.invoke("edit_desk_time", { date: editing.date, proposalId: editing.proposalId, item: { id: editing.id, start, duration } });
      editing.saved = { start, duration };
      if (editing.proposalId) editing.proposalId = result.proposal?.id || editing.proposalId;
      if (this.editing === editing) {
        this.dirty = false;
        this.$("desk-start").value = start ? this.time(start, true) : "";
        this.$("desk-duration").value = duration ? this.durationLabel(duration) : "";
        this.updateClearButtons();
        this.$("desk-time-error").hidden = true;
      }
      await this.refresh();
    } catch (error) {
      this.$("desk-time-error").textContent = String(error);
      this.$("desk-time-error").hidden = false;
      this.positionTime();
    } finally { this.savingTime = false; this.$("desk-start").readOnly = this.$("desk-duration").readOnly = false; }
  }
  async review(accept) {
    const proposal = this.state?.proposal;
    if (!proposal || this.busy || !await this.finishEditing()) return;
    this.busy = true; this.error = "";
    this.$("desk-accept").disabled = this.$("desk-decline").disabled = true;
    try {
      await this.invoke("review_desk", { date: this.state.date, proposalId: proposal.id, accept });
      await this.refresh();
      this.$("view").focus();
    } catch (error) {
      await this.refresh();
      this.error = String(error);
    } finally { this.busy = false; this.render(this.active, this.tasks); }
  }
}
