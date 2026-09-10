import { createSHA256, createMD5 } from 'hash-wasm';

const $ = id => document.getElementById(id);
const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const formatBytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : n < 1073741824 ? `${(n/1048576).toFixed(1)} MB` : `${(n/1073741824).toFixed(2)} GB`;
const KEY = 'cc_transfer_device_v1';
let session; try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
let view='inbox', compose='file', files=[], items=[], config, controller, refreshing=false, preparedUrl, verifyItem, loadSequence=0, renderedSignature='';
const status = (message='', error=false) => { $('trStatus').textContent=message; $('trStatus').classList.toggle('error',error); };
const notice = promise => Promise.resolve(promise).catch(e => status(e.message,true));

async function api(path, data, method, signal) {
  const response=await fetch('/api/transfers'+path,{ method:method || (data === undefined ? 'GET':'POST'), headers:{'Content-Type':'application/json',...(session?.token ? {Authorization:'Bearer '+session.token}:{})},body:data===undefined ? undefined:JSON.stringify(data),signal });
  const result=await response.json().catch(()=>({error:'Unexpected server response.'}));
  if(!response.ok){
    if(response.status===401 && path!='/bootstrap') { session=null;localStorage.removeItem(KEY); connection();window.dispatchEvent(new Event('cc-transfer-session')); }
    throw new Error(result.error || `Transfers returned ${response.status}.`);
  }
  return result;
}

function connection(){ $('trConnect').hidden=!!session; $('trConnected').hidden=!session; }
async function connect(kind){
  const button=$(kind==='claim'?'trClaim':'trBootstrap'); button.disabled=true;
  try {
    const name=$('trDeviceName').value.trim(); if(!name) throw new Error('Give this device a name.');
    const result=await api('/'+kind,kind==='claim'?{name,code:$('trPairCode').value}:{name,key:$('trSetupKey').value});
    localStorage.setItem(KEY,JSON.stringify(result));session=result;$('trPairCode').value='';$('trSetupKey').value='';connection();window.dispatchEvent(new Event('cc-transfer-session'));
    await open();status(`${result.device.name} is connected. Send a file, link or message to another paired device.`);
  } finally { button.disabled=false; }
}

async function devices(){
  const result=await api('/devices'), selected=$('trRecipient').value;
  $('trRecipient').innerHTML='<option value="all">All my other devices</option>'+result.devices.filter(d=>d.id!==session.device.id).map(d=>`<option value="${d.id}">${escape(d.name)}</option>`).join('');
  if([...$('trRecipient').options].some(o=>o.value===selected))$('trRecipient').value=selected;
  $('trDeviceList').innerHTML=result.devices.map(d=>`<div class="tr-device"><span>${escape(d.name)} ${d.id===session.device.id?'<span class="tr-muted">· This device</span>':''}</span>${d.id===session.device.id?'':`<button class="btn small" data-tr-revoke="${d.id}">Remove</button>`}</div>`).join('');
}

async function open(){
  connection();if(!session)return;
  try {
    config=await api('/status');$('trIdentity').textContent='Connected as '+config.device.name;
    $('trFileLimit').textContent=config.files?`Up to ${formatBytes(config.maxFileBytes)} per file. Keep the app open while sending. On iPhone, choose a file from Files to avoid Photos export conversions.`:config.storageError;
    const nativeAlerts=window.CommandCentreNative?.nativeNotifications&&localStorage.getItem('cc_native_inbox_alerts')==='1';
    $('trPushState').textContent=nativeAlerts?'Native transfer alerts are registered for iOS background checks.':config.push?'Transfer notifications are connected on this device.':config.pushConfigured?'Enable notifications to receive alerts when the app is closed.':'Add the existing VAPID push secrets to enable background alerts.';
    await devices();await load();
    const registration=await navigator.serviceWorker?.getRegistration();const sub=await registration?.pushManager?.getSubscription();
    if(sub && config.push) await api('/push',{subscription:sub.toJSON()});
  }catch(e){status(e.message,true);}
}

