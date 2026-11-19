/* WebKit DOM/gesture checks with simulated extension transport. Not an iPhone installation test. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({viewport:{width:440,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const requests=[];let settings={paused:false,interceptGoogle:true,excludedHosts:[],placement:'bottom-right',clearance:16};
 const bookmarks=[];
 const items=[
  {id:'a',title:'A source on any website',url:'https://example.test/list',at:1,parentId:null},
  {id:'b',title:'مقالة عربية — Article',url:'https://example.test/article',at:2,parentId:'a'},
  {id:'c',title:'Current page',url:'https://example.test/details',at:3,parentId:'b'},
  {id:'d',title:'Another branch',url:'https://example.test/other',at:4,parentId:'a'}
 ];
 await context.exposeBinding('sendMock',async(_,m)=>{
  requests.push(m);let data={};
  if(m.type==='STATUS')data={source:items[1],sourceOpen:true,canReturn:true,currentId:'c',settings,host:'example.test',excluded:false};
  if(m.type==='TREE')data={items,ancestors:items.slice(0,3),currentId:'c',total:4};
  if(m.type==='LIST'){const matches=items.filter(n=>!m.query||n.title.toLowerCase().includes(m.query.toLowerCase()));data={items:matches,total:4,matches:matches.length};}
  if(m.type==='SETTINGS'){for(const k of ['placement','clearance','paused','interceptGoogle'])if(k in m)settings[k]=m[k];}
  if(m.type==='BOOKMARKS')data={items:bookmarks};
  if(m.type==='BOOKMARK_SAVE'&&!bookmarks.length)bookmarks.push({...items[2],id:'bookmark'});
  if(m.type==='BOOKMARK_DELETE')bookmarks.length=0;
  if(m.type==='VISIT')data={recorded:true};
  return {ok:true,data};
 });
 await context.addInitScript(()=>{
  // Open shadow roots only inside this test, for inspection of production content/UI code.
  const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(init){return attach.call(this,{...init,mode:'open'});};
  const listeners=[];
  window.browser={extension:{inIncognitoContext:false},storage:{onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{getManifest:()=>({version:"0.3.0"}),sendMessage:async m=>{const r=await window.sendMock(m);if(m.type==='SETTINGS')for(const fn of listeners)fn({settings:{}},'local');return r;}}};
 });
 const page=await context.newPage();
 await page.route('https://example.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Arabic page</title></head><body style="margin:20px;background:#fff"><h1>صفحة عربية للتجربة</h1><p>Test page for SearchTrail</p><a id="same" href="/next">Same tab link</a><br><a id="blank" target="_blank" href="https://other.test/page">New tab link</a><div style="height:1800px"></div></body></html>'}));
 async function inject(){for(const file of ['core.js','styles.js','ui.js','content.js'])await page.addScriptTag({path:path.join(__dirname,'../extension',file)});await page.locator('.launcher:not(.menu-launcher)').waitFor();}
 async function hold(){const b=await page.locator('.launcher:not(.menu-launcher)').boundingBox();await page.mouse.move(b.x+25,b.y+25);await page.mouse.down();await pause(600);await page.mouse.up();await page.locator('.panel').waitFor({state:'visible'});}
 async function eventually(fn){for(let i=0;i<40;i++){if(await fn())return;await pause(50);}throw Error('Condition not satisfied');}
 try {
  await page.goto('https://example.test/details');await inject();
  await page.locator('.launcher:not(.menu-launcher)').tap();await eventually(()=>requests.filter(m=>m.type==='RETURN').length===1);
  assert.equal(await page.locator('.panel').count(),0,'Tap must return without opening a panel');
  await hold();await eventually(()=>page.locator('.tree .open').count().then(n=>n===4));
  assert.equal(requests.filter(m=>m.type==='RETURN').length,1,'Hold must not also navigate');
  assert.equal(await page.locator('.tree .current').count(),1);
  assert.equal(await page.locator('.tree .on-path').count(),3);
  assert.equal(await page.locator('.panel').evaluate(n=>getComputedStyle(n).direction),'ltr');
  const panel=await page.locator('.panel').boundingBox(),launcher=await page.locator('.launcher:not(.menu-launcher)').boundingBox();
  assert.ok(panel.y>=200 && panel.y+panel.height>launcher.y+launcher.height,'Sheet should extend behind the floating buttons');
  assert.ok(launcher.y+launcher.height<=790 && launcher.y>700,'Button should be near bottom');
  fs.mkdirSync(path.join(__dirname,'../dist'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'../dist/ui-rtl-trail.png')});
  await page.getByRole('button',{name:'Bookmarks',exact:true}).click();
  await page.getByRole('button',{name:'☆ Save this page',exact:true}).click();await eventually(()=>page.locator('.visit').count().then(n=>n===1));
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('searchbox').fill('another');await eventually(()=>page.locator('.visit').count().then(n=>n===1));
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByLabel('Button placement',{exact:true}).selectOption('bottom-left');
  await eventually(()=>page.locator('.launcher:not(.menu-launcher)').boundingBox().then(b=>b.x<20));
  await page.locator('.menu-launcher').click();await page.locator('.panel').waitFor({state:'hidden'});
  const treeRequests=requests.filter(m=>m.type==='TREE').length;
  await page.locator('.menu-launcher').click();await page.locator('.panel').waitFor({state:'visible'});
  await eventually(()=>requests.filter(m=>m.type==='TREE').length===treeRequests+1);
  const returns=requests.filter(m=>m.type==='RETURN').length;
  await page.locator('.launcher:not(.menu-launcher)').tap();await eventually(()=>requests.filter(m=>m.type==='RETURN').length===returns+1);
  await page.locator('.panel').waitFor({state:'hidden'});
  await page.reload();await inject();assert.ok((await page.locator('.launcher:not(.menu-launcher)').boundingBox()).x<20,'Saved placement should survive page reload');
  await hold();await page.getByRole('button',{name:'History',exact:true}).click();
  await page.setViewportSize({width:440,height:440});await pause(150);
  const smallPanel=await page.locator('.panel').boundingBox(),nav=await page.locator('.nav').boundingBox();
  assert.ok(smallPanel.y>=0&&smallPanel.y+smallPanel.height<=440,'Resized viewport must contain panel');
  assert.ok(nav.y+nav.height<=smallPanel.y+smallPanel.height,'Controls remain inside sheet');
  await page.screenshot({path:path.join(__dirname,'../dist/ui-small-viewport.png')});
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.setViewportSize({width:440,height:800});
  const before=requests.length;await page.locator('#blank').click();await eventually(()=>requests.slice(before).some(m=>m.type==='OPEN_LINK'));
  assert.equal(page.url(),'https://example.test/details','Managed new-tab link must leave the source page intact');
  await page.locator('#same').click();await page.waitForURL('https://example.test/next');
  assert.ok(requests.some(m=>m.type==='LINK_INTENT'&&m.href==='https://example.test/next'),'Same-tab link should record intent');
  console.log('WebKit checks passed: direct tap, hold, branching tree, RTL isolation, history filter, saved placement, viewport resizing, generic links. Extension APIs simulated.');
 }catch(e){fs.mkdirSync(path.join(__dirname,'../dist'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../dist/ui-failure.png')}).catch(()=>{});throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
