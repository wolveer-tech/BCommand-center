import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('public/playback-safety.js','utf8');
function setup(saved=''){
 let id=0;const timers=new Map(),storage=new Map(saved?[['cc-active-stream-v1',saved]]:[]),events=[];
 const window=new EventTarget();window.addEventListener('cc-playerfailure',e=>events.push(e.detail));
 const context=vm.createContext({window,Date,JSON,CustomEvent,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});vm.runInContext(source,context);
 return {api:window.CommandCentrePlaybackSafety,timers,storage,events,expire(ms){for(const [id,timer] of [...timers])if(timer.ms===ms&&timers.delete(id))timer.fn();}};
}
const frame=()=>Object.assign(new EventTarget(),{tagName:'IFRAME',src:'https://player.example/'});
test('a hung frame is unloaded after a bounded wait without restarting it',()=>{const s=setup(),f=frame();s.api.watch('live',f,f.src);s.expire(25000);assert.equal(f.src,'about:blank');assert.equal(s.events.length,1);assert.equal(s.events[0].kind,'live');assert.equal(s.timers.size,0);assert.equal(s.storage.size,0);});
test('a frame document load cancels the hard timeout, without claiming video readiness',()=>{const s=setup(),f=frame();s.api.watch('live',f,f.src);f.dispatchEvent(new Event('load'));s.expire(25000);assert.equal(f.src,'https://player.example/');assert.equal(s.events.length,0);s.api.stop('live');assert.equal(s.timers.size,0);});
test('switching sources detaches the previous errors and closing cancels every callback',()=>{const s=setup(),old=frame(),next=frame();s.api.watch('live',old,old.src);s.api.watch('live',next,next.src);old.dispatchEvent(new Event('error'));assert.equal(s.events.length,0);s.api.stop('live');s.expire(25000);next.dispatchEvent(new Event('error'));assert.equal(s.events.length,0);});
test('startup clears only the interrupted-player marker and never restores a player URL',()=>{const s=setup('previous player');assert.equal(s.api.interrupted,true);assert.equal(s.storage.size,0);assert.equal(s.timers.size,0);});
test('memory recovery requests stop all active players once',()=>{const s=setup();s.api.watch('live',frame(),'https://player.example/');s.api.watch('media',frame(),'https://player.example/');s.api.stopAll();s.api.stopAll();assert.equal(s.events.length,2);assert.equal(s.timers.size,0);});
test('native recovery reloads only app Home, limits automatic restarts and bounds filter startup',()=>{
 const native=readFileSync('native-ios/CommandCentreNative/CommandCentreWebView.swift','utf8'),filter=readFileSync('native-ios/CommandCentreNative/NativePlayerProtection.swift','utf8');
 assert.match(native,/func webViewWebContentProcessDidTerminate/);assert.match(native,/processFailures.count <= 2/);assert.match(native,/URLComponents\(url: AppConfig.commandCentreURL/);assert.doesNotMatch(native,/webView\.reload\(/);assert.match(native,/timeoutInterval: 25/);assert.match(filter,/asyncAfter\(deadline: \.now\(\) \+ 3/);
});
