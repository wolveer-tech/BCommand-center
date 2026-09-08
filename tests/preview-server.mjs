// Local preview only. Uses disposable D1/R2 data and never deploys or contacts Cloudflare.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHash, randomUUID } from 'node:crypto';
import { handleTransfers } from '../transfers.js';
const mf=new Miniflare(convertV4MiniflareOptions({name:'preview',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-31',d1Databases:{DB:'preview'},r2Buckets:['TRANSFER_FILES']}));
const env={DB:await mf.getD1Database('DB'),TRANSFER_FILES:await mf.getR2Bucket('TRANSFER_FILES'),TRANSFER_SETUP_KEY:'preview-key-for-local-test-only-123456',TRANSFER_R2_ENDPOINT:'https://preview.r2.cloudflarestorage.com',TRANSFER_R2_BUCKET:'preview',TRANSFER_R2_ACCESS_KEY_ID:'preview',TRANSFER_R2_SECRET_ACCESS_KEY:'preview'};
for(const sql of (await readFile(new URL('../migrations/0008_transfers.sql',import.meta.url),'utf8')).split(';').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
const ctx={waitUntil:p=>p.catch(()=>{})};
const capabilities=new Map();
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:8790');
    if(url.pathname.startsWith('/__r2/')){
      const capability=capabilities.get(url.pathname);if(!capability){res.writeHead(403);res.end();return;}
      if(req.method==='PUT'&&capability.method==='PUT'){
        const parts=[];for await(const chunk of req)parts.push(chunk);const buffer=Buffer.concat(parts);
        if(buffer.length!==capability.length||createHash('md5').update(buffer).digest('base64')!==req.headers['content-md5']){res.writeHead(400);res.end('Checksum or size mismatch');return;}
        const part=await env.TRANSFER_FILES.resumeMultipartUpload(capability.key,capability.uploadId).uploadPart(capability.partNumber,buffer);
        res.writeHead(200,{ETag:'"'+part.etag+'"'});res.end();return;
      }
      if(req.method==='GET'&&capability.method==='GET'){
        const object=await env.TRANSFER_FILES.get(capability.key);if(!object){res.writeHead(404);res.end();return;}
        res.writeHead(200,{'Content-Type':object.httpMetadata.contentType,'Content-Disposition':object.httpMetadata.contentDisposition});for await(const chunk of object.body)res.write(chunk);res.end();return;
      }
      res.writeHead(405);res.end();return;
    }
    if(url.pathname.startsWith('/api/transfers/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const request=new Request(url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined});
      const response=await handleTransfers(request,env,ctx,async()=>{});let data=await response.json();
      // Stand in for the signed R2 URL locally; production always uses R2 directly.
      if(data.url){const original=new URL(data.url),key=original.pathname.split('/').slice(2).map(decodeURIComponent).join('/'),path='/__r2/'+randomUUID();
        let length=0;const uploadId=original.searchParams.get('uploadId'),partNumber=Number(original.searchParams.get('partNumber'));
        if(uploadId){const row=await env.DB.prepare('SELECT size FROM transfers WHERE object_key=?').bind(key).first();length=Math.min(16777216,row.size-(partNumber-1)*16777216);}
        capabilities.set(path,{method:uploadId?'PUT':'GET',key,uploadId,partNumber,length});data.url='http://127.0.0.1:8790'+path;
      }
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(JSON.stringify(data));return;
    }
    if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Other services are disabled in the local Transfers preview.'}));return;}
    const publicRoot=resolve('public'),path=resolve(publicRoot,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!path.startsWith(publicRoot+'\\')&&!path.startsWith(publicRoot+'/')){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[extname(path)]||'application/octet-stream'});res.end(bytes);
  }catch(e){console.error(e.message);res.writeHead(500);res.end('Preview error');}
});
await new Promise(resolve=>server.listen(8790,'127.0.0.1',resolve));
console.log('Preview: http://127.0.0.1:8790/#transfers');
console.log('Setup key: '+env.TRANSFER_SETUP_KEY);
await mkdir('../fixtures',{recursive:true});await writeFile('../fixtures/transfer-original.bin',Buffer.concat([Buffer.from('Command Centre original bytes\x00\xff\n'),Buffer.alloc(1024*1024,123)]));
process.on('SIGINT',async()=>{server.close();await mf.dispose();process.exit();});
