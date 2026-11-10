const assert = require('node:assert/strict');
module.exports = async (browser, installMock, url, errors) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 740 }, colorScheme: 'light', locale: 'en-GB' });
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
    for(const width of [1024,850,760]) {
      await page.setViewportSize({width,height:740});
      const offsets=await page.locator('.desk-task[data-task-id="2"] > .line').evaluate(line=>{
        const r=line.getBoundingClientRect(),middle=r.top+r.height/2;
        return ['.src','.chat','.agent-badge','.due','.due svg','.due > span','.subtask-count','.prio','.more'].flatMap(selector=>[...line.querySelectorAll(selector)].filter(el=>el.getClientRects().length).map(el=>{const b=el.getBoundingClientRect(),s=getComputedStyle(el);return{selector,offset:b.top+b.height/2-middle,font:s.fontSize,lineHeight:s.lineHeight};}));
      });
      for (const item of offsets) assert.ok(Math.abs(item.offset) < 0.5, `${width}px ${item.selector} is off center by ${item.offset}px`);
      for (const item of offsets.filter(item => ['.chat','.due > span','.subtask-count','.prio'].includes(item.selector))) { assert.equal(item.font,'12px'); assert.equal(item.lineHeight,'16px'); }
    }
    await page.setViewportSize({width:1024,height:740});
    assert.equal(await page.locator('.desk-task[data-task-id="5"] .desk-time').innerText(),'3:00\n20m');
    assert.match(await page.locator('#desk-now-pill').innerText(),/\b(?:am|pm)\b/i);
    page.setDefaultTimeout(10000);
    const task=id=>page.locator(`.desk-task[data-task-id="${id}"]`);
    const saved=()=>page.waitForFunction(()=>!document.getElementById('desk-start').readOnly);
    const dismiss=async()=>{await page.keyboard.press('Escape');if(await page.locator('#desk-time-dialog').isVisible())await page.keyboard.press('Escape');await page.locator('#desk-time-dialog').waitFor({state:'hidden'});};
    const pick=async(field,value)=>{const list=field==='desk-start'?'desk-time-options':'desk-duration-options';if(!await page.locator(`#${list}`).isVisible())await page.locator(`#${field}-toggle`).click();await page.locator(`#${list} [data-value="${value}"]`).click();await saved();};
    const openTime=async id=>{if(await task(id).locator('.desk-time').count())await task(id).locator('.desk-time').click();else{await task(id).locator(':scope > .line').click({button:'right'});const actions=await page.locator('#task-menu button:not([hidden])').evaluateAll(nodes=>nodes.map(n=>n.dataset.action));assert.equal(actions.indexOf('set-desk-time'),actions.indexOf('set-due')+1);await page.locator('[data-action="set-desk-time"]').click();}await page.locator('#desk-time-dialog').waitFor();};
    const drag=async(id,fraction,cancel=false)=>{
      const title=await task(id).locator(':scope > .line .title-text').boundingBox();
      await page.mouse.move(title.x+5,title.y+title.height/2);await page.mouse.down();await page.mouse.move(title.x+20,title.y+title.height/2,{steps:3});
      await page.locator('#desk-timeline').waitFor();const track=await page.locator('.desk-track').boundingBox();
      await page.mouse.move(track.x+track.width*fraction,track.y+1,{steps:10});await page.locator('#desk-drop-preview').waitFor();
      if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
      if(!cancel){await page.locator('#desk-time-dialog').waitFor();await page.locator('#desk-duration-options').waitFor();}
    };
    assert.equal(await page.locator('#desk-time-save,#desk-time-cancel').count(),0);
    await openTime(3);await pick('desk-start','11:30');await pick('desk-duration','');assert.equal(await task(3).locator('.desk-time').innerText(),'11:30');assert.equal(await page.evaluate(()=>testState.desk.items.some(i=>i.id===3)),false);
    await dismiss();await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),2);assert.equal(await task(2).locator('.desk-time').innerText(),'10:30\n45m');assert.equal(await page.evaluate(()=>JSON.stringify(testState.tasks)===JSON.stringify(originalTasks)),true);
    // Explicit 12-hour formatting even in a locale that defaults to 24-hour time.
    await openTime(4);assert.match(await page.locator('#desk-start').inputValue(),/12:30\s*pm/i);await dismiss();
    // Concurrent refresh and stale editor protection.
    await page.evaluate(async()=>{testState.delayListOnce=100;suggest();await new Promise(r=>setTimeout(r,20));testState.emit();});await page.locator('#desk-review').waitFor();await openTime(1);
    await page.evaluate(()=>{suggest();testState.desk.proposal.agent='Codex';testState.emit();});await page.locator('#desk-proposal-label').filter({hasText:'Codex'}).waitFor();await pick('desk-start','09:45');await page.locator('#desk-time-error').waitFor();assert.ok((await page.locator('#desk-time-error').innerText()).includes('changed'));assert.equal(await page.evaluate(()=>testState.desk.proposal.items[0].start),'09:00');
    await dismiss();await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    await page.evaluate(()=>{suggest();testState.tasks.find(t=>t.id===1).done_at=Date.now()/1000;testState.emit();});await page.locator('#desk-error').waitFor();assert.equal(await page.locator('#desk-accept').isDisabled(),true);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    await page.evaluate(()=>{testState.tasks.find(t=>t.id===1).done_at=null;suggest();});await page.locator('#desk-review').waitFor();await page.locator('#desk-accept').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),5);
    // Immediate selection failures retain editable values for retry.
    await openTime(5);await page.evaluate(()=>{testState.failDesk=true;});await pick('desk-start','15:30');await page.locator('#desk-time-error').waitFor();assert.equal(await task(5).locator('.desk-time').innerText(),'3:00\n20m');await page.evaluate(()=>{testState.failDesk=false;});await page.locator('#desk-start').press('Enter');await saved();await pick('desk-duration','30');await dismiss();assert.equal(await task(5).locator('.desk-time').innerText(),'3:30\n30m');
    // Inline tasks remain visible in a pending arrangement and survive its rejection.
    await page.locator('#add').click();await page.locator('#new-title').fill('Send the production notes');await page.locator('#new-title').press('Enter');await page.waitForFunction(()=>testState.tasks.length===7);await page.locator('#new-title').press('Escape');assert.equal(await rows.count(),6);
    await page.evaluate(()=>suggest());await page.locator('#desk-review').waitFor();await page.locator('#add').click();await page.locator('#new-title').fill('Confirm tomorrow’s session');await page.locator('#new-title').press('Enter');await page.waitForFunction(()=>testState.tasks.length===8);await page.locator('#new-title').press('Escape');assert.equal(await rows.count(),6);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),7);
    await page.evaluate(()=>{testState.desk.items=[];testState.emit();});await page.locator('#desk-timeline').waitFor({state:'hidden'});assert.equal(await page.locator('.desk-time').count(),0);assert.equal(await page.locator('.desk-section-heading').count(),0);
    // A first drag reveals the timeline; drops snap to quarter hours and ask duration.
    await drag(2,0.373);assert.equal(await page.evaluate(()=>testState.desk.items.find(i=>i.id===2).start),'12:00');await pick('desk-duration','45');await dismiss();assert.equal(await task(2).locator('.desk-time').innerText(),'12:00\n45m');assert.equal(await page.locator('.desk-section-heading').innerText(),'Unscheduled');assert.match(await page.locator('#desk-now-pill').innerText(),/\d.*:/);
    const before=await page.evaluate(()=>JSON.stringify(testState.desk.items));await drag(4,0.7,true);assert.equal(await page.evaluate(()=>JSON.stringify(testState.desk.items)),before);
    await page.evaluate(()=>suggest());await page.locator('#desk-review').waitFor();await drag(3,0.52);await pick('desk-duration','30');assert.deepEqual(await page.evaluate(()=>{const item=testState.desk.proposal.items.find(i=>i.id===3);return{start:item.start,duration:item.duration};}),{start:'13:15',duration:30});await dismiss();assert.equal(await page.evaluate(()=>testState.desk.items.some(i=>i.id===3&&i.start)),false);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    // Typed custom values apply on Enter; x clears one field immediately.
    await openTime(2);await page.locator('#desk-start').fill('930');await page.locator('#desk-start').press('Enter');await saved();await page.locator('#desk-duration').fill('1h 15m');await page.locator('#desk-duration').press('Enter');await saved();assert.equal(await task(2).locator('.desk-time').innerText(),'9:30\n75m');await page.locator('#desk-duration-clear').click();await saved();assert.equal(await task(2).locator('.desk-time').innerText(),'9:30');
    await page.screenshot({path:'/tmp/tinytasks-desk-compact-picker.png'});
    await page.locator('#desk-start').fill('25:99');await page.locator('#desk-start').press('Enter');await page.locator('#desk-time-error').waitFor();assert.ok((await page.locator('#desk-time-error').innerText()).includes('Enter a time'));await dismiss();
    await page.screenshot({path:'/tmp/tinytasks-desk-drag-schedule.png'});
    for(const width of [280,360,720,1024]){await page.setViewportSize({width,height:520});await page.waitForFunction(()=>{const m=document.getElementById('main');return m.scrollWidth<=m.clientWidth;});}
    await page.setViewportSize({width:1024,height:740});await page.evaluate(()=>tinyThemes.setMode('dark'));await page.screenshot({path:'/tmp/tinytasks-desk-dark.png'});
    await openTime(2);await page.locator('#desk-start-clear').click();await saved();await dismiss();await page.locator('#desk-timeline').waitFor({state:'hidden'});assert.equal(await page.locator('.desk-time').count(),0);
    await task(1).locator(':scope > .line > .check').click();await task(1).waitFor({state:'detached'});await page.locator('#primary-nav button').filter({hasText:'Completed'}).click();assert.equal(await page.locator('.task[data-task-id="1"]').count(),1);assert.equal(await page.locator('#desk-head').isVisible(),false);
    await page.locator('#primary-nav button').filter({hasText:'All'}).click();assert.equal(await page.locator('.desk-time').count(),0);
    const settings=await context.newPage();settings.on('pageerror',e=>errors.push(e.message));await settings.goto(url.replace('index.html','settings.html'));await settings.locator('#work-start').fill('17:00');await settings.locator('#work-end').fill('09:00');await settings.locator('#work-hours-save').click();assert.equal(await settings.locator('#work-hours-error').innerText(),'End time must be after start time.');await settings.locator('#work-start').fill('08:30');await settings.locator('#work-end').fill('16:30');await settings.locator('#work-hours-save').click();await settings.waitForFunction(()=>testState.desk.work_start==='08:30');await settings.close();
    console.log('PASS: compact immediate time picker, clearing, snapped drag/drop with duration prompt, cancellation, accepted/pending arrangements, stale editors, retry, inline creation, and narrow layouts.');
  } finally { await context.close(); }
};
