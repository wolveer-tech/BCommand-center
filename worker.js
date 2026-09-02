import { sendPushNotification } from '@mmmike/web-push/send';

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'}})}
function addDaysLocal(dateKey,n){const [y,m,d]=dateKey.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));dt.setUTCDate(dt.getUTCDate()+n);return dt.toISOString().slice(0,10)}
function nextLocalDate(dateKey,frequency){
  if(frequency==='daily') return addDaysLocal(dateKey,1);
  if(frequency==='every2days') return addDaysLocal(dateKey,2);
  if(frequency==='weekly') return addDaysLocal(dateKey,7);
  if(frequency==='monthly'){let [y,m,d]=dateKey.split('-').map(Number);m++;if(m>12){m=1;y++}const last=new Date(Date.UTC(y,m,0)).getUTCDate();return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`}
  if(frequency==='yearly'){let [y,m,d]=dateKey.split('-').map(Number);y++;return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`}
  return null;
}
function localToUtc(dateKey,time,timezone){
  const [y,m,d]=dateKey.split('-').map(Number),[hh,mm]=time.split(':').map(Number);
  const naive=Date.UTC(y,m-1,d,hh,mm,0,0);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(naive));
  const get=k=>Number(parts.find(p=>p.type===k)?.value||0); const asUtc=Date.UTC(get('year'),get('month')-1,get('day'),get('hour')%24,get('minute'),get('second'));
  const offset=asUtc-naive; return new Date(naive-offset).toISOString();
}

