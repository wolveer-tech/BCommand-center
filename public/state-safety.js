/* Local data recovery. The current record and history commit in one IDB transaction. */
(function (root) {
  'use strict';
  const KEY='commandCenterV3', MIRROR=KEY+'.lastGood', DB='command-centre-safety-v1', STORE='snapshots';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function valid(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value)&&
      ['notes','events','reminders'].every(key=>Array.isArray(value[key])&&value[key].every(row=>row&&typeof row==='object'))&&
      (!value.bibleRead||(typeof value.bibleRead==='object'&&!Array.isArray(value.bibleRead)));
  }
  function counts(value){return {notes:value?.notes?.length||0,events:value?.events?.length||0,reminders:value?.reminders?.length||0,bible:Object.values(value?.bibleRead||{}).filter(Boolean).length}}
  const total=value=>Object.values(counts(value)).reduce((a,b)=>a+b,0);
  const signature=value=>JSON.stringify([value.notes,value.events,value.reminders,value.bibleRead,value.bibleRecommendations,value.noteFolders]);
  function create({storage=root.localStorage,indexedDB=root.indexedDB,dbName=DB,nativeRows=root.CommandCentreNativeRecovery||[],onError=()=>{}}={}){
    let dbPromise,ready=false,locked=false,current=null,queue=Promise.resolve(),lastError='';
    function report(error){lastError=error.message||String(error);onError(lastError)}
    function parse(raw){try{const value=JSON.parse(raw);return valid(value)?value:null}catch{return null}}
    function read(key){try{return parse(storage.getItem(key))}catch{return null}}
    const native=Array.isArray(nativeRows)?nativeRows.filter(row=>valid(row.state)):[];
    function initial(){return read(KEY)||read(MIRROR)||native[0]?.state||null}
    function open(){
      if(!indexedDB)return Promise.reject(new Error('Recovery storage is unavailable. Existing backups have been preserved.'));
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
        const request=indexedDB.open(dbName,1);
        request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'})};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();dbPromise=null};resolve(db)};
        request.onerror=()=>{dbPromise=null;reject(request.error)};
        request.onblocked=()=>{dbPromise=null;reject(new Error('Close other Command Centre tabs to unlock recovery storage.'))};
      });
      return dbPromise;
    }
    async function rows(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();tx.oncomplete=()=>resolve(req.result||[]);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not read recovery data.'))})}
    async function refreshNative(action='stateHistory'){
      if(root.CommandCentreNative?.stateVault){
        await new Promise(resolve=>{
          const finish=event=>{clearTimeout(timer);root.removeEventListener('cc-native-state-history',finish);if(Array.isArray(event?.detail)){native.splice(0,native.length,...event.detail.filter(row=>valid(row.state)))}resolve()};
          const timer=setTimeout(finish,3000);root.addEventListener('cc-native-state-history',finish,{once:true});
          root.webkit?.messageHandlers?.nativeData?.postMessage({action});
        });
      }
    }
    async function list(){
      await refreshNative();
      let browser=[];try{browser=await rows()}catch(error){if(!native.length)throw error}
      const all=[...browser,...native];
      return [...new Map(all.filter(row=>row.id!=='current'&&valid(row.state)).map(row=>[row.id,row])).values()].sort((a,b)=>b.savedAt-a.savedAt);
    }
    function local(value){
      const raw=JSON.stringify(value);
      // A full localStorage must never prevent the independent IDB/native write.
      for(const key of [MIRROR,KEY]){try{storage.setItem(key,raw)}catch(error){report(error)}}
    }
    function nativeSave(value,reason){
      try{root.webkit?.messageHandlers?.nativeData?.postMessage({action:'saveState',state:value,reason})}catch(error){report(error)}
    }
    function enqueue(value,reason='automatic'){
      const captured=copy(value);
      const task=queue.catch(()=>{}).then(async()=>{
        const db=await open();
        return new Promise((resolve,reject)=>{
          const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),get=store.getAll();
          get.onsuccess=()=>{
            const history=get.result.filter(row=>row.id!=='current'&&valid(row.state)).sort((a,b)=>b.savedAt-a.savedAt);
            const previous=get.result.find(row=>row.id==='current');
            const now=Date.now();
            // First capture the previous populated state, including a legacy startup state.
            const baseline=previous?.state;
            if(!history.length&&valid(baseline)&&total(baseline)>0){const row={id:'snapshot-'+crypto.randomUUID(),savedAt:previous.savedAt||now-1,reason:'protected baseline',state:baseline};store.put(row);history.unshift(row)}
            const latest=history[0];
            const changed=!latest||signature(latest.state)!==signature(captured);
            const due=!latest||now-latest.savedAt>=30*60*1000;
            if(reason!=='automatic'||(changed&&due)){
              const row={id:'snapshot-'+crypto.randomUUID(),savedAt:now,reason,state:captured};
              store.put(row);history.unshift(row);
            }
            // Separate quotas: frequent manual/restore operations cannot evict automatic history.
            for(const automatic of [true,false])history.filter(row=>(row.reason==='automatic'||row.reason==='protected baseline')===automatic).slice(automatic?20:10).forEach(row=>store.delete(row.id));
            store.put({id:'current',savedAt:captured._ccSavedAt||now,reason:'current',state:captured});
          };
          tx.oncomplete=()=>resolve(captured);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Could not save recovery data.'));
        });
      });
      queue=task;task.catch(report);return task;
    }
    async function initialize(){
      await refreshNative('stateRecovery');
      const primary=read(KEY),mirror=read(MIRROR);let stored=[];
      try{stored=await rows()}catch(error){report(error);if(!primary&&!mirror&&!native.length){locked=true;ready=true;return null}}
      const candidates=[primary,mirror,...stored.filter(row=>row.id==='current').map(row=>row.state),...native.map(row=>row.state)].filter(valid);
      candidates.sort((a,b)=>(b._ccSavedAt||0)-(a._ccSavedAt||0));
      let recovered=candidates[0]||null;
      const history=[...stored,...native].filter(row=>valid(row.state)).sort((a,b)=>b.savedAt-a.savedAt);
      if(!recovered||(!total(recovered)&&!recovered._ccAllowEmpty))recovered=candidates.find(value=>total(value)>0)||history.find(row=>total(row.state)>0)?.state||recovered;
      current=recovered?copy(recovered):null;ready=true;
      if(current){local(current);nativeSave(current,'recovery');await enqueue(current,'automatic').catch(()=>{})}
      return recovered;
    }
    function save(value,{reason='automatic',allowEmpty=false}={}){
      if(!ready||locked)return false;
      if(!valid(value)){report(new Error('Invalid local data was blocked. Your saved data has been preserved.'));return false}
      if(total(current)>0&&!total(value)&&!allowEmpty){report(new Error('An empty overwrite was blocked. Open Settings → Local safety snapshots to recover your data.'));return false}
      const next=copy(value);next._ccSavedAt=Date.now();next._ccAllowEmpty=allowEmpty||(!total(next)&&current?._ccAllowEmpty===true);
      current=next;local(next);nativeSave(next,reason);enqueue(next,reason);return true;
    }
    async function snapshot(value,reason='manual'){
      if(!save(value,{reason}))throw new Error(lastError||'Recovery is still loading.');await queue;
    }
    async function restore(id){
      await queue.catch(()=>{});
      const selected=(await list()).find(row=>row.id===id);if(!selected)throw new Error('That snapshot is no longer available.');
      // Commit the undo copy before replacing any live storage or contacting native storage.
      if(current)await enqueue(current,'before restore');
      if(!save(selected.state,{reason:'restored',allowEmpty:true}))throw new Error(lastError||'Restore was blocked.');
      await queue;return copy(current);
    }
    return {initial,initialize,save,snapshot,restore,list,flush:()=>queue,get ready(){return ready&&!locked},get error(){return lastError}};
  }
  root.CommandCentreSafety={create,valid,counts,total};
})(globalThis);
