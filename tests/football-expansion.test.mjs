import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fotmobHalftimeEnd,halftimeDeadline} from '../football-timing.js';
import {activityContent} from '../live-activities.js';
import '../public/football-pitch.js';
import '../public/football-following.js';
const worker=readFileSync('worker.js','utf8');
const cfg=worker.slice(worker.indexOf('const FOTMOB_LEAGUE_COMPETITIONS='),worker.indexOf('function isoDayOffset'));
const parsers=worker.slice(worker.indexOf('function fotmobTeam('),worker.indexOf('async function footballFetch('));
function feedContext(fetcher){const context=vm.createContext({URL,console,fotmobWebsiteFetch:fetcher});vm.runInContext('const FOTMOB_ID_PREFIX=800000000000;'+cfg+parsers,context);return context;}
const row=(id,status='FINISHED',round='1')=>({id,roundName:round,home:{id:1,name:'Home'},away:{id:2,name:'Away'},status:{utcTime:'2026-10-18T14:00:00Z',started:status!=='SCHEDULED',finished:status==='FINISHED',scoreStr:'2 - 1'}});
test('FA Cup accepts knockout fixtures without a standings table and includes qualifying',async()=>{
 const calls=[],context=feedContext(async(path,{id})=>{calls.push(id);return {details:{id,selectedSeason:'2026/2027',name:id===10626?'FA Cup Qualification':'FA Cup'},fixtures:{allMatches:[row(id,id===132?'SCHEDULED':'FINISHED')]}};});
 const result=await context.fotmobLeagueBundle('FAC');assert.equal(result.matches.length,2);assert.equal(result.standings.length,0);assert.equal(result.rounds.length,2);assert.equal(result.competition.format,'knockout');assert.deepEqual(calls,[132,10626]);
});
test('current qualifying results are never mixed with a previous main-cup season',async()=>{
 const context=feedContext(async(path,{id})=>({details:{id,selectedSeason:id===132?'2025/2026':'2026/2027'},fixtures:{allMatches:[row(id)]}}));
 const result=await context.fotmobLeagueBundle('FAC');assert.equal(result.season,'2026/2027');assert.deepEqual(Array.from(result.matches,m=>m.fotmobId),[10626]);
});
test('a missing main-cup feed still returns qualifying results',async()=>{
 const context=feedContext(async(path,{id})=>{if(id===132)throw Error('offline');return {details:{id,selectedSeason:'2026/2027'},fixtures:{allMatches:[row(id)]}};});
 assert.equal((await context.fotmobLeagueBundle('FAC')).matches.length,1);
});
test('team search ignores players and matches, deduplicates teams and puts men first',async()=>{
 const context=feedContext(async(path,params)=>{assert.equal(path,'search/suggest');assert.equal(params.term,'Arsenal');return [{suggestions:[{type:'team',id:200,name:'Arsenal (W)',leagueName:'WSL'},{type:'player',id:7,name:'Player'},{type:'team',id:100,name:'Arsenal',leagueName:'Premier League'}]},{suggestions:[{type:'team',id:100,name:'Arsenal'}]}];});
 const result=await context.searchFootballTeams('Arsenal');assert.equal(result.teams.length,2);assert.equal(result.teams[0].gender,'male');assert.equal(result.teams[1].gender,'female');assert.equal(result.teams[0].id,800000000100);
});
test('women’s competition matches keep gender and team fixtures span competitions',async()=>{
 const context=feedContext(async(path,params)=>path==='teams'?{details:{id:200,name:'Arsenal',gender:'female'},fixtures:{allFixtures:{fixtures:[{...row(10),tournament:{leagueId:9227,name:'WSL'}},{...row(11),tournament:{leagueId:9375,name:'Champions League'}}]}}}:{details:{id:9227,selectedSeason:'2026/2027'},fixtures:{allMatches:[row(3)]}});
 const women=await context.fotmobLeagueBundle('WSL');assert.equal(women.matches[0].gender,'female');
 const team=await context.footballTeamFixtures(800000000200);assert.equal(team.matches.length,2);assert.equal(team.matches[1].gender,'female');await assert.rejects(context.footballTeamFixtures('https://attacker.test'),/Choose a team/);
});
test('men’s and women’s clubs with the same name remain separate when following',()=>{
 const following=globalThis.CommandCentreFootballFollowing,match={gender:'female',homeTeam:{id:800000000200,name:'Arsenal'},awayTeam:{id:800000000201,name:'Chelsea'}};
 assert.equal(following.favourite(match,[{id:800000000100,name:'Arsenal',gender:'male'}]),false);
 assert.equal(following.favourite(match,[{id:800000000200,name:'Arsenal',gender:'female'}]),true);
});
test('graphical lineups use exact player coordinates and render every starter',()=>{
 const pitch=globalThis.CommandCentreFootballPitch,starting=Array.from({length:11},(_,i)=>({name:'Player '+i,number:i+1,x:i%4/4,y:i/12}));
 const positions=pitch.positions({starting});assert.equal(positions.length,11);assert.equal(positions[0].x,10);assert.equal(positions[0].y,90);
 assert.equal((pitch.render({name:'Team',starting}).match(/class="pitch-player"/g)||[]).length,11);
 assert.ok(pitch.render({name:'<script>',starting:[{name:'<img onerror=x>',number:1}]}).includes('&lt;img onerror=x&gt;'));
});
test('a formation supplies pitch positions when the provider has no coordinates',()=>{
 const pitch=globalThis.CommandCentreFootballPitch,players=Array.from({length:11},(_,i)=>({name:'Player '+i,number:i+1}));
 const positions=pitch.positions({formation:'4-3-3',starting:players});assert.equal(positions[0].y,88);assert.equal(new Set(positions.slice(1,5).map(p=>p.y)).size,1);assert.ok(positions.every(p=>p.x>0&&p.x<100&&p.y>=10&&p.y<=90));
});
test('halftime uses elapsed first-half time without guessing the provider timezone',()=>{
 const status={reason:{short:'HT'},utcTime:'2026-10-18T19:00:00Z',halfs:{firstHalfStarted:'18.10.2026 21:00:00',firstHalfEnded:'18.10.2026 21:48:30'}};
 assert.equal(fotmobHalftimeEnd(status),Date.parse('2026-10-18T20:03:30Z'));
 assert.equal(fotmobHalftimeEnd({...status,halfs:{...status.halfs,secondHalfStarted:'18.10.2026 22:03:00'}}),null);
});
test('halftime countdown keeps its deadline across updates, stops at second half and excludes extra-time breaks',()=>{
 const now=Date.parse('2026-10-18T19:50:00Z'),match={status:'PAUSED',minute:45},first=halftimeDeadline(match,now);
 assert.equal(first,now+15*60000);assert.equal(halftimeDeadline(match,now+60000,first),first);
 assert.equal(halftimeDeadline({status:'IN_PLAY',minute:46},now,first),null);assert.equal(halftimeDeadline({status:'PAUSED',minute:90},now),null);
 const content=activityContent(match,now,first)['content-state'];assert.equal(content.halftimeEndsAt,first/1000-978307200);
 assert.equal(activityContent({status:'IN_PLAY',minute:46},now,first)['content-state'].halftimeEndsAt,null);
});
