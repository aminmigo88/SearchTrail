const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
function event(){const f=[];return {addListener:fn=>f.push(fn),emit:(...a)=>f.map(fn=>fn(...a)),listeners:f};}
function harness(sharedLocal){
  const local=sharedLocal||{},session={},tabMap=new Map();let nextTab=10;
  const createEvent=event(),removeEvent=event(),onMessage=event(),startup=event();
  const changes=event();
  const area=(obj,name)=>({
    async get(keys){if(keys===null)return structuredClone(obj);if(typeof keys==='string')keys=[keys];return Object.fromEntries(keys.filter(k=>k in obj).map(k=>[k,structuredClone(obj[k])]));},
    async set(values){for(const [k,v]of Object.entries(values)){obj[k]=structuredClone(v);}changes.emit(Object.fromEntries(Object.keys(values).map(k=>[k,{newValue:values[k]}])),name);},
    async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete obj[k];},async clear(){for(const k of Object.keys(obj))delete obj[k];}
  });
  const B={storage:{local:area(local,'local'),session:area(session,'session'),onChanged:changes},extension:{inIncognitoContext:false},runtime:{onMessage,onStartup:startup},tabs:{onCreated:createEvent,onRemoved:removeEvent,
    async get(n){if(!tabMap.has(n))throw Error('Tab closed');return {...tabMap.get(n)};},
    async create(options){const t={id:nextTab++,incognito:false,...options};tabMap.set(t.id,t);createEvent.emit(t);return t;},
    async update(n,options){if(!tabMap.has(n))throw Error('Tab closed');Object.assign(tabMap.get(n),options);return tabMap.get(n);}
  }};
  const ctx=vm.createContext({browser:B,URL,URLSearchParams,crypto:webcrypto,console,setTimeout});
  for(const file of ['core.js','background.js'])vm.runInContext(fs.readFileSync(require.resolve('../extension/'+file),'utf8'),ctx);
  function add(id,url,extra={}){const t={id,url,title:url,incognito:false,...extra};tabMap.set(id,t);return t;}
  async function send(id,type,data={}){return onMessage.listeners[0]({type,...data},{tab:{...tabMap.get(id)},frameId:0,url:tabMap.get(id)?.url});}
  async function visit(id,navigationId=webcrypto.randomUUID(),extra={}){return send(id,'VISIT',{url:tabMap.get(id).url,title:tabMap.get(id).title,navigationId,...extra});}
  return {add,send,visit,tabMap,local,session,B};
}
test('two concurrent Google searches keep their own destinations',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');h.add(2,'https://www.google.com/search?q=printer');
  await Promise.all([h.visit(1),h.visit(2)]);
  const results=await Promise.all([h.send(1,'OPEN_RESULT',{href:'https://example.com/air'}),h.send(2,'OPEN_RESULT',{href:'https://example.com/printer'})]);
  assert.ok(results.every(x=>x.ok));await h.visit(10);await h.visit(11);
  assert.equal((await h.send(10,'STATUS')).data.source.url,'https://www.google.com/search?q=air');
  assert.equal((await h.send(11,'STATUS')).data.source.url,'https://www.google.com/search?q=printer');
  assert.equal((await h.send(10,'RETURN')).ok,true);assert.equal(h.tabMap.get(1).active,true);
  assert.equal((await h.send(11,'RETURN')).ok,true);assert.equal(h.tabMap.get(2).active,true);
});
test('changed source is not activated; return loads saved source in the current tab',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');await h.visit(1,'root');await h.send(1,'OPEN_RESULT',{href:'https://example.com/a'});await h.visit(10,'result');
  h.tabMap.get(1).url='https://www.google.com/search?q=printer';await h.visit(1,'other');
  assert.equal((await h.send(10,'STATUS')).data.sourceOpen,false);
  assert.equal((await h.send(10,'RETURN')).ok,true);
  assert.equal(h.tabMap.get(1).url,'https://www.google.com/search?q=printer');
  assert.equal(h.tabMap.get(10).url,'https://www.google.com/search?q=air');
  await h.visit(10,'restored-root');
  assert.equal((await h.send(10,'TREE')).data.currentId,'root');
  assert.equal((await h.send(10,'LIST')).data.total,3);
});
test('visit log survives branching, repeated URLs, background recreation and tab closing',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');await h.visit(1);
  h.tabMap.get(1).url='https://example.com/a';await h.visit(1,'doc-a');await h.visit(1,'doc-a');
  h.tabMap.get(1).url='https://www.google.com/search?q=air';await h.visit(1);
  h.tabMap.get(1).url='https://example.com/b';await h.visit(1);
  assert.equal((await h.send(1,'LIST')).data.total,4);
  h.tabMap.delete(1);h.B.tabs.onRemoved.emit(1);
  const restart=harness(h.local);restart.add(1,'https://example.com/new');
  assert.equal((await restart.send(1,'LIST')).data.total,4);
});
test('parallel reports do not overwrite visits',async()=>{
  const h=harness();for(let i=1;i<=30;i++)h.add(i,'https://example.com/'+i);
  await Promise.all([...h.tabMap.keys()].map(i=>h.visit(i)));
  assert.equal((await h.send(1,'LIST')).data.total,30);
});
test('private tabs cannot record or read the normal visit log',async()=>{
  const h=harness();h.add(1,'https://example.com/a');h.add(2,'https://example.com/secret',{incognito:true});await h.visit(1);
  assert.equal((await h.visit(2)).ok,false);assert.equal((await h.send(2,'LIST')).ok,false);
  assert.equal((await h.send(1,'LIST')).data.total,1);
});
test('pause and site exclusions stop recording; deletions do not touch Safari',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.send(1,'SETTINGS',{paused:true});await h.visit(1);
  assert.equal((await h.send(1,'LIST')).data.total,0);await h.send(1,'SETTINGS',{paused:false});await h.send(1,'EXCLUDE');await h.visit(1);
  assert.equal((await h.send(1,'LIST')).data.total,0);await h.send(1,'EXCLUDE');await h.visit(1);
  const first=(await h.send(1,'LIST')).data.items[0];await h.send(1,'DELETE',{id:first.id});assert.equal((await h.send(1,'LIST')).data.total,0);
});
test('reused tab identifiers after restart cannot target an unrelated tab',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');await h.visit(1);await h.send(1,'OPEN_RESULT',{href:'https://example.com/a'});await h.visit(10);
  const item=(await h.send(10,'LIST')).data.items.find(x=>x.url==='https://example.com/a');
  const restarted=harness(h.local);restarted.add(1,'https://www.google.com/search?q=air');restarted.add(2,'https://example.com/other');await restarted.visit(1);
  await restarted.send(2,'OPEN_VISIT',{id:item.id});await restarted.visit(10,'reopened');assert.equal((await restarted.send(10,'STATUS')).data.sourceOpen,false);assert.equal((await restarted.send(10,'RETURN')).ok,true);assert.equal(restarted.tabMap.get(1).active,undefined);
});
test('untrusted URL messages and non-web protocols do not create visits or tabs',async()=>{
  const h=harness();h.add(1,'https://example.com/real');await h.send(1,'VISIT',{url:'https://example.com/fake',navigationId:'fake'});
  assert.equal((await h.send(1,'LIST')).data.total,0);
  h.add(2,'https://www.google.com/search?q=x');assert.equal((await h.send(2,'OPEN_RESULT',{href:'javascript:alert(1)'})).ok,false);
});
test('storage failure is returned instead of claiming that a page was saved',async()=>{
  const h=harness();h.add(1,'https://example.com/a');h.B.storage.local.set=async()=>{throw Error('Quota exceeded');};
  const result=await h.visit(1);assert.equal(result.ok,false);assert.match(result.error,/Quota/);
});
test('a retry after session-state failure does not append a duplicate visit',async()=>{
  const h=harness();h.add(1,'https://example.com/a');const original=h.B.storage.session.set;let fail=true;
  h.B.storage.session.set=async data=>{if(fail){fail=false;throw Error('Temporary state write failure');}return original(data);};
  assert.equal((await h.visit(1,'retry-document')).ok,false);
  assert.equal((await h.visit(1,'retry-document')).ok,true);
  assert.equal((await h.send(1,'LIST')).data.total,1);
});
test('a child tab links to its immediate opener with the original search in its ancestry',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');await h.visit(1);await h.send(1,'OPEN_RESULT',{href:'https://example.com/a'});await h.visit(10);
  h.add(20,'https://example.com/details',{openerTabId:10});h.B.tabs.onCreated.emit(h.tabMap.get(20));await h.visit(20);
  assert.equal((await h.send(20,'STATUS')).data.source.url,'https://example.com/a');const t=(await h.send(20,'TREE')).data;assert.equal(t.ancestors[0].url,'https://www.google.com/search?q=air');assert.equal(t.ancestors.length,3);
});
async function follow(h,tabId,url,navId){
  const source=h.tabMap.get(tabId).url;
  const s=h.session['tab:'+tabId];
  await h.send(tabId,'LINK_INTENT',{href:url,navigationId:s.navigationId});
  h.tabMap.get(tabId).url=url;
  const result=await h.visit(tabId,navId,{referrer:source,kind:'load'});assert.equal(result.ok,true,result.error);
}
test('any website supports same-tab source returns and branching without cycles',async()=>{
  const h=harness();h.add(1,'https://news.example/list');await h.visit(1,'a');
  await follow(h,1,'https://news.example/article','b');
  await follow(h,1,'https://other.example/details','c');
  assert.equal((await h.send(1,'STATUS')).data.source.id,'b');
  h.tabMap.get(1).url='https://news.example/list';await h.visit(1,'a',{kind:'traverse'});
  await follow(h,1,'https://news.example/second','d');
  const t=(await h.send(1,'TREE')).data;
  assert.deepEqual(Array.from(t.ancestors,n=>n.id),['a','d']);
  assert.equal(t.items.find(n=>n.id==='c').parentId,'b');
  assert.equal(t.items.find(n=>n.id==='b').parentId,'a');
  assert.equal(t.items.length,4);
  await h.send(1,'RETURN');assert.equal(h.tabMap.get(1).url,'https://news.example/list');
  await h.visit(1,'new-load');assert.equal((await h.send(1,'TREE')).data.currentId,'a');
});
test('non-Google new-tab links preserve the exact source, including concurrent identical URLs',async()=>{
  const h=harness();h.add(1,'https://forum.example/thread');h.add(2,'https://forum.example/thread');
  await h.visit(1,'source1');await h.visit(2,'source2');
  await h.send(1,'OPEN_LINK',{href:'https://docs.example/a'});await h.send(2,'OPEN_LINK',{href:'https://docs.example/b'});
  await h.visit(10,'a');await h.visit(11,'b');
  assert.equal((await h.send(10,'STATUS')).data.source.id,'source1');
  assert.equal((await h.send(11,'STATUS')).data.source.id,'source2');
  await h.send(10,'RETURN');assert.equal(h.tabMap.get(1).active,true);assert.equal(h.tabMap.get(2).active,undefined);
});
test('closed generic source is loaded without creating another tab',async()=>{
  const h=harness();h.add(1,'https://forum.example/thread');await h.visit(1,'root');
  await h.send(1,'OPEN_LINK',{href:'https://docs.example/a'});await h.visit(10,'a');
  h.tabMap.delete(1);h.B.tabs.onRemoved.emit(1);
  const result=await h.send(10,'RETURN');assert.equal(result.ok,true);assert.equal(h.tabMap.size,1);
  assert.equal(h.tabMap.get(10).url,'https://forum.example/thread');
});
test('address-bar navigation without evidence starts a separate root',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');
  h.tabMap.get(1).url='https://unrelated.example/b';await h.visit(1,'b',{kind:'load',referrer:''});
  assert.equal((await h.send(1,'STATUS')).data.source,null);assert.equal((await h.send(1,'TREE')).data.total,1);
});
test('new document back traversal reuses an unambiguous saved entry',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');await follow(h,1,'https://example.com/b','b');
  h.tabMap.get(1).url='https://example.com/a';await h.visit(1,'new-doc',{kind:'traverse'});
  assert.equal((await h.send(1,'TREE')).data.currentId,'a');assert.equal((await h.send(1,'LIST')).data.total,2);
});
test('ambiguous traversal with repeated URLs does not invent ancestry',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');
  await follow(h,1,'https://example.com/b','b');await follow(h,1,'https://example.com/a','a2');await follow(h,1,'https://example.com/c','c');
  h.tabMap.get(1).url='https://example.com/a';await h.visit(1,'unknown',{kind:'traverse'});
  assert.equal((await h.send(1,'STATUS')).data.source,null);
});
test('SPA route and restored document maintain their path',async()=>{
  const h=harness();h.add(1,'https://spa.example/a');await h.visit(1,'a');
  h.tabMap.get(1).url='https://spa.example/b';await h.visit(1,'b',{kind:'route'});
  h.tabMap.get(1).url='https://spa.example/c';await h.visit(1,'c',{kind:'route'});
  h.tabMap.get(1).url='https://spa.example/b';await h.visit(1,'b',{kind:'traverse'});
  assert.equal((await h.send(1,'STATUS')).data.source.id,'a');
  assert.equal((await h.send(1,'TREE')).data.total,3);
});
test('deleted parents are indicated; clear removes all paths and live mappings',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');await follow(h,1,'https://example.com/b','b');
  await h.send(1,'DELETE',{id:'a'});assert.equal((await h.send(1,'TREE')).data.missingParent,true);
  assert.equal((await h.send(1,'RETURN')).data.none,true);
  await h.send(1,'CLEAR');assert.equal((await h.send(1,'LIST')).data.total,0);assert.equal((await h.send(1,'TREE')).data.items.length,0);
});
test('private tabs cannot read paths or change settings',async()=>{
  const h=harness();h.add(1,'https://private.example',{incognito:true});
  for(const type of ['TREE','GO_NODE','SETTINGS','EXPORT'])assert.equal((await h.send(1,type,{id:'a',placement:'top-left'})).ok,false);
  assert.equal(h.local.settings,undefined);
});
test('placement is validated and preserved across background recreation',async()=>{
  const h=harness();h.add(1,'https://example.com');await h.send(1,'SETTINGS',{placement:'bottom-left',clearance:24});
  await h.send(1,'SETTINGS',{placement:'invalid',clearance:9999});
  const r=harness(h.local);r.add(1,'https://example.com');const s=(await r.send(1,'STATUS')).data.settings;
  assert.equal(s.placement,'bottom-left');assert.equal(s.clearance,120);assert.equal(s.paused,false);
});
test('version 0.1 history remains readable without fabricated tree links',async()=>{
  const h=harness({'visit:legacy':{id:'legacy',url:'https://example.com/old',title:'Old page',at:1,source:{url:'https://google.com/search?q=x'}}});h.add(1,'https://example.com/new');await h.visit(1,'new');
  assert.equal((await h.send(1,'LIST')).data.total,2);assert.equal((await h.send(1,'TREE')).data.total,1);
  await h.send(1,'OPEN_VISIT',{id:'legacy'});await h.visit(10,'old-reopened');assert.equal((await h.send(10,'STATUS')).data.source,null);
});
test('excluded or paused pages do not link future pages to a stale source',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');await h.send(1,'SETTINGS',{paused:true});
  h.tabMap.get(1).url='https://example.com/private';await h.visit(1,'private');await h.send(1,'SETTINGS',{paused:false});
  h.tabMap.get(1).url='https://example.com/b';await h.visit(1,'b',{referrer:'https://example.com/private'});
  assert.equal((await h.send(1,'STATUS')).data.source,null);assert.equal((await h.send(1,'LIST')).data.total,2);
});
test('same-tab click captured during navigation still links to its sending document',async()=>{
  const h=harness();h.add(1,'https://example.com/source');await h.visit(1,'source');
  h.tabMap.get(1).url='https://other.example/destination';
  const r=await h.B.runtime.onMessage.listeners[0]({type:'LINK_INTENT',href:'https://other.example/destination',navigationId:'source'},{tab:{id:1},frameId:0,url:'https://example.com/source'});
  assert.equal(r.ok,true);await h.visit(1,'dest',{referrer:'https://example.com/'});
  assert.equal((await h.send(1,'STATUS')).data.source.id,'source');
});
test('a managed new-tab redirect retains its known opener',async()=>{
  const h=harness();h.add(1,'https://forum.example/thread');await h.visit(1,'source');
  await h.send(1,'OPEN_LINK',{href:'https://redirect.example/go'});h.tabMap.get(10).url='https://destination.example/article';await h.visit(10,'destination');
  assert.equal((await h.send(10,'STATUS')).data.source.id,'source');
});
test('history pages by cursor without repeats and search stops after one page',async()=>{
  const h=harness();h.add(1,'https://example.com/start');
  for(let i=0;i<250;i++){h.tabMap.get(1).url='https://example.com/p'+i;h.tabMap.get(1).title=i%2?'odd '+i:'even '+i;await h.visit(1,'n'+i,{kind:'load',referrer:''});}
  const seen=new Set();let page=(await h.send(1,'LIST')).data;
  assert.equal(page.total,250);assert.equal(page.items.length,100);assert.equal(page.more,true);
  while(true){for(const v of page.items){assert.ok(!seen.has(v.id));seen.add(v.id);}if(!page.more)break;page=(await h.send(1,'LIST',{cursor:page.cursor})).data;}
  assert.equal(seen.size,250);
  const odd=(await h.send(1,'LIST',{query:'ODD'})).data;assert.equal(odd.items.length,100);assert.equal(odd.more,true);
  assert.ok(odd.items.every(v=>v.title.startsWith('odd')));
  const one=(await h.send(1,'LIST',{query:'p249'})).data;assert.equal(one.items.length,1);assert.equal(one.more,false);
});
test('title updates and deletions keep the history index in step',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');
  await h.send(1,'TITLE',{title:'Renamed page',navigationId:'a'});
  assert.equal((await h.send(1,'LIST',{query:'renamed'})).data.items.length,1);
  await h.send(1,'DELETE',{id:'a'});const l=(await h.send(1,'LIST')).data;assert.equal(l.total,0);assert.equal(l.items.length,0);
  assert.equal(Object.keys(h.local).filter(k=>k.startsWith('day:')).length,0);
});
test('existing history is indexed once on upgrade, including 0.2 trails',async()=>{
  const local={
    'visit:r':{id:'r',url:'https://example.com/r',title:'Root',at:1000,parentId:null,rootId:'r',graphVersion:2},
    'visit:k':{id:'k',url:'https://example.com/k',title:'Kid',at:2000,parentId:'r',rootId:'r',graphVersion:2},
    'visit:old':{id:'old',url:'https://example.com/old',title:'Old',at:500}
  };
  const h=harness(local);h.tabMap.set(1,{id:1,url:'https://example.com/k',title:'Kid',incognito:false});
  h.session['tab:1']={token:'t',url:'https://example.com/k',navigationId:'k',currentId:'k',documents:{k:'k'}};
  const l=(await h.send(1,'LIST')).data;assert.equal(l.total,3);assert.deepEqual(Array.from(l.items,v=>v.id),['k','r','old']);
  const t=(await h.send(1,'TREE')).data;assert.deepEqual(Array.from(t.ancestors,n=>n.id),['r','k']);
  assert.equal((await h.send(1,'STATUS')).data.source.id,'r');
  assert.ok(h.local.idx);
});
test('long trails are split into bounded segments and the tree stays bounded',async()=>{
  const h=harness();h.add(1,'https://spa.example/0');await h.visit(1,'s0');
  for(let i=1;i<700;i++){h.tabMap.get(1).url='https://spa.example/'+i;await h.visit(1,'s'+i,{kind:'route'});}
  const segs=Object.entries(h.local).filter(([k])=>k.startsWith('seg:'));
  assert.ok(segs.length>=3);assert.ok(segs.every(([,s])=>s.ids.length<=250));
  const t=(await h.send(1,'TREE')).data;
  assert.equal(t.currentId,'s699');assert.ok(t.items.length<=300);assert.ok(t.ancestors.length<=150);assert.equal(t.hidden,true);
  assert.equal((await h.send(1,'STATUS')).data.source.id,'s698');
  const st=h.session['tab:1'];assert.ok(st.stack.length<=100);assert.ok(Object.keys(st.documents).length<=100);
});
test('a tap with no source reports it without an error',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');
  const r=await h.send(1,'RETURN');assert.equal(r.ok,true);assert.equal(r.data.none,true);
});
test('lite status skips the source lookup',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');
  const d=(await h.send(1,'STATUS',{lite:true})).data;assert.equal(d.source,undefined);assert.equal(d.settings.placement,'bottom-right');
});


