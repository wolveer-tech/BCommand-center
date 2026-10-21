/* The provider keeps its own origin; browsing and playback stay in this view. */
(() => {
 const SITE='https://streamcorner.st/',KIND='streamcorner';
 const dialog=document.getElementById('streamCornerView'),frame=document.getElementById('streamCornerFrame'),back=document.getElementById('streamCornerBack'),restart=document.getElementById('streamCornerRestart'),notice=document.getElementById('streamCornerNotice');
 if(!dialog||!frame||!back||!restart||!notice)return;
 let opener=null,loading=false;
 const message=value=>{notice.textContent=value;notice.hidden=!value;};
 function unload(){
  loading=false;window.CommandCentrePlaybackSafety?.stop(KIND);frame.src='about:blank';message('');
 }
 function start(){
  if(!dialog.open)return;
  unload();loading=true;message('Loading StreamCorner…');
  window.CommandCentrePlaybackSafety?.watch(KIND,frame,SITE);frame.src=SITE;
 }
 function close(){
  unload();if(dialog.open)dialog.close();document.documentElement.classList.remove('cc-streamcorner-open');
  const previous=opener;opener=null;if(previous?.isConnected)previous.focus();
 }
 function open(){
  if(window.CommandCentreNative?.nativeStreamCorner===true&&typeof window.webkit?.messageHandlers?.nativeStreamCorner?.postMessage==='function'){
   window.closeLiveFootball?.();window.stopVideoPlayback?.();
   // The iOS host verifies the fixed command came from the app's main frame.
   try{window.webkit.messageHandlers.nativeStreamCorner.postMessage('cc-open-streamcorner');return;}catch{}
  }
  if(window.CommandCentreDesktop?.streamCorner===true&&typeof window.chrome?.webview?.postMessage==='function'){
   window.closeLiveFootball?.();window.stopVideoPlayback?.();
   // The desktop host validates this fixed command and the sending app origin.
   // The provider gets its own native view, with no dashboard iframe ancestor.
   try{window.chrome.webview.postMessage('cc-open-streamcorner');return;}catch{}
  }
  if(dialog.open){back.focus();return;}
  opener=document.activeElement;
  window.closeLiveFootball?.();window.stopVideoPlayback?.();
  dialog.showModal();document.documentElement.classList.add('cc-streamcorner-open');back.focus();start();
 }
 back.addEventListener('click',close);restart.addEventListener('click',start);
 dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('close',()=>{unload();document.documentElement.classList.remove('cc-streamcorner-open');});
 frame.addEventListener('load',()=>{
  if(!dialog.open||!loading||frame.src==='about:blank')return;
  // This confirms the provider document only, never that its video is playing.
  loading=false;message('');
 });
 window.addEventListener('cc-playerfailure',event=>{
  if(event.detail?.kind!==KIND||!dialog.open)return;
  loading=false;message('StreamCorner could not load. Use Restart to try again, or go back to Command Centre.');
 });
 window.addEventListener('cc-playerslow',event=>{
  if(event.detail?.kind===KIND&&dialog.open&&loading)message('StreamCorner is still loading. You can restart it here or go back to Command Centre.');
 });
 window.addEventListener('cc-pagechange',event=>{if(event.detail!=='football'&&dialog.open)close();});
 window.addEventListener('pagehide',close);
 document.addEventListener('click',event=>{if(event.target.closest?.('[data-open-streamcorner]'))open();});
 window.CommandCentreStreamCorner={open,close,get active(){return dialog.open;}};
})();
