import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync('public/streamcorner-view.js','utf8');
function harness(native={}){
 const classes=new Set(),calls=[],window=new EventTarget(),document=new EventTarget();
 class Element extends EventTarget {constructor(id){super();this.id=id;this.src='about:blank';this.hidden=true;this.isConnected=true;this.open=false;}focus(){document.activeElement=this;}showModal(){this.open=true;}close(){this.open=false;this.dispatchEvent(new Event('close'));}}
 const nodes=Object.fromEntries(['streamCornerView','streamCornerFrame','streamCornerBack','streamCornerRestart','streamCornerNotice'].map(id=>[id,new Element(id)]));
 const opener=new Element('provider-button');document.activeElement=opener;document.getElementById=id=>nodes[id];document.documentElement={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}};
 window.CommandCentrePlaybackSafety={stop:kind=>calls.push(['stop',kind]),watch:(...args)=>calls.push(['watch',...args])};window.closeLiveFootball=()=>calls.push(['close-live']);window.stopVideoPlayback=()=>calls.push(['stop-video']);
 Object.assign(window,native);
 vm.runInContext(script,vm.createContext({document,window}));return {api:window.CommandCentreStreamCorner,window,document,nodes,classes,calls,opener};
}
const click=node=>node.dispatchEvent(new Event('click'));
test('StreamCorner is idle until an explicit open, and starts at its fixed source inside a modal',()=>{
 const h=harness();assert.equal(h.nodes.streamCornerFrame.src,'about:blank');assert.equal(h.calls.length,0);h.api.open();assert.equal(h.api.active,true);assert.equal(h.nodes.streamCornerFrame.src,'https://streamcorner.st/');assert.ok(h.classes.has('cc-streamcorner-open'));assert.equal(h.document.activeElement,h.nodes.streamCornerBack);assert.ok(h.calls.some(c=>c[0]==='close-live'));assert.ok(h.calls.some(c=>c[0]==='stop-video'));assert.equal(h.calls.find(c=>c[0]==='watch')[1],'streamcorner');
 const before=h.calls.length;h.api.open();assert.equal(h.calls.length,before,'opening the current view must not restart a playing stream');
});
test('Back and Escape unload the source and return focus without opening another tab',()=>{
 const h=harness();h.api.open();click(h.nodes.streamCornerBack);assert.equal(h.api.active,false);assert.equal(h.nodes.streamCornerFrame.src,'about:blank');assert.equal(h.classes.size,0);assert.equal(h.document.activeElement,h.opener);
 h.api.open();const cancel=new Event('cancel',{cancelable:true});h.nodes.streamCornerView.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);assert.equal(h.api.active,false);
});
test('Restart is explicit and page navigation or pagehide stops the contained source',()=>{
 const h=harness();h.api.open();click(h.nodes.streamCornerRestart);assert.equal(h.calls.filter(c=>c[0]==='watch').length,2);
 h.window.dispatchEvent(new CustomEvent('cc-pagechange',{detail:'football'}));assert.equal(h.api.active,true);h.window.dispatchEvent(new CustomEvent('cc-pagechange',{detail:'home'}));assert.equal(h.api.active,false);
 h.api.open();h.window.dispatchEvent(new Event('pagehide'));assert.equal(h.nodes.streamCornerFrame.src,'about:blank');assert.equal(h.api.active,false);
});
test('source document loads never claim video playback, and memory/failure events show a contained retry state',()=>{
 const h=harness();h.api.open();assert.match(h.nodes.streamCornerNotice.textContent,/Loading/);h.nodes.streamCornerFrame.dispatchEvent(new Event('load'));assert.equal(h.nodes.streamCornerNotice.hidden,true);assert.doesNotMatch(h.nodes.streamCornerNotice.textContent,/playing|playback started/i);
 h.window.dispatchEvent(new CustomEvent('cc-playerfailure',{detail:{kind:'media'}}));assert.equal(h.nodes.streamCornerNotice.hidden,true);
 h.window.dispatchEvent(new CustomEvent('cc-playerfailure',{detail:{kind:'streamcorner'}}));assert.match(h.nodes.streamCornerNotice.textContent,/could not load/);assert.equal(h.calls.filter(c=>c[0]==='watch').length,1,'failure must not start a retry loop');
 h.api.close();h.nodes.streamCornerFrame.dispatchEvent(new Event('load'));assert.equal(h.nodes.streamCornerNotice.hidden,true);
});
test('the provider view preserves origin isolation, media permissions and navigation containment',()=>{
 const html=readFileSync('public/index.html','utf8'),frame=html.match(/<iframe\b[^>]*id="streamCornerFrame"[^>]*>/)?.[0];assert.ok(frame);assert.match(frame,/sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"/);assert.doesNotMatch(frame,/allow-popups|allow-top-navigation/);assert.match(frame,/allow="autoplay; fullscreen; encrypted-media; picture-in-picture"/);assert.match(frame,/src="about:blank"/);assert.doesNotMatch(script,/window\.open|location\s*=|removeAttribute\(['"]sandbox|innerHTML/);
 const css=readFileSync('public/streamcorner-view.css','utf8');assert.match(css,/inset:0/);assert.match(css,/width:100%/);assert.match(css,/100dvh/);
});
test('Windows delegates the fixed source action to its native view without mounting a browser iframe',()=>{
 const messages=[],h=harness({CommandCentreDesktop:{streamCorner:true},chrome:{webview:{postMessage:value=>messages.push(value)}}});h.api.open();
 assert.deepEqual(messages,['cc-open-streamcorner']);assert.equal(h.api.active,false);assert.equal(h.nodes.streamCornerFrame.src,'about:blank');assert.equal(h.calls.filter(c=>c[0]==='watch').length,0);assert.ok(h.calls.some(c=>c[0]==='stop-video'));assert.ok(h.calls.some(c=>c[0]==='close-live'));
});
test('iPhone IPA delegates the same fixed action to its isolated native view',()=>{
 const messages=[],h=harness({CommandCentreNative:{nativeStreamCorner:true},webkit:{messageHandlers:{nativeStreamCorner:{postMessage:value=>messages.push(value)}}}});h.api.open();
 assert.deepEqual(messages,['cc-open-streamcorner']);assert.equal(h.api.active,false);assert.equal(h.nodes.streamCornerFrame.src,'about:blank');assert.equal(h.calls.filter(c=>c[0]==='watch').length,0);
});
test('the Entertainment Movies & TV entry opens the same source action',()=>{
 const html=readFileSync('public/index.html','utf8');
 assert.match(html,/<div class="watch-subpanel active" data-watch-panel="movies">[\s\S]*?<button class="btn primary" type="button" data-open-streamcorner>Browse &amp; watch<\/button>/);
});
test('browser and older IPA builds retain their view unless a complete native capability exists',()=>{
 for(const native of [{CommandCentreDesktop:{streamCorner:true}},{CommandCentreNative:{nativeStreamCorner:true}},{chrome:{webview:{postMessage:()=>{throw Error('must not be called')}}}},{CommandCentreDesktop:{streamCorner:false},chrome:{webview:{postMessage:()=>{throw Error('must not be called')}}}}]){
  const h=harness(native);h.api.open();assert.equal(h.api.active,true);assert.equal(h.nodes.streamCornerFrame.src,'https://streamcorner.st/');
 }
 const broken=harness({CommandCentreDesktop:{streamCorner:true},chrome:{webview:{postMessage:()=>{throw Error('bridge unavailable')}}}});broken.api.open();assert.equal(broken.api.active,true);
 const brokenIOS=harness({CommandCentreNative:{nativeStreamCorner:true},webkit:{messageHandlers:{nativeStreamCorner:{postMessage:()=>{throw Error('bridge unavailable')}}}}});brokenIOS.api.open();assert.equal(brokenIOS.api.active,true);
});
