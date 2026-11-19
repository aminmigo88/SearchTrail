/* Only this background context writes storage. Serialize mutations to avoid lost visits. */
"use strict";
const B = browser;
const C = SearchTrailCore;
const DEFAULTS = {paused: false, interceptGoogle: true, excludedHosts: []};
let work = Promise.resolve();
function queue(fn) {
  const next = work.then(fn);
  work = next.catch(() => {});
  return next;
}
const id = () => crypto.randomUUID();
const stateKey = tabId => "tab:" + tabId;
async function state(tabId) {
  if (!B.storage.session) throw Error("SearchTrail requires Safari 16.4 or newer session storage.");
  return (await B.storage.session.get(stateKey(tabId)))[stateKey(tabId)] || {};
}
async function putState(tabId, value) { await B.storage.session.set({[stateKey(tabId)]: value}); }
async function settings() { return {...DEFAULTS, ...(await B.storage.local.get("settings")).settings}; }
async function safeTab(tabId) {
  const tab = await B.tabs.get(tabId);
  if (tab.incognito || B.extension?.inIncognitoContext) throw Error("SearchTrail is off in Private Browsing.");
  return tab;
}
async function sourceFor(tab) {
  const s = await state(tab.id);
  const key = C.searchKey(tab.url);
  if (key) {
    if (s.rootKey !== key || !s.rootToken) {
      s.rootKey = key; s.rootToken = id(); s.source = null;
      await putState(tab.id, s);
    }
    return {tabId: tab.id, token: s.rootToken, url: tab.url, title: tab.title || "Google search"};
  }
  if (s.source) return s.source;
  if (Number.isInteger(tab.openerTabId) && tab.openerTabId !== tab.id) {
    // Read only one opener: avoid cycles and avoid guessing from the last active tab.
    try {
      const parent = await safeTab(tab.openerTabId);
      if (C.searchKey(parent.url)) return await sourceFor(parent);
      return (await state(parent.id)).source || null;
    } catch { return null; }
  }
  return null;
}
async function sourceStatus(tab) {
  const source = (await state(tab.id)).source;
  if (!source || !C.searchKey(source.url)) return {source: null, canReturn: false};
  try {
    const target = await safeTab(source.tabId);
    const original = await state(source.tabId);
    return {source, canReturn: C.sameSearch(source, target.url, original)};
  } catch { return {source, canReturn: false}; }
}
async function newTab(url, source) {
  const options = {url, active: true};
  // Do not depend on openerTabId being supported; explicit source mapping is authoritative.
  const created = await B.tabs.create(options);
  if (created.incognito) throw Error("SearchTrail is off in Private Browsing.");
  await putState(created.id, {source: source || null});
  return created;
}
async function allVisits() {
  const values = await B.storage.local.get(null);
  return Object.entries(values).filter(([k]) => k.startsWith("visit:")).map(([,v]) => v)
    .sort((a,b) => b.at - a.at || b.id.localeCompare(a.id));
}
async function handle(message, sender) {
  if (!message || typeof message.type !== "string") throw Error("Invalid request.");
  const fromPage = !!sender.tab;
  const tabId = fromPage ? sender.tab.id : message.tabId;
  if (!Number.isInteger(tabId)) throw Error("Open SearchTrail on a normal website first.");
  const tab = await safeTab(tabId);
  if (fromPage && sender.frameId && sender.frameId !== 0) throw Error("Top frame only.");
  const opt = await settings();
  const s = await state(tabId);
  switch (message.type) {
    case "STATUS": return {...await sourceStatus(tab), settings: opt, host: C.webURL(tab.url) ? new URL(tab.url).hostname : "", excluded: C.excluded(tab.url, opt.excludedHosts)};
    case "VISIT": {
      if (!fromPage || typeof message.navigationId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(message.navigationId)) throw Error("Invalid visit.");
      // Message URL must belong to the sending document. Never accept a page-supplied arbitrary URL.
      const url = C.webURL(message.url);
      if (!url || url !== C.webURL(tab.url)) return {recorded: false, accepted: false};
      const source = await sourceFor(tab);
      const current = await state(tabId);
      if (C.searchKey(url)) {
        current.source = null;
      } else {
        current.source = current.source || source;
        // Leaving the original search invalidates that original tab token.
        current.rootKey = null; current.rootToken = null;
      }
      if (current.navigationId === message.navigationId) return {recorded: false};
      current.navigationId = message.navigationId;
      current.url = url;
      current.lastVisitKey = null;
      if (!opt.paused && !C.excluded(url, opt.excludedHosts)) {
        const visitId = message.navigationId;
        const visit = {id: visitId, url, title: String(message.title || tab.title || url).slice(0,1000), at: Date.now(), source: current.source || null};
        const key = "visit:" + visitId;
        const existing = (await B.storage.local.get(key))[key];
        if (!existing) await B.storage.local.set({[key]: visit});
        current.lastVisitKey = key;
      }
      await putState(tabId, current);
      return {recorded: !!current.lastVisitKey};
    }
    case "TITLE": {
      if (!fromPage || opt.paused || C.excluded(tab.url, opt.excludedHosts) || s.navigationId !== message.navigationId || !s.lastVisitKey) return {};
      const saved = (await B.storage.local.get(s.lastVisitKey))[s.lastVisitKey];
      if (saved && saved.url === tab.url) await B.storage.local.set({[s.lastVisitKey]: {...saved, title: String(message.title || saved.title).slice(0,1000)}});
      return {};
    }
    case "OPEN_RESULT": {
      if (!fromPage || !opt.interceptGoogle || C.excluded(tab.url, opt.excludedHosts)) throw Error("Result opening is disabled.");
      const url = C.resultURL(message.href, tab.url);
      if (!url) throw Error("Not an external Google result link.");
      const source = await sourceFor(tab);
      await newTab(url, source);
      return {};
    }
    case "RETURN": {
      const status = await sourceStatus(tab);
      if (!status.source) throw Error("No originating search was recorded for this tab.");
      if (!status.canReturn) throw Error("The original search tab closed or changed. Use Reopen saved search.");
      // One final read avoids activating a tab that changed while the panel was open.
      const target = await safeTab(status.source.tabId);
      if (!C.sameSearch(status.source, target.url, await state(target.id))) throw Error("The original search changed.");
      await B.tabs.update(target.id, {active: true});
      return {};
    }
    case "REOPEN": {
      if (!s.source || !C.searchKey(s.source.url)) throw Error("No saved search.");
      const created = await newTab(s.source.url, null);
      const source = await sourceFor({...created, url: s.source.url});
      await putState(tabId, {...s, source});
      return {};
    }
    case "LIST": {
      const items = await allVisits();
      const q = String(message.query || "").toLowerCase().slice(0,500);
      const matches = items.filter(v => !q || (v.title + " " + v.url).toLowerCase().includes(q));
      const limit = Math.max(100, Math.min(Number(message.limit) || 100, 20000));
      return {items: matches.slice(0,limit), total: items.length, matches: matches.length};
    }
    case "OPEN_VISIT": {
      const key = "visit:" + String(message.id);
      const item = (await B.storage.local.get(key))[key];
      if (!item || !C.webURL(item.url)) throw Error("This visit is no longer saved.");
      await newTab(item.url, item.source); return {};
    }
    case "DELETE": await B.storage.local.remove("visit:" + String(message.id)); return {};
    case "CLEAR": {
      const values = await B.storage.local.get(null);
      await B.storage.local.remove(Object.keys(values).filter(k => k.startsWith("visit:")));
      return {};
    }
    case "EXPORT": return {format: "SearchTrail", version: 1, exportedAt: new Date().toISOString(), visits: await allVisits()};
    case "SETTINGS": {
      const patch = {};
      if (typeof message.paused === "boolean") patch.paused = message.paused;
      if (typeof message.interceptGoogle === "boolean") patch.interceptGoogle = message.interceptGoogle;
      await B.storage.local.set({settings: {...opt, ...patch}});
      return {};
    }
    case "EXCLUDE": {
      if (!C.webURL(tab.url)) throw Error("Open a website first.");
      const host = new URL(tab.url).hostname.toLowerCase();
      const hosts = opt.excludedHosts.includes(host) ? opt.excludedHosts.filter(h => h !== host) : [...opt.excludedHosts, host];
      await B.storage.local.set({settings: {...opt, excludedHosts: hosts}});
      return {};
    }
    default: throw Error("Unknown action.");
  }
}
B.runtime.onMessage.addListener((message, sender) => queue(() => handle(message, sender))
  .then(data => ({ok: true, data}), error => ({ok: false, error: error.message || String(error)})));
B.tabs.onCreated.addListener(tab => {
  if (tab.incognito || !Number.isInteger(tab.openerTabId)) return;
  queue(async () => {
    const existing = await state(tab.id);
    if (existing.source) return;
    const parent = await safeTab(tab.openerTabId);
    const source = await sourceFor(parent);
    if (source) await putState(tab.id, {...existing, source});
  }).catch(() => {});
});
B.tabs.onRemoved.addListener(tabId => queue(() => B.storage.session?.remove(stateKey(tabId))).catch(() => {}));
B.runtime.onStartup.addListener(() => queue(() => B.storage.session?.clear()).catch(() => {}));
