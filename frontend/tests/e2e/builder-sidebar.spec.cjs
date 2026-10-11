const {test,expect}=require('@playwright/test');
const fixture=require('../../dev/clinic-playback.json');
for(const viewport of [{width:1440,height:900},{width:1024,height:768},{width:390,height:844}]) {
 test(`sidebar geometry, overflow, tooltips and fixed grid at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.route('**/api/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(route.request().url().endsWith('/auth/me')?{user:{id:'qa',email:'qa@example.test',display_name:'QA'},csrf_token:'qa'}:route.request().url().endsWith('/projects/sidebar-qa')?{id:'sidebar-qa',name:fixture.model.name,latest_version:1,model:fixture.model}:[])}));
  await page.goto('/simulator?project=sidebar-qa');
  const panel=page.getByRole('complementary',{name:'Node tools'});
  await expect(panel).toBeVisible();
  const toggle=panel.getByRole('button',{name:/block panel/});
  if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  await expect(panel).toHaveClass(/is-expanded/);
  await expect.poll(()=>panel.evaluate(e=>e.getBoundingClientRect().width)).toBe(240);
  const dimensions=await panel.evaluate(e=>{const row=e.querySelector('.builder-node-tool'),icon=row.querySelector('.builder-tool-symbol'),toolbar=document.querySelector('.builder-controls');return {row:row.getBoundingClientRect().height,icon:icon.getBoundingClientRect().width,gap:getComputedStyle(e).gap,clearance:toolbar.getBoundingClientRect().top-e.getBoundingClientRect().bottom,scrollbar:getComputedStyle(e).scrollbarWidth,radius:getComputedStyle(e).borderRadius,toolbarRadius:getComputedStyle(toolbar).borderRadius};});
  expect(dimensions.row).toBe(56);expect(dimensions.icon).toBe(40);expect(dimensions.gap).toBe('4px');expect(dimensions.clearance).toBeGreaterThanOrEqual(23.5);expect(dimensions.scrollbar).toBe('none');expect(dimensions.radius).toBe(dimensions.toolbarRadius);
  expect(await panel.evaluate(e=>e.scrollTop)).toBe(0);
  await expect(panel).toHaveAttribute('data-scrolled','false');
  await panel.evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll',{bubbles:true}));});
  await expect(panel).toHaveAttribute('data-overflow','false');
  await expect(panel.getByRole('button',{name:'Sink',exact:true})).toBeInViewport();
  await panel.evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll',{bubbles:true}));});
  await toggle.click();await expect(panel).toHaveClass(/is-collapsed/);
  await expect.poll(()=>panel.evaluate(e=>e.getBoundingClientRect().width)).toBe(64);
  const collapsed=await panel.evaluate(e=>{const icon=e.querySelector('.builder-tool-symbol').getBoundingClientRect(),header=e.querySelector('.builder-tools-heading button').getBoundingClientRect();return {width:icon.width,height:icon.height,padding:getComputedStyle(e).paddingLeft,center:icon.x+icon.width/2,headerCenter:header.x+header.width/2};});
  expect(collapsed.width).toBe(36);expect(collapsed.height).toBe(36);expect(collapsed.padding).toBe('8px');expect(collapsed.center).toBeCloseTo(collapsed.headerCenter,1);
  const source=panel.getByRole('button',{name:'Source',exact:true});await source.hover();
  const tooltip=page.getByRole('tooltip').filter({hasText:'Source'});await expect(tooltip).toBeVisible();
  expect((await tooltip.boundingBox()).x).toBeGreaterThanOrEqual((await panel.boundingBox()).x+64);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.builder-animated-grid > svg rect')).toHaveCount(0);
  expect(await page.locator('.builder-grid-background').evaluate(e=>({insideViewport:!!e.closest('.react-flow__viewport'),events:getComputedStyle(e).pointerEvents}))).toEqual({insideViewport:false,events:'none'});
  await page.screenshot({path:`/tmp/astra-sidebar-${viewport.width}.png`});
 });
}
