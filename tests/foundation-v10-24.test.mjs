import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');
const project=read('../native-ios/project.yml');
const app=read('../native-ios/CommandCentreNative/CommandCentreNativeApp.swift');
const webView=read('../native-ios/CommandCentreNative/CommandCentreWebView.swift');
const dashboard=read('../native-ios/CommandCentreNative/NativeDashboardHandler.swift');
const shared=read('../native-ios/NativeShared/CommandCentreSharedData.swift');
const widgets=read('../native-ios/CommandCentreWidgets/CommandCentreWidgets.swift');
const appEntitlements=read('../native-ios/CommandCentreNative/CommandCentreNative.entitlements');
const widgetEntitlements=read('../native-ios/CommandCentreWidgets/CommandCentreWidgets.entitlements');
const appInfo=read('../native-ios/CommandCentreNative/Info.plist');
const codemagic=read('../codemagic.yaml');

test('native project embeds a widget and Live Activity extension',()=>{
  assert.match(project,/CommandCentreWidgets:[\s\S]*type: app-extension/);
  assert.match(project,/target: CommandCentreWidgets/);
  assert.match(project,/MARKETING_VERSION: 1\.12\.1/);
  assert.match(project,/CURRENT_PROJECT_VERSION: 20/);
  assert.match(appInfo,/NSSupportsLiveActivities/);
  assert.match(codemagic,/Expected the ReplayKit and Widget extensions/);
  assert.match(codemagic,/CommandCentre-iOS26-v1\.12\.1\.ipa/);
});

test('app and widgets share only the native dashboard snapshot',()=>{
  assert.match(shared,/appGroup = "group\.tech\.wolveer\.commandcentre\.native"/);
  assert.match(appEntitlements,/group\.tech\.wolveer\.commandcentre\.native/);
  assert.match(widgetEntitlements,/group\.tech\.wolveer\.commandcentre\.native/);
  assert.match(shared,/CommandCentreWeatherSnapshot/);
  assert.match(shared,/CommandCentreScheduleItem/);
});

test('weather, event and reminder widgets support Home and Lock Screens',()=>{
  for(const name of ['CommandCentreWeatherWidget','CommandCentreNextEventWidget','CommandCentreReminderWidget'])assert.match(widgets,new RegExp(`struct ${name}`));
  assert.match(widgets,/\.systemSmall/);
  assert.match(widgets,/\.systemMedium/);
  assert.match(widgets,/\.accessoryCircular/);
  assert.match(widgets,/\.accessoryRectangular/);
  assert.match(widgets,/\.accessoryInline/);
  assert.match(widgets,/commandcentre:\/\/weather/);
  assert.match(widgets,/commandcentre:\/\/calendar/);
  assert.match(widgets,/commandcentre:\/\/reminders/);
});

test('followed matches drive ActivityKit and Dynamic Island',()=>{
  assert.match(shared,/struct FootballMatchAttributes: ActivityAttributes/);
  assert.match(widgets,/ActivityConfiguration\(for: FootballMatchAttributes\.self\)/);
  assert.match(widgets,/DynamicIslandExpandedRegion/);
  assert.match(dashboard,/Activity<FootballMatchAttributes>\.activities/);
  assert.match(dashboard,/Activity\.request\(attributes:/);
  assert.match(dashboard,/alertConfiguration: alert,[\s\S]*start: scheduledStart/);
  assert.match(dashboard,/activity\.update\(content\)/);
  assert.match(dashboard,/activity\.end\(/);
  assert.match(dashboard,/90 \* 60/);
});

test('web state syncs widgets and refreshes active followed matches',()=>{
  assert.match(webView,/name: "nativeDashboard"/);
  assert.match(webView,/nativeWidgets: true, liveActivities: true/);
  assert.match(html,/function nativeDashboardPayload/);
  assert.match(html,/function nativeNextEventPayload/);
  assert.match(html,/function nativeReminderPayload/);
  assert.match(html,/function nativeWeatherPayload/);
  assert.match(html,/function nativeFootballMatchPayload/);
  assert.match(html,/setInterval\(\(\)=>refreshNativeLiveActivities\(false\),15\*1000\)/);
  assert.match(html,/Match followed — Live Activity and fixture alerts are ready/);
});

test('widget taps route back to the appropriate native screen',()=>{
  assert.match(app,/\.onOpenURL/);
  assert.match(appInfo,/commandcentre/);
  assert.match(dashboard,/final class NativeDeepLinkRouter/);
  assert.match(dashboard,/case "weather": hash = "#weather"/);
  assert.match(dashboard,/case "calendar", "reminders": hash = "#today"/);
  assert.match(dashboard,/case "football": hash = "#football"/);
  assert.match(html,/location\.hash==='#weather'/);
});

test('background refresh keeps weather widgets and Live Activities fresher',()=>{
  assert.match(dashboard,/func performBackgroundRefresh\(\) async -> Bool/);
  assert.match(dashboard,/refreshWeatherFromNetwork/);
  assert.match(dashboard,/refreshLiveActivitiesFromNetwork/);
  assert.match(dashboard,/api\/football\/match/);
  assert.match(dashboard,/api\.open-meteo\.com/);
});
