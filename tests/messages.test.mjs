import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleTransfers } from '../transfers.js';
import { handleMessages, flushMessagePushes, cleanMessages, generatePairingCode } from '../messages.js';

test('Messages with real local D1 and existing Transfer devices',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'messages',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-31',d1Databases:{DB:'messages-test'}}));
  t.after(()=>mf.dispose());
  const env={DB:await mf.getD1Database('DB'),TRANSFER_SETUP_KEY:'local-testing-secret-with-over-32-characters'};
  for(const file of ['0008_transfers.sql','0009_messages.sql','0009_messages.sql'])for(const sql of (await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
  const tasks=[],pushes=[],ctx={waitUntil:p=>tasks.push(p)},sendOne=async row=>{pushes.push(row);};let ipNumber=0;
  async function raw(path,{token,body,method,ip,transfer=false}={}){
    return (transfer?handleTransfers:handleMessages)(new Request('https://centre.test/api/'+(transfer?'transfers':'messages')+path,{method:method||(body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json','CF-Connecting-IP':ip||'192.0.2.'+(++ipNumber),...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env,ctx,sendOne);
  }
  async function call(path,opts={}){const response=await raw(path,opts),result=await response.json();assert.equal(response.status,opts.status??200,JSON.stringify(result));return result;}
  const setup=name=>call('/bootstrap',{transfer:true,body:{name,key:env.TRANSFER_SETUP_KEY},status:201});
  const pc=await setup('My PC'),laptop=await setup('My laptop'),third=await setup('Third device');
  const chat=(from,to)=>'/chats/'+to.device.id;
  const send=async(from,to,body,clientId=randomUUID())=>(await call(chat(from,to),{token:from.token,body:{body,clientId},status:201})).message;
  await t.test('existing credentials and devices work without migration of their records',async()=>{
    await call('/chats',{status:401});await call('/pair',{body:{},status:401});await call('/chats',{token:'bad',status:401});
    const result=await call('/chats',{token:pc.token});assert.equal(result.chats.length,2);assert.equal(result.device.id,pc.device.id);assert.ok(!JSON.stringify(result).includes('token_hash'));
    assert.equal((await call('/devices',{transfer:true,token:pc.token})).devices.length,3);
    await call('/chats/'+pc.device.id,{token:pc.token,status:400});
  });
  await t.test('nine digits, one-use race, expiry, cancellation and existing-device claims',async()=>{
    for(let i=0;i<100;i++)assert.match(generatePairingCode(),/^\d{9}$/);
    let invite=await call('/pair',{token:pc.token,body:{}});assert.match(invite.code,/^\d{3} \d{3} \d{3}$/);assert.ok(invite.expiresAt>Date.now()+290000);
    const stored=await env.DB.prepare('SELECT * FROM message_pairings WHERE created_by=?').bind(pc.device.id).first();assert.notEqual(stored.code_hash,invite.code);assert.equal(stored.code_hash.length,64);
    const paired=await call('/claim',{body:{code:invite.code,name:'New phone'},status:201});assert.equal(paired.peerId,pc.device.id);assert.equal((await call('/devices',{transfer:true,token:paired.token})).devices.length,4);
    await call('/claim',{body:{code:invite.code,name:'Replay'},status:400});
    invite=await call('/pair',{token:pc.token,body:{}});
    const race=await Promise.all([1,2].map(n=>raw('/claim',{body:{code:invite.code,name:'Race '+n}}).then(r=>r.status)));assert.deepEqual(race.sort(),[201,400]);
    invite=await call('/pair',{token:pc.token,body:{}});await env.DB.prepare('UPDATE message_pairings SET expires_at=?').bind(Date.now()-1).run();await call('/claim',{body:{code:invite.code,name:'Expired'},status:400});
    invite=await call('/pair',{token:pc.token,body:{}});await call('/pair/cancel',{token:pc.token,body:{}});await call('/claim',{body:{code:invite.code,name:'Cancelled'},status:400});
    const old=await call('/pair',{token:pc.token,body:{}});invite=await call('/pair',{token:pc.token,body:{}});await call('/claim',{body:{code:old.code,name:'Replaced'},status:400});
    const count=(await call('/chats',{token:pc.token})).chats.length;
    const result=await call('/claim',{token:laptop.token,body:{code:invite.code},status:201});assert.equal(result.device.id,laptop.device.id);assert.equal(result.token,undefined);assert.equal((await call('/chats',{token:pc.token})).chats.length,count);
    invite=await call('/pair',{token:pc.token,body:{}});await call('/claim',{token:pc.token,body:{code:invite.code},status:400});
  });
  let first,reply;
  await t.test('two-way history, links, literal HTML and conversation privacy',async()=>{
    first=await send(pc,laptop,'<img src=x onerror=alert(1)>\nHi from PC');reply=await send(laptop,pc,'https://example.com/page?q=one&b=two');assert.equal(reply.kind,'link');
    const js=await send(pc,laptop,'javascript:alert(1)');assert.equal(js.kind,'message');
    await send(pc,third,'A separate private thread');
    const a=await call(chat(pc,laptop),{token:pc.token}),b=await call(chat(laptop,pc),{token:laptop.token});assert.deepEqual(a.messages,b.messages);assert.equal(a.messages.length,3);assert.equal(a.messages[0].body,first.body);
    const c=await call(chat(third,laptop),{token:third.token});assert.equal(c.messages.length,0);
    const list=await call('/chats',{token:laptop.token});assert.equal(list.chats.find(c=>c.id===pc.device.id).unread,2);assert.ok(!JSON.stringify(list).includes('A separate private thread'));
    await call(chat(pc,laptop),{token:pc.token,body:{body:'',clientId:randomUUID()},status:400});await call(chat(pc,laptop),{token:pc.token,body:{body:'x'.repeat(20001),clientId:randomUUID()},status:400});
  });
  await t.test('concurrent send retries produce one message and detect ID reuse',async()=>{
    const clientId=randomUUID(),requests=await Promise.all([send(pc,laptop,'Exactly once',clientId),send(pc,laptop,'Exactly once',clientId)]);assert.equal(requests[0].id,requests[1].id);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM device_messages WHERE client_id=?').bind(clientId).first()).n,1);
    await call(chat(pc,laptop),{token:pc.token,body:{body:'Changed',clientId},status:409});await call(chat(pc,third),{token:pc.token,body:{body:'Exactly once',clientId},status:409});
  });
  await t.test('read positions cannot hide future messages',async()=>{
    await call(chat(laptop,pc)+'/read',{token:laptop.token,body:{through:Number.MAX_SAFE_INTEGER}});
    assert.equal((await call('/chats',{token:laptop.token})).chats.find(c=>c.id===pc.device.id).unread,0);
    const fresh=await send(pc,laptop,'Still unread');assert.equal((await call('/chats',{token:laptop.token})).chats.find(c=>c.id===pc.device.id).unread,1);
    await call(chat(laptop,pc)+'/read',{token:laptop.token,body:{through:first.id}});assert.equal((await call('/chats',{token:laptop.token})).chats.find(c=>c.id===pc.device.id).unread,1);
    await call(chat(laptop,pc)+'/read',{token:laptop.token,body:{through:fresh.id}});
  });
  await t.test('latest, older and incremental pagination preserve order and all messages',async()=>{
    await env.DB.batch(Array.from({length:125},(_,i)=>env.DB.prepare('INSERT INTO device_messages(client_id,sender_id,recipient_id,body,kind,created_at) VALUES(?,?,?,?,?,?)').bind(randomUUID(),third.device.id,laptop.device.id,'Page '+i,'message',Date.now())));
    const latest=await call(chat(laptop,third),{token:laptop.token});assert.equal(latest.messages.length,60);assert.equal(latest.hasMore,true);assert.equal(latest.messages.at(-1).body,'Page 124');
    const older=await call(chat(laptop,third)+'?before='+latest.messages[0].id,{token:laptop.token});assert.equal(older.messages.length,60);assert.equal(older.hasMore,true);
    const oldest=await call(chat(laptop,third)+'?before='+older.messages[0].id,{token:laptop.token});assert.equal(oldest.messages.length,5);assert.equal(oldest.hasMore,false);
    const incremental=await call(chat(laptop,third)+'?after='+oldest.messages[0].id,{token:laptop.token});assert.equal(incremental.messages[0].body,'Page 1');assert.equal(incremental.hasMore,true);
    assert.equal(new Set([...oldest.messages,...older.messages,...latest.messages].map(m=>m.id)).size,125);
    await call(chat(laptop,third)+'?after=-1',{token:laptop.token,status:400});await call(chat(laptop,third)+'?after=1&before=2',{token:laptop.token,status:400});
  });
  await t.test('generic push alerts target the chat, skip read items and deduplicate',async()=>{
    await Promise.all(tasks.splice(0));await env.DB.prepare('DELETE FROM message_deliveries').run();
    await env.DB.prepare('UPDATE transfer_devices SET push_subscription=? WHERE id=?').bind(JSON.stringify({endpoint:'https://web.push.apple.com/test',keys:{p256dh:'test',auth:'test'}}),laptop.device.id).run();
    const read=await send(pc,laptop,'Read before notifications');await call(chat(laptop,pc)+'/read',{token:laptop.token,body:{through:read.id}});await Promise.all(tasks.splice(0));
    await send(pc,laptop,'Secret message text');await Promise.all(tasks.splice(0));env.VAPID_PUBLIC_KEY='test';env.VAPID_PRIVATE_KEY='test';
    await flushMessagePushes(env,sendOne);assert.equal(pushes.length,1);assert.equal(pushes[0].url,'/#messages/'+pc.device.id);assert.ok(!JSON.stringify(pushes).includes('Secret'));await flushMessagePushes(env,sendOne);assert.equal(pushes.length,1);
    delete env.VAPID_PUBLIC_KEY;delete env.VAPID_PRIVATE_KEY;
  });
  await t.test('disconnected devices cannot read or send, while other peers retain history',async()=>{
    const invite=await call('/pair',{token:third.token,body:{}});
    await call('/devices/'+third.device.id,{transfer:true,token:pc.token,method:'DELETE'});
    await call('/chats',{token:third.token,status:401});await call(chat(laptop,third),{token:laptop.token,body:{body:'x',clientId:randomUUID()},status:410});
    assert.equal((await call(chat(laptop,third),{token:laptop.token})).messages.length,60);
    await call('/claim',{body:{name:'Revoked invite',code:invite.code},status:400});
  });
  await t.test('pair-code guessing is limited atomically per IP and globally',async()=>{
    await env.DB.prepare('DELETE FROM message_pair_limits').run();
    for(let i=0;i<8;i++)await call('/claim',{ip:'198.51.100.1',body:{name:'Guess',code:'not-a-code'},status:400});
    await call('/claim',{ip:'198.51.100.1',body:{name:'Guess',code:'123456789'},status:429});
    const scopes=(await env.DB.prepare('SELECT scope FROM message_pair_limits').all()).results;assert.ok(!JSON.stringify(scopes).includes('198.51.100.1'));
    await env.DB.prepare('INSERT OR REPLACE INTO message_pair_limits(scope,attempts,expires_at) VALUES(?,?,?)').bind('global:'+Math.floor(Date.now()/300000),120,Date.now()+300000).run();
    await call('/claim',{ip:'198.51.100.99',body:{name:'Guess',code:'123456789'},status:429});
  });
  await t.test('cleanup retains history and removes only expired pairing/notification state',async()=>{
    const count=(await env.DB.prepare('SELECT COUNT(*) n FROM device_messages').first()).n;
    await env.DB.prepare('UPDATE message_pairings SET expires_at=0').run();await env.DB.prepare('UPDATE message_pair_limits SET expires_at=0').run();
    await cleanMessages(env);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM message_pairings').first()).n,0);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM message_pair_limits').first()).n,0);assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM device_messages').first()).n,count);
    // Original Transfers endpoints still use the same pairing and destination records.
    const item=await call('/items',{transfer:true,token:pc.token,body:{kind:'message',content:'Original transfer',recipientId:laptop.device.id},status:201});assert.equal(item.item.content,'Original transfer');
  });
  await Promise.all(tasks);
});
