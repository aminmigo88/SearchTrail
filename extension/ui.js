"use strict";
globalThis.SearchTrailUI = function (root, call, {onClose = () => {}, popup = false} = {}) {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const style = el("style"); style.textContent = SearchTrailCSS; root.append(style);
  const box = el("section", "st panel" + (popup ? " popup-panel" : "")); root.append(box);
  box.setAttribute("aria-label", "SearchTrail visit history");
  const top = el("div", "row top"); top.append(el("h1", "", "SearchTrail"));
  const close = el("button", "", "Close"); close.onclick = onClose; if (!popup) top.append(close); box.append(top);
  const back = el("button", "primary", "Return to search"); box.append(back);
  const sourceText = el("p", "muted"); box.append(sourceText);
  const status = el("p", "good"); box.append(status);
  const error = el("p", "error"); error.setAttribute("role", "status"); box.append(error);
  const query = el("input"); query.type = "search"; query.placeholder = "Find a title or website…"; query.setAttribute("aria-label", "Search recorded visits"); box.append(query);
  const count = el("p", "muted"); box.append(count);
  const list = el("ul", "visits"); box.append(list);
  const load = el("button", "load", "Show more visits"); box.append(load);
  const details = el("details"); details.append(el("summary", "", "Controls & backup")); box.append(details);
  const paused = el("input"); paused.type = "checkbox"; const pl = el("label"); pl.append(paused, document.createTextNode("Pause recording")); details.append(pl);
  const intercept = el("input"); intercept.type = "checkbox"; const il = el("label"); il.append(intercept, document.createTextNode("Open Google result links in new tabs")); details.append(il);
  const controls = el("div", "controls"); details.append(controls);
  const exclude = el("button", "", "Exclude this site"); const exportBtn = el("button", "", "Export JSON"); const clear = el("button", "danger", "Delete visit log"); controls.append(exclude, exportBtn, clear);
  details.append(el("p", "muted", "Local visit log • No automatic deletion • Private tabs excluded. Records begin after installation on permitted websites. This is separate from Safari History."));
  let limit = 100, generation = 0, timer;
  async function action(fn) { error.textContent = ""; try { return await fn(); } catch (e) {error.textContent = e.message; return null;} }
  async function refresh() {
    const g = ++generation;
    await action(async () => {
      const [s, data] = await Promise.all([call({type:"STATUS"}), call({type:"LIST", query:query.value, limit})]);
      if (g !== generation) return;
      back.disabled = !s.source;
      back.textContent = !s.source ? "No search linked to this tab" : s.canReturn ? "↩ Return to search" : "Reopen saved search";
      back.onclick = () => action(async () => { await call({type:s.canReturn ? "RETURN" : "REOPEN"}); onClose(); });
      sourceText.textContent = s.source ? s.source.title : "Open a result from Google to link it to its search.";
      status.textContent = s.settings.paused ? "Recording paused" : s.excluded ? "This site is excluded from recording" : "Recording permitted, non-private webpages";
      paused.checked = s.settings.paused; intercept.checked = s.settings.interceptGoogle;
      exclude.textContent = s.settings.excludedHosts.includes(s.host) ? "Include this site" : "Exclude this site";
      count.textContent = `${data.items.length} shown · ${data.matches} matching · ${data.total} visits saved`;
      list.replaceChildren();
      if (!data.items.length) list.append(el("li", "empty", "No recorded visits match yet."));
      for (const v of data.items) {
        const row = el("li", "visit"), open = el("button", "open"), del = el("button", "delete", "×");
        open.append(el("span", "title", v.title || v.url), el("span", "url", v.url), el("span", "time", new Date(v.at).toLocaleString()));
        open.title = v.url; open.onclick = () => action(async () => {await call({type:"OPEN_VISIT",id:v.id}); onClose();});
        del.setAttribute("aria-label", "Delete visit: " + (v.title || v.url));
        del.onclick = () => action(async () => {await call({type:"DELETE",id:v.id}); await refresh();});
        row.append(open,del); list.append(row);
      }
      load.hidden = data.items.length >= data.matches; load.disabled = limit >= 20000;
    });
  }
  query.oninput = () => {clearTimeout(timer); timer=setTimeout(() => {limit=100;refresh();},180);};
  load.onclick = () => {limit+=100;refresh();};
  paused.onchange = () => action(async () => {await call({type:"SETTINGS",paused:paused.checked});await refresh();});
  intercept.onchange = () => action(async () => {await call({type:"SETTINGS",interceptGoogle:intercept.checked});await refresh();});
  exclude.onclick = () => action(async () => {await call({type:"EXCLUDE"});await refresh();});
  clear.onclick = () => action(async () => {if (confirm("Delete every SearchTrail visit? Safari History will not change.")) {await call({type:"CLEAR"});await refresh();}});
  exportBtn.onclick = () => action(async () => {
    const data = await call({type:"EXPORT"});
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob), link = el("a"); link.href=url; link.download="SearchTrail-visits-"+new Date().toISOString().slice(0,10)+".json";
    box.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),60000);
  });
  refresh();
  return {refresh, error:message => {error.textContent=message;}};
};
