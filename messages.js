import { authenticateTransferDevice, readTransferJSON, createTransferDevice } from './transfers.js';

const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
const first = (env,sql,...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env,sql,...args) => env.DB.prepare(sql).bind(...args).run();
const rows = async (env,sql,...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value || '');
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');

export function generatePairingCode() {
  // Rejection sampling avoids modulo bias. Leading zeroes are significant.
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= 4000000000);
  return String(random[0] % 1000000000).padStart(9,'0');
}

async function limitClaim(request,env) {
  const now=Date.now(),window=Math.floor(now/300000),ip=request.headers.get('CF-Connecting-IP') || 'unknown';
  // Both limits are atomic and shared across Worker instances, not in-memory counters.
  const scopes=[['global:'+window,120,300000],['ip:'+await digest(ip)+':'+Math.floor(now/60000),8,60000]];
  for(const [scope,limit,period] of scopes){
    const record=await first(env,`INSERT INTO message_pair_limits(scope,attempts,expires_at) VALUES(?,1,?)
      ON CONFLICT(scope) DO UPDATE SET attempts=attempts+1 RETURNING attempts`,scope,now+period);
    if(record.attempts>limit)fail(429,'Too many pairing attempts. Wait a few minutes, then try again.');
  }
}

async function peer(env,id,current,allowRevoked=false) {
  if(!uuid(id)||id===current.id)fail(400,'Choose another device to message.');
  const result=await first(env,'SELECT id,name,revoked_at FROM transfer_devices WHERE id=?',id);
  if(!result)fail(404,'That device is unavailable.');
  if(result.revoked_at&&!allowRevoked)fail(410,'This device has been disconnected. Pair it again to send messages.');
  return result;
}

