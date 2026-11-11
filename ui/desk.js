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
      onPreview: value => {
        this.timePreview = this.editing && value ? { id: this.editing.id, ...value } : null;
        this.updateClock(true);
      },
    });
    document.addEventListener("pointerdown", event => {
      if (!this.$("desk-time-dialog").hidden && !this.$("desk-time-dialog").contains(event.target)) this.closeTime(false);
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || this.$("desk-time-dialog").hidden) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.arc.drag) this.arc.cancelDrag(); else this.closeTime();
    }, true);
    // The sidebar can change the available width without resizing the window.
    new ResizeObserver(() => this.updateClock()).observe(this.$("desk-track"));
    window.addEventListener("resize", () => {
      if (this.$("desk-time-dialog").hidden) return;
      this.arc.cancelDrag(); this.positionTime();
    });
  }
  minutes(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [h, m] = value.split(":").map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  }
  localMinute() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
  formatMinute(minute) {
    const date = new Date(minute * 60000);
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
  }
  time(value) {
    const minute = this.minutes(value);
    return minute == null ? "—" : this.formatMinute(minute);
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
    this.renderedJson = JSON.stringify(this.state);
    this.$("desk-head").hidden = !active || !this.state;
    if (!active || !this.state) return;
    const state = this.state, proposal = state.proposal;
    this.$("desk-review").hidden = !proposal;
    this.$("desk-proposal-label").textContent = proposal?.agent ? `${agentInfo(proposal.agent).name}’s suggestion` : "Suggested arrangement";
    this.$("desk-accept").disabled = this.busy || !!state.proposal_error;
    this.$("desk-decline").disabled = this.busy;
    this.$("desk-error").hidden = !(this.error || state.proposal_error);
    this.$("desk-error").textContent = this.error || state.proposal_error || "";
    this.$("desk-timeline").hidden = false;
    this.updateClock(true);
  }
  updateClock(force = false) {
    if (!this.active || !this.state) return;
    const now = this.localMinute();
    const main = this.$("main");
    main.dataset.deskPhase = now < 300 ? "night" : now < 720 ? "morning" : now < 840 ? "midday" :
      now < 1080 ? "afternoon" : "evening";
    if (this.$("desk-timeline").hidden) {
      this.timeline = null;
      return;
    }
    const start = this.timelineDrag?.minute ?? now;
    const width = this.$("desk-track").clientWidth;
    if (!width || !force && this.timeline?.start === start && this.timeline.width === width) return;
    // Keep at least 80px per hour before expanding the range to 12 hours.
    const span = width >= 960 ? 720 : 360;
    this.timeline = { start, span, width };
    this.renderTimeline(start, span, width);
  }
  renderTimeline(start, span, width) {
    const end = start + span;
    const timeline = this.$("desk-timeline");
    timeline.setAttribute("aria-label", `Upcoming desk tasks from ${this.formatMinute(start)} to ${this.formatMinute(end)}`);
    const now = this.$("desk-now");
    now.title = this.formatMinute(start);
    const ticks = [];
    const pixelsPerHour = width * 60 / span;
    const interval = (pixelsPerHour >= 80 ? 1 : pixelsPerHour >= 38 ? 2 : 3) * 60;
    for (let minute = Math.ceil(start / interval) * interval; minute < end; minute += interval) {
      const x = (minute - start) * width / span;
      if (x < 48 || x > width - 72) continue;
      const label = Object.assign(document.createElement("span"), { textContent: this.formatMinute(minute) });
      label.style.left = `${x}px`;
      ticks.push(label);
    }
    const last = Object.assign(document.createElement("span"), { textContent: this.formatMinute(end), className: "desk-range-end" });
    this.$("desk-hours").replaceChildren(now, ...ticks, last);

    const blocks = [];
    const previewIsCurrent = this.editing?.date === this.state.date &&
      this.editing.proposalId === (this.state.proposal?.id || null);
    const items = this.entries(this.tasks).map(item =>
      previewIsCurrent && this.timePreview?.id === item.id ? { ...item, ...this.timePreview } : item);
    for (const item of items) {
      const minute = this.minutes(item.start);
      const finish = minute + (item.duration || 0);
      if (minute == null || minute >= end || (item.duration ? finish <= start : minute < start)) continue;
      const from = (Math.max(minute, start) - start) * width / span;
      const to = (Math.min(finish, end) - start) * width / span;
      const size = Math.max(9, to - from);
      const left = Math.max(0, Math.min(width - size, item.duration ? from : from - size / 2));
      blocks.push({ item, left, size });
    }

    // Use the drawn bounds, so even dots and very short tasks stay separately clickable.
    const laneEnds = [];
    const markers = this.$("desk-markers");
    const focusedId = markers.contains(document.activeElement) ? document.activeElement.dataset.taskId : null;
    this.$("open").querySelectorAll(".timeline-active").forEach(row => row.classList.remove("timeline-active"));
    markers.replaceChildren(...blocks.sort((a, b) => a.left - b.left).map(({ item, left, size }) => {
      let lane = laneEnds.findIndex(right => right + 2 <= left);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = left + size;
      const task = this.tasks.find(task => task.id === item.id);
      const marker = Object.assign(document.createElement("button"), { type: "button", className: "desk-marker" });
      marker.dataset.taskId = item.id;
      marker.dataset.point = !item.duration;
      marker.style.left = `${left}px`;
      marker.style.width = `${size}px`;
      marker.style.setProperty("--desk-lane", lane);
      marker.title = `${task.title} · ${this.time(item.start)}${item.duration ? ` · ${item.duration} min` : ""}`;
      marker.setAttribute("aria-label", `Edit desk time: ${marker.title}`);
      if (size >= 92) {
        const title = Object.assign(document.createElement("span"), { textContent: task.title });
        title.setAttribute("aria-hidden", "true");
        marker.append(title);
      }
      const highlight = on => document.querySelector(`.desk-task[data-task-id="${item.id}"]`)?.classList.toggle("timeline-active", on);
      marker.onpointerenter = () => highlight(true);
      marker.onpointerleave = () => highlight(false);
      marker.onfocus = () => highlight(true);
      marker.onblur = () => highlight(false);
      marker.onclick = () => this.openTime(task, item, marker);
      return marker;
    }));
    this.$("desk-track").style.setProperty("--desk-lanes", Math.max(1, laneEnds.length));
    if (focusedId) (markers.querySelector(`[data-task-id="${focusedId}"]`) || this.$("view")).focus({ preventScroll: true });
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
      button.title = baseline?.start && li.dataset.change === "changed" ? `Previously ${this.time(baseline.start)}${baseline.duration ? ` · ${baseline.duration} min` : ""}` : "Edit desk time";
      button.setAttribute("aria-label", `Edit desk time for ${task.title}: ${this.time(item.start)}${item.duration ? `, ${item.duration} minutes` : ""}`);
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
    this.timelineDrag = { task, context, date: this.state.date, minute: this.localMinute() };
    document.body.classList.add("desk-timeline-dragging");
    this.$("desk-timeline").hidden = false;
    this.updateClock();
  }
  previewTimelineDrop(event) {
    if (!this.timelineDrag || !this.timeline) return null;
    const timeline = this.$("desk-timeline").getBoundingClientRect();
    const track = this.$("desk-track").getBoundingClientRect();
    const { start, span } = this.timeline;
    const minimum = Math.ceil(start / 15) * 15;
    const maximum = Math.floor((Math.min(start + span, 1440) - 1) / 15) * 15;
    const target = start + (event.clientX - track.left) * span / track.width;
    const hit = track.width > 0 && minimum <= maximum && target >= start && target <= start + span &&
      target < 1440 && event.clientY >= timeline.top - 4 && event.clientY <= timeline.bottom + 8;
    this.$("desk-drop-preview").hidden = !hit;
    this.$("desk-timeline").classList.toggle("desk-drop-target", hit);
    if (!hit) return null;
    const minute = Math.max(minimum, Math.min(maximum, Math.round(target / 15) * 15));
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const position = (minute - start) * track.width / span;
    this.$("desk-drop-preview").style.left = `${position}px`;
    this.$("desk-drop-time").textContent = this.formatMinute(minute);
    const width = this.$("desk-drop-time").offsetWidth;
    this.$("desk-drop-time").style.left = `${Math.max(-position, Math.min(-width / 2, track.width - position - width))}px`;
    return time;
  }
  endTimelineDrag() {
    this.timelineDrag = null;
    document.body.classList.remove("desk-timeline-dragging");
    this.$("desk-drop-preview").hidden = true;
    this.$("desk-timeline").classList.remove("desk-drop-target");
    this.$("desk-timeline").hidden = false;
    this.updateClock();
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
    const suggested = Math.min(1425, Math.ceil(this.localMinute() / 15) * 15);
    this.arc.open(item, suggested, value => this.saveTime(value, editing), focusPart);
    this.positionTime();
  }
  closeTime(focus = true) {
    if (this.$("desk-time-dialog").hidden) return;
    const id = this.editing?.id;
    this.arc.close(); this.editing = null;
    this.timePreview = null;
    this.updateClock(true);
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
