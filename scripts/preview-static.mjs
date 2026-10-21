import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('public');
const port = Number(process.argv[2]) || 8787;
const fixtures = process.argv.includes('--fixtures');
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1:8787');
    if(fixtures&&url.pathname==='/__qa/streamcorner-embed.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(await readFile('tests/streamcorner-embed.browser.html'));return;
    }
    if(fixtures&&['/__qa/schoolbook-practice-app.html','/__qa/ai-keys-app.html'].includes(url.pathname)){
      const html=await readFile('public/index.html','utf8'),fixture=await readFile('tests/schoolbook-practice.browser.html','utf8');
      const setup=fixture.match(/<script>([\s\S]*?)<\/script>/)[1];
      const vault=url.pathname==='/__qa/ai-keys-app.html'?await readFile('tests/ai-keys.browser-setup.js','utf8'):'';
      const bridge='<script>(()=>{'+setup+'\n'+vault+'\nwindow.CommandCentreNativeRecovery=[{id:"practice-fixture",savedAt:Date.now(),state:{...state,events:[],reminders:[],bibleRead:{}}}];})();</script>';
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(html.replace('<head>','<head>'+bridge));return;
    }
    if(fixtures&&url.pathname==='/__qa/schoolbook-practice.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(await readFile('tests/schoolbook-practice.browser.html'));return;
    }
    if(fixtures&&url.pathname==='/__qa/state-recovery.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(await readFile('tests/state-recovery.browser.html'));return;
    }
    if(fixtures&&url.pathname==='/__qa/intro.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(await readFile('tests/intro.browser.html'));return;
    }
    if(fixtures&&url.pathname==='/__qa/native.html'){
      const html=await readFile('public/index.html','utf8');
      const bridge=`<script>window.CommandCentreIntroSessionManaged=true;window.CommandCentreNative={storageMaintenance:true,platform:'ios'};window.webkit={messageHandlers:{nativeData:{postMessage:message=>{if(message.action==='clearCachedFiles')setTimeout(()=>dispatchEvent(new Event('cc-native-cache-cleared')),100)}}}};</script>`;
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(html.replace('<head>','<head>'+bridge));return;
    }
    if(fixtures&&url.pathname==='/__qa/note-images.html'){
      response.writeHead(200,{'content-type':'text/html; charset=utf-8'});response.end(await readFile('tests/note-images.browser.html'));return;
    }
    // Opt-in, disposable data for UI verification. Never used by the Worker.
    if(fixtures&&url.pathname==='/api/live-content/providers'){
      response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({providers:[{id:'1',name:'TitaniumStream',mode:'titanium',configured:true},{id:'2',name:'StreamCorner',mode:'embedded',hostname:'streamcorner.st',configured:true},{id:'3',name:'SportsindX',mode:'sportsindx',configured:true},{id:'4',name:'Matchora',mode:'matchora',configured:true},{id:'5',name:'PPV',mode:'ppv',configured:true}]}));return;
    }
    if(fixtures&&url.pathname==='/api/live-content'&&url.searchParams.get('provider')==='2'){
      response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({providerId:'2',providerName:'StreamCorner',mode:'embedded',browserUrl:'https://streamcorner.st/',category:url.searchParams.get('category')||'soccer',count:0,streams:[]}));return;
    }
    if(fixtures && url.pathname.startsWith('/api/manga/')){
      const katana=url.searchParams.get('source')==='mangakatana';
      const series=katana?{id:'/manga/preview-story.42',source:'mangakatana',title:'Preview story',status:'Ongoing',cover:'',url:'https://mangakatana.com/manga/preview-story.42'}:{id:'/comics/preview-story',source:'asura',title:'Preview story',status:'Ongoing',cover:'',url:'https://asurascans.com/comics/preview-story'};
      const chapters=[1,2].map(n=>({id:series.id+(katana?`/c${n}`:`/chapter/${n}`),chapter:String(n),title:`Chapter ${n}`,url:series.url+(katana?`/c${n}`:`/chapter/${n}`)}));
      const endpoint=url.pathname.split('/').at(-1);
      const data=endpoint==='search'?{results:[series]}:endpoint==='chapters'?{chapters,nextOffset:null}:endpoint==='pages'?{pages:[1,2,3].map(n=>`http://127.0.0.1:${port}/__qa/page.svg?n=${n}`),originalPages:[]}:null;
      response.writeHead(data?200:404,{'content-type':'application/json'});response.end(JSON.stringify(data||{error:'Not found'}));return;
    }
    if(fixtures && url.pathname==='/__qa/page.svg'){
      response.writeHead(200,{'content-type':'image/svg+xml'});response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#b3c9d5"/><path d="M40 800V260L300 60V350H560V800Z" fill="#92a5be"/><text x="50" y="150" font-family="sans-serif" font-size="36" fill="#263247">Preview page ${Number(url.searchParams.get('n'))||1}</text></svg>`);return;
    }
    if (url.pathname.startsWith('/api/')) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Network-backed features are disabled in the local preview.' }));
      return;
    }
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const path = resolve(root, relative);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    const bytes = await readFile(path);
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    response.end(bytes);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`Command Centre preview: http://127.0.0.1:${port}/`));
process.on('SIGINT', () => server.close(() => process.exit(0)));
