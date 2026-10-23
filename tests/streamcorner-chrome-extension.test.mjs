import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const extension='chrome-extension/streamcorner-guard/';
const manifest=JSON.parse(readFileSync(extension+'manifest.json','utf8'));
const rules=JSON.parse(readFileSync(extension+'rules.json','utf8'));
const script=readFileSync(extension+'popup-guard.js','utf8');

function page() {
  const navigations=[],popups=[];
  const location={href:'https://streamcorner.st/channels/family-guy',assign:url=>navigations.push(url)};
  const window={location,open:(...args)=>{popups.push(args);return {}}};
  window.top=window;
  const navigator={userActivation:{isActive:false}};
  const listeners=new Map(),document={addEventListener:(name,handler)=>listeners.set(name,handler)};
  vm.runInNewContext(script,{window,location,navigator,document,URL});
  return {window,navigator,navigations,popups,listeners};
}

test('popup guard only runs on named StreamCorner and player sites',()=>{
  assert.deepEqual(manifest.permissions,['declarativeNetRequest']);
  const entry=manifest.content_scripts[0];
  assert.equal(entry.world,'MAIN');
  assert.equal(entry.run_at,'document_start');
  assert.equal(entry.all_frames,true);
  assert.ok(entry.matches.includes('https://streamcorner.st/*'));
  assert.ok(entry.matches.includes('https://embedindia.st/*'));
  assert.ok(entry.matches.every(pattern=>pattern.startsWith('https://')&&!pattern.includes('bcommand-center')));
});

test('observed popunder loader is blocked without blocking unrelated scripts',()=>{
  assert.equal(rules.length,1);
  assert.equal(rules[0].action.type,'block');
  assert.deepEqual(rules[0].condition.resourceTypes,['script']);
  const rule=new RegExp(rules[0].condition.regexFilter);
  assert.equal(rule.test('https://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js?v=1'),true);
  assert.equal(rule.test('https://cdn.jsdelivr.net/npm/bitmovin-player@8/player.js'),false);
  assert.equal(rule.test('https://cdn.jsdelivr.net.evil.test/gh/senbonzakura000/jambalaya/bootstrap.min.js'),false);
});

test('ad popups are suppressed, while a user-selected known source stays in the current window',()=>{
  const h=page();
  assert.equal(h.window.open('https://ad.example/','_blank'),null);
  h.navigator.userActivation.isActive=true;
  assert.equal(h.window.open('https://ad.example/','_blank'),null);
  assert.equal(h.window.open('https://streamcorner.st.evil.test/','_blank'),null);
  assert.equal(h.window.open('javascript:alert(1)','_blank'),null);
  assert.equal(h.window.open('https://embedindia.st/embed/family-guy','_blank'),h.window);
  assert.deepEqual(h.navigations,['https://embedindia.st/embed/family-guy']);
  assert.equal(h.popups.length,0);
});

test('new-tab ad links are blocked and known source links reuse the current window',()=>{
  const h=page(),click=h.listeners.get('click'),events=[];
  const event=(href,isTrusted)=>({target:{closest:()=>({href})},isTrusted,preventDefault:()=>events.push('prevented'),stopImmediatePropagation:()=>events.push('stopped')});
  click(event('https://ad.example/',true));
  click(event('https://embedindia.st/embed/family-guy',false));
  assert.deepEqual(h.navigations,[]);
  click(event('https://embedindia.st/embed/family-guy',true));
  assert.deepEqual(h.navigations,['https://embedindia.st/embed/family-guy']);
  assert.equal(events.length,6);
});
