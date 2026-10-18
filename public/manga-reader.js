/* Reading progress shares the app's recovery store and JSON backups. */
(() => {
 const $=id=>document.getElementById(id),lib=CommandCentreMangaLibrary;
 const model={results:[],series:null,chapters:[],chapter:null,nextOffset:null,seq:0,view:'explore',page:1,pageCount:0,loaded:false};
 let pageObserver=null,progressTimer=null;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status=message=>{$('mangaReaderStatus').textContent=message;};
 const provider=()=>model.series?.source||$('mangaReaderProvider').value;
 const sourceName=(source=provider())=>({asura:'Asura Scans',mangadex:'MangaDex',comix:'Comix'}[source]||'Manga');
 const library=()=>state.mangaLibrary||{favourites:[],history:[]};
 const saved=item=>library().favourites.some(row=>lib.seriesKey(row)===lib.seriesKey(item));
 const latest=item=>library().history.find(row=>lib.seriesKey(row)===lib.seriesKey(item));
 const motion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.dataset.ccMotion==='off'?'auto':'smooth';
 function comixTools(){const enabled=$('mangaReaderProvider').value==='comix';$('comixReaderTools').hidden=!enabled;const query=$('mangaReaderSearch').value.trim();$('comixSearchLink').href='https://comix.to/browse?q='+encodeURIComponent(query)+'&order=relevance:desc';}
 async function api(path){const response=await fetch('/api/manga/'+path,{signal:AbortSignal.timeout(20000)}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not load manga.');return data;}
 function commit(next){
  const previous=state.mangaLibrary;state.mangaLibrary=next;
  if(!saveState()){state.mangaLibrary=previous;status('Could not save your manga library. Please try again.');toast('Manga library could not be saved');return false;}
  renderLibrary();window.CommandCentreAccounts?.queue();return true;
 }
 function chapterLabel(chapter){return `${chapter.volume?'Vol. '+chapter.volume+' · ':''}${chapter.chapter?'Ch. '+chapter.chapter:'One-shot'}${chapter.title?' · '+chapter.title:''}${chapter.group?' · '+chapter.group:''}`;}
 function toggleFavourite(item){
  const clean=lib.series(item);if(!clean)return;
  const removing=saved(item),current=library();
  const next=removing?lib.remove(current,'favourites',item):lib.merge(current,{favourites:[{...clean,savedAt:lib.timestamp(current,'favourites',lib.seriesKey(item))}]});
  if(commit(next))toast(removing?'Removed from favourites':'Added to favourites');
 }
 function favouriteUI(){
  const button=$('mangaReaderFavourite'),active=model.series&&saved(model.series);
  button.textContent=active?'♥ Favourited':'♡ Add favourite';button.setAttribute('aria-pressed',String(!!active));
  document.querySelectorAll('[data-manga-favourite]').forEach(button=>{const item=model.results[Number(button.dataset.mangaFavourite)];const active=item&&saved(item);button.textContent=active?'♥':'♡';button.setAttribute('aria-pressed',String(!!active));});
 }
 function view(name){
  if(!['explore','favourites','history'].includes(name))return;
  if(name!=='explore')stopTracking();model.view=name;
  document.querySelectorAll('[data-manga-view]').forEach(button=>{const active=button.dataset.mangaView===name;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('mangaDiscoverPanel').hidden=name!=='explore';$('mangaLibraryPanel').hidden=name==='explore';renderLibrary();
  if(name==='explore'&&model.loaded)trackPages();
 }
 function libraryCard(item,index,history){
  const recent=history?item:latest(item),details=recent?(item.readingMode==='source'?`Comix · ${recent.chapter.chapter?'Chapter '+recent.chapter.chapter:'Saved chapter link'}`:`${chapterLabel(recent.chapter)} · Page ${recent.page} of ${recent.pageCount}`):sourceName(item.source);
  return `<article class="manga-library-item">${item.cover?`<img src="${escape(item.cover)}" alt="${escape(item.title)} cover" loading="lazy" referrerpolicy="no-referrer">`:'<div class="manga-cover-placeholder" aria-hidden="true">本</div>'}<div class="manga-library-copy"><span class="glass-eyebrow">${escape(sourceName(item.source))}</span><h3>${escape(item.title)}</h3><p>${escape(details)}</p>${history?`<time datetime="${new Date(item.readAt).toISOString()}">${escape(new Date(item.readAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}))}</time>`:''}<div class="manga-library-actions"><button type="button" class="btn primary" data-manga-open="${index}">${recent?'Resume reading ↗':'Open title ↗'}</button><button type="button" class="btn" data-manga-remove="${index}" aria-label="Remove ${escape(item.title)} from ${history?'history':'favourites'}">${history?'Remove':'♥'}</button></div></div></article>`;
 }
 function renderLibrary(){
  const current=library(),history=model.view==='history',items=history?current.history:current.favourites;
  $('mangaFavouriteCount').textContent=current.favourites.length;$('mangaHistoryCount').textContent=current.history.length;
  $('mangaLibrarySummary').textContent=`${current.favourites.length} favourites · ${current.history.length} recent chapters`;
  $('mangaLibraryTitle').textContent=history?'Reading history':'Your favourites';
  const syncing=window.CommandCentreAccounts?.linked;
  $('mangaSyncLabel').textContent=syncing?'Linked to '+CommandCentreAccounts.username+' · '+(CommandCentreAccounts.mangaSyncStatus||'Reading history sync is ready.'):'Sign in to the same account on PC and phone to sync reading history.';
  let syncButton=$('mangaSyncNow');if(!syncButton){syncButton=document.createElement('button');syncButton.id='mangaSyncNow';syncButton.type='button';syncButton.className='btn small';$('mangaSyncLabel').after(syncButton);syncButton.addEventListener('click',()=>{if(window.CommandCentreAccounts?.linked)CommandCentreAccounts.sync();else switchPage('account');});}
  syncButton.textContent=syncing?'↻ Sync now':'Sign in to sync';syncButton.disabled=window.CommandCentreAccounts?.mangaSyncState==='syncing';
  $('mangaLibraryDescription').textContent=history?'Your last 200 chapters, with your reading place remembered.':'The stories you want to come back to.';
  if(model.view!=='explore')$('mangaLibraryItems').innerHTML=items.length?items.map((item,index)=>libraryCard(item,index,history)).join(''):`<div class="manga-library-empty"><span aria-hidden="true">${history?'↺':'♡'}</span><h3>${history?'Your next chapter starts here':'Make room for your favourites'}</h3><p>${history?'Read a chapter and your place will appear here.':'Search for a title and tap the heart to keep it close.'}</p><button class="btn primary" type="button" data-manga-discover>Discover manga ↗</button></div>`;
  const recent=current.history[0],container=$('mangaContinueReading');container.hidden=!recent;
  if(recent)container.innerHTML=`<div><span class="glass-eyebrow">PICK UP WHERE YOU LEFT OFF</span><strong>${escape(recent.title)}</strong><span>${escape(chapterLabel(recent.chapter))}${recent.readingMode==='source'?' · Comix reader':` · Page ${recent.page} of ${recent.pageCount}`}</span></div><button type="button" class="btn primary" data-manga-resume>Continue reading ↗</button>`;
  favouriteUI();
 }
 function saveProgress(){
  clearTimeout(progressTimer);progressTimer=null;if(!model.loaded||!model.series||!model.chapter)return;
  const entry=lib.history({...model.series,chapter:model.chapter,language:model.language||'en',page:model.page,pageCount:model.pageCount,readAt:lib.timestamp(library(),'history',lib.historyKey({...model.series,chapter:model.chapter}))});
  if(entry)commit(lib.merge(library(),{history:[entry]}));
 }
 function stopTracking(){if(progressTimer)saveProgress();pageObserver?.disconnect();pageObserver=null;}
 function trackPages(){
  pageObserver?.disconnect();if(!('IntersectionObserver' in window)||!model.loaded)return;
  pageObserver=new IntersectionObserver(entries=>{
   if(model.view!=='explore'||!$('mangaPage').classList.contains('active'))return;
   const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>Math.abs(a.boundingClientRect.top)-Math.abs(b.boundingClientRect.top));
   if(visible.length){const page=Number(visible[0].target.dataset.page);if(page!==model.page){model.page=page;clearTimeout(progressTimer);progressTimer=setTimeout(saveProgress,500);}}
  },{rootMargin:'-15% 0px -45% 0px',threshold:0});
  $('mangaReaderPages').querySelectorAll('figure').forEach(figure=>pageObserver.observe(figure));
 }
 function chaptersUI(){
  const select=$('mangaReaderChapter');select.innerHTML=model.chapters.length?model.chapters.map(c=>`<option value="${escape(c.id)}">${escape(chapterLabel(c))}</option>`).join(''):'<option value="">No chapters available</option>';
  select.disabled=!model.chapters.length;if(model.chapter)select.value=model.chapter.id;
  $('mangaReaderRead').disabled=!model.chapters.length;$('mangaReaderRetry').disabled=!model.chapter;
  const index=model.chapters.findIndex(c=>c.id===model.chapter?.id);
  $('mangaReaderPrev').disabled=index<=0;$('mangaReaderNext').disabled=index<0||(index>=model.chapters.length-1&&model.nextOffset===null);
  $('mangaReaderMore').hidden=model.nextOffset===null;
 }
 function reset(){stopTracking();model.loaded=false;model.series=null;model.chapter=null;model.chapters=[];model.results=[];model.nextOffset=null;$('mangaReaderBook').hidden=true;$('mangaReaderPages').replaceChildren();$('mangaReaderResults').replaceChildren();chaptersUI();}
 async function search(title){
  const query=(title||$('mangaReaderSearch').value).trim();if(!query)return;
  view('explore');reset();$('mangaReaderSearch').value=query;comixTools();const seq=++model.seq,source=$('mangaReaderProvider').value;
  status('Searching '+sourceName(source)+'…');$('mangaReaderSearchBtn').disabled=true;
  try{
   const data=await api('search?source='+source+'&q='+encodeURIComponent(query));if(seq!==model.seq)return;model.results=data.results.map(item=>({...item,source}));
   $('mangaReaderResults').innerHTML=model.results.map((item,i)=>`<article class="manga-reader-result"><button type="button" class="manga-result-open" data-manga-result="${i}">${item.cover?`<img src="${escape(item.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="manga-cover-placeholder" aria-hidden="true">本</span>'}<strong>${escape(item.title)}</strong><span>${escape(item.status)}</span></button><button type="button" class="manga-result-heart" data-manga-favourite="${i}" aria-label="Favourite ${escape(item.title)}" aria-pressed="false">♡</button></article>`).join('');favouriteUI();
   status(data.results.length?'Choose a title to see its chapters.':'No matching titles on '+sourceName(source)+'. Try another source or name.');
  }catch(e){if(seq===model.seq)status(e.message);}finally{if(seq===model.seq)$('mangaReaderSearchBtn').disabled=false;}
 }
 async function chapters(more=false){
  if(!model.series)return false;
  stopTracking();const seq=++model.seq,series=model.series,start=more?model.nextOffset:0;if(start===null)return false;
  status('Loading chapters…');
  if(!more){model.loaded=false;model.chapters=[];model.chapter=null;model.nextOffset=null;$('mangaReaderPages').replaceChildren();chaptersUI();}
  try{
   const data=await api(`chapters?source=${series.source}&id=${encodeURIComponent(series.id)}&language=${$('mangaReaderLanguage').value}&offset=${start}`);if(seq!==model.seq)return false;
   model.chapters=more?[...model.chapters,...data.chapters.filter(c=>!model.chapters.some(old=>old.id===c.id))]:data.chapters;model.nextOffset=data.nextOffset;
   chaptersUI();status(model.chapters.length?`${model.chapters.length} chapters available. Choose a chapter to read.`:sourceName()+' has no readable chapters for this title'+(series.source==='mangadex'?' in this language':'')+'. Choose another source above'+(series.source==='mangadex'?' or change the language.':'.'));if(more&&model.loaded)trackPages();return true;
  }catch(e){if(seq===model.seq)status(e.message);return false;}
 }
 async function openSeries(series,resume=null){
  view('explore');reset();++model.seq;model.series=series;
  $('mangaReaderProvider').value=series.source;const language=$('mangaReaderLanguage');language.disabled=provider()!=='mangadex';language.value=resume?.language||'en';
  $('mangaReaderSeries').textContent=series.title;$('mangaReaderSource').href=series.url;$('mangaReaderSource').textContent='View title on '+sourceName()+' ↗';
  $('mangaReaderBook').hidden=false;$('mangaReaderSearchBtn').disabled=false;favouriteUI();chaptersUI();
  comixTools();const controls=$('mangaReaderBook').querySelector('.manga-reader-controls');controls.hidden=series.source==='comix';
  if(series.source==='comix'){
    model.chapter=resume?.chapter||null;
    const url=resume?.chapter?.url||series.url;
    $('mangaReaderSource').href=url;
    $('mangaReaderPages').innerHTML=`<div class="comix-reading-card"><span class="glass-eyebrow">COMIX READER</span><h3>${escape(series.title)}</h3><p>${resume?.chapter?.chapter?'Continue from chapter '+escape(resume.chapter.chapter)+'. ':' '}Read on Comix, then save your next chapter link here to keep your history in sync.</p><a class="btn primary" href="${escape(url)}" target="_blank" rel="noopener noreferrer" data-comix-open>Open ${resume?'saved chapter':'title'} on Comix ↗</a></div>`;
    status('Comix uses its own browser reader. Titles and saved chapter links are included in your synced library.');
    $('mangaReaderBook').scrollIntoView({block:'start',behavior:motion()});return;
  }
  const loaded=await chapters();
  if(loaded&&resume&&model.series===series){await read(resume.chapter.id,resume);}
  if(model.series===series&&!resume)$('mangaReaderBook').scrollIntoView({block:'start',behavior:motion()});
 }
 async function read(id,resume=null){
  const chapter=model.chapters.find(c=>c.id===id)||resume?.chapter;if(!chapter)return;
  stopTracking();model.loaded=false;const seq=++model.seq;model.chapter=chapter;model.language=$('mangaReaderLanguage').value;chaptersUI();status('Loading chapter pages…');$('mangaReaderPages').replaceChildren();
  $('mangaReaderSource').href=chapter.url;$('mangaReaderSource').textContent='View chapter on '+sourceName()+' ↗';
  try{
   const data=await api('pages?source='+provider()+'&id='+encodeURIComponent(id));if(seq!==model.seq)return;
   if(!data.pages?.length)throw Error('This chapter has no available pages.');if(data.url)$('mangaReaderSource').href=data.url;
   model.pageCount=data.pages.length;model.page=Math.min(model.pageCount,resume?.page||1);
   $('mangaReaderPages').innerHTML=data.pages.map((url,i)=>`<figure data-page="${i+1}"><img src="${escape(url)}" alt="${escape(model.series.title)} · page ${i+1}" loading="${i?'lazy':'eager'}" decoding="async" referrerpolicy="no-referrer"><figcaption>Page ${i+1} of ${data.pages.length}</figcaption></figure>`).join('');
   $('mangaReaderPages').querySelectorAll('img').forEach((img,index)=>{
    let triedOriginal=false;
    img.addEventListener('error',()=>{if(seq!==model.seq)return;if(!triedOriginal&&data.originalPages?.[index]&&data.originalPages[index]!==img.src){triedOriginal=true;img.src=data.originalPages[index];return;}img.hidden=true;const caption=img.nextElementSibling;caption.textContent+=' · Image unavailable from the source. Use Retry pages or the source link.';status('Some source images could not be loaded. Retry pages or open the source link.');});
   });
   model.loaded=true;saveProgress();status(`${chapterLabel(chapter)} · ${data.pages.length} pages · ${sourceName()}`);
   if(resume)$('mangaReaderPages').querySelector(`[data-page="${model.page}"]`)?.scrollIntoView({block:'start',behavior:'auto'});
   trackPages();
  }catch(e){if(seq===model.seq)status(e.message);}
 }
 async function turn(step){
  const series=model.series;let index=model.chapters.findIndex(c=>c.id===model.chapter?.id)+step;
  if(index>=model.chapters.length&&model.nextOffset!==null)await chapters(true);
  if(model.series===series&&model.chapters[index]){await read(model.chapters[index].id);$('mangaReaderBook').scrollIntoView({block:'start',behavior:motion()});}
 }
 $('mangaReaderForm').addEventListener('submit',event=>{event.preventDefault();search();});
 $('mangaReaderProvider').addEventListener('change',()=>{reset();++model.seq;comixTools();$('mangaReaderSearchBtn').disabled=false;$('mangaReaderSearch').placeholder='Search '+sourceName()+' titles…';status('Search '+sourceName()+' for a title.');if($('mangaReaderSearch').value.trim())search();});
 $('comixLinkForm').addEventListener('submit',event=>{
  event.preventDefault();
  try{
   const {series,chapter}=CommandCentreComixLinks.parse($('comixLinkUrl').value,$('comixLinkTitle').value),current=library();
   const update={favourites:[{...series,savedAt:lib.timestamp(current,'favourites',lib.seriesKey(series))}]};
   if(chapter)update.history=[{...series,chapter,page:1,pageCount:1,language:'en',readAt:lib.timestamp(current,'history',lib.historyKey({...series,chapter}))}];
   if(commit(lib.merge(current,update))){toast(chapter?'Comix chapter saved to your library':'Comix title saved to favourites');openSeries(series,chapter?{chapter}:null);}
  }catch(error){status(error.message);}
 });
 $('mangaReaderResults').addEventListener('click',event=>{
  const heart=event.target.closest('[data-manga-favourite]');if(heart){toggleFavourite(model.results[Number(heart.dataset.mangaFavourite)]);return;}
  const button=event.target.closest('[data-manga-result]');if(button){const series=model.results[Number(button.dataset.mangaResult)];if(series)openSeries(series);}
 });
 $('mangaReaderFavourite').addEventListener('click',()=>toggleFavourite(model.series));
 $('mangaPage').addEventListener('click',event=>{
  if(event.target.closest('[data-comix-open]')&&model.series&&model.chapter){const item={...model.series,chapter:model.chapter,page:1,pageCount:1,language:'en',readAt:lib.timestamp(library(),'history',lib.historyKey({...model.series,chapter:model.chapter}))};commit(lib.merge(library(),{history:[item]}));}
  const tab=event.target.closest('[data-manga-view]');if(tab)view(tab.dataset.mangaView);
  if(event.target.closest('[data-manga-discover]'))view('explore');
  if(event.target.closest('[data-manga-resume]')){const item=library().history[0];if(item)openSeries(item,item);}
  const button=event.target.closest('[data-manga-open]');if(button){const item=(model.view==='history'?library().history:library().favourites)[Number(button.dataset.mangaOpen)];if(item)openSeries(item,model.view==='history'?item:latest(item));}
  const remove=event.target.closest('[data-manga-remove]');if(remove){const current=library(),key=model.view==='history'?'history':'favourites',item=current[key][Number(remove.dataset.mangaRemove)];if(item)commit(lib.remove(current,key,item));}
 });
 $('mangaReaderLanguage').addEventListener('change',()=>chapters());$('mangaReaderChapter').addEventListener('change',event=>read(event.target.value));
 $('mangaReaderRead').addEventListener('click',()=>read($('mangaReaderChapter').value));
 $('mangaReaderRetry').addEventListener('click',()=>{if(model.chapter)read(model.chapter.id,{chapter:model.chapter,page:model.page});else if(model.series)chapters();else search();});
 $('mangaReaderPrev').addEventListener('click',()=>turn(-1));$('mangaReaderNext').addEventListener('click',()=>turn(1));$('mangaReaderMore').addEventListener('click',()=>chapters(true));
 addEventListener('cc-pagechange',event=>{if(event.detail==='manga'){renderLibrary();if(model.loaded&&model.view==='explore')trackPages();}else stopTracking();});
 addEventListener('pagehide',stopTracking);document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTracking();else if(model.loaded&&model.view==='explore')trackPages();});
 addEventListener('cc-accountchange',renderLibrary);
 addEventListener('cc-accountsync',renderLibrary);
 window.CommandCentreMangaReader={search,refresh:renderLibrary};chaptersUI();renderLibrary();comixTools();
})();
