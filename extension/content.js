"use strict";
(function () {
  if(window.top!==window || globalThis.__searchTrailLoaded || browser.extension?.inIncognitoContext)return;
  globalThis.__searchTrailLoaded=true;
  const C=SearchTrailCore;
  const makeId=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join("-");
  let host,shadow,button,menuButton,dock,panelRoot,ui,open=false,options,lastURL,navId,lastTitle,failed,pendingVisit,inFlight=false,retryAt=0,dragging=false,ready=false;
  const routes=[];
  async function call(message) {
    const response=await browser.runtime.sendMessage(message);
    if(!response?.ok)throw Error(response?.error||"SearchTrail could not reach its background process.");
    return response.data;
  }
  const uiCall=call;
  function reportError(e) {failed=e.message;if(button){button.classList.add("bad");button.title=failed;}ui?.error(failed);}
  function viewport() {const v=window.visualViewport;return {x:v?.offsetLeft||0,y:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};}
  function position() {
    if(!host || dragging)return;
    const v=viewport(),placement=options?.settings.placement||"bottom-right",clearance=options?.settings.clearance??16;
    const left=placement.endsWith("left"),top=placement.startsWith("top");
    const y=v.y+(top?clearance:Math.max(8,v.height-50-clearance)),x=v.x+(left?12:Math.max(8,v.width-120));
    host.style.setProperty("left",x+"px","important");host.style.setProperty("top",y+"px","important");
    const panelWidth=Math.min(400,v.width-16),panelHeight=Math.min(560,Math.max(180,v.height*.68),v.height-16);
    const panelY=top?v.y+8:v.y+v.height-panelHeight-8;
    panelRoot.style.cssText=`position:fixed;z-index:0;left:${v.x+(v.width-panelWidth)/2}px;top:${panelY}px;--sheet-width:${panelWidth}px;--sheet-height:${panelHeight}px;--sheet-origin:${top?"top":"bottom"} center;direction:ltr;`;
    // Reserve only the occupied corner of the footer/header, not a blank strip below the sheet.
    panelRoot.dataset.dock=top?"top":"bottom";
    panelRoot.style.setProperty("--dock-left",left?"128px":"0px");
    panelRoot.style.setProperty("--dock-right",left?"0px":"128px");
    dock.style.zIndex="2";

  }
  function toggle(value,view="trail") {
    open=value;panelRoot.hidden=!open;menuButton.setAttribute("aria-expanded",String(open));menuButton.textContent=open?"×":"☰";menuButton.setAttribute("aria-label",open?"Close SearchTrail menu":"Open SearchTrail menu");
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
    host=document.createElement("div");host.setAttribute("dir","ltr");
    host.style.cssText="all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;direction:ltr!important;";
    shadow=host.attachShadow({mode:"closed"});const style=document.createElement("style");style.textContent=SearchTrailCSS;shadow.append(style);
    panelRoot=document.createElement("div");panelRoot.hidden=true;shadow.append(panelRoot);
    button=document.createElement("button");button.className="launcher";button.textContent="↩";button.title="Return to source page";
    button.setAttribute("aria-label","Return to source page");
    dock=document.createElement("div");dock.className="dock";
    menuButton=document.createElement("button");menuButton.className="launcher menu-launcher";menuButton.textContent="☰";menuButton.title="Open SearchTrail menu";
    menuButton.setAttribute("aria-label","Open SearchTrail menu");menuButton.setAttribute("aria-expanded","false");
    menuButton.onclick=()=>toggle(!open);dock.append(button,menuButton);shadow.append(dock);
    let start,timer,held=false,suppressUntil=0;
    const press=on=>button.classList.toggle("pressed",on);
    function cancel(){clearTimeout(timer);start=null;dragging=false;press(false);}
    button.onpointerdown=e=>{
      if(e.button!==0)return;
      const r=host.getBoundingClientRect();held=false;dragging=false;start={x:e.clientX,y:e.clientY,left:r.left,top:r.top};
      button.setPointerCapture(e.pointerId);press(true);
      timer=setTimeout(()=>{if(start&&!dragging){held=true;toggle(true);}},500);
    };
    button.onpointermove=e=>{
      if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;
      if(Math.abs(dx)+Math.abs(dy)>10){dragging=true;clearTimeout(timer);press(false);}
      if(!dragging)return;const v=viewport();
      host.style.setProperty("left",Math.max(v.x+4,Math.min(v.x+v.width-112,start.left+dx))+"px","important");
      host.style.setProperty("top",Math.max(v.y+4,Math.min(v.y+v.height-54,start.top+dy))+"px","important");
    };
    button.onpointerup=e=>{
      if(!start)return;clearTimeout(timer);press(false);suppressUntil=Date.now()+800;
      const moved=dragging;start=null;dragging=false;
      if(moved){
        const v=viewport(),r=host.getBoundingClientRect(),top=r.top+25<v.y+v.height/2;
        const placement=(top?"top-":"bottom-")+(r.left+25<v.x+v.width/2?"left":"right");
        const clearance=Math.max(8,Math.min(120,Math.round(top?r.top-v.y:v.y+v.height-r.bottom)));
        call({type:"SETTINGS",placement,clearance}).then(updateOptions).catch(reportError);
      }else if(!held)tap();
      if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);
    };
    button.onpointercancel=()=>{suppressUntil=Date.now()+800;cancel();position();};
    button.oncontextmenu=e=>{e.preventDefault();clearTimeout(timer);press(false);held=true;suppressUntil=Date.now()+800;toggle(true);};
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
    if(!e.isTrusted || e.defaultPrevented || e.button!==0 || e.shiftKey || e.altKey || options?.settings.paused || options?.excluded)return;
    const a=e.composedPath().find(n=>n instanceof HTMLAnchorElement);
    if(!a || a.hasAttribute("download") || a.getAttribute("role")==="button")return;
    const href=C.webURL(a.href);if(!href)return;
    const target=(a.target||document.querySelector("base[target]")?.target||"").toLowerCase();
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
