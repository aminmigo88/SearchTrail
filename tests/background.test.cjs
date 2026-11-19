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
  async function visit(id,navigationId=webcrypto.randomUUID()){return send(id,'VISIT',{url:tabMap.get(id).url,title:tabMap.get(id).title,navigationId});}
  return {add,send,visit,tabMap,local,session,B};
}
test('two concurrent Google searches keep their own destinations',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');h.add(2,'https://www.google.com/search?q=printer');
  await Promise.all([h.visit(1),h.visit(2)]);
  const results=await Promise.all([h.send(1,'OPEN_RESULT',{href:'https://example.com/air'}),h.send(2,'OPEN_RESULT',{href:'https://example.com/printer'})]);
  assert.ok(results.every(x=>x.ok));await h.visit(10);await h.visit(11);
  assert.equal((await h.send(10,'STATUS')).data.source.tabId,1);
  assert.equal((await h.send(11,'STATUS')).data.source.tabId,2);
  assert.equal((await h.send(10,'RETURN')).ok,true);assert.equal(h.tabMap.get(1).active,true);
  assert.equal((await h.send(11,'RETURN')).ok,true);assert.equal(h.tabMap.get(2).active,true);
});
test('closed or repurposed source is never activated; reopen is explicit',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');await h.visit(1);await h.send(1,'OPEN_RESULT',{href:'https://example.com/a'});await h.visit(10);
  h.tabMap.get(1).url='https://www.google.com/search?q=printer';await h.visit(1);
  assert.equal((await h.send(10,'STATUS')).data.canReturn,false);
  assert.equal((await h.send(10,'RETURN')).ok,false);
  h.tabMap.delete(1);assert.equal((await h.send(10,'RETURN')).ok,false);
  assert.equal((await h.send(10,'REOPEN')).ok,true);assert.equal(h.tabMap.get(11).url,'https://www.google.com/search?q=air');
  assert.equal((await h.send(10,'STATUS')).data.canReturn,true);
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
  await restarted.send(2,'OPEN_VISIT',{id:item.id});assert.equal((await restarted.send(10,'STATUS')).data.canReturn,false);
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
test('a child tab inherits the search through a result tab when opener information exists',async()=>{
  const h=harness();h.add(1,'https://www.google.com/search?q=air');await h.visit(1);await h.send(1,'OPEN_RESULT',{href:'https://example.com/a'});await h.visit(10);
  h.add(20,'https://example.com/details',{openerTabId:10});h.B.tabs.onCreated.emit(h.tabMap.get(20));await h.visit(20);
  assert.equal((await h.send(20,'STATUS')).data.source.tabId,1);
});
