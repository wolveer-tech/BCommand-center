import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const env=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8')).vars;
const context=vm.createContext({URL});
vm.runInContext(worker.slice(worker.indexOf('function normaliseBaseUrl'),worker.indexOf('function safeHttpsUrl')),context);
const cfg=context.liveProviderConfig(env,'2'),base=new URL(cfg.baseUrl);

test('Provider 2 accepts all four returned streams on its updated player host',()=>{
  for(let i=1;i<=4;i++){
    const sources=context.allowedStreamSources({sources:[{url:`https://ehgembxe.cfd/embed/${i}`,label:'Main'}]},base,cfg);
    assert.equal(sources.length,1);
  }
  assert.equal(context.allowedEmbedUrl('https://epiembeds.online/embed/old',base,cfg),true);
});

test('Provider 2 still rejects unrelated hosts, misleading suffixes and non-HTTPS players',()=>{
  for(const url of ['https://unrelated.example/player','https://ehgembxe.cfd.attacker.example/player','https://fakeehgembxe.cfd/player','http://ehgembxe.cfd/player']){
    assert.equal(context.allowedEmbedUrl(url,base,cfg),false,url);
  }
});
