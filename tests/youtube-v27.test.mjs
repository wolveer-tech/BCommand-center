import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const source=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
test('recommendations use saved videos and meaningful watches, excluding hidden and accidental views',()=>{
 const context=vm.createContext({state:{entertainment:{youtubeWatchLater:[{title:'Saved astronomy'}],youtubeHistoryDetailed:[{id:'brief',title:'Accidental tap',channelTitle:'Skip',progressSeconds:2,durationSeconds:900},{id:'real',title:'Space science',channelTitle:'Science',progressSeconds:120,durationSeconds:900},{id:'blocked',title:'Blocked topic',channelTitle:'Blocked',completed:true}]}},youtubeChannelHidden:name=>name==='Blocked',youtubeTitleKeywords:title=>title,decodeHtmlText:value=>value});
 vm.runInContext(source('function youtubeRecommendationSeeds(){','function youtubeRecommendationFingerprint'),context);
 const seeds=context.youtubeRecommendationSeeds();assert.ok(seeds.some(s=>s.kind==='saved'));assert.ok(seeds.some(s=>s.query==='Science'));assert.ok(!seeds.some(s=>/Blocked|Accidental|Skip/.test(s.query)));
});
test('duplicate titles, saved videos and hidden channels do not fill the mix',()=>{
 const context=vm.createContext({state:{entertainment:{youtubeWatchLater:[{id:'saved'}]}},decodeHtmlText:value=>value,youtubeChannelHidden:name=>name==='Hidden'});
 vm.runInContext(source('function youtubeDiversifyRecommendationGroups(','function youtubeRecommendationSummary'),context);
 const items=context.youtubeDiversifyRecommendationGroups([{items:[{videoId:'a',title:'Same Video!',channelTitle:'A'},{videoId:'b',title:'same video',channelTitle:'B'},{videoId:'saved',channelTitle:'C'},{videoId:'hidden',channelTitle:'Hidden'},{videoId:'other',title:'Different',channelTitle:'D'}]}]);
 assert.deepEqual(Array.from(items,item=>item.videoId),['a','other']);
});

test('ranked recommendations reward strong interests, freshness and channel variety',()=>{
 const context=vm.createContext({
  state:{entertainment:{
   youtubeSearchHistory:['space science'],youtubeWatchLater:[],youtubeHistoryDetailed:[],
   youtubeRecommendationHidden:[],youtubeRecommendationFeedback:[],youtubeRecommendationSeen:[],youtubeHiddenChannels:[]
  }},
  youtubeTitleKeywords:title=>String(title||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).slice(0,4).join(' '),
  decodeHtmlText:value=>String(value||''),youtubeChannelHidden:()=>false,Date,Map,Set
 });
 vm.runInContext(source('function youtubeRecommendationInterestProfile(){','function youtubeRecommendationFingerprint'),context);
 const now=new Date().toISOString();
 const groups=[
  {reason:'Space',seed:{score:100},items:[{videoId:'old',title:'Space science archive',channelTitle:'Channel A',publishedAt:'2018-01-01T00:00:00Z'},{videoId:'fresh',title:'Space science today',channelTitle:'Channel A',publishedAt:now}]},
  {reason:'Discovery',seed:{score:75},items:[{videoId:'other',title:'New telescope discovery',channelTitle:'Channel B',publishedAt:now}]}
 ];
 const items=context.youtubeRankRecommendationGroups(groups,3);
 assert.deepEqual(Array.from(items,item=>item.videoId),['fresh','other','old']);
 assert.deepEqual(Array.from(items,item=>item.recommendationReason),['Space','Discovery','Space']);
});

test('relative publication labels match YouTube-style wording',()=>{
 const block=source('function youtubeRelativeTime(','let youtubeExploreSection');
 const context=vm.createContext({Date});vm.runInContext(block,context);
 const now=Date.parse('2026-09-19T12:00:00Z');
 assert.equal(context.youtubeRelativeTime('2026-09-19T08:00:00Z',now),'4 hours ago');
 assert.equal(context.youtubeRelativeTime('2026-09-17T12:00:00Z',now),'2 days ago');
});