export async function handleMessages(request,env,ctx,sendOne) {
  const url=new URL(request.url),path=url.pathname.slice('/api/messages'.length),method=request.method;
  const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type','x-content-type-options':'nosniff'};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(method==='OPTIONS')return new Response(null,{status:204,headers});
  try{
    if(!env.DB)fail(503,'D1 is not configured.');
    if(path==='/claim'&&method==='POST'){
      await limitClaim(request,env);
      const data=await readTransferJSON(request),code=String(data.code||'').replace(/[\s-]/g,'');
      if(!/^\d{9}$/.test(code))fail(400,'Enter all 9 digits of the code.');
      let current=null;
      if(request.headers.has('authorization'))current=await authenticateTransferDevice(request,env);
      const name=String(data.name||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,60);
      if(!current&&!name)fail(400,'Give this device a name.');
      if(!current){const count=await first(env,'SELECT COUNT(*) n FROM transfer_devices WHERE revoked_at IS NULL');if(count.n>=30)fail(409,'Remove an old device in Transfers before connecting another.');}
      const invite=await first(env,`DELETE FROM message_pairings WHERE code_hash=? AND expires_at>?
        AND created_by<>? AND created_by IN (SELECT id FROM transfer_devices WHERE revoked_at IS NULL)
        RETURNING created_by`,await digest(code),Date.now(),current?.id||'');
      if(!invite)fail(400,'That code is invalid, expired, already used or belongs to this device.');
      const result=current?{device:{id:current.id,name:current.name}}:await createTransferDevice(env,name);
      return reply({...result,peerId:invite.created_by},201);
    }
    const device=await authenticateTransferDevice(request,env);
    if(path==='/pair'&&method==='POST'){
      // One active invitation per device; a replacement invalidates the old code.
      for(let attempt=0;attempt<4;attempt++){
        const code=generatePairingCode(),expiresAt=Date.now()+300000;
        try{
          await run(env,`INSERT INTO message_pairings(created_by,code_hash,expires_at) VALUES(?,?,?)
            ON CONFLICT(created_by) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at`,device.id,await digest(code),expiresAt);
          return reply({code:code.match(/.{3}/g).join(' '),expiresAt});
        }catch(e){if(!String(e.message).includes('UNIQUE'))throw e;}
      }
      fail(503,'Could not create a code. Try again.');
    }
    if(path==='/pair/cancel'&&method==='POST'){await run(env,'DELETE FROM message_pairings WHERE created_by=?',device.id);return reply({ok:true});}
    if(path==='/chats'&&method==='GET'){
      const chats=await rows(env,`WITH relevant AS (
        SELECT id,CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END AS peer_id
        FROM device_messages WHERE sender_id=? OR recipient_id=?
      ), latest AS (SELECT peer_id,MAX(id) AS message_id FROM relevant GROUP BY peer_id),
      unread AS (SELECT m.sender_id,COUNT(*) AS n FROM device_messages m
        LEFT JOIN message_reads r ON r.device_id=m.recipient_id AND r.peer_id=m.sender_id
        WHERE m.recipient_id=? AND m.id>COALESCE(r.last_read_id,0) GROUP BY m.sender_id)
      SELECT d.id,d.name,d.revoked_at,m.id AS last_id,m.body AS last_body,m.kind AS last_kind,
        m.created_at AS last_at,m.sender_id AS last_sender,COALESCE(u.n,0) AS unread
      FROM transfer_devices d LEFT JOIN latest l ON l.peer_id=d.id
        LEFT JOIN device_messages m ON m.id=l.message_id LEFT JOIN unread u ON u.sender_id=d.id
      WHERE d.id<>? AND (d.revoked_at IS NULL OR l.message_id IS NOT NULL)
      ORDER BY COALESCE(m.id,0) DESC,d.created_at`,device.id,device.id,device.id,device.id,device.id);
      return reply({device:{id:device.id,name:device.name},chats});
    }
    const match=path.match(/^\/chats\/([a-f0-9-]{36})(?:\/(read))?$/i);
    if(match){
      const [,peerId,action]=match;
      const other=await peer(env,peerId,device,method==='GET'||action==='read');
      if(!action&&method==='GET'){
        const before=Number(url.searchParams.get('before')||0),after=Number(url.searchParams.get('after')||0);
        if(!Number.isSafeInteger(before)||before<0||!Number.isSafeInteger(after)||after<0||before&&after)fail(400,'Invalid message cursor.');
        const args=[device.id,peerId,peerId,device.id];let cursor='';
        if(before){cursor=' AND id<?';args.push(before);}if(after){cursor=' AND id>?';args.push(after);}
        const result=await rows(env,`SELECT id,client_id,sender_id,recipient_id,body,kind,created_at FROM device_messages
          WHERE ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))${cursor}
          ORDER BY id ${after?'ASC':'DESC'} LIMIT 61`,...args);
        const hasMore=result.length>60,page=result.slice(0,60);if(!after)page.reverse();
        return reply({peer:other,messages:page,hasMore});
      }
      if(!action&&method==='POST'){
        const data=await readTransferJSON(request),content=String(data.body||'').trim(),clientId=String(data.clientId||'');
        if(!content||content.length>20000)fail(400,'Write a message of up to 20,000 characters.');
        if(!uuid(clientId))fail(400,'A valid message ID is required.');
        // Only a whole http(s) URL is a link; ordinary text may contain multiple links.
        let kind='message';try{const link=new URL(content);if(/^https?:$/.test(link.protocol)&&!/[\s]/.test(content))kind='link';}catch{}
        const statements=[
          env.DB.prepare(`INSERT INTO device_messages(client_id,sender_id,recipient_id,body,kind,created_at) VALUES(?,?,?,?,?,?)
            ON CONFLICT(sender_id,client_id) DO NOTHING`).bind(clientId,device.id,peerId,content,kind,Date.now()),
          env.DB.prepare(`INSERT OR IGNORE INTO message_deliveries(message_id,recipient_id,next_try)
            SELECT id,recipient_id,? FROM device_messages WHERE sender_id=? AND client_id=? AND recipient_id=? AND body=?`).bind(Date.now(),device.id,clientId,peerId,content)
        ];
        await env.DB.batch(statements);
        const message=await first(env,'SELECT * FROM device_messages WHERE sender_id=? AND client_id=?',device.id,clientId);
        if(message.recipient_id!==peerId||message.body!==content)fail(409,'This message ID has already been used.');
        ctx.waitUntil(flushMessagePushes(env,sendOne));return reply({message},201);
      }
      if(action==='read'&&method==='POST'){
        const data=await readTransferJSON(request),through=Number(data.through);
        if(!Number.isSafeInteger(through)||through<0)fail(400,'Invalid read position.');
        // Clamp to a real message received in this chat; callers cannot suppress future alerts.
        const seen=await first(env,'SELECT MAX(id) last_id FROM device_messages WHERE recipient_id=? AND sender_id=? AND id<=?',device.id,peerId,through);
        if(seen.last_id)await run(env,`INSERT INTO message_reads(device_id,peer_id,last_read_id) VALUES(?,?,?)
          ON CONFLICT(device_id,peer_id) DO UPDATE SET last_read_id=MAX(last_read_id,excluded.last_read_id)`,device.id,peerId,seen.last_id);
        return reply({ok:true});
      }
    }
    return reply({error:'Unknown Messages endpoint.'},404);
  }catch(e){
    const migration=/no such table: (device_messages|message_|transfer_devices)/.test(e.message||'');
    return reply({error:migration?'Run migrations/0009_messages.sql in your existing D1 database, then refresh Messages.':e.status?e.message:'Messages could not finish this request. Please retry.'},migration?503:e.status||500);
  }
}

