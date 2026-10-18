import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('public/index.html','utf8'),source=html.slice(html.indexOf('async function fetchLiveProviderForSport('),html.indexOf('function liveAutoProviderOrder('));
test('PPV falls back to its device feed on an empty or failed server response while other providers retain their errors',async()=>{
 let response={streams:[]},calls=0;const context=vm.createContext({URLSearchParams,liveSportCategory:kind=>kind==='tennis'?'tennis':'soccer',liveFootballSource1Backup:false,fetchJson:async()=>{if(response instanceof Error)throw response;return response;},fetchPpvOnDevice:async category=>{calls++;assert.equal(category,'tennis');return {streams:[{id:'device'}]};}});vm.runInContext(source,context);
 assert.equal((await context.fetchLiveProviderForSport('5','tennis')).streams[0].id,'device');
 response=Error('Provider rejected server');assert.equal((await context.fetchLiveProviderForSport('5','tennis')).streams[0].id,'device');
 await assert.rejects(context.fetchLiveProviderForSport('4','tennis'),/Provider rejected/);assert.equal(calls,2);
 response={streams:[{id:'server'}]};assert.equal((await context.fetchLiveProviderForSport('5','tennis')).streams[0].id,'server');assert.equal(calls,2);
});
