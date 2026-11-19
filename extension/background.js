/* One serialized writer: graph nodes persist; tab/document mappings are session-only.
   Indexes are split into small keys to bound individual history and tree data chunks:
   day:<n>:<chunk> = at most 250 history rows; day:<n> holds chunk metadata
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
const row = n => [n.id, Number(n.at)||0, String(n.title||""), n.url, n.rootId||n.id];
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
// Rebuild derived indexes without deleting visits. The final version marker is written
// with the complete replacement, so an interrupted migration is safe to retry.
async function ensureIndex() {
  const {pendingDelete,pendingClear}=await L.get(["pendingDelete","pendingClear"]);
  if(pendingClear){
    const values=await L.get(null);await L.remove(Object.keys(values).filter(k=>/^(visit|day|seg):/.test(k)));
    await L.set({idx:{v:2,days:[],count:0}});await B.storage.session.clear();await L.remove("pendingClear");indexed=true;
  }
  if(pendingDelete) {
    await L.set(pendingDelete.out);await L.remove(pendingDelete.gone);await L.remove("pendingDelete");
  }
  if(indexed)return;
  if((await L.get("idx")).idx?.v===2){indexed=true;return;}
  const values=await L.get(null), visits=Object.entries(values).filter(([k,v])=>k.startsWith("visit:")&&v?.id&&C.webURL(v.url)).map(([,v])=>v);
  visits.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const out={idx:{v:2,days:[],count:visits.length}},groups=new Map();
  for(const v of visits){
    const d=dayOf(v.at),dk="day:"+d;
    if(!out[dk]){out[dk]={chunks:[]};out.idx.days.push(d);}
    const meta=out[dk];let chunk=meta.chunks.at(-1);
    if(!chunk||chunk.count>=SEG){chunk={key:dk+":"+meta.chunks.length,count:0,max:0};meta.chunks.push(chunk);out[chunk.key]=[];}
    v.bucket=chunk.key;out[chunk.key].push(row(v));chunk.count++;chunk.max=Math.max(chunk.max,Number(v.at)||0);
    const root=v.rootId||v.id;if(!groups.has(root))groups.set(root,[]);groups.get(root).push(v);
  }
  for(const [root,group]of groups){
    const ids=[];for(let i=0;i<group.length;i+=SEG)ids.push(group[i].id);
    for(let i=0;i<ids.length;i++){
      const part=group.slice(i*SEG,(i+1)*SEG),sid=ids[i];
      out["seg:"+sid]={ids:part.map(n=>n.id),parent:i?ids[i-1]:null,kids:i+1<ids.length?[ids[i+1]]:[],open:ids[i+1]||null};
      for(const v of part){v.seg=sid;out[nodeKey(v.id)]=v;}
    }
  }
  out.idx.days.sort((a,b)=>b-a);
  // Old unreachable index keys are harmless but can be removed before committing the
  // replacement; raw visit records are the durable source if this is interrupted.
  await L.remove(Object.keys(values).filter(k=>/^(day|seg):/.test(k)));
  await L.set(out);indexed=true;
}
async function addNode(n,parent) {
  const d=dayOf(n.at),dk="day:"+d,pseg=parent?segOf(parent):null;
  const got=await L.get(["idx",dk,...(pseg?["seg:"+pseg]:[])]);
  const idx=got.idx||{v:2,days:[],count:0},meta=got[dk]||{chunks:[]},out={};
  let chunk=meta.chunks.at(-1),bucket=[];
  if(chunk&&chunk.count<SEG)bucket=(await L.get(chunk.key))[chunk.key]||[];
  else {chunk={key:dk+":"+id(),count:0,max:0};meta.chunks.push(chunk);}
  n.bucket=chunk.key;bucket.push(row(n));chunk.count=bucket.length;chunk.max=Math.max(chunk.max,Number(n.at)||0);
  out[chunk.key]=bucket;out[dk]=meta;
  if(!idx.days.includes(d)){idx.days.push(d);idx.days.sort((a,b)=>b-a);}idx.count++;out.idx=idx;
  let ps=pseg?got["seg:"+pseg]:null,sid=null;
  if(ps&&ps.ids.length<SEG){sid=pseg;ps.ids.push(n.id);out["seg:"+sid]=ps;}
  else if(ps){
    const tail=ps.open?(await L.get("seg:"+ps.open))["seg:"+ps.open]:null;
    if(tail&&tail.ids.length<SEG){sid=ps.open;tail.ids.push(n.id);out["seg:"+sid]=tail;}
    else{sid=n.id;out["seg:"+sid]={ids:[n.id],parent:pseg,kids:[]};ps.kids.push(sid);ps.open=sid;out["seg:"+pseg]=ps;}
  }else{sid=n.id;out["seg:"+sid]={ids:[n.id],parent:null,kids:[]};}
  n.seg=sid;out[nodeKey(n.id)]=n;await L.set(out);
}
async function removeNode(n) {
  const dk="day:"+dayOf(n.at),sk="seg:"+segOf(n),got=await L.get(["idx",dk,sk,n.bucket]),out={},gone=[nodeKey(n.id)];
  const idx=got.idx,meta=got[dk],rows=(got[n.bucket]||[]).filter(r=>r[0]!==n.id);
  if(meta){
    const chunk=meta.chunks.find(c=>c.key===n.bucket);
    if(rows.length){out[n.bucket]=rows;if(chunk)chunk.count=rows.length;}
    else{gone.push(n.bucket);meta.chunks=meta.chunks.filter(c=>c.key!==n.bucket);}
    if(meta.chunks.length)out[dk]=meta;
    else{gone.push(dk);if(idx)idx.days=idx.days.filter(d=>d!==dayOf(n.at));}
  }
  if(idx){idx.count=Math.max(0,idx.count-1);out.idx=idx;}
  if(got[sk]){got[sk].ids=got[sk].ids.filter(x=>x!==n.id);out[sk]=got[sk];}
  // Write-ahead journal stores the absolute result. Recovery replays it, never decrements again.
  await L.set({pendingDelete:{out,gone}});
  await L.set(out);await L.remove(gone);await L.remove("pendingDelete");
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
async function treeFor(currentId,focusId) {
  const empty={items:[],ancestors:[],currentId:null,total:0};
  const cur=await node(focusId||currentId);if(!cur)return empty;
  const segs=new Map();let sid=segOf(cur),size=0;
  while(sid && !segs.has(sid) && segs.size<3) {
    const s=(await L.get("seg:"+sid))["seg:"+sid];if(!s)break;
    segs.set(sid,s);size+=s.ids.length;sid=s.parent;
  }
  let frontier=[...segs.values()].flatMap(s=>s.kids||[]).filter(k=>!segs.has(k));
  while(frontier.length && size<TREE_BUDGET) {
    const batch=frontier.slice(0,Math.max(1,Math.ceil((TREE_BUDGET-size)/SEG)));
    const got=await L.get(batch.map(k=>"seg:"+k)), next=frontier.slice(batch.length);
    for(const k of batch) {
      const s=got["seg:"+k];if(!s || segs.has(k) || size>=TREE_BUDGET)continue;
      segs.set(k,s);size+=s.ids.length;next.push(...(s.kids||[]));
    }
    frontier=next.filter(k=>!segs.has(k));
  }
  const byId=await nodes([...segs.values()].flatMap(s=>s.ids));byId.set(cur.id,cur);
  let ancestors=[], seen=new Set(), n=cur, missingParent=false, hidden=frontier.length>0;
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
  return {items:[...selected.values()],ancestors,currentId,total,missingParent,hidden,partial:hidden,rootId:cur.rootId||cur.id,earlierId:missingParent?null:ancestors[0]?.parentId||null};
}
// Pages through day buckets newest first; stops as soon as one page is filled.
async function listVisits(message) {
  const {idx}=await L.get("idx"),q=String(message.query||"").toLowerCase().slice(0,500);
  const c=Array.isArray(message.cursor)&&Number.isFinite(message.cursor[0])?[message.cursor[0],String(message.cursor[1])]:null;
  const days=(idx?.days||[]).filter(d=>!c||d<=dayOf(c[0]));
  let out=[];
  const order=(a,b)=>b[1]-a[1]||(b[0]>a[0]?1:b[0]<a[0]?-1:0);
  for(const d of days){
    const meta=(await L.get("day:"+d))["day:"+d];
    for(const chunk of [...(meta?.chunks||[])].sort((a,b)=>b.max-a.max)){
      if(out.length>PAGE&&chunk.max<out[PAGE][1])break;
      const rows=(await L.get(chunk.key))[chunk.key]||[];
      for(const r of rows){
        if(c&&(r[1]>c[0]||(r[1]===c[0]&&r[0]>=c[1])))continue;
        if(message.rootId&&r[4]!==message.rootId)continue;
        if(q&&!(r[2]+" "+r[3]).toLowerCase().includes(q))continue;
        out.push(r);
      }
      out.sort(order);out=out.slice(0,PAGE+1);
    }
    if(out.length>PAGE)break;
  }
  const more=out.length>PAGE;out=out.slice(0,PAGE);const last=out.at(-1);
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
      if(!saved && message.kind==="traverse" && !s.truncated) {
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
      s={token:s.token||id(),url,navigationId:message.navigationId,currentId:saved.id,documents:kept.docs,stack:kept.stack,index:kept.index,truncated:!!s.truncated||stack.length>=TAB_MEMORY};
      await putState(tabId,s);
      return {recorded:true,currentId:saved.id};
    }
    case "TITLE": {
      if(!fromPage || opt.paused || C.excluded(tab.url,opt.excludedHosts) || s.navigationId!==message.navigationId)return {};
      const n=await currentNode(tab,s);if(!n)return {};
      const title=String(message.title||n.title).slice(0,1000);if(title===n.title)return {};
      const dk=n.bucket, bucket=(await L.get(dk))[dk], r=bucket?.find(x=>x[0]===n.id);
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
    case "TREE": return treeFor((await currentNode(tab,s))?.id,typeof message.focusId==="string"?message.focusId:null);
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
    case "CLEAR": {await L.set({pendingClear:true});await ensureIndex();return {};}
    case "EXPORT": return {format:"SearchTrail",version:3,exportedAt:new Date().toISOString(),visits:(await allVisits()).map(({seg,bucket,...v})=>v),bookmarks:(await L.get("bookmarks")).bookmarks||[]};
    case "BOOKMARKS": return {items:(await L.get("bookmarks")).bookmarks||[]};
    case "BOOKMARK_SAVE": {
      const n=message.id?await node(String(message.id)):await currentNode(tab,s);
      if(message.id&&!n)throw Error("This visit is no longer saved.");
      const url=C.webURL(n?.url||tab.url);if(!url)throw Error("Open a website first.");
      const bookmarks=(await L.get("bookmarks")).bookmarks||[];
      if(!bookmarks.some(b=>b.url===url))bookmarks.unshift({id:id(),url,title:String(n?.title||tab.title||url).slice(0,1000),at:Date.now(),visitId:n?.id||null});
      await L.set({bookmarks});return {};
    }
    case "BOOKMARK_DELETE": {
      await L.set({bookmarks:((await L.get("bookmarks")).bookmarks||[]).filter(b=>b.id!==message.id)});return {};
    }
    case "BOOKMARK_OPEN": {
      const b=((await L.get("bookmarks")).bookmarks||[]).find(b=>b.id===message.id);
      if(!b||!C.webURL(b.url))throw Error("Bookmark not found.");
      const n=await node(b.visitId);if(n&&sameURL(n.url,b.url))return goNode(tab,s,n,{newWindow:true});
      await newTab(b.url);return {};
    }
    case "REPAIR": {await L.remove("idx");indexed=false;await ensureIndex();return {};}
    case "IMPORT": {
      const data=message.data;
      if(!data||data.format!=="SearchTrail"||![1,2,3].includes(data.version)||!Array.isArray(data.visits)||data.visits.length>100000)throw Error("Choose a SearchTrail backup (up to 100,000 visits).");
      const validId=x=>typeof x==="string"&&/^[a-zA-Z0-9-]{1,100}$/.test(x);
      const incoming=new Map();
      for(const n of data.visits){
        if(!n||!validId(n.id)||!C.webURL(n.url)||!Number.isFinite(n.at)||n.at<0||incoming.has(n.id))throw Error("Backup contains invalid or duplicate visits.");
        incoming.set(n.id,{id:n.id,url:C.webURL(n.url),title:String(n.title||n.url).slice(0,1000),at:n.at,parentId:validId(n.parentId)?n.parentId:null,rootId:validId(n.rootId)?n.rootId:n.id,graphVersion:2});
      }
      const bookmarks=(await L.get("bookmarks")).bookmarks||[];
      if(data.bookmarks!==undefined&&!Array.isArray(data.bookmarks))throw Error("Invalid bookmarks in backup.");
      for(const b of data.bookmarks||[]){
        if(!b||!C.webURL(b.url))throw Error("Invalid bookmark address.");
        if(!bookmarks.some(x=>x.url===C.webURL(b.url)))bookmarks.push({id:id(),url:C.webURL(b.url),title:String(b.title||b.url).slice(0,1000),at:Number.isFinite(b.at)?b.at:Date.now(),visitId:validId(b.visitId)?b.visitId:null});
      }
      const existing=await nodes([...incoming.keys()]),out={bookmarks};
      for(const [key,n]of incoming){
        const old=existing.get(key);if(old){if(!sameURL(old.url,n.url)||old.at!==n.at)throw Error("Backup conflicts with existing visits. Nothing imported.");continue;}
        out[nodeKey(key)]=n;
      }
      // Invalidating first lets a restart rebuild indexes from any committed visits.
      await L.remove("idx");indexed=false;await L.set(out);await ensureIndex();return {added:Object.keys(out).length-1};
    }
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
