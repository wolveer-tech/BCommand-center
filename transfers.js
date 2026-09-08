import { AwsClient } from 'aws4fetch';

const PREFIX = '/api/transfers';
export const PART_SIZE = 16 * 1024 * 1024;
const TTL = new Set([0, 3600, 86400, 604800]);
const enc = new TextEncoder();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
const secret = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const id = () => crypto.randomUUID();
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const clean = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const filename = value => clean(value, 240).split(/[\\/]/).pop() || 'file';
const disposition = name => `attachment; filename="${name.replace(/[^a-zA-Z0-9._ -]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
const alive = row => row && row.state === 'ready' && (!row.expires_at || row.expires_at > Date.now());
const visible = (row, device) => row.sender_id === device.id || !row.recipient_id || row.recipient_id === device.id;

async function body(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  let length = 0; const chunks = [];
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 256 * 1024) { await reader.cancel(); fail(413, 'Transfer request is too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || Array.isArray(value) || typeof value !== 'object') throw 0; return value; }
  catch { fail(400, 'Expected a JSON object.'); }
}

async function authenticate(request, env) {
  const token = (request.headers.get('authorization') || '').match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) fail(401, 'Pair this device to use Transfers.');
  const device = await one(env, 'SELECT * FROM transfer_devices WHERE token_hash=? AND revoked_at IS NULL', await hash(token));
  if (!device) fail(401, 'This device is no longer paired.');
  return device;
}

function storage(env) {
  const missing = ['TRANSFER_FILES', 'TRANSFER_R2_ENDPOINT', 'TRANSFER_R2_BUCKET', 'TRANSFER_R2_ACCESS_KEY_ID', 'TRANSFER_R2_SECRET_ACCESS_KEY'].filter(key => !env[key]);
  if (missing.length) fail(503, 'File storage needs setup: ' + missing.join(', ') + '. See TRANSFERS-SETUP.md.');
  const endpoint = new URL(env.TRANSFER_R2_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')) fail(503, 'Use the R2 S3 API endpoint from your bucket settings.');
  return new AwsClient({ service: 's3', region: 'auto', accessKeyId: env.TRANSFER_R2_ACCESS_KEY_ID, secretAccessKey: env.TRANSFER_R2_SECRET_ACCESS_KEY });
}

async function signed(env, key, method, params = {}, headers = {}, seconds = 900) {
  const client = storage(env);
  const url = new URL(`${env.TRANSFER_R2_ENDPOINT.replace(/\/$/, '')}/${encodeURIComponent(env.TRANSFER_R2_BUCKET)}/${key.split('/').map(encodeURIComponent).join('/')}`);
  Object.entries({ 'X-Amz-Expires': String(seconds), ...params }).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const request = await client.sign(new Request(url, { method, headers }), { aws: { signQuery: true, allHeaders: true } });
  return request.url;
}

async function makeDevice(env, name, pairingHash) {
  name = clean(name, 60); if (!name) fail(400, 'Give this device a name.');
  const count = await one(env, 'SELECT COUNT(*) n FROM transfer_devices WHERE revoked_at IS NULL');
  if (count.n >= 30) fail(409, 'Remove an old device before pairing another (30-device limit).');
  const token = secret(), deviceId = id(), now = Date.now();
  if (pairingHash) {
    // DELETE RETURNING consumes the invitation atomically, even for simultaneous requests.
    const invite = await one(env, `DELETE FROM transfer_pairings WHERE code_hash=? AND expires_at>?
      AND created_by IN (SELECT id FROM transfer_devices WHERE revoked_at IS NULL) RETURNING code_hash`, pairingHash, now);
    if (!invite) fail(400, 'Pairing code is invalid, expired or already used.');
  }
  await run(env, 'INSERT INTO transfer_devices(id,name,token_hash,created_at) VALUES(?,?,?,?)', deviceId, name, await hash(token), now);
  return { token, device: { id: deviceId, name } };
}

// Messages shares the same explicitly paired devices and credential storage.
export { authenticate as authenticateTransferDevice, body as readTransferJSON, makeDevice as createTransferDevice };

async function recipient(env, value, sender) {
  if (!value || value === 'all') return null;
  if (value === sender.id) fail(400, 'Choose another device.');
  if (!await one(env, 'SELECT id FROM transfer_devices WHERE id=? AND revoked_at IS NULL', value)) fail(400, 'Recipient device is unavailable.');
  return value;
}

function ttl(value) { const seconds = Number(value ?? 86400); if (!TTL.has(seconds)) fail(400, 'Choose 1 hour, 1 day, 7 days or Never.'); return seconds; }
function item(row) {
  const { object_key, upload_id, token_hash, ...result } = row;
  return result;
}

async function ready(env, row, sha256 = null) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE transfers SET state='ready',ready_at=COALESCE(ready_at,?),sha256=COALESCE(sha256,?),expires_at=CASE WHEN ttl=0 THEN NULL ELSE COALESCE(expires_at,?+ttl*1000) END WHERE id=? AND state='pending'`).bind(now, sha256, now, row.id),
    env.DB.prepare(`INSERT OR IGNORE INTO transfer_deliveries(transfer_id,device_id,next_try)
      SELECT t.id,d.id,? FROM transfers t JOIN transfer_devices d ON d.revoked_at IS NULL
      WHERE t.id=? AND t.state='ready' AND d.id<>t.sender_id AND (t.recipient_id IS NULL OR t.recipient_id=d.id)`).bind(now, row.id)
  ]);
  return item(await one(env, 'SELECT * FROM transfers WHERE id=?', row.id));
}

