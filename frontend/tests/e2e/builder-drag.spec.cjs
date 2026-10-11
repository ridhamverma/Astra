const {test,expect}=require('@playwright/test');
const fixture=require('../../dev/clinic-playback.json');
async function setup(page,{empty=false}={}){
 let saved;const model=structuredClone(fixture.model);if(empty){model.nodes=[];model.edges=[];}
 await page.route('**/api/v1/**',async route=>{
  const r=route.request();let body=[];
  if(r.url().endsWith('/auth/me'))body={user:{id:'drag-qa',email:'qa@example.test',display_name:'QA'},csrf_token:'qa'};
  else if(r.url().endsWith('/projects/drag-qa')){if(r.method()==='PUT')saved=r.postDataJSON().model;body={id:'drag-qa',name:model.name,latest_version:saved?2:1,model:saved??model};}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/simulator?project=drag-qa');await expect(page.locator('.astra-node')).toHaveCount(model.nodes.length);await page.waitForTimeout(600);
 return {model,saved:()=>saved};
}
async function position(node){return node.evaluate(e=>{const m=e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/);return {x:+m[1],y:+m[2]};});}
test.use({viewport:{width:1600,height:1000},hasTouch:true});
test('mouse drag keeps its viewport, follows the pointer, undoes once and saves logical coordinates',async({page})=>{
 const state=await setup(page),node=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="queue"]')}),station=node.locator('.astra-node'),b=await station.boundingBox();
 const before=await position(node),viewport=page.locator('.react-flow__viewport'),view=await viewport.getAttribute('style'),zoom=await viewport.evaluate(e=>+e.style.transform.match(/scale\(([^)]+)/)[1]);
 const x=b.x+b.width*.5,y=b.y+b.height*.35;
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x+2,y+2);await page.waitForTimeout(35);const anchor=await position(node);
 for(let i=1;i<=12;i++){
  await page.mouse.move(x+2+i*6,y+2+i*3);await page.waitForTimeout(35);
  const p=await position(node);expect(Math.abs((p.x-anchor.x)*zoom-i*6)).toBeLessThan(16*zoom+2);expect(Math.abs((p.y-anchor.y)*zoom-i*3)).toBeLessThan(16*zoom+2);
  expect(await viewport.getAttribute('style')).toBe(view);
 }
 await page.mouse.up();await expect(node).toHaveClass(/selected/);
 await page.waitForTimeout(350);expect(await viewport.getAttribute('style')).toBe(view);
 await page.locator('.react-flow').focus();await page.keyboard.press('Control+z');
 await expect.poll(()=>position(node)).toEqual(before);
 await page.waitForTimeout(400);const next=await station.boundingBox();
 await page.mouse.move(next.x+next.width*.5,next.y+next.height*.35);await page.mouse.down();await page.mouse.move(next.x+next.width*.5+60,next.y+next.height*.35+30,{steps:8});await page.mouse.up();
 const moved=await position(node);await page.getByRole('button',{name:'Save project',exact:true}).click();await expect.poll(()=>!!state.saved()).toBe(true);
 const canonical=state.saved().nodes.find(n=>n.type==='queue').position,c=Math.sqrt(3)/2;
 expect(c*((c+.5)*canonical.x+(.5-c)*canonical.y)).toBeCloseTo(moved.x,2);expect(.5*((c-.5)*canonical.x+(.5+c)*canonical.y)).toBeCloseTo(moved.y,2);
 expect(state.saved().edges).toEqual(state.model.edges);expect(state.saved().simulation).toEqual(state.model.simulation);
});
test('Escape cancels movement without adding an undo entry or leaving late pointer updates',async({page})=>{
 await setup(page);const node=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="queue"]')}),b=await node.boundingBox(),before=await position(node);
 await page.mouse.move(b.x+b.width*.5,b.y+b.height*.35);await page.mouse.down();await page.mouse.move(b.x+b.width*.5+70,b.y+b.height*.35+40,{steps:8});
 await page.keyboard.press('Escape');await page.mouse.move(b.x+b.width*.5+100,b.y+b.height*.35+60);await page.mouse.up();
 await expect.poll(()=>position(node)).toEqual(before);await expect(page.getByRole('button',{name:'Save project',exact:true})).toBeDisabled();
 // A subsequent gesture still works after cancellation.
 const next=await node.boundingBox();await page.mouse.move(next.x+next.width*.5,next.y+next.height*.35);await page.mouse.down();await page.mouse.move(next.x+next.width*.5+30,next.y+next.height*.35+20,{steps:5});await page.mouse.up();await expect.poll(()=>position(node)).not.toEqual(before);
});
test('palette drops reject chrome/outside targets and insert at the current pan/zoom position',async({page})=>{
 const state=await setup(page,{empty:true}),tool=page.locator('.builder-node-tool[aria-label="Source"]');
 const dataTransfer=await page.evaluateHandle(()=>{const d=new DataTransfer();d.setData('application/astra-node','source');return d;});
 for(const target of [tool,page.locator('.builder-controls')]){
  const b=await target.boundingBox();await target.dispatchEvent('drop',{dataTransfer,clientX:b.x+b.width*.5,clientY:b.y+b.height*.5});await expect(page.locator('.astra-node')).toHaveCount(0);
 }
 await page.getByRole('button',{name:'Zoom out',exact:true}).click();await expect(page.getByLabel('Zoom level')).not.toHaveText('100%');
 const pane=page.locator('.react-flow__pane'),b=await pane.boundingBox(),point={x:b.x+b.width*.6,y:b.y+b.height*.45};
 await pane.hover({position:{x:b.width*.8,y:b.height*.2}});await page.mouse.wheel(80,120);await page.waitForTimeout(100);
 const transform=await page.locator('.react-flow__viewport').evaluate(e=>{const m=e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\) scale\(([^)]+)/);return {x:+m[1],y:+m[2],zoom:+m[3]};});
 expect(transform.zoom).not.toBe(1);expect(transform.x!==0||transform.y!==0).toBe(true);
 await pane.dispatchEvent('drop',{dataTransfer,clientX:point.x,clientY:point.y});await expect(page.locator('.astra-node')).toHaveCount(1);
 const p=await position(page.locator('.react-flow__node'));
 expect(p.x).toBeCloseTo(Math.round(((point.x-b.x-transform.x)/transform.zoom)/16)*16,2);expect(p.y).toBeCloseTo(Math.round(((point.y-b.y-transform.y)/transform.zoom)/16)*16,2);
 await page.getByRole('button',{name:'Save project',exact:true}).click();await expect.poll(()=>!!state.saved()).toBe(true);expect(state.saved().nodes).toHaveLength(1);
});
test('real touch supports palette transfer, outside cancellation, station movement and sidebar scrolling',async({page,context})=>{
 await page.setViewportSize({width:1024,height:768});await setup(page,{empty:true});
 const session=await context.newCDPSession(page);
 async function gesture(start,end){await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start.x,y:start.y}]});for(let i=1;i<=12;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/12,y:start.y+(end.y-start.y)*i/12}]});await page.waitForTimeout(20);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 const source=page.locator('.builder-node-tool[aria-label="Source"]'),s=await source.boundingBox(),pane=await page.locator('.react-flow__pane').boundingBox();
 await gesture({x:s.x+s.width*.5,y:s.y+s.height*.5},{x:pane.x+pane.width*.6,y:s.y+s.height*.5+30});await expect(page.locator('.astra-node')).toHaveCount(1);
 const b=await source.boundingBox();await gesture({x:b.x+b.width*.5,y:b.y+b.height*.5},{x:b.x+b.width*.5+18,y:b.y+b.height*.5+50});await expect(page.locator('.astra-node')).toHaveCount(1);
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width*.5,y:b.y+b.height*.5}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:pane.x+pane.width*.5,y:b.y+b.height*.5}]});
 await page.keyboard.press('Escape');await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.astra-node')).toHaveCount(1);
 const node=page.locator('.react-flow__node'),n=await node.boundingBox(),before=await position(node);
 await gesture({x:n.x+n.width*.5,y:n.y+n.height*.35},{x:n.x+n.width*.5+50,y:n.y+n.height*.35+20});await expect.poll(()=>position(node)).not.toEqual(before);expect(await page.evaluate(()=>window.scrollY)).toBe(0);
 await page.getByRole('button',{name:'Close properties',exact:true}).click();
 await page.setViewportSize({width:390,height:600});await page.waitForTimeout(400);
 const panel=page.getByRole('complementary',{name:'Node tools'});if(await panel.getByRole('button',{name:/block panel/}).getAttribute('aria-expanded')!=='true')await panel.getByRole('button',{name:/block panel/}).click();
 const p=await panel.boundingBox();await gesture({x:p.x+p.width*.5,y:p.y+p.height*.8},{x:p.x+p.width*.5,y:p.y+20});await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);await expect(page.locator('.astra-node')).toHaveCount(1);expect(await page.evaluate(()=>window.scrollY)).toBe(0);
});
test('edge auto-pan moves the canvas without scrolling the page and undoes as one gesture',async({page})=>{
 await setup(page);const queue=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="queue"]')});
 const before=await position(queue),b=await queue.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.35);await page.mouse.down();
 await page.mouse.move(b.x+b.width*.5+20,b.y+b.height*.35+10,{steps:4});
 const pane=await page.locator('.react-flow__pane').boundingBox(),viewport=page.locator('.react-flow__viewport'),view=await viewport.getAttribute('style');
 await page.mouse.move(pane.x+pane.width-5,pane.y+pane.height*.5,{steps:12});await expect.poll(()=>viewport.getAttribute('style')).not.toBe(view);
 await page.mouse.up();expect(await page.evaluate(()=>window.scrollY)).toBe(0);await page.locator('.react-flow').focus();await page.keyboard.press('Control+z');await expect.poll(()=>position(queue)).toEqual(before);
});
test('multi-block selection keeps relative positions and undoes the whole group',async({page})=>{
 await setup(page);const source=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="source"]')}),queue=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="queue"]')});
 async function select(node,modifiers=[]){const b=await node.boundingBox();await node.click({position:{x:b.width*.5,y:b.height*.35},modifiers});}
 await select(source);await page.waitForTimeout(400);await select(queue,['Meta']);await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
 const a=await position(source),b=await position(queue),bounds=await queue.boundingBox();
 await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.35);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.5+50,bounds.y+bounds.height*.35+30,{steps:10});await page.mouse.up();
 await expect.poll(()=>position(source)).not.toEqual(a);const nextA=await position(source),nextB=await position(queue);expect(Math.abs((nextB.x-nextA.x)-(b.x-a.x))).toBeLessThan(1.1);expect(Math.abs((nextB.y-nextA.y)-(b.y-a.y))).toBeLessThan(1.1);
 await page.locator('.react-flow').focus();await page.keyboard.press('Control+z');await expect.poll(()=>position(source)).toEqual(a);await expect.poll(()=>position(queue)).toEqual(b);
});
test('cancelling a drag at undo capacity preserves all existing history entries',async({page})=>{
 await setup(page);const queue=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="queue"]')}),box=await queue.boundingBox();
 await queue.click({position:{x:box.width*.5,y:box.height*.35}});await page.waitForTimeout(400);await queue.focus();await page.keyboard.press('ArrowRight');
 const first=await position(queue);for(let i=0;i<50;i++)await page.keyboard.press('ArrowRight');
 const b=await queue.boundingBox();await page.mouse.move(b.x+b.width*.5,b.y+b.height*.35);await page.mouse.down();await page.mouse.move(b.x+b.width*.5+40,b.y+b.height*.35+20,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();
 await page.locator('.react-flow').focus();for(let i=0;i<50;i++)await page.keyboard.press('Control+z');await expect.poll(()=>position(queue)).toEqual(first);
});
