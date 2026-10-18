// These endpoints and player hosts come from the two sites' public pages.
const MAIN='https://titaniumstream.pages.dev';
const BACKUP='https://stream.streamportal1111.workers.dev';
const PLAYER_HOSTS=new Set(['taifood-blog.asia','trendy48.online','embed.st']);
const fail=message=>Object.assign(new Error(message),{status:502});
function text(value){return String(value||'').replace(/<[^>]*>/g,'').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();}
function attribute(value,name){return value.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]||'';}
function playerUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&PLAYER_HOSTS.has(url.hostname)&&!url.username&&!url.password?url.toString():'';}catch{return '';}}
async function request(url,fetcher){
  const origin=new URL(url).origin,signal=AbortSignal.timeout(6500);
  for(let redirects=0;redirects<=2;redirects++){
    const response=await fetcher(url,{headers:{accept:'application/json,text/html;q=0.9'},redirect:'manual',signal});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');
      const next=location?new URL(location,url):null;
      if(!next||next.origin!==origin||next.username||next.password)throw fail('Sports provider redirected outside its configured site.');
      url=next.toString();continue;
    }
    if(!response.ok)throw fail(`Sports provider returned HTTP ${response.status}.`);
    return response;
  }
  throw fail('Sports provider redirected too many times.');
}
export function parseTitaniumListing(html,category='soccer'){
  const groups=new Map();
  for(const match of String(html).matchAll(/<a\b([^>]*\bdata-event-id\s*=\s*["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)){
    const path=attribute(match[1],'href'),body=match[2];
    if(!/^footballevent\d+b?\.html$/.test(path))continue;
    const name=text(body.match(/class=["']title-text["'][^>]*>([\s\S]*?)<\//i)?.[1]);
    if(!name)continue;
    const date=attribute(body,'data-date'),stamp=Date.parse(date);
    const key=name+'|'+date;
    let stream=groups.get(key);
    if(!stream){
      const image=attribute(body.match(/<img\b[^>]*>/i)?.[0]||'','src');
      let thumbnail='';try{const url=new URL(image,MAIN);if(image&&url.origin===MAIN)thumbnail=url.toString();}catch{}
      stream={id:path.replace(/b?\.html$/,''),name,category,league:text(body.match(/class=["']box-meta["'][^>]*>([\s\S]*?)<\//i)?.[1]),match_timestamp:Number.isFinite(stamp)?stamp/1000:null,thumbnail_url:thumbnail,sources:[],source_refs:[]};
      groups.set(key,stream);
    }
    stream.source_refs.push({source:'titanium',id:path,label:/b\.html$/.test(path)?'Alternate player':'Main player'});
  }
  return [...groups.values()];
}
export function parsePortalFeed(data,category,now=Date.now()/1000){
  const wanted=category==='soccer'?'football':category.toLowerCase();
  return (Array.isArray(data?.streams)?data.streams:[]).filter(group=>String(group.category||'').toLowerCase()===wanted).flatMap(group=>(Array.isArray(group.streams)?group.streams:[]).flatMap((item,index)=>{
    const start=Number(item.starts_at)||0,end=Number(item.ends_at)||(start?start+(wanted==='football'?10800:14400):0);
    if(item.noLinksAvailable||(String(item.always_live)!=='1'&&end&&end<=now))return [];
    const refs=(Array.isArray(item.sources)?item.sources:[]).filter(ref=>ref&&typeof ref.source==='string'&&typeof ref.id==='string'&&ref.source.length<=60&&ref.id.length<=300&&!/[\u0000-\u001f]/.test(ref.source+ref.id)).map(ref=>({source:'portal:'+ref.source,id:ref.id,label:ref.source}));
    if(!refs.length)return [];
    return [{id:String(item.id||'portal-'+index),name:String(item.name||'Live sport'),category,league:String(group.category||''),match_timestamp:start||null,thumbnail_url:typeof item.poster==='string'?item.poster:'',sources:[],source_refs:refs}];
  }));
}
export async function fetchTitaniumSports(category,{backup=false,fetcher=fetch}={}){
  // The main site currently publishes football. Other categories use its backup.
  if(!backup&&category==='soccer'){
    try{
      const response=await request(MAIN+'/football.html',fetcher);
      const streams=parseTitaniumListing(await response.text(),category);
      if(streams.length)return {streams,site:'main'};
    }catch{/* Continue to the user's designated backup. */}
  }
  const response=await request(BACKUP+'/streams',fetcher);
  return {streams:parsePortalFeed(await response.json(),category),site:'backup'};
}
export async function resolveTitaniumSource(source,id,{fetcher=fetch}={}){
  let candidates=[];
  if(source==='titanium'){
    if(!/^footballevent\d+b?\.html$/.test(id))throw Object.assign(new Error('Invalid Titanium match reference.'),{status:400});
    const response=await request(MAIN+'/'+id,fetcher);
    const html=await response.text();
    candidates=[...html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match=>({url:match[1],label:'Titanium player'}));
  }else if(source.startsWith('portal:')){
    const provider=source.slice(7);
    if(!provider||provider.length>60||!id||id.length>300||/[\u0000-\u001f\u007f]/.test(provider+id))throw Object.assign(new Error('Invalid backup match reference.'),{status:400});
    const response=await request(BACKUP+'/resolve-stream?'+new URLSearchParams({source:provider,id}),fetcher);
    const data=await response.json();
    candidates=(Array.isArray(data)?data:[]).map(item=>({url:item.embedUrl,label:[item.language,item.hd?'HD':'SD'].filter(Boolean).join(' ')}));
  }else throw Object.assign(new Error('Unknown Titanium source.'),{status:400});
  const sources=candidates.map(item=>({...item,url:playerUrl(item.url)})).filter(item=>item.url);
  if(!sources.length)throw fail('This match has no supported live player yet. Try another player or the StreamPortal backup.');
  return {url:sources[0].url,kind:'iframe',label:sources[0].label,sources};
}
