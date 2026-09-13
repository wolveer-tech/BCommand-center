import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const worker=read('../worker.js');
const motion=read('../public/space-motion.js');
const motionCss=read('../public/space-motion.css');
const privacy=read('../native-ios/CommandCentreNative/NativePrivacyLockManager.swift');
const mirror=read('../native-ios/CommandCentreNative/NativeMirrorManager.swift');
const webView=read('../native-ios/CommandCentreNative/CommandCentreWebView.swift');

test('space intro runs once per app session and is lightweight on iPhone',()=>{
  assert.match(motion,/sessionStorage\.getItem\(introSessionKey\)/);
  assert.match(motion,/sessionStorage\.setItem\(introSessionKey, '1'\)/);
  assert.match(motion,/startRequested = mode\(\) !== 'off' && !playedThisSession/);
  assert.match(motion,/width < 600 \? 1\.3 : 1\.75/);
  assert.match(motion,/length:width<600\?360:1000/);
  assert.match(motionCss,/@supports\(-webkit-touch-callout:none\)/);
});

test('Face ID only relocks on cold launch or an explicit lock',()=>{
  const lifecycle=privacy.slice(privacy.indexOf('func handleScenePhase'),privacy.indexOf('func authenticateIfNeeded'));
  assert.match(privacy,/isLocked = isEnabled/);
  assert.match(privacy,/func lockNow\(\)/);
  assert.doesNotMatch(lifecycle,/backgroundedAt|elapsed|graceSeconds/);
  assert.match(lifecycle,/case \.inactive:[\s\S]*isShielded = true/);
  assert.match(lifecycle,/if isLocked[\s\S]*authenticate\(reason:/);
  assert.match(html,/Control Centre, Notification Centre and normal app switching only hide the preview/);
  assert.doesNotMatch(html,/id="privacyLockGrace"/);
});

test('note editor follows the iPhone visual viewport and keeps every action reachable',()=>{
  assert.match(html,/--cc-note-vv-height/);
  assert.match(html,/function syncNoteVisualViewport/);
  assert.match(html,/window\.visualViewport\?\.addEventListener\('resize'/);
  assert.match(html,/#noteModal \.modal-actions \.btn\{[^}]*flex:1 1 0/);
  assert.match(html,/\.note-toolbar\{flex-wrap:nowrap;overflow-x:auto/);
});

test('Sport replaces Basketball with Athletics and prefers website-native sources',()=>{
  assert.match(html,/data-sport-tab="athletics">🏃 Athletics/);
  assert.doesNotMatch(html,/data-sport-tab="basketball"/);
  assert.match(worker,/SOFASCORE_WEB_BASE='https:\/\/www\.sofascore\.com\/api\/v1'/);
  assert.match(worker,/provider:'SofaScore website feed'/);
  assert.match(worker,/async function worldAthleticsBundle/);
  assert.match(worker,/worldathletics\.org\/competition\/calendar-results/);
  assert.match(worker,/const GENERAL_SPORTS=new Set\(\['tennis','athletics'\]\)/);
});

test('feed refresh reports progress, success and saved fallbacks',()=>{
  assert.match(html,/id="entertainmentFeedStatus" role="status"/);
  assert.match(html,/let entertainmentRefreshPromise=null/);
  assert.match(html,/btn\.textContent='Refreshing…'/);
  assert.match(html,/Feed updated at/);
  assert.match(html,/source\$\{failures===1\?'':'s'\} kept its saved results/);
});

test('mirror retries Apple picker, collisions and duplicate WebRTC offers safely',()=>{
  assert.match(html,/id="nativeMirrorPickerBtn"/);
  assert.match(webView,/case "picker"/);
  assert.match(mirror,/func presentBroadcastPicker\(\)/);
  assert.match(worker,/already active\. Try again/);
  assert.match(html,/if\(r\.status===409\)/);
  assert.match(html,/pc\.remoteDescription\?\.sdp===sig\.data\?\.sdp/);
  assert.match(html,/mirrorState\.pollInFlight/);
});
