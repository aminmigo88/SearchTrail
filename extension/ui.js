"use strict";
globalThis.SearchTrailUI=function(root,call,{onClose=()=>{},popup=false,css=true,initialView="trail"}={}) {
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  if(css){const style=el("style");style.textContent=SearchTrailCSS;root.append(style);}
  const box=el("section","st panel"+(popup?" popup-panel":""));box.dir="ltr";box.setAttribute("aria-label","SearchTrail");root.append(box);
  const top=el("div","row top");top.append(el("h1","","SearchTrail"),el("span","version",browser.runtime.getManifest().version));
  const close=el("button","close","Close");close.onclick=onClose;if(!popup)top.append(close);box.append(top);
  const error=el("p","error");error.setAttribute("role","status");box.append(error);
  const scroll=el("div","body");box.append(scroll);
  const trailPage=el("div"),historyPage=el("div"),bookmarksPage=el("div"),settingsPage=el("div");scroll.append(trailPage,historyPage,bookmarksPage,settingsPage);
  const back=el("button","primary","Return to source");trailPage.append(back);
  const sourceText=el("p","muted");sourceText.dir="auto";trailPage.append(sourceText);
  const treeNote=el("p","muted");trailPage.append(treeNote);
  const trailControls=el("div","controls"),earlier=el("button","","Earlier path"),allTrail=el("button","","All trail pages"),currentPath=el("button","","Current path");
  trailControls.append(earlier,allTrail,currentPath);trailPage.append(trailControls);
  const tree=el("ul","tree");trailPage.append(tree);
  const bookmarkCurrent=el("button","primary","☆ Save this page");bookmarksPage.append(bookmarkCurrent);
  bookmarksPage.append(el("p","muted","SearchTrail bookmarks are saved locally, separately from Safari bookmarks. They stay saved when you delete history."));
  const bookmarkQuery=el("input");bookmarkQuery.type="search";bookmarkQuery.placeholder="Find a bookmark…";bookmarkQuery.setAttribute("aria-label","Search bookmarks");bookmarksPage.append(bookmarkQuery);
  const bookmarkList=el("ul","visits");bookmarksPage.append(bookmarkList);
  const query=el("input");query.type="search";query.placeholder="Find a page or website…";query.setAttribute("aria-label","Search recorded visits");historyPage.append(query);
  const count=el("p","muted");historyPage.append(count);
  const list=el("ul","visits");historyPage.append(list);
  const load=el("button","load","Show more");historyPage.append(load);
  settingsPage.append(el("h2","","Button placement"));
  const placement=el("select");placement.setAttribute("aria-label","Button placement");
  for(const [value,name] of [["bottom-right","Bottom right"],["bottom-left","Bottom left"],["top-right","Top right"],["top-left","Top left"]]) {const o=el("option","",name);o.value=value;placement.append(o);}
  const placeLabel=el("label","setting");placeLabel.append(el("span","","Corner"),placement);settingsPage.append(placeLabel);
  const clearance=el("input");clearance.type="range";clearance.min="8";clearance.max="120";clearance.setAttribute("aria-label","Distance from screen edge");
  const clearanceLabel=el("label","setting");clearanceLabel.append(el("span","","Edge distance"),clearance);settingsPage.append(clearanceLabel);
  settingsPage.append(el("p","muted","Tap the arrow to return. Tap ☰ for this menu. Drag the arrow to move both buttons. Placement is saved across websites."));
  const paused=el("input");paused.type="checkbox";const pl=el("label");pl.append(paused,document.createTextNode("Pause recording"));settingsPage.append(pl);
  const intercept=el("input");intercept.type="checkbox";const il=el("label");il.append(intercept,document.createTextNode("Open Google results in new tabs"));settingsPage.append(il);
  const status=el("p","good");settingsPage.append(status);
  const controls=el("div","controls");settingsPage.append(controls);
  const exclude=el("button","","Exclude this site"),exportBtn=el("button","","Export history"),clear=el("button","danger","Delete history");const importBtn=el("button","","Restore backup"),repair=el("button","","Repair history index"),file=el("input");file.type="file";file.accept=".json,application/json";file.hidden=true;
  controls.append(exclude,exportBtn,importBtn,repair,clear,file);
  settingsPage.append(el("p","muted","Saved locally on permitted websites. Private tabs are excluded. Older visits keep their history but have no reconstructed path. Missing or ambiguous navigation links are not guessed."));
  const nav=el("nav","nav");nav.setAttribute("aria-label","SearchTrail sections");box.append(nav);
  const pages={trail:trailPage,history:historyPage,bookmarks:bookmarksPage,settings:settingsPage},buttons={};
  let view="trail",generation=0,timer,cursor=null,shown=0,total=0,focusId=null,trailRoot=null,historyRoot=null;
  for(const [key,label] of [["trail","Trail"],["history","History"],["bookmarks","Bookmarks"],["settings","Settings"]]){const b=el("button","",label);buttons[key]=b;b.onclick=()=>show(key);nav.append(b);}
  async function action(fn){error.textContent="";try{return await fn();}catch(e){error.textContent=e.message;return null;}}
  function labelURL(url){try{const u=new URL(url);let path=u.pathname;try{path=decodeURIComponent(path);}catch{}return u.hostname+(path==="/"?"":path);}catch{return url;}}
  function pageButton(v){
    const b=el("button","open");const title=el("bdi","title",v.title||v.url);title.dir="auto";
    const url=el("span","url",labelURL(v.url));url.dir="ltr";b.append(title,url);b.title=v.url;return b;
  }
  function renderTree(data){
    tree.replaceChildren();trailRoot=data.rootId;earlier.hidden=!data.earlierId;earlier.onclick=()=>{focusId=data.earlierId;refresh(false);};allTrail.hidden=!data.items.length;currentPath.hidden=!focusId;
    if(!data.items.length){treeNote.textContent="No path for this page yet. Follow a link on a permitted website, or open History.";return;}
    treeNote.textContent=`${data.partial?"At least ":""}${data.total} pages in this trail · Current path highlighted`+(data.total>data.items.length?` · Showing ${data.items.length}`:"")+(data.hidden?" · Partial view; use Earlier path or All trail pages":"")+(data.missingParent?" · An earlier page was deleted":"");
    const children=new Map(),ids=new Set(data.items.map(n=>n.id)),path=new Set(data.ancestors.map(n=>n.id));
    for(const n of data.items){const key=ids.has(n.parentId)?n.parentId:null;if(!children.has(key))children.set(key,[]);children.get(key).push(n);}
    for(const group of children.values())group.sort((a,b)=>a.at-b.at);
    const pending=(children.get(null)||[]).map(n=>({n,list:tree,depth:0})).reverse(),seen=new Set();
    while(pending.length){
      const {n,list,depth}=pending.pop();if(seen.has(n.id))continue;seen.add(n.id);
      const li=el("li",(path.has(n.id)?"on-path ":"")+(n.id===data.currentId?"current":""));
      const b=pageButton(n);if(n.id===data.currentId){b.append(el("span","badge","You are here"));b.setAttribute("aria-current","page");}
      b.onclick=()=>action(async()=>{await call({type:"GO_NODE",id:n.id});onClose();});li.append(b);list.append(li);
      if(children.has(n.id)){
        const sub=el("ul",depth>=5?"deep":"");
        const fold=el("button","fold","Collapse branch");fold.setAttribute("aria-expanded","true");fold.onclick=()=>{sub.hidden=!sub.hidden;fold.textContent=sub.hidden?"Expand branch":"Collapse branch";fold.setAttribute("aria-expanded",String(!sub.hidden));};li.append(fold,sub);
        for(const child of [...children.get(n.id)].reverse())pending.push({n:child,list:sub,depth:depth+1});
      }
    }
  }
  function applyStatus(s){
    back.disabled=!s.source;back.textContent=s.source?"↩ Return to source":"No source linked yet";
    back.onclick=()=>action(async()=>{const r=await call({type:"RETURN"});if(r?.none)throw Error("No source page was recorded. Open the menu for your trail and history.");onClose();});
    sourceText.textContent=s.source?(s.sourceOpen?"Open source: ":"Load saved source: ")+(s.source.title||s.source.url):"The arrow returns directly; ☰ opens your trail, history and bookmarks.";
    paused.checked=s.settings.paused;intercept.checked=s.settings.interceptGoogle;
    placement.value=s.settings.placement||"bottom-right";clearance.value=s.settings.clearance??16;
    status.textContent=s.settings.paused?"Recording paused":s.excluded?"This site is excluded":"Recording permitted, non-private webpages";
    exclude.textContent=s.settings.excludedHosts.includes(s.host)?"Include this site":"Exclude this site";
  }
  function updateCount(){count.textContent=`${shown} shown · ${total} pages saved${historyRoot?" · Filtered to this trail":""}`;if(!shown&&!list.querySelector(".empty"))list.append(el("li","empty","No saved pages match yet."));}
  // Adds one page of rows; earlier rows are kept, so "Show more" never redraws the list.
  function appendRows(data){
    total=data.total;cursor=data.cursor;
    for(const v of data.items){
      const row=el("li","visit"),b=pageButton(v),del=el("button","delete","×"),save=el("button","save","☆");save.setAttribute("aria-label","Bookmark: "+(v.title||v.url));save.onclick=()=>action(async()=>{await call({type:"BOOKMARK_SAVE",id:v.id});save.textContent="★";});
      b.append(el("span","time",new Date(v.at).toLocaleString()));b.onclick=()=>action(async()=>{await call({type:"OPEN_VISIT",id:v.id});onClose();});
      del.setAttribute("aria-label","Delete visit: "+(v.title||v.url));
      del.onclick=()=>action(async()=>{await call({type:"DELETE",id:v.id});await refresh(false);});
      row.append(b,save,del);list.append(row);shown++;
    }
    load.hidden=!data.more;updateCount();
  }
  async function refresh(withStatus=true){
    const g=++generation;
    await action(async()=>{
      const [s,data]=await Promise.all([withStatus?call({type:"STATUS"}):null,view==="trail"?call({type:"TREE",...(focusId?{focusId}:{})}):view==="history"?call({type:"LIST",query:query.value,rootId:historyRoot}):view==="bookmarks"?call({type:"BOOKMARKS"}):null]);
      if(g!==generation)return;
      if(s)applyStatus(s);
      if(view==="trail")renderTree(data);
      if(view==="bookmarks")renderBookmarks(data);
      if(view==="history"){list.replaceChildren();shown=0;appendRows(data);}
    });
  }
  function renderBookmarks(data){
    bookmarkList.replaceChildren();const q=bookmarkQuery.value.toLowerCase();
    for(const v of data.items.filter(v=>(v.title+" "+v.url).toLowerCase().includes(q))){
      const row=el("li","visit"),b=pageButton(v),del=el("button","delete","×");
      b.onclick=()=>action(async()=>{await call({type:"BOOKMARK_OPEN",id:v.id});onClose();});
      del.setAttribute("aria-label","Remove bookmark: "+(v.title||v.url));del.onclick=()=>action(async()=>{await call({type:"BOOKMARK_DELETE",id:v.id});await refresh(false);});row.append(b,del);bookmarkList.append(row);
    }
    if(!bookmarkList.children.length)bookmarkList.append(el("li","empty","No bookmarks match yet. Save this page or use ☆ in History."));
  }
  bookmarkCurrent.onclick=()=>action(async()=>{await call({type:"BOOKMARK_SAVE"});await refresh(false);});
  bookmarkQuery.oninput=()=>refresh(false);
  currentPath.onclick=()=>{focusId=null;refresh(false);};
  allTrail.onclick=()=>{historyRoot=trailRoot;show("history");};
  buttons.history.onclick=()=>{historyRoot=null;show("history");};
  function show(next){view=pages[next]?next:"trail";for(const [key,p] of Object.entries(pages)){p.hidden=key!==view;buttons[key].setAttribute("aria-current",String(key===view));}scroll.scrollTop=0;refresh();}
  query.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>refresh(false),150);};
  load.onclick=()=>{const g=generation;load.disabled=true;action(async()=>{const data=await call({type:"LIST",query:query.value,cursor,rootId:historyRoot});if(g===generation)appendRows(data);}).finally(()=>{load.disabled=false;});};
  paused.onchange=()=>action(async()=>{await call({type:"SETTINGS",paused:paused.checked});await refresh();});
  intercept.onchange=()=>action(async()=>{await call({type:"SETTINGS",interceptGoogle:intercept.checked});await refresh();});
  placement.onchange=()=>action(()=>call({type:"SETTINGS",placement:placement.value}));
  clearance.onchange=()=>action(()=>call({type:"SETTINGS",clearance:Number(clearance.value)}));
  exclude.onclick=()=>action(async()=>{await call({type:"EXCLUDE"});await refresh();});
  clear.onclick=()=>action(async()=>{if(confirm("Delete all SearchTrail history and paths? Safari History will not change.")){await call({type:"CLEAR"});await refresh();}});
  importBtn.onclick=()=>file.click();
  file.onchange=()=>action(async()=>{
    const selected=file.files[0];if(!selected)return;
    try{if(selected.size>50*1024*1024)throw Error("Choose a backup smaller than 50 MB.");
      const data=JSON.parse(await selected.text());
      if(!confirm("Merge this backup with your SearchTrail history and bookmarks? Existing pages will be kept."))return;
      const result=await call({type:"IMPORT",data});await refresh();error.textContent=`Restored ${result.added} new visits.`;
    }finally{file.value="";}
  });
  repair.onclick=()=>action(async()=>{await call({type:"REPAIR"});await refresh();error.textContent="History index rebuilt. Saved visits and bookmarks were kept.";});
  exportBtn.onclick=()=>action(async()=>{
    const data=await call({type:"EXPORT"}),blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download="SearchTrail-visits-"+new Date().toISOString().slice(0,10)+".json";box.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  show(initialView);return {refresh,show,error:message=>{error.textContent=message;}};
};
