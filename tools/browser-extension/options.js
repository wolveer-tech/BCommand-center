import {request} from './background.js';
const $=id=>document.getElementById(id);
async function load(){const c=await chrome.storage.local.get(['url','name','device','recipientId','ttl']);if(c.url)$('url').value=c.url;if(c.name)$('name').value=c.name;$('ttl').value=String(c.ttl??86400);$('recipient').replaceChildren(new Option('All other devices','all'));if(c.url){const r=await request('/devices');for(const d of r.devices.filter(d=>d.id!==c.device?.id)){const o=document.createElement('option');o.value=d.id;o.textContent=d.name;$('recipient').append(o);}$('recipient').value=c.recipientId||'all';}}
$('connect').onclick=async()=>{
  try{
    const url=new URL($('url').value);if(url.protocol!=='https:')throw new Error('Use an HTTPS site URL.');
    // Requested only for the user's own Command Centre origin, from this click.
    const granted=await chrome.permissions.request({origins:[url.origin+'/*']});if(!granted)throw new Error('Allow access to your Command Centre site to connect.');
    const name=$('name').value.trim();const r=await fetch(url.origin+'/api/transfers/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,code:$('code').value})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Pairing failed.');
    await chrome.storage.local.set({url:url.origin,token:data.token,device:data.device,name});$('code').value='';$('status').textContent='Browser connected. You can now right-click a page, link or selection.';await load();
  }catch(e){$('status').textContent=e.message;}
};
$('save').onclick=async()=>{await chrome.storage.local.set({recipientId:$('recipient').value,ttl:Number($('ttl').value)});$('status').textContent='Preferences saved.';};
load().catch(e=>$('status').textContent=e.message);
