"use strict";
(function () {
  if(window.top!==window || globalThis.__searchTrailLoaded || browser.extension?.inIncognitoContext)return;
  globalThis.__searchTrailLoaded=true;
  const C=SearchTrailCore;
  const makeId=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join("-");
  let host,shadow,button,menuButton,dock,note,scrim,panelRoot,ui,open=false,options,lastURL,navId,lastTitle,failed,pendingVisit,inFlight=false,retryAt=0,dragging=false,ready=false;
  const routes=[];
  async function call(message) {
    const response=await browser.runtime.sendMessage(message);
    if(!response?.ok)throw Error(response?.error||"SearchTrail could not reach its background process.");
    return response.data;
  }
  // Panel data starts loading before the panel opens: when the arrow is still held at
  // 250 ms (a tap never waits behind it), or as soon as the menu button is touched.
  let warm=null;
  function prefetch(){
    if(open||(warm&&Date.now()-warm.at<3000))return;
    warm={at:Date.now(),STATUS:call({type:"STATUS"}),TREE:call({type:"TREE"})};
    warm.STATUS.catch(()=>{});warm.TREE.catch(()=>{});
  }
  function uiCall(message){
    if(warm&&Date.now()-warm.at<3000&&Object.keys(message).length===1&&warm[message.type]){const p=warm[message.type];delete warm[message.type];return p;}
    return call(message);
  }
  // The menu button sits above the arrow. Swiping it toward the screen edge tucks it into a
  // thin tab; dragging or tapping the tab brings it back. The choice is saved across websites.
  const STACK_W=50,STACK_H=108,EDGE_GAP=12;
  const menuHidden=()=>!!options?.settings?.menuHidden;
  const edgeRight=()=>!(options?.settings?.placement||"bottom-right").endsWith("left");
  let menuState="";
  function applyMenuState(){
    if(!menuButton)return;const hidden=menuHidden(),state=hidden+"|"+open+"|"+edgeRight();
    if(state===menuState)return;menuState=state;
    menuButton.classList.toggle("tucked",hidden);menuButton.classList.toggle("edge-left",!edgeRight());dock.classList.toggle("menu-hidden",hidden);
    menuButton.textContent=open?"×":"☰";
    menuButton.setAttribute("aria-label",hidden?"Show the SearchTrail menu button":open?"Close SearchTrail menu":"Open SearchTrail menu");
    menuButton.title=hidden?"Drag out or tap to show the menu button":open?"Close menu":"Open menu · swipe to the side to hide";
  }
  function setMenuHidden(value){
    if(options?.settings)options.settings.menuHidden=value;
    applyMenuState();position();
    call({type:"SETTINGS",menuHidden:value}).catch(reportError);
  }
  // Pop-up blocker (guard.js and background.js do the blocking). Here: invisible layers that
  // cover the page and open another website wherever you tap, and the short notice.
  const popupBlocking=()=>options?.settings?.blockPopups!==false&&!C.excluded(location.href,options?.settings?.popupAllowedHosts||[]);
  function coversPage(a) {
    const r=a.getBoundingClientRect(),w=innerWidth,h=innerHeight;
    const area=Math.max(0,Math.min(r.right,w)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,h)-Math.max(r.top,0));
    if(area>=.85*w*h)return true;
    for(let n=a,i=0;n instanceof Element&&i<4;n=n.parentElement,i++){const cs=getComputedStyle(n);if(Number(cs.opacity)<.05||cs.visibility==="hidden")return true;}
    return false;
  }
  const POPUP_ICON='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" stroke="#1a6dff" stroke-width="1.8"/><path d="M3 8.5h18" stroke="#1a6dff" stroke-width="1.8"/><path d="M9.5 11.5l5 5M14.5 11.5l-5 5" stroke="#e5484d" stroke-width="2.4"/></svg>';
  let noteTimer;
  function showPopupNote() {
    mount();if(!note)return;
    note.classList.remove("show");void note.offsetWidth;note.classList.add("show");
    clearTimeout(noteTimer);noteTimer=setTimeout(()=>note.classList.remove("show"),1600);
  }
  document.addEventListener("searchtrail:blocked",showPopupNote);
  browser.runtime.onMessage?.addListener(message=>{if(message?.type==="POPUP_BLOCKED")showPopupNote();});
  function reportError(e) {failed=e.message;if(button){button.classList.add("bad");button.title=failed;}ui?.error(failed);}
  function viewport() {const v=window.visualViewport;return {x:v?.offsetLeft||0,y:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};}
  function position() {
    if(!host || dragging)return;
    const v=viewport(),placement=options?.settings.placement||"bottom-right",clearance=options?.settings.clearance??16;
    const left=placement.endsWith("left"),top=placement.startsWith("top");
    const y=v.y+(top?clearance:Math.max(8,v.height-STACK_H-clearance)),x=v.x+(left?EDGE_GAP:Math.max(8,v.width-STACK_W-EDGE_GAP));
    host.style.setProperty("left",x+"px","important");host.style.setProperty("top",y+"px","important");
    dock.classList.toggle("at-top",top);applyMenuState();
    const panelWidth=Math.min(400,v.width-16),panelHeight=Math.min(560,Math.max(180,v.height*.68),v.height-16);
    const panelY=top?v.y+8:v.y+v.height-panelHeight-8;
    panelRoot.style.cssText=`position:fixed;z-index:1;left:${v.x+(left?8:v.width-panelWidth-8)}px;top:${panelY}px;--sheet-width:${panelWidth}px;--sheet-height:${panelHeight}px;--sheet-origin:${top?"top":"bottom"} center;direction:ltr;`;
    // The menu reaches the screen edge behind the buttons; only what they cover is moved aside.
    if(open&&ui)ui.avoid((menuHidden()?button:dock).getBoundingClientRect());

  }
  function toggle(value,view="trail") {
    open=value;panelRoot.hidden=!open;scrim.hidden=!open;menuButton.setAttribute("aria-expanded",String(open));applyMenuState();
    if(open){if(!ui)ui=SearchTrailUI(panelRoot,uiCall,{onClose:()=>toggle(false),css:false,initialView:view});else ui.show(view);if(failed)ui.error(failed);}
    position();
  }
  async function tap() {
    try {
      const result=await call({type:"RETURN"});
      if(result?.none)toggle(true);else if(open)toggle(false);
    }catch(e){reportError(e);toggle(true);}
  }
  function mount() {
    if(host?.isConnected)return;
    host=document.createElement("div");host.setAttribute("dir","ltr");host.setAttribute("data-searchtrail","");
    host.style.cssText="all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;direction:ltr!important;";
    shadow=host.attachShadow({mode:"closed"});const style=document.createElement("style");style.textContent=SearchTrailCSS;shadow.append(style);
    scrim=document.createElement("div");scrim.className="scrim";scrim.hidden=true;scrim.onclick=()=>toggle(false);
    panelRoot=document.createElement("div");panelRoot.hidden=true;shadow.append(scrim,panelRoot);
    button=document.createElement("button");button.className="launcher";button.textContent="↩\uFE0E";button.title="Return to source page";
    button.setAttribute("aria-label","Return to source page");
    dock=document.createElement("div");dock.className="dock";
    menuButton=document.createElement("button");menuButton.className="launcher menu-launcher";menuButton.textContent="☰";menuButton.title="Open SearchTrail menu";
    menuButton.setAttribute("aria-label","Open SearchTrail menu");menuButton.setAttribute("aria-expanded","false");
    note=document.createElement("div");note.className="popup-note";note.setAttribute("role","status");note.setAttribute("aria-label","Pop-up blocked");note.innerHTML=POPUP_ICON;
    dock.append(menuButton,button,note);shadow.append(dock);applyMenuState();
    let mstart=null,mswipe=false,msuppress=0;
    const towardEdge=dx=>edgeRight()?dx:-dx;
    menuButton.onpointerdown=e=>{
      if(e.button!==0)return;
      mstart={x:e.clientX,y:e.clientY};mswipe=false;
      menuButton.setPointerCapture(e.pointerId);menuButton.classList.add("pressed");
      if(!menuHidden())prefetch();
    };
    menuButton.onpointermove=e=>{
      if(!mstart)return;const dx=e.clientX-mstart.x,dy=e.clientY-mstart.y;
      if(!mswipe&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)){mswipe=true;menuButton.classList.remove("pressed");menuButton.classList.add("swiping");}
      if(!mswipe)return;
      const t=towardEdge(dx),shift=menuHidden()?Math.max(-48,Math.min(0,t)):Math.max(-8,Math.min(48,t));
      menuButton.style.transform=`translateX(${edgeRight()?shift:-shift}px)`;
    };
    menuButton.onpointerup=e=>{
      if(!mstart)return;const t=towardEdge(e.clientX-mstart.x),swiped=mswipe;
      mstart=null;mswipe=false;msuppress=Date.now()+800;
      menuButton.classList.remove("pressed","swiping");menuButton.style.transform="";
      if(menuButton.hasPointerCapture(e.pointerId))menuButton.releasePointerCapture(e.pointerId);
      if(swiped){if(!menuHidden()&&t>24)setMenuHidden(true);else if(menuHidden()&&t<-16)setMenuHidden(false);}
      else if(menuHidden())setMenuHidden(false);
      else toggle(!open);
    };
    menuButton.onpointercancel=()=>{mstart=null;mswipe=false;msuppress=Date.now()+800;menuButton.classList.remove("pressed","swiping");menuButton.style.transform="";};
    // Keyboard activation still reaches the button through click.
    menuButton.onclick=()=>{if(Date.now()<msuppress)return;if(menuHidden())setMenuHidden(false);else toggle(!open);};
    let start,timer,warmTimer,held=false,suppressUntil=0;
    const press=on=>button.classList.toggle("pressed",on);
    function cancel(){clearTimeout(timer);clearTimeout(warmTimer);start=null;dragging=false;press(false);}
    button.onpointerdown=e=>{
      if(e.button!==0)return;
      const r=host.getBoundingClientRect();held=false;dragging=false;start={x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      button.setPointerCapture(e.pointerId);press(true);
      warmTimer=setTimeout(()=>{if(start&&!dragging)prefetch();},250);
      timer=setTimeout(()=>{if(start&&!dragging){held=true;toggle(true);}},500);
    };
    button.onpointermove=e=>{
      if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(Math.abs(dx)+Math.abs(dy)>10){dragging=true;clearTimeout(timer);clearTimeout(warmTimer);press(false);}
      if(!dragging)return;const v=viewport();
      host.style.setProperty("left",Math.max(v.x+4,Math.min(v.x+v.width-STACK_W-4,start.left+dx))+"px","important");
      host.style.setProperty("top",Math.max(v.y+4,Math.min(v.y+v.height-STACK_H-4,start.top+dy))+"px","important");
    };
    button.onpointerup=e=>{
      if(!start)return;clearTimeout(timer);clearTimeout(warmTimer);press(false);suppressUntil=Date.now()+800;
      const moved=dragging;start=null;dragging=false;
      if(moved){
        const v=viewport(),r=host.getBoundingClientRect(),top=r.top+r.height/2<v.y+v.height/2;
        const placement=(top?"top-":"bottom-")+(r.left+r.width/2<v.x+v.width/2?"left":"right");
        const clearance=Math.max(8,Math.min(120,Math.round(top?r.top-v.y:v.y+v.height-r.bottom)));
        call({type:"SETTINGS",placement,clearance}).then(updateOptions).catch(reportError);
      }else if(!held)tap();
      if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);
    };
    button.onpointercancel=()=>{suppressUntil=Date.now()+800;cancel();position();};
    button.oncontextmenu=e=>{e.preventDefault();clearTimeout(timer);clearTimeout(warmTimer);press(false);held=true;suppressUntil=Date.now()+800;toggle(true);};
    button.onclick=()=>{if(Date.now()>=suppressUntil)tap();};
    document.documentElement.append(host);position();if(failed)reportError(Error(failed));
  }
  async function visit(force=false,kind="route") {
    if(!ready)return;
    const url=location.href;
    if(!lastURL || url!==lastURL){
      if(kind==="traverse"){
        const matches=routes.filter(r=>r.url===url);navId=matches.length===1?matches[0].id:makeId();
      }else navId=makeId();
      if(!routes.some(r=>r.id===navId))routes.push({url,id:navId});
      lastURL=url;lastTitle=document.title;
      pendingVisit={type:"VISIT",url,title:document.title,navigationId:navId,kind,referrer:document.referrer};retryAt=0;
    }else if(force){pendingVisit={type:"VISIT",url,title:document.title,navigationId:navId,kind,referrer:document.referrer};retryAt=0;}
    if(!pendingVisit || inFlight || Date.now()<retryAt)return;
    const attempt=pendingVisit;inFlight=true;
    try {
      const result=await call(attempt);
      if(result.accepted!==false && pendingVisit===attempt)pendingVisit=null;
      if(result.accepted===false)retryAt=Date.now()+1000;
      else {failed=null;button?.classList.remove("bad");if(button)button.title="Return to source page";}
      mount();
    }catch(e){retryAt=Date.now()+5000;reportError(e);}finally{inFlight=false;}
  }
  async function updateOptions(){
    try {options=await call({type:"STATUS",lite:true});mount();position();}
    catch(e){if(e.message.includes("Private Browsing")){host?.remove();return;}reportError(e);mount();}
  }
  document.addEventListener("click",e=>{
    if(!e.isTrusted || e.defaultPrevented || e.button!==0 || e.shiftKey || e.altKey)return;
    const a=e.composedPath().find(n=>n instanceof HTMLAnchorElement);
    if(!a || a.hasAttribute("download") || a.getAttribute("role")==="button")return;
    const href=C.webURL(a.href);if(!href)return;
    const target=(a.target||document.querySelector("base[target]")?.target||"").toLowerCase();
    // A layer covering the page that opens another website in a new tab is a pop-up, not a link.
    if(target&&!["_self","_parent","_top"].includes(target)&&popupBlocking()&&!C.sameSite(href,location.href)&&coversPage(a)){
      e.preventDefault();e.stopImmediatePropagation();showPopupNote();return;
    }
    if(options?.settings.paused || options?.excluded)return;
    const google=options?.settings.interceptGoogle && C.resultURL(href,location.href);
    // Normal same-tab links keep their website behavior. Observe the edge only.
    if(!google && target!=="_blank"){
      if(!e.ctrlKey&&!e.metaKey&&["","_self","_top","_parent"].includes(target))call({type:"LINK_INTENT",href,navigationId:navId}).catch(reportError);
      return;
    }
    // Modifier clicks retain native behavior; Safari opener metadata is used if supplied.
    if(e.ctrlKey||e.metaKey)return;
    e.preventDefault();e.stopImmediatePropagation();
    // Finish the source's pending record before opening the new tab.
    (async()=>{
      if(pendingVisit){const r=await call(pendingVisit);if(r.accepted===false)throw Error("The source page is still loading. Please try again.");}
      await call({type:google?"OPEN_RESULT":"OPEN_LINK",href:google||href});
    })().catch(error=>{reportError(Error("Could not confirm opening the link. Check your tabs before trying again. "+error.message));toggle(true);});
  },true);
  window.addEventListener("pageshow",e=>{if(e.persisted){updateOptions();visit(true,"traverse");}});
  window.addEventListener("popstate",()=>visit(false,"traverse"));window.addEventListener("hashchange",()=>visit());
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){updateOptions();visit();}});
  window.addEventListener("resize",position);window.visualViewport?.addEventListener("resize",position);window.visualViewport?.addEventListener("scroll",position);
  browser.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.settings)updateOptions();});
  setInterval(()=>{
    if(document.hidden)return;visit();
    if(document.title!==lastTitle&&navId){lastTitle=document.title;call({type:"TITLE",title:lastTitle,navigationId:navId}).catch(reportError);}
  },750);
  call({type:"STATUS",lite:true}).then(s=>{
    options=s;ready=true;mount();const type=performance.getEntriesByType("navigation")[0]?.type;
    visit(false,type==="back_forward"?"traverse":type==="reload"?"reload":"load");
  }).catch(e=>{if(!e.message.includes("Private Browsing")){reportError(e);mount();}});
})();
