/* Exercise books use the same protected note records, backups and account sync. */
(() => {
  const colors = ['#466454','#405f87','#8b4848','#79608a','#a17a38'];
  let draft = null, page = 0, timer, generation = 0, pending = 0, paperFrame = 0;
  const $ = id => document.getElementById(id);
  const freshPage = () => ({id:crypto.randomUUID(),title:'',body:'',createdAt:new Date().toISOString()});
  function alignPaper() {
    cancelAnimationFrame(paperFrame);
    paperFrame=requestAnimationFrame(()=>{
      const editor=$('noteBody');
      if(!draft||!$('noteModal').classList.contains('open'))return;
      const style=getComputedStyle(editor),row=parseFloat(style.lineHeight);
      // A zero-height inline marker measures the browser's actual font baseline,
      // including platform font differences, without touching saved page content.
      const probe=document.createElement('div'),marker=document.createElement('span');
      Object.assign(probe.style,{position:'fixed',left:'-10000px',top:'0',visibility:'hidden',margin:'0',padding:'0',border:'0',height:row+'px',lineHeight:row+'px',fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,fontStyle:style.fontStyle});
      Object.assign(marker.style,{display:'inline-block',width:'0',height:'0',padding:'0',margin:'0',verticalAlign:'baseline'});
      probe.append('M',marker);document.body.append(probe);
      const baseline=marker.getBoundingClientRect().top-probe.getBoundingClientRect().top;
      probe.remove();editor.style.setProperty('--paper-baseline',baseline+'px');
      // Photos occupy whole paper rows so writing below a photo stays on the rules.
      editor.querySelectorAll('.note-photo').forEach(photo=>{
        const padding=parseFloat(getComputedStyle(photo).paddingBottom)||0;
        const natural=photo.getBoundingClientRect().height-padding+7;
        const aligned=Math.ceil((natural-.01)/row)*row;
        const target=7+aligned-natural;
        if(Math.abs(padding-target)>.1)photo.style.paddingBottom=target+'px';
      });
    });
  }
  function normalise(note) {
    return {...note,kind:'schoolbook',subject:String(note.subject||'').slice(0,100),coverColor:colors.includes(note.coverColor)?note.coverColor:colors[0],paper:note.paper==='grid'?'grid':'lined',pages:(Array.isArray(note.pages)&&note.pages.length?note.pages:[freshPage()]).slice(0,200).map(p=>({id:String(p.id||crypto.randomUUID()),title:String(p.title||'').slice(0,200),body:sanitizeImportedNoteHtml(p.body),createdAt:String(p.createdAt||new Date().toISOString())}))};
  }
  function capture() {if(draft){draft.pages[page].body=CommandCentreNoteImages.serialize($('noteBody'));draft.pages[page].title=$('bookPageTitle').value;draft.subject=$('bookSubject').value;draft.coverColor=$('bookColor').value;draft.paper=$('bookPaper').value;}}
  function display() {
    if(!draft)return;
    $('noteBody').innerHTML=draft.pages[page].body;
    $('bookPageTitle').value=draft.pages[page].title;
    $('bookPageSelect').innerHTML=draft.pages.map((p,i)=>`<option value="${i}">${i+1}. ${esc(p.title||'Untitled page')}</option>`).join('');
    $('bookPageSelect').value=String(page);$('bookPageNumber').textContent=`Page ${page+1} of ${draft.pages.length}`;
    $('bookPrevious').disabled=page===0;$('bookNext').disabled=page===draft.pages.length-1;
    $('noteModal').dataset.paper=draft.paper;$('noteModal').style.setProperty('--book-cover',draft.coverColor);
    updateNoteBodyEmptyState();alignPaper();
  }
  function open(note, newBook=false) {
    clearTimeout(timer);generation++;pending=0;draft=note?.kind==='schoolbook'?normalise(note):newBook?normalise({pages:[freshPage()]}):null;page=0;
    $('noteModal').classList.toggle('book-mode',!!draft);$('bookControls').hidden=!draft;
    $('noteSaveStatus').textContent=draft?'Changes save automatically on this device.':'';
    if(draft){$('bookSubject').value=draft.subject;$('bookColor').value=draft.coverColor;$('bookPaper').value=draft.paper;display();$('noteModalTitle').textContent=note?.deletedAt?'Deleted schoolbook':'School exercise book';$('noteTitle').placeholder='Book title · e.g. Biology';$('saveNote').textContent='Save book';}
    else $('noteTitle').placeholder='Note title';
    $('noteModal').querySelector('.modal-actions [data-close="noteModal"]').textContent=draft?'Done':'Cancel';
    const deleted=!!note?.deletedAt;
    $('noteBody').contentEditable=String(!deleted);
    $('bookControls').querySelectorAll('input,select,button').forEach(el=>el.disabled=deleted||((el.id==='bookPrevious'&&page===0)||(el.id==='bookNext'&&page===draft?.pages.length-1)));
    $('notePhotoBtn').disabled=deleted;$('noteCameraBtn').disabled=deleted;
    $('saveNote').disabled=false;
  }
  function changed() {if(!draft||$('noteBody').contentEditable==='false')return;alignPaper();clearTimeout(timer);$('noteSaveStatus').textContent='Saving…';timer=setTimeout(()=>{if($('noteModal').classList.contains('open'))saveNote(false);},800);}
  function record() {capture();return draft?{...draft,body:draft.pages.map(p=>p.title+' '+notePreview(p.body)).join(' ').slice(0,3000)}:{};}
  function turn(index) {if(!draft)return;capture();page=Math.max(0,Math.min(draft.pages.length-1,index));display();changed();}
  async function addImages(files) {
    const list=[...files].filter(f=>/^image\/(png|jpeg|webp|gif|heic|heif)$/i.test(f.type));
    if(!list.length){toast('Choose a photo or image file.');return;}
    const session=generation;rememberNoteSelection();pending++;$('saveNote').disabled=true;
    try {
      for(const file of list.slice(0,12)) {
        if(file.size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
        const url=URL.createObjectURL(file),img=new Image();
        try {img.src=url;await img.decode();}catch{throw new Error('This image could not be opened. Try JPEG or PNG.');}finally{URL.revokeObjectURL(url);}
        const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
        let src=canvas.toDataURL('image/jpeg',.82);if(src.length>650000)src=canvas.toDataURL('image/jpeg',.6);
        if(session!==generation||!$('noteModal').classList.contains('open'))return;
        const markup=`<figure class="note-photo" contenteditable="false"><img src="${src}" alt="${esc(file.name||'Photo')}" loading="lazy"><button type="button" class="note-photo-remove" aria-label="Remove photo">Remove photo</button></figure><p><br></p>`;
        const current=record();if(JSON.stringify(current).length+$('noteBody').innerHTML.length+markup.length>8*1024*1024)throw new Error('This note is full. Add more photos in a new note or book.');
        $('noteBody').focus({preventScroll:true});if(!restoreNoteSelection()){const range=document.createRange();range.selectNodeContents($('noteBody'));range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
        document.execCommand('insertHTML',false,markup);rememberNoteSelection();updateNoteBodyEmptyState();changed();
      }
    } catch(error) {toast(error.message);} finally {if(session===generation){pending--; $('saveNote').disabled=pending>0;}}
  }
  function shelf(notes) {
    return `<div class="book-shelf-intro"><strong>Your schoolbooks</strong><span>Choose a cover, turn to a page, and start writing.</span></div><div class="book-shelf">${notes.map(n=>`<button type="button" class="exercise-cover" style="--book-cover:${colors.includes(n.coverColor)?n.coverColor:colors[0]}" data-note-id="${esc(n.id)}"><span class="book-cover-label"><span class="book-cover-heading">EXERCISE BOOK</span><strong>${esc(n.title||'Untitled schoolbook')}</strong><span class="book-cover-subject">${esc(n.subject||'Subject')}</span><span>${n.pages?.length||1} ${(n.pages?.length||1)===1?'page':'pages'} · ${esc(noteDateLabel(n.updatedAt||n.createdAt))}</span></span><span class="book-cover-footer">COMMAND CENTRE · SCHOOL</span></button>`).join('')}</div>`;
  }
  function bind() {
    CommandCentreNoteImages.bind($('noteBody'));
    $('addSchoolbookBtn').addEventListener('click',()=>openNote(null,true));
    $('bookColor').innerHTML=colors.map((c,i)=>`<option value="${c}">${['Forest green','Oxford blue','Burgundy','Plum','Ochre'][i]}</option>`).join('');
    $('bookPrevious').addEventListener('click',()=>turn(page-1));$('bookNext').addEventListener('click',()=>turn(page+1));
    $('bookPageSelect').addEventListener('change',e=>turn(Number(e.target.value)));
    $('bookAddPage').addEventListener('click',()=>{if(draft.pages.length>=200){toast('This book has reached 200 pages. Start another book.');return;}capture();draft.pages.push(freshPage());turn(draft.pages.length-1);});
    ['bookSubject','bookColor','bookPaper'].forEach(id=>$(id).addEventListener('change',()=>{capture();$('noteModal').dataset.paper=draft.paper;$('noteModal').style.setProperty('--book-cover',draft.coverColor);changed();}));
    ['noteTitle','noteBody','bookPageTitle'].forEach(id=>$(id).addEventListener('input',changed));
    $('notePhotoBtn').addEventListener('click',()=>{rememberNoteSelection();$('notePhotoInput').click();});
    $('noteCameraBtn').addEventListener('click',()=>{rememberNoteSelection();$('noteCameraInput').click();});
    ['notePhotoInput','noteCameraInput'].forEach(id=>$(id).addEventListener('change',async e=>{await addImages(e.target.files);e.target.value='';}));
    $('noteBody').addEventListener('click',e=>{const button=e.target.closest('.note-photo-remove');if(button&&$('noteBody').contentEditable!=='false'){button.closest('figure').remove();updateNoteBodyEmptyState();changed();}});
    $('noteBody').addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files'))e.preventDefault();});
    $('noteBody').addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();if($('noteBody').contentEditable!=='false')addImages(e.dataTransfer.files);}});
    new ResizeObserver(alignPaper).observe($('noteBody'));
    new MutationObserver(alignPaper).observe($('noteBody'),{childList:true,subtree:true});
    $('noteBody').addEventListener('load',alignPaper,true);
    document.fonts?.ready.then(alignPaper);
    window.addEventListener('pagehide',()=>{if(draft&&$('noteModal').classList.contains('open')&&$('noteBody').contentEditable!=='false')saveNote(false);});
  }
  window.CommandCentreNotebooks={open,record,bind,shelf,addImages,normalise,changed,goToPage(index){if(draft){capture();page=Math.max(0,Math.min(draft.pages.length-1,index));display()}},get isBook(){return !!draft;},get busy(){return pending>0;},saved(){clearTimeout(timer);timer=null;$('noteSaveStatus').textContent='Saved on this device';},flush(){if(draft&&$('noteModal').classList.contains('open')&&$('noteBody').contentEditable!=='false'){if(editingNoteId&&state.notes.find(n=>n.id===editingNoteId)?.deletedAt)return true;return saveNote(false);}return true;}};
})();
