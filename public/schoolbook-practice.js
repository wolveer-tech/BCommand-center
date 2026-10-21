/* Book-grounded practice. OpenAI credentials stay on the Worker. */
(() => {
  'use strict';
  const core=window.CommandCentrePracticeCore,providers=window.CommandCentreSchoolbookProviders,$=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const copy=value=>JSON.parse(JSON.stringify(value));
  const owner=()=>state.noteAccountOwner||'local';
  let bound=false,store,media,lesson,activeOwner='',loadId=0,loading=false,busy=false,controller,session=null,history=[],writes=Promise.resolve(),answerTimer,draftTimer,bookSignature='',pageBook='',sourceFocus,lastMediaRefs='';
  const cachedMedia=new Set(),lessonCore=window.CommandCentrePracticeLesson;
  const current=()=>session?.questions.find(q=>q.id===session.currentId);
  const provider=()=>$('practiceProvider').value;
  let connectionId=0;
  const providerName=name=>({auto:'Automatic',qwen:'QwenCloud',deepseek:'DeepSeek',openai:'OpenAI'}[name]||name);
  const aiDescription=ai=>ai?`${providerName(ai.provider)} · ${ai.model}${ai.effort?' · '+ai.effort+' reasoning':''}. ${ai.reason||''}`:'';
  async function connection(){
    sourceSummary();$('practiceConnect').textContent=provider()==='openai'?'Account & connection':'AI key settings';
    const token=++connectionId;
    if(window.CommandCentreAIKeys&&!window.CommandCentreAIKeys.status)await window.CommandCentreAIKeys.refresh();
    if(token!==connectionId)return;
    if(provider()==='auto'){$('practiceConnection').textContent=['deepseek','qwen'].some(n=>window.CommandCentreAIKeys?.has(n))?'Automatic is ready · one saved provider per task. Photos and general questions prefer QwenCloud; calculations and accounting marking prefer DeepSeek.':'Save a DeepSeek or QwenCloud key to your account in Settings, then use Automatic on any signed-in device.';return}
    if(window.CommandCentreAIKeys?.has(provider())){const config=window.CommandCentreAIKeys.status.providers[provider()];$('practiceConnection').textContent=`${providerName(provider())} ready · ${config.model}${config.effort?' · '+config.effort+' reasoning':''} · secure account key.`;return}
    if(provider()==='qwen'){$('practiceConnection').textContent=state.qwenKey?.trim()?`QwenCloud key saved · ${providers.qwenConfig(state).model}. Sign in to your app account to use it.`:'Add your QwenCloud API key in Settings → Integrations.';return}
    if(provider()!=='openai'){const config=providers.deepSeekConfig(state);$('practiceConnection').textContent=state.deepSeekKey?`DeepSeek key saved · ${config.model} · ${config.effort==='instant'?'instant replies':config.effort+' reasoning'}${config.model==='deepseek-v4-pro'?' · text only':''}`:'Add your DeepSeek API key in Settings.';return}
    $('practiceConnection').textContent='Checking OpenAI connection…';
    try{
      const response=await fetch('/api/accounts/practice/status',{credentials:'same-origin',signal:AbortSignal.timeout(10000)}),data=await response.json();
      if(token!==connectionId)return;
      $('practiceConnection').textContent=response.ok?(data.configured?'OpenAI ready · uses the app’s server key.':'OpenAI setup pending · the app owner needs to add the server API key.'):(response.status===401?'Sign in to your app account to use OpenAI practice.':data.error||'OpenAI connection is unavailable.');
    }catch{if(token===connectionId)$('practiceConnection').textContent='Could not check OpenAI. Check your internet connection.'}
  }
  function focusQuestion(){
    if(window.matchMedia?.('(max-width:700px)').matches)$('practiceSetupDetails').open=false;
    $('practiceWorkspace').scrollIntoView({block:'start'});
  }
  function status(message){$('practiceStatus').textContent=message}
  const draftKey=key=>'cc-practice-lesson-draft-v1:'+key;
  function checkpointDraft(){
    try{const packed=lessonCore.pack({active:null,history:[],lessonDraft:lesson.draft},activeOwner);if([...packed.images.keys()].some(ref=>!cachedMedia.has(ref)))return;sessionStorage.setItem(draftKey(activeOwner),JSON.stringify({savedAt:Date.now(),lessonDraft:packed.value.lessonDraft,sourceMode:sourceMode(),photos:$('practicePhotos').checked}))}catch{}
  }
  function persist(){
    if(loading)return Promise.resolve();
    const key=activeOwner,packed=lessonCore.pack({version:1,savedAt:Date.now(),active:session,history:history.slice(0,8),lessonDraft:lesson.draft,sourceMode:sourceMode(),photos:$('practicePhotos').checked},key),captured=copy(packed.value);
    const task=writes.catch(()=>{}).then(async()=>{
      const added=[...packed.images].filter(([ref])=>!cachedMedia.has(ref));
      if(added.length){await media.run('readwrite',rows=>{for(const [ref,url] of added)rows.put(url,ref);return ()=>true});if(key===activeOwner)for(const [ref] of added)cachedMedia.add(ref)}
      await store.run('readwrite',rows=>{rows.put(captured,key);return ()=>true});
      try{const checkpoint=JSON.parse(sessionStorage.getItem(draftKey(key))||'null');if(checkpoint?.savedAt<=captured.savedAt)sessionStorage.removeItem(draftKey(key))}catch{}
      const signature=key+':'+[...packed.refs].sort().join('|');
      if(signature!==lastMediaRefs){await media.run('readwrite',rows=>{const req=rows.getAllKeys();req.onsuccess=()=>{for(const ref of req.result)if(typeof ref==='string'&&ref.startsWith(lessonCore.mediaPrefix(key))&&!packed.refs.has(ref)){rows.delete(ref);cachedMedia.delete(ref)}};return ()=>true});if(key===activeOwner)lastMediaRefs=signature}
    });
    writes=task;task.then(()=>{if(key===activeOwner)$('practiceSaveNotice').textContent='Practice and lesson draft saved on this device.'},()=>{if(key===activeOwner)$('practiceSaveNotice').textContent='Practice could not be saved. Keep this page open and try again.'});return task;
  }
  async function load(){
    clearTimeout(answerTimer);clearTimeout(draftTimer);if(activeOwner&&!loading)persist().catch(()=>{});const key=owner(),token=++loadId;activeOwner=key;cachedMedia.clear();lastMediaRefs='';loading=true;controller?.abort();session=null;history=[];busy=false;lesson.setDraft(null);setSourceMode('schoolbook');closeSource();draw();status('');
    try{
      await writes.catch(()=>{});
      const saved=await store.run('readonly',rows=>{const req=rows.get(key);return ()=>req.result});let checkpoint;try{const value=JSON.parse(sessionStorage.getItem(draftKey(key))||'null');if(typeof value?.savedAt==='number'&&value.savedAt>(saved?.savedAt||0))checkpoint=value}catch{}
      if(token!==loadId||owner()!==key)return;
      if(saved||checkpoint){
        const valid=row=>row&&Array.isArray(row.questions)&&row.questions.length>0&&row.questions.length<=16&&Array.isArray(row.results)&&Array.isArray(row.used)&&Array.isArray(row.sourcePages)&&row.questions.every(q=>q&&typeof q.question==='string'&&Array.isArray(q.points)&&Array.isArray(q.sources))&&row.questions.some(q=>q.id===row.currentId);
        if(saved&&(saved.version!==1||!Array.isArray(saved.history)||saved.active&&!valid(saved.active)||saved.history.some(row=>!valid(row))))throw Error('Saved practice could not be opened. Your schoolbooks are unaffected.');
        const material=checkpoint||saved,draft=await lessonCore.unpackDraft(material.lessonDraft,key,async ref=>{const url=await media.run('readonly',rows=>{const req=rows.get(ref);return ()=>req.result});if(url&&token===loadId)cachedMedia.add(ref);return url});if(token!==loadId||owner()!==key)return;
        lesson.setDraft(draft);session=saved?.active||null;history=saved?.history?.slice(0,8)||[];
        restoreSelection();if(typeof material.photos==='boolean')$('practicePhotos').checked=material.photos;setSourceMode(material.sourceMode||session?.sourceKind||'schoolbook');
      }
    }catch(error){if(token===loadId)status(error.message)}finally{if(token===loadId){loading=false;draw()}}
  }
  function archive(value){if(value)history=[copy(value),...history.filter(row=>row.id!==value.id)].slice(0,8)}
  function restoreSelection(){
    if(!session)return;
    $('practiceProvider').value=session.provider||'deepseek';$('practiceFormat').value=session.format||'written';connection();
    setSourceMode(session.sourceKind||'schoolbook');$('practiceBook').value=session.bookId;$('practiceLevel').value=session.level;$('practiceCourse').value=session.course||'';$('practiceCount').value=String(session.count);pageBook='';pages();
    const selected=new Set(session.sourcePages.map(p=>p.id));$('practicePages').querySelectorAll('input').forEach(el=>el.checked=selected.has(el.value));sourceSummary();
  }
  function selectedBook(){return state.notes.find(n=>n.id===$('practiceBook').value&&n.kind==='schoolbook'&&!n.deletedAt&&!n.purged)}
  const sourceMode=()=>$('practiceSource').value;
  function setSourceMode(value){$('practiceSource').value=value==='lesson'?'lesson':'schoolbook';$('practiceBookSource').hidden=sourceMode()==='lesson';$('practiceBookPages').hidden=sourceMode()==='lesson';$('practiceLessonSource').hidden=sourceMode()!=='lesson';sourceSummary()}
  function draftChanged(){sourceSummary();clearTimeout(draftTimer);if(!loading){$('practiceSaveNotice').textContent='Saving lesson draft…';checkpointDraft();if(lesson.importing)persist().catch(()=>{});else draftTimer=setTimeout(()=>persist().catch(()=>{}),350)}}
  function pages(){
    const book=selectedBook(),old=pageBook===book?.id?new Set([...$('practicePages').querySelectorAll('input:checked')].map(el=>el.value)):null;pageBook=book?.id||'';
    $('practicePages').innerHTML=(book?.pages||[]).map((p,i)=>{const parsed=core.extract(p.body),hasContent=parsed.text.length>0||parsed.images.length>0;return `<label class="practice-page-choice"><input type="checkbox" value="${escape(p.id||String(i+1))}" data-page="${i+1}" ${hasContent&&(!old||old.has(p.id||String(i+1)))?'checked':''}><span>${i+1}. ${escape(p.title||'Untitled page')}<small>${parsed.text.length?`${parsed.text.length.toLocaleString()} characters`: 'No typed text'}${parsed.images.length?` · ${parsed.images.length} photos`:''}</small></span></label>`}).join('')||'<p class="practice-note">Create a schoolbook with lesson notes first.</p>';
    sourceSummary();
  }
  function sourceSummary(){
    if(sourceMode()==='lesson'){
      const draft=lesson?.draft,selected=$('practicePhotos').checked?(draft?.pictures||[]).filter(p=>p.selected).length:0;
      $('practiceSourceSummary').textContent=`${(draft?.transcript.length||0).toLocaleString()} transcript characters · ${selected} included ${selected===1?'picture':'pictures'}. Only this lesson material goes to ${provider()==='auto'?'the selected DeepSeek or QwenCloud provider':providerName(provider())} when you generate. API credit is required.`;return;
    }
    const checked=$('practicePages').querySelectorAll('input:checked').length,photos=$('practicePhotos').checked;
    $('practiceSourceSummary').textContent=`${checked} ${checked===1?'page':'pages'} selected · ${photos?'text and photos':'text only'}. Only these pages go to ${provider()==='auto'?'the selected DeepSeek or QwenCloud provider':providerName(provider())} when you generate questions. API credit is required; your other books are not sent.`;
  }
  function refresh(){
    if(!bound)return;
    const books=state.notes.filter(n=>n.kind==='schoolbook'&&!n.deletedAt&&!n.purged),signature=JSON.stringify(books.map(n=>[n.id,n.title,n.updatedAt,n.pages?.length]));
    if(signature!==bookSignature){
      bookSignature=signature;const selected=$('practiceBook').value;
      $('practiceBook').innerHTML=books.map(n=>`<option value="${escape(n.id)}">${escape(n.title||'Untitled schoolbook')}</option>`).join('');
      if(books.some(n=>n.id===selected))$('practiceBook').value=selected;pages();
    }
    connection();
    if(owner()!==activeOwner)load();else controls();
  }
  function controls(){
    const disabled=busy||loading||!!lesson?.importing;
    for(const id of ['practiceSource','practiceBook','practiceLevel','practiceCourse','practiceCount','practiceProvider','practiceFormat','practicePhotos','practiceGenerate','practiceSelectAll','practiceSelectNone'])$(id).disabled=disabled;
    lesson?.setDisabled(busy||loading);
    $('practicePages').querySelectorAll('input').forEach(el=>el.disabled=disabled);
    $('practiceCancel').hidden=!busy;
    $('practiceGenerate').textContent=busy?'Working…':session?'Generate new set':'Generate questions';
    $('practiceWorkspace').querySelectorAll('button').forEach(el=>el.disabled=disabled);
    $('practiceWorkspace').querySelectorAll('textarea').forEach(el=>el.disabled=disabled||!!session?.response);
    $('practiceWorkspace').querySelectorAll('input,select').forEach(el=>el.disabled=disabled||!!session?.response);
  }
  async function request(contract,marking=false,payload={},chosen=provider(),config=null){
    const requestingAccount=window.CommandCentreAccounts?.accountId||'';
    if(window.CommandCentreAIKeys&&!window.CommandCentreAIKeys.status)await window.CommandCentreAIKeys.refresh();
    if(requestingAccount!==(window.CommandCentreAccounts?.accountId||''))throw Error('Your account changed. Start the request again from the current account.');
    const accountKey=chosen==='auto'||config?.keySource==='account'||window.CommandCentreAIKeys?.has(chosen);
    if(chosen==='deepseek'&&!accountKey&&!state.deepSeekKey?.trim())throw Error('Add your DeepSeek API key in Settings first. A ChatGPT subscription does not provide DeepSeek API credit.');
    if(chosen==='qwen'&&!accountKey&&!state.qwenKey?.trim())throw Error('Add your QwenCloud API key in Settings → Integrations first.');
    const body=chosen==='deepseek'&&!accountKey?providers.deepSeekBody(contract,marking,config||providers.deepSeekConfig(state)):null;
    const requestController=new AbortController();controller=requestController;const signal=requestController.signal,timeout=setTimeout(()=>requestController.abort(),chosen==='auto'||chosen==='deepseek'?(marking?130000:190000):(marking?65000:125000));
    try{
      if(accountKey||chosen==='openai'||chosen==='qwen'){
        const name=providerName(chosen),qwenConfig=config||providers.qwenConfig(state);
        const response=await fetch('/api/accounts/practice/'+(chosen==='openai'?'':chosen+'/')+(marking?'mark':'generate'),{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...(requestingAccount?{'x-ai-account':requestingAccount}:{}),...(chosen==='qwen'&&!accountKey?{'x-qwen-key':state.qwenKey.trim(),'x-qwen-model':qwenConfig.model}:{})},signal,body:JSON.stringify({...payload,...(accountKey&&chosen!=='auto'&&config?{providerConfig:{model:config.model,...(config.effort?{effort:config.effort}:{})}}:{})})});
        let data;try{data=await response.json()}catch{throw Error(`${name} practice is unavailable. Check that the latest Worker is deployed.`)}
        if(!response.ok)throw Error(response.status===401?`Sign in to your app account to use ${name} practice.`:data.error||`${name} could not complete the request. Your previous practice is kept.`);
        return data;
      }
      const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${state.deepSeekKey.trim()}`},signal,body:JSON.stringify(body)});
      if(!response.ok)throw Error(({401:'The DeepSeek key was rejected. Check it in Settings.',402:'Your DeepSeek account needs API credit.',429:'DeepSeek is busy or your rate limit was reached. Wait a moment and retry.'})[response.status]||'DeepSeek could not complete this request. Your existing practice is kept.');
      const result=await response.json(),choice=result.choices?.[0];
      if(choice?.finish_reason==='length')throw Error('The response was cut short. Try a shorter practice set or fewer pages.');
      const raw=choice?.message?.content;if(typeof raw!=='string'||raw.length>150000)throw Error('DeepSeek returned an unreadable response. Please retry.');
      try{return JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))}catch{throw Error('DeepSeek returned an incomplete response. Your answer and previous set are kept.')}
    }catch(error){
      if(signal.aborted)throw Error('Request stopped or timed out. Your answer and previous set are kept.');
      if(error instanceof TypeError)throw Error('Could not reach the AI service. Check your internet connection and retry.');throw error;
    }finally{clearTimeout(timeout);if(controller===requestController)controller=null}
  }
  async function generate(){
    if(busy||loading||lesson.importing)return;
    let source;const key=activeOwner,token=loadId;
    try{
      const selected=[...$('practicePages').querySelectorAll('input:checked')].map(el=>Number(el.dataset.page));source=sourceMode()==='lesson'?lesson.source($('practicePhotos').checked):core.source(selectedBook(),selected,$('practicePhotos').checked);
      const level=$('practiceLevel').value,course=$('practiceCourse').value.trim().slice(0,160),count=Number($('practiceCount').value),target=session?.bookId===source.bookId?session.target:3;
      busy=true;controls();status('Reading your selected study material and building a balanced question set…');
      const format=$('practiceFormat').value,chosen=provider(),options={level,course,count,target,format},providerConfig=chosen==='deepseek'?providers.deepSeekConfig(state):chosen==='qwen'?providers.qwenConfig(state):null;
      const data=await request(core.generation(source,options),false,{source,options},chosen,providerConfig);if(key!==owner()||token!==loadId)return;
      const questions=core.questions(data,source,count,format);archive(session);
      session={id:crypto.randomUUID(),provider:chosen,providerConfig:data.ai?{model:data.ai.model,...(data.ai.effort?{effort:data.ai.effort}:{}),keySource:data.ai.keySource}:providerConfig,ai:data.ai||null,format,bookId:source.bookId,title:source.title,level,course,count,target,questions,used:[],results:[],currentId:core.next(questions,[],target).id,answer:'',selectedChoice:null,hinted:false,complete:false,createdAt:Date.now(),sourcePages:source.pages.map(p=>({number:p.number,id:p.id,title:p.title,photos:p.images.length}))};
      session.sourceKind=source.kind||'schoolbook';if(source.kind==='lesson')session.lessonPages=copy(source.pages);
      status(`${source.kind==='lesson'?'Your lesson transcript and included pictures':source.pages.length+' selected pages'} used${source.imageCount?` · ${source.imageCount} ${source.imageCount===1?'picture':'pictures'}`:''}. Starting challenge: ${core.levels[current().difficulty-1]}.`);draw();focusQuestion();await persist();
    }catch(error){if(token===loadId)status(error.message)}finally{if(token===loadId){busy=false;controls()}}
  }
  async function check(){
    const question=current();if(!question||busy||session.response)return;
    if(question.type==='t-account'){
      captureLedger();if(!session.ledgerRows?.some(row=>row.details.trim())){status('Type the entry details and amounts into your T-account first.');return}
    }
    if(question.type==='multiple-choice'){
      try{const response=core.choiceGrade(question,session.selectedChoice);session.answer=question.options[session.selectedChoice];record(response,false);status('Answer checked. Review why each option is right or wrong.');draw();await persist()}catch(error){status(error.message)}return;
    }
    if(!session.answer.trim()){status('Write your answer first, or reveal the worked answer if you are stuck.');return}
    const id=session.id,token=loadId;busy=true;controls();status('Checking your reasoning against the marking points…');
    try{
      const data=await request(core.marking(question,session.answer),true,{question,answer:session.answer},session.provider||'deepseek',session.providerConfig);if(token!==loadId||session?.id!==id)return;
      const response=core.grade(data,question);if(data.ai)session.ai=data.ai;record(response,false);status('Answer checked. Review the feedback, then continue.');draw();await persist();
    }catch(error){if(token===loadId)status(error.message)}finally{if(token===loadId){busy=false;controls()}}
  }
  function record(response,revealed){
    const q=current();session.response={...response,revealed};session.used.push(q.id);
    session.results.push({questionId:q.id,score:response.score,max:response.max,answer:session.answer,hinted:session.hinted,revealed,difficulty:q.difficulty});
    session.target=core.adapt(session.target,session.results);
  }
  function reveal(){
    if(!current()||busy||session.response)return;
    record({score:0,max:current().points.length,awarded:current().points.map(()=>0),feedback:'Study the worked answer and marking points, then try a fresh question. Revealed answers count as assisted practice.',improvements:[]},true);persist().catch(()=>{});status('Worked answer revealed. The next question will offer a little more support.');draw();
  }
  function advance(){
    if(!session?.response||busy)return;
    if(session.results.length>=session.count){session.complete=true;session.completedAt=Date.now();persist().catch(()=>{});status('Set complete. Review your answers or generate another set.');draw();return}
    const q=core.next(session.questions,session.used,session.target);if(!q){status('You have finished the available questions. Generate a new set to continue.');return}
    session.currentId=q.id;session.answer='';session.selectedChoice=null;session.ledgerRows=[];session.hinted=false;session.response=null;persist().catch(()=>{});draw();focusQuestion();
  }
  function adjust(amount){
    if(!session||busy)return;session.target=Math.max(1,Math.min(5,session.target+amount));
    if(!session.response&&!session.answer.trim()&&!Number.isInteger(session.selectedChoice)){const q=core.next(session.questions,[...session.used,session.currentId],session.target);if(q){session.currentId=q.id;session.answer='';session.selectedChoice=null;session.ledgerRows=[];session.hinted=false}}
    status(`Next question target: ${core.levels[session.target-1]}. Your course level stays ${session.level}.`);persist().catch(()=>{});draw();
  }
  function sources(q){return q.sources.map(ref=>{const page=session.sourcePages.find(p=>p.number===ref.page),isLesson=session.sourceKind==='lesson';return `<div class="practice-source"><strong>${isLesson?'':'Page '+ref.page+' · '}${escape(page?.title||'Source material')}</strong><p>${escape(ref.quote)}</p><button class="btn small" data-practice-source="${ref.page}">${isLesson?'View lesson source':'Open source page'}</button>${page?.photos?'<p class="practice-note">This source includes a picture. Check the original if a quoted detail looks wrong.</p>':''}</div>`}).join('')}
  function closeSource(){$('practiceSourceModal')?.classList.remove('open');sourceFocus?.focus();sourceFocus=null}
  async function showLessonSource(number,trigger){
    const page=session.lessonPages?.find(p=>p.number===number);if(!page){status('The original picture is unavailable in this saved set. Its quoted evidence is still shown.');return}
    const token=loadId,id=session.id;let urls=page.images||[];
    try{if(page.imageRefs?.length)urls=await Promise.all(page.imageRefs.map(ref=>{if(!ref.startsWith(lessonCore.mediaPrefix(activeOwner)))throw Error('This lesson picture belongs to a different account.');return media.run('readonly',rows=>{const req=rows.get(ref);return ()=>req.result})}));if(token!==loadId||session?.id!==id)return}catch{status('The saved picture could not be opened. Its quoted evidence is still shown.');return}
    const body=$('practiceSourceBody');body.replaceChildren();$('practiceSourceTitle').textContent=page.title;const text=document.createElement('p');text.textContent=page.text;body.append(text);
    for(const url of urls)if(/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(url)){const img=document.createElement('img');img.src=url;img.alt=page.title;body.append(img)}
    sourceFocus=trigger;$('practiceSourceModal').classList.add('open');$('practiceSourceClose').focus();
  }
  function answerField(q,response){
    if(q.type==='t-account')return ledgerField(q,response);
    if(q.type!=='multiple-choice')return `<label for="practiceAnswer">Your answer</label><textarea id="practiceAnswer" maxlength="6000" placeholder="Write your paragraph, calculation working, or journal entries with account names, debits and credits." ${response?'disabled':''}>${escape(session.answer)}</textarea>`;
    return `<fieldset class="practice-options"><legend>Choose one answer</legend>${q.options.map((option,i)=>`<label class="practice-option ${response?(i===q.correctIndex?'practice-option-correct':i===session.selectedChoice?'practice-option-wrong':''):''}"><input type="radio" name="practiceChoice" value="${i}" ${session.selectedChoice===i?'checked':''} ${response?'disabled':''}><span><strong>${String.fromCharCode(65+i)}.</strong> ${escape(option)}${response?`<small>${i===q.correctIndex?'✓ Correct answer · ':''}${escape(q.optionExplanations[i])}</small>`:''}</span></label>`).join('')}</fieldset>`;
  }
  function ledgerField(q,response){
    const ledger=q.ledger;
    return `<div class="practice-ledger"><h4>${escape(ledger.account)} · ${escape(ledger.currency)}</h4><p class="practice-note">Type the entry details and amounts yourself, as you would in a ledger. Debits go on the left; credits go on the right.</p><div class="practice-ledger-sides">${['debit','credit'].map((side,s)=>`<section><h5>${side==='debit'?'Debit · Dr':'Credit · Cr'}</h5>${ledger.entries.map((entry,i)=>{const slot=s*ledger.entries.length+i,row=session.ledgerRows?.[slot]||{},details=row.details??(Number.isInteger(row.entry)?ledger.entries[row.entry]?.label:'');return `<div class="practice-ledger-row"><input type="text" maxlength="200" aria-label="${side} row ${i+1} details" placeholder="Entry details" data-ledger-entry="${slot}" data-side="${side}" value="${escape(details)}" ${response?'disabled':''}><input id="practiceLedgerAmount${slot}" data-ledger-amount="${slot}" type="number" inputmode="decimal" min="0" step="0.01" aria-label="${side} row ${i+1} amount" placeholder="0.00" value="${escape(row.amount||'')}" ${response?'disabled':''}></div>`}).join('')}<p class="practice-ledger-total">Total: <span data-ledger-total="${side}">${ledgerTotal(side)}</span></p></section>`).join('')}</div></div>`;
  }
  function ledgerTotal(side){return (session.ledgerRows||[]).filter(r=>r.side===side&&(r.details?.trim()||Number.isInteger(r.entry))).reduce((n,r)=>n+(Number.isFinite(Number(r.amount))?Number(r.amount):0),0).toFixed(2)}
  function captureLedger(){
    if(current()?.type!=='t-account'||session.response)return;
    session.ledgerRows=[...$('practiceWorkspace').querySelectorAll('[data-ledger-entry]')].map(el=>({details:el.value.slice(0,200),side:el.dataset.side,amount:$('practiceLedgerAmount'+el.dataset.ledgerEntry).value}));
    session.answer=session.ledgerRows.filter(r=>r.details.trim()||r.amount).map(r=>`${r.side}: ${r.details||'(no entry details)'} | ${r.amount||'(no amount)'}`).join('\n');
    $('practiceWorkspace').querySelectorAll('[data-ledger-total]').forEach(el=>el.textContent=ledgerTotal(el.dataset.ledgerTotal));
  }
  function draw(){
    const workspace=$('practiceWorkspace');if(!workspace)return;
    if(!session){workspace.innerHTML=`<div class="practice-idle"><div><strong>Make your notes work harder.</strong>Choose schoolbook pages or paste a lesson transcript and pictures.<br>Explain ideas, apply them to new situations,<br>and see exactly what your answers are missing.</div></div>`;drawHistory();controls();return}
    if(session.complete){
      const score=session.results.reduce((n,r)=>n+r.score,0),max=session.results.reduce((n,r)=>n+r.max,0),weak=session.results.filter(r=>r.score/r.max<.7).map(r=>session.questions.find(q=>q.id===r.questionId));
      workspace.innerHTML=`<article class="practice-question"><p class="practice-eyebrow">Set complete · ${escape(session.level)}</p><h3>${escape(session.title)}</h3><div class="practice-finish-score">${score} / ${max}</div><p class="practice-note">AI practice marks · ${session.results.filter(r=>r.hinted||r.revealed).length} assisted answers. This is feedback for revision, not an official exam grade.</p><h4>Next step</h4><p class="practice-note">${weak.length?'Revisit the source pages for the questions below, then generate another set.':'You are ready for more challenge. Generate another set to keep going.'} Target: ${escape(core.levels[session.target-1])}.</p>${weak.map(q=>`<details class="practice-feedback"><summary>${escape(q.question)}</summary><p>${escape(q.modelAnswer)}</p>${sources(q)}</details>`).join('')}<div class="practice-actions"><button class="btn primary" data-practice-action="new">Another set</button><button class="btn" data-practice-action="review">Review all answers</button></div><div id="practiceReview" hidden>${session.results.map(r=>{const q=session.questions.find(q=>q.id===r.questionId);return `<details class="practice-feedback"><summary>${escape(q.question)} · ${r.score}/${r.max}</summary><p>Your answer: ${escape(r.answer||'Answer revealed')}</p><p>Model answer: ${escape(q.modelAnswer)}</p>${sources(q)}</details>`}).join('')}</div></article>`;
    }else{
      const q=current(),response=session.response,number=session.results.length+(response?0:1);
      workspace.innerHTML=`<article class="practice-question"><div class="practice-progress"><span>${escape(session.title)} · ${escape(session.level)}</span><span>Question ${number} of ${session.count}</span><progress value="${session.results.length}" max="${session.count}" aria-label="Practice progress"></progress></div><p><span class="practice-badge">${escape(q.skill)} · ${q.points.length} marks</span></p><h3>${escape(q.question)}</h3>${answerField(q,response)}${session.hinted?`<div class="practice-hint">Hint: ${escape(q.hint)}</div>`:''}<div class="practice-actions">${response?`<button class="btn primary" data-practice-action="next">${session.results.length>=session.count?'Finish set':'Next question'}</button>`:'<button class="btn primary" data-practice-action="check">Check answer</button><button class="btn" data-practice-action="hint">Give me a hint</button><button class="btn" data-practice-action="reveal">Reveal answer</button>'}<button class="btn small" data-practice-action="easier">Easier</button><button class="btn small" data-practice-action="harder">Harder</button></div>${response?`<section class="practice-feedback" aria-live="polite"><h4>${response.revealed?'Assisted practice':`${response.score} / ${response.max} marks`}</h4><p>${escape(response.feedback)}</p><ul>${response.improvements.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><details open><summary>Marking points</summary><ol class="practice-points">${q.points.map((point,i)=>`<li class="${response.awarded[i]?'practice-earned':'practice-missed'}">${response.awarded[i]?'✓':'○'} ${escape(point)}</li>`).join('')}</ol></details><details><summary>Model answer</summary><p>${escape(q.modelAnswer)}</p></details><details><summary>Source evidence</summary>${sources(q)}</details><p class="practice-note">Target for the next question: ${escape(core.levels[session.target-1])}. Strong independent answers increase the challenge; mistakes bring more support.</p></section>`:''}</article>`;
    }
    if(session.ai)workspace.insertAdjacentHTML('afterbegin',`<p class="practice-note" role="status">${escape(aiDescription(session.ai))}</p>`);
    drawHistory();controls();
  }
  function drawHistory(){
    $('practiceHistory').innerHTML=history.length?`<h3>Recent practice on this device</h3>${history.map((row,index)=>`<div class="practice-history-row"><div><strong>${escape(row.title)}</strong>${new Date(row.createdAt).toLocaleDateString('en-GB')} · ${row.results.length}/${row.count} answered · ${row.complete?'Complete':'Paused'}</div><button class="btn small" data-practice-resume="${index}">${row.complete?'Review':'Resume'}</button></div>`).join('')}`:'';
  }
  function open(bookId){
    refresh();$('schoolbooksShelfCard').hidden=true;$('schoolbookPractice').hidden=false;
    if(bookId){setSourceMode('schoolbook');$('practiceBook').value=bookId;pageBook='';pages()}
    $('schoolbookPractice').scrollIntoView({block:'start'});
    if(session&&window.matchMedia?.('(max-width:700px)').matches)$('practiceSetupDetails').open=false;
  }
  function bind(){
    if(bound||!$('schoolbookPractice'))return;bound=true;
    store=CommandCentreSafety.database({name:'cc-schoolbook-practice-v1',store:'sessions'});
    media=CommandCentreSafety.database({name:'cc-practice-lesson-media-v1',store:'images'});
    $('schoolbookPractice').innerHTML=`<div class="card-head"><div class="title">Study practice</div><button class="btn" id="practiceBack">← Bookshelf</button></div><div class="practice-intro"><div class="practice-emblem">?</div><div><div class="practice-eyebrow">Your lessons. Deeper understanding.</div><h2>A challenge at your level.</h2><p>Questions grounded in your book, lesson transcript or pictures. Helpful feedback. Difficulty that moves with you.</p></div></div><div class="practice-layout"><div><details class="practice-settings" id="practiceSetupDetails" open><summary>Study material &amp; AI settings</summary><div class="practice-setup"><div class="field"><label for="practiceSource">Study material</label><select id="practiceSource"><option value="schoolbook">Schoolbook pages</option><option value="lesson">Lesson transcript &amp; pictures</option></select></div><div class="field" id="practiceBookSource"><label for="practiceBook">Schoolbook</label><select id="practiceBook"></select></div><div id="practiceLessonSource" class="practice-lesson-source" hidden></div><div class="field"><label for="practiceLevel">Study level</label><select id="practiceLevel"><option>A-level / Higher</option><option>GCSE / National 5</option><option>University / advanced</option></select></div><div class="field"><label for="practiceCourse">Subject / exam board (optional)</label><input id="practiceCourse" maxlength="160" placeholder="e.g. AQA A-level Biology"></div><div class="field"><label for="practiceProvider">Question AI</label><select id="practiceProvider"><option value="deepseek">DeepSeek</option><option value="qwen">QwenCloud</option><option value="openai">OpenAI</option></select></div><div class="field"><label for="practiceFormat">Question format</label><select id="practiceFormat"><option value="mixed">Mixed test practice</option><option value="multiple-choice">Multiple choice · 4 options</option><option value="written">Paragraphs &amp; calculations</option><option value="t-account">T-accounts · type your entries</option><option value="journal-entry">Journal entries · written</option></select></div><p class="practice-note">For any subject: multiple choice, short paragraphs and worked calculations. Accounting can also include T-accounts and multi-step problems and typed journal entries when covered by your study material.</p><div class="field"><label for="practiceCount">Questions in this set</label><select id="practiceCount"><option value="5">5 questions</option><option value="8">8 questions</option></select></div><div id="practiceBookPages"><label>Pages to practise</label><div class="practice-actions" style="margin-top:8px"><button class="btn small" id="practiceSelectAll">Select all</button><button class="btn small" id="practiceSelectNone">Clear selection</button></div><div class="practice-page-list" id="practicePages"></div></div><label class="practice-photo-choice"><input type="checkbox" id="practicePhotos" checked> Include photos and diagrams</label><p class="practice-note" id="practiceSourceSummary"></p><p class="practice-note" id="practiceConnection"></p><button class="btn small" id="practiceConnect">AI key settings</button><div class="practice-actions"><button class="btn primary" id="practiceGenerate">Generate questions</button><button class="btn" id="practiceCancel" hidden>Cancel request</button></div><div class="practice-save-notice" id="practiceSaveNotice">Sessions and answers stay on this device, separate from book sync.</div></div></details><div class="practice-history" id="practiceHistory"></div></div><div class="practice-work"><p class="practice-status" id="practiceStatus" role="status"></p><div id="practiceWorkspace"></div></div></div><div class="modal" id="practiceSourceModal" role="dialog" aria-modal="true" aria-labelledby="practiceSourceTitle"><div class="modal-card practice-source-modal"><div class="modal-head"><div class="title" id="practiceSourceTitle">Lesson source</div><button class="btn" id="practiceSourceClose" aria-label="Close lesson source">Close</button></div><div id="practiceSourceBody"></div></div></div>`;
    lesson=window.CommandCentrePracticeLesson.bind({mount:$('practiceLessonSource'),changed:draftChanged,busyChanged:controls});
    $('practiceSource').addEventListener('change',()=>{setSourceMode(sourceMode());draftChanged()});
    $('practiceSourceClose').addEventListener('click',closeSource);$('practiceSourceModal').addEventListener('click',event=>{if(event.target===$('practiceSourceModal'))closeSource()});window.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('practiceSourceModal').classList.contains('open')){event.stopPropagation();closeSource()}});
    $('schoolbookPracticeOpen').addEventListener('click',()=>open());$('practiceBack').addEventListener('click',()=>{$('schoolbookPractice').hidden=true;$('schoolbooksShelfCard').hidden=false});
    $('practiceBook').addEventListener('change',()=>{pageBook='';pages()});$('practicePhotos').addEventListener('change',draftChanged);$('practicePages').addEventListener('change',sourceSummary);
    for(const [id,checked] of [['practiceSelectAll',true],['practiceSelectNone',false]])$(id).addEventListener('click',()=>{$('practicePages').querySelectorAll('input').forEach(el=>el.checked=checked);sourceSummary()});
    $('practiceProvider').insertAdjacentHTML('afterbegin','<option value="auto">Automatic · DeepSeek / QwenCloud</option>');
    $('practiceProvider').value=['auto','deepseek','qwen','openai'].includes(state.schoolbookProvider)?state.schoolbookProvider:'auto';
    $('practiceProvider').addEventListener('change',()=>{state.schoolbookProvider=provider();if(typeof saveState==='function')saveState();connection()});$('practiceConnect').addEventListener('click',()=>{if(provider()==='openai'){document.querySelector('[data-page=account]')?.click();connection()}else{openSettings();if(typeof showSettingsSection==='function')showSettingsSection('integrations');$(provider()==='qwen'?'settingsQwen':'settingsDeepSeek')?.focus()}});$('practiceGenerate').addEventListener('click',generate);$('practiceCancel').addEventListener('click',()=>controller?.abort());
    $('practiceWorkspace').addEventListener('change',event=>{if(event.target.matches('[data-ledger-entry]')){captureLedger();persist().catch(()=>{})}if(event.target.name==='practiceChoice'&&session&&!session.response){session.selectedChoice=Number(event.target.value);persist().catch(()=>{})}});
    $('practiceWorkspace').addEventListener('input',event=>{if(event.target.matches('[data-ledger-amount],[data-ledger-entry]')){captureLedger();clearTimeout(answerTimer);answerTimer=setTimeout(()=>persist().catch(()=>{}),350)}if(event.target.id==='practiceAnswer'&&session&&!session.response){session.answer=event.target.value;clearTimeout(answerTimer);answerTimer=setTimeout(()=>persist().catch(()=>{}),350)}});
    $('schoolbookPractice').addEventListener('click',event=>{
      const source=event.target.closest('[data-practice-source]');
      if(source&&session){if(session.sourceKind==='lesson'){showLessonSource(Number(source.dataset.practiceSource),source);return}const book=state.notes.find(n=>n.id===session.bookId&&!n.deletedAt&&!n.purged),ref=session.sourcePages.find(p=>p.number===Number(source.dataset.practiceSource));if(!book){status('This source book is no longer available. The original evidence is still shown.');return}const index=book.pages.findIndex(p=>p.id===ref?.id);if(index<0){status('That page has moved or been removed. The original evidence is still shown.');return}openNote(book.id);CommandCentreNotebooks.goToPage(index);return}
      const resume=event.target.closest('[data-practice-resume]');if(resume&&!busy&&!loading){const selected=history[Number(resume.dataset.practiceResume)];history=history.filter(row=>row.id!==selected.id);archive(session);session=copy(selected);restoreSelection();persist().catch(()=>{});draw();return}
      const action=event.target.closest('[data-practice-action]')?.dataset.practiceAction;if(!action||busy)return;
      if(action==='check')check();else if(action==='next')advance();else if(action==='reveal')reveal();else if(action==='hint'){session.hinted=true;persist().catch(()=>{});draw()}else if(action==='easier')adjust(-1);else if(action==='harder')adjust(1);else if(action==='new')generate();else if(action==='review')$('practiceReview').hidden=!$('practiceReview').hidden;
    });
    window.addEventListener('cc-accountchange',()=>{controller?.abort();refresh()});window.addEventListener('cc-aikeyschange',refresh);window.addEventListener('cc-pagechange',event=>{if(event.detail==='schoolbooks')refresh()});
    window.addEventListener('pagehide',()=>{clearTimeout(answerTimer);clearTimeout(draftTimer);if(!loading)persist().catch(()=>{})});
    refresh();draw();
  }
  window.CommandCentreSchoolbookPractice={bind,refresh,open};
})();
