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
    if(fixtures && url.pathname.startsWith('/api/manga/')){
      const series={id:'/comics/preview-story',source:'asura',title:'Preview story',status:'Ongoing',cover:'',url:'https://asurascans.com/comics/preview-story'};
      const chapters=[1,2].map(n=>({id:`/comics/preview-story/chapter/${n}`,chapter:String(n),title:`Chapter ${n}`,url:`https://asurascans.com/comics/preview-story/chapter/${n}`}));
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
