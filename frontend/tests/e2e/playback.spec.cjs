const {test,expect}=require('@playwright/test');
async function seek(page,time){await page.getByRole('slider',{name:'Playback time'}).evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},time);await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow',String(time));}
async function ready(page,url='/playback-demo'){await page.goto(url);await page.locator('.playback-station').first().waitFor();await page.waitForTimeout(350);}
for(const viewport of [{width:1440,height:800},{width:1024,height:768},{width:390,height:844}]){
 test.describe(`${viewport.width}x${viewport.height}`,()=>{
  test.use({viewport});
  for(const state of ['initial','mid-run','followed','event-log','finished','empty','reduced-motion']){
   test(`${state} visual`,async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(state==='reduced-motion')await page.emulateMedia({reducedMotion:'reduce'});
    if(state==='empty'){await page.goto('/playback-demo?state=empty');await expect(page.getByRole('button',{name:'Open model builder'})).toBeVisible();}
    else {await ready(page);if(!['initial'].includes(state))await seek(page,state==='finished'?24:7.1);
     if(state==='followed'){await page.getByRole('button',{name:/Inspect entity-/}).first().click({force:true});await expect(page.getByRole('complementary',{name:'Entity details'})).toBeVisible();}
     if(state==='event-log')await page.getByRole('button',{name:'Event log',exact:true}).click();
     if(state==='reduced-motion'){await expect(page.getByRole('button',{name:'Motion off'})).toBeVisible();await expect(page.locator('[data-pose="walking"]')).toHaveCount(0);}
    }
    expect(errors).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBeTruthy();
    await expect(page).toHaveScreenshot(`${state}-${viewport.width}.png`,{animations:'disabled'});
   });
  }
 });
}

