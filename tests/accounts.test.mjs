import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleAccounts} from '../accounts.js';

test('invite-only accounts and conflict-safe, private note sync with local D1/R2',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'accounts-test',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-31',d1Databases:{DB:'accounts-test'},r2Buckets:['TRANSFER_FILES']}));
  t.after(()=>mf.dispose());
  const env={DB:await mf.getD1Database('DB'),TRANSFER_FILES:await mf.getR2Bucket('TRANSFER_FILES'),ACCOUNT_INVITE_CODE:'test-invite-code-keep-private',ACCOUNT_MAX_USERS:3};
  for(const sql of (await readFile('migrations/0013_accounts.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
  async function call(path,{method,body,cookie,origin,status=200}={}){
    const response=await handleAccounts(new Request('https://centre.test/api/accounts'+path,{method:method||(body?'POST':'GET'),headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined}),env);
    const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return {data,cookie:response.headers.get('set-cookie')?.split(';')[0],response};
  }
  const credentials={username:'student',password:'a-long-password-123',code:env.ACCOUNT_INVITE_CODE};
  await call('/me',{status:401});
  await call('/register',{body:{...credentials,code:'wrong'},status:403});
  await call('/register',{body:credentials,origin:'https://attacker.test',status:403});
  const first=await call('/register',{body:credentials,status:201}),cookie=first.cookie;
  assert.match(first.response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.ok(!JSON.stringify(first.data).includes('password'));
  const row=await env.DB.prepare('SELECT password_hash,salt FROM accounts WHERE username=?').bind('student').first();assert.notEqual(row.password_hash,credentials.password);assert.equal(row.password_hash.length,64);
  await call('/login',{body:{...credentials,password:'wrong-password-123'},status:401});
  const secondDevice=await call('/login',{body:credentials});
  const other=await call('/register',{body:{...credentials,username:'another'},status:201});
  const photo='data:image/jpeg;base64,'+Buffer.from('stored photo bytes').toString('base64');
  const book={id:'note-book',title:'Biology',body:'Cells',folder:'School',kind:'schoolbook',subject:'Biology',paper:'lined',coverColor:'#466454',pages:[{id:'page-1',title:'Cells',body:`<p>Cell notes</p><img src="${photo}">`,createdAt:'2026-10-12'}],updatedAt:'2026-10-12T10:00:00Z'};
  await call('/notes/note-book',{method:'PUT',cookie,body:{revision:0,note:book}});
  const downloaded=(await call('/notes/note-book',{cookie:secondDevice.cookie})).data;assert.equal(downloaded.revision,1);assert.equal(downloaded.note.pages[0].body,book.pages[0].body);
  assert.equal((await call('/notes',{cookie:other.cookie})).data.notes.length,0);
  await call('/notes/note-book',{cookie:other.cookie,status:404});
  const writes=await Promise.all([1,2].map(async index=>{
    const response=await handleAccounts(new Request('https://centre.test/api/accounts/notes/note-book',{method:'PUT',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({revision:1,note:{...book,title:'Edit '+index}})}),env);return response.status;
  }));assert.deepEqual(writes.sort(),[200,409]);
  await call('/notes/note-book',{method:'PUT',cookie,body:{revision:1,note:book},status:409});
  await call('/notes/note-book',{method:'PUT',cookie,body:{revision:2,note:{...book,deletedAt:'2026-10-12',purged:true}}});
  assert.equal((await call('/notes/note-book',{cookie:secondDevice.cookie})).data.note.purged,true);
  await call('/notes/another-id',{method:'PUT',cookie,body:{revision:0,note:book},status:400});
  await call('/notes/note-book',{method:'PUT',cookie,body:{revision:3,note:{...book,body:'x'.repeat(9*1024*1024)}},status:413});
  const lib=globalThis.CommandCentreMangaLibrary;
  const manga={id:'/comics/a-story',source:'asura',title:'A story',url:'https://asurascans.com/comics/a-story',savedAt:Date.now()};
  const chapter={...manga,chapter:{id:'/comics/a-story/chapter/1',chapter:'1',url:'https://asurascans.com/comics/a-story/chapter/1'},readAt:Date.now(),page:4,pageCount:12,language:'en'};
  assert.equal((await call('/collections/manga',{cookie})).data.revision,0);
  await call('/collections/manga',{cookie,method:'PUT',body:{revision:0,library:{favourites:[manga],history:[chapter]}}});
  const phone=(await call('/collections/manga',{cookie:secondDevice.cookie})).data;
  assert.equal(phone.library.history[0].page,4);assert.equal(phone.revision,1);
  assert.equal((await call('/collections/manga',{cookie:other.cookie})).data.library.history.length,0);
  assert.equal((await call('/notes',{cookie})).data.notes.length,1,'collections must not appear as notes');
  await call('/notes/__cc_manga_library_v1',{cookie,status:400});
  await call('/collections/manga',{cookie,method:'PUT',body:{revision:0,library:{}},status:409});
  const removed=lib.remove(phone.library,'favourites',manga);
  await call('/collections/manga',{cookie:secondDevice.cookie,method:'PUT',body:{revision:1,library:removed}});
  const pc=(await call('/collections/manga',{cookie})).data;
  assert.equal(lib.merge(pc.library,phone.library).favourites.length,0,'an offline PC must not resurrect a phone deletion');
  assert.equal(pc.library.history[0].page,4);
  const libraryWrites=await Promise.all([5,9].map(async page=>{
    const response=await handleAccounts(new Request('https://centre.test/api/accounts/collections/manga',{method:'PUT',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({revision:2,library:lib.merge(pc.library,{history:[{...chapter,page,readAt:Date.now()+page}]})})}),env);return response.status;
  }));assert.deepEqual(libraryWrites.sort(),[200,409]);
  await call('/collections/manga',{cookie,method:'PUT',body:{revision:-1,library:{}},status:400});
  await call('/collections/manga',{cookie,method:'PUT',body:{revision:3,library:{}},origin:'https://attacker.test',status:403});
  const cap=await Promise.all(['last-one','last-two'].map(async username=>{const response=await handleAccounts(new Request('https://centre.test/api/accounts/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...credentials,username})}),env);return response.status;}));assert.deepEqual(cap.sort(),[201,409]);
  await call('/logout',{cookie,body:{}});await call('/me',{cookie,status:401});
  assert.equal((await call('/me',{cookie:secondDevice.cookie})).data.account.username,'student');
  for(let i=0;i<20;i++)await handleAccounts(new Request('https://centre.test/api/accounts/login',{method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':'198.51.100.5'},body:JSON.stringify({username:'brute',password:'wrong-password-123'})}),env);
  await call('/login',{body:{username:'brute',password:'wrong-password-123'},status:429});
});
