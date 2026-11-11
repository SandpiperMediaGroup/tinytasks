const assert = require('node:assert/strict');
module.exports = async (browser, installMock, url, errors) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 740 }, colorScheme: 'light', locale: 'en-GB', timezoneId: 'America/Los_Angeles' });
  await context.addInitScript(installMock);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  try {
    await page.clock.setFixedTime(new Date("2026-11-10T09:05:00-08:00"));
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
      let proposalNumber = 0;
      window.suggest = () => { testState.desk.proposal = {id:'proposal-'+(++proposalNumber),agent:'Dot',items:[
        {id:1,start:'09:00',duration:80},{id:2,start:'10:00',duration:45},{id:3,start:'11:15',duration:25},
        {id:4,start:'12:30',duration:null},{id:5,start:'15:00',duration:20}]};testState.emit(); };
      suggest();
    });
    await page.locator('#primary-nav .desk-review-badge').waitFor();
    await page.locator('#primary-nav button').filter({hasText:'My Desk'}).click();
    const rows = page.locator('#open > section > ul > .desk-task');
    assert.equal(await rows.count(),5);assert.equal(await page.locator('#desk-proposal-label').innerText(),'Dot’s suggestion');
    assert.equal(await page.locator('#desk-markers button').count(),5);assert.equal(await page.locator('#desk-markers [data-point="true"]').count(),1);
    const markers = page.locator('#desk-markers');
    const blocks = await markers.locator('button').evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect();
      return { id: Number(button.dataset.taskId), x: box.x, y: box.y };
    }));
    assert.ok(blocks.find(block => block.id === 2).y > blocks.find(block => block.id === 1).y);
    const leftEdge = (await page.locator('#desk-track').boundingBox()).x;
    assert.equal(blocks.find(block => block.id === 1).x, leftEdge, 'An ongoing task starts at Now');
    const lamp = await page.locator('.timeline-lamp').boundingBox();
    assert.ok(Math.abs(lamp.x + lamp.width / 2 - leftEdge) < 1, 'Lamp is centered on the current-time line');
    const current = await page.locator('#desk-now').boundingBox();
    const track = await page.locator('#desk-track').boundingBox();
    assert.ok(current.y >= track.y + track.height, 'Current time is below the line');
    assert.equal(await page.locator('.desk-range-end').count(), 0);
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('desk-now')).opacity === '0');
    await page.locator('#desk-hours').hover();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('desk-now')).opacity === '1');
    await page.screenshot({path:'/tmp/tinytasks-timeline-hover.png'});
    await page.mouse.move(0, 0);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('desk-now')).opacity === '0');
    assert.equal(await page.locator('.lamp-rays').count(), 0);
    assert.equal(await page.locator('#heading-icon').isVisible(), false);
    assert.equal(await page.locator('#group').isVisible(),false);assert.equal(await page.locator('.group-head').count(),0);
    assert.equal(await page.evaluate(()=>JSON.stringify(testState.tasks)===JSON.stringify(originalTasks)),true);
    assert.ok((await rows.evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height))).every(h=>h<72));
    assert.equal(await rows.first().locator('.check').isDisabled(),true);
    for (const width of [1024,760,320]) {
      await page.setViewportSize({width,height:740});
      const metrics = await page.locator('.desk-task[data-task-id="2"] > .line').evaluate(line => {
        const title = line.querySelector('.title-text').getBoundingClientRect();
        const timing = line.querySelector('.desk-time').getBoundingClientRect();
        const check = line.querySelector('.check').getBoundingClientRect();
        return {titleBottom:title.bottom, timingTop:timing.top, titleX:title.x, timingX:timing.x, checkX:check.x, contentX:line.getBoundingClientRect().x+parseFloat(getComputedStyle(line).paddingLeft)};
      });
      if (width === 1024) {
        assert.ok(metrics.timingTop < metrics.titleBottom, 'Timing shares the title line when there is room');
        assert.ok(metrics.timingX > metrics.titleX, 'Inline timing follows the title');
      } else {
        assert.ok(metrics.timingTop >= metrics.titleBottom, 'Timing wraps below the title in narrow layouts');
        assert.ok(Math.abs(metrics.titleX-metrics.timingX)<1, 'Wrapped timing aligns with the title');
      }
      assert.ok(Math.abs(metrics.checkX-metrics.contentX)<1, 'Checkbox keeps its usual left edge');
    }
    await page.setViewportSize({width:1024,height:740});
    assert.match(await page.locator('.desk-task[data-task-id="5"] .desk-time').textContent(),/3:00\s*pm, 20m/is);
    assert.match(await page.locator('#desk-now').innerText(), /9:05\s*am/i);
    assert.match(await page.locator('#desk-timeline').getAttribute('aria-label'), /9:05\s*am to 3:05\s*pm/i);
    page.setDefaultTimeout(10000);
    const task=id=>page.locator(`.desk-task[data-task-id="${id}"]`);
    const dialog=page.locator('#desk-time-dialog');
    const handle=part=>dialog.locator(`[data-arc-part="${part}"]`);
    const saved=()=>page.waitForFunction(()=>document.getElementById('desk-time-dialog').getAttribute('aria-busy')==='false');
    const adjust=async(part,key)=>{await handle(part).press(key);await saved();};
    const dismiss=async()=>{await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});};
    const editCount=()=>page.evaluate(()=>testState.calls.filter(c=>c.cmd==='edit_desk_time').length);
    const item=async(id,pending=false)=>page.evaluate(({id,pending})=>{
      const entry=(pending?testState.desk.proposal.items:testState.desk.items).find(i=>i.id===id);
      return entry && {start:entry.start,duration:entry.duration};
    },{id,pending});
    const turn=async(part,degrees,cancel=false,visible=true)=>{
      const dial=await dialog.locator('.desk-arc-area').boundingBox();
      const bounds=await handle(part).boundingBox();
      const cx=dial.x+dial.width/2,cy=dial.y+dial.height/2;
      const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
      const radius=Math.hypot(x-cx,y-cy),initial=Math.atan2(y-cy,x-cx);
      const before=await editCount();
      const beforeMarkers=await markers.innerHTML();
      await page.mouse.move(x,y);await page.mouse.down();
      await dialog.locator('.desk-arc-area[data-dragging="true"]').waitFor();
      for(let i=1;i<=12;i++){
        const angle=initial+degrees*Math.PI/180*i/12;
        await page.mouse.move(cx+radius*Math.cos(angle),cy+radius*Math.sin(angle));
      }
      assert.equal(await editCount(),before,'Dragging previews without writing');
      if (visible) assert.notEqual(await markers.innerHTML(),beforeMarkers,'The timeline previews the drag before release');
      if(cancel)await page.keyboard.press('Escape');
      await page.mouse.up();await saved();
      assert.equal(await editCount(),before+(cancel?0:1));
    };
    const openTime=async id=>{if(await task(id).locator('.desk-time').count())await task(id).locator('.desk-time').click();else{await task(id).locator(':scope > .line').click({button:'right'});const actions=await page.locator('#task-menu button:not([hidden])').evaluateAll(nodes=>nodes.map(n=>n.dataset.action));assert.equal(actions.indexOf('set-desk-time'),actions.indexOf('set-due')+1);await page.locator('[data-action="set-desk-time"]').click();}await page.locator('#desk-time-dialog').waitFor();};
    const drag=async(id,fraction,cancel=false)=>{
      const title=await task(id).locator(':scope > .line .title-text').boundingBox();
      await page.mouse.move(title.x+5,title.y+title.height/2);await page.mouse.down();await page.mouse.move(title.x+20,title.y+title.height/2,{steps:3});
      await page.locator('.task-drag-preview').waitFor();assert.equal(await page.locator('.drag-preview-title').innerText(),await task(id).locator(':scope > .line .title-text').innerText());assert.equal(await page.locator('.task-drag-preview').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
      await page.locator('#desk-timeline').waitFor();const track=await page.locator('.desk-track').boundingBox();
      await page.mouse.move(track.x+track.width*fraction,track.y+1,{steps:10});await page.locator('#desk-drop-preview').waitFor();
      const ghost=await page.locator('.task-drag-preview').boundingBox();assert.ok(ghost.x>=0&&ghost.x+ghost.width<=page.viewportSize().width);assert.ok(Math.abs(ghost.y-(track.y+17))<2);await page.screenshot({path:'/tmp/tinytasks-drag-preview.png'});
      if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));else if(cancel)await page.keyboard.press('Escape');await page.mouse.up();
      assert.equal(await page.locator('.task-drag-preview').count(),0);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('task-dragging')),false);
      if(!cancel){await page.locator('#desk-time-dialog').waitFor();assert.equal(await handle('end').evaluate(el=>el===document.activeElement),true);}
    };
    assert.equal(await page.locator('#desk-time-save,#desk-time-cancel').count(),0);
    await openTime(3);await adjust('move','ArrowRight');await dialog.getByRole('button', { name: 'Clear time', exact: true }).press('Enter');await saved();assert.deepEqual(await item(3,true),{start:null,duration:null});assert.equal(await page.evaluate(()=>testState.desk.items.some(i=>i.id===3)),false);
    await dismiss();await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),2);assert.deepEqual(await item(2),{start:'10:30',duration:45});assert.equal(await page.evaluate(()=>JSON.stringify(testState.tasks)===JSON.stringify(originalTasks)),true);
    // Explicit 12-hour formatting even in a locale that defaults to 24-hour time.
    await openTime(4);assert.match(await dialog.locator('.desk-arc-time-line').first().innerText(),/12:30\s*pm/i);await dismiss();
    // Concurrent refresh and stale editor protection.
    await page.evaluate(async()=>{testState.delayListOnce=100;suggest();await new Promise(r=>setTimeout(r,20));testState.emit();});await page.locator('#desk-review').waitFor();await openTime(1);
    await page.evaluate(()=>{suggest();testState.desk.proposal.agent='Codex';testState.emit();});await page.locator('#desk-proposal-label').filter({hasText:'Codex'}).waitFor();await adjust('move','ArrowRight');await page.locator('#desk-time-error').waitFor();assert.ok((await page.locator('#desk-time-error').innerText()).includes('changed'));assert.equal(await page.evaluate(()=>testState.desk.proposal.items[0].start),'09:00');
    await dismiss();await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    await page.evaluate(()=>{suggest();testState.tasks.find(t=>t.id===1).done_at=Date.now()/1000;testState.emit();});await page.locator('#desk-error').waitFor();assert.equal(await page.locator('#desk-accept').isDisabled(),true);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    await page.evaluate(()=>{testState.tasks.find(t=>t.id===1).done_at=null;suggest();});await page.locator('#desk-review').waitFor();await page.locator('#desk-accept').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),5);
    // Preview the complete arc and its endpoints; a write failure is retryable.
    await openTime(2);await turn('start',-7.5);assert.deepEqual(await item(2),{start:'09:45',duration:60});
    await turn('end',7.5);assert.deepEqual(await item(2),{start:'09:45',duration:75});
    await turn('move',-15);assert.deepEqual(await item(2),{start:'09:15',duration:75});
    await turn('move',15,true);assert.deepEqual(await item(2),{start:'09:15',duration:75});
    await page.screenshot({path:'/tmp/tinytasks-desk-arc-light.png'});
    await dismiss();
    await openTime(5);await page.evaluate(()=>{testState.failDesk=true;});await adjust('move','ArrowRight');
    await page.locator('#desk-time-error').waitFor();assert.deepEqual(await item(5),{start:'15:00',duration:20});
    await page.evaluate(()=>{testState.failDesk=false;});await dialog.locator('.desk-arc-retry').click();await saved();
    assert.deepEqual(await item(5),{start:'15:15',duration:20});
    // An off-grid end snaps to a clock quarter when dragged, keeping the start.
    await turn('end',7.5,false,false);
    assert.deepEqual(await item(5),{start:'15:15',duration:30});
    await adjust('start','Alt+ArrowLeft');
    assert.deepEqual(await item(5),{start:'15:14',duration:31});
    await adjust('move','ArrowRight');
    assert.deepEqual(await item(5),{start:'15:15',duration:31});
    await adjust('end','ArrowLeft');
    await adjust('start','ArrowRight');
    await adjust('start','Alt+ArrowRight');
    await adjust('start','ArrowRight');
    assert.deepEqual(await item(5),{start:'15:31',duration:14},'A blocked arrow key cannot move the time backward');
    await dismiss();
    // Inline tasks remain visible in a pending arrangement and survive its rejection.
    await page.locator('#add').click();await page.locator('#new-title').fill('Send the production notes');await page.locator('#new-title').press('Enter');await page.waitForFunction(()=>testState.tasks.length===7);await page.locator('#new-title').press('Escape');assert.equal(await rows.count(),6);
    await page.evaluate(()=>suggest());await page.locator('#desk-review').waitFor();await page.locator('#add').click();await page.locator('#new-title').fill('Confirm tomorrow’s session');await page.locator('#new-title').press('Enter');await page.waitForFunction(()=>testState.tasks.length===8);await page.locator('#new-title').press('Escape');assert.equal(await rows.count(),6);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});assert.equal(await rows.count(),7);
    await page.evaluate(()=>{testState.desk.items=[];testState.emit();});await page.locator('#desk-timeline').waitFor({state:'visible'});assert.equal(await page.locator('.desk-time').count(),0);assert.equal(await page.locator('.desk-section-heading').count(),0);
    // A first drag reveals the timeline; drops snap to quarter hours and ask duration.
    await drag(2,0.485);assert.equal(await page.evaluate(()=>testState.desk.items.find(i=>i.id===2).start),'12:00');await adjust('end','ArrowRight');await dismiss();assert.deepEqual(await item(2),{start:'12:00',duration:45});assert.deepEqual(await page.locator('.desk-section-heading').allTextContents(),['Midday','Unscheduled']);assert.match(await page.locator('#desk-now').innerText(),/9:05\s*am/i);
    const before=await page.evaluate(()=>JSON.stringify(testState.desk.items));await drag(4,0.7,true);assert.equal(await page.evaluate(()=>JSON.stringify(testState.desk.items)),before);await drag(4,0.7,'blur');assert.equal(await page.evaluate(()=>JSON.stringify(testState.desk.items)),before);
    await page.evaluate(()=>suggest());await page.locator('#desk-review').waitFor();await drag(3,0.695);await adjust('end','ArrowRight');assert.deepEqual(await item(3,true),{start:'13:15',duration:30});await dismiss();assert.equal(await page.evaluate(()=>testState.desk.items.some(i=>i.id===3&&i.start)),false);await page.locator('#desk-decline').click();await page.locator('#desk-review').waitFor({state:'hidden'});
    // One clear button removes timing but keeps desk membership.
    await openTime(2);
    const clear = dialog.getByRole('button', { name: 'Clear time', exact: true });
    assert.equal(await dialog.locator('.desk-arc-clear').count(), 1);
    const clearBox = await clear.boundingBox(), dialogBox = await dialog.boundingBox();
    assert.ok(clearBox.x - dialogBox.x < 16 && dialogBox.y + dialogBox.height - (clearBox.y + clearBox.height) < 16);
    await clear.click();await saved();
    assert.deepEqual(await item(2),{start:null,duration:null});
    await dismiss();
    await page.locator('#desk-timeline').waitFor({state:'visible'});assert.equal(await page.locator('.desk-time').count(),0);
    assert.equal(await task(2).count(),1);

    await page.evaluate(()=>{
      testState.desk.items=[
        {id:1,start:'11:45',duration:15},{id:2,start:'12:00',duration:null},
        {id:3,start:'14:00',duration:45},{id:4,start:'18:00',duration:30}
      ];testState.emit();
    });
    await page.locator('[data-desk-section="evening"] .desk-task').waitFor();
    const headings=()=>page.locator('.desk-section-heading').allTextContents();
    assert.deepEqual(await headings(),['Morning','Midday','Afternoon','Evening','Unscheduled']);
    for (const [id,part] of [[1,'morning'],[2,'midday'],[3,'afternoon'],[4,'evening'],[5,'unscheduled']]) {
      assert.equal(await task(id).evaluate(el=>el.closest('section').dataset.deskSection),part);
    }
    await openTime(1);await adjust('move','ArrowRight');await dismiss();
    assert.deepEqual(await headings(),['Midday','Afternoon','Evening','Unscheduled']);
    assert.equal(await markers.locator('[data-task-id="4"]').count(), 0);
    await page.setViewportSize({width:1280,height:740});
    await markers.locator('[data-task-id="4"]').waitFor();
    assert.match(await page.locator('#desk-timeline').getAttribute('aria-label'), /9:05\s*am to 9:05\s*pm/i);
    await page.locator('#sidebar-resizer').press('End');
    await markers.locator('[data-task-id="4"]').waitFor({state:'detached'});
    assert.match(await page.locator('#desk-timeline').getAttribute('aria-label'), /9:05\s*am to 3:05\s*pm/i);
    await page.locator('#sidebar-resizer').dblclick();

    const morningGradient = await page.locator('#main').evaluate(el => getComputedStyle(el).backgroundImage);
    await page.clock.setFixedTime(new Date("2026-11-10T16:30:00-08:00"));
    await page.evaluate(() => testState.emit());
    await markers.locator('[data-task-id="4"]').waitFor();
    assert.equal(await markers.locator('[data-task-id="1"]').count(), 0);
    assert.notEqual(await page.locator('#main').evaluate(el => getComputedStyle(el).backgroundImage), morningGradient);
    await page.setViewportSize({width:1024,height:740});
    await page.screenshot({path:'/tmp/tinytasks-desk-dayparts.png'});
    for(const width of [280,360,720,1024]){
      await page.setViewportSize({width,height:width===280?240:520});
      await page.waitForFunction(()=>{const m=document.getElementById('main');return m.scrollWidth<=m.clientWidth;});
      await openTime(3);
      const b=await dialog.boundingBox();
      assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=page.viewportSize().height);
      assert.equal(await dialog.evaluate(el=>el.scrollHeight<=el.clientHeight),true);
      await dismiss();
    }
    await page.setViewportSize({width:1024,height:740});await page.evaluate(()=>tinyThemes.setMode('dark'));
    await openTime(3);await page.screenshot({path:'/tmp/tinytasks-desk-arc-dark.png'});await dismiss();
    await task(1).locator(':scope > .line > .check').click();await task(1).waitFor({state:'detached'});await page.locator('#primary-nav button').filter({hasText:'Completed'}).click();assert.equal(await page.locator('.task[data-task-id="1"]').count(),1);assert.equal(await page.locator('#desk-head').isVisible(),false);
    await page.locator('#primary-nav button').filter({hasText:'All'}).click();assert.equal(await page.locator('.desk-time').count(),0);
    assert.equal(await page.locator('.lamp-rays').count(), 0);
    await page.locator('.sidebar-list[data-chat="Personal"] .nav-label').click();
    await page.locator('.list-completed .task[data-task-id="1"]').waitFor();
    await page.locator('.list-completed .task[data-task-id="1"] > .line > .check').click();
    await page.locator('.list-completed').waitFor({state:'detached'});
    assert.equal(await page.locator('.task[data-task-id="1"]').count(), 1);
    const settings=await context.newPage();
    settings.on('pageerror',e=>errors.push(e.message));
    await settings.goto(url.replace('index.html','settings.html'));
    assert.equal(await settings.locator('#work-start,#work-end').count(), 0);
    await settings.close();
    console.log('PASS: rotary start/end and move gestures, daypart groups, clearing, snapped drag/drop, cancellation, accepted/pending arrangements, stale editors, retry, inline creation, and narrow layouts.');
  } finally { await context.close(); }
};
