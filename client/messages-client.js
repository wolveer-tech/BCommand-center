// Messages and Transfers share the same per-device credential.
const $=id=>document.getElementById(id),KEY='cc_transfer_device_v1',DEVICE_SYNC_KEY='cc_transfer_devices_changed_v1';
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{status('Browser storage is full. Keep this tab open to retain unsent messages.',true);}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=read(KEY),chats=[],selected=null,messages=[],older=false,sequence=0,refreshTask=null,contactTime=0,readThrough=0,codeExpiry=0;
let pending=[],drafts={},favourite=null,replyingTo=null,showDisconnected=false;
const sending=new Set();
const personalKey=name=>'cc_messages_'+name+'_'+session?.device.id;
function personal(){pending=read(personalKey('pending'),[]);drafts=read(personalKey('drafts'),{});favourite=read(personalKey('favourite'));showDisconnected=read(personalKey('showDisconnected'),false)===true;}
function status(text='',error=false){$('msgStatus').textContent=text;$('msgStatus').classList.toggle('error',error);}
function pairStatus(text='',error=false){$('msgPairStatus').textContent=text;$('msgPairStatus').classList.toggle('error',error);}
const notice=promise=>Promise.resolve(promise).catch(e=>{if(e.message!=='Session changed.')status(e.message,true);});
const pairNotice=promise=>Promise.resolve(promise).catch(e=>pairStatus(e.message,true));
const active=()=>$('messagesPage').classList.contains('active')&&!document.hidden;
const nearBottom=()=>{const el=$('msgHistory');return el.scrollHeight-el.scrollTop-el.clientHeight<75;};
function bottom(){const el=$('msgHistory');el.scrollTop=el.scrollHeight;$('msgNew').hidden=true;notice(markRead());}
function connection(){
  $('msgWelcome').hidden=!!session;$('msgShell').hidden=!session;$('msgNotifications').hidden=!session;
  $('msgIdentity').textContent=session?'Connected as '+session.device.name:'Connect once. Send in a tap.';
  $('msgGenerateArea').hidden=!session;$('msgNameArea').hidden=!!session;
}
function syncSession(){
  const next=read(KEY);if(next?.token===session?.token)return;
  sequence++;session=next;chats=[];selected=null;messages=[];contactTime=0;readThrough=0;personal();
  $('msgText').value='';clearReply();updateCharacterCount();$('msgBubbles').replaceChildren();$('msgChats').replaceChildren();$('msgThread').hidden=true;$('msgChoose').hidden=false;$('msgShell').classList.remove('chat-open');
  $('msgCodeArea').hidden=true;codeExpiry=0;connection();if(session&&active())notice(open());
}
async function api(path,data,base='/api/messages'){
  const token=session?.token,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    const result=await response.json().catch(()=>({error:'Unexpected server response.'}));
    if(token!==session?.token)throw new Error('Session changed.');
    if(!response.ok){if(response.status===401&&token){localStorage.removeItem(KEY);window.dispatchEvent(new Event('cc-transfer-session'));}throw new Error(result.error||'Messages could not connect.');}
    return result;
  }catch(e){if(e.name==='AbortError'||e instanceof TypeError)throw new Error('Connection interrupted. Your unsent messages are kept here; tap Retry when connected.');throw e;}
  finally{clearTimeout(timer);}
}
function quickPeer(){return chats.find(c=>c.id===favourite&&!c.revoked_at)||chats.find(c=>/\b(pc|computer|desktop)\b/i.test(c.name)&&!c.revoked_at)||chats.find(c=>!c.revoked_at);}
function messageParts(value){
  const text=String(value||''),match=text.match(/^↪ Reply to ([^:\n]{1,60}): ([^\n]{1,140})\n\n([\s\S]*)$/);
  return match?{replyName:match[1],quote:match[2],body:match[3]}:{replyName:'',quote:'',body:text};
}
function messagePreview(value){return messageParts(value).body.replace(/\s+/g,' ').trim()}
function chatTime(value){
  const date=new Date(Number(value));if(!Number.isFinite(date.getTime()))return '';
  const today=new Date(),same=date.toDateString()===today.toDateString();
  return same?date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):date.toLocaleDateString([],{day:'numeric',month:'short'});
}
function renderChats(){
  const query=$('msgSearch').value.trim().toLowerCase(),hidden=chats.filter(c=>c.revoked_at).length;
  const list=chats.filter(c=>(showDisconnected||!c.revoked_at)&&c.name.toLowerCase().includes(query));
  const toggle=$('msgDisconnectedToggle');toggle.textContent=showDisconnected?'Hide disconnected':`Show disconnected${hidden?` (${hidden})`:''}`;toggle.setAttribute('aria-pressed',String(showDisconnected));toggle.disabled=!hidden;
  const signature=JSON.stringify([query,list,selected?.id,favourite,showDisconnected,drafts]);if($('msgChats').dataset.signature!==signature){
    $('msgChats').dataset.signature=signature;
    $('msgChats').innerHTML=list.length?list.map(c=>{const draft=drafts[c.id],preview=c.revoked_at?'Disconnected · history saved':draft?`Draft: ${draft}`:c.last_body?(c.last_sender===session.device.id?'You: ':'')+messagePreview(c.last_body):'Start a conversation';return `<button class="msg-chat ${selected?.id===c.id?'selected':''} ${c.revoked_at?'disconnected':''}" data-msg-peer="${c.id}" aria-pressed="${selected?.id===c.id}"><span class="msg-avatar" aria-hidden="true">${esc(c.name.slice(0,1).toUpperCase())}</span><span class="msg-chat-info"><span class="msg-chat-top"><strong class="msg-chat-name">${c.id===favourite?'☆ ':''}${esc(c.name)}</strong><span class="msg-chat-side">${c.last_at?`<time class="msg-chat-time">${esc(chatTime(c.last_at))}</time>`:''}${c.unread?`<span class="msg-unread" aria-label="${c.unread} unread">${c.unread>99?'99+':c.unread}</span>`:''}</span></span><span class="msg-chat-preview">${esc(preview.slice(0,90))}</span></span></button>`}).join(''):`<div class="msg-no-chats">${query?'No matching devices.':hidden&&!showDisconnected?'Only your active devices are shown. Use Show disconnected to view saved history.':'Your other paired devices will appear here. Use the button below to connect one.'}</div>`;
  }
  const quick=quickPeer();if($('msgQuickHome'))$('msgQuickHome').textContent=quick?'☷ Message '+quick.name:'☷ Message My PC';
  if(selected){const current=chats.find(c=>c.id===selected.id);if(current)selected={...selected,...current};renderHeader();}
}
function renderHeader(){
  if(!selected)return;
  $('msgPeerName').textContent=selected.name;$('msgPeerDetail').textContent=selected.revoked_at?'Disconnected · conversation history saved':'Messages and links';
  $('msgText').disabled=!!selected.revoked_at;$('msgSend').disabled=!!selected.revoked_at;
  $('msgFavourite').textContent=favourite===selected.id?'★ Quick chat':'☆ Quick chat';$('msgFavourite').setAttribute('aria-pressed',String(favourite===selected.id));$('msgFavourite').disabled=!!selected.revoked_at;
}
async function contacts(){
  const result=await api('/chats');chats=result.chats;contactTime=Date.now();renderChats();
}
function linkedText(text){
  // Build links from text nodes only; never interpret message content as HTML.
  const fragment=document.createDocumentFragment();let position=0;
  for(const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)){
    fragment.append(document.createTextNode(text.slice(position,match.index)));
    let href=match[0],suffix='';while(text!==match[0]&&/[.,!?;)\]}]$/.test(href)){suffix=href.slice(-1)+suffix;href=href.slice(0,-1);}
    try{const url=new URL(href);if(!/^https?:$/.test(url.protocol))throw 0;const a=document.createElement('a');a.href=url.href;a.textContent=href;a.target='_blank';a.rel='noopener noreferrer';fragment.append(a,document.createTextNode(suffix));}catch{fragment.append(document.createTextNode(match[0]));}
    position=match.index+match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(position)));return fragment;
}
function renderMessages(forceBottom=false){
  if(!selected||!session)return;
  const el=$('msgHistory'),atBottom=nearBottom(),top=el.scrollTop;
  const acknowledged=new Set(messages.filter(m=>m.sender_id===session.device.id).map(m=>m.client_id));
  // A dropped HTTP response can still have saved the message. Polling reconciles it.
  const remaining=pending.filter(p=>!acknowledged.has(p.client_id));
  if(remaining.length!==pending.length){pending=remaining;save(personalKey('pending'),pending);}
  const queue=pending.filter(p=>p.recipient_id===selected.id&&!acknowledged.has(p.client_id));
  const content=[...messages,...queue];$('msgBubbles').replaceChildren();
  let previousDay='';
  for(const m of content){
    const messageDate=new Date(m.created_at),dayKey=Number.isFinite(messageDate.getTime())?messageDate.toDateString():'';
    if(dayKey&&dayKey!==previousDay){const separator=document.createElement('div'),today=new Date(),yesterday=new Date(Date.now()-86400000);separator.className='msg-date-separator';separator.textContent=dayKey===today.toDateString()?'Today':dayKey===yesterday.toDateString()?'Yesterday':messageDate.toLocaleDateString([],{weekday:'short',day:'numeric',month:'long'});$('msgBubbles').append(separator);previousDay=dayKey;}
    const row=document.createElement('article');row.className='msg-bubble-row'+(m.sender_id===session.device.id?' own':'');
    const bubble=document.createElement('div');bubble.className='msg-bubble';
    const parts=messageParts(m.body),body=document.createElement('div');body.className='msg-body';
    if(parts.quote){const quote=document.createElement('div');quote.className='msg-quote';quote.textContent=`${parts.replyName}: ${parts.quote}`;body.append(quote)}
    body.append(linkedText(parts.body));
    const actions=document.createElement('div');actions.className='msg-message-actions';
    const time=document.createElement('time');time.dateTime=new Date(m.created_at).toISOString();time.textContent=new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});actions.append(time);
    if(m.sender_id===session.device.id){const delivery=document.createElement('span');delivery.textContent=m.id?'Delivered ✓':sending.has(m.client_id)?'Sending…':'Not sent';actions.append(delivery)}
    const reply=document.createElement('button');reply.type='button';reply.textContent='↩ Reply';reply.onclick=()=>beginReply(m);actions.append(reply);
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy';copy.onclick=()=>notice(navigator.clipboard.writeText(parts.body).then(()=>status('Copied.')));actions.append(copy);
    if(!m.id){const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.disabled=sending.has(m.client_id);retry.onclick=()=>notice(deliver(m));actions.append(retry);}
    bubble.append(body,actions);
    if(m.error&&!sending.has(m.client_id)){const error=document.createElement('div');error.className='msg-message-error';error.textContent=m.error;bubble.append(error);}
    row.append(bubble);let touchX=0,touchY=0;row.addEventListener('touchstart',event=>{const touch=event.touches[0];touchX=touch.clientX;touchY=touch.clientY},{passive:true});row.addEventListener('touchend',event=>{const touch=event.changedTouches[0];if(touch.clientX-touchX>62&&Math.abs(touch.clientY-touchY)<45)beginReply(m)},{passive:true});$('msgBubbles').append(row);
  }
  $('msgEmpty').hidden=!!content.length;$('msgOlder').hidden=!older;
  if(forceBottom||atBottom)bottom();else{el.scrollTop=top;$('msgNew').hidden=!content.length;}
}
function merge(next){const all=new Map(messages.map(m=>[m.id,m]));for(const m of next)all.set(m.id,m);messages=[...all.values()].sort((a,b)=>a.id-b.id);}
function rememberDraft(){if(!session||!selected)return;const value=$('msgText').value;if(value)drafts[selected.id]=value;else delete drafts[selected.id];save(personalKey('drafts'),drafts);}
async function choose(id){
  if(!session)return;rememberDraft();clearReply();const seq=++sequence;selected=chats.find(c=>c.id===id)||{id,name:'Device'};messages=[];older=false;readThrough=0;
  $('msgChoose').hidden=true;$('msgThread').hidden=false;$('msgShell').classList.add('chat-open');$('msgText').value=drafts[id]||'';resizeInput();updateCharacterCount();renderHeader();renderChats();renderMessages(true);status('Loading conversation…');
  history.replaceState(null,'',location.pathname+location.search+'#messages/'+id);
  try{const result=await api('/chats/'+id);if(seq!==sequence)return;selected=result.peer;messages=result.messages;older=result.hasMore;renderHeader();renderMessages(true);status('');if(matchMedia('(pointer:fine)').matches)$('msgText').focus();}catch(e){if(seq===sequence)throw e;}
}
async function markRead(){
  if(!session||!selected||!active()||!document.hasFocus()||!nearBottom()||!$('msgShell').classList.contains('chat-open'))return;
  const last=messages.filter(m=>m.recipient_id===session.device.id).at(-1)?.id||0;if(last<=readThrough)return;
  const seq=sequence,id=selected.id;await api('/chats/'+id+'/read',{through:last});
  if(seq===sequence){readThrough=last;const chat=chats.find(c=>c.id===id);if(chat&&chat.last_id<=last)chat.unread=0;renderChats();}
}
async function refresh(){
  if(!session||!active()||refreshTask)return refreshTask;
  refreshTask=(async()=>{
    if(Date.now()-contactTime>8000)await contacts();
    if(!selected||!$('msgShell').classList.contains('chat-open'))return;
    const seq=sequence,id=selected.id;let more=true,changed=false;
    // Drain cursor pages without skipping messages received during a busy conversation.
    for(let pages=0;more&&pages<5;pages++){
      const after=messages.at(-1)?.id||0,result=await api('/chats/'+id+(after?'?after='+after:''));if(seq!==sequence)return;
      selected=result.peer;renderHeader();if(!after)older=result.hasMore;
      if(result.messages.length){merge(result.messages);changed=true;}
      more=!!after&&result.hasMore;
    }
    if(changed)renderMessages();await markRead();status('');
  })().finally(()=>{refreshTask=null;});return refreshTask;
}
async function olderMessages(){
  if(!selected||!messages.length)return;const seq=sequence,el=$('msgHistory'),height=el.scrollHeight,top=el.scrollTop;
  $('msgOlder').disabled=true;
  try{const result=await api('/chats/'+selected.id+'?before='+messages[0].id);if(seq!==sequence)return;merge(result.messages);older=result.hasMore;renderMessages();el.scrollTop=top+(el.scrollHeight-height);$('msgNew').hidden=true;}finally{$('msgOlder').disabled=false;}
}
async function deliver(item){
  if(!session||sending.has(item.client_id))return;const owner=session.device.id;sending.add(item.client_id);renderMessages();
  try{
    const result=await api('/chats/'+item.recipient_id,{body:item.body,clientId:item.client_id});
    if(session?.device.id!==owner)return;
    pending=pending.filter(p=>p.client_id!==item.client_id);save(personalKey('pending'),pending);
    if(selected?.id===item.recipient_id){merge([result.message]);renderMessages(true);}await contacts();status('');
  }catch(e){if(session?.device.id===owner){item.error=e.message;save(personalKey('pending'),pending);renderMessages();}throw e;}
  finally{sending.delete(item.client_id);if(session?.device.id===owner&&selected?.id===item.recipient_id)renderMessages();}
}
function send(){
  const text=$('msgText').value.trim();if(!session||!selected||selected.revoked_at||!text)return;
  const body=(replyingTo?`↪ Reply to ${replyingTo.name}: ${replyingTo.text}\n\n${text}`:text).slice(0,20000);
  const item={client_id:crypto.randomUUID(),sender_id:session.device.id,recipient_id:selected.id,body,created_at:Date.now()};
  pending.push(item);save(personalKey('pending'),pending);$('msgText').value='';clearReply();rememberDraft();resizeInput();updateCharacterCount();renderMessages(true);$('msgText').focus();notice(deliver(item));
}
function resizeInput(){const el=$('msgText');el.style.height='auto';el.style.height=Math.min(160,Math.max(64,el.scrollHeight))+'px';}
function updateCharacterCount(){$('msgCharCount').textContent=`${$('msgText').value.length.toLocaleString()} / 20,000`;}
function beginReply(message){
  const parts=messageParts(message.body),name=message.sender_id===session.device.id?'You':selected?.name||'Device';
  replyingTo={name:name.replace(/[:\n]/g,' ').slice(0,60),text:parts.body.replace(/\s+/g,' ').trim().slice(0,140)||'Message'};
  $('msgReplyText').textContent=`${replyingTo.name}: ${replyingTo.text}`;$('msgReplyPreview').hidden=false;$('msgText').focus();window.nativeHaptic?.('light');
}
function clearReply(){replyingTo=null;if($('msgReplyPreview'))$('msgReplyPreview').hidden=true;if($('msgReplyText'))$('msgReplyText').textContent='';}
function pairing(){connection();pairStatus('');$('msgPairDialog').showModal();$('msgPairInput').focus();}
async function generate(){
  $('msgGenerate').disabled=true;try{const result=await api('/pair',{});codeExpiry=result.expiresAt;$('msgCode').textContent=result.code;$('msgCodeArea').hidden=false;updateCode();pairStatus('Enter this code on your other device.');}finally{$('msgGenerate').disabled=false;}
}
function updateCode(){if(!codeExpiry)return;const seconds=Math.max(0,Math.ceil((codeExpiry-Date.now())/1000));$('msgCodeExpiry').textContent=seconds?`One use · expires in ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Code expired. Generate a new one.';$('msgCopyCode').disabled=!seconds;}
async function claim(){
  $('msgClaim').disabled=true;pairStatus('Connecting…');
  try{
    const result=await api('/claim',{name:$('msgDeviceName').value,code:$('msgPairInput').value});
    if(result.token){localStorage.setItem(KEY,JSON.stringify({token:result.token,device:result.device}));window.dispatchEvent(new Event('cc-transfer-session'));}
    $('msgPairInput').value='';$('msgPairDialog').close();await contacts();await choose(result.peerId);status('Connected. You can message this device any time.');
  }finally{$('msgClaim').disabled=false;}
}
async function notifications(){
  const native=window.CommandCentreNative?.nativeNotifications&&window.webkit?.messageHandlers?.nativeNotifications;
  if(native){
    native.postMessage({action:'registerInboxAlerts',token:session?.token||''});
    localStorage.setItem('cc_native_inbox_alerts','1');
    $('msgNotifications').textContent='Native alerts requested';
    status('Allow iPhone notifications when prompted. Messages refresh instantly while open and during iOS background checks when closed.');
    return;
  }
  if(!('Notification'in window)||!('PushManager'in window)||!navigator.serviceWorker)throw new Error('On iPhone, add the site to your Home Screen from Safari and enable alerts there. The native wrapper does not support Web Push.');
  const config=await api('/status',undefined,'/api/transfers');if(!config.pushConfigured)throw new Error('Add the existing VAPID push secrets in Cloudflare to enable alerts. Messages still refresh while open.');
  if(await Notification.requestPermission()!=='granted')throw new Error('Allow notifications in browser settings to receive alerts.');
  const reg=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub){const response=await fetch('/api/push/public-key');const {publicKey}=await response.json();const raw=atob(publicKey.replaceAll('-','+').replaceAll('_','/'));sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))});}
  await api('/push',{subscription:sub.toJSON()},'/api/transfers');$('msgNotifications').textContent='Alerts enabled';status('Message alerts enabled on this device.');
}
async function open(){
  connection();if(!session)return;await contacts();
  const route=location.hash.match(/^#messages\/([a-f0-9-]{36})$/i)?.[1];
  if(route&&selected?.id!==route)await choose(route);else if(selected)await refresh();
}
window.CCMessages={openQuick:()=>notice((async()=>{window.switchPage?.('messages');if(!session){pairing();return;}await contacts();const peer=quickPeer();if(peer)await choose(peer.id);else pairing();})())};
function bind(){
  if(!$('messagesPage'))return;personal();connection();
  if(window.CommandCentreNative?.nativeNotifications&&localStorage.getItem('cc_native_inbox_alerts')==='1')$('msgNotifications').textContent='Native alerts enabled';
  $('msgDeviceName').value=/iPhone|iPad|iPod/.test(navigator.userAgent)?'My iPhone':'My laptop';
  $('msgConnect').onclick=pairing;$('msgWelcomeConnect').onclick=pairing;$('msgPairClose').onclick=()=>$('msgPairDialog').close();
  $('msgGenerate').onclick=()=>pairNotice(generate());$('msgClaimForm').onsubmit=e=>{e.preventDefault();pairNotice(claim());};
  $('msgPairInput').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,9).match(/.{1,3}/g)?.join(' ')||'';};
  $('msgCopyCode').onclick=()=>pairNotice(navigator.clipboard.writeText($('msgCode').textContent).then(()=>pairStatus('Code copied.')));
  $('msgCancelCode').onclick=()=>pairNotice(api('/pair/cancel',{}).then(()=>{codeExpiry=0;$('msgCodeArea').hidden=true;pairStatus('Code cancelled.');}));
  $('msgNotifications').onclick=()=>notice(notifications());$('msgSearch').oninput=renderChats;
  $('msgDisconnectedToggle').onclick=()=>{showDisconnected=!showDisconnected;save(personalKey('showDisconnected'),showDisconnected);renderChats();};
  $('msgChats').onclick=e=>{const peer=e.target.closest('[data-msg-peer]');if(peer)notice(choose(peer.dataset.msgPeer));};
  $('msgBack').onclick=()=>{rememberDraft();$('msgShell').classList.remove('chat-open');history.replaceState(null,'',location.pathname+location.search+'#messages');};
  $('msgFavourite').onclick=()=>{favourite=favourite===selected?.id?null:selected?.id;save(personalKey('favourite'),favourite);renderChats();};
  $('msgCompose').onsubmit=e=>{e.preventDefault();send();};$('msgReplyCancel').onclick=clearReply;$('msgText').oninput=()=>{rememberDraft();resizeInput();updateCharacterCount();};
  $('msgText').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches){e.preventDefault();send();}};
  $('msgOlder').onclick=()=>notice(olderMessages());$('msgNew').onclick=bottom;
  let scrollTimer;$('msgHistory').onscroll=()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(nearBottom()){$('msgNew').hidden=true;notice(markRead());}},150);};
  document.querySelectorAll('[data-msg-transfers]').forEach(b=>b.onclick=()=>window.switchPage?.('transfers'));
  window.addEventListener('cc-transfer-session',syncSession);window.addEventListener('cc-transfer-devices-changed',()=>{if(session)notice(contacts());});
  window.addEventListener('storage',e=>{if(e.key===KEY)syncSession();else if(e.key===DEVICE_SYNC_KEY&&session&&!document.hidden)notice(contacts());});
  window.addEventListener('cc-native-notification-status',e=>{if(e.detail?.permission==='granted'){$('msgNotifications').textContent='Native alerts enabled';localStorage.setItem('cc_native_inbox_alerts','1');}else if(e.detail?.permission==='denied'){localStorage.removeItem('cc_native_inbox_alerts');$('msgNotifications').textContent='Enable alerts';}});
  window.addEventListener('cc-pagechange',e=>{if(e.detail==='messages')notice(open());});
  document.addEventListener('visibilitychange',()=>{if(active())notice(refresh());});window.addEventListener('focus',()=>notice(refresh()));window.addEventListener('online',()=>notice(refresh()));
  function viewport(){if(window.visualViewport){$('messagesPage').style.setProperty('--msg-vh',window.visualViewport.height+'px');$('messagesPage').classList.toggle('msg-keyboard',matchMedia('(max-width:700px)').matches&&window.visualViewport.height<window.innerHeight*0.75);}}
  window.visualViewport?.addEventListener('resize',viewport);viewport();updateCharacterCount();
  setInterval(()=>{updateCode();if(active())notice(refresh());},2000);
  if(session)notice(contacts());if(active())notice(open());
}
bind();