export async function handleTransfers(request, env, ctx, sendOne) {
  const url = new URL(request.url), path = url.pathname.slice(PREFIX.length), method = request.method;
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'x-content-type-options': 'nosniff' };
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers });
  try {
    if (!env.DB) fail(503, 'D1 is not configured.');
    if (path === '/bootstrap' && method === 'POST') {
      const data = await body(request);
      if (String(env.TRANSFER_SETUP_KEY || '').length < 32) fail(503, 'Add a random TRANSFER_SETUP_KEY Worker secret (at least 32 characters).');
      if (await hash(String(data.key || '')) !== await hash(env.TRANSFER_SETUP_KEY)) fail(401, 'Setup key was not accepted.');
      return reply(await makeDevice(env, data.name), 201);
    }
    if (path === '/claim' && method === 'POST') {
      const data = await body(request), code = String(data.code || '').replace(/[\s-]/g, '').toLowerCase();
      if (!/^[a-f0-9]{32}$/.test(code)) fail(400, 'Enter the full pairing code from your paired device.');
      return reply(await makeDevice(env, data.name, await hash(code)), 201);
    }
    const device = await authenticate(request, env);
    if (path === '/status' && method === 'GET') {
      let files = true, storageError = ''; try { storage(env); } catch (e) { files = false; storageError = e.message; }
      return reply({ device: { id: device.id, name: device.name }, files, storageError, push: !!device.push_subscription,
        pushConfigured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), maxFileBytes: maxSize(env), partSize: PART_SIZE });
    }
    if (path === '/devices' && method === 'GET') return reply({ devices: await all(env, 'SELECT id,name,created_at FROM transfer_devices WHERE revoked_at IS NULL ORDER BY created_at') });
    if (path === '/pair' && method === 'POST') {
      await run(env, 'DELETE FROM transfer_pairings WHERE created_by=? OR expires_at<?', device.id, Date.now());
      const code = secret().slice(0, 32), expiresAt = Date.now() + 600000;
      await run(env, 'INSERT INTO transfer_pairings(code_hash,created_by,expires_at) VALUES(?,?,?)', await hash(code), device.id, expiresAt);
      return reply({ code: code.match(/.{4}/g).join('-'), expiresAt });
    }
    const deviceMatch = path.match(/^\/devices\/([a-f0-9-]{36})$/);
    if (deviceMatch && method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('UPDATE transfer_devices SET revoked_at=?,push_subscription=NULL WHERE id=?').bind(Date.now(), deviceMatch[1]),
        env.DB.prepare('DELETE FROM transfer_pairings WHERE created_by=?').bind(deviceMatch[1])
      ]);
      return reply({ ok: true });
    }
    if (path === '/push' && method === 'POST') {
      const { subscription } = await body(request);
      if (subscription !== null) {
        let endpoint; try { endpoint = new URL(subscription?.endpoint); } catch { fail(400, 'Invalid push subscription.'); }
        if (endpoint.protocol !== 'https:' || !/(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(endpoint.hostname) || !subscription.keys?.p256dh || !subscription.keys?.auth) fail(400, 'Unsupported push subscription.');
      }
      await run(env, 'UPDATE transfer_devices SET push_subscription=? WHERE id=?', subscription ? JSON.stringify(subscription) : null, device.id);
      return reply({ ok: true });
    }
    if (path === '/items' && method === 'GET') {
      const view = url.searchParams.get('view') || 'inbox', before = Number(url.searchParams.get('before') || 0), beforeId = clean(url.searchParams.get('beforeId'), 36);
      if (!['inbox','sent','files','links','messages'].includes(view)) fail(400, 'Invalid transfer view.');
      const clauses = ["t.state='ready'", '(t.expires_at IS NULL OR t.expires_at>?)']; const args = [device.id, Date.now()];
      if (view === 'inbox') { clauses.push('t.sender_id<>? AND (t.recipient_id IS NULL OR t.recipient_id=?)'); args.push(device.id, device.id); }
      else if (view === 'sent') { clauses.push('t.sender_id=?'); args.push(device.id); }
      else { clauses.push('(t.sender_id=? OR t.recipient_id IS NULL OR t.recipient_id=?) AND t.kind=?'); args.push(device.id, device.id, { files:'file', links:'link', messages:'message' }[view]); }
      if (before > 0) { clauses.push('(t.ready_at<? OR (t.ready_at=? AND t.id<?))'); args.push(before, before, beforeId); }
      const rows = await all(env, `SELECT t.*,s.name sender_name,r.name recipient_name,rr.read_at
        FROM transfers t JOIN transfer_devices s ON t.sender_id=s.id LEFT JOIN transfer_devices r ON t.recipient_id=r.id
        LEFT JOIN transfer_receipts rr ON rr.transfer_id=t.id AND rr.device_id=?
        WHERE ${clauses.join(' AND ')} ORDER BY t.ready_at DESC,t.id DESC LIMIT 51`, ...args);
      const hasMore = rows.length > 50; return reply({ items: rows.slice(0,50).map(item), hasMore });
    }
    if (path === '/items' && method === 'POST') {
      const data = await body(request), type = data.kind;
      if (!['link','message'].includes(type)) fail(400, 'Choose a message or link.');
      let content = String(data.content || '').trim();
      if (!content || content.length > 20000) fail(400, 'Enter up to 20,000 characters.');
      if (type === 'link') { let link; try { link = new URL(content); } catch { fail(400, 'Enter a full https:// or http:// link.'); } if (!['http:','https:'].includes(link.protocol)) fail(400, 'Only web links are supported.'); content = link.href; }
      const row = { id: id(), sender_id: device.id, recipient_id: await recipient(env, data.recipientId, device) };
      await run(env, `INSERT INTO transfers(id,kind,sender_id,recipient_id,title,content,state,created_at,ttl) VALUES(?,?,?,?,?,?,'pending',?,?)`, row.id, type, row.sender_id, row.recipient_id, clean(data.title || content, 160), content, Date.now(), ttl(data.ttl));
      const result = await ready(env, row); ctx.waitUntil(flushTransferPushes(env, sendOne)); return reply({ item: result }, 201);
    }
    if (path === '/uploads' && method === 'POST') {
      storage(env); const data = await body(request), size = Number(data.size);
      if (!Number.isSafeInteger(size) || size < 0 || size > maxSize(env)) fail(400, `Maximum file size is ${maxSize(env)} bytes.`);
      const pending = await one(env, "SELECT COUNT(*) n FROM transfers WHERE sender_id=? AND state='pending'", device.id);
      if (pending.n >= 25) fail(409, 'Too many unfinished uploads. Cancel one or wait for cleanup.');
      const row = { id: id(), sender_id: device.id, recipient_id: await recipient(env, data.recipientId, device) }, name = filename(data.filename), seconds = ttl(data.ttl), key = `transfers/${row.id}/${id()}`;
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(data.mime || '') ? data.mime : 'application/octet-stream';
      const upload = size ? await env.TRANSFER_FILES.createMultipartUpload(key, { httpMetadata: { contentType: mime, contentDisposition: disposition(name), cacheControl: 'private, no-store, no-transform' } }) : null;
      try {
        await run(env, `INSERT INTO transfers(id,kind,sender_id,recipient_id,title,filename,mime,size,object_key,upload_id,state,created_at,ttl,upload_deadline)
          VALUES(?,'file',?,?,?,?,?,?,?,?,'pending',?,?,?)`, row.id, row.sender_id, row.recipient_id, name, name, mime, size, key, upload?.uploadId || null, Date.now(), seconds, Date.now()+86400000);
      } catch (e) { if (upload) await upload.abort(); throw e; }
      return reply({ id: row.id, partSize: PART_SIZE, parts: Math.ceil(size / PART_SIZE) }, 201);
    }
    const match = path.match(/^\/(uploads|items)\/([a-f0-9-]{36})(?:\/(part|complete|download|read))?$/);
    if (match) {
      const [, group, itemId, action] = match;
      const row = await one(env, 'SELECT * FROM transfers WHERE id=?', itemId);
      if (!row || !visible(row, device)) fail(404, 'Transfer is unavailable.');
      if (group === 'uploads' && row.sender_id !== device.id) fail(403, 'Only the sender can manage this upload.');
      if (method === 'DELETE' && !action) {
        if (row.sender_id !== device.id) fail(403, 'Only the sender can delete this transfer.');
        await run(env, "UPDATE transfers SET state='deleting' WHERE id=?", row.id);
        await removeTransfer(env, row); return reply({ ok:true });
      }
      if (group === 'uploads' && method === 'POST') {
        if (action === 'complete' && alive(row)) return reply({ item: item(row) }); // Safe retry after lost response.
        if (row.state !== 'pending' || row.upload_deadline < Date.now()) fail(410, 'Upload has expired. Start again.');
        storage(env); const data = await body(request);
        if (action === 'part') {
          const number = Number(data.partNumber), parts = Math.ceil(row.size / PART_SIZE);
          if (!Number.isInteger(number) || number < 1 || number > parts || !/^[A-Za-z0-9+/]{22}==$/.test(data.md5 || '')) fail(400, 'Invalid upload part or checksum.');
          const length = Math.min(PART_SIZE, row.size - (number - 1) * PART_SIZE);
          const headers = { 'content-md5': data.md5, 'content-length': String(length) };
          return reply({ url: await signed(env, row.object_key, 'PUT', { partNumber: number, uploadId: row.upload_id }, headers), headers: { 'Content-MD5': data.md5 } });
        }
        if (action === 'complete') {
          if (!/^[a-f0-9]{64}$/.test(data.sha256 || '')) fail(400, 'A SHA-256 checksum is required.');
          const count = Math.ceil(row.size / PART_SIZE), parts = data.parts;
          // R2 multipart ETags are opaque identifiers, not necessarily MD5 hex.
          if (!Array.isArray(parts) || parts.length !== count || parts.some((p,i) => p.partNumber !== i+1 || !/^[A-Za-z0-9+\/_=-]{1,256}$/.test(p.etag || ''))) fail(400, 'Upload parts are incomplete.');
          let object = await env.TRANSFER_FILES.head(row.object_key);
          if (!object) {
            if (row.size) object = await env.TRANSFER_FILES.resumeMultipartUpload(row.object_key, row.upload_id).complete(parts);
            else object = await env.TRANSFER_FILES.put(row.object_key, new Uint8Array(), { httpMetadata:{ contentType:row.mime,contentDisposition:disposition(row.filename),cacheControl:'private, no-store, no-transform' } });
          }
          if (object.size !== row.size) { await run(env, "UPDATE transfers SET state='deleting' WHERE id=?", row.id); await removeTransfer(env,row); fail(409, 'Stored size does not match the source. Upload again.'); }
          const result = await ready(env, row, data.sha256); ctx.waitUntil(flushTransferPushes(env, sendOne)); return reply({ item:result });
        }
      }
      if (group === 'items') {
        if (!alive(row)) fail(410, 'This transfer has expired or is not ready.');
        if (!action && method === 'GET') return reply({ item:item(row) });
        if (action === 'read' && method === 'POST') { await run(env, 'INSERT OR IGNORE INTO transfer_receipts(transfer_id,device_id,read_at) VALUES(?,?,?)', row.id, device.id, Date.now()); return reply({ ok:true }); }
        if (action === 'download' && method === 'POST' && row.kind === 'file') {
          const seconds = Math.max(1, Math.min(300, row.expires_at ? Math.floor((row.expires_at-Date.now())/1000) : 300));
          return reply({ url:await signed(env,row.object_key,'GET',{}, {}, seconds), sha256:row.sha256,filename:row.filename,size:row.size,mime:row.mime,expiresIn:seconds });
        }
      }
    }
    return reply({ error:'Unknown transfer endpoint.' },404);
  } catch (e) {
    // Keep credentials, signed URLs and subscription material out of logs/errors.
    const setup = /no such table: transfer/.test(e.message || '');
    return reply({ error: setup ? 'Run migrations/0008_transfers.sql on your D1 database. See TRANSFERS-SETUP.md.' : (e.status ? e.message : 'Transfers could not complete this request. Check the D1 and R2 setup, then retry.') }, setup ? 503 : e.status || 500);
  }
}

