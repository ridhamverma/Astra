const {test,expect}=require('@playwright/test');
const {randomUUID}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const model=require('../../../docs/examples/simple.json');
const origin='http://localhost:3100',api='http://localhost:8000';
test.use({viewport:{width:1600,height:1000}});
test.skip(process.env.ASTRA_LIVE_QA!=='1','Requires the local Astra API and PostgreSQL.');
async function account(page,work){
 const response=await page.request.post(api+'/api/v1/auth/register',{headers:{Origin:origin},data:{email:`astra-function-qa-${randomUUID()}@example.com`,password:randomUUID()+randomUUID(),display_name:'Function review'}});
 expect(response.status()).toBe(201);
 const auth=await response.json();
 const headers={Origin:origin,'X-Astra-CSRF':auth.csrf_token};
 try {await work(headers);}
 finally {
  const backend=path.resolve(__dirname,'../../../backend');
  execFileSync(path.join(backend,'.venv/bin/python'),['-c',`from uuid import UUID\nfrom sqlalchemy import delete\nfrom app.database.session import get_session_factory\nfrom app.models import Project, User\nwith get_session_factory()() as db:\n db.execute(delete(Project).where(Project.user_id == UUID('${auth.user.id}')))\n db.execute(delete(User).where(User.id == UUID('${auth.user.id}')))\n db.commit()`],{cwd:backend});
 }
}
test('unfinished graph saves and reopens; stale browser saves cannot replace a newer model',async({page})=>account(page,async(headers)=>{
 const draft=structuredClone(model);draft.nodes=draft.nodes.slice(0,1);draft.edges=[];
 const created=await page.request.post(api+'/api/v1/projects',{headers,data:{name:'Draft persistence QA',model:draft}});
 expect(created.status()).toBe(201);const project=await created.json();
 await page.goto(`${origin}/simulator?project=${project.id}`);
 await expect(page.locator('.astra-node')).toHaveCount(1);
 async function renameSource(name){
  const station=page.locator('.astra-node');const box=await station.boundingBox();
  await station.click({position:{x:box.width*.5,y:box.height*.4}});
  await page.getByRole('textbox',{name:'Configuration node name'}).fill(name);
  await page.getByRole('button',{name:'Close properties',exact:true}).click();
 }
 await renameSource('Saved draft arrivals');
 await expect(page.getByRole('button',{name:/Save project|Save changes|^Save$/}).first()).toBeEnabled();
 const saved=page.waitForResponse(r=>r.url().endsWith('/projects/'+project.id)&&r.request().method()==='PUT');
 await page.getByRole('button',{name:/Save project|Save changes|^Save$/}).first().click();
 expect((await saved).status()).toBe(200);
 await page.reload();await expect(page.locator('.astra-node')).toHaveCount(1);
 const latest=await (await page.request.get(api+'/api/v1/projects/'+project.id)).json();
 const edited=structuredClone(latest.model);edited.nodes[0].name='Newer tab arrivals';
 expect((await page.request.put(api+'/api/v1/projects/'+project.id,{headers,data:{model:edited,expected_version:latest.latest_version}})).status()).toBe(200);
 await renameSource('Old tab edit');
 await expect(page.getByRole('button',{name:/Save project|Save changes|^Save$/}).first()).toBeEnabled();
 const conflict=page.waitForResponse(r=>r.url().endsWith('/projects/'+project.id)&&r.request().method()==='PUT');
 await page.getByRole('button',{name:/Save project|Save changes|^Save$/}).first().click();
 expect((await conflict).status()).toBe(409);
 await expect(page.locator('.astra-notice-error')).toContainText('changed in another session');
 await page.reload();await expect(page.locator('.astra-node')).toContainText('Newer tab arrivals');
}));
test('scenario results cannot replace baseline canvas or main run history',async({page})=>account(page,async(headers)=>{
 const created=await page.request.post(api+'/api/v1/projects',{headers,data:{name:'Baseline QA',model}});
 const project=await created.json();
 const changed=structuredClone(model);changed.nodes[1].name='Scenario-only service';changed.nodes[1].config.resource_count=3;
 const scenario=await (await page.request.post(`${api}/api/v1/projects/${project.id}/scenarios`,{headers,data:{name:'Experiment',model:changed}})).json();
 expect((await page.request.post(`${api}/api/v1/scenarios/${scenario.id}/runs`,{headers,data:{}})).status()).toBe(201);
 expect((await page.request.delete(`${api}/api/v1/scenarios/${scenario.id}`,{headers})).status()).toBe(204);
 await page.goto(`${origin}/simulator?project=${project.id}`);
 await expect(page.locator('.astra-node')).toHaveCount(3);
 await expect(page.locator('.astra-node[data-kind="process"]')).toContainText(model.nodes[1].name);
 await expect(page.locator('.astra-node[data-kind="process"]')).not.toContainText('Scenario-only service');
 const response=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Run simulation',exact:true}).click();
 const run=await (await response).json();expect(run.model_version).toBe(1);expect(run.model.nodes[1].config.resource_count).toBe(1);expect(run.is_scenario).toBe(false);
}));
test('project library rename, search, deletion, settings and logout use persisted account data',async({page})=>account(page,async(headers)=>{
 const created=await page.request.post(api+'/api/v1/projects',{headers,data:{name:'Library QA',model}});
 const project=await created.json();await page.goto(origin+'/projects');
 await expect(page.getByRole('heading',{name:'Library QA',exact:true})).toBeVisible();
 await page.getByLabel('Actions for Library QA').click();await page.getByRole('button',{name:'Rename project',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Rename project'});
 await dialog.getByRole('textbox',{name:'Project name'}).fill('Renamed QA');await dialog.getByRole('button',{name:'Save name'}).click();
 await expect(page.getByRole('heading',{name:'Renamed QA',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'Renamed QA',exact:true})).toBeVisible();
 await page.getByRole('searchbox').fill('absent project');await expect(page.getByRole('heading',{name:'No matching projects'})).toBeVisible();
 await page.getByRole('searchbox').fill('Renamed');
 await page.getByLabel('Actions for Renamed QA').click();await page.getByRole('button',{name:'Delete project',exact:true}).click();
 await page.getByRole('dialog',{name:'Delete project?'}).getByRole('button',{name:'Delete project',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Renamed QA',exact:true})).toHaveCount(0);
 expect((await page.request.get(api+'/api/v1/projects/'+project.id)).status()).toBe(404);
 await page.goto(origin+'/settings');await expect(page.getByText('Function review',{exact:true}).last()).toBeVisible();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/login(?:\?|$)/);
 expect((await page.request.get(api+'/api/v1/auth/me')).status()).toBe(401);
}));
