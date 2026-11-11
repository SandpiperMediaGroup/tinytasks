// A desk-only time range. Preview gestures locally and save once on release;
// opening the picker never assigns a time or invents a duration.
class DeskArcPicker {
  constructor(root, { onDetent, onError }) {
    this.root = root;
    this.area = root.querySelector(".desk-arc-area");
    this.error = root.querySelector(".desk-arc-error");
    this.retry = root.querySelector(".desk-arc-retry");
    this.live = root.querySelector(".desk-arc-live");
    this.selection = root.querySelector(".desk-arc-selection");
    this.clear = root.querySelector(".desk-arc-clear");
    this.handles = Object.fromEntries([...root.querySelectorAll("[data-arc-part]")].map(el => [el.dataset.arcPart, el]));
    this.onDetent = onDetent;
    this.onError = onError;
    this.generation = 0;
    this.lastDetent = -Infinity;
    this.positions = {};
    const marks = root.querySelector(".desk-arc-marks"), ns = "http://www.w3.org/2000/svg";
    for (let i = 0; i < 48; i++) {
      const a = this.point(i * 7.5, i % 4 ? 112 : 108), b = this.point(i * 7.5, 117);
      const line = document.createElementNS(ns, "line");
      for (const [key, value] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) line.setAttribute(key, value);
      line.dataset.major = String(i % 4 === 0); marks.append(line);
    }
    for (let i = 0; i < 12; i++) {
      const p = this.point(i * 30, 128), label = document.createElementNS(ns, "text");
      label.textContent = i || 12; label.setAttribute("x", p.x); label.setAttribute("y", p.y); marks.append(label);
    }
    this.area.addEventListener("pointerdown", event => this.beginDrag(event), true);
    this.area.addEventListener("pointermove", event => this.moveDrag(event));
    this.area.addEventListener("pointerup", event => this.endDrag(event));
    this.area.addEventListener("pointercancel", event => this.endDrag(event, true));
    this.area.addEventListener("lostpointercapture", event => this.endDrag(event, true));
    window.addEventListener("blur", () => this.cancelDrag());
    for (const [part, handle] of Object.entries(this.handles)) {
      handle.onkeydown = event => {
        if (event.isComposing || this.busy) return;
        const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : ["ArrowDown", "ArrowLeft"].includes(event.key) ? -1 : 0;
        if (direction) {
          event.preventDefault(); event.stopPropagation();
          const step = event.altKey ? 1 : 15;
          const minute = part === "end" ? this.end() : this.start;
          const tick = direction > 0 ? Math.floor(minute / step) + 1 : Math.ceil(minute / step) - 1;
          const before = this.value();
          this.apply(part, tick * step, this.snapshot(), step, direction);
          if (!this.equal(before, this.value())) this.detent();
          this.commit();
        } else if (["Enter", " "].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          this.select(part);
          this.render(); this.commit();
        }
      };
    }
    this.clear.onclick = () => {
      if (this.busy) return;
      this.scheduled = false;
      this.duration = null;
      this.render();
      this.handles.start.focus({ preventScroll: true });
      this.commit();
    };
    this.retry.onclick = () => this.commit();
  }
  clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  mod(value, size) { return (value % size + size) % size; }
  point(angle, radius = 91) { return { x: 130 + Math.sin(angle * Math.PI / 180) * radius, y: 130 - Math.cos(angle * Math.PI / 180) * radius }; }
  clock(minute) { return `${Math.floor(this.mod(minute, 1440) / 60) % 12 || 12}:${String(this.mod(minute, 60)).padStart(2, "0")}`; }
  period(minute) { return this.mod(minute, 1440) < 720 ? "AM" : "PM"; }
  time(minute) { return `${this.clock(minute)} ${this.period(minute)}`; }
  hhmm(minute) { return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`; }
  span() { return this.duration ?? Math.min(30, 1440 - this.start); }
  end() { return this.start + this.span(); }
  snapshot() { return { start: this.start, end: this.end(), duration: this.duration, scheduled: this.scheduled }; }
  value() { return { start: this.scheduled ? this.hhmm(this.start) : null, duration: this.scheduled ? this.duration : null }; }
  equal(a, b) { return a.start === b.start && a.duration === b.duration; }
  open(item, suggested, onCommit, focusPart = "start") {
    this.cancelDrag(); this.generation++;
    this.onCommit = onCommit; this.baseline = { start: item.start, duration: item.duration };
    this.scheduled = item.start != null;
    this.start = this.scheduled ? Number(item.start.slice(0, 2)) * 60 + Number(item.start.slice(3)) : suggested;
    this.duration = item.duration; this.busy = false;
    this.error.hidden = this.retry.hidden = true;
    this.render(); this.handles[focusPart].focus({ preventScroll: true });
  }
  close() { this.cancelDrag(); this.generation++; }
  detent() {
    const now = performance.now();
    if (now - this.lastDetent < 70) return;
    this.lastDetent = now; this.onDetent?.();
  }
  render() {
    const end = this.end(), span = this.span(), startAngle = this.start / 2, endAngle = end / 2;
    this.positions = { start: this.point(startAngle), end: this.point(endAngle), move: this.point((startAngle + endAngle) / 2) };
    // Multiple half-circle segments preserve ranges of twelve hours or longer.
    const first = this.positions.start;
    let path = `M ${first.x} ${first.y}`;
    for (let elapsed = 0; elapsed < span;) {
      elapsed += Math.min(360, span - elapsed);
      const p = this.point((this.start + elapsed) / 2);
      path += ` A 91 91 0 0 1 ${p.x} ${p.y}`;
    }
    this.selection.setAttribute("d", path);
    this.root.dataset.ghost = String(!this.scheduled || this.duration == null);
    this.root.setAttribute("aria-busy", String(this.busy));
    this.area.dataset.dragging = String(!!this.drag);
    this.root.querySelector(".desk-arc-start-time").textContent = this.clock(this.start);
    this.root.querySelector(".desk-arc-start-unit").textContent = this.period(this.start);
    this.root.querySelector(".desk-arc-end-time").textContent = this.duration == null ? "—" : this.clock(end);
    this.root.querySelector(".desk-arc-end-unit").textContent = this.duration == null ? "" : this.period(end);
    this.root.querySelector(".desk-arc-duration").textContent = !this.scheduled ? "No time" : this.duration == null ? "No duration" : this.duration >= 60 ? `${Math.floor(this.duration / 60)}h${this.duration % 60 ? ` ${this.duration % 60}m` : ""}` : `${this.duration}m`;
    this.clear.hidden = !this.scheduled;
    for (const [part, handle] of Object.entries(this.handles)) {
      const p = this.positions[part]; handle.style.left = `${p.x / 260 * 100}%`; handle.style.top = `${p.y / 260 * 100}%`;
      if (part === "move") handle.style.transform = `translate(-50%,-50%) rotate(${(startAngle + endAngle) / 2}deg)`;
      const value = part === "end" ? end : this.start;
      const description = part === "move" ? `${this.time(this.start)} to ${this.time(end)}, ${this.duration == null ? "no duration" : `${this.duration} minutes`}` : this.time(value);
      handle.setAttribute("aria-disabled", String(this.busy));
      handle.setAttribute("aria-valuemin", String(part === "end" ? this.start + 1 : 0));
      handle.setAttribute("aria-valuemax", String(part === "start" && this.duration != null ? end - 1 : part === "move" ? 1440 - (this.duration || 1) : part === "start" ? 1439 : 1440));
      handle.setAttribute("aria-valuenow", String(value)); handle.setAttribute("aria-valuetext", description);
      handle.title = `${part === "move" ? "Move time block" : part === "start" ? "Start time" : "End time"}: ${description}. Arrow keys: quarter hours; Alt/Option: 1 minute.`;
    }
    this.clear.disabled = this.busy;
    this.retry.disabled = this.busy;
  }
  pointer(event) {
    const b = this.area.getBoundingClientRect(), x = (event.clientX - b.x) / b.width * 260, y = (event.clientY - b.y) / b.height * 260;
    return { x, y, radius: Math.hypot(x - 130, y - 130), angle: this.mod(Math.atan2(x - 130, 130 - y) * 180 / Math.PI, 360) };
  }
  targetAt(p) {
    const along = this.mod(p.angle - this.start / 2, 360), angle = this.span() / 2, fraction = along / angle;
    const onRing = p.radius > 74 && p.radius < 114;
    if (onRing && fraction > .28 && fraction < .72) return "move";
    const distance = part => Math.hypot(p.x - this.positions[part].x, p.y - this.positions[part].y);
    const start = distance("start"), end = distance("end");
    if (Math.min(start, end) <= (matchMedia("(pointer: coarse)").matches ? 23 : 17)) {
      // A twelve-hour block puts both ends at the same angle.
      if (Math.abs(angle % 360) < .01) return this.lastPart === "start" ? "end" : "start";
      return start <= end ? "start" : "end";
    }
    return onRing && along <= angle ? "move" : null;
  }
  apply(part, target, base, step = 15, direction = 0) {
    const earliest = part === "end" ? base.start + 1 : 0;
    const latest = part === "end" ? 1440 : part === "start" && base.duration != null
      ? base.end - 1 : 1440 - (base.duration || 1);
    const minute = this.clamp(Math.round(target / step) * step,
      Math.ceil(earliest / step) * step, Math.floor(latest / step) * step);
    const initial = part === "end" ? base.end : base.start;
    if (direction && (minute - initial) * direction <= 0) return;
    if (part === "end") {
      this.start = base.start;
      this.duration = minute - base.start;
    } else if (part === "start" && base.duration != null) {
      this.start = minute;
      this.duration = base.end - minute;
    } else {
      this.start = minute;
      this.duration = base.duration;
    }
    this.scheduled = true; this.render();
  }
  select(part) {
    if (part === "end" && this.duration == null) this.apply(part, this.end(), this.snapshot());
    else if (!this.scheduled) this.apply(part, this.start, this.snapshot());
  }
  beginDrag(event) {
    if (event.button !== 0 || this.busy || event.target.closest(".desk-arc-readout")) return;
    const p = this.pointer(event), part = this.targetAt(p); if (!part) return;
    event.preventDefault(); event.stopPropagation(); this.lastPart = part;
    this.handles[part].focus({ preventScroll: true }); this.area.setPointerCapture(event.pointerId);
    this.drag = { ...this.snapshot(), part, pointer: event.pointerId, last: p.angle, total: 0, moved: false, valid: true };
    this.render();
  }
  moveDrag(event) {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    const p = this.pointer(event), drag = this.drag;
    if (p.radius < 35) { drag.valid = false; return; }
    if (!drag.valid) { drag.last = p.angle; drag.valid = true; return; }
    drag.total += this.mod(p.angle - drag.last + 180, 360) - 180; drag.last = p.angle;
    if (!drag.moved && Math.abs(drag.total) < 1.25) return;
    drag.moved = true;
    const initial = drag.part === "end" ? drag.end : drag.start;
    const before = this.value();
    this.apply(drag.part, initial + drag.total * 2, drag);
    if (!this.equal(before, this.value())) this.detent();
  }
  endDrag(event, cancel = false) {
    if (!this.drag || event.pointerId !== this.drag.pointer) return;
    const drag = this.drag; this.drag = null;
    if (cancel) { this.start = drag.start; this.duration = drag.duration; this.scheduled = drag.scheduled; }
    else if (!drag.moved) this.select(drag.part);
    if (this.area.hasPointerCapture(event.pointerId)) this.area.releasePointerCapture(event.pointerId);
    this.render(); if (!cancel) this.commit();
  }
  cancelDrag() { if (this.drag) this.endDrag({ pointerId: this.drag.pointer }, true); }
  async commit() {
    const value = this.value();
    if (this.busy || this.equal(value, this.baseline)) return;
    const generation = this.generation; this.busy = true; this.error.hidden = this.retry.hidden = true; this.render();
    try {
      await this.onCommit(value);
      if (generation === this.generation) { this.baseline = value; this.live.textContent = value.start ? `${this.time(this.start)}, ${value.duration == null ? "no duration" : `${value.duration} minutes`}` : "No desk time"; }
    } catch (error) {
      if (generation === this.generation) {
        this.error.textContent = String(error); this.error.hidden = this.retry.hidden = false;
        this.onError?.();
      }
    } finally {
      if (generation === this.generation) { this.busy = false; this.render(); }
    }
  }
}
