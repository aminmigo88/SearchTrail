/* WebKit DOM/gesture checks with simulated extension transport. Not an iPhone installation test. */
const {webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({viewport:{width:440,height:800},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const requests=[];let settings={paused:false,interceptGoogle:true,excludedHosts:[],placement:'bottom-right',clearance:16,blockPopups:true,popupAllowedHosts:[]};
 const bookmarks=[];
 const items=[
  {id:'a',title:'A source on any website',url:'https://example.test/list',at:1,parentId:null},
  {id:'b',title:'مقالة عربية — Article',url:'https://example.test/article',at:2,parentId:'a'},
  {id:'c',title:'Current page',url:'https://example.test/details',at:3,parentId:'b'},
  {id:'d',title:'Another branch',url:'https://example.test/other',at:4,parentId:'a'}
 ];
 await context.exposeBinding('sendMock',async(_,m)=>{
  requests.push(m);let data={};
  if(m.type==='STATUS')data={source:items[1],sourceOpen:true,canReturn:true,currentId:'c',settings,host:'example.test',excluded:false,popupsAllowed:settings.popupAllowedHosts.includes('example.test')};
  if(m.type==='TREE')data={items,ancestors:items.slice(0,3),currentId:'c',total:4};
  if(m.type==='LIST'){const matches=items.filter(n=>!m.query||n.title.toLowerCase().includes(m.query.toLowerCase()));data={items:matches,total:4,matches:matches.length};}
  if(m.type==='SETTINGS'){for(const k of ['placement','clearance','paused','interceptGoogle','menuHidden','blockPopups'])if(k in m)settings[k]=m[k];}
  if(m.type==='POPUP_ALLOW')settings.popupAllowedHosts=settings.popupAllowedHosts.includes('example.test')?[]:['example.test'];
  if(m.type==='BOOKMARKS')data={items:bookmarks};
  if(m.type==='BOOKMARK_SAVE'&&!bookmarks.length)bookmarks.push({...items[2],id:'bookmark'});
  if(m.type==='BOOKMARK_DELETE')bookmarks.length=0;
  if(m.type==='VISIT')data={recorded:true};
  return {ok:true,data,settingsNow:JSON.parse(JSON.stringify(settings))};
 });
 await context.addInitScript(()=>{
  // Open shadow roots only inside this test, for inspection of production content/UI code.
  const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(init){return attach.call(this,{...init,mode:'open'});};
  const listeners=[];
  window.browser={extension:{inIncognitoContext:false},
   storage:{local:{get:async()=>({settings:(await window.sendMock({type:'READ_SETTINGS'})).settingsNow})},onChanged:{addListener:fn=>listeners.push(fn)}},
   runtime:{onMessage:{addListener(){}},sendMessage:async m=>{const r=await window.sendMock(m);if(m.type==='SETTINGS'||m.type==='POPUP_ALLOW')for(const fn of listeners)fn({settings:{newValue:r.settingsNow}},'local');return r;}}};
 });
 const page=await context.newPage();
 await page.route('https://example.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Arabic page</title></head><body style="margin:20px;background:#fff"><h1>صفحة عربية للتجربة</h1><p>Test page for SearchTrail</p><a id="same" href="/next">Same tab link</a><br><a id="blank" target="_blank" href="https://other.test/page">New tab link</a><p><button id="adpop" onclick="window.__pop=window.open(\'https://ads.example/x\')">Ad pop-up</button> <button id="ownpop" onclick="window.__own=window.open(\'/own\')">Own window</button> <button id="progpop" onclick="var a=document.createElement(\'a\');a.href=\'https://ads.example/p\';a.target=\'_blank\';document.body.appendChild(a);a.click();">Script link</button></p><div style="height:1800px"></div></body></html>'}));
 async function inject(){for(const file of ['core.js','guard.js','styles.js','ui.js','content.js'])await page.addScriptTag({path:path.join(__dirname,'../extension',file)});await page.locator('.launcher:not(.menu-launcher)').waitFor();}
 async function hold(){const b=await page.locator('.launcher:not(.menu-launcher)').boundingBox();await page.mouse.move(b.x+25,b.y+25);await page.mouse.down();await pause(600);await page.mouse.up();await page.locator('.panel').waitFor({state:'visible'});}
 async function eventually(fn){for(let i=0;i<40;i++){if(await fn())return;await pause(50);}throw Error('Condition not satisfied');}
 try {
  await page.goto('https://example.test/details');await inject();
  await page.locator('.launcher:not(.menu-launcher)').tap();await eventually(()=>requests.filter(m=>m.type==='RETURN').length===1);
  assert.equal(await page.locator('.panel').count(),0,'Tap must return without opening a panel');
  // Menu button sits directly above the arrow.
  let menuBox=await page.locator('.menu-launcher').boundingBox(),arrowBox=await page.locator('.launcher:not(.menu-launcher)').boundingBox();
  assert.ok(menuBox.y+menuBox.height<=arrowBox.y&&Math.abs(menuBox.x-arrowBox.x)<1,'Menu button must be stacked above the arrow');
  // Swipe toward the screen edge tucks it into a thin tab without opening the menu.
  await page.mouse.move(menuBox.x+25,menuBox.y+25);await page.mouse.down();
  for(const dx of [12,24,36,44])await page.mouse.move(menuBox.x+25+dx,menuBox.y+25);
  await page.mouse.up();
  await eventually(()=>requests.some(m=>m.type==='SETTINGS'&&m.menuHidden===true));
  await pause(300);menuBox=await page.locator('.menu-launcher').boundingBox();
  assert.ok(menuBox.width<=16&&Math.abs(menuBox.x+menuBox.width-440)<=1,'Tucked menu button must be a thin tab at the screen edge');
  assert.equal(await page.locator('.panel').count(),0,'Swiping must not open the menu');
  await page.screenshot({path:path.join(__dirname,'../dist/ui-menu-tucked.png')});
  // Dragging the tab back out restores it.
  await page.mouse.move(menuBox.x+7,menuBox.y+25);await page.mouse.down();
  for(const dx of [-12,-24,-36])await page.mouse.move(menuBox.x+7+dx,menuBox.y+25);
  await page.mouse.up();
  await eventually(()=>requests.some(m=>m.type==='SETTINGS'&&m.menuHidden===false));
  await pause(300);assert.equal(Math.round((await page.locator('.menu-launcher').boundingBox()).width),50,'Menu button must be restored');
  assert.equal(await page.locator('.panel').count(),0,'Restoring must not open the menu');
  await hold();await eventually(()=>page.locator('.tree .open').count().then(n=>n===4));
  assert.equal(requests.filter(m=>m.type==='RETURN').length,1,'Hold must not also navigate');
  assert.equal(await page.locator('.tree .current').count(),1);
  assert.equal(await page.locator('.tree .on-path').count(),3);
  assert.equal(await page.locator('.panel').evaluate(n=>getComputedStyle(n).direction),'ltr');
  await pause(250);
  const panel=await page.locator('.panel').boundingBox(),launcher=await page.locator('.launcher:not(.menu-launcher)').boundingBox();
  assert.ok(panel.y>=200 && panel.y+panel.height>launcher.y+launcher.height,'Sheet should extend behind the floating buttons');
  assert.ok(launcher.y+launcher.height<=790 && launcher.y>700,'Button should be near bottom');
  // One-handed layout: tabs in one row at the bottom beside the buttons, nothing covered by them.
  assert.equal(await page.getByRole('button',{name:'Close',exact:true}).count(),0,'No Close button at the top');
  let dockBox=await page.locator('.dock').boundingBox(),navBox=await page.locator('.nav').boundingBox();
  assert.ok(navBox.height<=60&&panel.y+panel.height-(navBox.y+navBox.height)<=24,'Tabs form one row at the bottom of the menu');
  assert.ok(navBox.x+navBox.width<=dockBox.x,'Tabs stay clear of the floating buttons');
  assert.ok((await page.locator('.pad-bottom').boundingBox()).height>0,'Extra scroll room lets rows move clear of the buttons');
  const here=await page.locator('.tree .current>.open').boundingBox(),body=await page.locator('.body').boundingBox();
  assert.ok(here.y+here.height/2>body.y+body.height/2,'You are here sits in the lower half of the menu');
  fs.mkdirSync(path.join(__dirname,'../dist'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'../dist/ui-rtl-trail.png')});
  await page.getByRole('button',{name:'Bookmarks',exact:true}).click();
  await page.getByRole('button',{name:'☆ Save this page',exact:true}).click();await eventually(()=>page.locator('.visit:visible').count().then(n=>n===1));
  await page.getByRole('button',{name:'History',exact:true}).click();
  await page.getByRole('searchbox').fill('another');await eventually(()=>page.locator('.visit:visible').count().then(n=>n===1));
  const searchBox=await page.getByRole('searchbox').boundingBox();navBox=await page.locator('.nav').boundingBox();dockBox=await page.locator('.dock').boundingBox();
  assert.ok(searchBox.y+searchBox.height<=navBox.y+1&&navBox.y-(searchBox.y+searchBox.height)<=12,'History search sits just above the tabs');
  assert.ok(searchBox.x+searchBox.width<=dockBox.x,'Search box stays clear of the floating buttons');
  await page.screenshot({path:path.join(__dirname,'../dist/ui-history-bottom-search.png')});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  // Pop-up settings: on by default, with an exception for this website, and an on/off switch.
  assert.equal(await page.getByRole('checkbox',{name:'Block pop-ups'}).isChecked(),true,'Pop-up blocking is on by default');
  await page.getByRole('button',{name:'Allow pop-ups on this site',exact:true}).click();
  await eventually(()=>page.getByRole('button',{name:'Block pop-ups on this site',exact:true}).count().then(n=>n===1));
  await page.getByRole('button',{name:'Block pop-ups on this site',exact:true}).click();
  await page.getByRole('checkbox',{name:'Block pop-ups'}).uncheck();await eventually(()=>requests.some(m=>m.type==='SETTINGS'&&m.blockPopups===false));
  await eventually(()=>page.getByRole('button',{name:'Allow pop-ups on this site',exact:true}).count().then(n=>n===0));
  await page.getByRole('checkbox',{name:'Block pop-ups'}).check();await eventually(()=>requests.some(m=>m.type==='SETTINGS'&&m.blockPopups===true));
  await page.getByLabel('Button placement',{exact:true}).selectOption('bottom-left');
  await eventually(()=>page.locator('.launcher:not(.menu-launcher)').boundingBox().then(b=>b.x<20));
  await eventually(async()=>{const d=await page.locator('.dock').boundingBox(),n=await page.locator('.nav').boundingBox();return n.x>=d.x+d.width;});
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
  await page.locator('.menu-launcher').click();await page.locator('.panel').waitFor({state:'hidden'});
  await page.setViewportSize({width:320,height:640});
  await page.locator('.menu-launcher').click();
  for(const corner of ['top-left','top-right','bottom-right','bottom-left']){
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByLabel('Button placement',{exact:true}).selectOption(corner);await pause(200);
    const sheet=await page.locator('.panel').boundingBox();
    assert.ok(sheet.x>=0&&sheet.x+sheet.width<=320&&sheet.y>=0&&sheet.y+sheet.height<=640,'Sheet fits narrow screen: '+corner);
    for(const name of ['Trail','History','Bookmarks','Settings'])await page.getByRole('button',{name,exact:true}).click();
  }
  await page.screenshot({path:path.join(__dirname,'../dist/ui-narrow-settings.png')});
  // A tap on the page outside the menu closes it.
  await page.mouse.click(10,10);await page.locator('.panel').waitFor({state:'hidden'});
  await page.setViewportSize({width:440,height:800});
  // Pop-up blocker: script pop-ups, script-made link clicks and invisible cover links to other
  // websites are stopped, with a short notice; the same website and links you tap still open.
  const opened=[];context.on('page',p=>opened.push(p));
  await context.route('https://ads.example/**',r=>r.fulfill({contentType:'text/html',body:'<title>Ad</title>Ad'}));
  await context.route('https://example.test/own**',r=>r.fulfill({contentType:'text/html',body:'<title>Own</title>Own window'}));
  await page.locator('#adpop').click();
  assert.equal(await page.evaluate(()=>window.__pop),null,'window.open to another website returns nothing');
  await eventually(()=>page.locator('.popup-note.show').count().then(n=>n===1));
  const noteBox=await page.locator('.popup-note').boundingBox(),stackBox=await page.locator('.dock').boundingBox();
  assert.ok(noteBox.y+noteBox.height<=stackBox.y,'Notice sits above the buttons');
  await page.screenshot({path:path.join(__dirname,'../dist/ui-popup-blocked.png')});
  await page.locator('#progpop').click();
  await page.evaluate(()=>{const a=document.createElement('a');a.id='cover';a.target='_blank';a.href='https://ads.example/cover';a.style.cssText='position:fixed;inset:0;opacity:0;z-index:2147483646';document.body.append(a);});
  const linkRequests=requests.filter(m=>m.type==='OPEN_LINK').length;
  await page.mouse.click(200,300);await pause(300);
  assert.equal(requests.filter(m=>m.type==='OPEN_LINK').length,linkRequests,'An invisible cover link does not open');
  await page.evaluate(()=>document.getElementById('cover').remove());
  assert.equal(opened.length,0,'No pop-up tab opened');
  await page.locator('#ownpop').click();await eventually(()=>opened.length===1);
  await opened[0].waitForURL(/example\.test\/own/);await opened[0].close();
  await eventually(()=>page.locator('.popup-note.show').count().then(n=>n===0));
  const before=requests.length;await page.locator('#blank').click();await eventually(()=>requests.slice(before).some(m=>m.type==='OPEN_LINK'));
  assert.equal(page.url(),'https://example.test/details','Managed new-tab link must leave the source page intact');
  await page.locator('#same').click();await page.waitForURL('https://example.test/next');
  assert.ok(requests.some(m=>m.type==='LINK_INTENT'&&m.href==='https://example.test/next'),'Same-tab link should record intent');
  console.log('WebKit checks passed: direct tap, stacked menu button, swipe to hide and restore, hold, one-handed bottom tabs and search, close by tapping outside, pop-up blocking with notice and settings, branching tree, RTL isolation, history filter, saved placement, viewport resizing, generic links. Extension APIs simulated.');
 }catch(e){fs.mkdirSync(path.join(__dirname,'../dist'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../dist/ui-failure.png')}).catch(()=>{});throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
