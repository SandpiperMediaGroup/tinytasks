const assert = require('node:assert/strict');

module.exports = async (browser, installMock, url, errors) => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 520 } });
  await context.addInitScript(installMock);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('selectedList', JSON.stringify('Long list'));
      localStorage.setItem('listLayouts', JSON.stringify({all:{groupBy:'none',orderBy:'added',orderDescending:false}}));
    });
    await page.reload();
    await page.evaluate(() => {
      const base = testState.tasks[0];
      testState.tasks.splice(0,testState.tasks.length,...Array.from({length:80},(_,i)=>({...base,id:i+1,title:`Task ${i+1}`,chat:'Long list',priority:null,due:null,mydesk:false,created_at:base.created_at+i})));
      testState.emit();
    });
    await page.locator('.task[data-task-id="80"]').waitFor();
    const main=page.locator('#main'), line=id=>page.locator(`.task[data-task-id="${id}"] > .line`);
    async function open(id) {
      await line(id).scrollIntoViewIfNeeded();
      await line(id).click({button:'right'});
      return main.evaluate(el=>el.scrollTop);
    }
    let before=await open(50);
    await page.locator('#task-menu [data-action="set-desk"]').click();
    await page.waitForFunction(()=>testState.tasks.find(t=>t.id===50).mydesk);
    await page.waitForFunction(()=>document.activeElement?.closest('.task')?.dataset.taskId==='50');
    let after=await main.evaluate(el=>el.scrollTop);
    console.log('Desk action scroll:',{before,after});
    assert.ok(Math.abs(after-before)<2,'Changing a task property should preserve list scroll');
    before=await open(51);
    await page.locator('#task-menu [data-action="set-chat"]').click();
    await page.locator('#list-menu [data-chat-choice="Later"]').click();
    await page.locator('.task[data-task-id="51"]').waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.matches('.task > .line'));
    after=await main.evaluate(el=>el.scrollTop);
    console.log('Move action scroll:',{before,after});
    assert.ok(Math.abs(after-before)<2,'Moving a task out of a selected list should preserve scroll');
    before=await open(52);
    await page.locator('#task-menu [data-action="delete"]').click();
    await page.locator('.task[data-task-id="52"]').waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.matches('.task > .line'));
    after=await main.evaluate(el=>el.scrollTop);
    assert.ok(Math.abs(after-before)<2,'Deleting a task should preserve list scroll');
    console.log('PASS: context actions preserve scroll for property changes, moves, and deletions.');
  } finally { await context.close(); }
};
