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
    this.arc = new DeskArcPicker(this.$("desk-time-dialog"), {
      onDetent: () => this.invoke("desk_haptic").catch(() => {}),
      onError: () => this.positionTime(),
    });
    document.addEventListener("pointerdown", event => {
      if (!this.$("desk-time-dialog").hidden && !this.$("desk-time-dialog").contains(event.target)) this.closeTime(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || this.$("desk-time-dialog").hidden) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.arc.drag) this.arc.cancelDrag(); else this.closeTime();
    }, true);
    window.addEventListener("resize", () => {
      this.updateClock();
      if (this.$("desk-time-dialog").hidden) return;
      this.arc.cancelDrag(); this.positionTime();
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
    const parts = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date);
    return parts.filter(part => period || part.type !== "dayPeriod").map(part => part.value).join("").trim();
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
  sections(tasks, items) {
    if (!tasks.some(task => items.get(task.id)?.start)) return [{ key: "unscheduled", label: "", items: tasks }];
    const sections = ["Morning", "Midday", "Afternoon", "Evening", "Unscheduled"].map(label => ({ key: label.toLowerCase(), label, items: [] }));
    for (const task of tasks) {
      const minute = this.minutes(items.get(task.id)?.start);
      sections[minute == null ? 4 : minute < 720 ? 0 : minute < 840 ? 1 : minute < 1080 ? 2 : 3].items.push(task);
    }
    return sections.filter(section => section.items.length);
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
    this.$("desk-now-pill").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
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
      const time = Object.assign(document.createElement("span"), { textContent: this.time(item.start, true) });
      const duration = Object.assign(document.createElement("span"), { className: "desk-duration", textContent: item.duration ? `${item.duration}m` : "" });
      button.append(time, duration);
      button.title = baseline?.start && li.dataset.change === "changed" ? `Previously ${this.time(baseline.start, true)}${baseline.duration ? ` · ${baseline.duration} min` : ""}` : "Edit desk time";
      button.setAttribute("aria-label", `Edit desk time for ${task.title}: ${this.time(item.start, true)}${item.duration ? `, ${item.duration} minutes` : ""}`);
      button.onclick = event => { event.stopPropagation(); this.openTime(task, item, button); };
      li.querySelector(".sub").prepend(button);
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
      await this.openTime(drag.task, item, marker, drag.context.proposalId ? result.proposal?.id || drag.context.proposalId : null, "end");
    } catch (error) {
      this.endTimelineDrag();
      this.error = String(error);
      this.render(this.active, this.tasks);
    } finally { this.dropSaving = false; }
  }
  async openTime(task, item, anchor, proposalId = this.active ? this.state.proposal?.id || null : null, focusPart = "start") {
    if (this.savingTime) return;
    const sequence = this.editorSequence = (this.editorSequence || 0) + 1;
    const editing = { id: task.id, date: this.state.date, proposalId, saved: { start: item.start, duration: item.duration } };
    if (!await this.finishEditing() || sequence !== this.editorSequence) return;
    this.closeTime(false);
    this.editing = editing;
    this.anchor = anchor?.isConnected ? anchor : document.querySelector(`.task[data-task-id="${task.id}"] > .line`) || this.$("view");
    this.$("desk-time-heading").textContent = `Desk time for ${task.title}`;
    this.place(this.$("desk-time-dialog"), this.anchor);
    const now = new Date(), workStart = this.minutes(this.state.work_start), workEnd = this.minutes(this.state.work_end);
    const nextQuarter = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
    const suggested = Math.max(workStart, Math.min(nextQuarter, Math.floor((workEnd - 1) / 15) * 15));
    this.arc.open(item, suggested, value => this.saveTime(value, editing), focusPart);
    this.positionTime();
  }
  closeTime(focus = true) {
    if (this.$("desk-time-dialog").hidden) return;
    const id = this.editing?.id;
    this.arc.close(); this.editing = null;
    this.$("desk-time-dialog").hidden = true;
    if (focus) (document.querySelector(`.task[data-task-id="${id}"] .desk-time`) || document.querySelector(`.task[data-task-id="${id}"] > .line`) || this.$("view")).focus({ preventScroll: true });
  }
  positionTime() {
    const anchor = this.anchor?.isConnected ? this.anchor : document.querySelector(`.task[data-task-id="${this.editing?.id}"] > .line`) || this.$("view");
    const rect = anchor.getBoundingClientRect(), panel = this.$("desk-time-dialog");
    panel.style.left = `${Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, rect.left))}px`;
    panel.style.right = "auto";
    panel.style.top = `${Math.max(8, Math.min(innerHeight - panel.offsetHeight - 8, rect.bottom + 4 + panel.offsetHeight < innerHeight ? rect.bottom + 4 : rect.top - 4 - panel.offsetHeight))}px`;
  }
  async saveTime(value, editing) {
    if (this.savingTime || this.editing !== editing) throw new Error("Reopen Desk time to edit this task.");
    if (value.start === editing.saved.start && value.duration === editing.saved.duration) return;
    this.savingTime = true;
    try {
      const result = await this.invoke("edit_desk_time", { date: editing.date, proposalId: editing.proposalId, item: { id: editing.id, ...value } });
      editing.saved = { ...value };
      if (editing.proposalId) editing.proposalId = result.proposal?.id || editing.proposalId;
      await this.refresh();
    } finally { this.savingTime = false; }
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
