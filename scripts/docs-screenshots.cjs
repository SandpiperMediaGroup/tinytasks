// Render the current UI with fictional tasks; never reads a user's task file.
// Uses the same PLAYWRIGHT_MODULE / PLAYWRIGHT_CHROMIUM_EXECUTABLE overrides as ui-smoke.cjs.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs/promises');

// Browser captures do not include AppKit chrome. Recreate the macOS controls only
// in these documentation previews, matching the app's 44px title bar and 16px inset.
// Sticky notes intentionally have no native traffic lights.
async function addMacWindowControls(page) {
  await page.evaluate(() => {
    document.body.classList.add('mac-titlebar');
    const controls = document.createElement('div');
    controls.className = 'docs-window-controls';
    controls.setAttribute('aria-hidden', 'true');
    controls.innerHTML = '<i></i><i></i><i></i>';
    document.body.appendChild(controls);
  });
  await page.addStyleTag({ content: `
    .docs-window-controls { position: fixed; left: 16px; top: 15px; display: flex; gap: 9px; z-index: 1000; pointer-events: none; }
    .docs-window-controls i { display: block; width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 0.5px #0002; background: #ff5f57; }
    .docs-window-controls i:nth-child(2) { background: #febc2e; }
    .docs-window-controls i:nth-child(3) { background: #28c840; }
  ` });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 420, height: 620 }, deviceScaleFactor: 2, timezoneId: 'America/Los_Angeles' });
    await context.addInitScript(() => {
      const now = Math.floor(Date.now() / 1000);
      const day = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      localStorage.setItem('appearance', JSON.stringify({ theme: 'parchment', mode: 'light' }));
      localStorage.setItem('groupBy', 'chat');
      localStorage.setItem('listLayouts', JSON.stringify({ all: { groupBy: 'chat', orderBy: 'added', groupDescending: true, orderDescending: true } }));
      localStorage.setItem('properties', JSON.stringify({ chat: false }));
      const base = { agent: '', priority: null, due: null, created_at: now - 7200, done_at: null, mydesk: false, parent_id: null, position: 0, ordered: false, details: '', link: '' };
      const tasks = [
        { ...base, id: 1, title: 'Review the new homepage', details: 'The draft is ready. Check the mobile layout, then give the team your final notes.', chat: 'Website refresh', due: day(1), ordered: true },
        { ...base, id: 2, title: 'Check the mobile layout', parent_id: 1, position: 0, done_at: now - 3600, chat: 'Website refresh' },
        { ...base, id: 3, title: 'Approve the final copy', parent_id: 1, position: 1, chat: 'Website refresh' },
        { ...base, id: 4, title: 'Choose a launch date', parent_id: 1, position: 2, chat: 'Website refresh' },
        { ...base, id: 5, title: 'Send the speaker bio', details: 'A short introduction and a headshot for the event page.', chat: 'Conference prep', due: day(0), priority: 1 },
        { ...base, id: 6, title: 'Pick up the print proofs', details: 'Check the colors in daylight before approving the run.', chat: 'Studio admin', due: day(2) },
      ];
      window.__TAURI__ = {
        core: { invoke: async (cmd, args = {}) => {
          if (cmd === 'location') return { short: 'Cloud Drive › TinyTasks', folder: '/example/Cloud Drive/TinyTasks' };
          if (cmd === 'list_note') return tasks.filter(t => t.id === args.id || t.parent_id === args.id);
          return structuredClone(tasks);
        } },
        event: { listen: async () => () => {} },
      };
    });
    const output = path.resolve(__dirname, '../docs/screenshots');
    await fs.mkdir(output, { recursive: true });
    const ui = pathToFileURL(path.resolve(__dirname, '../ui/index.html')).href;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(ui);
    await addMacWindowControls(page);
    const parent = page.locator('.task[data-task-id="1"]');
    await parent.locator(':scope > .line').focus();
    await page.keyboard.press('Enter');
    await page.evaluate(() => document.activeElement.blur());
    await page.mouse.move(410, 615);
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'tasks-light.png') });
    await page.evaluate(() => { tinyThemes.select('midnight'); tinyThemes.setMode('dark'); });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'tasks-dark.png') });
    await page.locator('#group').click();
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'grouping.png') });
    await page.keyboard.press('Escape');
    await parent.locator(':scope > .line').click({ button: 'right' });
    await page.screenshot({ animations: 'disabled', path: path.join(output, 'task-menu.png') });
    const settings = await context.newPage();
    settings.on('pageerror', error => errors.push(error.message));
    await settings.setViewportSize({ width: 420, height: 900 });
    await settings.goto(pathToFileURL(path.resolve(__dirname, '../ui/settings.html')).href);
    await addMacWindowControls(settings);
    await settings.evaluate(() => { tinyThemes.select('solarized'); tinyThemes.setMode('light'); });
    await settings.screenshot({ animations: 'disabled', path: path.join(output, 'settings.png') });
    const note = await context.newPage();
    note.on('pageerror', error => errors.push(error.message));
    await note.setViewportSize({ width: 420, height: 300 });
    await note.goto(`${ui}?task=1`);
    await note.evaluate(() => { tinyThemes.select('solarized'); tinyThemes.setMode('light'); });
    await note.locator('.note-root').waitFor();
    await note.screenshot({ animations: 'disabled', path: path.join(output, 'sticky-note.png') });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Rendered six current-UI previews with fictional tasks in ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
