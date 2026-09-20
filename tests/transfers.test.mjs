import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { handleTransfers, cleanTransfers, flushTransferPushes, PART_SIZE } from '../transfers.js';

test('Transfers with real local D1 and R2 bindings',async t=>{
  const mf=new Miniflare(convertV4MiniflareOptions({name:'test',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-31',d1Databases:{DB:'transfer-test'},r2Buckets:['TRANSFER_FILES']}));
  t.after(()=>mf.dispose());
  const env={DB:await mf.getD1Database('DB'),TRANSFER_FILES:await mf.getR2Bucket('TRANSFER_FILES'),TRANSFER_SETUP_KEY:'test-setup-key-with-over-32-characters',TRANSFER_R2_ENDPOINT:'https://testaccount.r2.cloudflarestorage.com',TRANSFER_R2_BUCKET:'transfers-test',TRANSFER_R2_ACCESS_KEY_ID:'test-access',TRANSFER_R2_SECRET_ACCESS_KEY:'test-secret'};
  const migration=await readFile(new URL('../migrations/0008_transfers.sql',import.meta.url),'utf8');
  for(const sql of migration.split(';').map(x=>x.trim()).filter(Boolean))await env.DB.prepare(sql).run();
  const tasks=[],pushes=[];const sendOne=async row=>{pushes.push(row);};const ctx={waitUntil:p=>tasks.push(p)};
  async function call(path,{token,body,method,status=200}={}){
    const response=await handleTransfers(new Request('https://centre.test/api/transfers'+path,{method:method||(body===undefined?'GET':'POST'),headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,ctx,sendOne);
    const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result;
  }
  const setup=async name=>call('/bootstrap',{body:{name,key:env.TRANSFER_SETUP_KEY},status:201});
  let pc,phone,third;
  await t.test('authentication, one-use pairing and scoped device credentials',async()=>{
    await call('/items',{status:401});await call('/bootstrap',{body:{key:'wrong',name:'PC'},status:401});
    pc=await setup('PC');
    const invitation=await call('/pair',{token:pc.token,body:{}});
    phone=await call('/claim',{body:{name:'Phone',code:invitation.code},status:201});
    await call('/claim',{body:{name:'Intruder',code:invitation.code},status:400});
    third=await setup('Third device');
    const db=await env.DB.prepare('SELECT token_hash FROM transfer_devices WHERE id=?').bind(pc.device.id).first();assert.notEqual(db.token_hash,pc.token);assert.equal(db.token_hash.length,64);
    const devices=await call('/devices',{token:pc.token});assert.equal(devices.devices.length,3);assert.ok(!JSON.stringify(devices).includes('token'));
    const race=await call('/pair',{token:pc.token,body:{}});
    const requests=await Promise.all([1,2].map(async n=>{
      const r=await handleTransfers(new Request('https://centre.test/api/transfers/claim',{method:'POST',body:JSON.stringify({name:'Race '+n,code:race.code})}),env,ctx,sendOne);return r.status;
    }));assert.deepEqual(requests.sort(),[201,400]);
  });
  let target,broadcast;
  await t.test('bidirectional messages, links, recipient privacy and escaping data',async()=>{
    target=(await call('/items',{token:pc.token,body:{kind:'message',content:'<script>alert(1)</script>\nOriginal text',recipientId:phone.device.id,ttl:0},status:201})).item;
    await call('/items/'+target.id,{token:third.token,status:404});
    const inbox=await call('/items?view=inbox',{token:phone.token});assert.equal(inbox.items[0].content,'<script>alert(1)</script>\nOriginal text');
    assert.equal((await call('/items?view=inbox',{token:pc.token})).items.length,0);
    assert.equal((await call('/items?view=sent',{token:pc.token})).items.length,1);
    assert.equal((await call('/items?view=messages',{token:third.token})).items.length,0);
    broadcast=(await call('/items',{token:phone.token,body:{kind:'link',content:'https://example.com/?q=one&two=2',ttl:3600},status:201})).item;
    assert.equal((await call('/items?view=inbox',{token:pc.token})).items[0].id,broadcast.id);
    await call('/items/'+broadcast.id+'/read',{token:pc.token,body:{}});
    assert.ok((await call('/items?view=inbox',{token:pc.token})).items[0].read_at);
    await call('/items',{token:pc.token,body:{kind:'link',content:'javascript:alert(1)'},status:400});
    await call('/items',{token:pc.token,body:{kind:'message',content:'x',recipientId:pc.device.id},status:400});
    await call('/items',{token:pc.token,body:{kind:'message',content:'x',ttl:-1},status:400});
  });
  let binary;
  await t.test('direct multipart URLs, binary round-trip, SHA-256 and retry-safe completion',async()=>{
    const bytes=randomBytes(PART_SIZE+377),sha256=createHash('sha256').update(bytes).digest('hex');
    const upload=await call('/uploads',{token:pc.token,body:{filename:'original.mov',mime:'video/quicktime',size:bytes.length,recipientId:phone.device.id,ttl:86400},status:201});
    const row=await env.DB.prepare('SELECT * FROM transfers WHERE id=?').bind(upload.id).first();
    await call(`/items/${upload.id}/download`,{token:phone.token,body:{},status:410});
    await call(`/uploads/${upload.id}/part`,{token:phone.token,body:{partNumber:1,md5:'x'},status:403});
    await call(`/uploads/${upload.id}/complete`,{token:pc.token,body:{sha256,parts:[]},status:400});
    const multipart=env.TRANSFER_FILES.resumeMultipartUpload(row.object_key,row.upload_id),parts=[];
    for(let n=1;n<=upload.parts;n++){
      const chunk=bytes.subarray((n-1)*upload.partSize,n*upload.partSize),md5=createHash('md5').update(chunk).digest('base64');
      const signed=await call(`/uploads/${upload.id}/part`,{token:pc.token,body:{partNumber:n,md5}}),url=new URL(signed.url);
      assert.equal(url.hostname,'testaccount.r2.cloudflarestorage.com');assert.equal(url.searchParams.get('partNumber'),String(n));assert.equal(url.searchParams.get('X-Amz-Expires'),'900');
      assert.equal(url.searchParams.get('X-Amz-SignedHeaders'),'content-length;content-md5;host');assert.equal(signed.headers['Content-MD5'],md5);
      parts.push(await multipart.uploadPart(n,chunk));
    }
    binary=(await call(`/uploads/${upload.id}/complete`,{token:pc.token,body:{sha256,parts}})).item;
    assert.equal(binary.sha256,sha256);assert.ok(!('object_key'in binary));
    const stored=await env.TRANSFER_FILES.get(row.object_key);assert.deepEqual(Buffer.from(await stored.arrayBuffer()),bytes);
    assert.equal(stored.httpMetadata.contentType,'video/quicktime');assert.ok(stored.httpMetadata.contentDisposition.includes('attachment'));
    const again=await call(`/uploads/${upload.id}/complete`,{token:pc.token,body:{sha256,parts}});assert.equal(again.item.ready_at,binary.ready_at);
    const download=await call(`/items/${upload.id}/download`,{token:phone.token,body:{}});assert.equal(download.sha256,sha256);assert.equal(new URL(download.url).searchParams.get('X-Amz-Expires'),'300');
    await call(`/items/${upload.id}/download`,{token:third.token,body:{},status:404});
    await call(`/items/${upload.id}`,{token:phone.token,method:'DELETE',status:403});
  });
  await t.test('empty files, oversized declarations and stored-size mismatch',async()=>{
    const empty=await call('/uploads',{token:phone.token,body:{filename:'empty.txt',size:0},status:201});
    const result=await call(`/uploads/${empty.id}/complete`,{token:phone.token,body:{parts:[],sha256:createHash('sha256').digest('hex')}});assert.equal(result.item.size,0);
    await call('/uploads',{token:pc.token,body:{filename:'large.bin',size:10737418241},status:400});
    const mismatch=await call('/uploads',{token:pc.token,body:{filename:'mismatch.bin',size:20},status:201});
    const row=await env.DB.prepare('SELECT * FROM transfers WHERE id=?').bind(mismatch.id).first();
    const part=await env.TRANSFER_FILES.resumeMultipartUpload(row.object_key,row.upload_id).uploadPart(1,new Uint8Array([1]));
    await call(`/uploads/${row.id}/complete`,{token:pc.token,body:{parts:[part],sha256:'a'.repeat(64)},status:409});
    assert.equal(await env.TRANSFER_FILES.head(row.object_key),null);
  });
  await t.test('notification outbox targets recipients, hides message content and deduplicates',async()=>{
    await Promise.all(tasks.splice(0));
    const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'key',auth:'auth'}};
    await call('/push',{token:phone.token,body:{subscription}});
    await call('/push',{token:pc.token,body:{subscription:{...subscription,endpoint:'https://fcm.googleapis.com/test'}}});
    env.VAPID_PUBLIC_KEY='test';env.VAPID_PRIVATE_KEY='test';
    await flushTransferPushes(env,sendOne);
    assert.ok(pushes.length>=3);assert.ok(pushes.every(x=>x.url==='/#transfers'&&!x.body.includes('Original text')));
    const targeted=pushes.filter(x=>x.id==='transfer-'+target.id);assert.equal(targeted.length,1);assert.equal(targeted[0].endpoint,subscription.endpoint);
    const count=pushes.length;await flushTransferPushes(env,sendOne);assert.equal(pushes.length,count);
    await call('/push',{token:phone.token,body:{subscription:{...subscription,endpoint:'http://127.0.0.1/private'}},status:400});
  });
  await t.test('expiry prevents reads before cleanup; deletion removes objects and metadata',async()=>{
    await env.DB.prepare('UPDATE transfers SET expires_at=? WHERE id=?').bind(Date.now()-1,binary.id).run();
    await call(`/items/${binary.id}/download`,{token:phone.token,body:{},status:410});
    const row=await env.DB.prepare('SELECT object_key FROM transfers WHERE id=?').bind(binary.id).first();
    await cleanTransfers(env);assert.equal(await env.TRANSFER_FILES.head(row.object_key),null);
    assert.equal(await env.DB.prepare('SELECT id FROM transfers WHERE id=?').bind(binary.id).first(),null);
    await call('/items/'+target.id,{token:pc.token,method:'DELETE'});await call('/items/'+target.id,{token:phone.token,status:404});
    const pending=await call('/uploads',{token:pc.token,body:{filename:'abandoned',size:7},status:201});
    await env.DB.prepare('UPDATE transfers SET created_at=? WHERE id=?').bind(Date.now()-90000000,pending.id).run();await cleanTransfers(env);
    assert.equal(await env.DB.prepare('SELECT id FROM transfers WHERE id=?').bind(pending.id).first(),null);
  });
  await t.test('revocation removes access and invalidates invitations',async()=>{
    const invite=await call('/pair',{token:third.token,body:{}});
    const removed=await call('/devices/'+third.device.id,{token:pc.token,method:'DELETE'});
    assert.equal(removed.removed.id,third.device.id);assert.equal(removed.removed.name,'Third device');assert.ok(removed.updatedAt);
    assert.ok(!(await call('/devices',{token:pc.token})).devices.some(device=>device.id===third.device.id));
    await call('/devices/'+third.device.id,{token:pc.token,method:'DELETE',status:404});
    await call('/devices',{token:third.token,status:401});
    await call('/claim',{body:{name:'Late join',code:invite.code},status:400});
  });
});
