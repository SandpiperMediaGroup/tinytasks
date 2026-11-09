// Shareable release images rendered from the real UI with fictional task data.
// Uses the same Playwright overrides as ui-smoke.cjs; never reads the user's tasks.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

async function macControls(page) {
  await page.evaluate(() => {
    document.body.classList.add('mac-titlebar');
    const controls = document.createElement('div');
    controls.className = 'release-window-controls';
    controls.setAttribute('aria-hidden', 'true');
    controls.innerHTML = '<i></i><i></i><i></i>';
    document.body.appendChild(controls);
  });
  await page.addStyleTag({ content: `
    .release-window-controls { position: fixed; left: 16px; top: 15px; display: flex; gap: 9px; z-index: 1000; pointer-events: none; }
    .release-window-controls i { width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 .5px #0002; background: #ff5f57; }
    .release-window-controls i:nth-child(2) { background: #febc2e; }
    .release-window-controls i:nth-child(3) { background: #28c840; }
  ` });
}

(async () => {
  const output = path.resolve(__dirname, '../artifacts/release-0.2.1');
  await fs.mkdir(output, { recursive: true });
  const version = JSON.parse(await fs.readFile(path.resolve(__dirname, '../tauri.conf.json'), 'utf8')).version;
  assert.equal(version, '0.2.1');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const errors = [];
  const ui = pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href;
  try {
    const fixture = async completed => {
      const context = await browser.newContext({ viewport: { width: completed ? 500 : 1040, height: completed ? 400 : 650 }, deviceScaleFactor: 2, timezoneId: 'America/Los_Angeles' });
      await context.addInitScript(({ completed, version }) => {
        const now = Math.floor(Date.now() / 1000), DAY = 86400;
        const date = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
        const noon = new Date(); noon.setHours(10, 0, 0, 0);
        const today = Math.floor(noon.getTime() / 1000);
        localStorage.setItem('appearance', JSON.stringify({ theme: completed ? 'midnight' : 'parchment', mode: completed ? 'dark' : 'light' }));
        localStorage.setItem('sidebar', completed ? '0' : '1');
        localStorage.setItem('sidebarWidth', '236');
        localStorage.setItem('view', completed ? 'done' : 'all');
        localStorage.setItem('selectedList', JSON.stringify(completed ? null : 'Website refresh'));
        localStorage.setItem('listOrder', JSON.stringify(['Website refresh', 'Studio admin', 'Conference prep', '', 'Someday']));
        localStorage.setItem('listIcons', JSON.stringify({ 'Website refresh': 'folder', 'Studio admin': 'palette', 'Conference prep': 'mic', '': 'star', 'Someday': 'moon' }));
        localStorage.setItem('listLayouts', JSON.stringify({ all: { groupBy: 'chat', orderBy: 'added', groupDescending: false, orderDescending: true }, done: { groupBy: 'completed', orderBy: 'completed', groupDescending: false, orderDescending: true } }));
        localStorage.setItem('properties', JSON.stringify({ chat: false, agent: true, added: false, completed: !completed, priority: true, due: true, subtasks: true }));
        const base = { agent: '', priority: null, due: null, created_at: now - 7200, done_at: null, mydesk: false, parent_id: null, position: 0, ordered: false, details: '', link: '' };
        const tasks = [
          { ...base, id: 1, title: 'Approve the new homepage', details: 'The draft is ready. Give it one last look before we ship.', chat: 'Website refresh', agent: 'claude', due: date(1), ordered: true, mydesk: true, created_at: now - 3600 },
          { ...base, id: 2, title: 'Check the mobile layout', parent_id: 1, position: 0, done_at: today, chat: 'Website refresh' },
          { ...base, id: 3, title: 'Approve the final copy', parent_id: 1, position: 1, chat: 'Website refresh' },
          { ...base, id: 4, title: 'Choose a launch date', parent_id: 1, position: 2, chat: 'Website refresh' },
          { ...base, id: 5, title: 'Send the launch note', details: 'A quick heads-up for the team.', chat: 'Website refresh', agent: 'codex', due: date(2), created_at: now - 3700 },
          { ...base, id: 6, title: 'Review the first-week results', chat: 'Website refresh', due: date(7), created_at: now - 3800 },
          { ...base, id: 7, title: 'Pick up the print proofs', chat: 'Studio admin', due: date(0), mydesk: true },
          { ...base, id: 8, title: 'Send the speaker bio', chat: 'Conference prep', due: date(0) },
          { ...base, id: 9, title: 'Book a weekend away', chat: '' },
          { ...base, id: 10, title: 'Check the redirect list', chat: 'Website refresh', agent: 'codex', due: date(0), priority: 2, created_at: now - 3750 },
          { ...base, id: 20, title: 'Approve the visual direction', chat: 'Website refresh', done_at: today },
          { ...base, id: 21, title: 'Send the project brief', chat: 'Website refresh', done_at: today - 3600 },
          { ...base, id: 22, title: 'Choose the color palette', chat: 'Website refresh', done_at: today - DAY },
          { ...base, id: 23, title: 'Gather the first ideas', chat: 'Website refresh', done_at: today - 3 * DAY },
        ];
        window.__TAURI__ = {
          event: { listen: async () => () => {} },
          core: { invoke: async (cmd, args = {}) => {
            if (cmd === 'check_for_updates') return { current_version: version, latest_version: version, update_available: false };
            if (cmd === 'app_info') return { version, mcp: {} };
            if (cmd === 'list_chats') return ['Website refresh', 'Studio admin', 'Conference prep', '', 'Someday'];
            if (cmd === 'location') return { short: 'This computer', folder: '/example/TinyTasks' };
            if (cmd === 'list_note') return structuredClone(tasks.filter(t => t.id === args.id || t.parent_id === args.id));
            return structuredClone(tasks);
          } },
        };
      }, { completed, version });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(ui);
      await macControls(page);
      await page.locator('.task').first().waitFor();
      return page;
    };
    const main = await fixture(false);
    await main.locator('.task[data-task-id="1"] > .line .subtask-count').click();
    await main.locator('.task[data-task-id="3"]').waitFor();
    await main.locator('#list-nav [data-chat="Studio admin"]').click({ button: 'right', position: { x: 28, y: 24 } });
    await main.locator('#sidebar-menu').waitFor();
    await main.evaluate(() => document.activeElement.blur());
    await main.mouse.move(1035, 645);
    const mainPath = path.join(output, 'TinyTasks-0.2.1-sidebar.png');
    await main.screenshot({ path: mainPath, animations: 'disabled' });
    const completed = await fixture(true);
    await completed.mouse.move(495, 395);
    const completedPath = path.join(output, 'TinyTasks-0.2.1-completed.png');
    await completed.screenshot({ path: completedPath, animations: 'disabled' });
    assert.deepEqual(await completed.locator('.group-head').allTextContents(), ['Today2›', 'Yesterday1›', 'This week1›']);
    const mainData = (await fs.readFile(mainPath)).toString('base64');
    const completedData = (await fs.readFile(completedPath)).toString('base64');
    const card = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    await card.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}body{margin:0;width:1600px;height:1000px;background:#e1e8df}
      .window{position:absolute;overflow:hidden;border:1px solid #263c3325;border-radius:15px;box-shadow:0 24px 55px #263c3324,0 3px 8px #263c3310}.window img{display:block;width:100%;height:100%}.main{left:48px;top:48px;width:1248px;height:780px}.completed{left:992px;top:504px;width:560px;height:448px;box-shadow:0 24px 60px #1b2c3545,0 3px 8px #263c3320}
    </style></head><body>
      <div class="window main"><img src="data:image/png;base64,${mainData}" alt="TinyTasks list and sidebar menu"></div>
      <div class="window completed"><img src="data:image/png;base64,${completedData}" alt="Completed tasks grouped by date"></div>
    </body></html>`);
    await card.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await card.screenshot({ path: path.join(output, 'TinyTasks-0.2.1-Bluesky.png'), animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log(`Rendered release screenshots with fictional data in ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