function rowHtml(t){
  const own=t.sender_id===session.device.id;
  const when=new Date(t.ready_at).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const exp=t.expires_at?'Deletes '+new Date(t.expires_at).toLocaleString([], {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Kept until deleted';
  const icon={file:'▤',link:'↗',message:'☰'}[t.kind];
  const action=(name,label)=>`<button class="btn small" data-tr-action="${name}" data-tr-id="${t.id}">${label}</button>`;
  const content=t.kind==='file'?`<div class="tr-meta">${formatBytes(t.size)} · Original file</div>`:t.kind==='link'?`<div class="tr-content"><a href="${escape(t.content)}" target="_blank" rel="noopener noreferrer">${escape(t.content)}</a></div>`:`<div class="tr-content">${escape(t.content)}</div>`;
  return `<article class="tr-item ${!own&&!t.read_at?'unread':''}"><div class="tr-item-head"><div class="tr-item-icon" aria-hidden="true">${icon}</div><div class="tr-item-main"><h4>${escape(t.title)}</h4><div class="tr-meta">${own?'To '+escape(t.recipient_name||'all other devices'):'From '+escape(t.sender_name||'another device')} · ${escape(when)}<br>${escape(exp)}</div>${content}</div></div>
    <div class="tr-actions">${t.kind==='file'?action('save','Save original')+action('prepare','Open / Share')+action('verify','Verify saved file'):action('copy','Copy')}${!own&&!t.read_at?action('read','Mark read'):''}${own?action('delete','Delete'):''}</div>
    ${t.kind==='file'?`<details class="tr-hash"><summary>SHA-256 checksum</summary><div>Original: ${escape(t.sha256)}</div><div>Use Verify saved file to compare the downloaded bytes.</div></details>`:''}</article>`;
}

async function load(more=false, quiet=false){
  if(!session || (refreshing && quiet))return;
  const seq=++loadSequence;refreshing=true;
  try{
    const last=more?items.at(-1):null;
    const result=await api('/items?view='+view+(last?`&before=${last.ready_at}&beforeId=${last.id}`:''));
    if(seq!==loadSequence)return;
    items=more?[...items,...result.items]:result.items;
    const signature=JSON.stringify([view,items]);
    if(signature!==renderedSignature){
      $('trList').innerHTML=items.length?items.map(rowHtml).join(''):`<div class="tr-empty"><strong>${view==='inbox'?'Your inbox is clear':'Nothing here yet'}</strong>${view==='inbox'?'Files, links and messages from your other devices will appear here.':'Send something to see it here.'}</div>`;
      renderedSignature=signature;
    }
    $('trMore').hidden=!result.hasMore;$('trCount').textContent=items.length+' item'+(items.length===1?'':'s')+(result.hasMore?'+':'');
  }finally{if(seq===loadSequence)refreshing=false;}
}

function selectFiles(next){ files=[...next];$('trQueue').innerHTML=files.map(f=>`<div class="tr-queue-item">${escape(f.name)} <span class="tr-muted">${formatBytes(f.size)}</span></div>`).join(''); }
function busy(value){
  $('trSend').disabled=value;$('trFiles').disabled=value;$('trCancel').hidden=!value;
  document.querySelectorAll('[data-tr-compose],#trRecipient,#trExpiry,#trTitle,#trText').forEach(el=>el.disabled=value);
}
function uploadPart(url, headers, bytes, signal, progress){
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open('PUT',url);xhr.timeout=15*60*1000;
    Object.entries(headers).forEach(([k,v])=>xhr.setRequestHeader(k,v));
    const abort=()=>xhr.abort();signal.addEventListener('abort',abort,{once:true});
    const cleanup=()=>signal.removeEventListener('abort',abort);
    xhr.upload.onprogress=e=>progress(e.loaded);
    xhr.onerror=()=>{cleanup();reject(new Error('Upload connection failed. Check your connection and the R2 CORS settings.'));};
    xhr.ontimeout=()=>{cleanup();reject(new Error('Upload timed out. Try again on a stable connection.'));};
    xhr.onabort=()=>{cleanup();reject(new DOMException('Upload cancelled.','AbortError'));};
    xhr.onload=()=>{cleanup();const etag=(xhr.getResponseHeader('ETag')||'').replaceAll('"','');if(xhr.status>=200&&xhr.status<300&&/^[A-Za-z0-9+\/_=-]{1,256}$/.test(etag))resolve(etag);else reject(new Error(`R2 upload failed (${xhr.status}). Check storage credentials, CORS and ETag exposure.`));};
    if(signal.aborted){cleanup();reject(new DOMException('Cancelled','AbortError'));}else xhr.send(bytes);
  });
}

export async function hashFile(file,onProgress=()=>{}){
  const hash=await createSHA256();hash.init();
  for(let at=0;at<file.size;at+=4*1024*1024){hash.update(new Uint8Array(await file.slice(at,at+4*1024*1024).arrayBuffer()));onProgress(Math.min(file.size,at+4*1024*1024));}
  return hash.digest('hex');
}

