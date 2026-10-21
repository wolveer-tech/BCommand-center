import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/ai-keys.js','utf8'),settle=()=>new Promise(resolve=>setImmediate(resolve));
function client(fetch){
  const elements=new Map(),listeners=new Map();
  for(const id of ['aiKeyStatus','aiKeysSave','aiKeysSecure','aiKeysAutomatic','aiKeysAccount','aiKeyRemove-deepseek','aiKeyRemove-qwen','settingsDeepSeek','settingsDeepSeekModel','settingsDeepSeekEffort','settingsQwen','settingsQwenModel','practiceProvider'])elements.set(id,{value:'',checked:true,addEventListener(){}});
  elements.get('settingsDeepSeekModel').value='deepseek-flash';elements.get('settingsDeepSeekEffort').value='high';elements.get('settingsQwenModel').value='qwen3.7-plus';
  const state={deepSeekKey:'',qwenKey:''},account={accountId:'account-a'},events=new EventTarget();let saves=0;
  const window={CommandCentreAccounts:account,addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
  const context=vm.createContext({window,state,Event,AbortSignal,fetch,saveState:()=>{saves++},document:{getElementById:id=>elements.get(id),addEventListener:(name,fn)=>listeners.set(name,fn)}});
  vm.runInContext(source,context);listeners.get('DOMContentLoaded')();
  return {api:window.CommandCentreAIKeys,state,account,elements,events,get saves(){return saves}};
}
test('secure settings save once, keep failed input out of state, and never download credentials to a phone',async()=>{
  let providers={deepseek:{configured:false},qwen:{configured:false}},fail=false,calls=[];
  const fetch=async(url,init)=>{calls.push({url,init});if(init.method==='PUT'){
    if(fail)return Response.json({error:'Please retry later.'},{status:503});
    const payload=JSON.parse(init.body);assert.equal(payload.accountId,'account-a');
    for(const name of ['deepseek','qwen'])if(payload[name])providers[name]={configured:true,model:payload[name].model,...(payload[name].effort?{effort:payload[name].effort}:{})};
  }return Response.json({accountId:'account-a',providers})};
  const laptop=client(fetch);await settle();laptop.api.open();await settle();
  laptop.elements.get('settingsDeepSeek').value='sk-disposable-key-only';fail=true;
  assert.equal(await laptop.api.beforeSave(),false);assert.equal(laptop.state.deepSeekKey,'');assert.equal(laptop.saves,0);assert.equal(laptop.elements.get('settingsDeepSeek').value,'sk-disposable-key-only');
  fail=false;assert.equal(await laptop.api.beforeSave(),true);assert.equal(laptop.saves,1);assert.equal(laptop.state.deepSeekKey,'');assert.equal(laptop.elements.get('settingsDeepSeek').value,'');assert.equal(laptop.api.has('deepseek'),true);assert.equal(laptop.state.schoolbookProvider,'auto');
  const phone=client(fetch);await settle();assert.equal(phone.api.has('deepseek'),true);assert.equal(phone.state.deepSeekKey,'');assert.equal(phone.elements.get('settingsDeepSeek').value,'');assert.equal(phone.state.deepSeekModel,'deepseek-flash');
  assert.ok(calls.filter(c=>c.init.method==='GET').every(c=>!c.init.body));
  assert.ok(!JSON.stringify(phone.api.status).includes('sk-disposable'));
  phone.api.open();await settle();phone.account.accountId='account-b';
  phone.events.dispatchEvent(new Event('cc-accountchange'));assert.equal(phone.api.has('deepseek'),false);
  phone.elements.get('settingsDeepSeek').value='sk-another-test-key';assert.equal(await phone.api.save(),false,'account changes require reopening settings');
});
test('a late status response from the old account cannot configure the new account',async()=>{
  let resolveOld;
  const c=client((url,init)=>init.headers['x-ai-account']==='account-a'?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve(Response.json({accountId:'account-b',providers:{deepseek:{configured:false},qwen:{configured:false}}})));
  c.account.accountId='account-b';c.events.dispatchEvent(new Event('cc-accountchange'));await settle();
  resolveOld(Response.json({accountId:'account-a',providers:{deepseek:{configured:true,model:'deepseek-flash',effort:'max'},qwen:{configured:false}}}));await settle();
  assert.equal(c.api.status.accountId,'account-b');assert.equal(c.api.has('deepseek'),false);assert.equal(c.state.deepSeekKey,'');
});
