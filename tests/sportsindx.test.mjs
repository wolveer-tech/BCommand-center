import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const start=worker.indexOf('function decodeSportsindxAttribute');
const end=worker.indexOf('async function fetchSportsindxProvider',start);
const parserSource=worker.slice(start,end);
const context=vm.createContext({
  URL,
  safeHttpsUrl(value,base){try{const url=new URL(value,base);return url.protocol==='https:'?url.toString():''}catch{return''}}
});
vm.runInContext(parserSource,context);

test('SportsindX schedule rows are parsed into the existing live-stream shape',()=>{
  const html=`<details class="category-card" data-category="football"><summary><span class="category-name">Football</span></summary><a class="match-row" href="/match/wolves-vs-villa" data-title="Wolves vs Villa" data-home="Wolves" data-away="Villa"><span class="match-time" data-timestamp="1789833600000" data-ends="1789848000000"></span></a></details>`;
  const events=context.sportsindxListingEvents(html,'soccer');
  assert.equal(events.length,1);
  assert.equal(events[0].slug,'wolves-vs-villa');
  assert.equal(events[0].timestamp,1789833600);
  assert.equal(events[0].league,'Football');
});

test('SportsindX per-match sources keep labels and HTTPS player URLs',()=>{
  const links=JSON.stringify([{embedUrl:'https://embed.st/player/1',name:'Admin',channel:'TNT Sports',quality:'HD'}]).replaceAll('"','&#34;');
  const html=`<button class="match-row" data-links="${links}"></button>`;
  const event={id:'wolves-vs-villa',name:'Wolves vs Villa',category:'soccer',league:'Football',timestamp:1789833600,home:'Wolves',away:'Villa'};
  const stream=context.sportsindxEventStream(html,event,new URL('https://sportsindx.st/'));
  assert.equal(stream.sources.length,1);
  assert.equal(stream.sources[0].url,'https://embed.st/player/1');
  assert.equal(stream.sources[0].label,'Admin • TNT Sports • HD');
  assert.equal(stream.team1.name,'Wolves');
});

test('SportsindX is the additive third provider',()=>{
  assert.match(worker,/id:'3',[\s\S]*name:String\(env\.LIVE_PROVIDER_3_NAME\|\|'SportsindX'\)/);
  assert.match(worker,/baseUrl:String\(env\.LIVE_PROVIDER_3_BASE_URL\|\|'https:\/\/sportsindx\.st'\)/);
  assert.match(worker,/cfg\.mode==='sportsindx'[\s\S]*fetchSportsindxProvider/);
});
