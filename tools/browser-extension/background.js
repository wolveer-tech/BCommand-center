export async function request(path,data){
  const c=await chrome.storage.local.get(['url','token','recipientId','ttl']);
  if(!c.url||!c.token)throw new Error('Open extension settings and pair this browser first.');
  const r=await fetch(c.url+'/api/transfers'+path,{method:data===undefined?'GET':'POST',headers:{Authorization:'Bearer '+c.token,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await r.json();if(!r.ok)throw new Error(result.error||'Transfer failed.');return result;
}
export async function send(kind,content,title){
  const c=await chrome.storage.local.get(['recipientId','ttl']);
  const result=await request('/items',{kind,content,title,recipientId:c.recipientId||'all',ttl:Number(c.ttl??86400)});
  await chrome.storage.local.set({lastResult:'Sent successfully.',lastAt:Date.now()});
  await chrome.action.setBadgeText({text:'✓'});await chrome.action.setBadgeBackgroundColor({color:'#286e57'});return result;
}
// These listeners are installed only in the extension service worker.
if(typeof document==='undefined'){
  chrome.runtime.onInstalled.addListener(()=>{
    chrome.contextMenus.removeAll(()=>{
      chrome.contextMenus.create({id:'cc-send-link',title:'Send to Command Centre',contexts:['page','link']});
      chrome.contextMenus.create({id:'cc-send-text',title:'Send selected text to Command Centre',contexts:['selection']});
    });
  });
  chrome.contextMenus.onClicked.addListener((info,tab)=>{
    const kind=info.menuItemId==='cc-send-text'?'message':'link',content=kind==='message'?info.selectionText:(info.linkUrl||info.pageUrl||tab.url);
    send(kind,content,info.linkUrl?'':tab.title).catch(async e=>{
      await chrome.storage.local.set({lastResult:e.message,lastAt:Date.now()});await chrome.action.setBadgeText({text:'!'});await chrome.action.setBadgeBackgroundColor({color:'#ad4157'});
    });
  });
}
