// Sidebar/list management with isolated state; storage round trips are covered in Rust.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async (browser, installMock, url, errors) => {
  const dir = path.resolve(__dirname, '../artifacts/sidebar-interactions');
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  await context.addInitScript(installMock);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  const row = name => page.locator('#list-nav .sidebar-list').filter({ has: page.locator('.nav-label', { hasText: new RegExp(`^${name}$`) }) });
  const select = name => row(name).locator('button:not(.list-icon)').click();
  const all = () => page.locator('#primary-nav button').filter({ has: page.locator('.nav-label', { hasText: /^All$/ }) }).click();
  const names = () => page.locator('#list-nav .nav-label').allTextContents();
  const action = async (name, value) => { await row(name).click({ button: 'right' }); await page.locator(`#sidebar-menu [data-list-action="${value}"]`).click(); };
  try {
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('listLayouts', JSON.stringify({ all: { groupBy: 'chat', orderBy: 'name' } }));
    });
    await page.reload();
    await page.locator('.task').first().waitFor();
    await page.locator('#view').click();
    await page.locator('#sidebar-toggle').click();
    await page.waitForFunction(() => testState.calls.some(c => c.cmd === 'ensure_sidebar_visible'));
    // The native resize command is asserted above; emulate its resulting viewport in the browser.
    await page.setViewportSize({ width: 860, height: 780 });
    await page.locator('#sidebar').waitFor();
    assert.deepEqual(await page.locator('#primary-nav .nav-label').allTextContents(), ['My Desk', 'Today', 'Upcoming', 'All', 'Completed']);
    assert.equal(await row('Personal').count(), 1);
    assert.equal(await row('Later').count(), 1);
    assert.equal(await page.locator('#open section[data-chat="Later"]').count(), 0);
    // Agent attribution must not invent a second list for an unfiled task.
    await page.evaluate(() => { testState.tasks.find(t => t.id === 2).agent = 'Nuthatch'; testState.emit(); });
    const personalGroup = page.locator('#open section[data-chat=""]');
    await personalGroup.locator('.group-head').filter({hasText:'Personal'}).waitFor();
    assert.equal(await personalGroup.locator('.task[data-task-id="2"]').count(), 1);
    assert.equal(await page.locator('#open .task[data-task-id="2"]').count(), 1);
    assert.equal(await page.locator('#open .group-head').filter({hasText:'Nuthatch'}).count(), 0);
    assert.equal(await personalGroup.locator('.agent-badge[aria-label="Edit agent"]').count(), 1);
    assert.equal(await row('Personal').locator('.n').innerText(), '1');
    await select('Personal');
    assert.equal(await page.locator('#heading').innerText(), 'Personal');
    assert.equal(await page.locator('#open .task').count(), 1);
    assert.equal(await page.locator('#open .task[data-task-id="2"]').count(), 1);
    assert.equal(await page.locator('#open .group-head').count(), 0);
    assert.equal(await page.locator('#heading-icon svg').count(), 1);
    await select('Billing launch');
    assert.equal(await page.locator('#open .group-head').count(), 0);
    await row('Billing launch').locator('.list-icon').click();
    await page.locator('#list-icon-options [aria-label="folder"]').click();
    assert.equal(await page.locator('#heading-icon svg').innerHTML(), await row('Billing launch').locator('.list-icon svg').innerHTML());

    await page.locator('#sidebar-space').dblclick();
    await all();
    assert.equal(await page.locator('#new-list').isVisible(), false);
    assert.equal(await page.evaluate(() => testState.calls.filter(c => c.cmd === 'create_list').length), 0);
    const plus = await page.locator('#add-list').evaluate(el => {
      const button = el.getBoundingClientRect(), icon = el.querySelector('svg').getBoundingClientRect();
      return [icon.x + icon.width / 2 - button.x - button.width / 2, icon.y + icon.height / 2 - button.y - button.height / 2];
    });
    assert.ok(plus.every(offset => Math.abs(offset) <= .5), `New-list icon is off-center: ${plus}`);
    const divider = page.locator('#sidebar-resizer');
    const oldWidth = await page.locator('#sidebar').evaluate(el => el.getBoundingClientRect().width);
    const bounds = await divider.boundingBox();
    await page.mouse.move(bounds.x + 2, bounds.y + 100); await page.mouse.down();
    await page.mouse.move(bounds.x + 72, bounds.y + 100, { steps: 8 }); await page.mouse.up();
    const resizedWidth = await page.locator('#sidebar').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(resizedWidth > oldWidth + 50);
    await page.reload();
    await row('Personal').waitFor();
    assert.equal(await page.locator('#sidebar').evaluate(el => el.getBoundingClientRect().width), resizedWidth);
    await divider.focus(); await page.keyboard.press('ArrowLeft');
    assert.ok(await page.locator('#sidebar').evaluate(el => el.getBoundingClientRect().width) < resizedWidth);
    await page.screenshot({ path: path.join(dir, 'resized-sidebar.png') });

    const before = await names();
    const drag = async (source, destination, cancel = false) => {
      const a = await row(source).locator('button:not(.list-icon)').boundingBox(), b = await row(destination).boundingBox();
      await page.mouse.move(a.x + 35, a.y + a.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + 60, b.y + b.height - 2, { steps: 12 });
      if (cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await drag('Billing launch', 'Later');
    assert.deepEqual(await names(), [...before.filter(n => n !== 'Billing launch'), 'Billing launch']);
    assert.equal(await page.locator('#heading').innerText(), 'Tasks');
    const reordered = await names();
    await drag('Personal', 'Billing launch', true);
    assert.deepEqual(await names(), reordered);
    await row('Billing launch').locator('button:not(.list-icon)').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.notDeepEqual(await names(), reordered);
    const keyboardOrder = await names();
    await page.reload(); await row('Personal').waitFor();
    assert.deepEqual(await names(), keyboardOrder);
    await action('Billing launch', 'down');
    assert.deepEqual(await names(), reordered);
    await row('Billing launch').locator('button:not(.list-icon)').focus();
    await page.keyboard.press('Shift+F10');
    assert.equal(await page.locator('#sidebar-menu').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await row('Billing launch').locator('button:not(.list-icon)').evaluate(el => el === document.activeElement), true);
    await action('Billing launch', 'icon');
    await page.locator('#list-icon-options [aria-label="folder"]').click();

    // Renaming retries without losing tasks or the icon and rejects collisions.
    await select('Billing launch');
    await action('Billing launch', 'rename');
    await page.locator('#list-name').fill('Later');
    await page.locator('#list-dialog-save').click();
    await page.locator('#list-dialog-error').waitFor();
    assert.equal(await row('Billing launch').count(), 1);
    await page.locator('#list-name').fill('Home & studio');
    await page.evaluate(() => { testState.failLists = true; });
    await page.locator('#list-dialog-save').click();
    await page.waitForFunction(() => document.querySelector('#list-dialog-error').textContent.includes('unavailable'));
    await page.evaluate(() => { testState.failLists = false; });
    await page.locator('#list-dialog-save').click();
    await page.waitForFunction(() => !document.querySelector('#list-dialog').open);
    assert.equal(await page.locator('#heading').innerText(), 'Home & studio');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('listIcons'))['Home & studio']), 'folder');
    assert.equal(await page.evaluate(() => testState.tasks.find(t => t.id === 1).chat), 'Home & studio');
    await page.screenshot({ path: path.join(dir, 'selected-list-header.png') });

    await page.evaluate(() => {
      const parent = testState.tasks.find(t => t.id === 1);
      testState.tasks.push({ ...parent, id: 10, title: 'An archived child', parent_id: 1, position: 0, done_at: Date.now() / 1000 });
      testState.emit();
    });
    await page.evaluate(() => { testState.failLists = true; });
    await action('Home & studio', 'archive');
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes("Couldn't archive"));
    assert.equal(await row('Home & studio').count(), 1);
    await page.evaluate(() => { testState.failLists = false; });
    await action('Home & studio', 'archive');
    await page.waitForFunction(() => !testState.tasks.some(t => t.chat === 'Home & studio'));
    await page.waitForFunction(() => document.querySelector('#heading').textContent === 'Tasks');
    assert.equal(await row('Home & studio').count(), 0);
    assert.deepEqual(await page.evaluate(() => testState.archives[0].tasks.map(t => t.id)), [1, 10]);
    assert.equal(await page.locator('#notice').isVisible(), false);

    await action('Later', 'delete');
    await page.locator('#list-dialog-cancel').click();
    assert.equal(await row('Later').count(), 1);
    assert.equal(await page.evaluate(() => testState.calls.filter(c => c.cmd === 'delete_list').length), 0);
    await action('Later', 'delete');
    await page.locator('#list-dialog-save').click();
    await page.waitForFunction(() => !document.querySelector('#list-dialog').open);
    assert.equal(await row('Later').count(), 0);

    // Relative groups use completion dates, independently of the dates tasks were added.
    await page.evaluate(() => {
      const now = new Date(); now.setHours(12, 0, 0, 0);
      const today = now.getTime() / 1000;
      testState.tasks.push({ ...testState.tasks[0], id: 50, title: 'Done today', created_at: 1, done_at: today },
        { ...testState.tasks[0], id: 51, title: 'Done yesterday', created_at: today, done_at: today - 86400 });
      testState.emit();
    });
    await page.locator('#primary-nav button').filter({ has: page.locator('.nav-label', { hasText: /^Completed$/ }) }).click();
    await page.locator('#group').click(); await page.locator('#group-field').click();
    await page.locator('#layout-options [data-value="completed"]').click(); await page.keyboard.press('Escape');
    assert.deepEqual(await page.locator('.group-head').allTextContents(), ['Today1›', 'Yesterday1›']);
    assert.equal(await page.locator('section').filter({ has: page.locator('.group-head', { hasText: 'Today' }) }).locator('.title-text').innerText(), 'Done today');
    await page.screenshot({ path: path.join(dir, 'completed-relative-groups.png') });
    await page.locator('#group').click(); await page.locator('#group-direction').click(); await page.keyboard.press('Escape');
    assert.deepEqual(await page.locator('.group-head').allTextContents(), ['Yesterday1›', 'Today1›']);
    await all();
    await page.locator('#group').click(); await page.locator('#group-field').click();
    assert.equal(await page.locator('#layout-options [data-value="completed"]').count(), 0);
    await page.keyboard.press('Escape');

    const settings = await context.newPage();
    await settings.goto(url.replace('index.html', 'settings.html'));
    await settings.locator('#show-sidebar').uncheck();
    await page.waitForFunction(() => document.querySelector('#sidebar').hidden);
    await page.setViewportSize({ width: 360, height: 780 });
    const expansions = await page.evaluate(() => testState.calls.filter(c => c.cmd === 'ensure_sidebar_visible').length);
    await settings.locator('#show-sidebar').check();
    await page.waitForFunction(n => testState.calls.filter(c => c.cmd === 'ensure_sidebar_visible').length > n, expansions);
    await page.setViewportSize({ width: 860, height: 780 });
    await page.locator('#sidebar').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: Personal lists, empty groups, selected-list headers/icons, centered plus, blank-entry blur, sidebar resizing/order/cancel/persistence, context actions/retry, archive families, delete confirmation, narrow-window enable, Completed navigation and relative completion-date grouping.');
  } finally { await context.close(); }
};