async function sendFile(file, options, element, signal){
  if(file.size>config.maxFileBytes)throw new Error(`${file.name} is larger than ${formatBytes(config.maxFileBytes)}.`);
  const upload=await api('/uploads',{...options,filename:file.name,mime:file.type,size:file.size},undefined,signal);
  let completing=false;
  try{
    const sha=await createSHA256(),md5=await createMD5(),parts=[];sha.init();
    element.innerHTML=`${escape(file.name)} <span class="tr-muted" data-progress-label></span><progress class="tr-progress" max="${Math.max(file.size,1)}" value="0"></progress>`;
    const progress=n=>{element.querySelector('progress').value=n;element.querySelector('[data-progress-label]').textContent=`${formatBytes(n)} / ${formatBytes(file.size)}`;};
    for(let partNumber=1;partNumber<=upload.parts;partNumber++){
      signal.throwIfAborted();const offset=(partNumber-1)*upload.partSize;
      const bytes=new Uint8Array(await file.slice(offset,offset+upload.partSize).arrayBuffer());sha.update(bytes);md5.init();md5.update(bytes);
      const digest=btoa(String.fromCharCode(...md5.digest('binary')));let etag;
      for(let attempt=0;attempt<3;attempt++){
        try{const signed=await api(`/uploads/${upload.id}/part`,{partNumber,md5:digest},undefined,signal);etag=await uploadPart(signed.url,signed.headers,bytes,signal,n=>progress(offset+n));break;}
        catch(e){if(signal.aborted||attempt===2)throw e;}
      }
      parts.push({partNumber,etag});progress(offset+bytes.length);
    }
    signal.throwIfAborted();completing=true;
    const payload={parts,sha256:sha.digest('hex')};
    // Repeating completion is safe if the network drops after R2 commits the file.
    try{await api(`/uploads/${upload.id}/complete`,payload);}catch(first){try{await api(`/uploads/${upload.id}/complete`,payload);}catch{throw first;}}
    element.textContent=`✓ ${file.name} sent · ${formatBytes(file.size)} · SHA-256 recorded`;
  }catch(e){
    if(!completing)await api('/uploads/'+upload.id,undefined,'DELETE').catch(()=>{});
    if(completing)e.message+=' Completion could not be confirmed; check Sent before resending.';
    throw e;
  }
}

async function send(){
  if(!session)return;
  const options={recipientId:$('trRecipient').value,ttl:Number($('trExpiry').value)};
  if(compose==='file'&&!files.length){status('Choose one or more files first.',true);return;}
  busy(true);status('');controller=new AbortController();let failed=0;
  try{
    if(compose==='file'){
      if(!config.files)throw new Error(config.storageError);
      const selected=[...files];$('trQueue').innerHTML='';
      for(const file of selected){
        if(controller.signal.aborted)break;
        const element=document.createElement('div');element.className='tr-queue-item';element.textContent='Preparing '+file.name+'…';$('trQueue').append(element);
        try{await sendFile(file,options,element,controller.signal);}catch(e){failed++;element.textContent=`${file.name}: ${e.message}`;}
      }
      status(controller.signal.aborted?'Upload cancelled. Completed files remain in Sent.':failed?'Some files could not be sent. Check the messages above.':'Files sent. You can find them in Sent.',!!failed);
      files=[];$('trFiles').value='';
    }else{
      await api('/items',{...options,kind:compose,title:$('trTitle').value,content:$('trText').value});$('trText').value='';$('trTitle').value='';status(compose==='link'?'Link sent.':'Message sent.');
    }
    await load();
  }finally{busy(false);controller=null;}
}

async function copy(text){await navigator.clipboard.writeText(text);status('Copied.');}
async function markRead(t){await api(`/items/${t.id}/read`,{});t.read_at=Date.now();}
function clearPrepared(){if(preparedUrl)URL.revokeObjectURL(preparedUrl);preparedUrl=null;$('trPrepared').hidden=true;$('trPrepared').replaceChildren();}
function preparedText(message){clearPrepared();$('trPrepared').hidden=false;const p=document.createElement('p');p.textContent=message;$('trPrepared').append(p);}
function preparedLink(label,url,download){const a=document.createElement('a');a.className='btn';a.textContent=label;a.href=url;if(download)a.download=download;a.target='_blank';a.rel='noopener noreferrer';$('trPrepared').append(a);return a;}