function maxSize(env) { const n = Number(env.TRANSFER_MAX_FILE_BYTES || 10737418240); return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 10737418240) : 10737418240; }

async function removeTransfer(env, row) {
  if (row.object_key) {
    if (!env.TRANSFER_FILES) throw new Error('R2 unavailable');
    if (row.upload_id) await env.TRANSFER_FILES.resumeMultipartUpload(row.object_key,row.upload_id).abort();
    await env.TRANSFER_FILES.delete(row.object_key);
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transfer_receipts WHERE transfer_id=?').bind(row.id),
    env.DB.prepare('DELETE FROM transfer_deliveries WHERE transfer_id=?').bind(row.id),
    env.DB.prepare('DELETE FROM transfers WHERE id=?').bind(row.id)
  ]);
}

export async function cleanTransfers(env) {
  if (!env.DB) return;
  try {
    await run(env, 'DELETE FROM transfer_pairings WHERE expires_at<?', Date.now());
    const rows = await all(env, `SELECT * FROM transfers WHERE state='deleting' OR (expires_at IS NOT NULL AND expires_at<=?) OR (state='pending' AND created_at<?) LIMIT 100`, Date.now(), Date.now()-86400000);
    for (const row of rows) { try { await run(env,"UPDATE transfers SET state='deleting' WHERE id=?",row.id); await removeTransfer(env,row); } catch { console.error('Transfer cleanup will retry',row.id); } }
  } catch { /* Migration may not have been applied yet; old app features keep working. */ }
}

