import {authenticateAccount} from './accounts.js';
import './public/schoolbook-providers.js';

const encoder=new TextEncoder(),providers=globalThis.CommandCentreSchoolbookProviders;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const names=['deepseek','qwen'];
async function master(env){
  try{const raw=bytes(env.AI_VAULT_KEY||'');if(raw.length!==32)throw 0;return await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}
  catch{fail(503,'Secure AI key storage is not configured. Ask the app owner to finish setup.')}
}
export async function readAIKey(env,accountId,provider){
  const key=await master(env),row=await env.DB.prepare('SELECT sealed,iv,updated_at FROM account_ai_keys WHERE account_id=? AND provider=?').bind(accountId,provider).first();
  if(!row)return null;
  try{
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(row.iv),additionalData:encoder.encode(`cc-ai-key:v1:${accountId}:${provider}`)},key,bytes(row.sealed));
    return {...JSON.parse(new TextDecoder().decode(plain)),updatedAt:row.updated_at};
  }catch{fail(503,'A saved AI key could not be unlocked. Ask the app owner to check secure storage; do not replace its encryption key.')}
}
export async function aiKeyStatus(env,accountId){
  const rows={};
  for(const name of names){const row=await readAIKey(env,accountId,name);rows[name]=row?{configured:true,model:row.model,...(name==='deepseek'?{effort:row.effort}:{}),updatedAt:row.updatedAt}:{configured:false}}
  return {available:true,accountId,providers:rows};
}
async function body(request){
  if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'Use a JSON request.');
  const reader=request.body?.getReader();if(!reader)fail(400,'Enter an AI key first.');const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();fail(413,'AI key settings are too large.')}chunks.push(value)}
  const all=new Uint8Array(length);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}
  try{const data=JSON.parse(new TextDecoder().decode(all));if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data}catch{fail(400,'Use valid AI key settings.')}
}
async function rate(env,accountId){
  const now=Date.now(),row=await env.DB.prepare(`INSERT INTO account_attempts(scope,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN account_attempts.expires_at<=? THEN 1 ELSE account_attempts.attempts+1 END,expires_at=CASE WHEN account_attempts.expires_at<=? THEN excluded.expires_at ELSE account_attempts.expires_at END RETURNING attempts`).bind('ai-key-settings:'+accountId,now+3600000,now,now).first();
  if(row.attempts>20)fail(429,'Too many AI key changes. Try again later.');
}
export async function handleAIVault(request,env){
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  try{
    const url=new URL(request.url);
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Open AI key settings from this app.');
    if(!env.DB)fail(503,'Account storage is not configured.');
    const user=await authenticateAccount(request,env),path=url.pathname.slice('/api/accounts/ai-keys'.length);
    if(request.method==='GET'&&path==='')return reply(await aiKeyStatus(env,user.id));
    if(request.method==='DELETE'&&names.includes(path.slice(1))){
      if(request.headers.get('x-ai-account')!==user.id)fail(409,'Your signed-in account changed. Reopen Settings before removing a key.');
      await master(env);await rate(env,user.id);await env.DB.prepare('DELETE FROM account_ai_keys WHERE account_id=? AND provider=?').bind(user.id,path.slice(1)).run();return reply(await aiKeyStatus(env,user.id));
    }
    if(request.method!=='PUT'||path!=='')fail(405,'Use the AI key settings controls.');
    const data=await body(request),key=await master(env),updates=[];
    if(data.accountId!==user.id)fail(409,'Your signed-in account changed. Reopen Settings before saving a key.');
    for(const name of names){
      const raw=data[name];if(raw===undefined)continue;if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(400,'Use valid AI key settings.');
      const old=await readAIKey(env,user.id,name),supplied=raw.key===undefined?'':String(raw.key).trim(),credential=supplied||old?.key;
      if(!credential){if(raw.key)fail(400,'Enter a valid API key.');continue}
      if(!/^sk-[A-Za-z0-9_-]{8,240}$/.test(credential))fail(400,`Enter a valid ${name==='qwen'?'QwenCloud':'DeepSeek'} API key.`);
      if(name==='deepseek'&&((raw.model!==undefined&&!['deepseek-flash','deepseek-v4-pro'].includes(raw.model))||(raw.effort!==undefined&&!['instant','high','max'].includes(raw.effort))))fail(400,'Choose a supported DeepSeek model and reasoning level.');
      if(name==='qwen'&&raw.model!==undefined&&!providers.qwenModels.includes(raw.model))fail(400,'Choose a supported QwenCloud model.');
      const config=name==='deepseek'?providers.deepSeekConfig({deepSeekModel:raw.model||old?.model,deepSeekEffort:raw.effort||old?.effort}):providers.qwenConfig({qwenModel:raw.model||old?.model});
      const iv=crypto.getRandomValues(new Uint8Array(12)),sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`cc-ai-key:v1:${user.id}:${name}`)},key,encoder.encode(JSON.stringify({key:credential,...config})));
      updates.push(env.DB.prepare('INSERT INTO account_ai_keys(account_id,provider,sealed,iv,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id,provider) DO UPDATE SET sealed=excluded.sealed,iv=excluded.iv,updated_at=excluded.updated_at').bind(user.id,name,base64(sealed),base64(iv),Date.now()));
    }
    if(!updates.length)fail(400,'Enter at least one API key, or update the settings of a saved key.');
    await rate(env,user.id);await env.DB.batch(updates);return reply(await aiKeyStatus(env,user.id));
  }catch(error){return reply({error:error.status?error.message:/no such table/.test(error.message)?'Run migration 0014_ai_vault.sql to enable secure AI keys.':'Secure AI key settings are unavailable. Your existing keys are unchanged.'},error.status||503)}
}