export async function flushMessagePushes(env,sendOne){
  if(!env.DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return;
  try{
    const pending=await rows(env,`SELECT o.message_id,o.recipient_id,d.push_subscription,m.sender_id
      FROM message_deliveries o JOIN device_messages m ON m.id=o.message_id
      JOIN transfer_devices d ON d.id=o.recipient_id
      LEFT JOIN message_reads r ON r.device_id=o.recipient_id AND r.peer_id=m.sender_id
      WHERE o.sent_at IS NULL AND o.attempts<5 AND o.next_try<=? AND m.created_at>?
        AND d.revoked_at IS NULL AND d.push_subscription IS NOT NULL AND m.id>COALESCE(r.last_read_id,0) LIMIT 30`,Date.now(),Date.now()-86400000);
    for(const delivery of pending){
      const claimed=await first(env,`UPDATE message_deliveries SET attempts=attempts+1,next_try=?
        WHERE message_id=? AND sent_at IS NULL AND next_try<=? RETURNING message_id`,Date.now()+120000,delivery.message_id,Date.now());
      if(!claimed)continue;
      try{
        const sub=JSON.parse(delivery.push_subscription);
        await sendOne({endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth:sub.keys.auth,title:'Command Centre Messages',body:'You have a new message.',url:'/#messages/'+delivery.sender_id,id:'chat-'+delivery.sender_id},env);
        await run(env,'UPDATE message_deliveries SET sent_at=? WHERE message_id=?',Date.now(),delivery.message_id);
      }catch{console.error('Message notification will retry',delivery.message_id);}
    }
  }catch{ /* The old app keeps working before migration 0009 is applied. */ }
}

export async function cleanMessages(env){
  if(!env.DB)return;
  try{await env.DB.batch([
    env.DB.prepare('DELETE FROM message_pairings WHERE expires_at<=? OR created_by IN (SELECT id FROM transfer_devices WHERE revoked_at IS NOT NULL)').bind(Date.now()),
    env.DB.prepare('DELETE FROM message_pair_limits WHERE expires_at<=?').bind(Date.now()),
    env.DB.prepare('DELETE FROM message_deliveries WHERE message_id IN (SELECT id FROM device_messages WHERE created_at<?)').bind(Date.now()-86400000)
  ]);}catch{}
}
