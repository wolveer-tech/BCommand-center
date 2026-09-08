import {send} from './background.js';
const $=id=>document.getElementById(id);
async function perform(work){try{$('status').textContent='Sending…';await work();$('status').textContent='Sent.';}catch(e){$('status').textContent=e.message;}}
$('page').onclick=()=>perform(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!/^https?:\/\//.test(tab?.url||''))throw new Error('Open a normal web page first.');await send('link',tab.url,tab.title);});
$('message').onclick=()=>perform(async()=>{if(!$('text').value.trim())throw new Error('Write a message first.');await send('message',$('text').value,'');$('text').value='';});
$('settings').onclick=()=>chrome.runtime.openOptionsPage();
chrome.storage.local.get(['lastResult','lastAt']).then(c=>{if(c.lastResult&&Date.now()-c.lastAt<3600000)$('status').textContent=c.lastResult;});
chrome.action.setBadgeText({text:''});
