/* Panel styles. The panel imitates Liquid Glass with CSS: a translucent tint, blur of the
   page behind it, edge highlights and a soft shadow. Native Liquid Glass is not available to web content. */
globalThis.SearchTrailCSS=`
:host {all:initial;direction:ltr;color-scheme:light dark;}
* {box-sizing:border-box;} [hidden] {display:none!important;}
.st {
  --glass:rgba(246,248,253,.68);--glass-edge:rgba(255,255,255,.75);--sheen:rgba(255,255,255,.55);
  --fill:rgba(255,255,255,.5);--fill-hover:rgba(255,255,255,.72);--fill-strong:rgba(255,255,255,.9);--line:rgba(24,38,72,.1);
  --text:#0f1728;--muted:#4f5b72;--accent:#0a63f0;--accent-soft:rgba(10,99,240,.12);--accent-text:#0b4fc0;
  --danger:#b3123a;--good:#16704a;--shadow:rgba(12,22,48,.26);
  font:15px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;color:var(--text);direction:ltr;text-align:left;unicode-bidi:isolate;-webkit-font-smoothing:antialiased;
}
.panel {
  position:relative;isolation:isolate;
  background:var(--glass);
  -webkit-backdrop-filter:blur(26px) saturate(1.9);backdrop-filter:blur(26px) saturate(1.9);
  border:1px solid var(--glass-edge);border-radius:30px;
  box-shadow:inset 0 1px 1px var(--sheen),inset 0 -1px 1px rgba(255,255,255,.18),0 20px 50px var(--shadow),0 2px 8px rgba(12,22,48,.1);
  padding:14px;width:var(--sheet-width,min(400px,calc(100vw - 16px)));height:var(--sheet-height,min(480px,56dvh));
  display:flex;flex-direction:column;overflow:hidden;
  transform-origin:var(--sheet-origin,bottom center);animation:st-in .2s cubic-bezier(.2,.9,.3,1.15);
}
.panel::before {content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:-1;
  background:linear-gradient(155deg,rgba(255,255,255,.42),rgba(255,255,255,0) 34%,rgba(255,255,255,0) 72%,rgba(255,255,255,.16));}
@keyframes st-in {from{opacity:0;transform:translateY(10px) scale(.96);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){.panel{animation:none;}.launcher,.launcher.pressed{transition:none;}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.st{--glass:rgba(246,248,253,.97);}}
@media (prefers-reduced-transparency:reduce){.st{--glass:rgba(246,248,253,.98);}}
.popup .panel {width:370px;max-width:100vw;height:min(580px,95dvh);border-radius:0;border:0;box-shadow:inset 0 1px 1px var(--sheen);animation:none;}
.body {flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 4px;}
h1 {font-size:20px;font-weight:700;margin:0;letter-spacing:-.4px;}h2{font-size:15px;font-weight:650;margin:4px 0;}p{margin:8px 0;}
.muted{color:var(--muted);font-size:12px;overflow-wrap:anywhere;}
.row{display:flex;gap:8px;align-items:center;}.top{flex:none;margin-bottom:10px;}.close{margin-left:auto;min-height:44px;padding:6px 14px;border-radius:999px;}
button,input,select{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;}
button{cursor:pointer;border:1px solid var(--line);border-radius:14px;background:var(--fill);color:var(--text);padding:9px 12px;min-height:44px;
  box-shadow:inset 0 1px 0 var(--sheen);transition:background-color .12s,transform .12s;}
button:active:not(:disabled){transform:scale(.97);background:var(--fill-hover);}
button:disabled{opacity:.5;cursor:default;}
button.primary{background:linear-gradient(180deg,#2f80ff,var(--accent));color:#fff;border:0;width:100%;font-weight:600;border-radius:16px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 3px rgba(10,99,240,.35);}
input[type=search]{width:100%;padding:10px 14px;border:1px solid var(--line);border-radius:999px;background:var(--fill);color:var(--text);margin:0 0 4px;font-size:16px;box-shadow:inset 0 1px 2px rgba(12,22,48,.08);}
.visits{list-style:none;margin:6px 0;padding:0;}.visit{border-top:1px solid var(--line);padding:6px 0;display:flex;gap:6px;align-items:center;}
.open{background:transparent;border:0;box-shadow:none;text-align:left;padding:7px;flex:1;min-width:0;max-width:100%;width:100%;}
.title{display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext;}
.url{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px;direction:ltr;unicode-bidi:isolate;}
.time{display:block;font-size:11px;color:var(--muted);margin-top:3px;direction:ltr;unicode-bidi:isolate;}
.delete{padding:4px 10px;background:transparent;box-shadow:none;color:var(--danger);border:0;font-size:19px;}
.error{flex:none;max-height:70px;overflow:auto;color:var(--danger);font-size:12px;white-space:pre-wrap;margin:0 0 6px;}.error:empty{display:none;}.good{color:var(--good);font-size:12px;}
label{display:flex;gap:8px;align-items:center;margin:14px 0;font-size:13px;}.setting{justify-content:space-between;}
.setting select{max-width:62%;min-height:44px;background:var(--fill);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:6px 10px;font-size:16px;}
.setting input{max-width:55%;accent-color:var(--accent);}input[type=checkbox]{accent-color:var(--accent);width:18px;height:18px;}
.controls{display:flex;flex-wrap:wrap;gap:8px;}.danger{color:var(--danger);}.empty{padding:14px 4px;color:var(--muted);}.load{width:100%;margin-bottom:6px;}
.nav{display:flex;gap:2px;padding:4px;margin-top:10px;flex:none;border-radius:999px;background:var(--fill);border:1px solid var(--line);box-shadow:inset 0 1px 2px rgba(12,22,48,.06);}
.nav button{flex:1;border:0;background:transparent;box-shadow:none;font-size:13px;font-weight:600;min-height:44px;border-radius:999px;color:var(--muted);}
.nav button[aria-current=true]{background:var(--fill-strong);color:var(--accent-text);box-shadow:0 1px 4px rgba(12,22,48,.14),inset 0 1px 0 var(--sheen);}
.tree,.tree ul{list-style:none;padding:0;margin:0;}.tree ul{margin-left:12px;padding-left:10px;border-left:1px solid var(--line);}.tree ul.deep{margin-left:0;padding-left:0;border-left:0;}
.tree li{position:relative;margin:6px 0;}.tree ul>li:before{content:"";position:absolute;left:-10px;top:22px;width:10px;border-top:1px solid var(--line);}
.tree .open{background:var(--fill);border:1px solid var(--line);border-radius:14px;box-shadow:inset 0 1px 0 var(--sheen);}
.tree .on-path>.open{background:var(--accent-soft);border-color:rgba(10,99,240,.28);}
.tree .current>.open{border:2px solid var(--accent);background:var(--accent-soft);}.badge{display:block;font-size:11px;color:var(--accent-text);margin-top:3px;font-weight:600;}
/* Floating buttons: clear glass (blur of the page behind, light edge, faint outline and shadow
   so they stay findable on white and dark pages) with a coloured symbol. */
.dock{position:relative;display:flex;flex-direction:column;gap:8px;width:50px;height:108px;}
.launcher{all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:50px;height:50px;flex:none;border-radius:18px;
  background:rgba(255,255,255,.1);-webkit-backdrop-filter:blur(3px) saturate(1.8);backdrop-filter:blur(3px) saturate(1.8);
  border:1px solid rgba(255,255,255,.55);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.7),inset 0 -1px 1px rgba(255,255,255,.15),0 0 0 .5px rgba(15,25,45,.16),0 6px 16px rgba(15,25,45,.16);
  color:#1a6dff;font:600 25px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;direction:ltr;overflow:hidden;
  transition:transform .09s ease-out,background-color .12s,width .2s ease,margin .2s ease,border-radius .2s ease;}
.launcher.pressed{transform:scale(.88);background:rgba(255,255,255,.3);}
.menu-launcher{font-size:21px;}
.menu-launcher.swiping{transition:none;}
.menu-launcher.tucked{width:14px;margin-left:48px;border-radius:7px;font-size:0;}
.menu-launcher.tucked.edge-left{margin-left:-12px;}
.menu-launcher.tucked::after{content:"";width:3px;height:20px;border-radius:2px;background:#1a6dff;opacity:.6;}
[data-dock=bottom] .panel:not(.popup-panel){padding-bottom:110px;}
/* The lower row remains useful for navigation next to the overlapping floating controls. */
[data-dock=bottom] .nav{position:absolute;bottom:10px;left:calc(10px + var(--dock-left));right:calc(10px + var(--dock-right));margin:0;display:grid;grid-template-columns:1fr 1fr;border-radius:18px;gap:0;padding:0;}
[data-dock=bottom] .nav button{font-size:12px;min-height:44px;padding:4px 3px;}
[data-dock=bottom] .panel:not(.popup-panel){padding-bottom:110px;}
[data-dock=top] .top{padding-left:var(--dock-left);padding-right:var(--dock-right);min-height:56px;flex-wrap:wrap;}
[data-dock=top] .top h1{font-size:16px;}
.fold{font-size:11px;min-height:32px;padding:5px 8px;margin-top:4px;}
.save{min-width:44px;padding:4px;font-size:20px;}
.launcher.bad{color:#e5484d;}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #72a1ff;outline-offset:2px;}
@media(prefers-color-scheme:dark){
  .launcher{color:#4c8dff;border-color:rgba(255,255,255,.35);}.launcher.bad{color:#ff6b81;}.menu-launcher.tucked::after{background:#4c8dff;}
  .st{--glass:rgba(30,34,46,.62);--glass-edge:rgba(255,255,255,.16);--sheen:rgba(255,255,255,.14);
    --fill:rgba(255,255,255,.08);--fill-hover:rgba(255,255,255,.14);--fill-strong:rgba(255,255,255,.18);--line:rgba(255,255,255,.1);
    --text:#f1f4fa;--muted:#a9b3c7;--accent:#3d8bff;--accent-soft:rgba(61,139,255,.2);--accent-text:#a9ccff;--danger:#ff8fa6;--good:#86dab4;--shadow:rgba(0,0,0,.5);}
  .panel::before{background:linear-gradient(155deg,rgba(255,255,255,.14),rgba(255,255,255,0) 34%,rgba(255,255,255,0) 72%,rgba(255,255,255,.06));}
  .tree .on-path>.open{border-color:rgba(61,139,255,.4);}
  @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.st{--glass:rgba(30,34,46,.97);}}
}
@media (prefers-color-scheme:dark) and (prefers-reduced-transparency:reduce){.st{--glass:rgba(30,34,46,.98);}}
`;
