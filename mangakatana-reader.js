const SITE='https://mangakatana.com';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const SERIES=/^\/manga\/[a-z0-9]+(?:-[a-z0-9]+)*\.\d+$/;
const CHAPTER=/^\/manga\/[a-z0-9]+(?:-[a-z0-9]+)*\.\d+\/c\d+(?:\.\d+)?$/;
function path(value,chapter=false){
 if(typeof value!=='string'||value.length>600||!(chapter?CHAPTER:SERIES).test(value))throw fail('Choose a valid MangaKatana '+(chapter?'chapter':'title')+'.');
 return value;
}
function siteUrl(value,base=SITE){
 const url=new URL(value,base);
 if(url.protocol!=='https:'||url.port||url.username||url.password||!['mangakatana.com','www.mangakatana.com'].includes(url.hostname))throw fail('Unsupported MangaKatana page address.');
 // Only public catalogue/title/chapter pages can be fetched, including redirects.
 if(url.pathname!=='/'&&!SERIES.test(url.pathname)&&!CHAPTER.test(url.pathname))throw fail('Unsupported MangaKatana page address.');
 return url;
}
function imageUrl(value,cover=false){
 try{
  const url=new URL(value,SITE);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.toString().length>2400)return '';
  const allowed=cover?['mangakatana.com','www.mangakatana.com'].includes(url.hostname)&&url.pathname.startsWith('/imgs/cover/'):
   /^i[1-9]\d?\.mangakatana\.com$/.test(url.hostname)&&/^\/(?:token|manga)\//.test(url.pathname);
  return allowed&&/\.(?:avif|webp|jpe?g|png|gif)$/i.test(url.pathname)?url.toString():'';
 }catch{return '';}
}
function decode(value){return String(value||'').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[a-f0-9]+);/gi,entity=>{
 const key=entity.slice(1,-1).toLowerCase();if(key[0]==='#'){const n=key[1]==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[key]||entity;
});}
function attrs(tag){const result={};for(const m of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return result;}
function clean(html){return String(html||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');}
function text(html){return decode(String(html||'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').replace(/\s+([,.;:!?])/g,'$1').trim();}
// Limit parsing to the real catalogue/reader region, excluding recommendations and ads.
function region(html,id){
 for(const m of html.matchAll(/<div\b([^>]*)>/gi)){
  if(attrs(m[1]).id!==id)continue;
  const start=m.index+m[0].length,tags=/<\/?div\b[^>]*>/gi;tags.lastIndex=start;let depth=1,tag;
  while((tag=tags.exec(html))){depth+=/^<\//.test(tag[0])?-1:1;if(!depth)return html.slice(start,tag.index);}
  return '';
 }
 return '';
}
function seriesUrl(value,base){try{const url=siteUrl(value,base);path(url.pathname);return new URL(url.pathname,SITE);}catch{return null;}}
export function parseMangaKatanaSearch(html,base=SITE){
 const safe=clean(html),catalogue=region(safe,'book_list'),results=new Map();
 const items=catalogue.split(/<div\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bitem\b)[^>]*>/i).slice(1);
 for(const item of items){
  const heading=item.match(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i)?.[1]||'',link=heading.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
  if(!link)continue;const url=seriesUrl(attrs(link[1]).href,base),title=text(link[2]).slice(0,300);
  if(!url||!title||results.has(url.pathname))continue;
  const image=attrs(item.match(/<img\b([^>]*)>/i)?.[1]||'');
  results.set(url.pathname,{id:url.pathname,source:'mangakatana',title,url:url.toString(),cover:imageUrl(image.src||image['data-src']||image['lazy-src'],true),status:text(item.match(/<div\b[^>]*class=["'][^"']*\bstatus\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).slice(0,60),description:text(item.match(/<div\b[^>]*class=["'][^"']*\bsummary\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]).slice(0,1000)});
 }
 // A single search match may redirect straight to its title page.
 if(!catalogue&&region(safe,'single_book')){
  const url=seriesUrl(base,base),title=text(safe.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]).slice(0,300);
  const image=[...safe.matchAll(/<meta\b([^>]*)>/gi)].map(m=>attrs(m[1])).find(a=>a.property==='og:image')?.content;
  if(url&&title)results.set(url.pathname,{id:url.pathname,source:'mangakatana',title,url:url.toString(),cover:imageUrl(image,true),status:'',description:''});
 }
 return [...results.values()].slice(0,40);
}
export function parseMangaKatanaChapters(html,base){
 const series=path(siteUrl(base).pathname),chapters=new Map();
 for(const m of clean(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  let url;try{url=siteUrl(attrs(m[1]).href,base);path(url.pathname,true);}catch{continue;}
  if(!url.pathname.startsWith(series+'/'))continue;
  const chapter=url.pathname.split('/').at(-1).slice(1),label=text(m[2]);
  if(chapters.has(url.pathname))continue;
  chapters.set(url.pathname,{id:url.pathname,chapter,title:label.replace(/^Chapter\s*\d+(?:\.\d+)?\s*:?\s*/i,'').slice(0,160),volume:null,pages:null,group:'',url:new URL(url.pathname,SITE).toString()});
 }
 return [...chapters.values()].sort((a,b)=>Number(a.chapter)-Number(b.chapter)).slice(0,5000);
}
// Read only literal URL strings from the public page data; never execute upstream scripts.
function literalArray(body){
 const values=[];let rest=body.trim();
 while(rest){
  const m=rest.match(/^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*(,\s*|$)/);
  if(!m||values.length>=1000)return [];
  const raw=m[1].slice(1,-1);
  values.push(raw.replace(/\\(u[\da-f]{4}|x[\da-f]{2}|[\\/'"])/gi,(_,esc)=>esc[0]==='u'||esc[0]==='x'?String.fromCharCode(parseInt(esc.slice(1),16)):esc));
  rest=rest.slice(m[0].length);
 }
 return values;
}
export function parseMangaKatanaPages(html){
 const uncommented=String(html||'').replace(/<!--[\s\S]*?-->/g,''),pages=[],seen=new Set();
 const append=value=>{const url=imageUrl(value);if(url&&!seen.has(url)){seen.add(url);pages.push(url);}};
 for(const script of uncommented.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const data=script[1].match(/\b(?:var|let|const)\s+thzq\s*=\s*\[([\s\S]*?)\]\s*;/)?.[1];
  if(data!==undefined){const urls=literalArray(data);if(urls.length&&urls.every(u=>imageUrl(u))){urls.forEach(append);return pages;}}
 }
 // Also support source pages that provide the reader images directly in HTML.
 const reader=region(clean(html),'imgs');
 for(const m of reader.matchAll(/<img\b([^>]*)>/gi)){const image=attrs(m[1]);append(image['data-src']||image.src||image['lazy-src']);if(pages.length>=1000)break;}
 return pages;
}
async function fetchHtml(value,fetcher){
 let url=siteUrl(value);
 for(let hop=0;hop<4;hop++){
  const response=await fetcher(url.toString(),{headers:{accept:'text/html','user-agent':'CommandCentre/1.0 (MangaKatana reader)'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw fail('MangaKatana returned a redirect without a destination.',502);url=siteUrl(location,url);continue;}
  if(!response.ok)throw fail(response.status===429?'MangaKatana is busy. Wait a moment and retry.':`MangaKatana could not load this page (HTTP ${response.status}). Open the source link or try again later.`,response.status===429?429:502);
  if(!/text\/html/i.test(response.headers.get('content-type')||''))throw fail('MangaKatana returned an unsupported page.',502);
  if(Number(response.headers.get('content-length'))>6*1024*1024)throw fail('The MangaKatana page is too large to read.',502);
  const html=await response.text();if(html.length>6*1024*1024)throw fail('The MangaKatana page is too large to read.',502);
  return {html,url};
 }
 throw fail('MangaKatana redirected too many times.',502);
}
export async function mangaKatanaRequest(url,fetcher=fetch){
 if(url.pathname==='/api/manga/search'){
  const query=String(url.searchParams.get('q')||'').trim().slice(0,200);if(!query)throw fail('Enter a manga title.');
  const source=new URL('/',SITE);source.searchParams.set('search',query);source.searchParams.set('search_by','m_name');
  const {html,url:base}=await fetchHtml(source,fetcher);
  if(!/\bid=["'](?:book_list|single_book)["']/i.test(clean(html)))throw fail('MangaKatana search is unavailable. Try again later or use another source.',502);
  return {source:'MangaKatana',results:parseMangaKatanaSearch(html,base)};
 }
 if(url.pathname==='/api/manga/chapters'){
  if((url.searchParams.get('language')||'en')!=='en')throw fail('This MangaKatana source supplies English chapters.');
  const series=path(url.searchParams.get('id')),{html,url:base}=await fetchHtml(new URL(series,SITE),fetcher);
  const chapters=parseMangaKatanaChapters(html,base);if(!chapters.length)throw fail('MangaKatana did not provide a chapter list for this title. Open the source link or try another title.',502);
  return {source:'MangaKatana',id:series,chapters,total:chapters.length,nextOffset:null};
 }
 if(url.pathname==='/api/manga/pages'){
  const chapter=path(url.searchParams.get('id'),true),{html,url:base}=await fetchHtml(new URL(chapter,SITE),fetcher),pages=parseMangaKatanaPages(html);
  if(!pages.length)throw fail('MangaKatana did not provide readable page images for this chapter. Open the source link or try another chapter.',502);
  return {source:'MangaKatana',id:chapter,url:base.toString(),pages,originalPages:[]};
 }
 throw fail('Unknown manga request.',404);
}
