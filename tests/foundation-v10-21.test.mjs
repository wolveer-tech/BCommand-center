import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {apnsConfigured,apnsSettings,sendAPNSNotification} from '../apns.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const worker=read('../worker.js');
const transfers=read('../transfers.js');
const messages=read('../messages.js');
const nativeNotifications=read('../native-ios/CommandCentreNative/NativeNotificationHandler.swift');
const nativeDelegate=read('../native-ios/CommandCentreNative/NativePushAppDelegate.swift');
const nativeApp=read('../native-ios/CommandCentreNative/CommandCentreNativeApp.swift');
const entitlement=read('../native-ios/CommandCentreNative/CommandCentreNative.entitlements');
const migration=read('../migrations/0010_native_apns.sql');

test('notes keep the live caret visible above the iPhone keyboard',()=>{
  assert.match(html,/#noteModal \.note-body-input\{[^}]*font-size:16px[^}]*caret-color:var\(--cyan\)[^}]*scroll-padding-block/);
  assert.match(html,/function keepNoteCaretVisible\(\)/);
  assert.match(html,/body\.scrollTop\+=caret\.bottom-safeBottom\+28/);
  assert.match(html,/body\.addEventListener\('input',[^\n]*syncNoteVisualViewport\(\)[^\n]*keepNoteCaretVisible\(\)/);
  assert.match(html,/#noteModal\.note-keyboard-open\.note-body-focused \.modal-head/);
});

test('football fixtures and Match Centre use the reachable FotMob website feed',()=>{
  assert.match(worker,/FOTMOB_WEB_BASE='https:\/\/www\.fotmob\.com\/api\/data'/);
  assert.match(worker,/fotmobWebsiteFetch\('matches',\{date:date\.replaceAll\('-',''\),timezone:'Europe\/London',ccode3:'GBR'\}\)/);
  assert.match(worker,/fotmobWebsiteFetch\('matchDetails',\{matchId:rawId\}\)/);
  assert.match(worker,/const lineup=data\?\.content\?\.lineup\|\|\{\}/);
  assert.match(worker,/const statGroups=data\?\.content\?\.stats\?\.Periods\?\.All\?\.stats/);
  assert.match(worker,/provider:'FotMob website feed'/);
  assert.match(html,/fetchJson\(`\/api\/football\/match\?\$\{params\.toString\(\)\}`/);
  assert.match(html,/function showMoreFootballFixtures\(\)/);
  assert.match(html,/\$\{matchingUpcoming\.length-upcoming\.length\} remaining/);
});

test('For You rotates recent impressions and requests fresher search lanes',()=>{
  assert.match(html,/youtubeForYouCache:\{version:7/);
  assert.match(html,/youtubeRecommendationSeen:\[\]/);
  assert.match(html,/Date\.now\(\)-updated<15\*60\*1000/);
  assert.match(html,/function rememberYoutubeRecommendationImpressions/);
  assert.match(html,/Date\.now\(\)-Number\(x\.seenAt\)<7\*86400000/);
  assert.match(html,/params\.set\('freshness',index%2\?'year':'month'\)/);
  assert.match(worker,/\['week','month','year'\]\.includes\(freshness\)/);
  assert.match(worker,/u\.searchParams\.set\('publishedAfter',new Date\(Date\.now\(\)-days\*86400000\)\.toISOString\(\)\)/);
});

test('native Messages and Transfers notifications are registered through APNs',()=>{
  assert.match(migration,/ADD COLUMN apns_token TEXT/);
  assert.match(entitlement,/<key>aps-environment<\/key>[\s\S]*<string>production<\/string>/);
  assert.match(nativeApp,/@UIApplicationDelegateAdaptor\(NativePushAppDelegate\.self\)/);
  assert.match(nativeDelegate,/registerForRemoteNotificationsIfEnabled/);
  assert.match(nativeDelegate,/didRegisterForRemoteNotificationsWithDeviceToken/);
  assert.match(nativeNotifications,/api\/transfers\/apns/);
  assert.match(nativeNotifications,/registerForRemoteNotifications\(\)/);
  assert.match(nativeNotifications,/url\.hasPrefix\("#"\) \? "location\.hash=/);
  assert.match(transfers,/path === '\/apns'/);
  assert.match(transfers,/d\.push_subscription,d\.apns_token/);
  assert.match(messages,/d\.push_subscription,d\.apns_token/);
  assert.match(worker,/sendAPNSNotification\(row,env\)/);
});

test('APNs sender creates an authenticated alert request',async()=>{
  const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  const pem=privateKey.export({type:'pkcs8',format:'pem'});
  const previousFetch=globalThis.fetch;
  let sent;
  globalThis.fetch=async(url,init)=>{
    sent={url:String(url),init};
    return new Response(null,{status:200});
  };
  try{
    const env={APNS_CONFIG:`ABCDEFGHIJ\nKLMNOPQRST\n${pem}`};
    assert.equal(apnsConfigured(env),true);
    assert.equal(apnsSettings(env).privateKey,pem.trim());
    const result=await sendAPNSNotification({apnsToken:'a'.repeat(64),title:'Message',body:'New message',url:'/#messages',id:'message-1'},env);
    assert.deepEqual(result,{ok:true});
  }finally{globalThis.fetch=previousFetch;}
  assert.match(sent.url,/^https:\/\/api\.push\.apple\.com\/3\/device\/[a-f0-9]+$/);
  assert.equal(sent.init.headers['apns-topic'],'tech.wolveer.commandcentre.native');
  assert.equal(sent.init.headers['apns-push-type'],'alert');
  assert.equal(sent.init.headers.authorization.split('.').length,3);
  assert.equal(JSON.parse(sent.init.body).aps.alert.body,'New message');
});
