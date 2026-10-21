/* Pasted lesson material stays local until Generate is pressed. */
((root)=>{
  'use strict';
  const core=root.CommandCentrePracticeCore,limit=48000,maxPictures=12;
  const imageURL=url=>typeof url==='string'&&/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(url);
  const uid=()=>root.crypto.randomUUID();
  function normalise(raw){
    if(!raw)return {id:uid(),title:'',transcript:'',pictures:[]};
    if(typeof raw!=='object'||typeof raw.transcript!=='string'||!Array.isArray(raw.pictures)||raw.pictures.length>maxPictures||raw.pictures.some(p=>!p||!imageURL(p.url)||typeof p.caption!=='string'))throw Error('The saved lesson draft could not be opened.');
    if(raw.pictures.reduce((sum,p)=>sum+p.url.length,0)>12*1024*1024)throw Error('The saved lesson pictures exceed 12 MB.');
    return {id:typeof raw.id==='string'?raw.id.slice(0,100):uid(),title:String(raw.title||'').slice(0,200),transcript:raw.transcript,pictures:raw.pictures.map(p=>({id:typeof p.id==='string'?p.id.slice(0,100):uid(),url:p.url,caption:p.caption.slice(0,500),selected:p.selected!==false}))};
  }
  function chunks(transcript){
    const parts=[];let rest=transcript.trim();
    while(rest.length){let end=Math.min(6000,rest.length);if(end<rest.length){const line=rest.lastIndexOf('\n',end),space=rest.lastIndexOf(' ',end);if(line>3000)end=line;else if(space>3000)end=space}parts.push(rest.slice(0,end).trim());rest=rest.slice(end).trim()}
    return parts;
  }
  function source(raw,photos=true){
    const draft=normalise(raw);if(draft.transcript.length>limit)throw Error(`This transcript has ${draft.transcript.length.toLocaleString()} characters. Use a lesson section of up to 48,000 characters; your draft has not been cut.`);
    const pages=chunks(draft.transcript).map((text,i)=>({number:i+1,id:'transcript-'+(i+1),title:'Transcript · part '+(i+1),text,images:[]}));
    if(photos)for(const [i,picture] of draft.pictures.entries())if(picture.selected)pages.push({number:pages.length+1,id:picture.id,title:'Picture '+(i+1),text:picture.caption,images:[picture.url]});
    if(!pages.length||draft.transcript.trim().length<60&&!pages.some(p=>p.images.length))throw Error('Paste at least 60 characters of transcript, or include a lesson picture.');
    return core.prepare({kind:'lesson',bookId:'lesson:'+draft.id,title:draft.title.trim()||'Lesson practice',subject:'',pages,photos});
  }
  const mediaPrefix=owner=>encodeURIComponent(owner)+':picture:';
  function pack(value,owner){
    const images=new Map(),refs=new Set(),prefix=mediaPrefix(owner);
    function remember(url,id,index=0){const ref=prefix+encodeURIComponent(id)+':'+index;images.set(ref,url);refs.add(ref);return ref}
    function reference(ref){if(typeof ref!=='string'||!ref.startsWith(prefix))throw Error('This lesson picture belongs to a different account.');refs.add(ref);return ref}
    function session(row){if(!row||row.sourceKind!=='lesson')return row;return {...row,lessonPages:(row.lessonPages||[]).map(p=>{const {images:urls,imageRefs,...rest}=p;return {...rest,imageRefs:urls?.length?urls.map((url,i)=>remember(url,p.id,i)):(imageRefs||[]).map(reference)}})}}
    const draft=value.lessonDraft;
    return {value:{...value,active:session(value.active),history:value.history.map(session),lessonDraft:{...draft,pictures:draft.pictures.map(p=>({id:p.id,caption:p.caption,selected:p.selected,ref:remember(p.url,p.id)}))}},images,refs};
  }
  async function unpackDraft(raw,owner,read){
    if(!raw)return normalise();
    const pictures=await Promise.all(raw.pictures.map(async p=>{
      if(p.url)return p;
      if(typeof p.ref!=='string'||!p.ref.startsWith(mediaPrefix(owner)))throw Error('A lesson picture belongs to a different account.');
      const url=await read(p.ref);if(!imageURL(url))throw Error('A saved lesson picture could not be loaded. Keep your original screenshots.');return {...p,url};
    }));
    return normalise({...raw,pictures});
  }
  async function readImage(file){
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw Error('Use PNG, JPEG, WebP or GIF pictures.');
    if(file.size>20*1024*1024)throw Error('Each picture must be under 20 MB. Choose a smaller screenshot.');
    const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('This picture could not be read.'));reader.readAsDataURL(file)});
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('This picture could not be opened. Try a PNG or JPEG screenshot.'));image.src=url});
    if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>60000000)throw Error('This picture is too large. Crop it to the relevant slide or diagram.');
    const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Your browser could not prepare this picture.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let prepared=canvas.toDataURL('image/png');if(prepared.length>1500000)prepared=canvas.toDataURL('image/jpeg',.9);
    return {id:uid(),url:prepared,caption:'',selected:true};
  }
  function bind({mount,changed=()=>{},busyChanged=()=>{}}){
    mount.innerHTML=`<div class="field"><label for="practiceLessonTitle">Lesson title (optional)</label><input id="practiceLessonTitle" maxlength="200" placeholder="e.g. Biology · cell transport"></div><div class="field"><label for="practiceTranscript">Lesson video transcript</label><textarea id="practiceTranscript" placeholder="Paste the transcript or a section of your lesson here. Timestamps are fine."></textarea><p class="practice-note" id="practiceTranscriptCount"></p></div><div class="practice-paste-zone" tabindex="0" aria-label="Lesson pictures paste area"><strong>Pictures from your lesson</strong><p class="practice-note">Click here and paste a screenshot (Ctrl+V / ⌘V), or add pictures. You can also paste pictures while editing the transcript or drop image files here.</p><button class="btn small" type="button" id="practiceAddPictures">Add pictures</button><input id="practiceLessonFiles" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></div><p class="practice-note" id="practiceLessonImportStatus" role="status"></p><div id="practiceLessonPictures" class="practice-lesson-pictures" tabindex="0" aria-label="Included lesson pictures"></div><p class="practice-note">Up to 48,000 transcript characters and 12 pictures. Use a whole transcript, selected sections, pictures on their own, or both. Only included material is sent when you generate questions.</p>`;
    const $=id=>mount.querySelector('#'+id),esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let draft=normalise(),disabled=false,importing=false,epoch=0;
    function disable(){mount.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=disabled||importing);mount.querySelector('.practice-paste-zone').setAttribute('aria-disabled',String(disabled||importing))}
    function count(){const n=draft.transcript.length;$('practiceTranscriptCount').textContent=`${n.toLocaleString()} / 48,000 characters${n>limit?' · choose a shorter section before generating':''}`;$('practiceTranscriptCount').classList.toggle('practice-limit-exceeded',n>limit)}
    function render(){
      $('practiceLessonTitle').value=draft.title;$('practiceTranscript').value=draft.transcript;count();
      $('practiceLessonPictures').innerHTML=draft.pictures.map((p,i)=>`<article class="practice-lesson-picture"><img src="${p.url}" alt="Lesson picture ${i+1}" loading="lazy"><label class="practice-photo-choice"><input type="checkbox" data-picture-selected="${esc(p.id)}" ${p.selected?'checked':''}> Include picture ${i+1}</label><label for="lessonCaption${i}">Caption or timestamp (optional)</label><input id="lessonCaption${i}" data-picture-caption="${esc(p.id)}" maxlength="500" value="${esc(p.caption)}" placeholder="e.g. 12:30 · membrane diagram"><button type="button" class="btn small" data-picture-remove="${esc(p.id)}">Remove picture ${i+1}</button></article>`).join('');disable();
    }
    function notify(){count();changed()}
    async function add(files){
      if(disabled||importing)return;const token=epoch,values=Array.from(files);
      if(!values.length)return;
      if(draft.pictures.length+values.length>maxPictures){$('practiceLessonImportStatus').textContent='You can add up to 12 pictures. Remove one before adding more.';return}
      importing=true;disable();busyChanged();$('practiceLessonImportStatus').textContent='Preparing lesson pictures…';
      try{
        const added=[];for(const file of values){added.push(await readImage(file));if(token!==epoch)return}
        if([...draft.pictures,...added].reduce((sum,p)=>sum+p.url.length,0)>12*1024*1024)throw Error('These pictures exceed 12 MB. Add fewer or smaller screenshots.');
        draft.pictures.push(...added);render();notify();$('practiceLessonImportStatus').textContent=`${added.length} ${added.length===1?'picture added':'pictures added'}. Tick the pictures you want to be quizzed on.`;
      }catch(error){if(token===epoch)$('practiceLessonImportStatus').textContent=error.message}
      finally{if(token===epoch){importing=false;disable();busyChanged()}}
    }
    $('practiceTranscript').addEventListener('input',()=>{draft.transcript=$('practiceTranscript').value;notify()});$('practiceLessonTitle').addEventListener('input',()=>{draft.title=$('practiceLessonTitle').value;notify()});
    $('practiceAddPictures').addEventListener('click',()=>$('practiceLessonFiles').click());$('practiceLessonFiles').addEventListener('change',event=>{add(event.target.files);event.target.value=''});
    mount.addEventListener('paste',event=>{
      const files=Array.from(event.clipboardData?.items||[]).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
      if(!files.length)return;event.preventDefault();if(disabled||importing)return;
      const text=event.clipboardData.getData('text/plain');if(event.target===$('practiceTranscript')&&text){$('practiceTranscript').setRangeText(text,$('practiceTranscript').selectionStart,$('practiceTranscript').selectionEnd,'end');draft.transcript=$('practiceTranscript').value;notify()}
      add(files);
    });
    mount.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer?.types||[]).includes('Files'))event.preventDefault()});mount.addEventListener('drop',event=>{event.preventDefault();add(event.dataTransfer?.files||[])});
    mount.addEventListener('change',event=>{const id=event.target.dataset.pictureSelected,p=draft.pictures.find(p=>p.id===id);if(p){p.selected=event.target.checked;notify()}});
    mount.addEventListener('input',event=>{const id=event.target.dataset.pictureCaption,p=draft.pictures.find(p=>p.id===id);if(p){p.caption=event.target.value;notify()}});
    mount.addEventListener('click',event=>{const id=event.target.closest('[data-picture-remove]')?.dataset.pictureRemove;if(id&&!disabled&&!importing){draft.pictures=draft.pictures.filter(p=>p.id!==id);render();notify()}});
    render();
    return {get draft(){return {id:draft.id,title:draft.title,transcript:draft.transcript,pictures:draft.pictures.map(p=>({...p}))}},get importing(){return importing},setDraft(value){epoch++;importing=false;draft=normalise(value);$('practiceLessonImportStatus').textContent='';render()},setDisabled(value){disabled=value;disable()},source:photos=>source(draft,photos)};
  }
  root.CommandCentrePracticeLesson={normalise,chunks,source,pack,unpackDraft,mediaPrefix,readImage,bind};
})(typeof window==='undefined'?globalThis:window);
