import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('public/index.html','utf8');
const source=html.slice(html.indexOf('const commandCentreObservedScrollers='),html.indexOf('function backToTop()'));
function harness(home=false){
 const frames=[],classes=new Set(),main={scrollHeight:1800,clientHeight:700,scrollTop:0},active={querySelector:()=>null,contains:el=>el===nested},nested={nodeType:1,isConnected:true,scrollHeight:1000,clientHeight:300,scrollTop:450};
 let scans=0;active.querySelectorAll=()=>{scans++;throw Error('Must not scan descendants on scroll');};
 const button={classList:{remove:key=>classes.delete(key),toggle:(key,value)=>value?classes.add(key):classes.delete(key)}};
 const document={body:{classList:{contains:()=>home}},documentElement:{},scrollingElement:main};
 const context=vm.createContext({window:{scrollY:0,innerHeight:700},document,qs:selector=>selector==='#backToTopBtn'?button:selector==='.page.active'?active:selector==='.main-area'?main:null,requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},getComputedStyle(){throw Error('Computed style must not be read during scrolling');}});
 vm.runInContext(source,context);return {context,frames,classes,nested,get scans(){return scans;}};
}
test('a burst of scroll events queues one update and retains nested scroll support without a tree scan',()=>{
 const h=harness();for(let i=0;i<100;i++)h.context.queueBackToTopUpdate({target:h.nested});assert.equal(h.frames.length,1);h.frames.shift()();assert.equal(h.scans,0);assert.equal(h.classes.has('visible'),true);
 h.nested.scrollTop=0;h.context.queueBackToTopUpdate({target:h.nested});h.frames.shift()();assert.equal(h.classes.has('visible'),false);
});
test('Home scrolling exits before reading page layout',()=>{
 const h=harness(true);h.context.queueBackToTopUpdate({target:h.nested});h.frames.shift()();assert.equal(h.scans,0);assert.equal(h.classes.has('visible'),false);
});
