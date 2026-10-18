import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/storage-tools.js','utf8');
function harness(native=true){
 const events=new Map(),messages=[],timers=new Map();let id=0;
 const card={hidden:true},status={textContent:''},button={disabled:false,addEventListener:(type,fn)=>events.set(type,fn)};
 const context=vm.createContext({document:{readyState:'complete',getElementById:id=>({nativeStorageTools:card,clearNativeCachedFiles:button,nativeCacheStatus:status})[id]},CommandCentreNative:{storageMaintenance:native},webkit:{messageHandlers:{nativeData:{postMessage:message=>messages.push(JSON.parse(JSON.stringify(message)))}}},addEventListener:(name,fn)=>events.set(name,fn),setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:id=>timers.delete(id)});
 context.window=context;vm.runInContext(source,context);
 return {card,button,status,messages,events,timers};
}

test('cache clearing is available only to an iOS build that supports safe cleanup',()=>{
 assert.equal(harness(false).card.hidden,true);assert.equal(harness(true).card.hidden,false);
});

test('clear cached files requests only disposable caches and waits for native completion',()=>{
 const h=harness();h.events.get('click')();assert.equal(h.button.disabled,true);
 assert.deepEqual(h.messages,[{action:'clearCachedFiles'}]);assert.equal(h.timers.size,1);
 h.events.get('cc-native-cache-cleared')();assert.equal(h.button.disabled,false);assert.equal(h.timers.size,0);assert.match(h.status.textContent,/Cached files cleared/);
});

test('snapshot history is not expanded across the native bridge during startup',async()=>{
 const html=readFileSync('public/index.html','utf8');
 const functionBody=html.slice(html.indexOf('async function updateSafetySnapshotStatus(){'),html.indexOf('async function createSafetySnapshot(){'));
 let reads=0;
 const context=vm.createContext({qs:()=>({classList:{contains:()=>false}}),safetySnapshots:async()=>{reads++;return []}});
 vm.runInContext(functionBody,context);await context.updateSafetySnapshotStatus();assert.equal(reads,0);
});

test('native cleanup preserves durable website data and compressed snapshots remain reversible',()=>{
 const cleanup=readFileSync('native-ios/CommandCentreNative/NativeStorageMaintenance.swift','utf8');
 const vault=readFileSync('native-ios/CommandCentreNative/NativeStateVault.swift','utf8');
 const data=readFileSync('native-ios/CommandCentreNative/NativeDataHandler.swift','utf8');
 const types=cleanup.match(/cacheTypes: Set<String> = \[([^\]]+)\]/)[1].split(',').map(value=>value.trim());
 assert.deepEqual(types,['WKWebsiteDataTypeDiskCache','WKWebsiteDataTypeMemoryCache']);
 assert.match(vault,/compressed\(using: \.lzfse\)/);assert.match(vault,/decompressed\(using: \.lzfse\)/);
 assert.match(vault,/static func latest\(\)/);assert.match(vault,/\["current.json.lzfse", "current.json"\]/);
 assert.match(data,/NativeStateVault.queue.async/);assert.match(data,/action == "stateRecovery" \? NativeStateVault.latest\(\) : NativeStateVault.rows\(\)/);
 assert.doesNotMatch(vault.slice(vault.indexOf('static func bootstrapJavaScript')),/rows\(\)/);
});
