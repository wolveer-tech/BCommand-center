// Messages and Transfers share the same per-device credential.
const $=id=>document.getElementById(id),KEY='cc_transfer_device_v1';
const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{status('Browser storage is full. Keep this tab open to retain unsent messages.',true);}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=read(KEY),chats=[],selected=null,messages=[],older=false,sequence=0,refreshTask=null,contactTime=0,readThrough=0,codeExpiry=0;
let pending=[],drafts={},favourite=null;
const sending=new Set();
const personalKey=name=>'cc_messages_'+name+'_'+session?.device.id;
function personal(){pending=read(personalKey('pending'),[]);drafts=read(personalKey('drafts'),{});favourite=read(personalKey('favourite'));}
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
  $('msgText').value='';$('msgBubbles').replaceChildren();$('msgChats').replaceChildren();$('msgThread').hidden=true;$('msgChoose').hidden=false;$('msgShell').classList.remove('chat-open');
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
function renderChats(){
  const query=$('msgSearch').value.trim().toLowerCase(),list=chats.filter(c=>c.name.toLowerCase().includes(query));
  const signature=JSON.stringify([query,list,selected?.id,favourite]);if($('msgChats').dataset.signature!==signature){
    $('msgChats').dataset.signature=signature;
    $('msgChats').innerHTML=list.length?list.map(c=>`<button class="msg-chat ${selected?.id===c.id?'selected':''}" data-msg-peer="${c.id}" aria-pressed="${selected?.id===c.id}"><span class="msg-avatar" aria-hidden="true">${esc(c.name.slice(0,1).toUpperCase())}</span><span class="msg-chat-info"><span class="msg-chat-top"><strong class="msg-chat-name">${c.id===favourite?'☆ ':''}${esc(c.name)}</strong>${c.unread?`<span class="msg-unread" aria-label="${c.unread} unread">${c.unread>99?'99+':c.unread}</span>`:''}</span><span class="msg-chat-preview">${esc(c.revoked_at?'Disconnected · history saved':c.last_body?(c.last_sender===session.device.id?'You: ':'')+c.last_body.slice(0,90):'Start a conversation')}</span></span></button>`).join(''):`<div class="msg-no-chats">${query?'No matching devices.':'Your other paired devices will appear here. Use the button below to connect one.'}</div>`;
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
  for(const m of content){
    const row=document.createElement('article');row.className='msg-bubble-row'+(m.sender_id===session.device.id?' own':'');
    const bubble=document.createElement('div');bubble.className='msg-bubble';
    const body=document.createElement('div');body.className='msg-body';body.append(linkedText(m.body));
    const actions=document.createElement('div');actions.className='msg-message-actions';
    const time=document.createElement('time');time.dateTime=new Date(m.created_at).toISOString();time.textContent=new Date(m.created_at).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});actions.append(time);
    const delivery=document.createElement('span');delivery.textContent=m.id?'':sending.has(m.client_id)?'Sending…':'Not sent';actions.append(delivery);
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy';copy.onclick=()=>notice(navigator.clipboard.writeText(m.body).then(()=>status('Copied.')));actions.append(copy);
    if(!m.id){const retry=document.createElement('button');retry.type='button';retry.textContent='Retry';retry.disabled=sending.has(m.client_id);retry.onclick=()=>notice(deliver(m));actions.append(retry);}
    bubble.append(body,actions);
    if(m.error&&!sending.has(m.client_id)){const error=document.createElement('div');error.className='msg-message-error';error.textContent=m.error;bubble.append(error);}
    row.append(bubble);$('msgBubbles').append(row);
  }
  $('msgEmpty').hidden=!!content.length;$('msgOlder').hidden=!older;
  if(forceBottom||atBottom)bottom();else{el.scrollTop=top;$('msgNew').hidden=!content.length;}
}
function merge(next){const all=new Map(messages.map(m=>[m.id,m]));for(const m of next)all.set(m.id,m);messages=[...all.values()].sort((a,b)=>a.id-b.id);}
function rememberDraft(){if(!session||!selected)return;const value=$('msgText').value;if(value)drafts[selected.id]=value;else delete drafts[selected.id];save(personalKey('drafts'),drafts);}
async function choose(id){
  if(!session)return;rememberDraft();const seq=++sequence;selected=chats.find(c=>c.id===id)||{id,name:'Device'};messages=[];older=false;readThrough=0;
  $('msgChoose').hidden=true;$('msgThread').hidden=false;$('msgShell').classList.add('chat-open');$('msgText').value=drafts[id]||'';resizeInput();renderHeader();renderChats();renderMessages(true);status('Loading conversation…');
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
  const item={client_id:crypto.randomUUID(),sender_id:session.device.id,recipient_id:selected.id,body:text,created_at:Date.now()};
  pending.push(item);save(personalKey('pending'),pending);$('msgText').value='';rememberDraft();resizeInput();renderMessages(true);$('msgText').focus();notice(deliver(item));
}
function resizeInput(){const el=$('msgText');el.style.height='auto';el.style.height=Math.min(160,Math.max(64,el.scrollHeight))+'px';}
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
  $('msgDeviceName').value=/iPhone|iPad|iPod/.test(navigator.userAgent)?'My iPhone':'My laptop';
  $('msgConnect').onclick=pairing;$('msgWelcomeConnect').onclick=pairing;$('msgPairClose').onclick=()=>$('msgPairDialog').close();
  $('msgGenerate').onclick=()=>pairNotice(generate());$('msgClaimForm').onsubmit=e=>{e.preventDefault();pairNotice(claim());};
  $('msgPairInput').oninput=e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,9).match(/.{1,3}/g)?.join(' ')||'';};
  $('msgCopyCode').onclick=()=>pairNotice(navigator.clipboard.writeText($('msgCode').textContent).then(()=>pairStatus('Code copied.')));
  $('msgCancelCode').onclick=()=>pairNotice(api('/pair/cancel',{}).then(()=>{codeExpiry=0;$('msgCodeArea').hidden=true;pairStatus('Code cancelled.');}));
  $('msgNotifications').onclick=()=>notice(notifications());$('msgSearch').oninput=renderChats;
  $('msgChats').onclick=e=>{const peer=e.target.closest('[data-msg-peer]');if(peer)notice(choose(peer.dataset.msgPeer));};
  $('msgBack').onclick=()=>{rememberDraft();$('msgShell').classList.remove('chat-open');history.replaceState(null,'',location.pathname+location.search+'#messages');};
  $('msgFavourite').onclick=()=>{favourite=favourite===selected?.id?null:selected?.id;save(personalKey('favourite'),favourite);renderChats();};
  $('msgCompose').onsubmit=e=>{e.preventDefault();send();};$('msgText').oninput=()=>{rememberDraft();resizeInput();};
  $('msgText').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches){e.preventDefault();send();}};
  $('msgOlder').onclick=()=>notice(olderMessages());$('msgNew').onclick=bottom;
  let scrollTimer;$('msgHistory').onscroll=()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(nearBottom()){$('msgNew').hidden=true;notice(markRead());}},150);};
  document.querySelectorAll('[data-msg-transfers]').forEach(b=>b.onclick=()=>window.switchPage?.('transfers'));
  window.addEventListener('cc-transfer-session',syncSession);window.addEventListener('storage',e=>{if(e.key===KEY)syncSession();});
  window.addEventListener('cc-pagechange',e=>{if(e.detail==='messages')notice(open());});
  document.addEventListener('visibilitychange',()=>{if(active())notice(refresh());});window.addEventListener('focus',()=>notice(refresh()));window.addEventListener('online',()=>notice(refresh()));
  function viewport(){if(window.visualViewport){$('messagesPage').style.setProperty('--msg-vh',window.visualViewport.height+'px');$('messagesPage').classList.toggle('msg-keyboard',matchMedia('(max-width:700px)').matches&&window.visualViewport.height<window.innerHeight*0.75);}}
  window.visualViewport?.addEventListener('resize',viewport);viewport();
  setInterval(()=>{updateCode();if(active())notice(refresh());},2000);
  if(session)notice(contacts());if(active())notice(open());
}
bind();
