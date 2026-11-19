globalThis.SearchTrailCSS = `
:host { all: initial; color-scheme: light dark; }
* { box-sizing: border-box; }
.st { font: 15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#172238; }
.panel { background:#f5f7fc; border:1px solid #dbe1ee; border-radius:22px; box-shadow:0 12px 60px #13253d40; padding:16px; width:min(390px,calc(100vw - 20px)); max-height:min(700px,calc(100dvh - 180px)); overflow:auto; }
.popup .panel { width:370px; max-width:100%; max-height:100vh; border:0; box-shadow:none; border-radius:0; }
h1 {font-size:21px;margin:0;letter-spacing:-.6px;} p {margin:8px 0;} .muted {color:#5d6c84;font-size:12px;}
.row {display:flex;gap:8px;align-items:center;justify-content:space-between;} .top {margin-bottom:12px;}
button,input {font:inherit;} button {cursor:pointer;border:1px solid #cad4e6;border-radius:12px;background:#fff;color:#1d3557;padding:10px 12px;min-height:42px;} button:disabled {opacity:.55;cursor:default;}
button.primary {background:#245de0;color:white;border:0;width:100%;font-weight:600;} input[type=search] {width:100%;padding:12px;border:1px solid #cad4e6;border-radius:12px;background:white;color:#172238;margin:12px 0 6px;font-size:16px;}
.visits {list-style:none;margin:8px 0;padding:0;} .visit {border-top:1px solid #dbe1ee;padding:10px 0;display:flex;gap:8px;align-items:center;}
.open {background:transparent;border:0;text-align:left;padding:0;flex:1;min-width:0;}.title {display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.url {display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5d6c84;font-size:12px;}.time {display:block;font-size:11px;color:#5d6c84;margin-top:3px;}
.delete {padding:4px 10px;background:transparent;color:#7c4554;border:0;font-size:19px;}.error {color:#aa193a;font-size:13px;white-space:pre-wrap;} .good {color:#196042;font-size:12px;}
details {margin-top:12px;border-top:1px solid #dbe1ee;padding-top:12px;} summary {cursor:pointer;font-weight:600;} label {display:flex;gap:8px;align-items:center;margin:12px 0;font-size:13px;}
.controls {display:flex;flex-wrap:wrap;gap:8px;} .danger {color:#a21e3b;} .empty {padding:20px 4px;color:#5d6c84;} .load {width:100%;}
.launcher {all:initial;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:50px;height:50px;background:#245de0;color:white;border-radius:18px;box-shadow:0 4px 18px #12285244;font:bold 23px -apple-system,sans-serif;cursor:pointer;touch-action:none;border:2px solid #ffffffaa;}
.launcher.bad {background:#a21e3b;} button:focus-visible,input:focus-visible {outline:3px solid #72a1ff;outline-offset:2px;}
@media(prefers-color-scheme:dark) {.st{color:#e8edf8;}.panel{background:#151d2c;border-color:#344058;}button,input[type=search]{background:#222f46;color:#eef3ff;border-color:#43516c;}.muted,.url,.time,.empty{color:#aebbd3;}.visit,details{border-color:#344058;}.error{color:#ff9caf;}.good{color:#87d9b6;}}
`;
