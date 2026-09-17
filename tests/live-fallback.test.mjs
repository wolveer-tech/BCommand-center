import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('async function refreshNativeLiveActivities(');
const source=html.slice(start,html.indexOf('\nwindow.CommandCentreSyncNativeDashboard',start));
const fixture=(id,home=1)=>({id,status:'IN_PLAY',kickoff:Date.now()-60000,score:{fullTime:{home,away:0}}});
async function run(detail,schedule){
 const messages=[],calls=[],initial=[fixture(1),fixture(2)];
 const context=vm.createContext({console:{warn(){}},document:{visibilityState:'visible'},navigator:{onLine:true},URLSearchParams,
  nativeDashboardSupported:()=>true,nativeLiveActivityRefreshPromise:null,nativeLiveMatches:new Map(initial.map(m=>[m.id,m])),
  effectiveFollowedMatchIDs:()=>[1,2],nativeFootballMatchPayload:extra=>extra||initial,
  footballMatchRuntime:{matchId:0},appCurrentPage:'home',nativeMessageHandler:()=>({postMessage:message=>messages.push(message)}),
  fetchJson:async url=>{calls.push(url);return url==='/api/football/schedule'?await schedule():await detail(Number(new URL('https://test'+url).searchParams.get('matchId')))}
 });
 vm.runInContext(source,context);
 const result=await context.refreshNativeLiveActivities();return {result,messages,calls,context};
}
test('match-detail success stays fresh and does not request the slower schedule',async()=>{
 const result=await run(async id=>({match:fixture(id,3)}),()=>{throw Error('Should not fetch')});
 assert.equal(result.result,true);assert.equal(result.calls.length,2);assert.equal(result.messages[0].matches[0].score.fullTime.home,3);
});
test('failed detail falls back per match without overwriting successful fresh scores',async()=>{
 const result=await run(async id=>{if(id===2)throw Error('Provider unavailable');return {match:fixture(id,3)}},async()=>({matches:[fixture(1,0),fixture(2,2)]}));
 assert.equal(result.result,true);assert.equal(result.calls.length,3);
 assert.deepEqual(Array.from(result.messages[0].matches,m=>[m.id,m.score.fullTime.home]),[[1,3],[2,2]]);
});
test('network failure preserves last known live scores and releases the refresh lock',async()=>{
 const result=await run(async()=>{throw Error('Offline')},async()=>{throw Error('Offline')});
 assert.equal(result.result,false);assert.equal(result.context.nativeLiveMatches.get(1).score.fullTime.home,1);
 assert.equal(result.context.nativeLiveActivityRefreshPromise,null);
});
test('wrong match responses cannot overwrite the requested game',async()=>{
 const result=await run(async()=>({match:fixture(99)}),async()=>({matches:[fixture(1),fixture(2)]}));
 assert.equal(result.context.nativeLiveMatches.has(99),false);assert.equal(result.messages[0].matches.length,2);
});
test('unknown match minute stays unknown in the native payload',()=>{
 const begin=html.indexOf('function nativeFootballMatchPayload('),end=html.indexOf('function nativeDashboardPayload',begin);
 const context=vm.createContext({effectiveFollowedMatchIDs:()=>[1],footballAllScheduleMatches:()=>[{...fixture(1),minute:null,utcDate:new Date().toISOString()}],nativeLiveMatches:new Map(),footballTeamName:()=>''});
 vm.runInContext(html.slice(begin,end),context);
 assert.equal(context.nativeFootballMatchPayload()[0].minute,null);
});
