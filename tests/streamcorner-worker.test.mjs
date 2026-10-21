import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('the deployed Worker routes expose StreamCorner without fetching a protected feed or stale Provider 2',async t=>{
 const bundle=await build({entryPoints:['worker.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const mf=new Miniflare(convertV4MiniflareOptions({name:'streamcorner-runtime',modules:true,compatibilityDate:'2026-08-31',script:bundle.outputFiles[0].text,bindings:JSON.parse(readFileSync('wrangler.jsonc','utf8')).vars,outboundService:()=>assert.fail('No upstream request expected')}));t.after(()=>mf.dispose());
 const response=await mf.dispatchFetch('https://test/api/live-content/providers');assert.equal(response.status,200);const providers=(await response.json()).providers;assert.equal(providers.find(p=>p.id==='2').hostname,'streamcorner.st');
 const source=await mf.dispatchFetch('https://test/api/live-content?provider=2&category=soccer');assert.equal(source.status,200);const data=await source.json();assert.equal(data.providerName,'StreamCorner');assert.equal(data.browserUrl,'https://streamcorner.st/');assert.deepEqual(data.streams,[]);
});
