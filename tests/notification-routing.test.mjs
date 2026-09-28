import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('public/index.html', 'utf8');
const native = readFileSync('native-ios/CommandCentreNative/NativeNotificationHandler.swift', 'utf8');

test('linked companion moves everyday alerts to the PWA and retains native football', () => {
  assert.match(html, /const companionLinked=!!notificationCompanionOwner\(\)\?\.linked/);
  assert.match(html, /companionLinked\?\[\]:collectPushSchedule\(180\)/);
  assert.match(html, /\.\.\.collectNativeFootballNotifications\(\)/);
  assert.match(html, /!companionLinked&&state\.morningBriefingEnabled!==false/);
  assert.match(html, /postNativeNotification\('setCompanionMode',\{enabled:true\}\)/);
  assert.match(html, /Football stays native in the IPA/);
});

test('native background inbox checks stand down while the PWA companion is active', () => {
  assert.match(native, /case "setCompanionMode"/);
  assert.match(native, /CommandCentreSafariCompanionMode/);
  assert.match(native, /if UserDefaults\.standard\.bool\(forKey: companionModeKey\)/);
  assert.match(native, /Messages and Transfers are delivered by the linked Safari PWA/);
});
