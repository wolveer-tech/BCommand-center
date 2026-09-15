import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const start=worker.indexOf('async function getFootballMatchCentre('),end=worker.indexOf('\n}',start)+2;
test('followed match cache is isolated, expires after ten seconds, and preserves null scores',async()=>{
 let now=0,calls=0;const stored=new Map();
 const context=vm.createContext({URL,URLSearchParams,Request,Response,Date,FOTMOB_ID_PREFIX:800000000000,SOFASCORE_ID_PREFIX:900000000000,
  getFotmobFootballMatch:async()=>{calls++;return {match:{id:800000000001,status:'IN_PLAY',score:{fullTime:{home:calls,away:null}}},teams:[],events:[],statistics:[]}},
  caches:{default:{match:async req=>{const row=stored.get(req.url);return row&&row.until>now?row.response.clone():undefined},put:async(req,response)=>stored.set(req.url,{response:response.clone(),until:now+Number(response.headers.get('cache-control').match(/max-age=(\d+)/)[1])*1000})}}
 });
 vm.runInContext(worker.slice(start,end),context);
 const get=live=>context.getFootballMatchCentre({},800000000001,false,'https://example.test/api/football/match?matchId=800000000001'+(live?'&live=1':''));
 assert.equal((await get(false)).match.score.fullTime.home,1);
 assert.equal((await get(true)).match.score.fullTime.home,2,'Live request reused ordinary cache');
 now=5000;assert.equal((await get(true)).match.score.fullTime.home,2,'Shared live cache was bypassed');
 now=11000;const fresh=await get(true);assert.equal(fresh.match.score.fullTime.home,3,'Live cache stayed stale');assert.equal(fresh.match.score.fullTime.away,null);
 assert.equal((await get(false)).match.score.fullTime.home,1,'Live path unexpectedly replaced ordinary cache');
});
test('widget UI waits for acknowledgement and reports timeout instead of claiming success',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const start=html.indexOf('function syncNativeDashboard('),end=html.indexOf('function queueNativeDashboardSync',start);
 const statuses=[],toasts=[],posts=[],timers=[];
 const context=vm.createContext({nativeDashboardSyncTimer:null,nativeSyncTimeout:null,nativeSyncNotice:false,stateSafety:{ready:true},
  nativeDashboardSupported:()=>true,nativeMessageHandler:()=>({postMessage:x=>posts.push(x)}),nativeDashboardPayload:()=>({snapshot:{}}),
  updateNativeDashboardStatus:x=>statuses.push(x),toast:x=>toasts.push(x),clearTimeout:()=>{},setTimeout:fn=>{timers.push(fn);return 1}});
 vm.runInContext(html.slice(start,end),context);context.syncNativeDashboard(true);
 assert.equal(posts.length,1);assert.equal(toasts.length,0,'Claimed success before native acknowledgement');assert.match(statuses[0],/Waiting/);
 timers[0]();assert.match(statuses.at(-1),/No confirmation/);
});
