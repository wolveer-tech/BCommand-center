import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const worker=read('../worker.js');
const messages=read('../messages.js');
const transfers=read('../transfers.js');
const migration=read('../migrations/0011_notification_companion.sql');

test('Safari Web Push companion reuses the paired IPA identity',()=>{
  assert.match(html,/Safari notification companion/);
  assert.match(html,/NOTIFICATION_COMPANION_RECEIVER_KEY/);
  assert.match(html,/localStorage\.setItem\('cc_push_device_id',data\.deviceId\)/);
  assert.match(html,/notificationCompanionSession\(\)/);
  assert.match(html,/value\?\.device\?\.id/);
  assert.match(worker,/startsWith\('\/api\/notification-companion'\)/);
  assert.match(worker,/UPDATE transfer_devices SET push_subscription=\?/);
  assert.match(worker,/INSERT INTO devices\(device_id,endpoint,p256dh,auth,timezone,updated_at\)/);
  assert.match(worker,/notification_companion_links/);
  assert.doesNotMatch(worker,/INSERT INTO transfer_devices[^\n]+notification_companion/);
  assert.match(migration,/device_id TEXT PRIMARY KEY/);
});

test('companion synchronises everyday alerts while football remains native',()=>{
  assert.match(html,/items:collectPushSchedule\(400\)/);
  assert.match(html,/briefing:\{enabled:/);
  assert.match(html,/news:\{worldEnabled:/);
  assert.match(html,/football:\{enabled:false,teams:\[\]/);
  assert.match(worker,/morning_briefing_preferences/);
  assert.match(worker,/news_preferences/);
  assert.match(worker,/football_notification_preferences/);
  assert.match(worker,/football_notification_teams/);
  assert.match(worker,/companion:\$\{deviceId\}:\$\{sourceId\}/);
});

test('Messages and Transfers prefer the linked Web Push receiver',()=>{
  const messageWeb=messages.indexOf('if(delivery.push_subscription&&webReady)');
  const messageNative=messages.indexOf('if(!delivered&&delivery.apns_token&&nativeReady)');
  const transferWeb=transfers.indexOf('if (row.push_subscription && webReady)');
  const transferNative=transfers.indexOf('if (!delivered && row.apns_token && nativeReady)');
  assert.ok(messageWeb>=0&&messageNative>messageWeb);
  assert.ok(transferWeb>=0&&transferNative>transferWeb);
  assert.match(messages,/Message Web Push companion failed; trying APNs/);
  assert.match(transfers,/Transfer Web Push companion failed; trying APNs/);
});

test('League One uses the keyless FotMob league table and normalises clubs',()=>{
  assert.match(worker,/EL1:\{id:108,name:'League One'/);
  assert.match(worker,/fotmobWebsiteFetch\('leagues'/);
  assert.match(worker,/data\?\.fixtures\?\.allMatches/);
  assert.match(worker,/__cache\/football-v5/);
  assert.match(worker,/status\?\.scoreStr/);
  assert.match(worker,/slice\(0,48\)/);
  assert.match(worker,/FOTMOB_LEAGUE_COMPETITIONS\[code\]/);
  const start=worker.indexOf("const FOTMOB_WEB_BASE=");
  const end=worker.indexOf('async function fotmobLeagueBundle',start);
  const context={URL,fetch:()=>{throw new Error('not called')}};vm.createContext(context);
  vm.runInContext(`${worker.slice(start,end)}\nglobalThis.cleanRow=cleanFotmobStandingRow;globalThis.cleanMatch=cleanFotmobFootballMatch;`,context);
  const row=context.cleanRow({idx:3,id:8678,name:'Example FC',shortName:'Example',played:10,wins:6,draws:2,losses:2,scoresStr:'18-9',pts:20});
  assert.equal(row.position,3);assert.equal(row.team.id,800000008678);assert.equal(row.playedGames,10);assert.equal(row.goalDifference,9);assert.equal(row.points,20);
  const match=context.cleanMatch({id:5837158,home:{id:1,name:'Home'},away:{id:2,name:'Away'},status:{utcTime:'2026-09-12T14:00:00Z',finished:true,started:true,scoreStr:'3 - 2'}},{id:108,name:'League One',ccode:'EL1'});
  assert.equal(match.status,'FINISHED');assert.equal(match.score.fullTime.home,3);assert.equal(match.score.fullTime.away,2);
});

test('iPhone note writing mode hides editor chrome without the unsupported has selector',()=>{
  assert.match(html,/class="field note-title-field"><input id="noteTitle"/);
  assert.match(html,/note-body-focused \.note-title-field/);
  assert.match(html,/note-body-focused \.note-editor-options/);
  assert.match(html,/display:none!important/);
  assert.match(html,/function applyNoteWritingMode\(active\)/);
  assert.match(html,/element\.style\.setProperty\('display','none','important'\)/);
  assert.match(html,/keyboardOpen=.*\|\|mobileBodyFocused/);
  assert.doesNotMatch(html,/:has\(#noteTitle\)/);
});