export async function flushTransferPushes(env, sendOne) {
  if (!env.DB || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  try {
    const rows = await all(env, `SELECT p.*,d.push_subscription FROM transfer_deliveries p
      JOIN transfers t ON t.id=p.transfer_id JOIN transfer_devices d ON d.id=p.device_id
      WHERE p.sent_at IS NULL AND p.attempts<5 AND p.next_try<=? AND d.revoked_at IS NULL AND d.push_subscription IS NOT NULL
      AND t.state='ready' AND (t.expires_at IS NULL OR t.expires_at>?) LIMIT 30`,Date.now(),Date.now());
    for (const row of rows) {
      const claimed = await one(env, `UPDATE transfer_deliveries SET attempts=attempts+1,next_try=? WHERE transfer_id=? AND device_id=? AND next_try<=? AND sent_at IS NULL RETURNING transfer_id`,Date.now()+120000,row.transfer_id,row.device_id,Date.now());
      if (!claimed) continue;
      try {
        const sub = JSON.parse(row.push_subscription);
        await sendOne({endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth:sub.keys.auth,title:'Command Centre Transfer',body:'A new transfer is ready. Open Transfers to view it.',url:'/#transfers',id:'transfer-'+row.transfer_id},env);
        await run(env,'UPDATE transfer_deliveries SET sent_at=? WHERE transfer_id=? AND device_id=?',Date.now(),row.transfer_id,row.device_id);
      } catch { console.error('Transfer notification will retry',row.transfer_id); }
    }
  } catch { /* No transfer migration yet. */ }
}