async function fileAction(t,action){
  const info=await api(`/items/${t.id}/download`,{});await markRead(t);
  if(window.webkit?.messageHandlers?.nativeTransfer){
    preparedText('Downloading the original file. The iPhone share sheet will open after its checksum has been verified.');
    window.webkit.messageHandlers.nativeTransfer.postMessage({action:'download',url:info.url,filename:info.filename,sha256:info.sha256,size:info.size});return;
  }
  if(action==='save'||t.size>128*1024*1024){
    preparedText(t.size>128*1024*1024?'Download the original, then open or share it from Files / Downloads. Use Verify saved file to compare its checksum.':'Your original file is ready to download.');
    preparedLink('Download '+t.filename,info.url,t.filename);
    const p=document.createElement('p');p.className='tr-muted';p.textContent='This download link expires in '+info.expiresIn+' seconds. Tap Save original again if needed.';$('trPrepared').append(p);return;
  }
  preparedText('Preparing the original file and verifying its checksum…');
  const response=await fetch(info.url);if(!response.ok)throw new Error('Download failed. Tap Open / Share again.');
  const sha=await createSHA256();sha.init();const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>t.size||size>128*1024*1024){await reader.cancel();throw new Error('Downloaded size does not match the original.');}sha.update(value);chunks.push(value);}
  if(size!==t.size||sha.digest('hex')!==t.sha256){clearPrepared();throw new Error('Checksum did not match. The file was not prepared for sharing. Try downloading again.');}
  const file=new File(chunks,t.filename,{type:t.mime||'application/octet-stream'});
  preparedText('✓ SHA-256 matches. These are the original file bytes.');preparedUrl=URL.createObjectURL(file);
  preparedLink('Save original',preparedUrl,t.filename);
  if(/^(image\/(png|jpeg|gif|webp|avif)|audio\/|video\/|application\/pdf$)/.test(file.type))preparedLink('Open',preparedUrl);
  if(navigator.canShare?.({files:[file]})){
    const button=document.createElement('button');button.className='btn';button.textContent='Share';button.onclick=()=>notice(navigator.share({files:[file]}).catch(e=>{if(e.name!=='AbortError')throw e;}));$('trPrepared').append(button);
  }
}

async function action(name,itemId){
  const t=items.find(x=>x.id===itemId);if(!t)return;
  if(name==='copy'){await copy(t.content);await markRead(t);}
  if(name==='read'){await markRead(t);await load();}
  if(name==='delete'){if(!confirm(`Delete “${t.title}” from all devices? This cannot be undone.`))return;await api('/items/'+t.id,undefined,'DELETE');clearPrepared();await load();}
  if(name==='save'||name==='prepare')await fileAction(t,name);
  if(name==='verify'){verifyItem=t;$('trVerifyFile').click();}
}

async function notifications(){
  const native=window.CommandCentreNative?.nativeNotifications&&window.webkit?.messageHandlers?.nativeNotifications;
  if(native){
    native.postMessage({action:'registerInboxAlerts',token:session?.token||''});
    localStorage.setItem('cc_native_inbox_alerts','1');
    config.push=true;$('trPushState').textContent='Native transfer alerts are registered for iOS background checks.';status('Allow iPhone notifications when prompted. Transfers refresh while open and during iOS background checks when closed.');
    return;
  }
  if(!('Notification'in window)||!('PushManager'in window)||!navigator.serviceWorker)throw new Error('On iPhone, open this site in Safari, add it to the Home Screen, then enable notifications there. The native wrapper does not support Web Push.');
  if(!config.pushConfigured)throw new Error('Add the VAPID push secrets in Cloudflare first.');
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Allow notifications in your device settings to receive transfer alerts.');
  const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub){const r=await fetch('/api/push/public-key');const {publicKey}=await r.json();const raw=atob(publicKey.replaceAll('-','+').replaceAll('_','/'));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
  await api('/push',{subscription:sub.toJSON()});config.push=true;$('trPushState').textContent='Transfer notifications are connected on this device.';status('Transfer notifications enabled.');
}

async function pair(){
  const result=await api('/pair',{});$('trPairOutput').hidden=false;$('trPairOutput').innerHTML=`<p>On the new device, open Transfers and enter this code:</p><div class="tr-code">${escape(result.code)}</div><p class="tr-muted">One use · expires ${new Date(result.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>`;
  const button=document.createElement('button');button.className='btn';button.textContent='Copy pairing code';button.onclick=()=>notice(copy(result.code));$('trPairOutput').append(button);
}

