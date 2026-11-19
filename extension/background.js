/* One serialized writer: graph nodes persist; tab/document mappings are session-only.
   Indexes are split into small keys so cost per action does not grow with total history:
   day:<n>  = [[id,at,title,url]] for one UTC day (History list and search, newest first)
   seg:<id> = {ids,parent,kids,open} a trail segment of at most SEG nodes (tree view)
   idx      = {v,days,count} list of day buckets and total visit count */
"use strict";
const B = browser, C = SearchTrailCore, L = B.storage.local;
const DEFAULTS = {paused:false, interceptGoogle:true, excludedHosts:[], placement:"bottom-right", clearance:16};
const SEG = 250, TREE_BUDGET = 1000, TREE_SHOW = 300, MAX_ANCESTORS = 150, TAB_MEMORY = 100, PAGE = 100;
let work = Promise.resolve(), cachedSettings = null, indexed = false;
const explicitTabs = new Set();
function queue(fn) { const next=work.then(fn); work=next.catch(()=>{}); return next; }
const stateKey = n => "tab:"+n;
const nodeKey = n => "visit:"+n;
const dayOf = at => Math.floor((Number(at)||0)/864e5);
const segOf = n => n.seg || n.rootId || n.id;
const row = n => [n.id, Number(n.at)||0, String(n.title||""), n.url];
const id = () => crypto.randomUUID();
async function state(tabId) {
  if (!B.storage.session) throw Error("SearchTrail requires Safari 16.4 or newer.");
  return (await B.storage.session.get(stateKey(tabId)))[stateKey(tabId)] || {};
}
async function putState(tabId,s) { await B.storage.session.set({[stateKey(tabId)]:s}); }
async function settings() { return cachedSettings ||= {...DEFAULTS,...(await L.get("settings")).settings}; }
async function saveSettings(next) { await L.set({settings:next}); cachedSettings=next; }
B.storage.onChanged?.addListener((changes,area)=>{ if(area==="local" && changes.settings) cachedSettings=null; });
async function node(nodeId) {return nodeId ? (await L.get(nodeKey(nodeId)))[nodeKey(nodeId)] || null : null;}
async function nodes(ids) {
  const keys=[...new Set(ids.filter(Boolean))].map(nodeKey), out=new Map();
  if(!keys.length) return out;
  for(const v of Object.values(await L.get(keys))) if(v?.id) out.set(v.id,v);
  return out;
}
async function safeTab(tabId) {
  const tab=await B.tabs.get(tabId);
  if(tab.incognito || B.extension?.inIncognitoContext) throw Error("SearchTrail is off in Private Browsing.");
  return tab;
}
function sameURL(a,b) { return !!C.webURL(a) && C.webURL(a)===C.webURL(b); }
async function currentNode(tab,s) {
  const n=await node(s.currentId);
  return n && sameURL(n.url,tab.url) && sameURL(s.url,tab.url) ? n : null;
}
// Full scan: used only for one-time index migration and export.
async function allVisits() {
  const values=await L.get(null);
  return Object.entries(values).filter(([k,v])=>k.startsWith("visit:") && v?.id && C.webURL(v.url)).map(([,v])=>v)
    .sort((a,b)=>(b.lastAt||b.at)-(a.lastAt||a.at) || b.id.localeCompare(a.id));
}
async function ensureIndex() {
  if(indexed) return;
  if((await L.get("idx")).idx) {indexed=true;return;}
  const visits=await allVisits(), out={}, days=new Set();
  for(const v of [...visits].reverse()) {
    const d=dayOf(v.at);days.add(d);(out["day:"+d] ||= []).push(row(v));
    (out["seg:"+segOf(v)] ||= {ids:[],parent:null,kids:[]}).ids.push(v.id);
  }
  out.idx={v:1,days:[...days].sort((a,b)=>b-a),count:visits.length};
  await L.set(out);indexed=true;
}
// Adds a node and its index entries in one write. Cost depends on one day and one segment only.
async function addNode(n,parent) {
  const d=dayOf(n.at), dk="day:"+d, pseg=parent ? segOf(parent) : null;
  const got=await L.get(["idx",dk,...(pseg?["seg:"+pseg]:[])]);
  const idx=got.idx||{v:1,days:[],count:0}, bucket=got[dk]||[], out={};
  bucket.push(row(n));out[dk]=bucket;
  if(!idx.days.includes(d)) {idx.days.push(d);idx.days.sort((a,b)=>b-a);}
  idx.count++;out.idx=idx;
  let ps=pseg ? got["seg:"+pseg] : null, sid=null;
  if(ps && ps.ids.length<SEG) {sid=pseg;ps.ids.push(n.id);out["seg:"+sid]=ps;}
  else if(ps) {
    // Full segment: continue in its open overflow segment, or start a new one.
    const tail=ps.open ? (await L.get("seg:"+ps.open))["seg:"+ps.open] : null;
    if(tail && tail.ids.length<SEG) {sid=ps.open;tail.ids.push(n.id);out["seg:"+sid]=tail;}
    else {sid=n.id;out["seg:"+sid]={ids:[n.id],parent:pseg,kids:[]};ps.kids.push(sid);ps.open=sid;out["seg:"+pseg]=ps;}
  } else {sid=n.id;out["seg:"+sid]={ids:[n.id],parent:null,kids:[]};}
  n.seg=sid;out[nodeKey(n.id)]=n;
  await L.set(out);
}
async function removeNode(n) {
  const dk="day:"+dayOf(n.at), sk="seg:"+segOf(n), got=await L.get(["idx",dk,sk]), out={}, gone=[nodeKey(n.id)];
  const idx=got.idx;
  if(got[dk]) {
    const bucket=got[dk].filter(r=>r[0]!==n.id);
    if(bucket.length) out[dk]=bucket;
    else {gone.push(dk);if(idx)idx.days=idx.days.filter(x=>x!==dayOf(n.at));}
  }
  if(idx) {idx.count=Math.max(0,idx.count-1);out.idx=idx;}
  if(got[sk]) {got[sk].ids=got[sk].ids.filter(x=>x!==n.id);out[sk]=got[sk];}
  await L.set(out);await L.remove(gone);
}
async function liveTab(n,preferred) {
  const values=await B.storage.session.get(null);
  const candidates=Object.entries(values).filter(([k,s])=>k.startsWith("tab:") && s.currentId===n.id && sameURL(s.url,n.url));
  candidates.sort(([a],[b])=>Number(b===stateKey(preferred))-Number(a===stateKey(preferred)));
  for(const [key,s] of candidates) {
    try {
      const t=await safeTab(Number(key.slice(4)));
      if(s.token && sameURL(t.url,n.url)) return t;
    } catch {}
  }
  return null;
}
async function sourceStatus(tab,s) {
  const current=await currentNode(tab,s), source=await node(current?.parentId);
  return {currentId:current?.id||null,source,canReturn:!!source,sourceOpen:source ? !!await liveTab(source,tab.id) : false};
}
async function newTab(url,parentId=null,restoreId=null) {
  const created=await B.tabs.create({url,active:true});
  if(created.incognito) throw Error("SearchTrail is off in Private Browsing.");
  explicitTabs.add(created.id);
  await putState(created.id,{token:id(),pending:{url,parentId,restoreId,opener:!!parentId,at:Date.now()},documents:{}});
  return created;
}
async function goNode(tab,s,n,{newWindow=false}={}) {
  const live=await liveTab(n,tab.id);
  if(live) {await B.tabs.update(live.id,{active:true});return {activated:true};}
  if(newWindow) {await newTab(n.url,null,n.id);return {opened:true};}
  // Source has closed or changed: load its saved address in the current tab.
  // The old document mapping is retained so a native Back returns to its own node.
  const next={...s,pending:{url:n.url,restoreId:n.id,at:Date.now()}};
  await putState(tab.id,next);
  try {await B.tabs.update(tab.id,{url:n.url,active:true});}
  catch(e) {await putState(tab.id,s);throw e;}
  return {loaded:true};
}
// Loads only the current trail segment, a few ancestor segments and nearby child
// segments (at most TREE_BUDGET nodes), so the tree costs the same however large history grows.
async function treeFor(currentId) {
  const empty={items:[],ancestors:[],currentId:null,total:0};
  const cur=await node(currentId);if(!cur)return empty;
  const segs=new Map();let sid=segOf(cur),size=0;
  while(sid && !segs.has(sid) && segs.size<3) {
    const s=(await L.get("seg:"+sid))["seg:"+sid];if(!s)break;
    segs.set(sid,s);size+=s.ids.length;sid=s.parent;
  }
  let frontier=[...segs.values()].flatMap(s=>s.kids||[]).filter(k=>!segs.has(k));
  while(frontier.length && size<TREE_BUDGET) {
    const got=await L.get(frontier.map(k=>"seg:"+k)), next=[];
    for(const k of frontier) {
      const s=got["seg:"+k];if(!s || segs.has(k) || size>=TREE_BUDGET)continue;
      segs.set(k,s);size+=s.ids.length;next.push(...(s.kids||[]));
    }
    frontier=next.filter(k=>!segs.has(k));
  }
  const byId=await nodes([...segs.values()].flatMap(s=>s.ids));byId.set(cur.id,cur);
  let ancestors=[], seen=new Set(), n=cur, missingParent=false, hidden=false;
  while(n && !seen.has(n.id)) {seen.add(n.id);ancestors.unshift(n);n=byId.get(n.parentId);}
  const top=ancestors[0];
  if(top.parentId && !seen.has(top.parentId)) {if(await node(top.parentId))hidden=true;else missingParent=true;}
  if(ancestors.length>MAX_ANCESTORS) {ancestors=ancestors.slice(-MAX_ANCESTORS);hidden=true;missingParent=false;}
  const children=new Map();
  for(const item of byId.values()) {if(!children.has(item.parentId))children.set(item.parentId,[]);children.get(item.parentId).push(item);}
  const selected=new Map(ancestors.map(a=>[a.id,a])), pending=[ancestors[0]], visited=new Set(); let total=0;
  while(pending.length) {
    const item=pending.pop();if(visited.has(item.id))continue;visited.add(item.id);total++;
    if(selected.size<TREE_SHOW)selected.set(item.id,item);
    pending.push(...(children.get(item.id)||[]));
  }
  return {items:[...selected.values()],ancestors,currentId,total,missingParent,hidden};
}
// Pages through day buckets newest first; stops as soon as one page is filled.
async function listVisits(message) {
  const {idx}=await L.get("idx"), q=String(message.query||"").toLowerCase().slice(0,500);
  const c=Array.isArray(message.cursor) && Number.isFinite(message.cursor[0]) ? [message.cursor[0],String(message.cursor[1])] : null;
  const days=(idx?.days||[]).filter(d=>!c || d<=dayOf(c[0]));
  const out=[];let more=false;
  // Read one day first and widen only while the page is not yet full.
  for(let i=0,step=1;i<days.length && !more;i+=step,step=Math.min(step*2,16)) {
    const keys=days.slice(i,i+step).map(d=>"day:"+d), got=await L.get(keys);
    for(const k of keys) {
      const rows=(got[k]||[]).slice().sort((a,b)=>b[1]-a[1] || (b[0]>a[0]?1:b[0]<a[0]?-1:0));
      for(const r of rows) {
        if(c && (r[1]>c[0] || (r[1]===c[0] && r[0]>=c[1])))continue;
        if(q && !(r[2]+" "+r[3]).toLowerCase().includes(q))continue;
        if(out.length===PAGE) {more=true;break;}
        out.push(r);
      }
      if(more)break;
    }
  }
  const last=out[out.length-1];
  return {items:out.map(([id,at,title,url])=>({id,at,title,url})),total:idx?.count||0,more,cursor:last?[last[1],last[0]]:null};
}
function trimTabMemory(docs,stack,index) {
  const entries=Object.entries(docs);
  if(entries.length>TAB_MEMORY)docs=Object.fromEntries(entries.slice(-TAB_MEMORY));
  if(stack.length>TAB_MEMORY) {const cut=stack.length-TAB_MEMORY;stack.splice(0,cut);index=Math.max(0,index-cut);}
  return {docs,stack,index};
}
async function handle(message,sender) {
  if(!message || typeof message.type!=="string")throw Error("Invalid request.");
  const fromPage=!!sender.tab,tabId=fromPage?sender.tab.id:message.tabId;
  if(!Number.isInteger(tabId))throw Error("Open SearchTrail on a normal website first.");
  const tab=await safeTab(tabId);
  if(fromPage && sender.frameId && sender.frameId!==0)throw Error("Top frame only.");
  await ensureIndex();
  const opt=await settings();let s=await state(tabId);
  switch(message.type) {
    case "STATUS": {
      const base={settings:opt,host:C.webURL(tab.url)?new URL(tab.url).hostname:"",excluded:C.excluded(tab.url,opt.excludedHosts)};
      return message.lite ? base : {...await sourceStatus(tab,s),...base};
    }
    case "VISIT": {
      if(!fromPage || typeof message.navigationId!=="string" || !/^[a-zA-Z0-9-]{1,100}$/.test(message.navigationId))throw Error("Invalid visit.");
      const url=C.webURL(message.url);if(!url || !sameURL(url,tab.url))return {recorded:false,accepted:false};
      if(opt.paused || C.excluded(url,opt.excludedHosts)) {
        await putState(tabId,{token:s.token||id(),url,navigationId:message.navigationId,currentId:null,documents:{}});
        return {recorded:false};
      }
      const fresh=s.pending && Date.now()-s.pending.at<30000 ? s.pending : null;
      const docId=s.documents?.[message.navigationId] || message.navigationId;
      const known=await nodes([s.currentId,docId,fresh?.restoreId,fresh?.parentId]);
      const previous=known.get(s.currentId)||null;
      if(s.navigationId===message.navigationId && sameURL(s.url,url) && previous)return {recorded:true};
      let saved=known.get(docId)||null;
      if(saved && !sameURL(saved.url,url))saved=null;
      if(!saved && fresh?.restoreId && sameURL(fresh.url,url))saved=known.get(fresh.restoreId)||null;
      if(!saved && message.kind==="reload" && sameURL(previous?.url,url))saved=previous;
      // A back/forward reload can lose its content-script identity. Reuse only an
      // unambiguous entry in this tab's known traversal stack; never guess globally.
      if(!saved && message.kind==="traverse") {
        const stacked=await nodes(s.stack||[]);
        const candidates=[...new Set(s.stack||[])].map(x=>stacked.get(x)).filter(item=>item && sameURL(item.url,url));
        if(candidates.length===1)saved=candidates[0];
      }
      if(!saved) {
        let parent=null;
        if(fresh?.parentId && (sameURL(fresh.url,url) || fresh.opener))parent=known.get(fresh.parentId)||null;
        if(!parent && previous && message.kind!=="traverse" && message.kind!=="reload") {
          if(message.kind==="route" || sameURL(message.referrer,previous.url))parent=previous;
        }
        // onCreated may not be delivered before the first content message.
        if(!parent && !s.navigationId && Number.isInteger(tab.openerTabId) && tab.openerTabId!==tabId) {
          try {const p=await safeTab(tab.openerTabId);parent=await currentNode(p,await state(p.id));}catch{}
        }
        if(parent && C.excluded(parent.url,opt.excludedHosts))parent=null;
        saved={id:message.navigationId,url,title:String(message.title||tab.title||url).slice(0,1000),at:Date.now(),parentId:parent?.id||null,rootId:parent?.rootId||parent?.id||message.navigationId,graphVersion:2};
        // Node and index are written together. Retry by navigationId is idempotent if session write fails.
        await addNode(saved,parent);
      }
      const stack=[...(s.stack||[])];const at=stack.indexOf(saved.id);
      let index;
      if(at>=0)index=at;
      else {stack.splice((s.index??(stack.length-1))+1);stack.push(saved.id);index=stack.length-1;}
      const kept=trimTabMemory({...(s.documents||{}),[message.navigationId]:saved.id},stack,index);
      s={token:s.token||id(),url,navigationId:message.navigationId,currentId:saved.id,documents:kept.docs,stack:kept.stack,index:kept.index};
      await putState(tabId,s);
      return {recorded:true,currentId:saved.id};
    }
    case "TITLE": {
      if(!fromPage || opt.paused || C.excluded(tab.url,opt.excludedHosts) || s.navigationId!==message.navigationId)return {};
      const n=await currentNode(tab,s);if(!n)return {};
      const title=String(message.title||n.title).slice(0,1000);if(title===n.title)return {};
      const dk="day:"+dayOf(n.at), bucket=(await L.get(dk))[dk], r=bucket?.find(x=>x[0]===n.id);
      if(r)r[2]=title;
      await L.set({[nodeKey(n.id)]:{...n,title},...(r?{[dk]:bucket}:{})});
      return {};
    }
    case "LINK_INTENT": {
      // tabs.get can already report the destination while this click message is
      // queued. The browser-supplied sender URL and document identity anchor it.
      if(!fromPage || opt.paused || C.excluded(s.url,opt.excludedHosts) || s.navigationId!==message.navigationId || !sameURL(sender.url,s.url))return {};
      const href=C.webURL(message.href), parent=await node(s.currentId);
      if(href && parent && !C.excluded(href,opt.excludedHosts))await putState(tabId,{...s,pending:{url:href,parentId:parent.id,at:Date.now()}});
      return {};
    }
    case "OPEN_RESULT":
    case "OPEN_LINK": {
      if(!fromPage || opt.paused || C.excluded(tab.url,opt.excludedHosts))throw Error("Link tracking is paused or excluded on this site.");
      const url=message.type==="OPEN_RESULT" && opt.interceptGoogle ? C.resultURL(message.href,tab.url) : message.type==="OPEN_LINK" ? C.webURL(message.href) : null;
      if(!url)throw Error("Unsupported link.");
      const parent=await currentNode(tab,s);
      await newTab(url,parent?.id||null);return {};
    }
    case "RETURN":
    case "REOPEN": {
      // One request per tap: no separate status check, and the source tab is looked up once.
      const current=await currentNode(tab,s), source=await node(current?.parentId);
      if(!source)return {none:true};
      return goNode(tab,s,source);
    }
    case "TREE": return treeFor((await currentNode(tab,s))?.id);
    case "GO_NODE": {
      const n=await node(String(message.id));if(!n)throw Error("This page is no longer saved.");
      return goNode(tab,s,n);
    }
    case "LIST": return listVisits(message);
    case "OPEN_VISIT": {
      const n=await node(String(message.id));if(!n)throw Error("This visit is no longer saved.");
      return goNode(tab,s,n,{newWindow:true});
    }
    case "DELETE": {const n=await node(String(message.id));if(n)await removeNode(n);return {};}
    case "CLEAR": {
      const values=await L.get(null);
      await L.remove(Object.keys(values).filter(k=>/^(visit|day|seg):/.test(k)));
      await L.set({idx:{v:1,days:[],count:0}});
      await B.storage.session.clear();return {};
    }
    case "EXPORT": return {format:"SearchTrail",version:2,exportedAt:new Date().toISOString(),visits:(await allVisits()).map(({seg,...v})=>v)};
    case "SETTINGS": {
      const patch={};
      for(const key of ["paused","interceptGoogle"])if(typeof message[key]==="boolean")patch[key]=message[key];
      if(["bottom-right","bottom-left","top-right","top-left"].includes(message.placement))patch.placement=message.placement;
      if(Number.isFinite(message.clearance))patch.clearance=Math.max(8,Math.min(120,Math.round(message.clearance)));
      await saveSettings({...opt,...patch});return {};
    }
    case "EXCLUDE": {
      if(!C.webURL(tab.url))throw Error("Open a website first.");
      const host=new URL(tab.url).hostname.toLowerCase();
      const hosts=opt.excludedHosts.includes(host)?opt.excludedHosts.filter(h=>h!==host):[...opt.excludedHosts,host];
      await saveSettings({...opt,excludedHosts:hosts});return {};
    }
    default:throw Error("Unknown action.");
  }
}
B.runtime.onMessage.addListener((m,s)=>queue(()=>handle(m,s)).then(data=>({ok:true,data}),e=>({ok:false,error:e.message||String(e)})));
B.tabs.onCreated.addListener(tab=>{
  if(tab.incognito)return;
  queue(async()=>{
    if(explicitTabs.delete(tab.id))return;
    let parent=null;
    if(Number.isInteger(tab.openerTabId))try {const p=await safeTab(tab.openerTabId);parent=await currentNode(p,await state(p.id));}catch{}
    await putState(tab.id,{token:id(),documents:{},pending:parent?{parentId:parent.id,opener:true,at:Date.now()}:null});
  }).catch(()=>{});
});
B.tabs.onRemoved.addListener(tabId=>queue(()=>B.storage.session?.remove(stateKey(tabId))).catch(()=>{}));
B.runtime.onStartup.addListener(()=>queue(()=>B.storage.session?.clear()).catch(()=>{}));
