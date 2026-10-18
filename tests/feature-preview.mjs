// Read-only preview: football/sports use public feeds; no account or production bindings.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import worker from '../worker.js';
const root=resolve('public'),port=8797;
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:'+port);
  if(url.pathname.startsWith('/api/football')||url.pathname.startsWith('/api/live-content')){
   const response=await worker.fetch(new Request(url),{LIVE_PROVIDER_1_NAME:'TitaniumStream',LIVE_PROVIDER_1_MODE:'titanium',LIVE_PROVIDER_1_BASE_URL:'https://titaniumstream.pages.dev'},{waitUntil:p=>p.catch(()=>{})});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(url.pathname.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Other services are disabled in this local preview.'}));return;}
  if(url.pathname==='/__qa/note-images.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(await readFile('tests/note-images.browser.html'));return;}
  const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(path);res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[extname(path)]||'application/octet-stream'});res.end(bytes);
 }catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
server.listen(port,'127.0.0.1',()=>console.log('Public-feed feature preview: http://127.0.0.1:'+port));
