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
    await task(1).locator('.agent-badge').click();
    await page.locator('#attribute-value').fill('claude');
    await page.locator('#attribute-value').press('Enter');
    await page.waitForFunction(() => testState.tasks[0].agent === 'claude');
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
    await page.screenshot({ path: path.join(dir, 'inline-attributes.png') });
    await page.locator('#display').click();
    await page.locator('[data-property="id"]').click();
    await page.keyboard.press('Escape');
    await page.locator('#view').click();
    await page.screenshot({ path: path.join(dir, 'nav-menu.png') });
    await page.locator('#sidebar-toggle').click();
    assert.equal(await page.locator('#sidebar').isVisible(), true);
    assert.deepEqual(await page.locator('#primary-nav .nav-label').allTextContents(), ['My Desk', 'Today', 'Upcoming', 'All']);
    assert.equal(await page.locator('#primary-nav .nav-icon svg').count(), 4);
    assert.equal(await page.locator('#list-nav [data-chat="Later"] .agent-badge').count(), 1);
    assert.equal(await page.locator('#list-nav [data-chat="Billing launch"] .nav-icon svg').count(), 1);
    await page.locator('#list-nav [data-chat="Billing launch"] .list-icon').click();
    await page.locator('#list-icon-options [aria-label="folder"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('listIcons'))['Billing launch']), 'folder');
    await page.locator('#list-nav [data-chat="Later"] .list-icon').click();
    assert.ok(await page.locator('#list-icon-options button').count() >= 72);
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
    // Canvas destinations remain usable even when the list is empty or collapsed.
    await page.locator('#group').click();
    await page.locator('#group-field').click();
    await page.locator('#layout-options [data-value="chat"]').click();
    await page.keyboard.press('Escape');
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
      await assertNoOverflow();
    }
    await page.setViewportSize({ width: 360, height: 780 });
    await page.screenshot({ path: path.join(dir, 'narrow-sidebar.png') });
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
    await settings.close();
    await page.locator('#primary-nav button').nth(1).click();
    assert.equal(await page.locator('#heading').innerText(), 'Today');
    assert.equal(await task(1).isVisible(), true);
    await page.locator('#primary-nav button').nth(2).click();
    assert.equal(await page.locator('#heading').innerText(), 'Upcoming');
    assert.equal(await task(1).count(), 0);
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
