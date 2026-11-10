// Focused list/navigation regressions, run by ui-smoke.cjs with its isolated desktop fixture.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

module.exports = async (browser, installMock, url, errors) => {
  const dir = path.resolve(__dirname, '../artifacts/list-interactions');
  fs.mkdirSync(dir, { recursive: true });
  const reviewMotion = process.env.REVIEW_MOTION === '1';
  const context = await browser.newContext({ viewport: { width: 1120, height: 780 }, ...(reviewMotion ? { recordVideo: { dir, size: { width: 1120, height: 780 } } } : {}) });
  await context.addInitScript(installMock);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  const task = id => page.locator(`.task[data-task-id="${id}"]`);
  const rootLine = id => task(id).locator(':scope > .line');
  const wait = () => page.waitForTimeout(220);
  const assertNoOverflow = async () => assert.equal(await page.evaluate(() => document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth), true);
  const alignment = [];
  const assertCentered = async (line, selectors, label) => {
    const measurement = await line.evaluate((el, selectors) => {
      const row = el.getBoundingClientRect();
      const middle = row.y + row.height / 2;
      return { height: row.height, items: selectors.flatMap(selector => [...el.querySelectorAll(selector)].filter(item => item.getClientRects().length).map(item => {
        const bounds = item.getBoundingClientRect();
        return { selector, offset: bounds.y + bounds.height / 2 - middle };
      })) };
    }, selectors);
    alignment.push({ label, ...measurement });
    for (const item of measurement.items) assert.ok(Math.abs(item.offset) <= 0.5, `${label}: ${item.selector} is ${item.offset}px off the row center`);
    return measurement;
  };
  const allRowItems = ['.check', '.title', '.task-id', '.agent-badge', '.chat', '.due', '.due svg', '.due > span', '.prio', '.time', '.subtask-count', '.more'];
  try {
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await task(1).waitFor();
    // Blank canvas starts entry where the double-click occurred, with repeated entry and retry.
    const bottom = await page.locator('#open').evaluate(el => el.getBoundingClientRect().bottom);
    await page.mouse.dblclick(400, bottom + 45);
    assert.equal(await page.locator('#new-title').evaluate(el => el === document.activeElement), true);
    await page.locator('#new-title').fill('First quick thought');
    await page.screenshot({ path: path.join(dir, 'quick-entry.png') });
    await page.locator('#new-title').press('Enter');
    await page.waitForFunction(() => testState.tasks.some(t => t.title === 'First quick thought'));
    await page.locator('#new-title').fill('Second quick thought');
    await page.evaluate(() => { testState.failSave = true; });
    await page.locator('#new-title').press('Enter');
    await page.waitForFunction(() => !document.querySelector('#new-title').readOnly);
    assert.equal(await page.locator('#new-title').inputValue(), 'Second quick thought');
    await page.evaluate(() => { testState.failSave = false; });
    await page.locator('#new-title').press('Enter');
    await page.waitForFunction(() => testState.tasks.some(t => t.title === 'Second quick thought'));
    await page.locator('#new-title').press('Escape');

    // Editable attributes open immediately; task details remain closed.
    await task(1).locator('.due').click();
    assert.equal(await page.locator('#due-menu').isVisible(), true);
    await page.screenshot({ path: path.join(dir, 'due-picker.png') });
    assert.equal(await rootLine(1).getAttribute('aria-expanded'), 'false');
    await page.locator('#due-menu [data-quick="0"]').click();
    await page.waitForFunction(() => testState.tasks[0].due === new Date().toLocaleDateString('en-CA'));
    await task(1).locator('.prio').click();
    await page.locator('#prio-menu button[data-p="2"]').click();
    await page.waitForFunction(() => testState.tasks[0].priority === 2);
    // Attribution remains visible but cannot open an editor or take keyboard focus.
    const badge = task(1).locator('.agent-badge');
    const wasExpanded = await rootLine(1).getAttribute('aria-expanded');
    assert.equal(await badge.getAttribute('role'), null);
    assert.equal(await badge.evaluate(el => el.tabIndex), -1);
    await badge.click();
    assert.equal(await page.locator('#attribute-menu').isVisible(), false);
    assert.equal(await page.evaluate(() => testState.tasks[0].agent), 'codex');
    assert.equal(await page.evaluate(() => testState.calls.some(c => c.cmd === 'edit_task' && 'agent' in c.args)), false);
    if (await rootLine(1).getAttribute('aria-expanded') !== wasExpanded) { await rootLine(1).focus(); await page.keyboard.press('Enter'); }
    // External Markdown changes still refresh the displayed attribution.
    await page.evaluate(() => { testState.tasks[0].agent = 'claude'; testState.emit(); });
    await badge.filter({has:page.locator('svg')}).waitFor();
    await page.waitForFunction(() => document.querySelector('.task[data-task-id="1"] .agent-badge')?.title === 'Claude');
    await task(1).locator('.chat').click();
    await page.screenshot({ path: path.join(dir, 'move-picker.png') });
    await page.locator('#list-menu [data-chat-choice="Later"]').click();
    await page.waitForFunction(() => testState.tasks[0].chat === 'Later');
    const contextLists = async () => {
      await rootLine(1).click({ button: 'right' });
      await page.screenshot({ path: path.join(dir, 'context-menu.png') });
      await page.locator('#task-menu [data-action="set-chat"]').click();
      assert.equal(await page.locator('#list-menu').isVisible(), true);
    };
    await contextLists();
    await page.locator('#list-menu [data-chat-choice="Billing launch"]').click();
    await page.waitForFunction(() => testState.tasks[0].chat === 'Billing launch');
    await contextLists();
    await page.locator('#list-menu [data-new-list]').click();
    await page.locator('#attribute-value').fill('Menu-created list');
    await page.locator('#attribute-value').press('Enter');
    await page.waitForFunction(() => testState.tasks[0].chat === 'Menu-created list');
    await task(1).locator('.chat').click();
    await page.locator('#list-menu [data-new-list]').click();
    await page.locator('#attribute-value').fill('Row-created list');
    await page.locator('#attribute-value').press('Enter');
    await page.waitForFunction(() => testState.tasks[0].chat === 'Row-created list');
    await task(1).locator('.chat').click();
    await page.locator('#list-menu [data-chat-choice="Later"]').click();
    await page.waitForFunction(() => testState.tasks[0].chat === 'Later');

    // Metadata shares the text baseline in wide layouts and wraps without overflow.
    const inline = await task(1).evaluate(el => {
      const title = el.querySelector('.title').getBoundingClientRect();
      const sub = el.querySelector('.sub').getBoundingClientRect();
      return Math.abs(title.y - sub.y) < 6;
    });
    assert.equal(inline, true);
    await page.locator('#display').click();
    await page.locator('[data-property="id"]').click();
    await page.keyboard.press('Escape');
    await assertCentered(rootLine(1), allRowItems, 'wide row with all attributes');
    await page.screenshot({ path: path.join(dir, 'inline-attributes.png') });
    await page.locator('#display').click();
    await page.locator('[data-property="id"]').click();
    await page.keyboard.press('Escape');
    await page.locator('#view').click();
    await page.screenshot({ path: path.join(dir, 'nav-menu.png') });
    await page.locator('#sidebar-toggle').click();
    assert.equal(await page.locator('#sidebar').isVisible(), true);
    assert.deepEqual(await page.locator('#primary-nav .nav-label').allTextContents(), ['My Desk', 'Today', 'Upcoming', 'All', 'Completed']);
    assert.equal(await page.locator('#primary-nav .nav-icon svg').count(), 5);
    assert.equal(await page.locator('#list-nav [data-chat="Later"] .agent-badge').count(), 1);
    assert.equal(await page.locator('#list-nav [data-chat="Billing launch"] .nav-icon svg').count(), 1);
    await page.locator('#list-nav [data-chat="Billing launch"] .list-icon').click();
    await page.locator('#list-icon-options [aria-label="folder"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('listIcons'))['Billing launch']), 'folder');
    await page.locator('#list-nav [data-chat="Later"] .list-icon').click();
    assert.equal(await page.locator('#list-icon-options button').count(), 80);
    const iconRows = await page.locator('#list-icon-options button').evaluateAll(buttons => {
      const rows = new Map();
      for (const button of buttons) { const y = button.getBoundingClientRect().y; rows.set(y, (rows.get(y) || 0) + 1); }
      return [...rows.values()];
    });
    assert.deepEqual(iconRows, Array(10).fill(8));
    assert.equal(await page.locator('#list-icon-menu input, #custom-list-icon, #list-icon-auto').count(), 0);
    assert.equal(await page.locator('#list-icon-agent button').count(), 1);
    assert.equal(await page.locator('#list-icon-agent button').getAttribute('aria-label'), 'Use Claude logo');
    await page.screenshot({ path: path.join(dir, 'icon-picker.png') });
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#list-icon-options [aria-label="star"]').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('End');
    assert.equal(await page.locator('#list-icon-options button').last().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#list-nav [data-chat="Later"] .list-icon').evaluate(el => el === document.activeElement), true);
    await page.locator('#list-nav [data-chat="Later"] .list-icon').click();
    await page.locator('#list-icon-options [aria-label="rocket"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('listIcons')).Later), 'rocket');
    assert.equal(await page.evaluate(() => testState.tasks[0].agent), 'claude');
    await page.locator('#list-nav [data-chat="Later"] .list-icon').click();
    await page.locator('#list-icon-agent button').click();
    assert.equal(await page.locator('#list-nav [data-chat="Later"] .agent-badge').getAttribute('title'), 'Claude');
    await page.locator('#list-nav [data-chat="Later"] .list-icon').click();
    await page.locator('#list-icon-options [aria-label="rocket"]').click();
    // New empty lists have a real creation action and an independent entry field.
    await page.locator('#sidebar-space').dblclick();
    await page.locator('#new-list-name').fill('Release checklist');
    await page.screenshot({ path: path.join(dir, 'new-list-entry.png') });
    await page.locator('#new-list-name').press('Enter');
    await page.waitForFunction(() => document.querySelector('#heading').textContent === 'Release checklist');
    await page.locator('#add').click();
    await page.locator('#new-title').fill('Created in this list');
    await page.locator('#new-title').press('Enter');
    await page.waitForFunction(() => testState.tasks.some(t => t.title === 'Created in this list' && t.chat === 'Release checklist'));
    await page.locator('#new-title').press('Escape');
    await page.getByRole('navigation', { name: 'Views', exact: true }).getByRole('button', { name: /^All/ }).click();

    // Drag to sidebar; the parent's children follow without changing their order.
    await page.evaluate(() => {
      const parent = testState.tasks[0];
      testState.tasks.push({ ...parent, id: 20, title: 'Open child', parent_id: 1, position: 0, done_at: null },
        { ...parent, id: 21, title: 'Completed child', parent_id: 1, position: 1, done_at: Date.now() / 1000 });
      testState.emit();
    });
    await task(1).locator(':scope > .line .subtask-count').waitFor();
    assert.equal(await task(1).locator(':scope > .line .subtask-count').innerText(), '1/2');
    const collapsed = await assertCentered(rootLine(1), allRowItems, 'parent with subtask count');
    await page.screenshot({ path: path.join(dir, 'row-alignment-collapsed.png') });
    await rootLine(1).focus(); await page.keyboard.press('Enter'); await wait();
    const opened = await assertCentered(rootLine(1), allRowItems, 'same parent with details expanded');
    assert.equal(opened.height, collapsed.height);
    await assertCentered(rootLine(20), allRowItems, 'subtask row');
    await page.screenshot({ path: path.join(dir, 'row-alignment-expanded.png') });
    await rootLine(1).focus(); await page.keyboard.press('Enter'); await wait();
    await page.evaluate(() => {
      window.originalTaskTitle = testState.tasks[0].title;
      testState.tasks[0].title = 'A long task title that wraps across multiple lines while the completion circle, priority, date and actions remain balanced within the row. '.repeat(2);
      testState.emit();
    });
    await page.waitForFunction(() => document.querySelector('.task[data-task-id="1"] .title-text').textContent.startsWith('A long task title'));
    await assertCentered(rootLine(1), ['.check', '.prio', '.time', '.subtask-count', '.more'], 'wrapped task title');
    await page.screenshot({ path: path.join(dir, 'row-alignment-wrapped.png') });
    await page.evaluate(() => { testState.tasks[0].title = originalTaskTitle; testState.emit(); });
    await page.waitForFunction(() => document.querySelector('.task[data-task-id="1"] .title-text').textContent === originalTaskTitle);
    const drag = async (from, to, cancel = false, capture = null) => {
      const a = await from.boundingBox(), b = await to.boundingBox();
      await page.mouse.move(a.x + 39, a.y + a.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2, b.y + Math.min(b.height / 2, 16), { steps: 16 });
      await page.waitForTimeout(100);
      if (capture) await page.screenshot({ path: path.join(dir, capture + '.png') });
      if (cancel) await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
      await page.mouse.up();
    };
    await drag(rootLine(1), page.locator('#list-nav [data-chat="Billing launch"]'), false, 'drag-to-sidebar');
    await page.waitForFunction(() => testState.tasks[0].chat === 'Billing launch');
    assert.equal(await page.evaluate(() => testState.tasks.filter(t => t.parent_id === 1).every(t => t.chat === 'Billing launch')), true);
    // Empty lists stay in the sidebar and do not create empty groups on the All canvas.
    await page.locator('#group').click();
    await page.locator('#group-field').click();
    await page.locator('#layout-options [data-value="chat"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#open section[data-chat="Later"]').count(), 0);
    await page.evaluate(() => { testState.tasks.push({ ...testState.tasks[0], id: 22, title: 'Another later task', chat: 'Later', parent_id: null }); testState.emit(); });
    await page.locator('#open section[data-chat="Later"] .group-head').waitFor();
    await drag(rootLine(1), page.locator('#open section[data-chat="Later"] .group-head'), false, 'drag-to-canvas');
    await page.waitForFunction(() => testState.tasks[0].chat === 'Later');
    const callsBeforeCancel = await page.evaluate(() => testState.calls.filter(c => c.cmd === 'edit_task').length);
    await drag(rootLine(1), page.locator('#list-nav [data-chat="Billing launch"]'), true);
    assert.equal(await page.evaluate(() => testState.calls.filter(c => c.cmd === 'edit_task').length), callsBeforeCancel);

    // Row progress stays visible on hover and hiding Completed also hides completed children.
    await task(1).locator(':scope > .line .subtask-count').click();
    await wait();
    assert.equal(await task(21).isVisible(), true);
    await page.locator('#display').click();
    await page.screenshot({ path: path.join(dir, 'completed-before.png') });
    await page.locator('[data-property="completed"]').click();
    assert.equal(await task(21).count(), 0);
    assert.equal(await task(20).isVisible(), true);
    await page.screenshot({ path: path.join(dir, 'completed-after.png') });
    await page.locator('[data-property="subtasks"]').click();
    assert.equal(await task(1).locator(':scope > .line .subtask-count').isVisible(), false);
    await page.locator('[data-property="subtasks"]').click();
    await page.keyboard.press('Escape');
    await rootLine(1).hover();
    assert.equal(await task(1).locator(':scope > .line .subtask-count').isVisible(), true);
    await page.screenshot({ path: path.join(dir, 'wide-sidebar.png') });
    for (const width of [280, 360, 700, 1120]) {
      await page.setViewportSize({ width, height: 780 });
      await page.waitForFunction(shown => document.querySelector('#sidebar').hidden === !shown, width >= 720);
      assert.equal(await page.evaluate(() => localStorage.getItem('sidebar')), '1');
      await assertNoOverflow();
      await assertCentered(rootLine(1), ['.check', '.more'], `parent controls at ${width}px`);
      await assertCentered(rootLine(20), ['.check', '.more'], `subtask controls at ${width}px`);
    }
    await page.setViewportSize({ width: 360, height: 780 });
    await page.screenshot({ path: path.join(dir, 'narrow-sidebar.png') });
    fs.writeFileSync(path.join(dir, 'row-alignment.json'), JSON.stringify(alignment, null, 2));
    await page.setViewportSize({ width: 1120, height: 780 });
    await page.reload();
    assert.equal(await page.locator('#sidebar').isVisible(), true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('listIcons')).Later), 'rocket');
    assert.equal(await page.locator('#list-nav [data-chat="Later"] .nav-icon svg').count(), 1);
    // Settings writes the same preference, including cross-window updates.
    const settings = await context.newPage();
    await settings.goto(url.replace('index.html', 'settings.html'));
    await settings.screenshot({ path: path.join(dir, 'sidebar-settings.png') });
    await settings.locator('#show-sidebar').uncheck();
    await page.waitForFunction(() => document.querySelector('#sidebar').hidden);
    await settings.locator('#show-sidebar').check();
    await page.waitForFunction(() => !document.querySelector('#sidebar').hidden);
    await settings.locator('#copy-mcp').click();
    assert.deepEqual(await settings.evaluate(() => JSON.parse(testClipboard)), { mcpServers: { tinytasks: { command: 'C:\\Program Files\\TinyTasks\\tinytasks.exe', args: ['mcp'] } } });
    assert.equal(await settings.locator('#mcp-status').innerText(), 'Configuration copied.');
    await settings.locator('[data-about-link="agent-setup"]').click();
    assert.equal(await settings.evaluate(() => testState.calls.some(c => c.cmd === 'open_about_link' && c.args.destination === 'agent-setup')), true);
    await settings.locator('#check-updates').click();
    await settings.waitForFunction(() => document.querySelector('#update-status').textContent === 'You’re up to date.');
    assert.equal(await settings.evaluate(() => testState.calls.some(c => c.cmd === 'check_for_updates' && c.args.force === true)), true);
    await settings.evaluate(() => { testState.failUpdate = true; });
    await settings.locator('#check-updates').click();
    await settings.waitForFunction(() => document.querySelector('#update-status').textContent.includes('Could not reach GitHub'));
    assert.equal(await settings.locator('#settings-download').isVisible(), false);
    await settings.evaluate(() => { testState.failUpdate = false; testState.update = { current_version: '0.1.0', latest_version: '0.2.0', update_available: true }; });
    await settings.locator('#check-updates').click();
    await settings.locator('#settings-download').waitFor();
    await settings.locator('#settings-download').click();
    assert.equal(await settings.evaluate(() => testState.calls.some(c => c.cmd === 'open_about_link' && c.args.destination === 'releases')), true);
    await settings.locator('.settings-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await settings.screenshot({ path: path.join(dir, 'mcp-and-updates.png') });
    await page.evaluate(() => { testState.update = { current_version: '0.1.0', latest_version: '0.2.0', update_available: true }; testState.emitUpdate(); });
    await page.locator('#release-download').waitFor();
    await page.locator('#release-download').click();
    assert.equal(await page.evaluate(() => testState.calls.some(c => c.cmd === 'open_about_link' && c.args.destination === 'releases')), true);
    await page.screenshot({ path: path.join(dir, 'release-notice.png') });
    await page.evaluate(() => { testState.failUpdate = true; window.dispatchEvent(new Event('focus')); });
    assert.equal(await page.locator('#notice').isVisible(), false, 'Background update failures stay quiet');
    await page.evaluate(() => { testState.failUpdate = false; testState.update.update_available = false; testState.emitUpdate(); });
    await settings.close();
    // Today includes all open due dates through today, even old overdue tasks.
    const previousTodayCount = Number(await page.locator('#primary-nav button').nth(1).locator('.n').innerText());
    await page.evaluate(() => {
      const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      const base = { ...testState.tasks[0], chat: 'Due-date checks', parent_id: null, done_at: null, mydesk: false };
      testState.tasks.push(
        { ...base, id: 100, title: 'Long-overdue action', due: '2020-01-01', created_at: 1577836800 },
        { ...base, id: 101, title: 'Due yesterday', due: day(-1) },
        { ...base, id: 102, title: 'Due today', due: day(0) },
        { ...base, id: 103, title: 'Due tomorrow', due: day(1) },
        { ...base, id: 104, title: 'No due date', due: null },
        { ...base, id: 105, title: 'Already completed', due: day(-1), done_at: Date.now() / 1000 },
      );
      testState.emit();
    });
    await page.locator('#primary-nav button').nth(1).click();
    assert.equal(await page.locator('#heading').innerText(), 'Today');
    assert.equal(await task(1).isVisible(), true);
    for (const id of [100, 101, 102]) assert.equal(await task(id).isVisible(), true);
    for (const id of [103, 104, 105]) assert.equal(await task(id).count(), 0);
    assert.equal(Number(await page.locator('#primary-nav button').nth(1).locator('.n').innerText()), previousTodayCount + 3);
    await page.locator('#view').click();
    assert.equal(Number(await page.locator('#view-menu [data-view="today"] .n').innerText()), previousTodayCount + 3);
    await page.keyboard.press('Escape');
    await page.locator('#primary-nav button').nth(2).click();
    assert.equal(await page.locator('#heading').innerText(), 'Upcoming');
    assert.equal(await task(1).count(), 0);
    assert.equal(await task(103).isVisible(), true);
    for (const id of [100, 101, 102, 104, 105]) assert.equal(await task(id).count(), 0);
    await page.evaluate(() => {
      for (let i = testState.tasks.length - 1; i >= 0; i--) if (testState.tasks[i].id >= 100 && testState.tasks[i].id <= 105) testState.tasks.splice(i, 1);
      testState.emit();
    });
    await page.locator('#primary-nav button').nth(3).click();
    await page.evaluate(() => {
      const parent = testState.tasks[0];
      testState.tasks.push({ ...parent, id: 20, title: 'Open child', parent_id: 1, position: 0, done_at: null },
        { ...parent, id: 21, title: 'Completed child', parent_id: 1, position: 1, done_at: Date.now() / 1000 });
      testState.emit();
    });
    await task(1).locator(':scope > .line .subtask-count').waitFor();
    if (reviewMotion) {
    // Motion review uses actual rendered transitions, at normal and slowed speed,
    // plus deterministically stepped captures of every intermediate transition frame.
    await rootLine(1).focus();
    await page.keyboard.press('Enter'); await wait();
    await page.keyboard.press('Enter'); await wait();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(45);
    await page.keyboard.press('Enter');
    await wait();
    await page.evaluate(() => {
      const row = document.querySelector('.task[data-task-id="1"]');
      row.querySelector('.line').click();
      row.getAnimations({ subtree: true }).forEach(a => a.playbackRate = 0.125);
    });
    await page.waitForTimeout(1400);
    await page.evaluate(() => {
      const row = document.querySelector('.task[data-task-id="1"]');
      row.querySelector('.line').click();
      row.getAnimations({ subtree: true }).forEach(a => a.playbackRate = 0.125);
    });
    await page.waitForTimeout(1400);
    const frames = [];
    for (const opening of [true, false]) {
      await page.evaluate(open => {
        const row = document.querySelector('.task[data-task-id="1"]');
        row.classList.toggle('open', !open);
        row.getAnimations({ subtree: true }).forEach(a => a.finish());
        void row.offsetHeight;
        row.classList.toggle('open', open);
        window.motionAnimations = row.getAnimations({ subtree: true });
        motionAnimations.forEach(a => { a.pause(); a.currentTime = 0; });
      }, opening);
      for (let ms = 0; ms <= 160; ms += 16) {
        await page.evaluate(ms => motionAnimations.forEach(a => { a.currentTime = ms; }), ms);
        const name = `${opening ? 'expand' : 'collapse'}-${String(ms).padStart(3, '0')}.png`;
        await page.screenshot({ path: path.join(dir, name) });
        frames.push({ name, ms, opening, geometry: await task(1).evaluate(el => ({ x: el.querySelector('.title').getBoundingClientRect().x, height: el.querySelector('.details').getBoundingClientRect().height })) });
      }
    }
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(frames, null, 2));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => { motionAnimations.forEach(a => a.finish()); });
    await rootLine(1).focus(); await page.keyboard.press('Enter');
    assert.equal(await task(1).locator(':scope > .details').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.screenshot({ path: path.join(dir, 'reduced-motion.png') });
    }
    console.log('PASS: blank-canvas entry/retry, inline attributes, sidebar/settings sync, list creation/move pickers, icons, canvas/sidebar dragging/cancel, subtask visibility/progress, wide/narrow layouts and navigation.' + (reviewMotion ? ' Motion recordings and stepped frames: ' + dir : ''));
  } catch (err) {
    await page.screenshot({ path: path.join(dir, 'failure.png'), timeout: 2000 }).catch(() => {});
    throw err;
  } finally {
    const video = page.video();
    await context.close();
    if (video) await video.saveAs(path.join(dir, 'interactions.webm')).catch(() => {});
  }
};
