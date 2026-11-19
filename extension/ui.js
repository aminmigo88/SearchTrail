"use strict";
globalThis.SearchTrailUI=function(root,call,{onClose=()=>{},popup=false}={}) {
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
  const style=el("style");style.textContent=SearchTrailCSS;root.append(style);
  const box=el("section","st panel"+(popup?" popup-panel":""));box.dir="ltr";box.setAttribute("aria-label","SearchTrail");root.append(box);
  const top=el("div","row top");top.append(el("h1","","SearchTrail"),el("span","version","0.2"));
  const close=el("button","close","Close");close.onclick=onClose;if(!popup)top.append(close);box.append(top);
  const error=el("p","error");error.setAttribute("role","status");box.append(error);
  const scroll=el("div","body");box.append(scroll);
  const trailPage=el("div"),historyPage=el("div"),settingsPage=el("div");scroll.append(trailPage,historyPage,settingsPage);
  const back=el("button","primary","Return to source");trailPage.append(back);
  const sourceText=el("p","muted");sourceText.dir="auto";trailPage.append(sourceText);
  const treeNote=el("p","muted");trailPage.append(treeNote);
  const tree=el("ul","tree");trailPage.append(tree);
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
  settingsPage.append(el("p","muted","Tap the arrow to return. Hold it for this panel. Drag it to choose a corner. Placement is saved across websites."));
  const paused=el("input");paused.type="checkbox";const pl=el("label");pl.append(paused,document.createTextNode("Pause recording"));settingsPage.append(pl);
  const intercept=el("input");intercept.type="checkbox";const il=el("label");il.append(intercept,document.createTextNode("Open Google results in new tabs"));settingsPage.append(il);
  const status=el("p","good");settingsPage.append(status);
  const controls=el("div","controls");settingsPage.append(controls);
  const exclude=el("button","","Exclude this site"),exportBtn=el("button","","Export history"),clear=el("button","danger","Delete history");controls.append(exclude,exportBtn,clear);
  settingsPage.append(el("p","muted","Saved locally on permitted websites. Private tabs are excluded. Older visits keep their history but have no reconstructed path. Missing or ambiguous navigation links are not guessed."));
  const nav=el("nav","nav");nav.setAttribute("aria-label","SearchTrail sections");box.append(nav);
  const pages={trail:trailPage,history:historyPage,settings:settingsPage},buttons={};
  let view="trail",limit=100,generation=0,timer;
  for(const [key,label] of [["trail","Trail"],["history","History"],["settings","Settings"]]){const b=el("button","",label);buttons[key]=b;b.onclick=()=>show(key);nav.append(b);}
  async function action(fn){error.textContent="";try{return await fn();}catch(e){error.textContent=e.message;return null;}}
  function labelURL(url){try{const u=new URL(url);let path=u.pathname;try{path=decodeURIComponent(path);}catch{}return u.hostname+(path==="/"?"":path);}catch{return url;}}
  function pageButton(v){
    const b=el("button","open");const title=el("bdi","title",v.title||v.url);title.dir="auto";
    const url=el("span","url",labelURL(v.url));url.dir="ltr";b.append(title,url);b.title=v.url;return b;
  }
  function renderTree(data){
    tree.replaceChildren();
    if(!data.items.length){treeNote.textContent="No path for this page yet. Follow a link on a permitted website, or open History.";return;}
    treeNote.textContent=`${data.total} pages in this trail · Current path highlighted`+(data.total>data.items.length?` · Showing ${data.items.length}`:"")+(data.missingParent?" · An earlier page was deleted":"");
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
        const sub=el("ul",depth>=5?"deep":"");li.append(sub);
        for(const child of [...children.get(n.id)].reverse())pending.push({n:child,list:sub,depth:depth+1});
      }
    }
  }
  async function refresh(){
    const g=++generation;
    await action(async()=>{
      const [s,data]=await Promise.all([call({type:"STATUS"}),view==="trail"?call({type:"TREE"}):view==="history"?call({type:"LIST",query:query.value,limit}):Promise.resolve(null)]);
      if(g!==generation)return;
      back.disabled=!s.source;back.textContent=s.source?"↩ Return to source":"No source linked yet";
      back.onclick=()=>action(async()=>{await call({type:"RETURN"});onClose();});
      sourceText.textContent=s.source?(s.sourceOpen?"Open source: ":"Load saved source: ")+(s.source.title||s.source.url):"A tap returns directly; a hold shows your path.";
      paused.checked=s.settings.paused;intercept.checked=s.settings.interceptGoogle;
      placement.value=s.settings.placement||"bottom-right";clearance.value=s.settings.clearance??16;
      status.textContent=s.settings.paused?"Recording paused":s.excluded?"This site is excluded":"Recording permitted, non-private webpages";
      exclude.textContent=s.settings.excludedHosts.includes(s.host)?"Include this site":"Exclude this site";
      if(view==="trail")renderTree(data);
      if(view==="history"){
        count.textContent=`${data.items.length} shown · ${data.total} pages saved`;
        list.replaceChildren();if(!data.items.length)list.append(el("li","empty","No saved pages match yet."));
        for(const v of data.items){
          const row=el("li","visit"),b=pageButton(v),del=el("button","delete","×");
          b.append(el("span","time",new Date(v.at).toLocaleString()));b.onclick=()=>action(async()=>{await call({type:"OPEN_VISIT",id:v.id});onClose();});
          del.setAttribute("aria-label","Delete visit: "+(v.title||v.url));del.onclick=()=>action(async()=>{await call({type:"DELETE",id:v.id});await refresh();});
          row.append(b,del);list.append(row);
        }
        load.hidden=data.items.length>=data.matches;load.disabled=limit>=20000;
      }
    });
  }
  function show(next){view=pages[next]?next:"trail";for(const [key,p] of Object.entries(pages)){p.hidden=key!==view;buttons[key].setAttribute("aria-current",String(key===view));}scroll.scrollTop=0;refresh();}
  query.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{limit=100;refresh();},180);};
  load.onclick=()=>{limit+=100;refresh();};
  paused.onchange=()=>action(async()=>{await call({type:"SETTINGS",paused:paused.checked});await refresh();});
  intercept.onchange=()=>action(async()=>{await call({type:"SETTINGS",interceptGoogle:intercept.checked});await refresh();});
  placement.onchange=()=>action(()=>call({type:"SETTINGS",placement:placement.value}));
  clearance.onchange=()=>action(()=>call({type:"SETTINGS",clearance:Number(clearance.value)}));
  exclude.onclick=()=>action(async()=>{await call({type:"EXCLUDE"});await refresh();});
  clear.onclick=()=>action(async()=>{if(confirm("Delete all SearchTrail history and paths? Safari History will not change.")){await call({type:"CLEAR"});await refresh();}});
  exportBtn.onclick=()=>action(async()=>{
    const data=await call({type:"EXPORT"}),blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download="SearchTrail-visits-"+new Date().toISOString().slice(0,10)+".json";box.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  });
  show("trail");return {refresh,show,error:message=>{error.textContent=message;}};
};