function bind(){
  if(!$('transfersPage'))return;
  $('trDeviceName').value=/iPhone|iPad|iPod/.test(navigator.userAgent)?'My iPhone':'My computer';
  $('trClaim').onclick=()=>notice(connect('claim'));$('trBootstrap').onclick=()=>notice(connect('bootstrap'));
  $('trRefresh').onclick=()=>notice(open());$('trPair').onclick=()=>notice(pair());$('trNotifications').onclick=()=>notice(notifications());
  $('trDevicesToggle').onclick=()=>{$('trDevicesPanel').hidden=!$('trDevicesPanel').hidden;$('trDevicesToggle').setAttribute('aria-expanded',String(!$('trDevicesPanel').hidden));};
  $('trSignOut').onclick=()=>notice((async()=>{if(!confirm('Disconnect this device? You can pair it again later.'))return;await api('/devices/'+session.device.id,undefined,'DELETE');session=null;localStorage.removeItem(KEY);clearPrepared();connection();window.dispatchEvent(new Event('cc-transfer-session'));status('Device disconnected.');})());
  $('trDeviceList').onclick=e=>{const b=e.target.closest('[data-tr-revoke]');if(b)notice((async()=>{if(!confirm('Remove this device from Transfers?'))return;await api('/devices/'+b.dataset.trRevoke,undefined,'DELETE');await devices();})());};
  document.querySelectorAll('[data-tr-compose]').forEach(b=>b.onclick=()=>{compose=b.dataset.trCompose;document.querySelectorAll('[data-tr-compose]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));$('trFileCompose').hidden=compose!=='file';$('trTextCompose').hidden=compose==='file';$('trTextLabel').textContent=compose==='link'?'Link':'Message';$('trText').placeholder=compose==='link'?'https://…':'Write a message…';$('trSend').textContent='Send '+(compose==='file'?'files':compose);});
  document.querySelectorAll('[data-tr-view]').forEach(b=>b.onclick=()=>{view=b.dataset.trView;document.querySelectorAll('[data-tr-view]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));notice(load());});
  $('trFiles').onchange=e=>selectFiles(e.target.files);$('trSend').onclick=()=>notice(send());$('trCancel').onclick=()=>controller?.abort();
  $('trDrop').ondragover=e=>{e.preventDefault();if(!controller)$('trDrop').classList.add('drag');};$('trDrop').ondragleave=()=>$('trDrop').classList.remove('drag');
  $('trDrop').ondrop=e=>{e.preventDefault();$('trDrop').classList.remove('drag');if(!controller)selectFiles(e.dataTransfer.files);};
  $('trMore').onclick=()=>notice(load(true));$('trList').onclick=e=>{const b=e.target.closest('[data-tr-action]');if(b){b.disabled=true;notice(action(b.dataset.trAction,b.dataset.trId).finally(()=>b.disabled=false));}};
  const verify=document.createElement('input');verify.type='file';verify.id='trVerifyFile';verify.hidden=true;$('transfersPage').append(verify);
  verify.onchange=()=>notice((async()=>{const file=verify.files[0],t=verifyItem;verify.value='';if(!file||!t)return;if(file.size!==t.size)throw new Error('Size does not match the original file.');status('Checking SHA-256…');const actual=await hashFile(file);status(actual===t.sha256?'✓ SHA-256 matches: the saved file is identical to the original.':'Checksum mismatch: this is not the original file.',actual!==t.sha256);})());
  window.addEventListener('cc-pagechange',e=>{if(e.detail==='transfers')notice(open());});
  window.addEventListener('cc-transfer-session',()=>{let next;try{next=JSON.parse(localStorage.getItem(KEY));}catch{}if(next?.token===session?.token)return;session=next;connection();if(session&&$('transfersPage').classList.contains('active'))notice(open());});
  window.addEventListener('beforeunload',e=>{if(controller){e.preventDefault();e.returnValue='';}});
  window.addEventListener('cc-transfer-native',e=>status(e.detail.message,!!e.detail.error));
  window.addEventListener('cc-native-notification-status',e=>{if(e.detail?.permission==='granted'){localStorage.setItem('cc_native_inbox_alerts','1');$('trPushState').textContent='Native transfer alerts are registered for iOS background checks.';}else if(e.detail?.permission==='denied'){localStorage.removeItem('cc_native_inbox_alerts');$('trPushState').textContent='Enable alerts after allowing Command Centre notifications in iPhone Settings.';}});
  window.addEventListener('storage',e=>{if(e.key===KEY){try{session=JSON.parse(e.newValue);}catch{session=null;}connection();if(session&&$('transfersPage').classList.contains('active'))notice(open());}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('transfersPage').classList.contains('active'))notice(load(false,true));});
  setInterval(()=>{if(!document.hidden&&session&&$('transfersPage').classList.contains('active')&&!controller)notice(load(false,true));},15000);
  connection();if($('transfersPage').classList.contains('active'))notice(open());
}
bind();
