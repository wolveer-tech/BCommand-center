import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleAccounts} from '../accounts.js';
import {handleAIVault,readAIKey} from '../ai-vault.js';
import {handleSchoolbookAI} from '../schoolbook-ai.js';

test('account vault encrypts credentials, shares status across devices, isolates accounts and routes one paid request',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'ai-vault-test',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-31',d1Databases:{DB:'ai-vault-test'}}));
  t.after(()=>mf.dispose());
  const env={DB:await mf.getD1Database('DB'),AI_VAULT_KEY:randomBytes(32).toString('base64'),ACCOUNT_INVITE_CODE:'test-ai-vault-invite-code'};
  for(const file of ['0013_accounts.sql','0014_ai_vault.sql'])for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
  const credentials={username:'vaultstudent',password:'a-long-vault-password-123',code:env.ACCOUNT_INVITE_CODE};
  async function login(path,body){const response=await handleAccounts(new Request('https://centre.test/api/accounts/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env);assert.ok(response.ok);return {cookie:response.headers.get('set-cookie').split(';')[0],id:(await response.json()).account.id}}
  const laptop=await login('register',credentials),phone=await login('login',credentials),other=await login('register',{...credentials,username:'vaultother'});
  const keys={deepseek:'sk-disposable-deepseek-only',qwen:'sk-sp-disposable-qwen-only'};
  async function vault({method='GET',body,path='',device=laptop,headers={},bindings=env,status=200}={}){
    const response=await handleAIVault(new Request('https://centre.test/api/accounts/ai-keys'+path,{method,headers:{...(device?{cookie:device.cookie,'x-ai-account':device.id}:{}),'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),bindings),data=await response.json();
    assert.equal(response.status,status,JSON.stringify(data));assert.equal(response.headers.get('cache-control'),'no-store');for(const key of Object.values(keys))assert.ok(!JSON.stringify(data).includes(key));return data;
  }
  await vault({device:null,status:401});await vault({headers:{origin:'https://attacker.test'},status:403});
  await vault({headers:{'sec-fetch-site':'cross-site'},status:403});await vault({method:'POST',status:405});
  assert.equal((await vault()).providers.deepseek.configured,false);
  await vault({method:'PUT',body:{accountId:other.id,deepseek:{key:keys.deepseek}},status:409});
  await vault({method:'PUT',body:{accountId:laptop.id,deepseek:{key:'bad'}},status:400});
  await vault({method:'PUT',body:{accountId:laptop.id,deepseek:{key:'x'.repeat(4100)}},status:413});
  await vault({method:'PUT',body:{accountId:laptop.id,deepseek:{key:keys.deepseek,model:'deepseek-v4-pro',effort:'max'},qwen:{key:keys.qwen,model:'qwen3.8-flash'}}});
  const status=await vault({device:phone});assert.equal(status.accountId,laptop.id);assert.equal(status.providers.deepseek.model,'deepseek-v4-pro');assert.equal(status.providers.deepseek.effort,'max');assert.equal(status.providers.qwen.configured,true);
  const rows=(await env.DB.prepare('SELECT * FROM account_ai_keys').all()).results;assert.equal(rows.length,2);
  for(const row of rows){assert.equal(Buffer.from(row.iv,'base64').length,12);assert.ok(!JSON.stringify(row).includes('sk-'));assert.equal(Object.hasOwn(row,'key'),false)}
  assert.equal((await vault({device:other})).providers.deepseek.configured,false);
  assert.equal((await readAIKey(env,laptop.id,'deepseek')).key,keys.deepseek);
  await vault({method:'PUT',body:{accountId:laptop.id,deepseek:{model:'deepseek-flash',effort:'high'}}});
  assert.equal((await readAIKey(env,laptop.id,'deepseek')).key,keys.deepseek);
  const before=await readAIKey(env,laptop.id,'deepseek');
  await vault({method:'PUT',body:{accountId:laptop.id,deepseek:{model:'deepseek-v4-pro'},qwen:{model:'made-up'}},status:400});
  assert.equal((await readAIKey(env,laptop.id,'deepseek')).model,before.model,'invalid partial updates are atomic');
  await vault({bindings:{...env,AI_VAULT_KEY:randomBytes(32).toString('base64')},status:503});
  const ds=rows.find(r=>r.provider==='deepseek');
  await env.DB.prepare('INSERT INTO account_ai_keys VALUES(?,?,?,?,?)').bind(other.id,'deepseek',ds.sealed,ds.iv,ds.updated_at).run();
  await vault({device:other,status:503});
  await env.DB.prepare('DELETE FROM account_ai_keys WHERE account_id=?').bind(other.id).run();
  await vault({method:'DELETE',path:'/qwen',headers:{'x-ai-account':other.id},status:409});
  await vault({method:'DELETE',path:'/qwen',bindings:{...env,AI_VAULT_KEY:''},status:503});
  assert.equal((await vault()).providers.qwen.configured,true);

  const lesson='Cash increases are debits. Cash decreases are credits. Rent paid reduces cash.',source={title:'Accounting',subject:'Accounting',pages:[{number:1,id:'p1',text:lesson,images:[]}]},options={format:'written',count:5,target:3,level:'A-level / Higher'};
  const question={type:'written',question:'Calculate cash after receiving 500 and paying rent of 80.',difficulty:3,skill:'Apply',points:['Identify debit','Identify credit'],options:[],correctIndex:null,optionExplanations:[],modelAnswer:'Cash remaining is 420.',hint:'Subtract the payment.',sources:[{page:1,quote:lesson}]};
  let calls=[],result={questions:Array.from({length:5},(_,i)=>({...question,question:question.question+' Task '+(i+1)}))},code=200;
  t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return Response.json(code===200?{choices:[{finish_reason:'stop',message:{reasoning_content:'private thinking must be ignored',content:JSON.stringify(result)}}]}:{error:{message:keys.deepseek}}, {status:code})});
  async function practice(provider,kind,body,{device=phone,status=200}={}){
    const response=await handleSchoolbookAI(new Request(`https://centre.test/api/accounts/practice/${provider}/${kind}`,{method:'POST',headers:{cookie:device.cookie,'content-type':'application/json'},body:JSON.stringify(body)}),env),data=await response.json();assert.equal(response.status,status,JSON.stringify(data));assert.equal(response.headers.get('cache-control'),'no-store');for(const key of Object.values(keys))assert.ok(!JSON.stringify(data).includes(key));return data;
  }
  const generated=await practice('auto','generate',{source,options});assert.equal(generated.ai.provider,'qwen');assert.equal(generated.ai.keySource,'account');assert.equal(calls.length,1);assert.match(calls[0].url,/token-plan\.maas\.qwencloudapi\.com/);assert.equal(calls[0].body.model,'qwen3.8-flash');assert.equal(calls[0].init.redirect,'manual');assert.ok(!JSON.stringify(calls[0].body).includes(keys.qwen));
  result={awarded:[1,1],feedback:'Both steps are correct.',improvements:[]};
  const marked=await practice('auto','mark',{question,answer:'Debit cash 500, credit cash 80. Balance 420.'});assert.equal(marked.ai.provider,'deepseek');assert.equal(marked.score,2);assert.equal(calls.length,2);assert.equal(calls.at(-1).url,'https://api.deepseek.com/chat/completions');assert.equal(calls.at(-1).body.reasoning_effort,'high');assert.equal(calls.at(-1).init.headers.authorization,'Bearer '+keys.deepseek);
  await practice('auto','generate',{source,options},{device:other,status:400});assert.equal(calls.length,2);
  code=401;await practice('auto','mark',{question,answer:'An answer.'},{status:502});assert.equal(calls.length,3,'provider failure must not trigger another paid request');code=200;
  await vault({method:'PUT',body:{accountId:laptop.id,deepseek:{model:'deepseek-v4-pro',effort:'max'}}});
  const photos={...source,pages:[{...source.pages[0],images:['data:image/png;base64,AA==']}]};
  await practice('deepseek','generate',{source:photos,options},{status:400});assert.equal(calls.length,3);
  await vault({method:'DELETE',path:'/qwen'});
  result={questions:Array.from({length:5},(_,i)=>({...question,question:question.question+' Task '+(i+1)}))};
  const fallback=await practice('auto','generate',{source:photos,options});assert.equal(fallback.ai.model,'deepseek-flash');assert.match(fallback.ai.reason,/Pro cannot read images/);assert.equal((await readAIKey(env,laptop.id,'deepseek')).model,'deepseek-v4-pro');assert.equal(calls.length,4);
  await env.DB.prepare('INSERT INTO account_attempts VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET attempts=excluded.attempts,expires_at=excluded.expires_at').bind('schoolbook:day:'+laptop.id,150,Date.now()+86400000).run();
  await practice('auto','generate',{source,options},{status:429});assert.equal(calls.length,4);
  await env.DB.prepare('DELETE FROM account_attempts WHERE scope=?').bind('ai-key-settings:'+laptop.id).run();
  await env.DB.prepare('INSERT INTO account_attempts VALUES(?,?,?)').bind('ai-key-settings:'+laptop.id,20,Date.now()+3600000).run();
  await vault({method:'DELETE',path:'/deepseek',status:429});assert.equal((await vault()).providers.deepseek.configured,true);
});
