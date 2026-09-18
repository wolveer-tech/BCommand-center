import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/space-motion.js',import.meta.url),'utf8');
function harness({played=false,native=false,animationThrows=false}={}){
 const events=new Map(),timers=new Map(),frames=new Map(),storage=new Map(played?[['cc_space_intro_played_v1','1']]:[]);let id=0,time=0;
 const on=(event,fn)=>{events.set(event,[...(events.get(event)||[]),fn])};
 const classes={add(){},remove(){},contains:()=>false};
 const root={dataset:{},hasAttribute:key=>key==='data-cc-launch'&&'ccLaunch' in root.dataset,removeAttribute:()=>{delete root.dataset.ccLaunch}};
 const main={tagName:'MAIN',inert:false,querySelectorAll:()=>[],animate:()=>{if(animationThrows)throw Error('Animation failed');return {finished:Promise.resolve(),cancel(){}}}};
 const overlay={tagName:'DIV',classList:classes,setAttribute(){}};
 const drawing=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]||(()=>{})});
 const elements={ccSpaceIntro:overlay,ccSpaceCanvas:{getContext:()=>drawing},ccSpaceProgress:{style:{}},ccSkipIntro:{addEventListener:on}};
 const store={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 const context=vm.createContext({document:{documentElement:root,hidden:false,body:{children:[overlay,main]},activeElement:null,getElementById:id=>elements[id],querySelector:()=>main,querySelectorAll:()=>[],addEventListener:on},
  matchMedia:()=>({matches:false,addEventListener(){}}),sessionStorage:store,localStorage:store,performance:{now:()=>time},innerWidth:390,innerHeight:844,devicePixelRatio:3,
  MutationObserver:class {observe(){}},CustomEvent:class {},addEventListener:on,dispatchEvent(){},CommandCentreNative:native?{privacyLock:true}:undefined,
  setTimeout:(fn,delay)=>{const key=++id;timers.set(key,{fn,at:time+delay});return key},clearTimeout:key=>timers.delete(key),requestAnimationFrame:fn=>{const key=++id;frames.set(key,fn);return key},cancelAnimationFrame:key=>frames.delete(key)
 });context.window=context;vm.runInContext(source,context);
 const emit=(event,detail)=>{for(const fn of events.get(event)||[])fn({detail})};
 return {root,main,storage,emit,context,frame(at){time=at;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time))},advance(at){time=at;for(const [key,timer] of [...timers])if(timer.at<=time){timers.delete(key);timer.fn()}}};
}
test('intro completes by elapsed time even when rendering drops frames and animation throws',()=>{
 const h=harness({animationThrows:true});h.emit('DOMContentLoaded');assert.equal(h.main.inert,true);
 h.frame(3100);h.advance(3800);assert.equal(h.root.hasAttribute('data-cc-launch'),false);assert.equal(h.main.inert,false);
});
test('watchdog releases app when animation frames never arrive',()=>{
 const h=harness();h.emit('DOMContentLoaded');h.advance(4300);assert.equal(h.main.inert,false);assert.equal(h.root.hasAttribute('data-cc-launch'),false);
});
test('slow native unlock cannot restart an expired intro',()=>{
 const h=harness({native:true});h.emit('DOMContentLoaded');h.advance(4600);h.emit('cc-native-privacy-status',{locked:false});assert.equal(h.root.hasAttribute('data-cc-launch'),false);
});
test('previously watched intro stays skipped, while explicit replay still works',()=>{
 const h=harness({played:true});h.emit('DOMContentLoaded');assert.equal(h.root.hasAttribute('data-cc-launch'),false);
 h.context.CCSpaceMotion.replay();assert.equal(h.main.inert,true);h.context.CCSpaceMotion.skip();assert.equal(h.main.inert,false);
});
