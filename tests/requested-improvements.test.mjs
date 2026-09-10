import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker.js',import.meta.url),'utf8');
const webView=readFileSync(new URL('../native-ios/CommandCentreNative/CommandCentreWebView.swift',import.meta.url),'utf8');
const nativeNotifications=readFileSync(new URL('../native-ios/CommandCentreNative/NativeNotificationHandler.swift',import.meta.url),'utf8');
const nativeData=readFileSync(new URL('../native-ios/CommandCentreNative/NativeDataHandler.swift',import.meta.url),'utf8');

test('football has an all-competition dated schedule and match lineup route',()=>{
  assert.match(worker,/function getFootballSchedule/);
  assert.match(worker,/\/matches\?dateFrom=\$\{dateFrom\}&dateTo=\$\{dateTo\}&limit=500/);
  assert.match(worker,/url\.pathname==='\/api\/football\/schedule'/);
  assert.match(worker,/url\.pathname==='\/api\/football\/lineups'/);
  assert.match(worker,/'X-Unfold-Lineups':'true'/);
  assert.match(worker,/apiFootballFetch\('fixtures\/lineups'/);
  assert.match(html,/id="footballScheduleTabs"/);
  assert.match(html,/function openFootballLineups/);
  assert.match(html,/Team lineups/);
});

test('YouTube comments are fetched safely through the Worker',()=>{
  assert.match(worker,/googleapis\.com\/youtube\/v3\/commentThreads/);
  assert.match(worker,/textFormat','plainText'/);
  assert.match(worker,/url\.pathname==='\/api\/youtube\/comments'/);
  assert.match(html,/id="youtubeCommentsCard"/);
  assert.match(html,/function loadYoutubeComments/);
  assert.match(html,/youtube-comment-text/);
});

test('trained YouTube For You contains no Trending filler',()=>{
  const start=html.indexOf('async function loadYoutubeForYou');
  const end=html.indexOf('function hideYoutubeRecommendation',start);
  const source=html.slice(start,end);
  assert.match(source,/Trending remains a separate tab/);
  assert.doesNotMatch(source,/requests=\[[\s\S]*section=trending/);
  assert.match(html,/youtubeForYouCache:\{version:3/);
});

test('YouTube progress cache resumes the embed from its saved timestamp',()=>{
  assert.match(html,/function youtubeResumeSeconds/);
  assert.match(html,/getCurrentTime/);
  assert.match(html,/getDuration/);
  assert.match(html,/start=\$\{Math\.floor\(resumeAt\)\}/);
  assert.match(html,/window\.addEventListener\('pagehide',[^\n]*captureYoutubeProgress\(true\)/);
  assert.match(html,/youtubeHistoryDetailed/);
  assert.match(html,/class="continue-progress"/);
});

test('IPA has native local notifications and portable data restore bridges',()=>{
  assert.match(webView,/name: "nativeNotifications"/);
  assert.match(webView,/name: "nativeData"/);
  assert.match(nativeNotifications,/requestAuthorization/);
  assert.match(nativeNotifications,/UNCalendarNotificationTrigger/);
  assert.match(nativeNotifications,/items\.prefix\(60\)/);
  assert.match(nativeData,/UIDocumentPickerViewController/);
  assert.match(nativeData,/UIActivityViewController/);
  assert.match(html,/function commandCentreBackupPayload/);
  assert.match(html,/function importCommandCentreBackup/);
  assert.match(html,/Restoring merges data without deleting/);
  const backupBlock=html.slice(html.indexOf('function commandCentreBackupPayload'),html.indexOf('function backupFileName'));
  assert.doesNotMatch(backupBlock,/deepSeekKey|marketKey|pushDeviceId|spotifyAccessToken/);
});
