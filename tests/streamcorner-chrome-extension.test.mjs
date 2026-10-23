import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const extension='chrome-extension/streamcorner-guard/';
const manifest=JSON.parse(readFileSync(extension+'manifest.json','utf8'));
const rules=JSON.parse(readFileSync(extension+'rules.json','utf8'));

test('the extension has no page scripts, host access, remote code, or data APIs',()=>{
  assert.deepEqual(readdirSync(extension).sort(),['README.md','manifest.json','rules.json']);
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.minimum_chrome_version,'145');
  assert.deepEqual(manifest.permissions,['declarativeNetRequest']);
  for(const key of ['content_scripts','host_permissions','optional_host_permissions',
    'background','web_accessible_resources','externally_connectable','update_url']){
    assert.equal(Object.hasOwn(manifest,key),false,`${key} must be absent`);
  }
  assert.deepEqual(manifest.declarative_net_request.rule_resources,[
    {id:'streamcorner_popunder',enabled:true,path:'rules.json'}
  ]);
});

test('the only rule blocks the exact observed popunder loader as a script',()=>{
  assert.equal(rules.length,1);
  assert.equal(rules[0].action.type,'block');
  assert.deepEqual(rules[0].condition.resourceTypes,['script']);
  const rule=new RegExp(rules[0].condition.regexFilter,'i');
  assert.equal(rule.test('https://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js?v=1'),true);
  for(const other of [
    'https://cdn.jsdelivr.net/npm/bitmovin-player@8/player.js',
    'https://cdn.jsdelivr.net.evil.test/gh/senbonzakura000/jambalaya/bootstrap.min.js',
    'https://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js-other',
    'http://cdn.jsdelivr.net/gh/senbonzakura000/jambalaya/bootstrap.min.js'
  ]) assert.equal(rule.test(other),false,other);
});

test('the block is limited to listed top-level source domains',()=>{
  const domains=rules[0].condition.topDomains;
  assert.ok(domains.includes('streamcorner.st'));
  assert.ok(domains.includes('embedindia.st'));
  assert.ok(domains.every(domain=>/^[a-z0-9.-]+$/.test(domain)));
  assert.equal(new Set(domains).size,domains.length);
  assert.equal(domains.some(domain=>domain.includes('bcommand-center')||domain==='*'),false);
  assert.equal(Object.hasOwn(rules[0].condition,'excludedTopDomains'),false);
});
