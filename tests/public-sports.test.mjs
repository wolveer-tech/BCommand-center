import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseMatchoraFeed,parsePpvFeed,parseTimStreamsFeed,fetchPublicSports} from '../sports-providers.js';
const match={id:'123',home:'Alpha',away:'Beta',sport:'Soccer',league:'League',kickoff:1800000000,embed_url:'https://matchora.to/embed/match/123',channels:[{name:'Channel',embed_url:'https://matchora.to/embed/channel/456'},{dead:true,embed_url:'https://matchora.to/embed/channel/789'}]};
const ppv={id:22,name:'Alpha vs Beta',ends_at:200,iframe:'https://taifood-blog.asia/embed/football/a-b',substreams:[{source_tag:'Alternate',iframe:'https://taifood-blog.asia/embed/football/a-b-2'}]};
test('Matchora preserves match metadata and available channel choices',()=>{const result=parseMatchoraFeed({events:[match,match]});assert.equal(result.streams.length,1);assert.equal(result.streams[0].name,'Alpha vs Beta');assert.equal(result.streams[0].sources.length,2);assert.equal(result.streams[0].match_timestamp,1800000000);});
test('Matchora separates sports and excludes finished matches and untrusted embeds',()=>{
 const bad=['http://matchora.to/embed/match/123','https://matchora.to.evil.test/embed/match/123','https://user@matchora.to/embed/match/123','https://matchora.to:8443/embed/match/123','https://matchora.to/watch/123'];
 assert.equal(parseMatchoraFeed({events:bad.map(embed_url=>({...match,embed_url}))}).streams.length,0);
 assert.equal(parseMatchoraFeed({events:[{...match,finished:true},{...match,sport:'American Football'}]}).streams.length,0);
 assert.equal(parseMatchoraFeed({events:[{...match,sport:'Tennis'}]},'tennis').streams.length,1);
 assert.equal(parseMatchoraFeed({events:[match]},'athletics').streams.length,0);
});
test('PPV separates football from American football and preserves alternate players',()=>{
 const result=parsePpvFeed({streams:[{category:'American Football',streams:[ppv]},{category:'Football',streams:[ppv]}]},'soccer',100);
 assert.equal(result.streams.length,1);assert.equal(result.streams[0].sources[1].label,'Alternate');
});
test('PPV removes expired fixtures and rejects malformed or unrelated player URLs',()=>{
 const streams=[{...ppv,ends_at:90},{...ppv,id:23,ends_at:90,always_live:1},{...ppv,id:24,iframe:'https://taifood-blog.asia.evil.test/embed/x',substreams:[]}];
 assert.deepEqual(parsePpvFeed({streams:[{category:'Football',streams}]},'soccer',100).streams.map(s=>s.id),['23']);
 assert.equal(parsePpvFeed({streams:[{category:'Football',streams}]},'tennis',100).streams.length,0);
});
test('TimStreams shows soccer games and validated player choices, without American football or VIP entries',()=>{
 const event={url:'home-v-away-123',name:'Home @ Away',genre:1,sub_genre:13,time:'2026-10-24T07:30',streams:[{name:'Main',url:'https://ehgembxe.cfd/abcd-123'},{name:'Alternate',url:'https://ehgembxe.cfd/efgh-456'},{name:'Wrong host',url:'https://ehgembxe.cfd.evil.test/abcd-123'}]};
 const data={genres:[{id:1,name:'Soccer',sub_categories:[{id:13,name:'English Football League'}]},{id:8,name:'American Football'}],events:[event,{...event,url:'vip-game',vip:true},{...event,url:'american-game',genre:8},{...event,url:'bad-slug/../../',streams:[{name:'Main',url:'https://ehgembxe.cfd/abcd-123'}]}]};
 const result=parseTimStreamsFeed(data,'soccer');assert.equal(result.streams.length,1);assert.equal(result.streams[0].name,'Home @ Away');assert.equal(result.streams[0].league,'English Football League');assert.equal(result.streams[0].match_timestamp,Date.parse('2026-10-24T11:30:00Z')/1000);assert.deepEqual(result.streams[0].sources.map(s=>s.label),['Main','Alternate']);
 assert.equal(parseTimStreamsFeed(data,'tennis').streams.length,0);
});
test('provider requests time out, reject redirects and use the PPV backup on a feed failure',async()=>{
 const urls=[];const result=await fetchPublicSports('ppv','soccer',{fetcher:async(url,options)=>{urls.push(url);assert.equal(options.redirect,'manual');assert.ok(options.signal);if(url.includes('.tj/'))throw Error('unavailable');return Response.json({streams:[]});}});
 assert.equal(result.streams.length,0);assert.deepEqual(urls,['https://api.ppv.tj/api/streams','https://api.ppv.st/api/streams']);
 await assert.rejects(fetchPublicSports('matchora','soccer',{fetcher:async()=>new Response('',{status:503})}),/503/);
 await assert.rejects(fetchPublicSports('matchora','soccer',{fetcher:async()=>new Response(null,{status:302,headers:{location:'https://unrelated.example'}})}),/302/);
});
test('public sports sources are additive and require no extra Worker variables',()=>{
 const worker=readFileSync('worker.js','utf8'),start=worker.indexOf('function cleanProviderId('),end=worker.indexOf('function allowedEmbedUrl(',start);
 const context=vm.createContext({URL,normaliseBaseUrl:value=>value?new URL(value):null});vm.runInContext(worker.slice(start,end),context);
 const list=context.configuredLiveProviders({LIVE_PROVIDER_1_BASE_URL:'https://one.example',LIVE_PROVIDER_2_BASE_URL:'https://two.example'});
 assert.deepEqual(Array.from(list,p=>p.id),['1','2','3','4','5','6']);assert.equal(list[3].name,'Matchora');assert.equal(list[4].hostname,'ppv.tj');assert.equal(list[5].hostname,'tim-streams.com');assert.equal(list[5].mode,'timstreams');
});
