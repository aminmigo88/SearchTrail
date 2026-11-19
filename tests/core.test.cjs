const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../extension/core.js');
test('search matching keeps query, type and pagination, ignores tracking',()=>{
  assert.equal(C.searchKey('https://www.google.com/search?q=air&ved=123'),C.searchKey('https://www.google.com/search?q=air&ved=456'));
  assert.notEqual(C.searchKey('https://www.google.com/search?q=air'),C.searchKey('https://www.google.com/search?q=air&start=10'));
  assert.equal(C.searchKey('https://www.google.com.evil.test/search?q=air'),null);
  assert.equal(C.searchKey('https://google.com/url?q=air'),null);
  assert.ok(C.searchKey('https://www.google.com.tn/search?q=air'));
});
test('only HTTP links without embedded credentials are accepted',()=>{
  for(const s of ['javascript:alert(1)','data:text/html,a','file:///tmp/foo','https://user:pass@example.com'])assert.equal(C.webURL(s),null);
});
test('Google redirect links are unwrapped, internal links are not intercepted',()=>{
  const from='https://www.google.com/search?q=air';
  assert.equal(C.resultURL('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fair',from),'https://example.com/air');
  assert.equal(C.resultURL('/search?q=other',from),null);
  assert.equal(C.resultURL('/url?q=javascript:alert(1)',from),null);
});
test('site exclusions match host boundaries',()=>{
  assert.equal(C.excluded('https://sub.example.com/a',['example.com']),true);
  assert.equal(C.excluded('https://notexample.com/a',['example.com']),false);
});
test('same address is the same page; the part after # is ignored; a new path is a different page',()=>{
  assert.equal(C.samePage('https://wiki.example/Article','https://wiki.example/Article#History'),true);
  assert.equal(C.samePage('https://wiki.example/Article#Intro','https://wiki.example/Article#History'),true);
  assert.equal(C.samePage('https://wiki.example/Article','https://wiki.example/Article/Talk'),false);
  assert.equal(C.samePage('https://shop.example/list?page=1','https://shop.example/list?page=2'),false);
  assert.equal(C.samePage('javascript:alert(1)','javascript:alert(1)'),false);
});
test('a Google search is the same page while the search itself is unchanged',()=>{
  const g='https://www.google.com/search?q=%D8%A7%D9%88%D9%82%D8%A7%D8%AA';
  assert.equal(C.samePage(g,g+'&sei=abc&sca_esv=1#fpstate=ive&vld=cid:1'),true);
  assert.equal(C.samePage(g,'https://www.google.com/search?q=other'),false);
  assert.equal(C.samePage(g,g+'&tbm=isch'),false);
  assert.equal(C.samePage(g,g+'&start=10'),false);
});
