const {test,expect}=require('@playwright/test');
const fixture=require('../../dev/clinic-playback.json');
test('isometric builder saves canonical coordinates, drags through inverse projection, and keeps connection meanings',async({page})=>{
 let saved;
 const original=structuredClone(fixture.model);
 const project={id:'isometric-qa',name:original.name,latest_version:1,model:original};
 await page.route('**/api/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  let body=[];
  if(url.pathname.endsWith('/auth/me'))body={user:{id:'qa',email:'qa@example.test',display_name:'QA'},csrf_token:'qa'};
  else if(url.pathname==='/api/v1/projects/isometric-qa'&&request.method()==='PUT'){saved=request.postDataJSON().model;body={...project,model:saved,latest_version:2};}
  else if(url.pathname==='/api/v1/projects/isometric-qa')body={...project,model:saved??original};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('/simulator?project=isometric-qa');
 const station=page.locator('.react-flow__node').filter({has:page.locator('[data-kind="queue"]')});
 await expect(station).toBeVisible();
 await expect(page.locator('.astra-node > .isometric-miniature')).toHaveCount(6);
 await page.waitForTimeout(400);
 const pos=await station.evaluate(e=>{const match=e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/);return {x:Number(match[1]),y:Number(match[2])};});
 const canonical=original.nodes.find(n=>n.type==='queue').position;
 const c=Math.sqrt(3)/2;
 expect(pos.x).toBeCloseTo(c*((c+.5)*canonical.x+(.5-c)*canonical.y),2);
 expect(pos.y).toBeCloseTo(.5*((c-.5)*canonical.x+(.5+c)*canonical.y),2);
 const box=await station.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height*.35);await page.mouse.down();await page.mouse.move(box.x+box.width/2+60,box.y+box.height*.35+35,{steps:8});await page.mouse.up();
 // React Flow keyboard movement also passes through the inverse projection.
 await station.focus();
 const dragged=await station.getAttribute('style');
 await page.keyboard.press('ArrowRight');
 await expect.poll(()=>station.getAttribute('style')).not.toBe(dragged);
 const rendered=await station.evaluate(e=>{const match=e.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px/);return {x:Number(match[1]),y:Number(match[2])};});
 await page.getByRole('button',{name:/Save project|Save changes|^Save$/}).first().click();
 await expect.poll(()=>!!saved).toBeTruthy();
 const moved=saved.nodes.find(n=>n.type==='queue');expect(moved.position).not.toEqual(canonical);
 expect(c*((c+.5)*moved.position.x+(.5-c)*moved.position.y)).toBeCloseTo(rendered.x,2);
 expect(.5*((c-.5)*moved.position.x+(.5+c)*moved.position.y)).toBeCloseTo(rendered.y,2);
 for(const n of original.nodes.filter(n=>n.type!=='queue'))expect(saved.nodes.find(s=>s.id===n.id)).toEqual(n);
 expect(saved.edges).toEqual(original.edges);expect(saved.simulation).toEqual(original.simulation);expect(moved.config).toEqual(original.nodes.find(n=>n.type==='queue').config);
 await page.screenshot({path:'/tmp/astra-isometric-builder.png'});
});
