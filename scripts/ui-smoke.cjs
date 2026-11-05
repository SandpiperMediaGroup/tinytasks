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
          if (cmd === 'list_note') return structuredClone(tasks.filter(t => t.id === args.id));
          if (cmd === 'edit_task') {
            if (window.testState.failSave) throw new Error('File unavailable');
            if (!t) throw new Error('That task is gone.');
            for (const field of ['title', 'details']) if (field in args) t[field] = args[field];
          }
          if (cmd === 'set_done') t.done_at = args.done ? now : null;
          if (cmd === 'set_priority') t.priority = args.priority;
          if (cmd === 'set_desk') t.mydesk = args.on;
          if (cmd === 'delete_task') tasks.splice(tasks.indexOf(t), 1);
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
    await first.locator('.pin-task').click();
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
    assert.equal(await note.locator('.pin-task').isVisible(), false);
    await note.evaluate(() => { testState.tasks[0].title = 'Synced from the list'; testState.emit(); });
    await note.waitForFunction(() => document.querySelector('.title-text')?.textContent === 'Synced from the list');
    await note.locator('.task .check').click();
    await note.waitForSelector('.task.done');
    await note.locator('.task .check').click();
    await note.waitForSelector('.task:not(.done)');
    await note.screenshot({ path: '/tmp/tinytasks-note.png' });
    await note.locator('.delete').click();
    await note.waitForSelector('#empty:not([hidden])');
    assert.equal(await note.locator('#empty').innerText(), 'This task was deleted.');
    assert.deepEqual(errors, []);
    console.log('PASS: display persistence, collapse persistence, keyboard, inline editing, concurrent updates, save failure/retry, pin command, sticky note sync/completion/deletion, narrow layout.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
