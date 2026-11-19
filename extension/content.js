"use strict";
(function () {
  if (window.top !== window || globalThis.__searchTrailLoaded || browser.extension?.inIncognitoContext) return;
  globalThis.__searchTrailLoaded = true;
  const C = SearchTrailCore;
  let host, shadow, button, panelRoot, ui, open=false, options, lastURL, navId, lastTitle, failed, pendingVisit, inFlight=false, retryAt=0;
  async function call(message) {
    const response = await browser.runtime.sendMessage(message);
    if (!response?.ok) throw Error(response?.error || "SearchTrail could not reach its background process.");
    return response.data;
  }
  function reportError(e) {failed=e.message; if(button) {button.classList.add("bad");button.title=failed;} ui?.error(failed);}
  function toggle(value) {
    open=value; panelRoot.hidden=!open; button.setAttribute("aria-expanded",String(open));
    if (open) {if (!ui) ui=SearchTrailUI(panelRoot,call,{onClose:()=>toggle(false)}); else ui.refresh(); if(failed) ui.error(failed);}
  }
  function mount() {
    if (host?.isConnected) return;
    host=document.createElement("div");
    host.style.cssText="position:fixed!important;right:14px!important;bottom:100px!important;z-index:2147483647!important;display:block!important;";
    shadow=host.attachShadow({mode:"closed"});
    const style=document.createElement("style");style.textContent=SearchTrailCSS;shadow.append(style);
    panelRoot=document.createElement("div");panelRoot.style.cssText="position:fixed;right:10px;bottom:160px;";panelRoot.hidden=true;shadow.append(panelRoot);
    button=document.createElement("button");button.className="launcher";button.textContent="↩";button.title="SearchTrail";button.setAttribute("aria-label","Open SearchTrail");button.setAttribute("aria-expanded","false");shadow.append(button);
    button.onclick=()=>{if(!dragged)toggle(!open);};
    let start, dragged=false;
    button.onpointerdown=e=>{dragged=false;const r=host.getBoundingClientRect();start={x:e.clientX,y:e.clientY,left:r.left,top:r.top};button.setPointerCapture(e.pointerId);};
    button.onpointermove=e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>8)dragged=true;if(!dragged)return;
      host.style.setProperty("right","auto","important");host.style.setProperty("bottom","auto","important");
      host.style.setProperty("left",Math.max(0,Math.min(innerWidth-52,start.left+dx))+"px","important");
      host.style.setProperty("top",Math.max(0,Math.min(innerHeight-52,start.top+dy))+"px","important");};
    button.onpointerup=()=>{start=null;};button.onpointercancel=()=>{start=null;};
    document.documentElement.append(host); if(failed)reportError(Error(failed));
  }
  async function visit(force=false) {
    const url=location.href;
    if (force || url!==lastURL) {
      lastURL=url;navId=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join("-");lastTitle=document.title;
      pendingVisit={type:"VISIT",url,title:document.title,navigationId:navId};retryAt=0;
    }
    if (!pendingVisit || inFlight || Date.now()<retryAt) return;
    const attempt=pendingVisit;inFlight=true;
    try {
      const result=await call(attempt);
      if(result.accepted!==false && pendingVisit===attempt)pendingVisit=null;
      if(result.accepted===false)retryAt=Date.now()+1000;
      else {failed=null;button?.classList.remove("bad");if(button)button.title="SearchTrail";}
      mount();
    } catch(e) {retryAt=Date.now()+5000;reportError(e);} finally {inFlight=false;}
  }
  async function updateOptions() {
    try {const status=await call({type:"STATUS"});options=status; mount();} catch(e) {
      // No UI or data collection in private tabs, even if the user enabled this extension there.
      if (e.message.includes("Private Browsing")) {host?.remove();return;}
      reportError(e); mount();
    }
  }
  document.addEventListener("click", e => {
    if (!e.isTrusted || e.defaultPrevented || e.button!==0 || e.shiftKey || e.altKey || !options?.settings.interceptGoogle || options.excluded || !C.searchKey(location.href)) return;
    const a=e.composedPath().find(n=>n instanceof HTMLAnchorElement);
    if (!a || a.hasAttribute("download")) return;
    const href=C.resultURL(a.href,location.href); if(!href)return;
    e.preventDefault();e.stopImmediatePropagation();
    call({type:"OPEN_RESULT",href}).catch(error=>{
      // No blind retry: tab creation might already have succeeded. Keep the Google page intact.
      reportError(Error("Could not confirm opening the result. Check your tabs, or temporarily switch off result opening in SearchTrail. " + error.message));
      toggle(true);
    });
  },true);
  window.addEventListener("pageshow",e=>{if(e.persisted){updateOptions();visit(true);}});
  window.addEventListener("popstate",()=>visit());window.addEventListener("hashchange",()=>visit());
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){updateOptions();visit();}});
  browser.storage.onChanged.addListener((changes,area)=>{if(area==="local" && changes.settings)updateOptions();});
  setInterval(()=>{
    if(document.hidden)return;
    visit();
    if(document.title!==lastTitle && navId){lastTitle=document.title;call({type:"TITLE",title:lastTitle,navigationId:navId}).catch(reportError);}
  },1000);
  // Start only after the background has checked the tab's private status.
  call({type:"STATUS"}).then(s=>{options=s;mount();visit();}).catch(e=>{
    if(!e.message.includes("Private Browsing")){reportError(e);mount();}
  });
})();
