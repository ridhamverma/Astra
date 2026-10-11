const {test,expect}=require('@playwright/test');
async function seek(page,time){await page.getByRole('slider',{name:'Playback time'}).evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},time);await expect(page.getByRole('slider')).toHaveAttribute('aria-valuenow',String(time));}
async function ready(page,url='/playback-demo'){await page.goto(url);await page.locator('.playback-station').first().waitFor();await page.waitForTimeout(350);}
// Trace DOM snapshots record every articulated limb mutation and distort frame-rate measurements.
test.use({trace:'off'});
 test('80 people and a long real run: benchmark browser frame rate and seek response',async({page},testInfo)=>{
 await ready(page,'/playback-demo?scenario=stress');await seek(page,2.1);expect(await page.locator('.playback-person').count()).toBe(80);
 const baseline=await page.evaluate(()=>new Promise(resolve=>{let count=0;const start=performance.now();const tick=now=>{count++;if(now-start<1000)requestAnimationFrame(tick);else resolve(count*1000/(now-start));};requestAnimationFrame(tick);}));

 await page.getByRole('button',{name:'Play',exact:true}).click();const frames=await page.evaluate(()=>new Promise(resolve=>{const gaps=[];let last=performance.now(),start=last;const tick=now=>{gaps.push(now-last);last=now;if(now-start<2500)requestAnimationFrame(tick);else resolve({fps:1000/(gaps.reduce((a,b)=>a+b,0)/gaps.length),p95:gaps.sort((a,b)=>a-b)[Math.floor(gaps.length*.95)]});};requestAnimationFrame(tick);}));await page.getByRole('button',{name:'Pause',exact:true}).click();console.log(JSON.stringify({baseline,...frames}));await testInfo.attach('browser-performance',{body:JSON.stringify(frames,null,2),contentType:'application/json'});expect(frames.fps).toBeGreaterThan(50);
});


test('long-run UI seek commits in under 50 ms in either direction',async({page},testInfo)=>{
 await ready(page,'/playback-demo?scenario=stress');const times=await page.evaluate(async()=>{const input=document.querySelector('[aria-label="Playback time"]'),setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const samples=[];for(const time of [20,1,15,3,25,7,0,30]){const start=performance.now();await new Promise(resolve=>{const observer=new MutationObserver(()=>{if(Number(input.getAttribute('aria-valuenow'))===time){observer.disconnect();resolve();}});observer.observe(input,{attributes:true,attributeFilter:['aria-valuenow']});setter.call(input,String(time));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));});samples.push(performance.now()-start);await new Promise(resolve=>requestAnimationFrame(resolve));}return samples;});await testInfo.attach('ui-seek-latency',{body:JSON.stringify(times),contentType:'application/json'});console.log('UI seek ms:',JSON.stringify(times));expect(Math.max(...times)).toBeLessThan(50);
});
