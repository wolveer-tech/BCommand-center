import './public/manga-library.js';
const encoder=new TextEncoder();
const LIBRARY_ID='__cc_manga_library_v1',mangaLibrary=globalThis.CommandCentreMangaLibrary;
const hex=value=>[...new Uint8Array(value)].map(n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
const COOKIE='cc_account';
export async function passwordHash(password,salt){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:encoder.encode(salt)},key,256));
}
function same(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
async function readJSON(request,max=8*1024*1024+16384){
  if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'Use a JSON request.');
  const reader=request.body?.getReader();if(!reader)fail(400,'Expected a JSON object.');
  const chunks=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();fail(413,'This note is too large (8 MB maximum).');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data;}catch{fail(400,'Expected a JSON object.');}
}
async function rate(request,env,username){
  const now=Date.now();
  for(const value of ['ip:'+(request.headers.get('CF-Connecting-IP')||'local'),'name:'+username]){
    const scope=await hash(value);
    const row=await query(env,`INSERT INTO account_attempts(scope,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN account_attempts.expires_at<=? THEN 1 ELSE account_attempts.attempts+1 END,expires_at=CASE WHEN account_attempts.expires_at<=? THEN excluded.expires_at ELSE account_attempts.expires_at END RETURNING attempts`,scope,now+600000,now,now).first();
    if(row.attempts>20)fail(429,'Too many sign-in attempts. Try again in ten minutes.');
  }
}
export async function authenticateAccount(request,env){
  const token=(request.headers.get('cookie')||'').match(/(?:^|;\s*)cc_account=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!token)fail(401,'Sign in to sync your app data.');
  const row=await query(env,'SELECT a.id,a.username FROM accounts a JOIN account_sessions s ON s.account_id=a.id WHERE s.token_hash=? AND s.expires_at>?',await hash(token),Date.now()).first();
  if(!row)fail(401,'Your session has expired. Sign in again.');return row;
}
const cookie=(token,age)=>`${COOKIE}=${token}; Path=/api/accounts; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
function noteRecord(value,id){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.id!==id)fail(400,'Invalid note record.');
  if(typeof value.body!=='string'||typeof value.title!=='string')fail(400,'A note needs a title and body.');
  const record={id,title:value.title.slice(0,300),body:value.body,folder:String(value.folder||'Notes').slice(0,80),pinned:!!value.pinned,deletedAt:String(value.deletedAt||'').slice(0,40),purged:!!value.purged,createdAt:String(value.createdAt||'').slice(0,40),updatedAt:String(value.updatedAt||'').slice(0,40)};
  if(value.kind==='schoolbook'&&!record.purged){
    if(!Array.isArray(value.pages)||!value.pages.length||value.pages.length>200)fail(400,'A schoolbook needs between 1 and 200 pages.');
    Object.assign(record,{kind:'schoolbook',subject:String(value.subject||'').slice(0,100),coverColor:String(value.coverColor||'').slice(0,10),paper:value.paper==='grid'?'grid':'lined',pages:value.pages.map(p=>({id:String(p.id||'').slice(0,140),title:String(p.title||'').slice(0,200),body:String(p.body||''),createdAt:String(p.createdAt||'').slice(0,40)}))});
  }
  if(record.purged&&!record.deletedAt)fail(400,'A removed note must carry its deletion marker.');
  if(JSON.stringify(record).length>8*1024*1024)fail(413,'This note is too large (8 MB maximum).');return record;
}
export async function handleAccounts(request,env){
  const url=new URL(request.url),path=url.pathname.slice('/api/accounts'.length),method=request.method;
  const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
  const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
  try{
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)fail(403,'Use Accounts from this app.');
    if(!env.DB)fail(503,'Account storage is not configured.');
    if(path==='/status'&&method==='GET')return reply({registration:typeof env.ACCOUNT_INVITE_CODE==='string'&&env.ACCOUNT_INVITE_CODE.length>=16,sync:!!env.TRANSFER_FILES});
    if((path==='/register'||path==='/login')&&method==='POST'){
      const data=await readJSON(request,4096),username=String(data.username||'').trim().toLowerCase(),password=String(data.password||'');
      if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username)||password.length<12||password.length>128)fail(400,'Use a username of 3–40 letters/numbers and a password of 12–128 characters.');
      await rate(request,env,username);
      let user;
      if(path==='/register'){
        if(String(env.ACCOUNT_INVITE_CODE||'').length<16)fail(503,'Invite-only registration needs the ACCOUNT_INVITE_CODE server secret.');
        if(!same(await hash(String(data.code||'')),await hash(env.ACCOUNT_INVITE_CODE)))fail(403,'The invitation code was not accepted.');
        const salt=random(),userId=crypto.randomUUID(),digest=await passwordHash(password,salt),limit=Math.max(1,Math.min(100,Number(env.ACCOUNT_MAX_USERS)||10));
        user=await query(env,'INSERT INTO accounts(id,username,password_hash,salt,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM accounts)<? ON CONFLICT(username) DO NOTHING RETURNING id,username',userId,username,digest,salt,Date.now(),limit).first();
        if(!user)fail(409,'That username is taken or the account limit has been reached.');
      }else{
        const row=await query(env,'SELECT * FROM accounts WHERE username=?',username).first();
        const digest=await passwordHash(password,row?.salt||'missing-user-dummy-salt');
        if(!row||!same(digest,row.password_hash))fail(401,'Username or password was not accepted.');
        user={id:row.id,username:row.username};
      }
      const token=random(),expires=Date.now()+30*86400000;
      await query(env,'INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES(?,?,?)',await hash(token),user.id,expires).run();
      return reply({account:user},path==='/register'?201:200,{'set-cookie':cookie(token,30*86400)});
    }
    const user=await authenticateAccount(request,env);
    if(path==='/me'&&method==='GET')return reply({account:user});
    if(path==='/logout'&&method==='POST'){
      const token=(request.headers.get('cookie')||'').match(/cc_account=([a-f0-9]{64})/)?.[1];
      await query(env,'DELETE FROM account_sessions WHERE token_hash=?',await hash(token)).run();return reply({ok:true},200,{'set-cookie':cookie('',0)});
    }
    if(!env.TRANSFER_FILES)fail(503,'Enable the existing TRANSFER_FILES bucket for account sync.');
    if(path==='/collections/manga'&&method==='GET'){
      const row=await query(env,'SELECT * FROM account_notes WHERE account_id=? AND id=?',user.id,LIBRARY_ID).first();
      if(!row)return reply({library:mangaLibrary.merge(),revision:0});
      const object=await env.TRANSFER_FILES.get(row.object_key);if(!object)fail(409,'Your library just changed. Sync again.');
      return reply({library:mangaLibrary.merge(await object.json()),revision:row.revision});
    }
    if(path==='/collections/manga'&&method==='PUT'){
      const data=await readJSON(request,2*1024*1024),base=Number(data.revision);
      if(!Number.isSafeInteger(base)||base<0||!data.library||typeof data.library!=='object'||Array.isArray(data.library))fail(400,'Invalid library revision or data.');
      const old=await query(env,'SELECT * FROM account_notes WHERE account_id=? AND id=?',user.id,LIBRARY_ID).first();
      if((old?.revision||0)!==base)return reply({error:'Your manga library changed on another device. Sync again to merge both.',conflict:true},409);
      const record=mangaLibrary.merge(data.library),key=`account-library/${user.id}/manga/${crypto.randomUUID()}.json`;
      await env.TRANSFER_FILES.put(key,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
      let changed;
      try{changed=await query(env,`INSERT INTO account_notes(account_id,id,revision,object_key,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(account_id,id) DO UPDATE SET revision=account_notes.revision+1,object_key=excluded.object_key,updated_at=excluded.updated_at WHERE account_notes.revision=? RETURNING revision`,user.id,LIBRARY_ID,key,Date.now(),base).first();}
      catch(error){await env.TRANSFER_FILES.delete(key);throw error;}
      if(!changed){await env.TRANSFER_FILES.delete(key);return reply({error:'Your manga library changed on another device. Sync again.',conflict:true},409);}
      if(old)await env.TRANSFER_FILES.delete(old.object_key).catch(()=>{});
      return reply({revision:changed.revision});
    }
    if(path==='/notes'&&method==='GET'){
      const rows=(await query(env,'SELECT id,revision,updated_at FROM account_notes WHERE account_id=? AND id<>? ORDER BY updated_at',user.id,LIBRARY_ID).all()).results;
      return reply({notes:rows});
    }
    const noteId=path.match(/^\/notes\/([a-zA-Z0-9_.:-]{1,140})$/)?.[1];
    if(noteId===LIBRARY_ID)fail(400,'This identifier is reserved for account collections.');
    if(noteId&&method==='GET'){
      const row=await query(env,'SELECT * FROM account_notes WHERE account_id=? AND id=?',user.id,noteId).first();if(!row)fail(404,'Note unavailable.');
      const object=await env.TRANSFER_FILES.get(row.object_key);if(!object)fail(409,'This note just changed. Sync again.');
      return reply({note:await object.json(),revision:row.revision});
    }
    if(noteId&&method==='PUT'){
      const data=await readJSON(request),record=noteRecord(data.note,noteId),base=Number(data.revision);
      if(!Number.isSafeInteger(base)||base<0)fail(400,'Invalid note revision.');
      const old=await query(env,'SELECT * FROM account_notes WHERE account_id=? AND id=?',user.id,noteId).first();
      if((old?.revision||0)!==base)return reply({error:'This note changed on another device. Both copies will be preserved.',conflict:true},409);
      const key=`account-notes/${user.id}/${noteId}/${crypto.randomUUID()}.json`;
      await env.TRANSFER_FILES.put(key,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
      let changed;
      try{
        changed=await query(env,`INSERT INTO account_notes(account_id,id,revision,object_key,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(account_id,id) DO UPDATE SET revision=account_notes.revision+1,object_key=excluded.object_key,updated_at=excluded.updated_at WHERE account_notes.revision=? RETURNING revision`,user.id,noteId,key,Date.now(),base).first();
      }catch(error){await env.TRANSFER_FILES.delete(key);throw error;}
      if(!changed){await env.TRANSFER_FILES.delete(key);return reply({error:'This note changed on another device. Sync again.',conflict:true},409);}
      if(old)await env.TRANSFER_FILES.delete(old.object_key).catch(()=>{});
      return reply({revision:changed.revision});
    }
    return reply({error:'Account route not found.'},404);
  }catch(error){const status=error.status||(/no such table/.test(error.message)?503:500);return reply({error:status===500?'Account service could not complete this request.':status===503&&!error.status?'Run migrations/0013_accounts.sql to enable accounts.':error.message},status);}
}
