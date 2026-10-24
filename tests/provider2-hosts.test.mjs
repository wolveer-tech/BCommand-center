import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const env=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')).vars;
const context=vm.createContext({URL});
vm.runInContext(worker.slice(worker.indexOf('function normaliseBaseUrl'),worker.indexOf('function safeHttpsUrl')),context);
const cfg=context.liveProviderConfig(env,'2'),base=new URL(cfg.baseUrl);

test('Provider 2 keeps only its fixed StreamCorner host',()=>{
  assert.equal(context.allowedEmbedUrl('https://streamcorner.st/stream/example',base,cfg),true);
  assert.equal(context.allowedEmbedUrl('https://www.streamcorner.st/stream/example',base,cfg),true);
});

test('Provider 2 rejects former feed hosts, misleading suffixes and non-HTTPS players',()=>{
  for(const url of ['https://ehgembxe.cfd/embed/1','https://epiembeds.online/embed/old','https://unrelated.example/player','https://streamcorner.st.attacker.example/player','http://streamcorner.st/player']){
    assert.equal(context.allowedEmbedUrl(url,base,cfg),false,url);
  }
});
