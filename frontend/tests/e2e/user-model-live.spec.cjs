const {test,expect}=require('@playwright/test');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
test.use({viewport:{width:1600,height:1000}});
test.skip(process.env.ASTRA_LIVE_QA!=='1','Opt-in test requiring the local Astra API and database.');
for(const kind of ['process','delay'])test(`build and replay a user-defined ${kind} model through the real API`,async({page})=>{
 const origin='http://localhost:3100',api='http://localhost:8000';
 const email=`astra-ui-qa-${randomUUID()}@example.com`;
 const response=await page.request.post(`${api}/api/v1/auth/register`,{headers:{Origin:origin},data:{email,password:randomUUID()+randomUUID(),display_name:'Temporary UI verification'}});
 expect(response.status()).toBe(201);
 const auth=await response.json();
 try {
  await page.goto(`${origin}/simulator`);
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(page.getByRole('button',{name:'Add Source',exact:true})).toBeVisible();
  await expect(page.locator('.astra-node')).toHaveCount(0);
  const pane=page.locator('.react-flow__pane');
  async function place(type,x,y){
   await page.locator(`.builder-node-tool[aria-label="${type}"]`).click();
   // Auto-fit can move existing stations after placement; choose an exposed floor point.
   const point=await pane.evaluate((element,preferred)=>{
    const b=element.getBoundingClientRect();
    const points=[preferred];
    for(let py=140;py<b.height-100;py+=120)for(let px=330;px<b.width-100;px+=170)points.push({x:px,y:py});
    const zoom=parseFloat(document.querySelector('[aria-label="Zoom level"]').textContent)/100;
    const occupied=[...document.querySelectorAll('.react-flow__node')].map(n=>n.getBoundingClientRect());
    return points.find(p=>{
     const x=b.left+p.x,y=b.top+p.y,w=248*zoom,h=280*zoom;
     return x+w<b.right-20 && y+h<b.bottom-20 && document.elementFromPoint(x,y)===element && !occupied.some(n=>x<n.right+20&&x+w>n.left-20&&y<n.bottom+20&&y+h>n.top-20);
    });
   },{x,y});
   expect(point).toBeTruthy();
   await pane.click({position:point});
   await expect(page.locator(`.astra-node[data-kind="${type.toLowerCase()}"]`)).toHaveCount(1);
   await page.waitForTimeout(400); // Let the existing fit/palette transition settle before another placement.
  }
  await place('Source',400,200);await place(kind==='process'?'Process':'Delay',760,320);await place('Sink',1000,550);
  async function inspect(type){await page.waitForTimeout(400);const node=page.locator(`.astra-node[data-kind="${type}"]`);const box=await node.boundingBox();await node.click({position:{x:box.width*.5,y:box.height*.4}});await expect(page.getByRole('dialog',{name:'Properties'})).toBeVisible();}
  const middleName=kind==='process'?'Custom packing desk':'Custom inspection hold';
  await inspect(kind);await page.getByRole('textbox',{name:'Configuration node name'}).fill(middleName);
  await page.getByRole('spinbutton',{name:kind==='process'?'Mean service time':'Mean delay time'}).fill('1');
  await page.getByRole('combobox',{name:'Destination',exact:true}).selectOption({label:'Sink'});
  await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('button',{name:'Close properties',exact:true}).click();
  await inspect('source');await page.getByRole('textbox',{name:'Configuration node name'}).fill('Custom parcel arrivals');
  await page.getByRole('spinbutton',{name:'Maximum entities'}).fill('5');
  await page.getByRole('combobox',{name:'Destination',exact:true}).selectOption({label:middleName});
  await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('button',{name:'Close properties',exact:true}).click();
  const completed=page.waitForResponse(r=>r.url().includes('/api/v1/projects/')&&r.url().endsWith('/runs')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Run simulation',exact:true}).click();
  const runResponse=await completed;expect(runResponse.ok()).toBeTruthy();const run=await runResponse.json();
  expect(run.model.nodes.map(n=>n.type).sort()).toEqual(['source',kind,'sink'].sort());expect(run.model.edges).toHaveLength(2);
  expect(run.model.nodes.find(n=>n.type===kind).name).toBe(middleName);expect(run.summary.total_completed).toBe(5);
  await page.getByRole('tab',{name:'Playback',exact:true}).click();
  await expect(page.locator('.playback-station')).toHaveCount(3);
  await expect(page.locator('.playback-blocks .floor-block')).toHaveCount(3);
  await expect(page.locator('.playback-blocks')).toContainText(middleName);
  const slider=page.getByRole('slider',{name:'Playback time'});await slider.focus();await page.keyboard.press('End');
  await expect(page.locator('.playback-stat').filter({hasText:'5 completed'})).toBeVisible();
  await page.reload();
  await expect(page.locator('.astra-node')).toHaveCount(3);
  await expect(page.locator('.astra-node[data-kind="'+kind+'"]')).toContainText(middleName);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  // The existing history API stores compact metrics, not timelines. Replay uses a fresh run.
  const rerun=page.waitForResponse(r=>r.url().includes('/api/v1/projects/')&&r.url().endsWith('/runs')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Run simulation',exact:true}).click();
  expect((await rerun).ok()).toBeTruthy();
  await page.getByRole('tab',{name:'Playback',exact:true}).click();
  await expect(page.locator('.playback-station')).toHaveCount(3);
  await expect(page.locator('.playback-blocks')).toContainText(middleName);
 } finally {
  // Remove only this test's own account and owned projects; existing users are untouched.
  const backend=path.resolve(__dirname,'../../../backend');
  execFileSync(path.join(backend,'.venv/bin/python'),['-c',`from uuid import UUID\nfrom sqlalchemy import delete\nfrom app.database.session import get_session_factory\nfrom app.models import Project, User\nwith get_session_factory()() as db:\n db.execute(delete(Project).where(Project.user_id == UUID('${auth.user.id}')))\n db.execute(delete(User).where(User.id == UUID('${auth.user.id}')))\n db.commit()`],{cwd:backend});
 }
});
