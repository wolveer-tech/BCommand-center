(() => {
  const $=id=>document.getElementById(id);
  let user=null,busy=false,timer,again=false,linked=false,syncState='idle',syncMessage='';
  const fingerprint=async note=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(note))))].map(n=>n.toString(16).padStart(2,'0')).join('');
  function status(text){if($('accountStatus'))$('accountStatus').textContent=text;}
  function mangaStatus(phase,message){syncState=phase;syncMessage=message;window.dispatchEvent(new Event('cc-accountsync'));}
  async function api(path,{method='GET',body}={}){
    const response=await fetch('/api/accounts'+path,{method,credentials:'same-origin',signal:AbortSignal.timeout(20000),headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    let data;try{data=await response.json();}catch{throw new Error('Accounts are unavailable. Check the Worker setup.');}
    if(!response.ok)throw Object.assign(new Error(data.error||'Sync failed.'),{status:response.status,conflict:data.conflict});return data;
  }
  let accountStore;
  function cache(id,value){
    accountStore||=CommandCentreSafety.database({name:'cc-account-local-v1',store:'accounts'});
    return accountStore.run(value?'readwrite':'readonly',store=>{const req=value?store.put(value,id):store.get(id);return ()=>req.result});
  }
  const metaKey=()=>`cc-note-sync-v1:${user.id}`;
  const linkedTo=id=>state.noteAccountOwner===id&&state.mangaAccountOwner===id;
  const localCopy=()=>({notes:state.notes,noteFolders:state.noteFolders,mangaLibrary:state.mangaLibrary,noteSyncMetadata:state.noteSyncMetadata});
  async function stash(id,value){await cache(id,{...(await cache(id)||{}),...value});}
  function metadata(){
    if(state.noteSyncMetadata?.accountId===user.id)return JSON.parse(JSON.stringify(state.noteSyncMetadata.entries||{}));
    try{const value=JSON.parse(localStorage.getItem(metaKey())||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}
  }
  async function checkpoint(activeUser,meta){
    if(user?.id!==activeUser||!linked)return;
    // Notes and their revision baselines must commit together, including when
    // localStorage is full or a later upload fails halfway through a sync.
    state.noteSyncMetadata={accountId:activeUser,entries:meta};
    if(!saveState())throw new Error('Could not save synced notes on this device.');
    await stateSafety.flush();
    try{localStorage.setItem(metaKey(),JSON.stringify(meta))}catch{}
  }
  function draw(){
    $('accountForm').hidden=!!user;$('accountSignedIn').hidden=!user;
    if(user){$('accountName').textContent=user.username;$('accountLinkBtn').hidden=linked;$('accountSyncBtn').hidden=!linked;$('accountLinkBtn').textContent=state.noteAccountOwner&&state.noteAccountOwner!==user.id?'Open this account’s data':'Enable sync on this device';}
    document.querySelectorAll('[data-account-label]').forEach(el=>el.textContent=user?user.username:'Account');
    window.dispatchEvent(new Event('cc-accountchange'));
  }
  async function session(){try{const data=await api('/me');user=data.account;linked=linkedTo(user.id);draw();status(linked?'Signed in · notes and manga sync automatically.':'Signed in. Enable sync to link notes and manga on this device.');if(linked)queue();else if(!state.mangaAccountOwner&&(!state.noteAccountOwner||state.noteAccountOwner===user.id))await link();}catch(error){if(error.status!==401)status(error.message);}}
  async function signIn(register){
    const button=$(register?'accountRegisterBtn':'accountLoginBtn');button.disabled=true;
    try{
      const data=await api(register?'/register':'/login',{method:'POST',body:{username:$('accountUsername').value,password:$('accountPassword').value,code:$('accountInvite').value}});
      user=data.account;linked=linkedTo(user.id);$('accountPassword').value='';$('accountInvite').value='';draw();status('Signed in. Syncing notes and manga…');if(linked)queue();else await link();
    }catch(error){status(error.message);}finally{button.disabled=false;}
  }
  async function link(){
    if(!user)return;
    if(document.getElementById('noteModal')?.classList.contains('open')){status('Close the note editor before linking an account.');return;}
    $('accountLinkBtn').disabled=true;
    const previous={...localCopy(),noteAccountOwner:state.noteAccountOwner,mangaAccountOwner:state.mangaAccountOwner};let committed=false;
    try{
      CommandCentreNotebooks.flush();await stateSafety.snapshot(state,'before linking account');
      const owner=state.noteAccountOwner,mangaOwner=state.mangaAccountOwner||owner,targetCopy=await cache(user.id);
      if(owner&&owner!==user.id){
        await stash(owner,{notes:state.notes,noteFolders:state.noteFolders,noteSyncMetadata:state.noteSyncMetadata});
        state.notes=targetCopy?.notes||[];state.noteFolders=targetCopy?.noteFolders||['Notes'];
        state.noteSyncMetadata=targetCopy?.noteSyncMetadata||null;
      }
      if(mangaOwner&&mangaOwner!==user.id){await stash(mangaOwner,{mangaLibrary:state.mangaLibrary});state.mangaLibrary=CommandCentreMangaLibrary.merge(targetCopy?.mangaLibrary);}
      state.noteAccountOwner=user.id;
      state.mangaAccountOwner=user.id;
      const saved=(owner&&owner!==user.id)||(mangaOwner&&mangaOwner!==user.id)?stateSafety.save(state,{reason:'account switch',allowEmpty:true}):saveState();
      if(!saved)throw new Error('Local recovery is still loading. Try again.');
      await stateSafety.flush();linked=true;committed=true;draw();renderNotes();window.CommandCentreMangaReader?.refresh();await sync();
    }catch(error){if(!committed){Object.assign(state,previous);linked=linkedTo(user.id);draw();stateSafety.save(state,{reason:'account link rollback',allowEmpty:true});}status(error.message);}finally{$('accountLinkBtn').disabled=false;}
  }
  function normalise(note){
    const clean={...note,body:sanitizeImportedNoteHtml(note.body)};
    if(note.kind==='schoolbook')Object.assign(clean,CommandCentreNotebooks.normalise(note));return clean;
  }
  const conflictTitle=title=>String(title||'Untitled note').replace(/(?: \(conflicting copy\))+$/,'');
  const isConflict=note=>/ \(conflicting copy\)$/.test(note.title||'');
  const editorOpen=id=>editingNoteId===id&&document.getElementById('noteModal')?.classList.contains('open');
  function content(note,duplicate=false){
    const book=note.kind==='schoolbook';
    return [duplicate?conflictTitle(note.title):String(note.title||'Untitled note').slice(0,300),String(note.folder||'Notes').slice(0,80),!!note.pinned,book?'schoolbook':'note',
      duplicate?'':!!note.deletedAt,!!note.purged,
      book?[String(note.subject||'').slice(0,100),note.coverColor||'#466454',note.paper==='grid'?'grid':'lined',(note.pages||[]).map(p=>[duplicate?'':p.id||'',p.title||'',p.body||''])]:note.body||''];
  }
  const noteHash=note=>fingerprint(content(normalise(note)));
  async function changed(note,entry){return !entry||entry.hash!==await (entry.format===2?noteHash(note):fingerprint(note))}
  async function preserveConflict(note,digest,activeUser){
    let id='note-conflict-'+await fingerprint([note.id,digest]);
    const existing=state.notes.find(n=>n.id===id);
    if(existing){
      if(existing.deletedAt||existing.purged||await fingerprint(content(existing,true))===await fingerprint(content(note,true)))return false;
      id=makeId('note');
    }
    if(user?.id!==activeUser||!linked||editorOpen(note.id)||note!==state.notes.find(n=>n.id===note.id))return false;
    state.notes.unshift({...note,id,title:conflictTitle(note.title)+' (conflicting copy)',updatedAt:nowIso(),purged:false});return true;
  }
  async function cleanConflicts(){
    if(busy){status('Wait for sync to finish before cleaning up copies.');return}
    if(document.getElementById('noteModal')?.classList.contains('open')){status('Close the note editor before cleaning up copies.');return}
    busy=true;const button=$('accountCleanCopiesBtn');if(button)button.disabled=true;
    try{
      const notes=state.notes,active=notes.filter(n=>!n.deletedAt&&!n.purged),keepers=new Map(),duplicates=new Set();let different=0;
      // Originals take priority. Compare every page and photo, retaining every
      // distinct version; only redundant conflict copies go to Recently Deleted.
      for(const note of [...active.filter(n=>!isConflict(n)),...active.filter(isConflict)]){
        const hash=await fingerprint(content(note,true)),conflict=isConflict(note);
        if(conflict&&keepers.has(hash))duplicates.add(note.id);else{keepers.set(hash,note.id);if(conflict)different++}
      }
      if(duplicates.size){
        await stateSafety.snapshot(state,'before cleaning identical conflict copies');
        if(state.notes!==notes)throw new Error('Notes changed during cleanup. Try again.');
        const now=nowIso();state.notes=notes.map(n=>duplicates.has(n.id)?{...n,deletedAt:now,updatedAt:now}:n);
        if(!saveState()){state.notes=notes;throw new Error('Could not save cleanup. All copies have been kept.')}
        await stateSafety.flush();renderNotes();again=true;
      }
      status(`${duplicates.size} identical ${duplicates.size===1?'copy moved':'copies moved'} to Recently Deleted. ${different} ${different===1?'copy with different content kept':'copies with different content kept'}.`);
    }catch(error){status(error.message)}finally{busy=false;if(button)button.disabled=false;if(again)queue()}
  }
  async function syncManga(activeUser){
    mangaStatus('syncing','Syncing reading history…');
    for(let attempt=0;attempt<3;attempt++){
      const remote=await api('/collections/manga');if(user?.id!==activeUser||!linked)return;
      const merged=CommandCentreMangaLibrary.merge(remote.library,state.mangaLibrary),digest=await fingerprint(merged);
      if(digest!==await fingerprint(CommandCentreMangaLibrary.merge(remote.library))){
        try{await api('/collections/manga',{method:'PUT',body:{revision:remote.revision,library:merged}});}
        catch(error){if(error.conflict&&attempt<2)continue;throw error;}
      }
      if(user?.id!==activeUser||!linked)return;
      state.mangaLibrary=CommandCentreMangaLibrary.merge(merged,state.mangaLibrary);
      if(await fingerprint(state.mangaLibrary)!==digest)again=true;
      if(!saveState())throw new Error('Could not save manga history on this device.');
      mangaStatus('synced',`History synced at ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`);
      window.CommandCentreMangaReader?.refresh();return;
    }
  }
  async function sync(){
    if(!user||!linked||!stateSafety.ready)return;
    if(busy){again=true;return;}busy=true;again=false;clearTimeout(timer);$('accountSyncBtn').disabled=true;status('Syncing notes, schoolbooks and manga…');
    const activeUser=user.id;
    try{
      // Manga is its own collection: a note conflict or failed upload must not block it.
      await syncManga(activeUser);
      if(user?.id!==activeUser||!linked)return;
      const meta=metadata(),manifest=(await api('/notes')).notes,remote=new Map(manifest.map(n=>[n.id,n]));
      const ids=[...new Set([...state.notes.map(n=>n.id),...remote.keys()])];let conflicts=0;
      for(const id of ids){
        if(user?.id!==activeUser||!linked)return;
        // Keep a remote edit pending until an open editor has committed its draft.
        if(editorOpen(id))continue;
        let local=state.notes.find(n=>n.id===id),entry=meta[id],other=remote.get(id);
        const dirty=local&&await changed(local,entry),remoteChanged=other&&(!entry||entry.revision!==other.revision);
        if(remoteChanged){
          const downloaded=await api('/notes/'+encodeURIComponent(id)),incoming=normalise(downloaded.note);
          // Re-read after the request: a schoolbook autosave may have happened meanwhile.
          local=state.notes.find(n=>n.id===id);
          const digest=local?await noteHash(local):'',incomingHash=await noteHash(incoming),localChanged=local&&await changed(local,entry);
          if(editorOpen(id)||local!==state.notes.find(n=>n.id===id)){again=true;continue}
          if(localChanged&&digest!==incomingHash&&!local.purged){
            if(await preserveConflict(local,digest,activeUser)){conflicts++;again=true}
          }
          if(editorOpen(id)||local!==state.notes.find(n=>n.id===id)){again=true;continue}
          state.notes=local?state.notes.map(n=>n.id===id?incoming:n):[incoming,...state.notes];
          meta[id]={revision:downloaded.revision,hash:incomingHash,format:2};
          await checkpoint(activeUser,meta);
        }else if(dirty){
          // Hashing yields to the editor too. Never upload a stale record.
          if(editorOpen(id)||local!==state.notes.find(n=>n.id===id)){again=true;continue}
          const captured=JSON.parse(JSON.stringify(local));
          try{
            const uploaded=await api('/notes/'+encodeURIComponent(id),{method:'PUT',body:{revision:entry?.revision||0,note:captured}});
            meta[id]={revision:uploaded.revision,hash:await noteHash(captured),format:2};
            await checkpoint(activeUser,meta);
          }catch(error){if(error.conflict){again=true;continue;}throw error;}
        }
      }
      state.noteFolders=[...new Set([...state.noteFolders,...state.notes.map(n=>n.folder||'Notes')])];
      await checkpoint(activeUser,meta);
      await cache(activeUser,localCopy());
      renderNotes();
      status(`Synced at ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}${conflicts?' · conflicting edits kept as separate copies.':'.'}`);
    }catch(error){if(syncState==='syncing')mangaStatus('error','History sync failed. Tap Sync now to retry.');if(error.status===401){linked=false;user=null;draw();}const message=['InvalidStateError','UnknownError','AbortError'].includes(error.name)?'Device storage was interrupted. Reopen the app and tap Sync now.':error.message;status(message+' Your local data is kept.');}
    finally{busy=false;$('accountSyncBtn').disabled=false;if(again&&user&&linked)timer=setTimeout(sync,1500);}
  }
  function queue(){if(user&&linked){if(busy)again=true;else{clearTimeout(timer);timer=setTimeout(sync,1200);}}}
  function bind(){
    if($('accountForm'))return;
    const card=document.createElement('section');card.className='card';card.style.marginBottom='12px';
    card.innerHTML=`<div class="card-head"><div><div class="title">Sign in &amp; sync</div><div class="sub">One account for notes, schoolbooks and your manga library.</div></div></div><form id="accountForm"><div class="form"><div class="field"><label for="accountUsername">Username</label><input id="accountUsername" autocomplete="username" minlength="3" maxlength="40" placeholder="Your username" required></div><div class="field"><label for="accountPassword">Password</label><input id="accountPassword" type="password" autocomplete="current-password" minlength="12" maxlength="128" placeholder="At least 12 characters" required></div><div class="field"><label for="accountInvite">Invitation code · new accounts only</label><input id="accountInvite" type="password" autocomplete="off" placeholder="Code from the app owner"></div></div><div class="toolbar" style="margin:10px 0"><button type="submit" class="btn primary" id="accountLoginBtn">Sign in</button><button type="button" class="btn" id="accountRegisterBtn">Create invited account</button></div></form><div id="accountSignedIn" hidden><strong id="accountName"></strong><div class="toolbar" style="margin:10px 0"><button type="button" class="btn primary" id="accountLinkBtn">Enable sync on this device</button><button type="button" class="btn" id="accountSyncBtn">Sync now</button><button type="button" class="btn" id="accountLogoutBtn">Sign out</button><button type="button" class="btn" id="accountCleanCopiesBtn">Clean up identical copies</button></div><div class="setting-note">Cleanup moves identical conflicting copies to Recently Deleted after saving a recovery snapshot. Different writing, pages and photos are kept.</div><div class="setting-note">Enabling sync merges this device’s notes and manga into your account. Use the same account on your phone. Switching accounts keeps separate local copies.</div></div><div class="setting-note" id="accountStatus" role="status">Sign in with the same account on PC and phone. Your data also works offline.</div>`;
    $('accountContent').append(card);
    $('accountForm').addEventListener('submit',e=>{e.preventDefault();signIn(false);});$('accountRegisterBtn').addEventListener('click',()=>signIn(true));$('accountLinkBtn').addEventListener('click',link);$('accountSyncBtn').addEventListener('click',sync);$('accountCleanCopiesBtn').addEventListener('click',cleanConflicts);
    $('accountLogoutBtn').addEventListener('click',async()=>{if(busy){status('Wait for sync to finish before signing out.');return;}try{await api('/logout',{method:'POST'});clearTimeout(timer);user=null;linked=false;draw();status('Signed out. Your local data remains on this device.');}catch(error){status(error.message);}});
    addEventListener('online',queue);addEventListener('cc-pagechange',event=>{if(event.detail==='manga')queue();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queue();});setInterval(()=>{if(document.visibilityState==='visible')queue();},20000);session();
  }
  window.CommandCentreAccounts={bind,queue,sync,cleanConflicts,get linked(){return !!user&&linked;},get accountId(){return user?.id||'';},get username(){return user?.username||'';},get mangaSyncStatus(){return syncMessage;},get mangaSyncState(){return syncState;}};
})();