test('desktop fit, effective typography, legend bounds and full-run pixel stability',async({page})=>{
 await page.setViewportSize({width:1440,height:800});await ready(page);
 const layout=await page.evaluate(()=>{const canvas=document.querySelector('.playback-graph').getBoundingClientRect();const nodes=[...document.querySelectorAll('.playback-station')].map(n=>n.getBoundingClientRect());const zoom=parseFloat(document.querySelector('[aria-label="Zoom level"]').textContent)/100;return {fill:(Math.max(...nodes.map(n=>n.right))-Math.min(...nodes.map(n=>n.left)))/canvas.width,inBounds:nodes.every(n=>n.left>=canvas.left&&n.right<=canvas.right&&n.top>=canvas.top&&n.bottom<=canvas.bottom),title:Math.min(...[...document.querySelectorAll('.station-name')].map(e=>parseFloat(getComputedStyle(e).fontSize)*zoom)),stats:Math.min(...[...document.querySelectorAll('.station-metrics')].map(e=>parseFloat(getComputedStyle(e).fontSize)*zoom)),legend:document.querySelector('.playback-legend').getBoundingClientRect().bottom};});
 expect(layout.inBounds).toBeTruthy();expect(layout.fill).toBeGreaterThanOrEqual(.65);expect(layout.fill).toBeLessThanOrEqual(.95);expect(layout.title).toBeGreaterThanOrEqual(11.9);expect(layout.stats).toBeGreaterThanOrEqual(9.9);expect(layout.legend).toBeLessThanOrEqual(800);
 const edges=[];for(let time=0;time<=24;time+=.5){await seek(page,time);edges.push(await page.locator('.timeline-track').evaluate(e=>e.getBoundingClientRect().right));}expect(Math.max(...edges)-Math.min(...edges)).toBe(0);
 await page.getByRole('button',{name:'Reset',exact:true}).click();await page.getByRole('combobox',{name:'Playback speed'}).selectOption('8');await page.getByRole('button',{name:'Play',exact:true}).click();const played=await page.evaluate(()=>new Promise((resolve,reject)=>{const rights=[],start=performance.now();const tick=()=>{rights.push(document.querySelector('.timeline-track').getBoundingClientRect().right);if(document.querySelector('.playback-buttons button').textContent==='Replay')resolve(Math.max(...rights)-Math.min(...rights));else if(performance.now()-start>8000)reject(new Error('Playback did not finish'));else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));expect(played).toBe(0);

});
test('keyboard toggle, exact event steps, shortcuts, input guard and replay',async({page})=>{
 await ready(page);const section=page.getByRole('region',{name:'Simulation playback',exact:true});await section.focus();await page.keyboard.press('ArrowRight');await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext',/event 1 of 155/);await page.keyboard.press('ArrowLeft');await expect(page.getByRole('slider')).toHaveAttribute('aria-valuetext',/event 0 of 155/);
 await page.keyboard.press('Shift+ArrowRight');await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow',String(1/6));await page.keyboard.press('End');await expect(page.getByRole('button',{name:'Replay',exact:true})).toBeVisible();await page.keyboard.press('r');await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow','0');
 await page.keyboard.press('Space');await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();await page.keyboard.press('Space');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await seek(page,6);await page.getByRole('slider').focus();await page.keyboard.press('r');await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow','6');
});
test('event log filters and seek, selection route and follow clear',async({page})=>{
 await ready(page);await seek(page,7.1);await page.getByRole('button',{name:/Inspect entity-/}).first().click({force:true});await page.getByRole('button',{name:'Follow camera'}).click();await expect(page.getByRole('button',{name:'Stop following'})).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await expect(page.getByRole('complementary',{name:'Entity details'})).toHaveCount(0);
 await page.getByRole('button',{name:'Event log',exact:true}).click();const log=page.getByRole('complementary',{name:'Event log'});await log.getByRole('combobox',{name:'Event type',exact:true}).selectOption('entity_completed');await expect(log.locator('.event-log-row').first()).toContainText('entity completed');await log.locator('.event-log-row').first().click();await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
});
test('pointer scrubbing resumes intent, manual zoom is respected, motion toggle and responsive resize',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Play',exact:true}).click();const box=await page.getByRole('slider').boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.4,box.y+box.height/2);await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await page.mouse.up();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pause',exact:true}).click();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();await page.waitForTimeout(300);const zoom=await page.getByLabel('Zoom level').textContent();await page.setViewportSize({width:1024,height:768});await page.waitForTimeout(300);expect(await page.getByLabel('Zoom level').textContent()).toBe(zoom);await page.getByRole('button',{name:'Fit view',exact:true}).click();
 await page.getByRole('button',{name:'Motion on'}).click();await expect(page.getByRole('button',{name:'Motion off'})).toBeVisible();await seek(page,7.1);await expect(page.locator('[data-pose="walking"]')).toHaveCount(0);
});
test('loading, failure/retry, stale and zero-event states',async({page})=>{
 await page.goto('/playback-demo?state=loading');await expect(page.getByRole('status')).toHaveText('Loading playback…');await page.goto('/playback-demo?state=error');await page.getByRole('button',{name:'Retry'}).click();await expect(page.getByRole('slider')).toBeVisible();await ready(page,'/playback-demo?state=stale');await expect(page.getByRole('status',{name:'Run status'})).toContainText('newer changes');await ready(page,'/playback-demo?state=zero');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeDisabled();
});
test('axe has no serious or critical playback violations',async({page})=>{
 await ready(page);await seek(page,7.1);await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const result=await page.evaluate(async()=>{const r=await window.axe.run(document.querySelector('.astra-playback'));return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));});expect(result).toEqual([]);
});
test('touch pan and pinch preserve graph attachment',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();await ready(page);const cdp=await context.newCDPSession(page);const pane=await page.locator('.react-flow__pane').boundingBox();const x=pane.x+pane.width/2,y=pane.y+pane.height/2;
 const before=await page.locator('.react-flow__viewport').getAttribute('style');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+45,y:y+30}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);expect(await page.locator('.react-flow__viewport').getAttribute('style')).not.toBe(before);
 const zoom=await page.getByLabel('Zoom level').textContent();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-35,y},{x:x+35,y}]});for(let d=40;d<=75;d+=5)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y},{x:x+d,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(100);expect(await page.getByLabel('Zoom level').textContent()).not.toBe(zoom);await context.close();
});
test('hidden-tab lifecycle pauses and resumes with no simulation-time jump',async({page})=>{
 await ready(page);await page.getByRole('button',{name:'Play',exact:true}).click();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();const time=await page.getByRole('slider').getAttribute('aria-valuenow');await page.waitForTimeout(400);expect(await page.getByRole('slider').getAttribute('aria-valuenow')).toBe(time);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();await page.getByRole('button',{name:'Pause',exact:true}).click();expect(Number(await page.getByRole('slider').getAttribute('aria-valuenow'))-Number(time)).toBeLessThan(.2);
});

test('real transfers move while playing and freeze when paused, at normal detail zoom',async({page})=>{
 await ready(page);await seek(page,7.1);const person=page.locator('.playback-person[data-state="walking"]').first();await expect(person).toBeVisible();const paused=await person.getAttribute('style');await page.waitForTimeout(200);expect(await person.getAttribute('style')).toBe(paused);await page.getByRole('button',{name:'Play',exact:true}).click();await page.waitForTimeout(150);expect(await person.getAttribute('style')).not.toBe(paused);await page.getByRole('button',{name:'Pause',exact:true}).click();const frozen=await person.getAttribute('style');await page.waitForTimeout(150);expect(await person.getAttribute('style')).toBe(frozen);
});
