const assert = require('node:assert/strict');
module.exports = async (browser, installMock, url, errors) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 740 }, colorScheme: 'light' });
  await context.addInitScript(installMock);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('sidebar','1'); localStorage.setItem('appearance',JSON.stringify({theme:'parchment',mode:'light'})); });
    await page.reload();
    await page.locator('.task').first().waitFor();
    await page.evaluate(() => {
      const now = Date.now()/1000, base = testState.tasks[0];
      testState.tasks.splice(0, testState.tasks.length,
        {...base,id:1,title:'Review the share-transfer dates',chat:'Personal',due:null,mydesk:false},
        {...base,id:2,title:'Prepare the green-screen setup',chat:'Studio',due:'2026-11-10',mydesk:true},
        {...base,id:3,title:'Confirm editing capacity for the four clips',chat:'Client work',due:null,mydesk:false},
        {...base,id:4,title:'Choose a venue for lunch',chat:'Personal',due:null,mydesk:true},
        {...base,id:5,title:'Check storage usage',chat:'Operations',due:'2026-11-12',mydesk:false},
        {...base,id:6,title:'Pick up the print proofs',chat:'Studio',due:null,mydesk:false,parent_id:2,position:0});
      testState.desk.items = [{id:2,start:'10:30',duration:45},{id:4,start:'12:30',duration:null}];
      testState.chats = ['Personal','Studio','Client work','Operations'];
      window.originalTasks = structuredClone(testState.tasks);
      window.suggest = () => { testState.desk.proposal = {id:'proposal-'+Date.now(),agent:'Dot',items:[
        {id:1,start:'09:00',duration:20},{id:2,start:'10:00',duration:45},{id:3,start:'11:15',duration:25},
        {id:4,start:'12:30',duration:null},{id:5,start:'15:00',duration:20}]};testState.emit(); };
      suggest();
    });
    await page.locator('#primary-nav .desk-review-badge').waitFor();
    await page.locator('#primary-nav button').filter({hasText:'My Desk'}).click();
    const rows = page.locator('#open > section > ul > .desk-task');
    assert.equal(await rows.count(),5);assert.equal(await page.locator('#desk-proposal-label').innerText(),'Dot’s suggestion');
    assert.equal(await page.locator('#desk-markers button').count(),5);assert.equal(await page.locator('#desk-markers [data-point="true"]').count(),1);
    assert.equal(await page.locator('#group').isVisible(),false);assert.equal(await page.locator('.group-head').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(testState.tasks)===JSON.stringify(originalTasks)),true);
    assert.ok((await rows.evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height))).every(h=>h<55));
    assert.equal(await rows.first().locator('.check').isDisabled(),true);
    await page.screenshot({path:'/tmp/tinytasks-desk-suggestion.png'});
    await page.locator('#desk-markers [data-task-id="3"]').hover();assert.equal(await page.locator('.desk-task[data-task-id="3"]').evaluate(el=>el.classList.contains('timeline-active')),true);
    await page.locator('#desk-markers [data-task-id="3"]').click();
    assert.equal(await page.locator('#desk-time-dialog').isVisible(),true);
    await page.locator('#desk-start').fill('11:30');await page.locator('#desk-duration').fill('');await page.locator('#desk-time-save').click();await page.locator('#desk-time-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('.desk-task[data-task-id="3"] .desk-time').innerText(),'11:30');
    assert.equal(await page.evaluate(()=>testState.desk.items.some(item=>item.id===3)),false);
    await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    assert.equal(await rows.count(),2);assert.equal(await page.locator('.desk-task[data-task-id="2"] .desk-time').innerText(),'10:30\n45m');
    assert.equal(await page.evaluate(()=>JSON.stringify(testState.tasks)===JSON.stringify(originalTasks)),true);
    // Overlapping refreshes must not swallow a proposal-only change.
    await page.evaluate(async()=>{testState.delayListOnce=100;suggest();await new Promise(resolve=>setTimeout(resolve,20));testState.emit();});await page.locator('#desk-review').waitFor();
    await page.locator('.desk-task[data-task-id="1"] .desk-time').click();await page.locator('#desk-start').fill('09:45');
    await page.evaluate(()=>{suggest();testState.desk.proposal.agent='Codex';testState.emit();});await page.locator('#desk-proposal-label').filter({hasText:'Codex'}).waitFor();
    await page.locator('#desk-time-save').click();await page.locator('#desk-time-error').waitFor();assert.ok((await page.locator('#desk-time-error').innerText()).includes('changed'));assert.equal(await page.locator('#desk-start').inputValue(),'09:45');assert.equal(await page.evaluate(()=>testState.desk.proposal.items[0].start),'09:00');
    await page.locator('#desk-time-cancel').click();await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    await page.evaluate(()=>{suggest();testState.tasks.find(t=>t.id===1).done_at=Date.now()/1000;testState.emit();});await page.locator('#desk-error').waitFor();assert.equal(await page.locator('#desk-accept').isDisabled(),true);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    await page.evaluate(()=>{testState.tasks.find(t=>t.id===1).done_at=null;suggest();});await page.locator('#desk-review').waitFor();
    await page.locator('#desk-accept').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),5);
    assert.equal(await rows.first().locator('.check').isDisabled(),false);assert.equal(await page.locator('#desk-markers button').count(),5);
    assert.equal(await page.evaluate(()=>testState.tasks.every((t,i)=>t.due===originalTasks[i].due&&t.chat===originalTasks[i].chat)),true);
    // An accepted time change does not touch the due date, and a failed write remains editable.
    await page.locator('.desk-task[data-task-id="5"] .desk-time').click();await page.locator('#desk-start').fill('15:30');await page.locator('#desk-duration').fill('30');
    await page.evaluate(()=>{testState.failDesk=true;});await page.locator('#desk-time-save').click();await page.locator('#desk-time-error').waitFor();assert.equal(await page.locator('#desk-start').inputValue(),'15:30');
    await page.evaluate(()=>{testState.failDesk=false;});await page.locator('#desk-time-save').click();await page.locator('#desk-time-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#desk-markers [data-task-id="5"]').evaluate(el=>el.style.left),'81.25%');
    await page.locator('#add').click();await page.locator('#desk-picker-tasks [data-task-id="6"]').click();await page.locator('#desk-picker').waitFor({state:'hidden'});assert.equal(await rows.count(),6);
    // A pending plan can also be extended without changing accepted membership.
    await page.evaluate(()=>suggest());await page.locator('#desk-review').waitFor();await page.locator('#add').click();await page.locator('#desk-picker-tasks [data-task-id="6"]').click();await page.locator('#desk-picker').waitFor({state:'hidden'});await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),6);
    // Task completion is the ordinary list operation, including subtask progress.
    await page.locator('.desk-task[data-task-id="1"] > .line > .check').click();await page.locator('.desk-task[data-task-id="1"]').waitFor({state:'detached'});assert.equal(await rows.count(),5);
    await page.locator('#primary-nav button').filter({hasText:'Completed'}).click();assert.equal(await page.locator('#desk-head').isVisible(),false);assert.equal(await page.locator('.desk-time').count(),0);assert.equal(await page.locator('.task[data-task-id="1"]').count(),1);
    await page.locator('#primary-nav button').filter({hasText:'All'}).click();assert.equal(await page.locator('.desk-time').count(),0);
    // Work hours update the timeline without rescheduling tasks.
    const settings=await context.newPage();settings.on('pageerror',error=>errors.push(error.message));await settings.goto(url.replace('index.html','settings.html'));
    await settings.locator('#work-start').fill('17:00');await settings.locator('#work-end').fill('09:00');await settings.locator('#work-hours-save').click();assert.equal(await settings.locator('#work-hours-error').innerText(),'End time must be after start time.');
    await settings.locator('#work-start').fill('08:30');await settings.locator('#work-end').fill('16:30');await settings.locator('#work-hours-save').click();await settings.waitForFunction(()=>testState.desk.work_start==='08:30');await settings.close();
    await page.evaluate(()=>{testState.desk.work_start='08:30';testState.desk.work_end='16:30';testState.emit();});
    await page.locator('#primary-nav button').filter({hasText:'My Desk'}).click();assert.ok((await page.locator('#desk-hours').innerText()).includes('8:30'));assert.equal(await page.locator('.desk-task[data-task-id="5"] .desk-time').innerText(),'15:30\n30m');
    for(const width of [280,360,720,1024]){await page.setViewportSize({width,height:740});await page.waitForFunction(()=>{const main=document.getElementById('main');return main.scrollWidth<=main.clientWidth;});}
    await page.setViewportSize({width:1024,height:740});await page.evaluate(()=>{tinyThemes.setMode('dark');});await page.screenshot({path:'/tmp/tinytasks-desk-dark.png'});
    // A fresh read after midnight drops the day-specific state, but not underlying tasks.
    await page.evaluate(()=>{testState.tasks.forEach(t=>{t.mydesk=false;});testState.desk.items=[];testState.desk.proposal=null;testState.emit();});
    await page.locator('#empty').waitFor();assert.equal(await page.locator('#desk-markers button').count(),0);assert.equal(await page.evaluate(()=>testState.tasks.length),6);
    console.log('PASS: desk review, unchanged due dates/lists, compact gutter, timeline editing, retry, picker, completion, work hours, daily clearing, and narrow layouts.');
  } finally { await context.close(); }
};
