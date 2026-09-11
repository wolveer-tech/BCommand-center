import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/space-motion.js',import.meta.url),'utf8');

function harness({preference='cinematic',reduced=false,native=false,noCanvas=false}={}) {
  let time=0,id=0;
  const timers=new Map(),frames=new Map(),events=new Map();
  const listen=(type,fn)=>{const list=events.get(type)||[];list.push(fn);events.set(type,list);};
  const emit=(type,event={})=>(events.get(type)||[]).forEach(fn=>fn(event));
  const root={dataset:{},hasAttribute:name=>name==='data-cc-launch'&&root.dataset.ccLaunch!==undefined,removeAttribute:()=>delete root.dataset.ccLaunch};
  const element=(tagName='DIV')=>({tagName,inert:false,style:{},attributes:{},classList:{add(){},remove(){},contains(){return false;}},setAttribute(name,value){this.attributes[name]=value;},querySelectorAll:()=>[],addEventListener:listen,focus(){}});
  const overlay=element(),canvas=element(),progress=element(),page=element(),alreadyInert=element();alreadyInert.inert=true;
  const ctx={setTransform(){},fillRect(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){},createRadialGradient(){return {addColorStop(){}};}};
  canvas.getContext=()=>noCanvas?null:ctx;
  const ids={ccSpaceIntro:overlay,ccSpaceCanvas:canvas,ccSpaceProgress:progress};
  const document={documentElement:root,body:{children:[overlay,page,alreadyInert]},activeElement:null,hidden:false,addEventListener:listen,getElementById:id=>ids[id]||null,querySelector:()=>page,querySelectorAll:()=>[]};
  const window={CommandCentreNative:native?{privacyLock:true}:undefined,dispatchEvent:e=>emit(e.type,e)};
  vm.runInNewContext(source,{window,document,matchMedia:()=>({matches:reduced,addEventListener(){}}),localStorage:{getItem:()=>preference},addEventListener:listen,innerWidth:390,innerHeight:844,devicePixelRatio:2,performance:{now:()=>time},CustomEvent:class{constructor(type){this.type=type;}},MutationObserver:class{observe(){}},setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  function tick(ms){time+=ms;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(time));for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}}
  return {root,window,page,alreadyInert,frames,emit,tick,ready:()=>emit('DOMContentLoaded'),run:ms=>{for(let t=0;t<ms;t+=20)tick(20);}};
}
test('intro completes without blocking the app or leaving a render loop',()=>{
  const h=harness();h.ready();assert.equal(h.page.inert,true);h.run(4000);
  assert.equal(h.root.dataset.ccLaunch,undefined);assert.equal(h.page.inert,false);assert.equal(h.frames.size,0);assert.equal(h.alreadyInert.inert,true);
});
test('Skip releases the app immediately and repeated skip is harmless',()=>{
  const h=harness();h.ready();h.window.CCSpaceMotion.skip();h.window.CCSpaceMotion.skip();
  assert.equal(h.page.inert,false);assert.equal(h.frames.size,0);assert.equal(h.root.dataset.ccLaunch,undefined);
});
test('missing canvas never traps the user behind the intro',()=>{
  const h=harness({noCanvas:true});h.ready();assert.equal(h.page.inert,false);assert.equal(h.root.dataset.ccLaunch,undefined);
});
test('Reduce Motion uses a brief fade and Off skips startup entirely',()=>{
  const h=harness({reduced:true});h.ready();h.run(600);assert.equal(h.root.dataset.ccMotion,'gentle');assert.equal(h.page.inert,false);
  const off=harness({preference:'off'});off.ready();assert.equal(off.root.dataset.ccLaunch,undefined);assert.equal(off.frames.size,0);
});
test('native intro waits for unlock, including an unlock after the fail-safe',()=>{
  const h=harness({native:true});h.ready();assert.equal(h.frames.size,0);h.tick(11000);
  assert.equal(h.root.dataset.ccLaunch,undefined);
  h.emit('cc-native-privacy-status',{detail:{locked:false}});assert.equal(h.root.dataset.ccLaunch,'playing');
  h.run(4000);assert.equal(h.page.inert,false);assert.equal(h.frames.size,0);
});
test('replaying and leaving the page both clean up inert state',()=>{
  const h=harness();h.ready();h.run(4000);h.window.CCSpaceMotion.replay();assert.equal(h.page.inert,true);
  h.emit('pagehide');assert.equal(h.page.inert,false);assert.equal(h.frames.size,0);
});
test('rapid page switches cancel previous motion and gentle mode never scales content',()=>{
  const h=harness();h.ready();h.window.CCSpaceMotion.skip();
  const running=[];
  const target={style:{},getBoundingClientRect:()=>({left:0,top:60}),animate:(frames,options)=>{
    const a={frames,options,cancelled:false,finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};running.push(a);return a;
  }};
  h.window.CCSpaceMotion.enterPage(target,{from:'home',to:'notes'});
  h.window.CCSpaceMotion.enterPage(target,{from:'notes',to:'calendar'});
  assert.equal(running[0].cancelled,true);assert.equal(running[1].cancelled,false);
  const gentle=harness({reduced:true});gentle.ready();gentle.window.CCSpaceMotion.skip();
  gentle.window.CCSpaceMotion.enterPage(target,{from:'home',to:'notes'});
  assert.ok(running.at(-1).frames.every(frame=>!frame.transform));
});
