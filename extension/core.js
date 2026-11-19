/* Shared pure rules; also loaded by the Node tests. */
(function (root) {
  "use strict";
  function webURL(value) {
    try {
      const u = new URL(value);
      return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
    } catch { return null; }
  }
  function googleHost(host) {
    return /^(www\.)?google\.(com|cat|[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(host);
  }
  function searchKey(value) {
    if (!webURL(value)) return null;
    const u = new URL(value);
    if (!googleHost(u.hostname) || u.pathname !== "/search" || !u.searchParams.get("q")) return null;
    const p = new URLSearchParams();
    for (const name of ["q", "tbm", "udm", "start", "tbs", "hl", "gl", "chips"]) {
      if (u.searchParams.has(name)) p.set(name, u.searchParams.get(name));
    }
    return u.origin + "/search?" + p;
  }
  function resultURL(href, from) {
    if (!searchKey(from)) return null;
    let u;
    try { u = new URL(href, from); } catch { return null; }
    if (googleHost(u.hostname)) {
      if (u.pathname !== "/url") return null;
      const target = u.searchParams.get("url") || u.searchParams.get("q");
      if (!webURL(target)) return null;
      u = new URL(target);
    }
    if (googleHost(u.hostname)) return null;
    return webURL(u.href);
  }
  function excluded(value, hosts) {
    if (!webURL(value)) return true;
    const host = new URL(value).hostname.toLowerCase();
    return hosts.some(h => host === h || host.endsWith("." + h));
  }
  // Page identity: the same address is the same page, ignoring the part after "#". For a
  // Google search, the search itself (words, tab, results page) decides, because Google
  // changes the rest of its address on its own.
  function pageKey(value) {
    const url=webURL(value);if(!url)return null;
    const key=searchKey(url);if(key)return key;
    const u=new URL(url);u.hash="";return u.href;
  }
  function samePage(a, b) {
    const key=pageKey(a);return !!key && key===pageKey(b);
  }
  // Website identity for pop-up blocking: the registrable part of the host name, so
  // "www.example.com" and "files.example.com" are one website. Country endings such as
  // "co.uk" or "com.eg" keep one more label.
  const SECOND_LEVEL=new Set(["co","com","net","org","gov","edu","ac","or","ne","go","gob","mil","nic"]);
  function siteOf(value) {
    const url=webURL(value);if(!url)return null;
    const host=new URL(url).hostname.toLowerCase().replace(/\.$/,"");
    if(/^[\d.]+$/.test(host)||host.includes(":"))return host;
    const parts=host.split(".");if(parts.length<=2)return host;
    const tld=parts[parts.length-1],sld=parts[parts.length-2];
    return parts.slice(tld.length===2&&SECOND_LEVEL.has(sld)?-3:-2).join(".");
  }
  function sameSite(a, b) {
    const site=siteOf(a);return !!site && site===siteOf(b);
  }
  function sameSearch(source, currentURL, rootState) {
    return !!source && searchKey(source.url) === searchKey(currentURL) &&
      source.token === rootState?.rootToken;
  }
  const api = {webURL, searchKey, resultURL, excluded, sameSearch, pageKey, samePage, siteOf, sameSite};
  root.SearchTrailCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
