/* Failed players are disposable. Never persist or automatically reopen their URL. */
(() => {
  const active=new Map(),key='cc-active-stream-v1';
  let interrupted=false;try{interrupted=!!localStorage.getItem(key);localStorage.removeItem(key);}catch{}
  function stop(kind){
    const entry=active.get(kind);if(!entry)return;
    clearTimeout(entry.timeout);clearTimeout(entry.hint);entry.cleanup();active.delete(kind);
    try{if(!active.size)localStorage.removeItem(key);}catch{}
  }
  function watch(kind,element,url){
    stop(kind);if(!element||!url||url==='about:blank')return;
    try{localStorage.setItem(key,JSON.stringify({kind,startedAt:Date.now()}));}catch{}
    const entry={cleanup:()=>{},timeout:null,hint:null};active.set(kind,entry);
    const current=()=>active.get(kind)===entry;
    function fail(){
      if(!current())return;stop(kind);
      if(element.tagName==='VIDEO'){element.pause();element.removeAttribute('src');element.load();}
      else element.src='about:blank';
      window.dispatchEvent(new CustomEvent('cc-playerfailure',{detail:{kind,message:'This player did not load and has been stopped. Retry or choose another source.'}}));
    }
    function loaded(){if(current())clearTimeout(entry.timeout);}
    function waiting(){if(current()&&!element.paused){clearTimeout(entry.timeout);entry.timeout=setTimeout(fail,25000);}}
    const readyEvent=element.tagName==='VIDEO'?'playing':'load';
    element.addEventListener(readyEvent,loaded);element.addEventListener('error',fail);element.addEventListener('waiting',waiting);element.addEventListener('stalled',waiting);
    entry.cleanup=()=>{element.removeEventListener(readyEvent,loaded);element.removeEventListener('error',fail);element.removeEventListener('waiting',waiting);element.removeEventListener('stalled',waiting);};
    entry.timeout=setTimeout(fail,25000);
    // An iframe load only confirms a document, not video playback inside it.
    entry.hint=setTimeout(()=>{if(current())window.dispatchEvent(new CustomEvent('cc-playerslow',{detail:{kind}}));},12000);
  }
  function stopAll(){
    for(const kind of [...active.keys()]){stop(kind);window.dispatchEvent(new CustomEvent('cc-playerfailure',{detail:{kind,message:'The player was stopped to free memory. Choose Play when you are ready to retry.'}}));}
  }
  window.CommandCentrePlaybackSafety={watch,stop,stopAll,get interrupted(){return interrupted;}};
})();
