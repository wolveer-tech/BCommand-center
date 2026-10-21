/* Account key status contains model preferences only; credentials are never downloaded. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id),account=()=>window.CommandCentreAccounts?.accountId||'';
  const fields=['settingsDeepSeek','settingsDeepSeekModel','settingsDeepSeekEffort','settingsQwen','settingsQwenModel'];
  let cache=null,epoch=0,pending=null,dirty=false,busy=false,openedFor='',message='',seenAccount=null;
  const has=name=>!!account()&&cache?.accountId===account()&&!!cache.providers?.[name]?.configured;
  function draw(){
    if(!$('aiKeyStatus'))return;
    $('aiKeyStatus').textContent=message||(!account()?'Sign in to your app account, then save a key here to use it on your phone.':cache?`Saved to this account: ${['deepseek','qwen'].filter(has).map(n=>n==='qwen'?'QwenCloud':'DeepSeek').join(' and ')||'no AI keys yet'}.`:'Checking saved AI keys…');
    $('aiKeysSave').disabled=busy||!account();
    for(const name of ['deepseek','qwen'])$('aiKeyRemove-'+name).hidden=!has(name);
    for(const id of [...fields,'aiKeysSecure','aiKeysAutomatic','aiKeyRemove-deepseek','aiKeyRemove-qwen'])if($(id))$(id).disabled=busy;
    for(const [name,id] of [['deepseek','settingsDeepSeek'],['qwen','settingsQwen']])$(id).placeholder=has(name)?'Saved securely · enter a replacement key':'Paste your API key';
  }
  function applyPreferences(){
    if(!cache||cache.accountId!==account())return;
    const ds=cache.providers.deepseek,qw=cache.providers.qwen;
    if(ds.configured){state.deepSeekModel=ds.model;state.deepSeekEffort=ds.effort;if(!dirty){$('settingsDeepSeekModel').value=ds.model;$('settingsDeepSeekEffort').value=ds.effort}}
    if(qw.configured){state.qwenModel=qw.model;if(!dirty)$('settingsQwenModel').value=qw.model}
  }
  async function api(method='GET',data=null,path=''){
    const response=await fetch('/api/accounts/ai-keys'+path,{method,credentials:'same-origin',cache:'no-store',headers:{...(data?{'content-type':'application/json'}:{}),'x-ai-account':account()},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(15000)});
    let result;try{result=await response.json()}catch{throw Error('Secure key settings are unavailable. Please reload the app.')}
    if(!response.ok)throw Object.assign(Error(response.status===401?'Sign in to your app account to save AI keys.':result.error||'Could not update secure keys.'),{status:response.status});
    return result;
  }
  async function refresh(){
    const id=account(),token=epoch;
    if(!id){cache=null;message='';draw();return null}
    if(pending)return pending;
    pending=(async()=>{
      try{const data=await api();if(token!==epoch||id!==account()||data.accountId!==id)return null;cache=data;message='';applyPreferences();draw();return cache}
      catch(error){if(token===epoch){if(error.status===401)cache=null;message=error.message;draw()}return null}
      finally{if(token===epoch)pending=null}
    })();
    return pending;
  }
  async function save(){
    if(busy)return false;
    const id=account(),token=epoch;
    try{
      if(!id)throw Error('Sign in to your app account before saving keys securely.');
      if(openedFor!==id)throw Error('Your account changed. Reopen Settings before saving a key.');
      busy=true;draw();
      if(!cache)await refresh();
      if(token!==epoch||id!==account())throw Error('Your account changed. Reopen Settings.');
      const payload={accountId:id};
      for(const [name,input] of [['deepseek','settingsDeepSeek'],['qwen','settingsQwen']]){
        const key=$(input).value.trim();if(!key&&!has(name))continue;
        payload[name]={...(key?{key}:{}),model:$(name==='deepseek'?'settingsDeepSeekModel':'settingsQwenModel').value,...(name==='deepseek'?{effort:$('settingsDeepSeekEffort').value}:{})};
      }
      if(!payload.deepseek&&!payload.qwen)throw Error('Paste at least one API key first.');
      const data=await api('PUT',payload);
      if(token!==epoch||id!==account())return false;
      cache=data;
      if(payload.deepseek){state.deepSeekKey='';$('settingsDeepSeek').value=''}
      if(payload.qwen){state.qwenKey='';$('settingsQwen').value=''}
      if($('aiKeysAutomatic').checked)state.schoolbookProvider='auto';
      dirty=false;applyPreferences();saveState();
      if($('practiceProvider')&&$('aiKeysAutomatic').checked)$('practiceProvider').value='auto';
      message='Saved securely. Sign into this same account on your phone; you won’t need to send the keys.';
      window.dispatchEvent(new Event('cc-aikeyschange'));return true;
    }catch(error){message=error.message;return false}
    finally{busy=false;draw()}
  }
  async function remove(name){
    if(busy||!has(name))return;
    const id=account(),token=epoch;busy=true;draw();
    try{const data=await api('DELETE',null,'/'+name);if(token!==epoch||id!==account())return;cache=data;message='Saved key removed from this account.';window.dispatchEvent(new Event('cc-aikeyschange'))}
    catch(error){message=error.message}finally{busy=false;draw()}
  }
  function open(){openedFor=account();dirty=false;message='';draw();refresh()}
  async function beforeSave(){
    if(busy)return false;
    if(!$('aiKeysSecure').checked)return true;
    const changed=$('settingsDeepSeek').value.trim()!==(state.deepSeekKey||'').trim()||$('settingsQwen').value.trim()!==(state.qwenKey||'').trim();
    return changed||dirty&&(has('deepseek')||has('qwen'))?save():!busy;
  }
  function bind(){
    if(!$('aiKeysSave'))return;
    fields.forEach(id=>$(id).addEventListener('input',()=>{dirty=true}));
    $('aiKeysSave').addEventListener('click',save);
    for(const name of ['deepseek','qwen'])$('aiKeyRemove-'+name).addEventListener('click',()=>remove(name));
    $('aiKeysAccount').addEventListener('click',()=>{closeModal('settingsModal');switchPage('account')});
    window.addEventListener('cc-accountchange',()=>{if(seenAccount===account())return;seenAccount=account();epoch++;pending=null;cache=null;message='';for(const id of ['settingsDeepSeek','settingsQwen'])$(id).value='';draw();refresh()});
    refresh();draw();
  }
  window.CommandCentreAIKeys={bind,open,refresh,save,beforeSave,has,get status(){return cache},get secure(){return !!$('aiKeysSecure')?.checked}};
  document.addEventListener('DOMContentLoaded',bind);
})();
