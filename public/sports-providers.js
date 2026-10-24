// Public provider feeds. Keep categories separate and accept only observed embeds.
const PPV_FEEDS=['https://api.ppv.tj/api/streams','https://api.ppv.st/api/streams'];
const TIMSTREAMS_FEED='https://tim-streams.com/api/live-upcoming';
const categories={soccer:['soccer','football'],tennis:['tennis'],basketball:['basketball'],athletics:['athletics','track and field']};
const text=(value,max=180)=>String(value??'').slice(0,max);
function embed(value,host,path){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&url.hostname===host&&path.test(url.pathname)?url.href:'';}catch{return '';}
}
function matches(value,category){return (categories[category]||[category]).includes(String(value||'').toLowerCase());}
export function parseMatchoraFeed(data,category='soccer'){
  const seen=new Set(),streams=[];
  for(const event of Array.isArray(data?.events)?data.events:[]){
    if(!matches(event.sport,category)||event.finished===true||['FT','FINISHED','CANCELLED','POSTPONED'].includes(String(event.status).toUpperCase()))continue;
    const url=embed(event.embed_url,'matchora.to',/^\/embed\/match\/\d+\/?$/),id=text(event.id,100);
    if(!url||!id||seen.has(id))continue;seen.add(id);
    const sources=[{url,label:'Match player'},...(Array.isArray(event.channels)?event.channels:[]).filter(channel=>!channel.dead).map(channel=>({url:embed(channel.embed_url,'matchora.to',/^\/embed\/channel\/\d+\/?$/),label:text(channel.name||'Channel',60)})).filter(source=>source.url)].slice(0,50);
    streams.push({id,name:[event.home,event.away].filter(Boolean).join(' vs ').slice(0,180),league:text(event.league,120),category,match_timestamp:Number(event.kickoff)||null,viewers:Number(event.watching)||0,sources,team1:{name:text(event.home,120),logo:event.home_badge||''},team2:{name:text(event.away,120),logo:event.away_badge||''}});
  }
  return {streams,providerCount:streams.length};
}
export function parsePpvFeed(data,category='soccer',now=Date.now()/1000){
  const seen=new Set(),streams=[];
  for(const group of Array.isArray(data?.streams)?data.streams:[]){
    if(!matches(group.category,category))continue;
    for(const event of Array.isArray(group.streams)?group.streams:[]){
      if(![true,1,'1'].includes(event.always_live)&&Number(event.ends_at)>0&&Number(event.ends_at)<now)continue;
      const sources=[event,...(Array.isArray(event.substreams)?event.substreams:[])].map(source=>({url:embed(source.iframe,'taifood-blog.asia',/^\/embed\/[a-z0-9_\/-]+$/i),label:text(source.source_tag||source.name||'Player',60)})).filter(source=>source.url);
      const id=text(event.id,100);if(!id||!sources.length||seen.has(id))continue;seen.add(id);
      streams.push({id,name:text(event.name||'Live stream'),league:text(event.tag||group.category,120),category,match_timestamp:Number(event.starts_at)>0?Number(event.starts_at):null,viewers:Number(event.viewers)||0,thumbnail_url:event.poster||'',sources});
    }
  }
  return {streams,providerCount:streams.length};
}
function timStreamsTime(value){
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value||''));
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=Number(match[6]||0);
  const utc=Date.UTC(year,month-1,day,hour,minute,second);
  const date=new Date(utc);
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date.getUTCHours()!==hour||date.getUTCMinutes()!==minute)return null;
  // TimStreams displays its unzoned schedule in New York time.
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]));
  const offset=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second)-utc;
  return (utc-offset)/1000;
}
export function parseTimStreamsFeed(data,category='soccer'){
  const genres=new Map(),subgenres=new Map(),seen=new Set(),streams=[];
  for(const genre of Array.isArray(data?.genres)?data.genres:[]){
    genres.set(Number(genre.id),String(genre.name||'').toLowerCase());
    for(const sub of Array.isArray(genre.sub_categories)?genre.sub_categories:[])subgenres.set(`${genre.id}:${sub.id}`,text(sub.name,120));
  }
  for(const event of (Array.isArray(data?.events)?data.events:[]).slice(0,500)){
    if(event?.vip||!matches(genres.get(Number(event?.genre)),category))continue;
    const id=String(event.url||'');
    if(!/^[a-z0-9-]{1,120}$/.test(id)||seen.has(id))continue;
    const sources=(Array.isArray(event.streams)?event.streams:[]).filter(source=>!source?.vip).map(source=>{
      const url=embed(source.url,'ehgembxe.cfd',/^\/[a-z0-9-]{1,120}\/?$/);
      return {url,label:text(source.name||'Player',60)};
    }).filter(source=>source.url).slice(0,20);
    if(!sources.length)continue;
    seen.add(id);
    streams.push({id,name:text(event.name||'Live game'),league:subgenres.get(`${event.genre}:${event.sub_genre}`)||'Live sport',category,match_timestamp:timStreamsTime(event.time),viewers:Number(event.viewers)||0,thumbnail_url:text(event.logo,500),sources});
  }
  return {streams,providerCount:streams.length};
}
async function feed(url,fetcher,headers={}){
  const response=await fetcher(url,{headers:{accept:'application/json',...headers},redirect:'manual',signal:AbortSignal.timeout(6500)});
  if(!response.ok)throw new Error(`Sports provider returned HTTP ${response.status}.`);
  const data=await response.json();
  if(data?.success===false)throw new Error('Sports provider rejected the feed request. Try another source.');
  return data;
}
export async function fetchPublicSports(provider,category,{fetcher=fetch}={}){
  if(provider==='matchora')return parseMatchoraFeed(await feed('https://matchora.to/api/v1/schedule?watchable=1',fetcher),category);
  if(provider==='timstreams')return parseTimStreamsFeed(await feed(TIMSTREAMS_FEED,fetcher),category);
  if(provider!=='ppv')throw new Error('Unknown sports provider.');
  let error;for(const url of PPV_FEEDS){try{
    const data=await feed(url,fetcher,{referer:'https://ppv.tj/','user-agent':'Mozilla/5.0',origin:'https://ppv.tj'});
    if(!Array.isArray(data?.streams))throw new Error('PPV returned no stream feed. Try another source.');
    const parsed=parsePpvFeed(data,category);
    if(!parsed.streams.length){const groups=data.streams,group=groups.find(group=>matches(group.category,category)),rows=Array.isArray(group?.streams)?group.streams:[];parsed.diagnostic=`PPV returned ${groups.length} categories and ${rows.length} ${category} listings; no supported current player links were available. Try Auto or another source.`;}
    return parsed;
  }catch(cause){error=cause;}}
  throw error;
}
