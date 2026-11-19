"use strict";
(async()=>{
  try {
    const [tab]=await browser.tabs.query({active:true,currentWindow:true});
    if(!tab)throw Error("Open a website first.");
    const call=async message=>{
      const r=await browser.runtime.sendMessage({...message,tabId:tab.id});
      if(!r?.ok)throw Error(r?.error || "Could not reach SearchTrail.");
      return r.data;
    };
    await call({type:"STATUS"});
    SearchTrailUI(document.body,call,{popup:true,onClose:()=>window.close()});
  } catch(e) {document.body.textContent=e.message;}
})();
