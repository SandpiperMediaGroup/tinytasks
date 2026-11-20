const assert = require('node:assert/strict');
const fs = require('node:fs');
module.exports = async (browser, installMock, url, errors) => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 760 }, colorScheme: 'dark' });
  await context.addInitScript(installMock);
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on('pageerror', e => errors.push(e.message));
  const row = id => page.locator(`.task[data-task-id="${id}"]`);
  const line = id => row(id).locator(':scope > .line');
  const open = async id => { await line(id).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(180); };
  try {
    await page.goto(url);
    await page.evaluate(() => {localStorage.clear();localStorage.setItem('sidebar','1');});await page.reload();await row(1).waitFor();
    await page.evaluate(() => {
      testState.tasks[0].details = 'Review [Scout preview](http://localhost:3000) and [Design notes](https://example.com/design).\n\nThen open https://example.org/brief.';
      testState.tasks[0].uid='uid-1';testState.tasks[1].details='Second task notes';testState.tasks[1].agent='codex';testState.tasks[1].chat='Studio';testState.emit();
    });
    await page.locator('#group').click();await page.locator('#group-field').click();await page.getByRole('menuitemradio',{name:'No grouping',exact:true}).click();
    await page.locator('#order-field').click();await page.getByRole('menuitemradio',{name:'No sorting',exact:true}).click();
    assert.equal(await page.locator('#order-direction').isVisible(),false);await page.keyboard.press('Escape');
    assert.deepEqual(await page.locator('#open .task').evaluateAll(rows=>rows.map(r=>Number(r.dataset.taskId))),[1,2]);
    const dragTask = async (from,to,after,cancel=false) => {
      const a=await line(from).boundingBox(), b=await line(to).boundingBox();
      await page.mouse.move(a.x+60,a.y+a.height/2);await page.mouse.down();
      await page.mouse.move(b.x+70,b.y+(after?b.height-4:4),{steps:12});
      await page.locator(after?'.task-drop-after':'.task-drop-before').waitFor();
      if(cancel) await page.keyboard.press('Escape');
      await page.mouse.up();
    };
    await dragTask(1,2,true);
    await page.waitForFunction(()=>testState.tasks[0].id===2);
    assert.deepEqual(await page.locator('#open > section > ul > .task').evaluateAll(rows=>rows.map(r=>Number(r.dataset.taskId))),[2,1]);
    await dragTask(1,2,false,true);
    assert.deepEqual(await page.evaluate(()=>testState.tasks.map(t=>t.id)),[2,1]);
    await page.evaluate(()=>testState.failSave=true);await dragTask(1,2,false);
    await page.locator('#notice').filter({hasText:'File unavailable'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>testState.tasks.map(t=>t.id)),[2,1]);
    await page.evaluate(()=>testState.failSave=false);await dragTask(1,2,false);
    await page.waitForFunction(()=>testState.tasks[0].id===1);
    assert.equal(await row(2).locator('.desk-membership').count(),1);assert.equal(await row(1).locator('.desk-membership').count(),0);
    await page.mouse.move(0,0);await page.locator('#view').focus();
    assert.equal(await row(2).locator('.desk-membership').evaluate(el=>getComputedStyle(el).opacity),'0');
    assert.deepEqual(await row(2).locator('.row-status').evaluate(el=>[...el.children].filter(n=>!n.classList.contains('prio')).map(n=>['desk-membership','details-indicator','subtask-count','time','more'].find(c=>n.classList.contains(c)))),['desk-membership','details-indicator','subtask-count','time','more']);
    const timeX=await row(2).locator('.time').evaluate(el=>el.getBoundingClientRect().x);
    const idleBounds=await line(2).boundingBox();await line(2).hover();
    assert.equal(await row(2).locator('.desk-membership').evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.deepEqual(await line(2).boundingBox(),idleBounds);
    assert.equal(await row(2).locator('.time').evaluate(el=>el.getBoundingClientRect().x),timeX);
    for (const width of [280, 360, 460]) {
      await page.setViewportSize({width, height:760});
      await line(2).hover();
      const layout = await line(2).evaluate(el => {
        const box = selector => el.querySelector(selector).getBoundingClientRect();
        const controls = [...el.querySelector('.row-status').children].filter(n => getComputedStyle(n).display !== 'none');
        return {checkTop:box('.check').top,titleTop:box('.title').top,textBottom:box('.title').bottom,sourceTop:box('.sub').top,sourceBottom:box('.sub').bottom,
          textRight:box('.title').right,right:el.getBoundingClientRect().right-parseFloat(getComputedStyle(el).paddingRight),
          controlsTop:box('.row-status').top,controlsBottom:box('.row-status').bottom,controlsRight:box('.row-status').right,
          controls:controls.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,right:b.right,y:b.y+b.height/2};})};
      });
      assert.ok(Math.abs(layout.checkTop-layout.titleTop)<=1, `Checkbox aligned with title at ${width}px`);
      assert.ok(Math.abs(layout.textRight-layout.right)<=1, `Title uses full row width at ${width}px`);
      assert.ok(layout.controlsTop>=layout.textBottom && layout.controlsRight<=layout.right+1, `Controls stay below text at ${width}px`);
      assert.ok(layout.sourceTop<layout.controlsBottom && layout.sourceBottom>layout.controlsTop, `Source and controls share the second line at ${width}px`);
      layout.controls.slice(1).forEach((control,i)=>{
        assert.ok(Math.abs(control.y-layout.controls[0].y)<=1, `Controls share one line at ${width}px`);
        assert.ok(control.x>=layout.controls[i].right, `Controls retain visual order at ${width}px`);
      });
    }
    await page.setViewportSize({width:1000,height:760});
    await open(1);assert.equal(await row(1).locator('.link-chip').count(),3);
    assert.equal(await row(1).locator('.body > p').count(),2);
    assert.equal(await row(1).locator('.body > p').nth(1).evaluate(el=>getComputedStyle(el).marginTop),'12px');
    assert.equal(await row(1).locator(':scope > .details > .details-inner > .details-pad').evaluate(el=>getComputedStyle(el).paddingTop),'6px');
    const detailGap=await row(1).evaluate(el=>el.querySelector('.body').getBoundingClientRect().top-el.querySelector(':scope > .line .text').getBoundingClientRect().bottom);
    assert.ok(Math.abs(detailGap-16)<=1, `Combined title/details spacing: ${detailGap}`);
    const chip=row(1).getByRole('button',{name:'Open Scout preview',exact:true});await page.mouse.move(0,0);await chip.hover();
    await page.waitForTimeout(200);assert.equal(await page.locator('#link-chip-tooltip').count(),0);
    await page.locator('#link-chip-tooltip').waitFor();assert.equal(await page.locator('#link-chip-tooltip').textContent(),'http://localhost:3000');
    await chip.click();assert.equal(await page.evaluate(()=>testState.calls.filter(c=>c.cmd==='open_detail_link').at(-1).args.url),'http://localhost:3000');
    assert.equal(await line(1).getAttribute('aria-expanded'),'true');assert.equal(await row(1).locator('.more').getAttribute('title'),null);
    for(let i=0;i<20;i++){await open(i%2?1:2);assert.equal(await page.locator('#open > section > ul > .task.open').count(),1);}
    await page.evaluate(() => {
      testState.questions=[{store_uuid:'fixture-store',question_id:'q1',task_id:1,task_available:true,family:{task_id_at_creation:1,source:{client_id:'test',title:'Plan review'}},revision:{revision_id:'r1',prompt:'Which direction should we use?',mode:'single',options:[{id:'a',label:'Keep it simple',description:'Use the existing layout'},{id:'b',label:'Try the new layout'}],default_option_ids:['a'],recommended_option_id:'a',allow_custom:true,disposition:'pending'},response:null,receipt:null}];testState.emit();
    });
    await row(1).locator('.question-card').waitFor();assert.equal(await row(1).getByRole('radio',{name:/Keep it simple/}).isChecked(),true);
    assert.equal(await page.evaluate(()=>testState.calls.filter(c=>c.cmd==='submit_question_response').length),0);
    await row(1).getByRole('radio',{name:'Try the new layout'}).check();await open(2);await open(1);
    assert.equal(await row(1).getByRole('radio',{name:'Try the new layout'}).isChecked(),true);
    await page.evaluate(()=>testState.failQuestion=true);await row(1).getByRole('button',{name:'Send answer'}).click();
    await row(1).locator('.question-error').waitFor();assert.equal(await row(1).getByRole('radio',{name:'Try the new layout'}).isChecked(),true);
    await page.evaluate(()=>testState.failQuestion=false);await row(1).getByRole('button',{name:'Send answer'}).click();
    await row(1).getByText('Saved',{exact:true}).waitFor();
    assert.equal(await row(1).locator('.question-source').count(),0);
    assert.equal(await row(1).locator('.question-answer').textContent(),'Try the new layout (your answer)');
    assert.equal(await row(1).locator('.question-card').evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
    const sends=await page.evaluate(()=>testState.calls.filter(c=>c.cmd==='submit_question_response'));
    assert.equal(sends[0].args.submissionId,sends[1].args.submissionId);assert.deepEqual(sends[1].args.answer,{kind:'choices',option_ids:['b']});
    for(const width of [1200,360,280,900,320,1200,360]){
      await page.setViewportSize({width,height:760});
      assert.equal(await page.evaluate(()=>document.querySelector('#main').scrollWidth<=document.querySelector('#main').clientWidth),true);
      const fit=await row(1).evaluate(el=>{
        const details=el.querySelector(':scope > .details'), content=details.querySelector('.details-pad');
        return {outer:details.getBoundingClientRect().bottom,content:content.getBoundingClientRect().bottom,question:content.querySelector('.question-card').getBoundingClientRect().bottom,next:el.nextElementSibling?.getBoundingClientRect().top};
      });
      assert.ok(fit.content<=fit.outer+1 && fit.question<=fit.outer+1 && fit.next>=fit.outer-1,`Unclipped details at ${width}px: ${JSON.stringify(fit)}`);
      const details=await row(1).locator('.body').evaluate(el=>({line:parseFloat(getComputedStyle(el).lineHeight),font:parseFloat(getComputedStyle(el).fontSize)}));assert.ok(details.line/details.font>=1.55);
    }
    await page.setViewportSize({width:1000,height:760});
    const mainTopBeforeCleanup = await page.locator('#main').evaluate(el=>el.getBoundingClientRect().top);
    await page.locator('#lists-menu').click();
    assert.deepEqual(await page.locator('#sidebar-menu button:visible').allTextContents(),['New list…','Archive empty lists']);
    assert.equal(await page.locator('#sidebar-menu .menu-sep:visible').count(),0);
    await page.locator('[data-list-action="cleanup"]:enabled').click();
    await page.waitForFunction(()=>!testState.chats.includes('Later'));
    assert.equal(await page.locator('#notice').isVisible(), false);
    assert.equal(await page.locator('#main').evaluate(el=>el.getBoundingClientRect().top), mainTopBeforeCleanup);
    assert.equal(await page.evaluate(()=>testState.tasks.length),2);
    await page.evaluate(()=>{testState.desk.planning={status:'building',run_id:'run'};testState.emit();});
    await page.locator('#primary-nav .desk-review-badge').filter({hasText:'Building'}).waitFor();
    await page.locator('#primary-nav button').filter({hasText:'My Desk'}).click();await page.getByText('Building your day…',{exact:true}).waitFor();
    assert.equal(await page.locator('#open .desk-membership').count(),0);
    assert.equal(await page.locator('#desk-guide-invite, #desk-help').count(),0);
    await page.locator('#view').click();await page.locator('#basics-open').click();
    assert.equal(await page.evaluate(()=>testState.calls.some(c=>c.cmd==='open_basics')),true);
    const basics=await context.newPage();await basics.goto(new URL('basics.html',url).href);
    assert.deepEqual(await basics.locator('h2').allTextContents(),['My Desk is for today','Ask your agent','Lists keep related work together','Inside a task row']);
    await basics.getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(await basics.evaluate(()=>testState.calls.some(c=>c.cmd==='close_basics')),true);
    assert.equal(await basics.evaluate(()=>testState.calls.some(c=>['edit_task','edit_desk_time','review_desk'].includes(c.cmd))),false);await basics.close();
    fs.mkdirSync('artifacts/usability',{recursive:true});await page.screenshot({path:'artifacts/usability/my-desk.png'});
    await page.locator('#primary-nav button').filter({hasText:/^All/}).click();await open(1);
    await page.screenshot({path:'artifacts/usability/details-links-question.png'});
    console.log('PASS: usability, single branch, no sorting, link chips/delayed tooltips, questions/drafts/retry, cleanup, desk lamps/status and guide.');
  } finally {await context.close();}
};
