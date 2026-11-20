// Optional MCP questions. Draft choices are never a submitted response.
class QuestionController {
  constructor(invoke, onError) { this.invoke = invoke; this.onError = onError; this.views = []; this.drafts = new Map(); this.sequence = 0; }
  async load(tasks) {
    this.tasks = tasks;
    const sequence = ++this.sequence, views = [];
    try {
      for (let i = 0; i < tasks.length; i += 200) {
        const result = await this.invoke('get_task_questions', { taskRefs: tasks.slice(i, i + 200).map(t => ({ id: t.id, uid: t.uid || null })) });
        if (sequence !== this.sequence) return;
        if (this.storeId && result.store_uuid !== this.storeId) this.drafts.clear();
        this.storeId = result.store_uuid; views.push(...(result.questions || []));
      }
      if (sequence !== this.sequence) return;
      this.views = views; this.patch();
    } catch (e) { this.onError(`Couldn't load questions: ${e}`); }
  }
  key(v) { return `${v.store_uuid}:${v.question_id}:${v.revision.revision_id}`; }
  patch() {
    document.querySelectorAll('.task').forEach(row => this.mount(row.querySelector(':scope > .details > .details-inner > .details-pad > .question-slot'), Number(row.dataset.taskId)));
  }
  mount(slot, taskId) {
    if (!slot) return;
    const views = this.views.filter(v => (v.task_id ?? v.family.task_id_at_creation) === taskId && v.task_available);
    const indicator = slot.closest(".task")?.querySelector(":scope > .line .details-indicator");
    if (views.length && indicator && !document.body.classList.contains("note")) indicator.hidden = false;
    const fingerprint = JSON.stringify(views);
    if (slot.dataset.questions === fingerprint) return;
    const active = slot.contains(document.activeElement) ? document.activeElement.dataset.control : null;
    slot.dataset.questions = fingerprint; slot.replaceChildren(...views.map(v => this.card(v)));
    if (active) [...slot.querySelectorAll('[data-control]')].find(el => el.dataset.control === active)?.focus({ preventScroll: true });
  }
  card(v) {
    const q = v.revision, key = this.key(v), card = document.createElement('form'); card.className = 'question-card';
    card.onclick = e => e.stopPropagation(); card.onpointerdown = e => e.stopPropagation(); card.onkeydown = e => e.stopPropagation();
    const text = (tag, value, cls = '') => Object.assign(document.createElement(tag), { textContent: value, className: cls });
    card.append(text('p', q.prompt, 'question-prompt'));
    const status = text('p', q.disposition === 'pending' ? '' : q.disposition === 'withdrawn' ? 'Withdrawn' : v.receipt ? 'Received' : 'Saved', 'question-status sr-only');
    status.setAttribute('role', 'status');
    if (q.disposition !== 'pending') {
      card.classList.add('answered');
      let answer = q.disposition === 'declined' ? 'Declined' : q.disposition === 'withdrawn' ? 'Withdrawn' : '';
      if (v.response?.answer) {
        const a = v.response.answer;
        answer = a.kind === 'choices' ? q.options.filter(o => a.option_ids.includes(o.id)).map(o => o.label).join(', ') : a.text;
      }
      const answerLine = text('p', answer, 'question-answer');
      if (v.response?.answer) answerLine.append(text('span', ' (your answer)', 'question-answer-hint'));
      card.append(answerLine, status); return card;
    }
    let draft = this.drafts.get(key);
    if (!draft) { draft = { ids: [...(q.default_option_ids || [])], text: q.default_text || '', custom: false, submissionId: crypto.randomUUID() }; this.drafts.set(key, draft); }
    const fieldset = document.createElement('fieldset'); fieldset.append(text('legend', 'Your answer', 'sr-only'));
    const controls = [];
    let customInput = null;
    if (q.mode !== 'text') {
      for (const o of q.options) {
        const label = document.createElement('label'), input = document.createElement('input');
        input.type = q.mode === 'multiple' ? 'checkbox' : 'radio'; input.name = key; input.value = o.id; input.checked = !draft.custom && draft.ids.includes(o.id); input.dataset.control = `${key}:${o.id}`;
        const words = document.createElement('span'); words.append(text('span', o.label));
        if (o.description) words.append(text('small', o.description));
        if (o.id === q.recommended_option_id) words.append(text('small', 'Recommended', 'question-recommended'));
        label.append(input, words); fieldset.append(label); controls.push(input);
        input.onchange = () => { draft.custom = false; if (custom) custom.checked = false; if (customInput) customInput.hidden = true; draft.ids = q.mode === 'single' ? [o.id] : controls.filter(i => i.checked).map(i => i.value); };
      }
    }
    let custom = null;
    if (q.allow_custom) {
      const label = document.createElement('label'); custom = document.createElement('input'); custom.type = 'radio'; custom.name = `${key}:custom`; custom.checked = draft.custom; custom.dataset.control = `${key}:custom`;
      custom.onchange = () => { draft.custom = custom.checked; controls.forEach(i => i.checked = false); if (customInput) { customInput.hidden = !draft.custom; customInput.focus({preventScroll:true}); } };
      label.append(custom, text('span', 'Write an answer')); fieldset.append(label);
    }
    if (q.mode === 'text' || q.allow_custom) {
      const input = document.createElement('textarea'); customInput = input; input.hidden = q.mode !== 'text' && !draft.custom; input.value = draft.text; input.rows = 2; input.maxLength = 8000; input.setAttribute('aria-label', 'Your written answer'); input.dataset.control = `${key}:text`;
      input.oninput = () => { draft.text = input.value; if (custom) { draft.custom = true; custom.checked = true; controls.forEach(i => i.checked = false); } };
      fieldset.append(input);
    }
    card.append(fieldset, status);
    const actions = document.createElement('div'); actions.className = 'question-actions';
    const send = text('button', 'Send answer'), decline = text('button', 'Decline'); send.type = 'submit'; decline.type = 'button'; actions.append(send, decline); card.append(actions);
    const error = text('p', '', 'question-error'); error.setAttribute('role', 'alert'); error.hidden = true; card.append(error);
    const submit = async outcome => {
      if (draft.busy) return; draft.busy = true; fieldset.disabled = send.disabled = decline.disabled = true; error.hidden = true;
      const answer = outcome === 'declined' ? null : q.mode === 'text' ? { kind: 'text', text: draft.text } : draft.custom ? { kind: 'custom', text: draft.text } : { kind: 'choices', option_ids: draft.ids };
      try {
        const result = await this.invoke('submit_question_response', { storeUuid: v.store_uuid, questionId: v.question_id, expectedRevisionId: q.revision_id, submissionId: draft.submissionId, outcome, answer });
        this.drafts.delete(key); this.views = this.views.map(old => old.question_id === v.question_id ? result.question : old); this.patch();
      } catch (e) { error.textContent = String(e); error.hidden = false; if (/stale_revision|question_resolved|task_unavailable|store_changed/.test(String(e))) this.load(this.tasks || []); }
      finally { draft.busy = false; fieldset.disabled = send.disabled = decline.disabled = false; }
    };
    card.onsubmit = e => { e.preventDefault(); submit('answered'); }; decline.onclick = () => submit('declined');
    return card;
  }
}
