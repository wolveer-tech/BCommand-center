import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/index.html','utf8'),code=html.slice(html.indexOf('function applyMediaPlayerPolicy()'),html.indexOf('async function playSelectedMedia(',html.indexOf('function applyMediaPlayerPolicy()')));
test('compatible mode removes sandbox in browsers and native wrappers while restricted mode blocks popups',()=>{
 const frame={attributes:{sandbox:'original'},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];}},select={value:'compatible'};
 const context=vm.createContext({window:{},qs:selector=>selector==='#mediaWatchFrame'?frame:select,updateMediaProtectionStatus(){}});vm.runInContext(code,context);
 context.applyMediaPlayerPolicy();assert.equal(frame.attributes.sandbox,undefined);
 context.window.CommandCentreNative={platform:'ios'};context.applyMediaPlayerPolicy();assert.equal(frame.attributes.sandbox,undefined);
 context.window.CommandCentrePlayerProtection={popupProtection:true};context.applyMediaPlayerPolicy();assert.equal(frame.attributes.sandbox,undefined);
 select.value='restricted';context.applyMediaPlayerPolicy();assert.equal(frame.attributes.sandbox,'allow-scripts allow-same-origin allow-forms allow-presentation');
});
test('protection status reports native filtering accurately without promising browser ad blocking',()=>{
 const status={textContent:''},control={hidden:true},filter={checked:false},select={value:'compatible'};
 const nodes={'#mediaProtectionStatus':status,'#mediaAdFilterControl':control,'#mediaAdFilter':filter,'#mediaCompatibility':select};
 const context=vm.createContext({window:{},qs:selector=>nodes[selector]});
 vm.runInContext(html.slice(html.indexOf('function updateMediaProtectionStatus()'),html.indexOf("window.addEventListener('cc-player-protection-change'")),context);
 context.updateMediaProtectionStatus();assert.match(status.textContent,/removes the player sandbox/);assert.equal(control.hidden,true);
 context.window.CommandCentreNative={platform:'ios'};context.updateMediaProtectionStatus();assert.match(status.textContent,/popups and redirects blocked/);assert.equal(control.hidden,true);
 context.window.CommandCentrePlayerProtection={popupProtection:true,adFilterAvailable:true,adFilterEnabled:true};context.updateMediaProtectionStatus();assert.match(status.textContent,/common ad requests filtered/);assert.match(status.textContent,/ads may remain/);assert.equal(control.hidden,false);assert.equal(filter.checked,true);
 context.window.CommandCentrePlayerProtection.adFilterEnabled=false;context.updateMediaProtectionStatus();assert.equal(filter.checked,false);assert.doesNotMatch(status.textContent,/requests filtered/);
 select.value='restricted';context.updateMediaProtectionStatus();assert.match(status.textContent,/Some providers reject/);
});
test('Play never launches an external-only provider without an explicit Open provider action',async()=>{
 const opened=[],statuses=[],frame={src:'about:blank'};
 const context=vm.createContext({window:{open:(...args)=>{opened.push(args);return null;}},mediaEmbedState:{currentExternalOnly:true},mediaStatus:text=>statuses.push(text),resolveSelectedMediaUrl:async()=> 'https://provider.example/watch',recordMediaContinue(){},qs:()=>frame,applyMediaPlayerPolicy(){},startMediaProgressTracking(){},setActiveVideoPlayback(){}});
 vm.runInContext(html.slice(html.indexOf('async function playSelectedMedia('),html.indexOf('let liveFootballStreams=',html.indexOf('async function playSelectedMedia('))),context);
 await context.playSelectedMedia();assert.equal(opened.length,0);assert.equal(frame.src,'about:blank');assert.match(statuses.at(-1),/tap Open provider/);
 await context.playSelectedMedia(true);assert.equal(opened.at(-1)[0],'https://provider.example/watch');
});
