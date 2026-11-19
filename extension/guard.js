"use strict";
/* Pop-up blocker. Runs in every frame at document_start, before the page's own scripts.
   A website may open another website in a new tab only for a link you tap. Script pop-ups
   (window.open) and link clicks made by scripts that would open another website are
   stopped here; tabs that still get through are closed by background.js. */
(function () {
  if(globalThis.__searchTrailGuard || browser.extension?.inIncognitoContext)return;
  globalThis.__searchTrailGuard=true;
  const C=SearchTrailCore,isTop=window.top===window;
  // Pop-ups are judged by the website in the address bar, also inside its frames.
  const topURL=(()=>{
    try {return window.top.location.href;} catch {}
    const origins=location.ancestorOrigins;
    return origins&&origins.length?origins[origins.length-1]+"/":document.referrer||location.href;
  })();
  let settings=null;
  browser.storage.local.get("settings").then(r=>{settings=r?.settings||{};},()=>{settings={};});
  browser.storage.onChanged.addListener((changes,area)=>{if(area==="local"&&changes.settings)settings=changes.settings.newValue||{};});
  const blocking=()=>settings?.blockPopups!==false&&!C.excluded(topURL,settings?.popupAllowedHosts||[]);
  let tap={at:0,href:null},reportedAt=0,notedAt=0;
  function blocked() {
    if(Date.now()-notedAt<1000)return;notedAt=Date.now();
    if(isTop)document.dispatchEvent(new CustomEvent("searchtrail:blocked"));
    else browser.runtime.sendMessage({type:"POPUP_NOTE"}).catch(()=>{});
  }
  const staysInTab=target=>!target||target==="_self"||target==="_parent"||target==="_top";
  // Same website, a blob: document made by the page, or the link you just tapped.
  function allowed(url,target) {
    if(!blocking()||staysInTab(String(target||"").toLowerCase()))return true;
    let abs;try {abs=new URL(String(url??""),location.href);} catch {return false;}
    if(abs.protocol==="blob:")return true;
    const web=C.webURL(abs.href);if(!web)return false;
    if(C.sameSite(web,topURL))return true;
    return Date.now()-tap.at<1500&&!!tap.href&&C.sameSite(tap.href,web);
  }
  document.addEventListener("searchtrail:open",e=>{
    let url="",target="_blank";
    try {[url,target]=JSON.parse(e.detail);} catch {}
    if(!allowed(url,target||"_blank")){e.preventDefault();blocked();}
  },true);
  // Your taps on the page (not on SearchTrail's own buttons) are remembered, and reported so
  // background.js can tell a pop-up tab from a tab you opened yourself.
  function onTap(e) {
    if(!e.isTrusted)return;
    const path=e.composedPath();
    if(path.some(n=>n instanceof Element&&n.hasAttribute("data-searchtrail")))return;
    const a=path.find(n=>n instanceof HTMLAnchorElement);
    tap={at:Date.now(),href:a?C.webURL(a.href):null};
    if(blocking()&&Date.now()-reportedAt>300){reportedAt=Date.now();browser.runtime.sendMessage({type:"TAP",href:tap.href}).catch(()=>{});}
  }
  window.addEventListener("pointerdown",onTap,true);
  window.addEventListener("click",onTap,true);
  // Link clicks made by a script, not by you, that would open another website in a new tab.
  window.addEventListener("click",e=>{
    if(e.isTrusted||!blocking())return;
    const a=e.composedPath().find(n=>n instanceof HTMLAnchorElement);if(!a)return;
    const target=(a.target||document.querySelector("base[target]")?.target||"").toLowerCase();
    if(staysInTab(target)||allowed(a.href,target))return;
    e.preventDefault();e.stopImmediatePropagation();blocked();
  },true);
  // Runs in the page itself: window.open asks first and gets null when the pop-up is blocked.
  function pageHook() {
    const nativeOpen=window.open,dispatch=EventTarget.prototype.dispatchEvent,Ev=CustomEvent,doc=document,toJSON=JSON.stringify;
    window.open=function open(url,target,features) {
      const ok=dispatch.call(doc,new Ev("searchtrail:open",{cancelable:true,detail:toJSON([String(url??""),target==null?"_blank":String(target)])}));
      return ok?nativeOpen.apply(this,arguments):null;
    };
  }
  try {
    const script=document.createElement("script");
    script.textContent="("+pageHook+")();";
    (document.documentElement||document.head)?.append(script);script.remove();
  } catch {}
  // A freshly opened tab reports at once, so a pop-up can be closed before it finishes loading.
  if(isTop&&history.length<=2)browser.runtime.sendMessage({type:"FRESH_TAB"}).catch(()=>{});
})();
