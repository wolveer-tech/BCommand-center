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