test('upgrade splits 1500-node trails and daily history into bounded chunks',async()=>{
  const local={idx:{v:1,days:[0],count:1500}};
  for(let i=0;i<1500;i++)local['visit:m'+i]={id:'m'+i,url:'https://example.com/'+i,title:'page '+i,at:1000+i,parentId:i?'m'+(i-1):null,rootId:'m0',graphVersion:2};
  const h=harness(local);h.add(1,'https://example.com/1499');h.session['tab:1']={token:'t',url:'https://example.com/1499',navigationId:'m1499',currentId:'m1499',documents:{m1499:'m1499'}};
  assert.equal((await h.send(1,'LIST')).data.total,1500);
  assert.ok(Object.entries(h.local).filter(([k])=>k.startsWith('seg:')).every(([,s])=>s.ids.length<=250));
  assert.ok(Object.entries(h.local).filter(([k,v])=>k.startsWith('day:')&&Array.isArray(v)).every(([,v])=>v.length<=250));
  let maxRead=0;const get=h.B.storage.local.get;h.B.storage.local.get=async keys=>{if(Array.isArray(keys))maxRead=Math.max(maxRead,keys.filter(k=>k.startsWith('visit:')).length);return get(keys);};
  const t=(await h.send(1,'TREE')).data;assert.ok(maxRead<=1000);assert.equal(t.hidden,true);assert.ok(t.earlierId);
  const older=(await h.send(1,'TREE',{focusId:t.earlierId})).data;assert.ok(older.ancestors.some(n=>n.id===t.earlierId));
});
test('delete interruption recovers after background restart without double decrement',async()=>{
  const h=harness();for(let i=0;i<4;i++){h.add(1,'https://example.com/'+i);await h.visit(1,'n'+i);}
  const remove=h.B.storage.local.remove;let fail=true;h.B.storage.local.remove=async keys=>{if(fail){fail=false;throw Error('Interrupted');}return remove(keys);};
  assert.equal((await h.send(1,'DELETE',{id:'n1'})).ok,false);
  const restarted=harness(h.local);restarted.add(1,'https://example.com/3');
  assert.equal((await restarted.send(1,'DELETE',{id:'n1'})).ok,true);
  const list=(await restarted.send(1,'LIST')).data;assert.equal(list.total,3);assert.equal(list.items.length,3);assert.equal(h.local.pendingDelete,undefined);
});
test('truncated tab memory never confuses an old repeated URL with its newer occurrence',async()=>{
  const h=harness();h.add(1,'https://example.com/origin');await h.visit(1,'origin');
  for(let i=1;i<=120;i++){h.tabMap.get(1).url=(i===1||i===70)?'https://example.com/repeated':'https://example.com/p'+i;await h.visit(1,'n'+i,{kind:'route'});}
  h.tabMap.get(1).url='https://example.com/repeated';await h.visit(1,'old-reload',{kind:'traverse'});
  assert.equal((await h.send(1,'TREE')).data.currentId,'old-reload');assert.equal((await h.send(1,'STATUS')).data.source,null);
  // Exact identity still restores an old node even after its transient mapping was evicted.
  await h.visit(1,'n1',{kind:'traverse'});assert.equal((await h.send(1,'STATUS')).data.source.id,'origin');
});
test('wide partial trees are labelled and all branches remain accessible by paged trail history',async()=>{
  const h=harness();h.add(1,'https://example.com/root');await h.visit(1,'root');
  for(let i=1;i<=1100;i++){h.tabMap.get(1).url='https://example.com/root';await h.visit(1,'root',{kind:'traverse'});h.tabMap.get(1).url='https://example.com/child'+i;await h.visit(1,'kid'+i,{kind:'route'});}
  h.tabMap.get(1).url='https://example.com/root';await h.visit(1,'root',{kind:'traverse'});
  const t=(await h.send(1,'TREE')).data;assert.equal(t.partial,true);assert.ok(t.total<1101);
  const seen=new Set();let cursor=null;
  do{const r=(await h.send(1,'LIST',{rootId:t.rootId,cursor})).data;for(const n of r.items){assert.ok(!seen.has(n.id));seen.add(n.id);}cursor=r.more?r.cursor:null;}while(cursor);
  assert.equal(seen.size,1101);
});
test('bookmarks deduplicate, survive deleted history and reopen without stale ancestry',async()=>{
  const h=harness();h.add(1,'https://example.com/book');await h.visit(1,'book');await h.send(1,'BOOKMARK_SAVE');await h.send(1,'BOOKMARK_SAVE');
  const items=(await h.send(1,'BOOKMARKS')).data.items;assert.equal(items.length,1);
  await h.send(1,'CLEAR');assert.equal((await h.send(1,'BOOKMARKS')).data.items.length,1);
  assert.equal((await h.send(1,'BOOKMARK_OPEN',{id:items[0].id})).ok,true);assert.equal(h.tabMap.get(10).url,'https://example.com/book');
  await h.send(1,'BOOKMARK_DELETE',{id:items[0].id});assert.equal((await h.send(1,'BOOKMARKS')).data.items.length,0);
});
test('backup restore is additive, repeatable, rejects dangerous URLs and preserves bookmarks',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');h.tabMap.get(1).url='https://example.com/b';await h.visit(1,'b',{kind:'route'});await h.send(1,'BOOKMARK_SAVE');
  const backup=(await h.send(1,'EXPORT')).data;await h.send(1,'CLEAR');
  assert.equal((await h.send(1,'IMPORT',{data:backup})).data.added,2);assert.equal((await h.send(1,'IMPORT',{data:backup})).data.added,0);
  assert.equal((await h.send(1,'BOOKMARKS')).data.items.length,1);await h.visit(1,'b',{kind:'traverse'});assert.equal((await h.send(1,'STATUS')).data.source.id,'a');
  backup.visits[0].url='javascript:alert(1)';assert.equal((await h.send(1,'IMPORT',{data:backup})).ok,false);assert.equal((await h.send(1,'LIST')).data.total,2);
});
test('private tabs cannot access bookmarks, import backups or repair indexes',async()=>{
  const h=harness();h.add(1,'https://example.com/secret',{incognito:true});
  for(const type of ['BOOKMARKS','BOOKMARK_SAVE','BOOKMARK_OPEN','BOOKMARK_DELETE','IMPORT','REPAIR'])assert.equal((await h.send(1,type)).ok,false);
});
test('history paging handles clock rollback and title edits across chunks',async()=>{
  const h=harness();h.add(1,'https://example.com/0');
  for(let i=0;i<600;i++){h.tabMap.get(1).url='https://example.com/'+i;await h.visit(1,'clock'+i);}
  await h.send(1,'TITLE',{navigationId:'clock599',title:'Unique revised title'});
  assert.equal((await h.send(1,'LIST',{query:'unique revised'})).data.items[0].id,'clock599');
  const backup=(await h.send(1,'EXPORT')).data;backup.visits.push({id:'older',at:1,url:'https://example.com/older',title:'Old clock',rootId:'older'});
  assert.equal((await h.send(1,'IMPORT',{data:backup})).ok,true);
  assert.equal((await h.send(1,'LIST',{query:'old clock'})).data.items[0].id,'older');
});

test('bookmarking a removed history row does not save the current page by mistake',async()=>{
  const h=harness();h.add(1,'https://example.com/current');await h.visit(1,'current');
  assert.equal((await h.send(1,'BOOKMARK_SAVE',{id:'missing'})).ok,false);assert.equal((await h.send(1,'BOOKMARKS')).data.items.length,0);
});
test('interrupted clear recovers after restart and preserves bookmarks',async()=>{
  const h=harness();h.add(1,'https://example.com/a');await h.visit(1,'a');await h.send(1,'BOOKMARK_SAVE');
  const remove=h.B.storage.local.remove;let once=true;h.B.storage.local.remove=async keys=>{if(once){once=false;throw Error('Interrupted');}return remove(keys);};
  assert.equal((await h.send(1,'CLEAR')).ok,false);const h2=harness(h.local);h2.add(1,'https://example.com/a');
  assert.equal((await h2.send(1,'LIST')).data.total,0);assert.equal((await h2.send(1,'BOOKMARKS')).data.items.length,1);
});
