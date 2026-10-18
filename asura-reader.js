const ASURA='https://asurascans.com';
const asuraError=(message,status=400)=>Object.assign(new Error(message),{status});
function siteUrl(value,base=ASURA){
 const url=new URL(value,base);
 if(url.protocol!=='https:'||url.port||!['asurascans.com','www.asurascans.com'].includes(url.hostname)||url.username||url.password)throw asuraError('Unsupported Asura page address.');
 return url;
}
function imageUrl(value,kind,base=ASURA){
 try{const url=new URL(value,base);return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&['cdn.asurascans.com','asurascans.com','www.asurascans.com'].includes(url.hostname)&&url.pathname.startsWith('/asura-images/'+kind+'/')?url.toString():'';}catch{return '';}
}
function decode(value){return String(value||'').replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[a-f0-9]+);/gi,entity=>{const key=entity.slice(1,-1).toLowerCase();if(key[0]==='#'){const n=key[1]==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[key]||entity;});}
function attributes(tag){const result={};for(const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))result[match[1].toLowerCase()]=decode(match[2]??match[3]??match[4]);return result;}
function cleanHtml(value){return String(value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');}
function text(value){return decode(value.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();}
function path(value,chapter=false){
 const pattern=chapter?/^\/comics\/[a-z0-9-]+\/chapter\/\d+(?:\.\d+)?$/:/^\/comics\/[a-z0-9-]+$/;
 if(!pattern.test(value||'')||value.length>250)throw asuraError('Choose a valid Asura '+(chapter?'chapter':'title')+'.');return value;
}
async function fetchHtml(value,fetcher){
 let url=siteUrl(value);
 for(let hop=0;hop<4;hop++){
  const response=await fetcher(url.toString(),{headers:{accept:'text/html','user-agent':'CommandCentre/1.0 (Asura reader)'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw asuraError('Asura returned a redirect without a destination.',502);url=siteUrl(location,url);continue;}
  if(!response.ok)throw asuraError(response.status===429?'Asura is busy. Wait a moment and retry.':`Asura could not load this page (HTTP ${response.status}).`,response.status===429?429:502);
  const html=await response.text();if(html.length>6*1024*1024)throw asuraError('The Asura page is too large to read.',502);
  return {html,url};
 }
 throw asuraError('Asura redirected too many times.',502);
}
export function parseAsuraSearch(html,base=ASURA){
 const results=new Map();
 for(const match of cleanHtml(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const a=attributes(match[1]);let url;try{url=siteUrl(a.href,base);path(url.pathname);}catch{continue;}
  const image=attributes(match[2].match(/<img\b([^>]*)>/i)?.[1]||''),title=(image.alt||text(match[2])).trim();
  if(!title||results.has(url.pathname))continue;
  results.set(url.pathname,{id:url.pathname,title,description:'',status:'Asura Scans',source:'asura',cover:imageUrl(image.src||image['data-src'],'covers',base),url:url.origin+url.pathname});
 }
 return [...results.values()].slice(0,40);
}
export function parseAsuraChapters(html,base){
 const series=siteUrl(base).pathname,chapters=new Map();
 for(const match of cleanHtml(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const a=attributes(match[1]);let url;try{url=siteUrl(a.href,base);path(url.pathname,true);}catch{continue;}
  if(!url.pathname.startsWith(series+'/chapter/'))continue;
  const chapter=url.pathname.split('/').at(-1),label=text(match[2].match(/<span\b[^>]*class="[^"]*font-medium[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]||match[2]);
  if(chapters.has(url.pathname))continue;
  chapters.set(url.pathname,{id:url.pathname,chapter,title:label.replace(/^chapter\s*[\d.]+\s*/i,'').slice(0,160),volume:null,pages:null,group:'',url:url.origin+url.pathname});
 }
 return [...chapters.values()].sort((a,b)=>Number(a.chapter)-Number(b.chapter)).slice(0,1500);
}
export function parseAsuraPages(html,base){
 const pages=[],seen=new Set();
 for(const match of cleanHtml(html).matchAll(/<img\b([^>]*)>/gi)){
  const a=attributes(match[1]);if(!/^\d+$/.test(a['data-page-index']||'')&&!/^Page\s+\d+\s*-\s*Chapter/i.test(a.alt||''))continue;
  const url=imageUrl(a.src||a['data-src'],'chapters',base);if(!url||seen.has(url))continue;
  seen.add(url);pages.push({url,index:a['data-page-index']!==undefined?Number(a['data-page-index']):Number(a.alt.match(/^Page\s+(\d+)/i)?.[1])-1});
 }
 return pages.sort((a,b)=>a.index-b.index).slice(0,1000).map(page=>page.url);
}
export async function asuraRequest(url,fetcher=fetch){
 if(url.pathname==='/api/manga/search'){
  const query=String(url.searchParams.get('q')||'').trim().slice(0,200);if(!query)throw asuraError('Enter a manga title.');
  const source=new URL('/browse',ASURA);source.searchParams.set('q',query);
  const {html,url:base}=await fetchHtml(source,fetcher);
  return {source:'Asura Scans',results:parseAsuraSearch(html,base)};
 }
 if(url.pathname==='/api/manga/chapters'){
  if((url.searchParams.get('language')||'en')!=='en')throw asuraError('This Asura source supplies English chapters.');
  const series=path(url.searchParams.get('id')),{html,url:base}=await fetchHtml(new URL(series,ASURA),fetcher);
  const chapters=parseAsuraChapters(html,base);
  return {source:'Asura Scans',id:series,chapters,total:chapters.length,nextOffset:null};
 }
 if(url.pathname==='/api/manga/pages'){
  const chapter=path(url.searchParams.get('id'),true),{html,url:base}=await fetchHtml(new URL(chapter,ASURA),fetcher);
  const pages=parseAsuraPages(html,base);if(!pages.length)throw asuraError('Asura did not provide readable page images for this chapter. Try another chapter or source.',502);
  return {source:'Asura Scans',id:chapter,url:base.toString(),pages,originalPages:[]};
 }
 throw asuraError('Unknown manga request.',404);
}
