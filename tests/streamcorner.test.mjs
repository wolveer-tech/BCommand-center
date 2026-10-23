import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const worker=readFileSync('worker.js','utf8'),html=readFileSync('public/index.html','utf8');
const vars=JSON.parse(readFileSync('wrangler.jsonc','utf8')).vars;
function server(){
 const context=vm.createContext({URL,URLSearchParams,fetch:()=>assert.fail('The website reader must not contact the old or protected feed'),caches:{default:{match:()=>assert.fail('Do not use cached streams from the old provider')}}});
 vm.runInContext(worker.slice(worker.indexOf('function normaliseBaseUrl('),worker.indexOf('function mediaBaseUrl(')),context);return context;
}
test('Provider 2 becomes StreamCorner and ignores old feed settings while preserving the other providers',()=>{
 const context=server(),env={...vars,LIVE_PROVIDER_2_NAME:'Old provider',LIVE_PROVIDER_2_BASE_URL:'https://timst.top',LIVE_PROVIDER_2_MODE:'dynamic',LIVE_PROVIDER_2_ALLOWED_EMBED_HOSTS:'ehgembxe.cfd'};
 const providers=context.configuredLiveProviders(env);assert.deepEqual(Array.from(providers,p=>p.id),['1','2','3','4','5']);assert.equal(providers[1].name,'StreamCorner');assert.equal(providers[1].mode,'embedded');assert.equal(providers[1].hostname,'streamcorner.st');assert.equal(providers[2].name,'SportsindX');
 assert.equal(vars.LIVE_PROVIDER_2_BASE_URL,'https://streamcorner.st');assert.equal(vars.LIVE_PROVIDER_2_DYNAMIC_PATH,'');assert.equal(vars.LIVE_PROVIDER_2_ALLOWED_DATA_HOSTS,'');
});
test('StreamCorner exposes a fixed website action with zero fabricated matches and no upstream request',async()=>{
 const context=server();for(const category of ['soccer','tennis','athletics']){
  const result=await context.liveContentStreams(vars,category,'https://test/api/live-content',false,'2');assert.equal(result.browserUrl,'https://streamcorner.st/');assert.equal(result.mode,'embedded');assert.equal(result.category,category);assert.equal(result.count,0);assert.equal(result.streams.length,0);
 }
});
function client(payload){
 const nodes={'#liveFootballStatus':{textContent:''},'#liveFootballGrid':{innerHTML:''}},prefs=new Map([['cc_live_auto_last_football','2']]);let closes=0;
 const context=vm.createContext({console,liveFootballLoadGeneration:0,liveFootballProviderId:'2',liveFootballResolvedProviderId:'',liveFootballStreams:[{id:'old-player'}],liveFootballProviders:[{id:'1',name:'TitaniumStream',mode:'titanium'},{id:'2',name:'StreamCorner',mode:'embedded'},{id:'3',name:'SportsindX',mode:'sportsindx'}],localStorage:{getItem:key=>prefs.get(key),setItem:(key,value)=>prefs.set(key,value)},qs:id=>nodes[id],liveSportKind:()=>'football',liveSportDisplay:()=>'Football',updateLiveSportStreamingUi:()=>{},renderLiveFootballProviders:()=>{},fetchLiveProviderForSport:async()=>payload,closeLiveFootball:()=>{closes++},esc:value=>String(value||'')});
 vm.runInContext(html.slice(html.indexOf('function liveAutoProviderOrder('),html.indexOf('function renderLiveFootballSources(')),context);return {context,nodes,get closes(){return closes}};
}
test('Auto skips StreamCorner’s website action even when Provider 2 was the previous preferred feed',()=>{
 const {context}=client();assert.deepEqual(Array.from(context.liveAutoProviderOrder('football')),['1','3']);
});
test('selecting StreamCorner offers its own reader, clears stale streams and requires an explicit click to open',async()=>{
 const h=client({mode:'embedded',providerName:'StreamCorner',browserUrl:'https://streamcorner.st/',streams:[]});await h.context.loadLiveFootball();
 assert.equal(h.context.liveFootballStreams.length,0);assert.equal(h.closes,1);assert.equal(h.nodes['#liveFootballStatus'].textContent,'StreamCorner • Choose a source');assert.match(h.nodes['#liveFootballGrid'].innerHTML,/data-open-streamcorner/);assert.match(h.nodes['#liveFootballGrid'].innerHTML,/Browse &amp; watch/);assert.match(h.nodes['#liveFootballGrid'].innerHTML,/opens in this tab/);assert.doesNotMatch(h.nodes['#liveFootballGrid'].innerHTML,/<iframe|href=|target=|data-live-stream-index|timst|ehgembxe/);
});
test('a manipulated website action cannot open a different host',async()=>{
 const h=client({mode:'embedded',browserUrl:'https://streamcorner.st.attacker.test/',streams:[]});await h.context.loadLiveFootball();assert.match(h.nodes['#liveFootballStatus'].textContent,/unsupported website address/);assert.equal(h.nodes['#liveFootballGrid'].innerHTML,'');assert.equal(h.closes,0);
});