async function ensureNewsTables(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_preferences (
    device_id TEXT PRIMARY KEY,
    world_enabled INTEGER NOT NULL DEFAULT 1,
    financial_enabled INTEGER NOT NULL DEFAULT 1,
    push_mode TEXT NOT NULL DEFAULT 'major',
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_sent (
    device_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY(device_id,article_id)
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS news_cache (
    kind TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
}
function cleanNewsArticle(a,kind){
  return {
    id:String(a.article_id||a.link||`${kind}-${a.title||''}-${a.pubDate||''}`),
    kind,
    title:String(a.title||'').trim(),
    description:String(a.description||'').trim().slice(0,500),
    link:String(a.link||''),
    source:String(a.source_name||a.source_id||'News'),
    pubDate:a.pubDate||a.pubDateTZ||'',
    category:Array.isArray(a.category)?a.category:[]
  };
}
async function fetchNewsData(endpoint,env,params={}){
  if(!env.NEWSDATA_API_KEY) throw new Error('NEWSDATA_API_KEY is not configured');
  const u=new URL(`https://newsdata.io/api/1/${endpoint}`);
  u.searchParams.set('apikey',env.NEWSDATA_API_KEY);
  u.searchParams.set('language','en');
  u.searchParams.set('removeduplicate','1');
  for(const [k,v] of Object.entries(params))if(v!=null&&v!=='')u.searchParams.set(k,String(v));
  const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  if(!r.ok)throw new Error(`NewsData HTTP ${r.status}`);
  const data=await r.json();
  if(data.status==='error')throw new Error(data.results?.message||data.message||'NewsData error');
  return Array.isArray(data.results)?data.results:[];
}

async function fetchAlphaVantageFinancialNews(env){
  if(!env.ALPHA_VANTAGE_API_KEY) throw new Error('ALPHA_VANTAGE_API_KEY is not configured');
  const u=new URL('https://www.alphavantage.co/query');
  u.searchParams.set('function','NEWS_SENTIMENT');
  u.searchParams.set('topics','financial_markets,economy_macro,economy_monetary,earnings,finance');
  u.searchParams.set('sort','LATEST');
  u.searchParams.set('limit','25');
  u.searchParams.set('apikey',env.ALPHA_VANTAGE_API_KEY);
  const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  if(!r.ok)throw new Error(`Alpha Vantage HTTP ${r.status}`);
  const data=await r.json();
  if(data.Note||data.Information)throw new Error(data.Note||data.Information);
  return (Array.isArray(data.feed)?data.feed:[]).map(a=>({
    id:String(a.url||`${a.title||''}-${a.time_published||''}`),
    kind:'financial',title:String(a.title||'').trim(),description:String(a.summary||'').trim().slice(0,500),
    link:String(a.url||''),source:String(a.source||'Alpha Vantage'),pubDate:a.time_published||'',
    category:(a.topics||[]).map(x=>x.topic).filter(Boolean),
    overallSentimentLabel:a.overall_sentiment_label||'',overallSentimentScore:Number(a.overall_sentiment_score)
  })).filter(a=>a.title&&a.link);
}

async function newsCategory(env,kind,force=false){
  await ensureNewsTables(env);
  const cached=await env.DB.prepare('SELECT payload,updated_at FROM news_cache WHERE kind=?').bind(kind).first();
  const maxAge=60*60*1000;
  if(!force&&cached&&Date.now()-Number(cached.updated_at)<maxAge){
    try{return JSON.parse(cached.payload)}catch{}
  }
  const raw=kind==='financial'
    ? await fetchNewsData('market',env,{})
    : await fetchNewsData('latest',env,{category:'top,world'});
  const cleaned=raw.map(a=>cleanNewsArticle(a,kind)).filter(a=>a.title&&a.link).slice(0,10);
  await env.DB.prepare('INSERT INTO news_cache(kind,payload,updated_at) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
    .bind(kind,JSON.stringify(cleaned),Date.now()).run();
  return cleaned;
}
async function getNewsBundle(env,force=false,financialProvider='hybrid'){
  const worldPromise=newsCategory(env,'world',force);
  let financialPromise;
  if(financialProvider==='alphavantage') financialPromise=fetchAlphaVantageFinancialNews(env);
  else if(financialProvider==='newsdata') financialPromise=newsCategory(env,'financial',force);
  else financialPromise=(async()=>{try{const a=await fetchAlphaVantageFinancialNews(env);if(a.length)return a.slice(0,10)}catch(e){console.warn('Alpha Vantage failed; falling back to NewsData',e)}return newsCategory(env,'financial',force)})();
  const [world,financial]=await Promise.all([worldPromise,financialPromise]);
  return {world,financial,updatedAt:new Date().toISOString(),financialProvider};
}
function isMajorHeadline(a){
  const s=`${a.title||''} ${a.description||''}`.toLowerCase();
  const strong=[
    'breaking','war ','war:','invasion','missile','airstrike','ceasefire','earthquake','tsunami','hurricane','emergency',
    'election','resigns','resignation','assassination','coup','sanctions','terror','attack kills','hostage',
    'interest rate','rate cut','rate hike','central bank','bank of england','federal reserve','ecb','inflation',
    'recession','market crash','stock market falls','stock market rises','record high','record low',
    'bankruptcy','defaults','defaulted','merger','acquisition','takeover','profit warning'
  ];
  return strong.some(k=>s.includes(k));
}
async function sendNewsPushes(env){
  if(!env.NEWSDATA_API_KEY)return;
  await ensureNewsTables(env);
  const prefs=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
    FROM news_preferences p JOIN devices d ON d.device_id=p.device_id
    WHERE p.push_mode<>'off'`).all();
  if(!(prefs.results||[]).length)return;
  let bundle;
  try{bundle=await getNewsBundle(env,false)}catch(e){console.error('news fetch failed',e);return}
  for(const pref of prefs.results||[]){
    let candidates=[];
    if(pref.world_enabled)candidates.push(...bundle.world);
    if(pref.financial_enabled)candidates.push(...bundle.financial);
    candidates=candidates
      .filter(a=>pref.push_mode==='all'||isMajorHeadline(a))
      .sort((a,b)=>String(b.pubDate||'').localeCompare(String(a.pubDate||'')));
    let sent=0;
    for(const a of candidates){
      if(sent>=2)break;
      const seen=await env.DB.prepare('SELECT 1 ok FROM news_sent WHERE device_id=? AND article_id=?').bind(pref.device_id,a.id).first();
      if(seen)continue;
      try{
        await sendOne({
          endpoint:pref.endpoint,p256dh:pref.p256dh,auth:pref.auth,
          title:a.kind==='financial'?'📈 Financial news':'🌍 World update',
          body:a.title,url:a.link,id:`news-${a.id}`
        },env);
        await env.DB.prepare('INSERT OR IGNORE INTO news_sent(device_id,article_id,sent_at) VALUES(?,?,?)').bind(pref.device_id,a.id,Date.now()).run();
        sent++;
      }catch(e){console.error('news push failed',pref.device_id,a.id,e)}
    }
  }
  // Keep the dedupe table small.
  await env.DB.prepare('DELETE FROM news_sent WHERE sent_at<?').bind(Date.now()-14*86400000).run();
}


async function ensureBriefingTable(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS morning_briefing_preferences (
    device_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    local_time TEXT NOT NULL DEFAULT '07:30',
    timezone TEXT NOT NULL DEFAULT 'Europe/London',
    city TEXT NOT NULL DEFAULT 'London',
    bible_text TEXT NOT NULL DEFAULT '',
    last_sent_date TEXT,
    updated_at INTEGER NOT NULL
  )`).run();
}
function localPartsNow(timezone,date=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:timezone,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
  }).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
async function fetchBriefingWeather(city){
  try{
    const g=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city||'London')}&count=1&language=en&format=json`);
    if(!g.ok)return null;
    const gd=await g.json(),loc=gd.results?.[0];
    if(!loc)return null;
    const w=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,weather_code&timezone=auto`);
    if(!w.ok)return null;
    const wd=await w.json();
    const temp=Math.round(Number(wd.current?.temperature_2m));
    return Number.isFinite(temp)?`${temp}°C`:null;
  }catch{return null}
}
async function cachedHeadlineCount(env){
  try{
    await ensureNewsTables(env);
    const rows=await env.DB.prepare('SELECT payload FROM news_cache').all();
    let n=0;
    for(const r of rows.results||[]){
      try{n+=JSON.parse(r.payload||'[]').length}catch{}
    }
    return Math.min(n,20);
  }catch{return 0}
}
async function buildMorningBriefingBody(env,pref,localDate){
  const [weather,scheduleRow,headlineCount]=await Promise.all([
    fetchBriefingWeather(pref.city),
    env.DB.prepare(`SELECT COUNT(*) count FROM notifications WHERE device_id=? AND local_date=? AND kind IN ('reminder','event')`).bind(pref.device_id,localDate).first(),
    cachedHeadlineCount(env)
  ]);
  const pieces=[];
  if(weather)pieces.push(weather);
  const count=Number(scheduleRow?.count||0);
  pieces.push(`${count} scheduled`);
  if(pref.bible_text)pieces.push(pref.bible_text);
  if(headlineCount)pieces.push(`${headlineCount} headlines`);
  return pieces.join(' • ');
}
async function sendMorningBriefings(env){
  await ensureBriefingTable(env);
  const rows=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
    FROM morning_briefing_preferences p
    JOIN devices d ON d.device_id=p.device_id
    WHERE p.enabled=1`).all();
  for(const pref of rows.results||[]){
    const local=localPartsNow(pref.timezone||'Europe/London');
    if(local.time!==pref.local_time || pref.last_sent_date===local.date)continue;
    try{
      const body=await buildMorningBriefingBody(env,pref,local.date);
      await sendOne({
        endpoint:pref.endpoint,p256dh:pref.p256dh,auth:pref.auth,
        title:'☀️ Morning Briefing',
        body:body||'Your Command Centre briefing is ready.',
        url:'/#briefing',
        id:`morning-briefing-${pref.device_id}-${local.date}`
      },env);
      await env.DB.prepare('UPDATE morning_briefing_preferences SET last_sent_date=? WHERE device_id=?').bind(local.date,pref.device_id).run();
    }catch(e){console.error('morning briefing push failed',pref.device_id,e)}
  }
}




function normaliseBaseUrl(value){
  const raw=String(value||'').trim().replace(/\/$/,'');
  if(!raw)return null;
  const u=new URL(raw);if(u.protocol!=='https:')throw new Error('LIVE_CONTENT_API_BASE_URL must use HTTPS.');return u;
}
function allowedEmbedUrl(embedUrl,base,env){
  try{
    const u=new URL(embedUrl);if(u.protocol!=='https:')return false;
    const configured=String(env.LIVE_CONTENT_ALLOWED_EMBED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    const hosts=configured.length?configured:[base.hostname.toLowerCase()];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
async function liveContentStreams(env,category='soccer',requestUrl='https://local/api/live-content',force=false){
  if(!env.LIVE_CONTENT_API_BASE_URL){const err=new Error('LIVE_CONTENT_API_BASE_URL is not configured.');err.status=503;throw err}
  const base=normaliseBaseUrl(env.LIVE_CONTENT_API_BASE_URL);
  const safeCategory=String(category||'soccer').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'soccer';
  let cache=null,key=null;
  try{cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;if(cache&&!force){const u=new URL(requestUrl);u.pathname='/__cache/live-content';u.search=new URLSearchParams({category:safeCategory}).toString();key=new Request(u.toString());const hit=await cache.match(key);if(hit)return hit.json()}}catch{cache=null;key=null}
  const endpoint=new URL(base.toString());endpoint.pathname=endpoint.pathname.replace(/\/$/,'')+'/api/v1/streams';endpoint.searchParams.set('category',safeCategory);
  const headers={accept:'application/json'};
  if(env.LIVE_CONTENT_API_KEY)headers.authorization=`Bearer ${env.LIVE_CONTENT_API_KEY}`;
  const r=await fetch(endpoint.toString(),{headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const err=new Error(data?.message||data?.error||`Live content provider HTTP ${r.status}`);err.status=r.status>=400&&r.status<500?r.status:502;throw err}
  const streams=(Array.isArray(data.streams)?data.streams:[]).map(s=>({
    name:String(s.name||'Live stream').slice(0,180),
    category:String(s.category||safeCategory).slice(0,80),
    league:String(s.league||'').slice(0,120),
    stream_key:String(s.stream_key||'').slice(0,200),
    match_timestamp:Number(s.match_timestamp)||null,
    embed_url:allowedEmbedUrl(s.embed_url,base,env)?String(s.embed_url):'',
    thumbnail_url:(()=>{try{const u=new URL(s.thumbnail_url||'');return u.protocol==='https:'?u.toString():''}catch{return ''}})()
  })).filter(s=>s.embed_url);
  const payload={count:streams.length,streams,category:safeCategory,updatedAt:new Date().toISOString()};
  if(cache){try{if(!key){const u=new URL(requestUrl);u.pathname='/__cache/live-content';u.search=new URLSearchParams({category:safeCategory}).toString();key=new Request(u.toString())}await cache.put(key,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public,max-age=120'}}))}catch{}}
  return payload;
}

async function youtubeExplore(env,section='trending',requestUrl='https://local/api/youtube/explore',force=false){
  if(!env.YOUTUBE_API_KEY){const err=new Error('YOUTUBE_API_KEY is missing.');err.status=503;throw err}
  const allowed=new Set(['trending','gaming','music','sports','live']),mode=allowed.has(section)?section:'trending';let cache=null,cacheKey=null;
  try{cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;if(cache&&!force){const u=new URL(requestUrl);u.pathname='/__cache/youtube-explore';u.search=new URLSearchParams({section:mode}).toString();cacheKey=new Request(u.toString(),{method:'GET'});const hit=await cache.match(cacheKey);if(hit)return hit.json()}}catch(e){cache=null;cacheKey=null}
  let url;
  if(mode==='live'){
    url=new URL('https://www.googleapis.com/youtube/v3/search');url.searchParams.set('part','snippet');url.searchParams.set('type','video');url.searchParams.set('eventType','live');url.searchParams.set('videoEmbeddable','true');url.searchParams.set('maxResults','12');url.searchParams.set('q','live');url.searchParams.set('regionCode','GB');url.searchParams.set('relevanceLanguage','en');url.searchParams.set('key',env.YOUTUBE_API_KEY);
  }else{
    const category={gaming:'20',music:'10',sports:'17'}[mode]||'0';url=new URL('https://www.googleapis.com/youtube/v3/videos');url.searchParams.set('part','snippet,status');url.searchParams.set('chart','mostPopular');url.searchParams.set('maxResults','12');url.searchParams.set('regionCode','GB');if(category!=='0')url.searchParams.set('videoCategoryId',category);url.searchParams.set('key',env.YOUTUBE_API_KEY);
  }
  const r=await fetch(url.toString(),{headers:{accept:'application/json'}}),data=await r.json().catch(()=>({}));if(!r.ok){const err=new Error(data?.error?.message||`YouTube API HTTP ${r.status}`);err.status=r.status>=400&&r.status<500?r.status:502;throw err}
  const items=(data.items||[]).map(x=>{const searchStyle=!!x.id?.videoId;return{videoId:searchStyle?(x.id?.videoId||''):(x.id||''),title:x.snippet?.title||'',channelTitle:x.snippet?.channelTitle||'',publishedAt:x.snippet?.publishedAt||'',thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.high?.url||x.snippet?.thumbnails?.default?.url||'',live:mode==='live'||x.snippet?.liveBroadcastContent==='live'}}).filter(x=>x.videoId);
  const payload={section:mode,items,updatedAt:new Date().toISOString()};
  if(cache){try{if(!cacheKey){const u=new URL(requestUrl);u.pathname='/__cache/youtube-explore';u.search=new URLSearchParams({section:mode}).toString();cacheKey=new Request(u.toString(),{method:'GET'})}await cache.put(cacheKey,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public,max-age=900'}}))}catch(e){}}
  return payload;
}

async function searchYouTube(env,query,requestUrl){
  if(!env.YOUTUBE_API_KEY){
    const err=new Error('YOUTUBE_API_KEY is missing. Add it in Cloudflare → Workers & Pages → bcommand-center → Settings → Variables and Secrets.');
    err.status=503;
    throw err;
  }

  const q=String(query||'').trim();
  if(q.length<2){
    const err=new Error('Enter at least 2 characters to search YouTube.');
    err.status=400;
    throw err;
  }

  // Cache identical searches for 15 minutes when Cache API is available.
  let cache=null,cacheKey=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const cacheUrl=new URL(requestUrl);
      cacheUrl.pathname='/__cache/youtube-search';
      cacheUrl.search=new URLSearchParams({q:q.toLowerCase()}).toString();
      cacheKey=new Request(cacheUrl.toString(),{method:'GET'});
      const cached=await cache.match(cacheKey);
      if(cached)return cached.json();
    }
  }catch(e){
    console.warn('YouTube cache read skipped',e);
    cache=null;cacheKey=null;
  }

  const u=new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('part','snippet');
  u.searchParams.set('type','video');
  u.searchParams.set('maxResults','10');
  u.searchParams.set('q',q);
  u.searchParams.set('safeSearch','moderate');
  u.searchParams.set('videoEmbeddable','true');
  u.searchParams.set('relevanceLanguage','en');
  u.searchParams.set('regionCode','GB');
  u.searchParams.set('key',env.YOUTUBE_API_KEY);

  let r;
  try{
    r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  }catch(e){
    const err=new Error(`Could not reach Google YouTube API: ${e?.message||e}`);
    err.status=502;
    throw err;
  }

  const data=await r.json().catch(()=>({}));

  if(!r.ok){
    const googleMessage=data?.error?.message||`YouTube API HTTP ${r.status}`;
    let help='';
    const reason=data?.error?.errors?.[0]?.reason||'';

    if(reason==='keyInvalid'||/API key not valid/i.test(googleMessage)){
      help=' Check that the Cloudflare secret contains only the API key value.';
    }else if(reason==='accessNotConfigured'||/has not been used|disabled/i.test(googleMessage)){
      help=' Enable YouTube Data API v3 in the same Google Cloud project as this API key.';
    }else if(reason==='dailyLimitExceeded'||reason==='quotaExceeded'||/quota/i.test(googleMessage)){
      help=' The YouTube API quota has been reached.';
    }else if(/referer|referrer|restriction/i.test(googleMessage)){
      help=' Remove HTTP referrer restrictions from this server-side key, and restrict it to YouTube Data API v3 instead.';
    }

    const err=new Error(`${googleMessage}${help}`);
    err.status=(r.status>=400&&r.status<500)?r.status:502;
    throw err;
  }

  const items=(data.items||[]).map(x=>({
    videoId:x.id?.videoId||'',
    title:x.snippet?.title||'',
    description:x.snippet?.description||'',
    channelTitle:x.snippet?.channelTitle||'',
    publishedAt:x.snippet?.publishedAt||'',
    thumbnail:x.snippet?.thumbnails?.medium?.url||x.snippet?.thumbnails?.default?.url||''
  })).filter(x=>x.videoId);

  const payload={items};

  if(cache&&cacheKey){
    try{
      const response=new Response(JSON.stringify(payload),{
        headers:{'content-type':'application/json','cache-control':'public, max-age=900'}
      });
      await cache.put(cacheKey,response.clone());
    }catch(e){
      console.warn('YouTube cache write skipped',e);
    }
  }

  return payload;
}


async function youtubeStatus(env){
  if(!env.YOUTUBE_API_KEY){
    return {configured:false,ok:false,error:'YOUTUBE_API_KEY is missing from the deployed Worker.'};
  }

  const u=new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('part','snippet');
  u.searchParams.set('type','video');
  u.searchParams.set('maxResults','1');
  u.searchParams.set('q','test');
  u.searchParams.set('key',env.YOUTUBE_API_KEY);

  try{
    const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
    const data=await r.json().catch(()=>({}));
    if(r.ok)return {configured:true,ok:true};

    return {
      configured:true,
      ok:false,
      status:r.status,
      reason:data?.error?.errors?.[0]?.reason||'',
      error:data?.error?.message||`YouTube API HTTP ${r.status}`
    };
  }catch(e){
    return {configured:true,ok:false,error:`Could not reach Google: ${e?.message||e}`};
  }
}


const FOOTBALL_COMPETITIONS=new Set(['PL','CL','PD','BL1','SA','FL1']);

function isoDayOffset(n){
  const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
async function footballFetch(path,env){
  if(!env.FOOTBALL_DATA_API_KEY){
    const err=new Error('Football is not configured. Add FOOTBALL_DATA_API_KEY as a Cloudflare Worker secret.');
    err.status=503;throw err;
  }
  const r=await fetch(`https://api.football-data.org/v4${path}`,{
    headers:{'X-Auth-Token':env.FOOTBALL_DATA_API_KEY,accept:'application/json'}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(data?.message||data?.error||`football-data.org HTTP ${r.status}`);
    err.status=r.status===429?429:(r.status>=400&&r.status<500?r.status:502);
    throw err;
  }
  return data;
}
async function getFootballBundle(env,competition='PL',force=false,requestUrl='https://local/api/football'){
  const code=String(competition||'PL').toUpperCase();
  if(!FOOTBALL_COMPETITIONS.has(code)){
    const err=new Error('Unsupported football competition.');
    err.status=400;throw err;
  }

  let cache=null,cacheKey=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache&&!force){
      const u=new URL(requestUrl);
      u.pathname='/__cache/football';
      u.search=new URLSearchParams({competition:code}).toString();
      cacheKey=new Request(u.toString(),{method:'GET'});
      const hit=await cache.match(cacheKey);
      if(hit)return hit.json();
    }
  }catch(e){console.warn('Football cache read skipped',e);cache=null;cacheKey=null}

  const dateFrom=isoDayOffset(-7),dateTo=isoDayOffset(14);
  const [standingsData,matchesData]=await Promise.all([
    footballFetch(`/competitions/${encodeURIComponent(code)}/standings`,env).catch(e=>{
      // Cup competitions may not expose a single standings resource.
      if(code==='CL'&&e.status===404)return {competition:{name:'UEFA Champions League',code},standings:[]};
      throw e;
    }),
    footballFetch(`/competitions/${encodeURIComponent(code)}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,env)
  ]);

  const payload={
    competition:standingsData.competition||matchesData.competition||{code,name:code},
    standings:Array.isArray(standingsData.standings)?standingsData.standings:[],
    matches:Array.isArray(matchesData.matches)?matchesData.matches:[],
    updatedAt:new Date().toISOString()
  };

  if(cache){
    try{
      if(!cacheKey){
        const u=new URL(requestUrl);
        u.pathname='/__cache/football';
        u.search=new URLSearchParams({competition:code}).toString();
        cacheKey=new Request(u.toString(),{method:'GET'});
      }
      await cache.put(cacheKey,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public,max-age=900'}}));
    }catch(e){console.warn('Football cache write skipped',e)}
  }
  return payload;
}
async function footballStatus(env){
  if(!env.FOOTBALL_DATA_API_KEY)return {configured:false,ok:false,error:'FOOTBALL_DATA_API_KEY is missing.'};
  try{
    const data=await footballFetch('/competitions/PL',env);
    return {configured:true,ok:!!data?.id,detail:data?.name||'Premier League API responded.'};
  }catch(e){
    return {configured:true,ok:false,error:e?.message||String(e)};
  }
}
async function commandCentreStatus(env,live=false){
  const services=[
    {name:'Cloudflare Worker',state:'Healthy',kind:'ok',detail:'Worker is responding.'}
  ];

  // D1
  try{
    if(!env.DB)throw new Error('DB binding missing');
    await env.DB.prepare('SELECT 1 AS ok').first();
    services.push({name:'D1 database',state:'Healthy',kind:'ok',detail:'Database binding and query are working.'});
  }catch(e){
    services.push({name:'D1 database',state:'Error',kind:'bad',detail:e?.message||'Database check failed.'});
  }

  // Push config — configuration check, not a test notification.
  const vapidOk=!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY);
  services.push({
    name:'Web Push / VAPID',
    state:vapidOk?'Configured':'Needs setup',
    kind:vapidOk?'ok':'bad',
    detail:vapidOk?'Public and private VAPID keys are present.':'VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY is missing.'
  });

  // YouTube live check.
  if(!env.YOUTUBE_API_KEY){
    services.push({name:'YouTube Data API',state:'Not configured',kind:'warn',detail:'YOUTUBE_API_KEY is missing.'});
  }else if(live){
    const yt=await youtubeStatus(env);
    services.push({name:'YouTube Data API',state:yt.ok?'Healthy':'Error',kind:yt.ok?'ok':'bad',detail:yt.ok?'Google accepted the API key.':(yt.error||'YouTube check failed.')});
  }else{
    services.push({name:'YouTube Data API',state:'Configured',kind:'info',detail:'YOUTUBE_API_KEY is present.'});
  }

  // Football live check.
  if(!env.FOOTBALL_DATA_API_KEY){
    services.push({name:'Football Data API',state:'Not configured',kind:'warn',detail:'Add FOOTBALL_DATA_API_KEY to enable the Football Hub.'});
  }else if(live){
    const fb=await footballStatus(env);
    services.push({name:'Football Data API',state:fb.ok?'Healthy':'Error',kind:fb.ok?'ok':'bad',detail:fb.ok?(fb.detail||'football-data.org responded.'):(fb.error||'Football API check failed.')});
  }else{
    services.push({name:'Football Data API',state:'Configured',kind:'info',detail:'FOOTBALL_DATA_API_KEY is present.'});
  }

  services.push({
    name:'Football notification engine',
    state:(env.FOOTBALL_DATA_API_KEY&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)?'Ready':'Needs setup',
    kind:(env.FOOTBALL_DATA_API_KEY&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)?'ok':'warn',
    detail:(env.FOOTBALL_DATA_API_KEY&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)
      ?'Favourite-team fixture alerts and full-time pushes can run in the background.'
      :'Football API and VAPID keys are both required for background football alerts.'
  });

  services.push({
    name:'Live content provider',
    state:env.LIVE_CONTENT_API_BASE_URL?'Configured':'Not configured',
    kind:env.LIVE_CONTENT_API_BASE_URL?'info':'warn',
    detail:env.LIVE_CONTENT_API_BASE_URL?'Provider base URL is present.':'Add LIVE_CONTENT_API_BASE_URL to enable the live football player.'
  });
  services.push({
    name:'NewsData',
    state:env.NEWSDATA_API_KEY?'Configured':'Not configured',
    kind:env.NEWSDATA_API_KEY?'info':'warn',
    detail:env.NEWSDATA_API_KEY?'Secret is present. Live calls are skipped here to preserve quota.':'NEWSDATA_API_KEY is missing.'
  });
  services.push({
    name:'Alpha Vantage',
    state:env.ALPHA_VANTAGE_API_KEY?'Configured':'Not configured',
    kind:env.ALPHA_VANTAGE_API_KEY?'info':'warn',
    detail:env.ALPHA_VANTAGE_API_KEY?'Secret is present. Live calls are skipped here to preserve quota.':'ALPHA_VANTAGE_API_KEY is missing.'
  });

  return {ok:true,services,checkedAt:new Date().toISOString()};
}




async function ensureMirrorTables(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mirror_rooms (code TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mirror_signals (id INTEGER PRIMARY KEY AUTOINCREMENT,code TEXT NOT NULL,sender TEXT NOT NULL,recipient TEXT NOT NULL,type TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_mirror_signals_room ON mirror_signals(code,id)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS native_mirror_sessions (
    channel TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
}
async function cleanMirrorRooms(env){await ensureMirrorTables(env);const cutoff=Date.now()-30*60*1000;await env.DB.prepare('DELETE FROM mirror_signals WHERE created_at<?').bind(cutoff).run();await env.DB.prepare('DELETE FROM mirror_rooms WHERE updated_at<?').bind(cutoff).run();await env.DB.prepare('DELETE FROM native_mirror_sessions WHERE updated_at<?').bind(Date.now()-10*60*1000).run()}

async function ensureFootballNotificationTables(env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS football_notification_preferences (
    device_id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 1,
    team_id INTEGER,
    team_name TEXT NOT NULL DEFAULT '',
    team_crest TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'Europe/London',
    notify_24h INTEGER NOT NULL DEFAULT 1,
    notify_1h INTEGER NOT NULL DEFAULT 1,
    notify_kickoff INTEGER NOT NULL DEFAULT 1,
    notify_final INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS football_notification_sent (
    device_id TEXT NOT NULL,
    event_key TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY(device_id,event_key)
  )`).run();
}
function localPartsAt(timezone,date){
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:timezone||'Europe/London',hour12:false,
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
  }).formatToParts(date);
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
function footballMatchNames(match){
  const home=match?.homeTeam?.shortName||match?.homeTeam?.name||match?.homeTeam?.tla||'Home';
  const away=match?.awayTeam?.shortName||match?.awayTeam?.name||match?.awayTeam?.tla||'Away';
  return {home,away};
}
function footballKickoffLabel(match,timezone){
  const d=new Date(match.utcDate);
  try{
    return new Intl.DateTimeFormat('en-GB',{
      timeZone:timezone||'Europe/London',
      weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
    }).format(d);
  }catch{return d.toISOString()}
}
async function footballTeamMatches(env,teamId,daysBack=2,daysForward=21){
  if(!teamId)return [];
  const dateFrom=isoDayOffset(-daysBack),dateTo=isoDayOffset(daysForward);
  const data=await footballFetch(`/teams/${encodeURIComponent(teamId)}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,env);
  return Array.isArray(data.matches)?data.matches:[];
}
async function insertFootballScheduledNotification(env,pref,match,type,dueAt,title,body){
  const due=new Date(dueAt);
  if(!Number.isFinite(due.getTime())||due.getTime()<=Date.now())return 0;
  const lp=localPartsAt(pref.timezone||'Europe/London',due);
  const id=`football-${pref.device_id}-${match.id}-${type}`;
  const itemId=`football:${match.id}:${type}`;
  await env.DB.prepare(`INSERT OR IGNORE INTO notifications
    (id,device_id,item_id,kind,due_at,title,body,url,frequency,local_date,local_time,timezone,sent)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)`)
    .bind(
      id,pref.device_id,itemId,'football',due.toISOString(),title,body,'/#football',
      'none',lp.date,lp.time,pref.timezone||'Europe/London'
    ).run();
  return 1;
}
async function scheduleFootballAlertsForPreference(env,pref,matches){
  await env.DB.prepare("DELETE FROM notifications WHERE device_id=? AND kind='football' AND sent=0").bind(pref.device_id).run();
  if(!pref.enabled||!pref.team_id)return 0;

  let scheduled=0;
  const now=Date.now();
  for(const match of matches||[]){
    const kickoff=new Date(match.utcDate);
    if(!Number.isFinite(kickoff.getTime())||kickoff.getTime()<=now)continue;
    const {home,away}=footballMatchNames(match);
    const fixture=`${home} vs ${away}`;
    const when=footballKickoffLabel(match,pref.timezone);

    if(pref.notify_24h){
      scheduled+=await insertFootballScheduledNotification(
        env,pref,match,'24h',kickoff.getTime()-24*60*60*1000,
        `⚽ ${pref.team_name||'Football'} tomorrow`,
        `${fixture} • ${when}`
      );
    }
    if(pref.notify_1h){
      scheduled+=await insertFootballScheduledNotification(
        env,pref,match,'1h',kickoff.getTime()-60*60*1000,
        `⚽ Kick-off in 1 hour`,
        `${fixture} • ${when}`
      );
    }
    if(pref.notify_kickoff){
      scheduled+=await insertFootballScheduledNotification(
        env,pref,match,'kickoff',kickoff.getTime(),
        `⚽ Kick-off: ${pref.team_name||'your team'}`,
        fixture
      );
    }
  }
  return scheduled;
}
async function sendFootballFinalScores(env,pref,matches){
  if(!pref.notify_final||!pref.enabled||!pref.team_id)return 0;
  let sent=0;
  for(const match of matches||[]){
    if(match.status!=='FINISHED')continue;
    const finishedAt=new Date(match.utcDate).getTime();
    // Only report recently-finished matches; old results should not suddenly notify.
    if(!Number.isFinite(finishedAt)||Date.now()-finishedAt>36*60*60*1000)continue;

    const key=`final:${match.id}`;
    const seen=await env.DB.prepare('SELECT 1 ok FROM football_notification_sent WHERE device_id=? AND event_key=?')
      .bind(pref.device_id,key).first();
    if(seen)continue;

    const homeScore=match?.score?.fullTime?.home,awayScore=match?.score?.fullTime?.away;
    if(!Number.isFinite(homeScore)||!Number.isFinite(awayScore))continue;
    const {home,away}=footballMatchNames(match);

    try{
      await sendOne({
        endpoint:pref.endpoint,p256dh:pref.p256dh,auth:pref.auth,
        title:`🏁 Full time: ${home} ${homeScore}–${awayScore} ${away}`,
        body:`${pref.team_name||'Your favourite team'} result is in.`,
        url:'/#football',
        id:`football-final-${pref.device_id}-${match.id}`
      },env);
      await env.DB.prepare('INSERT OR IGNORE INTO football_notification_sent(device_id,event_key,sent_at) VALUES(?,?,?)')
        .bind(pref.device_id,key,Date.now()).run();
      sent++;
    }catch(e){console.error('football final push failed',pref.device_id,match.id,e)}
  }
  return sent;
}
async function syncFootballPreferenceNow(env,deviceId){
  await ensureFootballNotificationTables(env);
  const pref=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
    FROM football_notification_preferences p
    LEFT JOIN devices d ON d.device_id=p.device_id
    WHERE p.device_id=?`).bind(deviceId).first();

  if(!pref)return {scheduled:0};
  if(!pref.enabled||!pref.team_id){
    await env.DB.prepare("DELETE FROM notifications WHERE device_id=? AND kind='football' AND sent=0").bind(deviceId).run();
    return {scheduled:0};
  }
  if(!pref.endpoint)return {scheduled:0,warning:'This device is not registered for Web Push yet.'};

  const matches=await footballTeamMatches(env,pref.team_id,2,21);
  const scheduled=await scheduleFootballAlertsForPreference(env,pref,matches);
  await sendFootballFinalScores(env,pref,matches);
  return {scheduled};
}
async function refreshFootballNotifications(env){
  if(!env.FOOTBALL_DATA_API_KEY)return;
  await ensureFootballNotificationTables(env);
  const rows=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
    FROM football_notification_preferences p
    JOIN devices d ON d.device_id=p.device_id
    WHERE p.enabled=1 AND p.team_id IS NOT NULL`).all();
  const prefs=rows.results||[];
  if(!prefs.length)return;

  // Fetch once per unique team and reuse the result for every subscribed device.
  const teamCache=new Map();
  for(const pref of prefs){
    const key=String(pref.team_id);
    let matches=teamCache.get(key);
    if(!matches){
      try{
        matches=await footballTeamMatches(env,pref.team_id,2,21);
        teamCache.set(key,matches);
      }catch(e){
        console.error('football notification refresh failed for team',pref.team_id,e);
        continue;
      }
    }
    try{
      await scheduleFootballAlertsForPreference(env,pref,matches);
      await sendFootballFinalScores(env,pref,matches);
    }catch(e){console.error('football notification schedule failed',pref.device_id,e)}
  }
  await env.DB.prepare('DELETE FROM football_notification_sent WHERE sent_at<?')
    .bind(Date.now()-60*86400000).run();
}

async function sendOne(row,env){
  const sub={endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}};
  const target=String(row.url||'/');
  // Keep the URL both at the top level and inside data. The service worker
  // accepts either shape, which also keeps older subscriptions compatible.
  await sendPushNotification(
    sub,
    {
      title:row.title,
      body:row.body,
      icon:'/icon-192.png',
      badge:'/icon-192.png',
      tag:row.id,
      url:target,
      data:{url:target}
    },
    {
      publicKey:env.VAPID_PUBLIC_KEY,
      privateKey:env.VAPID_PRIVATE_KEY,
      subject:env.VAPID_SUBJECT||'mailto:command-centre@example.com'
    }
  );
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'content-type'}});
    try{
      if(url.pathname==='/api/push/public-key'&&request.method==='GET') return json({publicKey:env.VAPID_PUBLIC_KEY});
      if(url.pathname==='/api/push/subscribe'&&request.method==='POST'){
        const {deviceId,subscription,timezone}=await request.json();
        if(!deviceId||!subscription?.endpoint||!subscription?.keys?.p256dh||!subscription?.keys?.auth) return json({error:'Invalid subscription'},400);
        await env.DB.prepare('INSERT INTO devices(device_id,endpoint,p256dh,auth,timezone,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,timezone=excluded.timezone,updated_at=excluded.updated_at').bind(deviceId,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,timezone||'Europe/London',Date.now()).run();
        return json({ok:true});
      }
      if(url.pathname==='/api/push/sync'&&request.method==='POST'){
        const {deviceId,subscription,timezone,items=[]}=await request.json();
        if(!deviceId||!Array.isArray(items)) return json({error:'Invalid sync'},400);
        await env.DB.prepare('INSERT INTO devices(device_id,endpoint,p256dh,auth,timezone,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,timezone=excluded.timezone,updated_at=excluded.updated_at').bind(deviceId,subscription.endpoint,subscription.keys.p256dh,subscription.keys.auth,timezone||'Europe/London',Date.now()).run();
        await env.DB.prepare("DELETE FROM notifications WHERE device_id=? AND sent=0 AND kind IN ('reminder','event')").bind(deviceId).run();
        for(const x of items.slice(0,5000)){
          await env.DB.prepare('INSERT OR IGNORE INTO notifications(id,device_id,item_id,kind,due_at,title,body,url,frequency,local_date,local_time,timezone,sent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(x.id,deviceId,x.itemId,x.kind,x.dueAt,x.title,x.body,x.url,x.frequency||'none',x.localDate,x.localTime,x.timezone||timezone||'Europe/London').run();
        }
        return json({ok:true,count:items.length});
      }

      if(url.pathname==='/api/mirror/room'&&request.method==='POST'){
        await ensureMirrorTables(env);const {code}=await request.json();if(!/^\d{6}$/.test(String(code||'')))return json({error:'A 6-digit mirror code is required.'},400);const now=Date.now();await env.DB.prepare(`INSERT INTO mirror_rooms(code,created_at,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET updated_at=excluded.updated_at`).bind(String(code),now,now).run();await env.DB.prepare('DELETE FROM mirror_signals WHERE code=?').bind(String(code)).run();return json({ok:true,code:String(code)});
      }
      if(url.pathname==='/api/mirror/room'&&request.method==='GET'){
        await ensureMirrorTables(env);const code=String(url.searchParams.get('code')||'');const row=await env.DB.prepare('SELECT code,updated_at FROM mirror_rooms WHERE code=?').bind(code).first();const exists=!!row&&(Date.now()-Number(row.updated_at||0)<30*60*1000);return json({exists});
      }
      if(url.pathname==='/api/mirror/native-session'&&request.method==='POST'){
        await ensureMirrorTables(env);
        const body=await request.json();
        const channel=String(body?.channel||'').trim();
        const code=String(body?.code||'').trim();
        if(!/^[a-f0-9]{24,64}$/i.test(channel))return json({error:'Invalid native mirror channel.'},400);
        if(!/^\d{6}$/.test(code))return json({error:'Invalid mirror code.'},400);
        const room=await env.DB.prepare('SELECT code FROM mirror_rooms WHERE code=?').bind(code).first();
        if(!room)return json({error:'Mirror room does not exist.'},404);
        const now=Date.now();
        await env.DB.prepare(`INSERT INTO native_mirror_sessions(channel,code,created_at,updated_at)
          VALUES(?,?,?,?)
          ON CONFLICT(channel) DO UPDATE SET code=excluded.code,updated_at=excluded.updated_at`)
          .bind(channel,code,now,now).run();
        return json({ok:true,expiresInSeconds:600});
      }

      if(url.pathname==='/api/mirror/native-session'&&request.method==='GET'){
        await ensureMirrorTables(env);
        const channel=String(url.searchParams.get('channel')||'').trim();
        if(!/^[a-f0-9]{24,64}$/i.test(channel))return json({error:'Invalid native mirror channel.'},400);
        const row=await env.DB.prepare('SELECT code,updated_at FROM native_mirror_sessions WHERE channel=?')
          .bind(channel).first();
        if(!row||Date.now()-Number(row.updated_at||0)>10*60*1000){
          return json({error:'No active native mirror session.'},404);
        }
        return json({code:String(row.code),expiresInSeconds:Math.max(0,Math.floor((10*60*1000-(Date.now()-Number(row.updated_at||0)))/1000))});
      }

      if(url.pathname==='/api/mirror/native-session'&&request.method==='DELETE'){
        await ensureMirrorTables(env);
        const channel=String(url.searchParams.get('channel')||'').trim();
        if(!/^[a-f0-9]{24,64}$/i.test(channel))return json({error:'Invalid native mirror channel.'},400);
        await env.DB.prepare('DELETE FROM native_mirror_sessions WHERE channel=?').bind(channel).run();
        return json({ok:true});
      }

      if(url.pathname==='/api/mirror/signal'&&request.method==='POST'){
        await ensureMirrorTables(env);const {code,from,to,type,data}=await request.json();if(!/^\d{6}$/.test(String(code||'')))return json({error:'Invalid mirror code.'},400);if(!['sender','receiver'].includes(from)||!['sender','receiver'].includes(to))return json({error:'Invalid mirror role.'},400);if(!['offer','answer','ice','bye','ready'].includes(type))return json({error:'Invalid mirror signal.'},400);const room=await env.DB.prepare('SELECT code FROM mirror_rooms WHERE code=?').bind(String(code)).first();if(!room)return json({error:'Mirror room not found.'},404);await env.DB.prepare('INSERT INTO mirror_signals(code,sender,recipient,type,data,created_at) VALUES(?,?,?,?,?,?)').bind(String(code),from,to,type,JSON.stringify(data??{}),Date.now()).run();await env.DB.prepare('UPDATE mirror_rooms SET updated_at=? WHERE code=?').bind(Date.now(),String(code)).run();return json({ok:true});
      }
      if(url.pathname==='/api/mirror/signals'&&request.method==='GET'){
        await ensureMirrorTables(env);const code=String(url.searchParams.get('code')||''),recipient=String(url.searchParams.get('for')||''),after=Math.max(0,Number(url.searchParams.get('after')||0));if(!/^\d{6}$/.test(code)||!['sender','receiver'].includes(recipient))return json({error:'Invalid mirror request.'},400);const rows=await env.DB.prepare(`SELECT id,type,data,sender,recipient FROM mirror_signals WHERE code=? AND recipient=? AND id>? ORDER BY id ASC LIMIT 100`).bind(code,recipient,after).all();const signals=(rows.results||[]).map(r=>({id:r.id,type:r.type,sender:r.sender,recipient:r.recipient,data:(()=>{try{return JSON.parse(r.data)}catch{return {}}})()}));return json({signals});
      }

      if(url.pathname==='/api/live-content'&&request.method==='GET'){
        return json(await liveContentStreams(env,url.searchParams.get('category')||'soccer',request.url,url.searchParams.get('refresh')==='1'));
      }

      if(url.pathname==='/api/status'&&request.method==='GET'){
        return json(await commandCentreStatus(env,url.searchParams.get('live')==='1'));
      }

      if(url.pathname==='/api/football'&&request.method==='GET'){
        const competition=url.searchParams.get('competition')||'PL';
        const force=url.searchParams.get('refresh')==='1';
        return json(await getFootballBundle(env,competition,force,request.url));
      }

      if(url.pathname==='/api/football/notifications/preferences'&&request.method==='POST'){
        const body=await request.json();
        const {
          deviceId,enabled=true,teamId=null,teamName='',teamCrest='',timezone='Europe/London',
          notify24h=true,notify1h=true,notifyKickoff=true,notifyFinal=true
        }=body||{};
        if(!deviceId)return json({error:'deviceId required'},400);

        await ensureFootballNotificationTables(env);
        await env.DB.prepare(`INSERT INTO football_notification_preferences
          (device_id,enabled,team_id,team_name,team_crest,timezone,notify_24h,notify_1h,notify_kickoff,notify_final,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(device_id) DO UPDATE SET
            enabled=excluded.enabled,
            team_id=excluded.team_id,
            team_name=excluded.team_name,
            team_crest=excluded.team_crest,
            timezone=excluded.timezone,
            notify_24h=excluded.notify_24h,
            notify_1h=excluded.notify_1h,
            notify_kickoff=excluded.notify_kickoff,
            notify_final=excluded.notify_final,
            updated_at=excluded.updated_at`)
          .bind(
            deviceId,enabled?1:0,teamId?Number(teamId):null,String(teamName||'').slice(0,120),
            String(teamCrest||'').slice(0,500),timezone||'Europe/London',
            notify24h?1:0,notify1h?1:0,notifyKickoff?1:0,notifyFinal?1:0,Date.now()
          ).run();

        const result=await syncFootballPreferenceNow(env,deviceId);
        return json({ok:true,...result});
      }

      if(url.pathname==='/api/football/notifications/test'&&request.method==='POST'){
        const {deviceId}=await request.json();
        if(!deviceId)return json({error:'deviceId required'},400);
        await ensureFootballNotificationTables(env);
        const pref=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
          FROM football_notification_preferences p
          JOIN devices d ON d.device_id=p.device_id
          WHERE p.device_id=?`).bind(deviceId).first();
        if(!pref)return json({error:'Football notifications are not registered for this device yet.'},404);
        await sendOne({
          endpoint:pref.endpoint,p256dh:pref.p256dh,auth:pref.auth,
          title:'⚽ Football alerts are working',
          body:pref.team_name?`You will receive match alerts for ${pref.team_name}.`:'Your football notifications are ready.',
          url:'/#football',
          id:`football-test-${Date.now()}`
        },env);
        return json({ok:true});
      }

      if(url.pathname==='/api/youtube/explore'&&request.method==='GET'){
        const section=url.searchParams.get('section')||'trending';
        return json(await youtubeExplore(env,section,request.url,url.searchParams.get('refresh')==='1'));
      }

      if(url.pathname==='/api/youtube/status'&&request.method==='GET'){
        const result=await youtubeStatus(env);
        return json(result,result.configured?200:503);
      }

      if(url.pathname==='/api/youtube/search'&&request.method==='GET'){
        const q=url.searchParams.get('q')||'';
        return json(await searchYouTube(env,q,request.url));
      }

      if(url.pathname==='/api/news'&&request.method==='GET'){
        if(!env.NEWSDATA_API_KEY) return json({error:'News service is not configured. Add NEWSDATA_API_KEY as a Worker secret.'},503);
        const force=url.searchParams.get('refresh')==='1';
        const financialProvider=url.searchParams.get('financialProvider')||'hybrid';
        return json(await getNewsBundle(env,force,financialProvider));
      }
      if(url.pathname==='/api/news/preferences'&&request.method==='POST'){
        const {deviceId,worldEnabled=true,financialEnabled=true,pushMode='major'}=await request.json();
        if(!deviceId)return json({error:'deviceId required'},400);
        await ensureNewsTables(env);
        const mode=['major','all','off'].includes(pushMode)?pushMode:'major';
        await env.DB.prepare(`INSERT INTO news_preferences(device_id,world_enabled,financial_enabled,push_mode,updated_at)
          VALUES(?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET
          world_enabled=excluded.world_enabled,financial_enabled=excluded.financial_enabled,push_mode=excluded.push_mode,updated_at=excluded.updated_at`)
          .bind(deviceId,worldEnabled?1:0,financialEnabled?1:0,mode,Date.now()).run();
        return json({ok:true});
      }


      if(url.pathname==='/api/briefing/preferences'&&request.method==='POST'){
        const {deviceId,enabled=true,localTime='07:30',timezone='Europe/London',city='London',bibleText=''}=await request.json();
        if(!deviceId)return json({error:'deviceId required'},400);
        if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime))return json({error:'Invalid briefing time'},400);
        await ensureBriefingTable(env);
        await env.DB.prepare(`INSERT INTO morning_briefing_preferences(device_id,enabled,local_time,timezone,city,bible_text,last_sent_date,updated_at)
          VALUES(?,?,?,?,?,?,NULL,?)
          ON CONFLICT(device_id) DO UPDATE SET
          enabled=excluded.enabled,local_time=excluded.local_time,timezone=excluded.timezone,city=excluded.city,bible_text=excluded.bible_text,updated_at=excluded.updated_at`)
          .bind(deviceId,enabled?1:0,localTime,timezone||'Europe/London',city||'London',String(bibleText||'').slice(0,180),Date.now()).run();
        return json({ok:true});
      }
      if(url.pathname==='/api/briefing/test'&&request.method==='POST'){
        const {deviceId}=await request.json();
        await ensureBriefingTable(env);
        const pref=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
          FROM morning_briefing_preferences p JOIN devices d ON d.device_id=p.device_id
          WHERE p.device_id=?`).bind(deviceId).first();
        if(!pref)return json({error:'Morning briefing is not registered yet. Save notification settings first.'},404);
        const local=localPartsNow(pref.timezone||'Europe/London');
        const body=await buildMorningBriefingBody(env,pref,local.date);
        await sendOne({endpoint:pref.endpoint,p256dh:pref.p256dh,auth:pref.auth,title:'☀️ Morning Briefing',body:body||'Your Command Centre briefing is ready.',url:'/#briefing',id:`morning-briefing-test-${Date.now()}`},env);
        return json({ok:true,body});
      }

      if(url.pathname==='/api/push/test'&&request.method==='POST'){
        const {deviceId}=await request.json(); const row=await env.DB.prepare('SELECT d.*, d.device_id FROM devices d WHERE d.device_id=?').bind(deviceId).first();
        if(!row)return json({error:'Device not registered'},404);
        await sendOne({endpoint:row.endpoint,p256dh:row.p256dh,auth:row.auth,title:'Command Centre',body:'Background notifications are working.',url:'/' ,id:'cc-test'},env);
        return json({ok:true});
      }
      return json({error:'Not found'},404);
    }catch(e){console.error(e);return json({error:e?.message||String(e)},Number(e?.status)||500)}
  },
  async scheduled(_controller,env,ctx){
    const now=new Date().toISOString();
    const rows=await env.DB.prepare(`SELECT n.*,d.endpoint,d.p256dh,d.auth FROM notifications n JOIN devices d ON d.device_id=n.device_id WHERE n.sent=0 AND n.due_at<=? ORDER BY n.due_at LIMIT 100`).bind(now).all();
    for(const row of rows.results||[]){
      ctx.waitUntil((async()=>{
        try{
          await sendOne(row,env);
          await env.DB.prepare('UPDATE notifications SET sent=1 WHERE id=?').bind(row.id).run();
          const next=nextLocalDate(row.local_date,row.frequency);
          if(next){
            const due=localToUtc(next,row.local_time,row.timezone);
            const nextId=`${row.kind}-${row.item_id}-${next}`;
            await env.DB.prepare('INSERT OR IGNORE INTO notifications(id,device_id,item_id,kind,due_at,title,body,url,frequency,local_date,local_time,timezone,sent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(nextId,row.device_id,row.item_id,row.kind,due,row.title,row.body,row.url,row.frequency,row.local_date===next?row.local_date:next,row.local_time,row.timezone).run();
          }
        }catch(e){console.error('push send failed',row.id,e)}
      })());
    }
    // Morning briefings are checked every minute against each device's local time.
    ctx.waitUntil(sendMorningBriefings(env));
    // News is checked once per hour so the minute-by-minute reminder cron does not burn API quota.
    if(new Date().getUTCMinutes()===5) ctx.waitUntil(sendNewsPushes(env));
    // Refresh favourite-team fixtures and full-time football alerts every 15 minutes.
    if(new Date().getUTCMinutes()%15===10) ctx.waitUntil(refreshFootballNotifications(env));
    if(new Date().getUTCMinutes()%15===12) ctx.waitUntil(cleanMirrorRooms(env));
  }
};
