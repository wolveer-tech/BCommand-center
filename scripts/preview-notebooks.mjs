// Isolated local QA: in-memory account database, bucket and demo invitation only.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {handleAccounts} from '../accounts.js';
import {handleManga} from '../manga-reader.js';
const mf=new Miniflare(convertV4MiniflareOptions({name:'notebooks-preview',modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-31',d1Databases:{DB:'notebooks-preview'},r2Buckets:['TRANSFER_FILES']}));
const env={DB:await mf.getD1Database('DB'),TRANSFER_FILES:await mf.getR2Bucket('TRANSFER_FILES'),ACCOUNT_INVITE_CODE:'local-notebook-test-invitation'};
for(const sql of (await readFile('migrations/0013_accounts.sql','utf8')).split(';').map(s=>s.trim()).filter(Boolean))await env.DB.prepare(sql).run();
const root=resolve('public');
const qaPort=Number(process.argv[2])||8823;
const fixtures=process.argv.includes('--fixtures');
const providerChecks=process.argv.includes('--provider-checks');
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+qaPort);
    if(url.pathname.startsWith('/api/accounts/')){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const response=await handleAccounts(new Request(url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}),env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(url.pathname.startsWith('/api/manga/')){
      if(fixtures&&url.searchParams.get('source')!=='comix'){
        const series={id:'/comics/preview-story',source:'asura',title:'Preview story',status:'Ongoing',cover:'',url:'https://asurascans.com/comics/preview-story'};
        const chapters=[1,2].map(n=>({id:`/comics/preview-story/chapter/${n}`,chapter:String(n),title:`Chapter ${n}`,url:`https://asurascans.com/comics/preview-story/chapter/${n}`}));
        const endpoint=url.pathname.split('/').at(-1),data=endpoint==='search'?{results:[series]}:endpoint==='chapters'?{chapters,nextOffset:null}:endpoint==='pages'?{pages:[1,2,3].map(n=>`http://127.0.0.1:${qaPort}/__qa/page.svg?n=${n}`),originalPages:[]}:{error:'Not found'};
        res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));return;
      }
      const response=await handleManga(new Request(url),{waitUntil:promise=>promise.catch(()=>{})});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(fixtures&&url.pathname==='/__qa/page.svg'){
      res.writeHead(200,{'content-type':'image/svg+xml'});res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#b3c9d5"/><text x="50" y="150" font-family="sans-serif" font-size="36" fill="#263247">Preview page ${Number(url.searchParams.get('n'))||1}</text></svg>`);return;
    }
    if(['/api/media/search','/api/media/explore'].includes(url.pathname)){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({results:[{id:550,type:'movie',title:'QA Movie',year:'1999'},{id:1399,type:'tv',title:'QA Series',year:'2011'}]}));return;
    }
    if(fixtures&&url.pathname==='/api/media/embed-url'){
      const mode=url.searchParams.get('mode'),id=url.searchParams.get('id');
      const embedUrl=providerChecks&&mode==='agg'&&id==='550'?'https://anicine.xyz/watch/movie/550':`http://127.0.0.1:${qaPort}/__qa/player.html`;
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({embedUrl,externalOnly:false}));return;
    }
    if(fixtures&&url.pathname==='/api/media/provider-health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({state:'available',status:200}));return;}
    if(fixtures&&['/api/youtube/explore','/api/youtube/search'].includes(url.pathname)){
      const items=Array.from({length:6},(_,i)=>({videoId:`qa-video-${String(i+1).padStart(2,'0')}`,title:`A closer look at design and technology ${i+1}`,channelTitle:'Preview channel',thumbnail:`http://127.0.0.1:${qaPort}/__qa/page.svg?n=${i+1}`,publishedAt:'2026-10-13T12:00:00Z'}));
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({items}));return;
    }
    if(fixtures&&url.pathname==='/api/youtube/comments'){
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({comments:[{id:'preview-comment',author:'Preview viewer',text:'A readable comment with enough room for the text on a phone.',publishedAt:'2026-10-13T12:00:00Z'}],nextPageToken:null}));return;
    }
    if(fixtures&&url.pathname==='/__qa/player.html'){
      res.writeHead(200,{'content-type':'text/html'});res.end(`<!doctype html><html><body style="background:#293b47;color:#eee;font:20px sans-serif;padding:25px"><h1 id="policy"></h1><button id="escape">Test popup and redirect</button><output id="result"></output><script>document.getElementById('policy').textContent=window.frameElement.hasAttribute('sandbox')?'Protected player loaded':'Native compatible player loaded';document.getElementById('escape').onclick=()=>{let popup=false,redirect=false;try{popup=window.open('/__qa/popup.html','_blank')===null}catch{popup=true}try{top.location.href='/__qa/escaped.html'}catch{redirect=true}document.getElementById('result').textContent=popup&&redirect?'Popup and redirect blocked':'FAIL: player escaped'}</script></body></html>`);return;
    }
    if(url.pathname.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'Other network services are disabled in local QA.'}));return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
    const bytes=await readFile(path);res.writeHead(200,{'content-type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[extname(path)]||'application/octet-stream'});res.end(bytes);
  }catch(error){if(!res.headersSent)res.writeHead(404);res.end('Not found');}
});
server.listen(qaPort,'127.0.0.1',()=>console.log('Isolated notebooks preview: http://127.0.0.1:'+qaPort+'/#notes'));
process.on('SIGINT',async()=>{server.close();await mf.dispose();process.exit();});
