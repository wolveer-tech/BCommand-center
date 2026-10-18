import {asuraRequest} from './asura-reader.js';
import {comixRequest} from './comix-reader.js';
const API='https://api.mangadex.org';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':status===200?'public, max-age=60':'no-store'}});
function id(value){if(!UUID.test(value||''))throw error('Choose a valid MangaDex title or chapter.');return value;}
function offset(value){const n=Number(value||0);if(!Number.isInteger(n)||n<0||n>10000)throw error('Invalid chapter offset.');return n;}
function title(value){return value?.en||value?.['ja-ro']||Object.values(value||{})[0]||'Untitled manga';}
async function upstream(path,params,fetcher){
 const url=new URL(path,API);for(const [key,value] of params)url.searchParams.append(key,String(value));
 // Workers supports manual/follow. Inspect 3xx responses below instead of following them.
 const result=await fetcher(url.toString(),{headers:{accept:'application/json','user-agent':'CommandCentre/1.0 (MangaDex reader)'},signal:AbortSignal.timeout(15000),redirect:'manual'});
 if(!result.ok)throw error(result.status===429?'MangaDex is busy. Wait a moment and retry.':`MangaDex could not load this request (HTTP ${result.status}).`,result.status===429?429:502);
 const data=await result.json();if(data.result!=='ok')throw error('MangaDex returned an unavailable result.',502);return data;
}
export async function mangaRequest(url,fetcher=fetch){
 const source=url.searchParams.get('source')||'mangadex';
 if(source==='asura')return asuraRequest(url,fetcher);
 if(source==='comix')return comixRequest(url,fetcher);
 if(source!=='mangadex')throw error('Choose a supported manga source.');
 if(url.pathname==='/api/manga/search'){
  const query=String(url.searchParams.get('q')||'').trim().slice(0,200);if(!query)throw error('Enter a manga title.');
  const data=await upstream('/manga',[['title',query],['limit',20],['includes[]','cover_art'],['contentRating[]','safe'],['contentRating[]','suggestive'],['order[relevance]','desc']],fetcher);
  return {source:'MangaDex',results:(data.data||[]).filter(x=>UUID.test(x.id)).map(x=>{
   const cover=x.relationships?.find(r=>r.type==='cover_art')?.attributes?.fileName;
   return {id:x.id,title:title(x.attributes?.title),description:title(x.attributes?.description),status:x.attributes?.status||'',cover:cover&&/^[a-z0-9_.-]+$/i.test(cover)?`https://uploads.mangadex.org/covers/${x.id}/${cover}.256.jpg`:'',url:`https://mangadex.org/title/${x.id}`};
  })};
 }
 if(url.pathname==='/api/manga/chapters'){
  const manga=id(url.searchParams.get('id')),start=offset(url.searchParams.get('offset')),language=url.searchParams.get('language')||'en';
  if(!['en','ja','ko','zh','zh-hk','es','fr','de','pt-br','it'].includes(language))throw error('Choose a supported chapter language.');
  const data=await upstream(`/manga/${manga}/feed`,[['limit',100],['offset',start],['translatedLanguage[]',language],['order[volume]','asc'],['order[chapter]','asc'],['includes[]','scanlation_group'],['includeFutureUpdates',0]],fetcher);
  return {source:'MangaDex',id:manga,chapters:(data.data||[]).filter(x=>UUID.test(x.id)&&x.attributes?.pages>0&&!x.attributes?.externalUrl).map(x=>({id:x.id,title:x.attributes.title||'',chapter:x.attributes.chapter,volume:x.attributes.volume,pages:x.attributes.pages,group:x.relationships?.find(r=>r.type==='scanlation_group')?.attributes?.name||'',url:`https://mangadex.org/chapter/${x.id}`})),nextOffset:start+(data.data?.length||0)<data.total?start+(data.data?.length||100):null,total:data.total||0};
 }
 if(url.pathname==='/api/manga/pages'){
  const chapter=id(url.searchParams.get('id')),data=await upstream(`/at-home/server/${chapter}`,[['forcePort443','true']],fetcher);
  const base=new URL(data.baseUrl),hash=data.chapter?.hash;
  if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!/(^|\.)(mangadex\.network|mangadex\.org)$/.test(base.hostname)||!/^[a-f0-9]{16,64}$/i.test(hash||''))throw error('MangaDex returned an unsupported image server.',502);
  const files=Array.isArray(data.chapter.dataSaver)&&data.chapter.dataSaver.length?data.chapter.dataSaver:data.chapter.data;
  if(!Array.isArray(files)||!files.length||files.length>1000||files.some(file=>!/^[a-z0-9_.-]+$/i.test(file)))throw error('This chapter has no available page images.',502);
  const quality=files===data.chapter.dataSaver?'data-saver':'data',root=base.toString().replace(/\/$/,'');
  const originals=Array.isArray(data.chapter.data)&&data.chapter.data.length===files.length&&data.chapter.data.every(file=>/^[a-z0-9_.-]+$/i.test(file))?data.chapter.data.map(file=>`${root}/data/${hash}/${file}`):[];
  return {source:'MangaDex',id:chapter,url:`https://mangadex.org/chapter/${chapter}`,pages:files.map(file=>`${root}/${quality}/${hash}/${file}`),originalPages:originals};
 }
 throw error('Unknown manga request.',404);
}
export async function handleManga(request,ctx,fetcher=fetch){
 if(request.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS'}});
 if(request.method!=='GET')return response({error:'Use GET for manga reading.'},405);
 try{
  const cache=globalThis.caches?.default;
  const cached=cache?await cache.match(request):null;if(cached)return cached;
  const result=response(await mangaRequest(new URL(request.url),fetcher));
  if(cache&&ctx?.waitUntil)ctx.waitUntil(cache.put(request,result.clone()).catch(()=>{}));
  return result;
 }catch(e){return response({error:e.message||'Manga could not be loaded.',...(e.externalUrls?{externalUrls:e.externalUrls}:{})},e.status||502);}
}
