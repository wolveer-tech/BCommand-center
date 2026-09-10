import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const worker=read('../worker.js');
const serviceWorker=read('../public/sw.js');
const project=read('../native-ios/project.yml');
const nativeApp=read('../native-ios/CommandCentreNative/CommandCentreNativeApp.swift');
const background=read('../native-ios/CommandCentreNative/BackgroundRefreshManager.swift');
const notifications=read('../native-ios/CommandCentreNative/NativeNotificationHandler.swift');
const webView=read('../native-ios/CommandCentreNative/CommandCentreWebView.swift');
const messagesClient=read('../client/messages-client.js');
const transfersClient=read('../client/transfers-client.js');

test('weather uses a durable fresh cache and starts without opening its page',()=>{
  assert.match(html,/WEATHER_CACHE_KEY='command-centre-weather-v1'/);
  assert.match(html,/let weatherCache=loadStoredWeatherCache\(\)/);
  assert.match(html,/Date\.now\(\)-cachedAt<WEATHER_FRESH_MS/);
  assert.match(html,/const startHomeWeather=\(\)=>refreshAppFreshness\(false\)/);
  assert.match(html,/const currentWeather=await loadWeather\(false\)/);
});

test('YouTube library supports continue, later, history and hidden channels',()=>{
  for(const view of ['continue','later','history','hidden'])assert.match(html,new RegExp(`data-yt-library="${view}"`));
  assert.match(html,/function toggleYoutubeWatchLater/);
  assert.match(html,/function hideYoutubeChannel/);
  assert.match(html,/function renderYoutubeLibrary/);
  assert.match(html,/renderYoutubeLibrary\(\).*renderAllContinueWatching|renderAllContinueWatching\(\);renderYoutubeLibrary\(\)/);
});

test('Match Centre exposes overview, lineups, timeline, stats and following',()=>{
  assert.match(worker,/async function getFootballMatchCentre/);
  assert.match(worker,/apiFootballFetch\('fixtures\/events'/);
  assert.match(worker,/apiFootballFetch\('fixtures\/statistics'/);
  assert.match(html,/function openFootballMatchCentre/);
  for(const tab of ['overview','lineups','timeline','stats'])assert.match(html,new RegExp(`data-match-centre-tab="${tab}"`));
  assert.match(html,/footballFollowedMatches/);
  assert.match(html,/matchId:Number\(match\.id\),offsetMinutes/);
});

test('app shell and fixture schedules refresh safely in foreground and background',()=>{
  assert.match(serviceWorker,/command-centre-shell-v10\.17\.1/);
  assert.match(serviceWorker,/request\.mode === 'navigate'/);
  assert.match(serviceWorker,/url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(html,/function refreshAppFreshness/);
  assert.match(html,/function refreshFootballScheduleInBackground/);
  assert.match(project,/BGTaskSchedulerPermittedIdentifiers/);
  assert.match(background,/BGAppRefreshTaskRequest/);
  assert.match(nativeApp,/BackgroundRefreshManager\.shared\.register\(\)/);
  assert.match(notifications,/refreshSavedScheduleFromNetwork/);
  assert.match(notifications,/storedScheduleKey/);
});

test('IPA Messages and Transfers alerts use native background inbox checks',()=>{
  assert.match(messagesClient,/action:'registerInboxAlerts'/);
  assert.match(transfersClient,/action:'registerInboxAlerts'/);
  assert.match(messagesClient,/window\.CommandCentreNative\?\.nativeNotifications/);
  assert.match(transfersClient,/window\.CommandCentreNative\?\.nativeNotifications/);
  assert.match(notifications,/func refreshNativeInboxAlerts/);
  assert.match(notifications,/api\/messages\/chats/);
  assert.match(notifications,/api\/transfers\/items\?view=inbox/);
  assert.match(notifications,/performBackgroundRefresh/);
});

test('paired devices stay aligned and removal works without a JavaScript dialog',()=>{
  assert.match(transfersClient,/DEVICE_SYNC_KEY = 'cc_transfer_devices_changed_v1'/);
  assert.match(transfersClient,/Tap again to remove/);
  assert.match(transfersClient,/async function removeDevice/);
  assert.match(transfersClient,/cc-transfer-devices-changed/);
  assert.match(messagesClient,/cc-transfer-devices-changed/);
  assert.match(messagesClient,/DEVICE_SYNC_KEY='cc_transfer_devices_changed_v1'/);
  assert.match(webView,/webView\.uiDelegate = context\.coordinator/);
  assert.match(webView,/WKUIDelegate/);
  assert.match(webView,/runJavaScriptConfirmPanelWithMessage/);
});

test('portable backups include validated Bible progress and recommendations',()=>{
  const backup=html.slice(html.indexOf('function commandCentreBackupPayload'),html.indexOf('function backupFileName'));
  const restore=html.slice(html.indexOf('function importCommandCentreBackup'),html.indexOf('window.CommandCentreReceiveBackup'));
  assert.match(backup,/bibleRead:state\.bibleRead/);
  assert.match(backup,/bibleRecommendations:state\.bibleRecommendations/);
  assert.match(restore,/validBibleKeys/);
  assert.match(restore,/validReadingBlocks/);
  assert.match(restore,/renderBible\(\);renderBibleChecklist\(\)/);
});
