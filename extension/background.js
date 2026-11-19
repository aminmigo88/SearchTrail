/* One serialized writer: graph nodes persist; tab/document mappings are session-only. */
"use strict";
const B = browser, C = SearchTrailCore;
const DEFAULTS = {paused:false, interceptGoogle:true, excludedHosts:[], placement:"bottom-right", clearance:16};
let work = Promise.resolve();
const explicitTabs = new Set();
function queue(fn) { const next=work.then(fn); work=next.catch(()=>{}); return next; }
const stateKey = n => "tab:"+n;
const nodeKey = n => "visit:"+n;
const id = () => crypto.randomUUID();
async function state(tabId) {
  if (!B.storage.session) throw Error("SearchTrail requires Safari 16.4 or newer.");
  return (await B.storage.session.get(stateKey(tabId)))[stateKey(tabId)] || {};
}
async function putState(tabId,s) { await B.storage.session.set({[stateKey(tabId)]:s}); }
async function settings() {return {...DEFAULTS,...(await B.storage.local.get("settings")).settings};}
async function node(nodeId) {return nodeId ? (await B.storage.local.get(nodeKey(nodeId)))[nodeKey(nodeId)] || null : null;}
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
async function allVisits() {
  const values=await B.storage.local.get(null);
  return Object.entries(values).filter(([k,v])=>k.startsWith("visit:") && v?.id && C.webURL(v.url)).map(([,v])=>v)
    .sort((a,b)=>(b.lastAt||b.at)-(a.lastAt||a.at) || b.id.localeCompare(a.id));
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
async function treeFor(currentId) {
  const items=await allVisits(), byId=new Map(items.map(n=>[n.id,n]));
  const ancestors=[], seen=new Set(); let n=byId.get(currentId), missingParent=false;
  while(n && !seen.has(n.id)) {seen.add(n.id);ancestors.unshift(n);if(n.parentId && !byId.has(n.parentId))missingParent=true;n=byId.get(n.parentId);}
  if(!ancestors.length) return {items:[],ancestors:[],currentId:null,total:0};
  const children=new Map();
  for(const item of items) {if(!children.has(item.parentId))children.set(item.parentId,[]);children.get(item.parentId).push(item);}
  const selected=new Map(ancestors.map(a=>[a.id,a])), pending=[ancestors[0]], visited=new Set(); let total=0;
  while(pending.length) {
    const item=pending.pop();if(visited.has(item.id))continue;visited.add(item.id);total++;
    if(selected.size<300)selected.set(item.id,item);
    pending.push(...(children.get(item.id)||[]));
  }
  return {items:[...selected.values()],ancestors,currentId,total,missingParent};
}
async function handle(message,sender) {
  if(!message || typeof message.type!=="string")throw Error("Invalid request.");
  const fromPage=!!sender.tab,tabId=fromPage?sender.tab.id:message.tabId;
  if(!Number.isInteger(tabId))throw Error("Open SearchTrail on a normal website first.");
  const tab=await safeTab(tabId);
  if(fromPage && sender.frameId && sender.frameId!==0)throw Error("Top frame only.");
  const opt=await settings();let s=await state(tabId);
  switch(message.type) {
    case "STATUS": return {...await sourceStatus(tab,s),settings:opt,host:C.webURL(tab.url)?new URL(tab.url).hostname:"",excluded:C.excluded(tab.url,opt.excludedHosts)};
    case "VISIT": {
      if(!fromPage || typeof message.navigationId!=="string" || !/^[a-zA-Z0-9-]{1,100}$/.test(message.navigationId))throw Error("Invalid visit.");
      const url=C.webURL(message.url);if(!url || !sameURL(url,tab.url))return {recorded:false,accepted:false};
      if(opt.paused || C.excluded(url,opt.excludedHosts)) {
        await putState(tabId,{token:s.token||id(),url,navigationId:message.navigationId,currentId:null,documents:{}});
        return {recorded:false};
      }
      if(s.navigationId===message.navigationId && sameURL(s.url,url) && await node(s.currentId))return {recorded:true};
      const previous=await node(s.currentId);
      const fresh=s.pending && Date.now()-s.pending.at<30000 ? s.pending : null;
      let saved=await node(s.documents?.[message.navigationId] || message.navigationId);
      if(saved && !sameURL(saved.url,url))saved=null;
      if(!saved && fresh?.restoreId && sameURL(fresh.url,url))saved=await node(fresh.restoreId);
      if(!saved && message.kind==="reload" && sameURL(previous?.url,url))saved=previous;
      // A back/forward reload can lose its content-script identity. Reuse only an
      // unambiguous entry in this tab's known traversal stack; never guess globally.
      if(!saved && message.kind==="traverse") {
        const candidates=[];
        for(const entry of s.stack||[]) {const item=await node(entry);if(item && sameURL(item.url,url))candidates.push(item);}
        if(candidates.length===1)saved=candidates[0];
      }
      if(!saved) {
        let parent=null;
        if(fresh?.parentId && (sameURL(fresh.url,url) || fresh.opener))parent=await node(fresh.parentId);
        if(!parent && previous && message.kind!=="traverse" && message.kind!=="reload") {
          if(message.kind==="route" || sameURL(message.referrer,previous.url))parent=previous;
        }
        // onCreated may not be delivered before the first content message.
        if(!parent && !s.navigationId && Number.isInteger(tab.openerTabId) && tab.openerTabId!==tabId) {
          try {const p=await safeTab(tab.openerTabId);parent=await currentNode(p,await state(p.id));}catch{}
        }
        if(parent && C.excluded(parent.url,opt.excludedHosts))parent=null;
        saved={id:message.navigationId,url,title:String(message.title||tab.title||url).slice(0,1000),at:Date.now(),parentId:parent?.id||null,rootId:parent?.rootId||parent?.id||message.navigationId,graphVersion:2};
        // Persist the node first. Retry by navigationId is idempotent if session write fails.
        await B.storage.local.set({[nodeKey(saved.id)]:saved});
      }
      const docs={...(s.documents||{}),[message.navigationId]:saved.id};
      const stack=[...(s.stack||[])];const known=stack.indexOf(saved.id);
      let index;
      if(known>=0)index=known;
      else {stack.splice((s.index??(stack.length-1))+1);stack.push(saved.id);index=stack.length-1;}
      s={token:s.token||id(),url,navigationId:message.navigationId,currentId:saved.id,documents:docs,stack,index};
      await putState(tabId,s);
      return {recorded:true,currentId:saved.id};
    }
    case "TITLE": {
      if(!fromPage || opt.paused || C.excluded(tab.url,opt.excludedHosts) || s.navigationId!==message.navigationId)return {};
      const n=await currentNode(tab,s);
      if(n)await B.storage.local.set({[nodeKey(n.id)]:{...n,title:String(message.title||n.title).slice(0,1000)}});
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
      const status=await sourceStatus(tab,s);
      if(!status.source)throw Error("No source page was recorded. Long-press for your trail and history.");
      return goNode(tab,s,status.source);
    }
    case "TREE": return treeFor((await currentNode(tab,s))?.id);
    case "GO_NODE": {
      const n=await node(String(message.id));if(!n)throw Error("This page is no longer saved.");
      return goNode(tab,s,n);
    }
    case "LIST": {
      const items=await allVisits(),q=String(message.query||"").toLowerCase().slice(0,500);
      const matches=items.filter(v=>!q || (v.title+" "+v.url).toLowerCase().includes(q));
      const limit=Math.max(100,Math.min(Number(message.limit)||100,20000));
      return {items:matches.slice(0,limit),total:items.length,matches:matches.length};
    }
    case "OPEN_VISIT": {
      const n=await node(String(message.id));if(!n)throw Error("This visit is no longer saved.");
      return goNode(tab,s,n,{newWindow:true});
    }
    case "DELETE": await B.storage.local.remove(nodeKey(String(message.id)));return {};
    case "CLEAR": {
      const values=await B.storage.local.get(null);
      await B.storage.local.remove(Object.keys(values).filter(k=>k.startsWith("visit:")));
      await B.storage.session.clear();return {};
    }
    case "EXPORT": return {format:"SearchTrail",version:2,exportedAt:new Date().toISOString(),visits:await allVisits()};
    case "SETTINGS": {
      const patch={};
      for(const key of ["paused","interceptGoogle"])if(typeof message[key]==="boolean")patch[key]=message[key];
      if(["bottom-right","bottom-left","top-right","top-left"].includes(message.placement))patch.placement=message.placement;
      if(Number.isFinite(message.clearance))patch.clearance=Math.max(8,Math.min(120,Math.round(message.clearance)));
      await B.storage.local.set({settings:{...opt,...patch}});return {};
    }
    case "EXCLUDE": {
      if(!C.webURL(tab.url))throw Error("Open a website first.");
      const host=new URL(tab.url).hostname.toLowerCase();
      const hosts=opt.excludedHosts.includes(host)?opt.excludedHosts.filter(h=>h!==host):[...opt.excludedHosts,host];
      await B.storage.local.set({settings:{...opt,excludedHosts:hosts}});return {};
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
