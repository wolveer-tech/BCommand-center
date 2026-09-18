import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../public/football-following.js';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const extract=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
test('large schedule is normalised once, with cached following invalidated by preferences and live data',()=>{
 let normalised=0,followCalls=0;
 const matches=Array.from({length:5000},(_,id)=>({id:id+1,utcDate:new Date().toISOString(),homeTeam:{id:1,name:'Home '+id},awayTeam:{id:2,name:'Away'},status:'IN_PLAY'}));
 const state={footballFavouriteTeams:[{id:1,name:'Home'}],footballFollowedMatches:[],footballExcludedMatches:[]};
 const context=vm.createContext({state,footballScheduleCache:{matches},footballCache:{matches:[]},nativeLiveMatches:new Map(),footballTeamName:t=>t.name,footballTeamKey:name=>{normalised++;return name},CommandCentreFootballFollowing:{followed:(...args)=>{followCalls++;return globalThis.CommandCentreFootballFollowing.followed(...args)}}});
 vm.runInContext(extract('let footballScheduleDerived=','function footballLineupPlayerHtml')+extract('let footballFollowCache=','function nativeLivePreferences'),context);
 for(let i=0;i<1000;i++)context.effectiveFollowedMatchIDs();
 assert.equal(normalised,10000);assert.ok(followCalls<=2,'Repeatedly rebuilt following list');
 state.footballAutoFollowTeams=false;assert.equal(context.effectiveFollowedMatchIDs().length,0);
 context.nativeLiveMatches.set(1,{...matches[0],minute:90});assert.equal(context.footballAllScheduleMatches()[0].minute,90);
});
function loader(){
 const pending=[],status={},selection={value:'PL'},painted=[];
 const context=vm.createContext({qs:id=>id==='#footballCompetition'?selection:status,state:{footballCompetition:'PL'},appCurrentPage:'football',setTimeout,URLSearchParams,
  nowIso:()=>new Date().toISOString(),saveState(){},renderFootball:()=>painted.push(context.footballCache?.competition),FOOTBALL_COMPETITIONS:{PL:'Premier League',BL1:'Bundesliga'},
  fetchJson:url=>new Promise((resolve,reject)=>pending.push({url,resolve,reject})),persistFootballSchedule(){},queueNativeDashboardSync(){},refreshNativeLiveActivities(){},nativeNotificationsSupported:()=>false,
  footballCache:{competition:'PL',matches:[{id:99}]},footballScheduleCache:{matches:[{id:99}]}
 });
 vm.runInContext(extract('let footballLoadPromise=','let foundationRefreshPromise'),context);
 return {context,pending,status,selection,painted};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
test('sport displays league before slow schedule arrives and shares duplicate requests',async()=>{
 const h=loader(),first=h.context.loadFootball(),second=h.context.loadFootball();await tick();assert.equal(h.pending.length,2);
 h.pending[0].resolve({matches:[{id:1}],standings:[]});await tick();assert.equal(h.context.footballCache.matches[0].id,1);assert.ok(h.painted.length>=2);
 h.pending[1].reject(Error('Schedule offline'));await Promise.all([first,second]);assert.equal(h.context.footballScheduleCache.matches[0].id,99);
});
test('old league response cannot overwrite a newer selection',async()=>{
 const h=loader(),old=h.context.loadFootball();await tick();h.selection.value='BL1';const next=h.context.loadFootball();await tick();
 h.pending[2].resolve({matches:[{id:2}],standings:[]});h.pending[3].resolve({matches:[{id:2}]});await next;
 h.pending[0].resolve({matches:[{id:1}]});h.pending[1].resolve({matches:[{id:1}]});await old;
 assert.equal(h.context.footballCache.competition,'BL1');assert.equal(h.context.footballScheduleCache.matches[0].id,2);
});
