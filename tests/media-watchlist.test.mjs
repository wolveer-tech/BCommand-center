import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function mergeMediaWatchlist('),html.indexOf('function selectedMediaIdentity('));
function harness(saved=true){
  const state={entertainment:{mediaWatchlist:[],mediaHistory:[{id:9,title:'Keep my history'}]}};
  const button={setAttribute(key,value){this[key]=value;}};
  const context=vm.createContext({state,mediaEmbedState:{selected:null},qs:()=>button,nowIso:()=>new Date().toISOString(),saveState:()=>saved,toast:()=>{}});
  vm.runInContext(source+';renderMediaWatchlist=()=>{};',context);return {context,state,button};
}
test('movie and TV watchlists distinguish the same TMDB ID and persist a stable record',()=>{
  const {context:c,state,button}=harness(),movie={id:42,type:'movie',title:'Movie'},tv={id:42,type:'tv',title:'Series'};
  c.mediaEmbedState.selected=movie;assert.equal(c.toggleMediaWatchlist(),true);assert.equal(button['aria-pressed'],'true');
  assert.equal(c.toggleMediaWatchlist(tv),true);assert.equal(state.entertainment.mediaWatchlist.length,2);
  const reloaded=JSON.parse(JSON.stringify(state));assert.deepEqual(reloaded.entertainment.mediaWatchlist.map(x=>x.type),['tv','movie']);
  c.toggleMediaWatchlist(movie);assert.equal(state.entertainment.mediaWatchlist.length,1);assert.equal(state.entertainment.mediaWatchlist[0].type,'tv');
  assert.equal(button['aria-pressed'],'false');assert.equal(state.entertainment.mediaHistory[0].title,'Keep my history');
});
test('watchlist write failure restores the previous list and rejects invalid selections',()=>{
  const {context:c,state}=harness(false);const original=state.entertainment.mediaWatchlist;
  assert.equal(c.toggleMediaWatchlist({id:42,type:'movie',title:'Movie'}),false);assert.equal(state.entertainment.mediaWatchlist,original);
  for(const item of [null,{id:0,type:'movie'},{id:'bad',type:'tv'},{id:3,type:'youtube'}])assert.equal(c.toggleMediaWatchlist(item),false);
});
test('backup watchlist merging retains current titles and separates movie and TV identifiers',()=>{
  const {context:c,state}=harness();c.toggleMediaWatchlist({id:42,type:'movie',title:'Existing movie'});
  c.mergeMediaWatchlist([{id:42,type:'tv',title:'Imported series'},{id:99,type:'movie',title:'Imported movie'},{id:'bad',type:'tv'}]);
  assert.equal(state.entertainment.mediaWatchlist.length,3);assert.equal(state.entertainment.mediaWatchlist[0].title,'Existing movie');
  c.mergeMediaWatchlist(undefined);assert.equal(state.entertainment.mediaWatchlist.length,3);
});
