// Run with Playwright installed: node scripts/ui-smoke.cjs
// PLAYWRIGHT_MODULE / PLAYWRIGHT_CHROMIUM_EXECUTABLE can point to an existing installation.
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 620 }, colorScheme: 'dark' });
    await context.addInitScript(() => {
      const now = Date.now() / 1000;
      const tasks = [
        { id: 1, title: 'Connect the payment flow', details: 'Add the secret, then test checkout.', agent: 'codex', chat: 'Billing launch', priority: 1, due: '2026-11-06', created_at: now, done_at: null, mydesk: false, link: '' },
        { id: 2, title: 'Review the pricing page', details: '', agent: '', chat: '', priority: 2, due: null, created_at: now - 86400, done_at: null, mydesk: true, link: '' },
      ];
      const listeners = {};
      window.testState = { tasks, calls: [], failSave: false, emit: () => listeners['tasks-changed']?.() };
      window.__TAURI__ = {
        event: { listen: async (event, callback) => { listeners[event] = callback; } },
        core: { invoke: async (cmd, args = {}) => {
          window.testState.calls.push({ cmd, args });
          const t = tasks.find(t => t.id === args.id);
          if (cmd === 'location') return { short: 'This computer', folder: '/tmp/tinytasks-test' };
          if (cmd === 'list_note') return structuredClone(tasks.filter(t => t.id === args.id || t.parent_id === args.id));
          if (cmd === 'edit_task') {
            if (window.testState.failSave) throw new Error('File unavailable');
            if (!t) throw new Error('That task is gone.');
            for (const field of ['title', 'details']) if (field in args) t[field] = args[field];
          }
          if (cmd === 'set_done') {
            t.done_at = args.done ? now : null;
            if (args.done) tasks.filter(c => c.parent_id === t.id).forEach(c => { c.done_at = now; });
            else if (t.parent_id) tasks.find(p => p.id === t.parent_id).done_at = null;
          }
          if (cmd === 'set_priority') t.priority = args.priority;
          if (cmd === 'set_desk') t.mydesk = args.on;
          if (cmd === 'delete_task') {
            for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].id === args.id || tasks[i].parent_id === args.id) tasks.splice(i, 1);
          }
          if (cmd === 'add_subtask') {
            if (window.testState.failSave) throw new Error('File unavailable');
            const parent = tasks.find(t => t.id === args.parentId);
            const children = tasks.filter(t => t.parent_id === parent.id);
            tasks.push({ id: Math.max(...tasks.map(t => t.id)) + 1, title: args.title, details: '', agent: '', chat: parent.chat, link: parent.link,
              priority: null, due: null, created_at: now, done_at: null, mydesk: false, parent_id: parent.id, position: children.length, ordered: false });
            parent.done_at = null;
          }
          if (cmd === 'set_subtask_mode') t.ordered = args.ordered;
          if (cmd === 'reorder_subtasks') args.ids.forEach((id, position) => { tasks.find(t => t.id === id).position = position; });
          return structuredClone(tasks);
        } },
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href;
    await page.goto(url);
    const first = page.locator('.task').first();
    await first.waitFor();
    assert.equal(await page.locator('#pin, .edit').count(), 0);
    assert.equal(await page.locator('.stamp').count(), 0);
    assert.match(await first.locator('.time').getAttribute('title'), /^Added /);
    assert.equal(await first.locator('.time-sub').getAttribute('title'), await first.locator('.time').getAttribute('title'));
    await page.locator('#display').click();
    await page.locator('[data-property="priority"]').click();
    assert.equal(await first.locator('.line > .prio').isVisible(), false);
    await page.locator('[data-property="id"]').click();
    assert.equal(await first.locator('.task-id').innerText(), '#1');
    await page.reload();
    await first.waitFor();
    assert.equal(await first.locator('.line > .prio').isVisible(), false);
    assert.equal(await first.locator('.task-id').isVisible(), true);

    await page.locator('.group-head').first().click();
    assert.equal(await first.isVisible(), false);
    await page.reload();
    assert.equal(await page.locator('.group-head').first().getAttribute('aria-expanded'), 'false');
    await page.locator('.group-head').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await first.isVisible(), true);

    // Text edits without opening details; row whitespace opens them normally.
    await first.locator('.title-text').click();
    assert.equal(await first.getAttribute('class'), 'task editing');
    await first.locator('textarea').fill('Updated task title');
    await page.evaluate(() => { testState.tasks[0].details = 'Changed by an agent'; testState.emit(); });
    assert.equal(await first.locator('textarea').inputValue(), 'Updated task title');
    await first.locator('textarea').press('Enter');
    await page.waitForFunction(() => document.querySelector('.title-text')?.textContent === 'Updated task title');
    assert.equal(await page.evaluate(() => testState.tasks[0].details), 'Changed by an agent');
    assert.deepEqual(await page.evaluate(() => testState.calls.find(c => c.cmd === 'edit_task').args), { id: 1, title: 'Updated task title' });
    await first.locator('.line').click({ position: { x: 340, y: 10 } });
    assert.equal(await first.locator('.body').isVisible(), true);
    await first.locator('.title-text').click();
    await first.locator('textarea').fill('Switch directly between fields');
    await first.locator('.body').click();
    await first.locator('.edit-details').waitFor();
    assert.equal(await first.locator('.title-text').innerText(), 'Switch directly between fields');
    await first.locator('textarea').fill('Discard me');
    await first.locator('textarea').press('Escape');
    assert.equal(await first.locator('.body').innerText(), 'Changed by an agent');
    await first.locator('.title-text').click();
    await first.locator('.body').click();
    await first.locator('.edit-details').fill('No-op blur must not close this editor');
    await first.locator('.edit-details').press('Escape');

    // Clicking outside text saves and keeps the newly opened details open.
    await first.locator('.title-text').click();
    await first.locator('textarea').fill('Saved on blur');
    await page.locator('header').click({ position: { x: 170, y: 5 } });
    await page.waitForFunction(() => document.querySelector('.title-text')?.textContent === 'Saved on blur');

    // Failed writes preserve the draft so retrying is possible.
    await page.evaluate(() => { testState.failSave = true; });
    await first.locator('.title-text').click();
    await first.locator('textarea').fill('Retry this edit');
    await first.locator('textarea').press('Enter');
    await page.waitForFunction(() => !document.querySelector('textarea').readOnly);
    assert.equal(await first.locator('textarea').inputValue(), 'Retry this edit');
    assert.match(await page.locator('#notice').innerText(), /Couldn't save/);
    await page.evaluate(() => { testState.failSave = false; });
    await first.locator('textarea').press('Enter');
    await page.waitForFunction(() => document.querySelector('.title-text')?.textContent === 'Retry this edit');
    await first.locator('.open-note').click();
    assert.equal(await page.evaluate(() => testState.calls.filter(c => c.cmd === 'open_note' && c.args.id === 1).length), 1);

    await page.locator('#display').click();
    await page.screenshot({ path: '/tmp/tinytasks-display.png' });
    await page.setViewportSize({ width: 280, height: 520 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    const note = await context.newPage();
    note.on('pageerror', e => errors.push(e.message));
    await note.goto(`${url}?task=1`);
    await note.locator('.task').waitFor();
    assert.equal(await note.locator('.task').count(), 1);
    assert.equal(await note.locator('header').isVisible(), false);
    assert.equal(await note.locator('.body').isVisible(), true);
    assert.equal(await note.locator('.open-note').isVisible(), false);
    assert.equal(await note.locator('.meta').isVisible(), false);
    assert.equal(await note.locator('.sub').isVisible(), false);
    assert.equal(await note.locator('.subtasks-head').isVisible(), false);
    await note.locator('#note-handle').click({ position: { x: 20, y: 10 } });
    assert.ok(await note.evaluate(() => testState.calls.some(c => c.cmd === 'drag_note')));
    await note.evaluate(() => { testState.tasks[0].title = 'Synced from the list'; testState.emit(); });
    await note.waitForFunction(() => document.querySelector('.title-text')?.textContent === 'Synced from the list');
    await note.locator('.task .check').click();
    await note.waitForSelector('.task.done');
    assert.match(await note.locator('.time').getAttribute('title'), /^Done .+\nAdded /);
    await note.locator('.task .check').click();
    await note.waitForSelector('.task:not(.done)');
    await note.screenshot({ path: '/tmp/tinytasks-note.png' });
    await note.locator('.title-text').click();
    await note.locator('textarea').fill('Saved before closing the note');
    await note.locator('#close-note').click();
    assert.equal(await note.evaluate(() => testState.tasks[0].title), 'Saved before closing the note');
    assert.ok(await note.evaluate(() => testState.calls.some(c => c.cmd === 'close_note')));
    await note.evaluate(() => { testState.tasks.splice(0, 1); testState.emit(); });
    await note.waitForSelector('#empty:not([hidden])');
    assert.equal(await note.locator('#empty').innerText(), 'This task was deleted.');

    // Subtasks use the real row renderer: independent editing, details, completion, and ordering.
    const sub = await context.newPage();
    sub.on('pageerror', e => errors.push(e.message));
    await sub.goto(url);
    await sub.evaluate(() => localStorage.clear());
    await sub.reload();
    const task = (id) => sub.locator(`.task[data-task-id="${id}"]`);
    const opacity = (locator) => locator.evaluate(el => getComputedStyle(el).opacity);
    const group = sub.locator('.group-head').first();
    await sub.mouse.move(0, 0);
    assert.equal(await opacity(group.locator('.group-chevron')), '0');
    await group.hover();
    assert.equal(await opacity(group.locator('.group-chevron')), '1');
    await sub.mouse.move(0, 0);
    await group.focus();
    assert.equal(await opacity(group.locator('.group-chevron')), '1');
    await task(1).locator(':scope > .line').click({ position: { x: 340, y: 10 } });
    const head = task(1).locator('.subtasks-head').first();
    const firstSubtask = task(1).locator('.first-subtask').first();
    assert.equal(await head.isVisible(), false);
    assert.equal(await firstSubtask.isVisible(), true);
    await firstSubtask.click();
    assert.equal(await head.isVisible(), true);
    await sub.getByRole('textbox', { name: 'New subtask', exact: true }).press('Escape');
    assert.equal(await head.isVisible(), false);
    assert.equal(await firstSubtask.isVisible(), true);
    await firstSubtask.click();
    for (const title of ['Create the Stripe API key', 'Add the secret in Vercel', 'Deploy and test checkout']) {
      await sub.getByRole('textbox', { name: 'New subtask', exact: true }).fill(title);
      await sub.getByRole('textbox', { name: 'New subtask', exact: true }).press('Enter');
    }
    await sub.getByRole('textbox', { name: 'New subtask', exact: true }).press('Escape');
    assert.equal(await sub.locator('.subtask').count(), 3);
    assert.equal(await firstSubtask.isVisible(), false);
    assert.equal(await task(3).locator('.first-subtask').isVisible(), false);
    assert.equal(await sub.locator('#count').innerText(), '2');
    await sub.mouse.move(0, 0);
    assert.equal(await opacity(head.locator('.mode-chip')), '0');
    await head.locator('.add-subtask').focus();
    assert.equal(await opacity(head.locator('.mode-chip')), '1');
    await head.locator('.add-subtask').press('Enter');
    await sub.getByRole('textbox', { name: 'New subtask', exact: true }).press('Escape');
    await head.hover();
    await head.locator('.mode-chip').click();
    assert.equal(await sub.locator('.subtask-number').count(), 3);
    const geometry = await task(3).evaluate(el => ({
      check: el.querySelector('.check').getBoundingClientRect().left,
      numberRight: el.querySelector('.subtask-number').getBoundingClientRect().right,
      header: el.closest('.subtasks').querySelector('.subtasks-head > span').getBoundingClientRect().left,
      height: el.querySelector('.line').getBoundingClientRect().height,
    }));
    assert.equal(geometry.check, geometry.header);
    assert.equal(geometry.check - geometry.numberRight, 14);
    assert.ok(geometry.height < 36);
    // Opening the parent must not accidentally expand every nested details panel.
    assert.equal(await task(3).locator('.body').isVisible(), false);
    await task(4).locator(':scope > .line').click({ position: { x: 280, y: 8 } });
    assert.equal(await task(4).locator('.body').isVisible(), true);
    assert.equal(await task(3).locator('.body').isVisible(), false);
    await task(4).locator('.body').click();
    await task(4).locator('textarea').fill('Open the environment settings. Add STRIPE_KEY, then redeploy.');
    await task(4).locator('textarea').press('Control+Enter');
    await sub.waitForFunction(() => testState.tasks.find(t => t.id === 4).details.startsWith('Open the environment'));
    // Blank details gutters collapse only their own task, not the parent or active controls.
    await task(4).locator(':scope > .details > .details-inner > .details-pad').click({ position: { x: 5, y: 5 } });
    assert.equal(await task(4).locator(':scope > .line').getAttribute('aria-expanded'), 'false');
    assert.equal(await task(1).locator(':scope > .line').getAttribute('aria-expanded'), 'true');
    await task(4).locator(':scope > .line').focus();
    await sub.keyboard.press('Enter');
    await task(1).locator(':scope > .details > .details-inner > .details-pad').click({ position: { x: 5, y: 5 } });
    assert.equal(await task(1).locator(':scope > .line').getAttribute('aria-expanded'), 'false');
    await task(1).locator(':scope > .line').focus();
    await sub.keyboard.press('Enter');
    const parentPad = task(1).locator(':scope > .details > .details-inner > .details-pad');
    const padBounds = await parentPad.boundingBox();
    await parentPad.click({ position: { x: 80, y: padBounds.height - 3 } });
    assert.equal(await task(1).locator(':scope > .line').getAttribute('aria-expanded'), 'false');
    await task(1).locator(':scope > .line').focus();
    await sub.keyboard.press('Enter');
    await task(3).locator(':scope > .line').dragTo(task(5).locator(':scope > .line'));
    const order = () => sub.locator('.subtask').evaluateAll(els => els.map(el => Number(el.dataset.taskId)));
    assert.deepEqual(await order(), [4, 5, 3]);
    await task(4).locator(':scope > .line').focus();
    await sub.keyboard.press('Alt+ArrowDown');
    assert.deepEqual(await order(), [5, 4, 3]);
    await head.hover();
    await head.locator('.mode-chip').click();
    assert.equal(await sub.locator('.subtask-number').count(), 0);
    assert.deepEqual(await order(), [5, 4, 3]);
    await head.locator('.mode-chip').click();
    await task(3).locator(':scope > .line > .check').click();
    assert.match(await task(1).locator(':scope > .line > .check').getAttribute('title'), /1 of 3/);
    assert.equal(await task(3).isVisible(), true);
    assert.equal(await sub.locator('#count').innerText(), '2');
    await sub.setViewportSize({ width: 360, height: 760 });
    await sub.mouse.move(0, 0);
    await sub.screenshot({ path: '/tmp/tinytasks-subtasks.png' });
    await head.hover();
    await sub.screenshot({ path: '/tmp/tinytasks-subtasks-hover.png' });
    await sub.setViewportSize({ width: 280, height: 620 });
    assert.equal(await sub.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await task(4).locator('.actions').evaluate(el => getComputedStyle(el).opacity), '1');
    await task(4).locator('.open-note').click();
    assert.equal(await sub.evaluate(() => testState.calls.filter(c => c.cmd === 'open_note' && c.args.id === 4).length), 1);
    // New-subtask drafts survive external refresh and failed saves.
    await head.hover();
    await head.locator('.add-subtask').click();
    await sub.getByRole('textbox', { name: 'New subtask', exact: true }).fill('Keep this draft');
    await sub.evaluate(() => { testState.failSave = true; testState.emit(); });
    await sub.getByRole('textbox', { name: 'New subtask', exact: true }).press('Enter');
    assert.equal(await sub.getByRole('textbox', { name: 'New subtask', exact: true }).inputValue(), 'Keep this draft');
    await sub.getByRole('textbox', { name: 'New subtask', exact: true }).press('Escape');
    assert.equal(await sub.locator('.subtask').count(), 3);
    await sub.evaluate(() => { testState.failSave = false; });
    // A parent note includes its children, and child notes remain independent.
    await sub.evaluate(() => { window.noteFixture = structuredClone(testState.tasks); });
    const fixture = await sub.evaluate(() => noteFixture);
    await note.goto(`${url}?task=1`);
    await note.evaluate(fixture => { testState.tasks.splice(0, testState.tasks.length, ...fixture); testState.emit(); }, fixture);
    await note.waitForSelector('.subtask');
    assert.equal(await note.locator('.subtask').count(), 3);
    await note.setViewportSize({ width: 340, height: 360 });
    await note.mouse.move(0, 0);
    await note.screenshot({ path: '/tmp/tinytasks-paper-note.png' });

    // My desk selects individual subtasks, with parent context instead of an implicit parent card.
    const desk = await context.newPage();
    desk.on('pageerror', e => errors.push(e.message));
    await desk.goto(url);
    await desk.evaluate(fixture => {
      testState.tasks.splice(0, testState.tasks.length, ...fixture);
      testState.tasks.find(t => t.id === 4).mydesk = true;
      testState.emit();
    }, fixture);
    await desk.locator('#view').click();
    assert.equal(await desk.locator('[data-view="desk"] .n').innerText(), '2');
    await desk.locator('[data-view="desk"]').click();
    const deskChild = desk.locator('#open > section > ul > .task[data-task-id="4"]');
    assert.equal(await desk.locator('.task[data-task-id="1"], .task[data-task-id="3"], .task[data-task-id="5"]').count(), 0);
    assert.equal(await desk.locator('#count').innerText(), '2');
    assert.equal(await deskChild.locator('.parent-context').innerText(), 'Connect the payment flow');
    assert.equal(await deskChild.locator('.parent-context svg').count(), 1);
    assert.equal(await deskChild.locator('.subtask-number').count(), 0);
    await deskChild.locator('.parent-context').click();
    assert.equal(await deskChild.locator('.body').innerText(), 'Open the environment settings. Add STRIPE_KEY, then redeploy.');
    assert.equal(await deskChild.locator('.first-subtask').isVisible(), false);
    await deskChild.locator('.title-text').click();
    await deskChild.locator('textarea').fill('Add the production secret');
    await deskChild.locator('textarea').press('Enter');
    assert.equal(await desk.evaluate(() => testState.tasks.find(t => t.id === 1).title), 'Connect the payment flow');
    await desk.setViewportSize({ width: 360, height: 520 });
    await desk.screenshot({ path: '/tmp/tinytasks-desk-subtask.png' });
    await desk.setViewportSize({ width: 280, height: 520 });
    assert.equal(await desk.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await deskChild.locator('.set-desk').click();
    assert.equal(await deskChild.count(), 0);
    assert.equal(await desk.locator('#count').innerText(), '1');
    await desk.evaluate(() => {
      testState.tasks.find(t => t.id === 4).mydesk = true;
      testState.tasks.find(t => t.id === 1).mydesk = true;
      testState.emit();
    });
    await desk.locator('.task[data-task-id="1"] > .line').focus();
    await desk.keyboard.press('Enter');
    assert.equal(await desk.locator('.task[data-task-id="4"]').count(), 1);
    assert.equal(await desk.locator('#count').innerText(), '3');
    await deskChild.locator(':scope > .line > .check').click();
    await deskChild.waitFor({ state: 'detached' });
    assert.equal(await desk.evaluate(() => testState.tasks.find(t => t.id === 1).done_at), null);
    assert.equal(await desk.evaluate(() => testState.tasks.find(t => t.id === 5).done_at), null);

    await task(4).locator('.delete').click();
    assert.equal(await sub.locator('.subtask').count(), 2);
    await sub.evaluate(() => { testState.tasks.splice(2); testState.emit(); });
    await head.waitFor({ state: 'hidden' });
    assert.equal(await head.isVisible(), false);
    assert.equal(await firstSubtask.isVisible(), true);
    // Grouping and ordering are independent, persisted per view, and never reorder stored subtasks.
    const layout = await context.newPage();
    layout.on('pageerror', e => errors.push(e.message));
    await layout.goto(url);
    await layout.evaluate(() => localStorage.clear());
    await layout.reload();
    await layout.evaluate(() => {
      const base = testState.tasks[0], now = Date.now() / 1000;
      const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      const make = (id, title, extra) => ({ ...base, id, title, details: '', parent_id: null, created_at: now - id * 100, done_at: null, mydesk: true, ...extra });
      testState.tasks.splice(0, testState.tasks.length,
        make(11, 'Gamma', { chat: 'Alpha', priority: 1, due: day(-1) }),
        make(12, 'Alpha', { chat: 'Alpha', priority: 2, due: day(5) }),
        make(13, 'Zeta', { chat: 'Beta', priority: 0, due: day(1) }),
        make(14, 'Delta', { chat: 'Alpha', priority: null, due: null }),
        make(15, 'Finished earlier', { done_at: now - 100 }),
        make(16, 'Finished later', { done_at: now - 10 }),
        make(17, 'A step', { parent_id: 11, position: 1, mydesk: false }),
        make(18, 'Z step', { parent_id: 11, position: 0, mydesk: false }));
      testState.emit();
      window.originalLayoutTasks = JSON.stringify(testState.tasks);
    });
    const chooseLayout = async (id, value) => {
      await layout.locator(id).click();
      await layout.locator(`#layout-options [data-value="${value}"]`).click();
    };
    const roots = () => layout.locator('#open > section > ul > .task').evaluateAll(els => els.map(el => Number(el.dataset.taskId)));
    await layout.locator('#group').click();
    assert.equal(await layout.locator('#group-menu .layout-setting').count(), 2);
    assert.equal(await layout.locator('#group-menu select').count(), 0);
    await layout.locator('#group-field').focus();
    await layout.keyboard.press('ArrowDown');
    assert.equal(await layout.locator('#layout-options [aria-checked="true"]').getAttribute('data-value'), await layout.locator('#group-field').getAttribute('data-value'));
    await layout.keyboard.press('Escape');
    assert.equal(await layout.locator('#layout-options').isVisible(), false);
    assert.equal(await layout.locator('#group-menu').isVisible(), true);
    assert.equal(await layout.locator('#group-field').evaluate(el => el === document.activeElement), true);
    await layout.keyboard.press('ArrowDown');
    await layout.keyboard.press('Home');
    await layout.keyboard.press('Enter');
    assert.equal(await layout.locator('#group-field').getAttribute('data-value'), 'none');
    assert.equal(await layout.locator('.group-head').count(), 0);
    assert.equal(await layout.locator('#group-direction').isDisabled(), true);
    await layout.locator('#order-field').click();
    assert.equal(await layout.locator('#layout-options [data-value="completed"]').count(), 0);
    await layout.keyboard.press('Escape');
    await chooseLayout('#order-field', 'priority');
    assert.deepEqual(await roots(), [13, 11, 12, 14]);
    await layout.locator('#order-direction').click();
    assert.deepEqual(await roots(), [12, 11, 13, 14]);
    await chooseLayout('#order-field', 'due');
    assert.deepEqual(await roots(), [11, 13, 12, 14]);
    await layout.locator('#order-direction').click();
    assert.deepEqual(await roots(), [12, 13, 11, 14]);
    await chooseLayout('#order-field', 'name');
    assert.deepEqual(await roots(), [12, 14, 11, 13]);
    await layout.locator('#order-direction').click();
    assert.deepEqual(await roots(), [13, 11, 14, 12]);
    await chooseLayout('#order-field', 'added');
    assert.deepEqual(await roots(), [11, 12, 13, 14]);
    await layout.locator('#order-direction').click();
    assert.deepEqual(await roots(), [14, 13, 12, 11]);
    await chooseLayout('#group-field', 'priority');
    assert.deepEqual(await roots(), [13, 11, 12, 14]);
    await layout.locator('#group-direction').click();
    assert.deepEqual(await roots(), [12, 11, 13, 14]);
    await chooseLayout('#group-field', 'chat');
    await chooseLayout('#order-field', 'due');
    assert.deepEqual(await roots(), [11, 12, 14, 13]);
    await layout.locator('#group-direction').click();
    assert.deepEqual(await roots(), [13, 11, 12, 14]);
    await layout.keyboard.press('Escape');
    await layout.locator('.task[data-task-id="11"] > .line').focus();
    await layout.keyboard.press('Enter');
    const steps = () => layout.locator('.task[data-task-id="11"] .subtask').evaluateAll(els => els.map(el => Number(el.dataset.taskId)));
    assert.deepEqual(await steps(), [18, 17]);
    await layout.locator('#group').click();
    await chooseLayout('#order-field', 'name');
    assert.deepEqual(await steps(), [18, 17]);
    await layout.locator('#order-direction').click();
    assert.deepEqual(await steps(), [18, 17]);
    await layout.setViewportSize({ width: 280, height: 520 });
    const bounds = await layout.locator('#group-menu').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 280);
    await layout.locator('#group-field').click();
    const optionBounds = await layout.locator('#layout-options').boundingBox();
    assert.ok(optionBounds.x >= 0 && optionBounds.x + optionBounds.width <= 280);
    await layout.keyboard.press('Escape');
    await layout.setViewportSize({ width: 360, height: 560 });
    await layout.screenshot({ path: '/tmp/tinytasks-grouping-ordering.png' });
    await layout.emulateMedia({ colorScheme: 'light' });
    await layout.locator('#group-menu').screenshot({ path: '/tmp/tinytasks-group-menu-light.png' });
    await layout.locator('#order-field').click();
    await layout.screenshot({ path: '/tmp/tinytasks-custom-order-light.png' });
    await layout.emulateMedia({ colorScheme: 'dark' });
    await layout.screenshot({ path: '/tmp/tinytasks-custom-order-dark.png' });
    await layout.locator('header').click({ position: { x: 180, y: 12 } });
    assert.equal(await layout.locator('#layout-options').isVisible(), false);
    assert.equal(await layout.locator('#group-menu').isVisible(), false);
    await layout.locator('#view').click();
    await layout.locator('[data-view="desk"]').click();
    assert.equal(await layout.locator('#group-field').getAttribute('data-value'), 'time');
    await layout.locator('#group').click();
    await chooseLayout('#group-field', 'none');
    await chooseLayout('#order-field', 'priority');
    await layout.locator('#view').click();
    await layout.locator('[data-view="done"]').click();
    assert.equal(await layout.locator('#group-field').getAttribute('data-value'), 'none');
    assert.equal(await layout.locator('#order-field').getAttribute('data-value'), 'completed');
    assert.deepEqual(await roots(), [16, 15]);
    await layout.locator('#group').click();
    await layout.locator('#order-field').click();
    assert.equal(await layout.locator('#layout-options [data-value="completed"]').getAttribute('aria-checked'), 'true');
    await layout.keyboard.press('Escape');
    await layout.locator('#order-direction').click();
    assert.deepEqual(await roots(), [15, 16]);
    await chooseLayout('#group-field', 'chat');
    assert.equal(await layout.locator('.group-head').count(), 1);
    await layout.locator('#view').click();
    await layout.locator('[data-view="all"]').click();
    assert.equal(await layout.locator('#group-field').getAttribute('data-value'), 'chat');
    assert.equal(await layout.locator('#order-field').getAttribute('data-value'), 'name');
    assert.equal(await layout.locator('#group-direction').getAttribute('data-descending'), 'true');
    assert.equal(await layout.locator('#order-direction').getAttribute('data-descending'), 'true');
    assert.equal(await layout.evaluate(() => JSON.stringify(testState.tasks) === originalLayoutTasks), true);
    await layout.reload();
    assert.equal(await layout.locator('#group-field').getAttribute('data-value'), 'chat');
    assert.equal(await layout.locator('#order-field').getAttribute('data-value'), 'name');
    assert.equal(await layout.locator('#order-direction').getAttribute('data-descending'), 'true');
    await layout.evaluate(() => {
      localStorage.setItem('listLayouts', '{invalid');
      localStorage.setItem('groupBy', 'priority');
      localStorage.setItem('lowFirst', '1');
    });
    await layout.reload();
    assert.equal(await layout.locator('#group-field').getAttribute('data-value'), 'priority');
    assert.equal(await layout.locator('#group-direction').getAttribute('data-descending'), 'true');
    const appearance = await context.newPage();
    await appearance.goto(url);
    await appearance.evaluate(() => localStorage.removeItem('theme'));
    await appearance.reload();
    const themeNote = await context.newPage();
    await themeNote.goto(`${url}?task=1`);
    await appearance.locator('#view').click();
    await appearance.locator('#settings-open').click();
    assert.equal(await appearance.locator('#settings').isVisible(), true);
    assert.equal(await appearance.getByRole('radio').count(), 7);
    assert.equal(await appearance.getByRole('radio', { name: 'System', exact: true }).isChecked(), true);
    const selectTheme = async id => appearance.locator(`.theme-card:has(input[value="${id}"])`).click();
    for (const id of ['parchment', 'solarized-light', 'solarized-dark', 'paper', 'forest', 'midnight']) {
      await selectTheme(id);
      assert.equal(await appearance.locator('html').getAttribute('data-theme'), id);
      await themeNote.waitForFunction(id => document.documentElement.dataset.theme === id, id);
      assert.equal(await appearance.locator(`input[value="${id}"]`).isChecked(), true);
    }
    await selectTheme('solarized-light');
    assert.equal(await appearance.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(253, 246, 227)');
    await appearance.locator('#settings-close').click();
    assert.equal(await appearance.locator('#settings').isVisible(), false);
    await appearance.waitForFunction(() => document.activeElement === document.getElementById('view'));
    await appearance.screenshot({ path: '/tmp/tinytasks-solarized-light.png' });
    await appearance.reload();
    assert.equal(await appearance.locator('html').getAttribute('data-theme'), 'solarized-light');
    await appearance.keyboard.press('Meta+,');
    assert.equal(await appearance.locator('#settings').isVisible(), true);
    await appearance.emulateMedia({ colorScheme: 'dark' });
    assert.equal(await appearance.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(253, 246, 227)');
    await selectTheme('solarized-dark');
    await appearance.locator('.settings-body').evaluate(el => { el.scrollTop = 0; });
    await appearance.screenshot({ path: '/tmp/tinytasks-theme-settings.png' });
    await appearance.setViewportSize({ width: 280, height: 240 });
    await selectTheme('midnight');
    assert.equal(await appearance.evaluate(() => document.querySelector('.settings-body').scrollWidth <= innerWidth), true);
    await appearance.getByRole('radio', { name: 'Midnight', exact: true }).focus();
    await appearance.keyboard.press('ArrowLeft');
    assert.equal(await appearance.locator('html').getAttribute('data-theme'), 'forest');
    await appearance.keyboard.press('Escape');
    assert.equal(await appearance.locator('#settings').isVisible(), false);
    await appearance.keyboard.press('Meta+,');
    await selectTheme('system');
    await appearance.emulateMedia({ colorScheme: 'light' });
    await appearance.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(255, 248, 226)');
    await appearance.emulateMedia({ colorScheme: 'dark' });
    await appearance.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(31, 29, 25)');
    await appearance.evaluate(() => localStorage.setItem('theme', 'unknown-theme'));
    await appearance.reload();
    assert.equal(await appearance.locator('html').getAttribute('data-theme'), 'system');
    assert.equal(await appearance.evaluate(() => testState.calls.some(c => ['edit_task', 'set_done', 'set_priority', 'set_desk', 'delete_task'].includes(c.cmd))), false);
    assert.deepEqual(errors, []);
    console.log('PASS: display/group persistence, editing and retry, notes, subtasks, My desk, drag/keyboard order, grouping and ordering in both directions, per-view layouts, preference migration, progress, compact alignment, hover/focus controls, narrow layout, themes, settings keyboard access, theme persistence and note syncing.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
