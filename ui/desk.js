// My Desk is one day's overlay on existing tasks. All writes go through the native
// store; proposal IDs and dates keep a stale window from accepting a different plan.
class DeskController {
  constructor({ invoke, refresh, finishEditing }) {
    this.invoke = invoke;
    this.refresh = refresh;
    this.finishEditing = finishEditing;
    this.state = null;
    this.sequence = 0;
    this.renderedJson = "";
    this.busy = false;
    this.error = "";
    this.$ = id => document.getElementById(id);
    this.$("desk-accept").onclick = () => this.review(true);
    this.$("desk-decline").onclick = () => this.review(false);
    this.$("desk-time-cancel").onclick = () => this.$("desk-time-dialog").close();
    this.$("desk-time-form").onsubmit = event => { event.preventDefault(); this.saveTime(); };
    this.$("desk-time-dialog").addEventListener("close", () => {
      const button = document.querySelector(`.desk-task[data-task-id="${this.editing?.id}"] .desk-time`);
      (button || this.$("view")).focus();
    });
    this.$("desk-picker-close").onclick = () => this.$("desk-picker").close();
    this.$("desk-picker").addEventListener("close", () => this.$("add").focus());
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
    this.renderTimeline();
    this.updateClock();
  }
  updateClock() {
    if (!this.active || !this.state) return;
    const now = new Date(), minute = now.getHours() * 60 + now.getMinutes();
    this.$("desk-now").textContent = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const start = this.minutes(this.state.work_start), end = this.minutes(this.state.work_end);
    const progress = Math.max(0, Math.min(100, (minute - start) / (end - start) * 100));
    this.$("desk-elapsed").style.width = `${progress}%`;
    this.$("desk-now-marker").style.left = `${progress}%`;
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
      marker.onclick = () => this.openTime(task, item);
      return [marker];
    }));
  }
  decorate(li, task, item) {
    li.classList.add("desk-task");
    const baseline = this.state.items.find(entry => entry.id === item.id);
    li.dataset.change = !this.state.proposal ? "same" : !baseline ? "added" : baseline.start !== item.start || baseline.duration !== item.duration ? "changed" : "same";
    const button = Object.assign(document.createElement("button"), { type: "button", className: "desk-time" });
    const time = Object.assign(document.createElement("span"), { textContent: this.time(item.start) });
    const duration = Object.assign(document.createElement("span"), { className: "desk-duration", textContent: item.duration ? `${item.duration}m` : "" });
    button.append(time, duration);
    button.title = baseline?.start && li.dataset.change === "changed" ? `Previously ${this.time(baseline.start, true)}${baseline.duration ? ` · ${baseline.duration} min` : ""}` : "Edit desk time";
    button.setAttribute("aria-label", `Edit desk time for ${task.title}: ${this.time(item.start, true)}${item.duration ? `, ${item.duration} minutes` : ""}`);
    button.onclick = event => { event.stopPropagation(); this.openTime(task, item); };
    li.querySelector(".line").prepend(button);
    // Review the arrangement as a whole before completing its tasks.
    li.querySelector(".check").disabled = !!this.state.proposal;
    if (this.state.proposal) li.querySelector(".check").title = "Accept the arrangement before completing this task";
    // The desk keeps the list row's interactions but its collapsed row stays compact.
    li.querySelector(".time").textContent = li.querySelector(".time-sub").textContent = "";
    li.querySelector(".preview").hidden = true;
  }
  async openTime(task, item) {
    const editing = { id: task.id, date: this.state.date, proposalId: this.state.proposal?.id || null };
    if (!await this.finishEditing()) return;
    this.editing = editing;
    this.$("desk-time-title").textContent = task.title;
    this.$("desk-start").value = item.start || "";
    this.$("desk-duration").value = item.duration || "";
    this.$("desk-time-error").hidden = true;
    this.$("desk-time-dialog").showModal();
    this.$("desk-start").focus();
  }
  async openPicker() {
    if (!this.state || !await this.finishEditing()) return;
    const selected = new Set(this.entries(this.tasks).map(item => item.id));
    const date = this.state.date, proposalId = this.state.proposal?.id || null;
    this.$("desk-picker-error").hidden = true;
    const buttons = this.tasks.filter(task => task.done_at == null && !selected.has(task.id)).map(task => {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: task.title });
      button.dataset.taskId = task.id;
      button.append(Object.assign(document.createElement("span"), { textContent: task.chat || "Personal" }));
      button.onclick = async () => {
        if (this.adding) return;
        this.adding = true; button.disabled = true;
        try {
          await this.invoke("add_to_desk", { date, proposalId, id: task.id });
          await this.refresh(); this.$("desk-picker").close();
        } catch (error) {
          this.$("desk-picker-error").textContent = String(error); this.$("desk-picker-error").hidden = false;
        } finally { this.adding = false; button.disabled = false; }
      };
      return button;
    });
    this.$("desk-picker-tasks").replaceChildren(...(buttons.length ? buttons : [Object.assign(document.createElement("p"), { textContent: "All open tasks are on your Desk." })]));
    this.$("desk-picker").showModal();
  }
  async saveTime() {
    if (this.savingTime || !this.editing || !this.$("desk-time-form").reportValidity()) return;
    const start = this.$("desk-start").value || null;
    const duration = this.$("desk-duration").value ? Number(this.$("desk-duration").value) : null;
    this.savingTime = true; this.$("desk-time-save").disabled = true;
    try {
      await this.invoke("edit_desk_time", { date: this.editing.date, proposalId: this.editing.proposalId, item: { id: this.editing.id, start, duration } });
      await this.refresh();
      this.$("desk-time-dialog").close();
    } catch (error) {
      this.$("desk-time-error").textContent = String(error);
      this.$("desk-time-error").hidden = false;
    } finally { this.savingTime = false; this.$("desk-time-save").disabled = false; }
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
