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
  const u=new URL(raw);
  if(u.protocol!=='https:')throw new Error('Live content provider base URL must use HTTPS.');
  return u;
}
function liveContentMode(env){
  const mode=String(env.LIVE_CONTENT_PROVIDER_MODE||'api').trim().toLowerCase();
  return mode==='scrape'?'scrape':'api';
}
function liveContentBaseUrl(env){
  return normaliseBaseUrl(env.LIVE_CONTENT_BASE_URL||env.LIVE_CONTENT_API_BASE_URL||'');
}
function csvHosts(value){
  return String(value||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
}
function allowedEmbedUrl(embedUrl,base,env){
  try{
    const u=new URL(embedUrl);
    if(u.protocol!=='https:')return false;
    const configured=csvHosts(env.LIVE_CONTENT_ALLOWED_EMBED_HOSTS);
    const hosts=configured.length?configured:[base.hostname.toLowerCase()];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
function allowedProviderPageUrl(pageUrl,base,env){
  try{
    const u=new URL(pageUrl,base);
    if(u.protocol!=='https:')return false;
    const configured=csvHosts(env.LIVE_CONTENT_ALLOWED_PAGE_HOSTS);
    const hosts=configured.length?configured:[base.hostname.toLowerCase()];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
function sourceUrlCandidate(value){
  if(typeof value==='string')return value.trim();
  if(!value||typeof value!=='object')return '';
  return String(value.embed_url||value.url||value.src||value.source||'').trim();
}
function sourceLabelCandidate(value,index){
  if(value&&typeof value==='object'){
    const label=String(value.label||value.name||value.quality||'').trim();
    if(label)return label.slice(0,60);
  }
  return `Source ${index+1}`;
}
function rawStreamSourceEntries(stream){
  const values=[
    ...(stream?.embed_url?[stream.embed_url]:[]),
    ...(Array.isArray(stream?.sources)?stream.sources:[])
  ];
  const seen=new Set();
  const entries=[];
  values.forEach((value,index)=>{
    const url=sourceUrlCandidate(value);
    if(!url||seen.has(url))return;
    seen.add(url);
    entries.push({url,label:sourceLabelCandidate(value,index)});
  });
  return entries;
}
function allowedStreamSources(stream,base,env){
  return rawStreamSourceEntries(stream).filter(entry=>allowedEmbedUrl(entry.url,base,env));
}
function providerSourceHosts(stream){
  return [...new Set(rawStreamSourceEntries(stream).map(entry=>{
    try{
      const u=new URL(entry.url);
      return u.protocol==='https:'?u.hostname.toLowerCase():'';
    }catch{return ''}
  }).filter(Boolean))];
}
function safeHttpsUrl(value,base=null){
  try{
    const u=base?new URL(value,base):new URL(value);
    return u.protocol==='https:'?u.toString():'';
  }catch{return ''}
}
function streamSlugFromUrl(value){
  try{
    const u=new URL(value);
    const part=u.pathname.split('/').filter(Boolean).pop()||u.hostname;
    return decodeURIComponent(part).replace(/[-_]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase()).slice(0,180);
  }catch{return 'Live stream'}
}

async function extractAuthorisedHtmlPage(response,pageUrl){
  const result={
    title:'',
    ogTitle:'',
    thumbnail:'',
    embedCandidates:[],
    pageLinks:[]
  };

  let titleText='';
  const titleHandler={
    text(chunk){titleText+=chunk.text||''}
  };

  const rewriter=new HTMLRewriter()
    .on('title',titleHandler)
    .on('meta[property="og:title"]',{
      element(el){
        const value=el.getAttribute('content');
        if(value&&!result.ogTitle)result.ogTitle=value.trim().slice(0,180);
      }
    })
    .on('meta[property="og:image"]',{
      element(el){
        const value=el.getAttribute('content');
        if(value&&!result.thumbnail)result.thumbnail=safeHttpsUrl(value,pageUrl);
      }
    })
    .on('iframe[src]',{
      element(el){
        const value=el.getAttribute('src');
        const absolute=safeHttpsUrl(value,pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('video[src]',{
      element(el){
        const value=el.getAttribute('src');
        const absolute=safeHttpsUrl(value,pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('source[src]',{
      element(el){
        const value=el.getAttribute('src');
        const absolute=safeHttpsUrl(value,pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('[data-embed]',{
      element(el){
        const value=el.getAttribute('data-embed');
        const absolute=safeHttpsUrl(value,pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('[data-src]',{
      element(el){
        const value=el.getAttribute('data-src');
        const absolute=safeHttpsUrl(value,pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('a[href]',{
      element(el){
        const value=el.getAttribute('href');
        const absolute=safeHttpsUrl(value,pageUrl);
        if(absolute)result.pageLinks.push(absolute);
      }
    });

  const transformed=rewriter.transform(response);
  await transformed.text(); // consume the body so all handlers run

  result.title=titleText.trim().replace(/\s+/g,' ').slice(0,180);
  result.embedCandidates=[...new Set(result.embedCandidates)];
  result.pageLinks=[...new Set(result.pageLinks)];
  return result;
}

function scrapeLinkHints(env,category){
  const configured=String(env.LIVE_CONTENT_LINK_HINTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(configured.length)return configured;
  return [String(category||'soccer').toLowerCase(),'football','soccer','match','game','event','watch','stream','live','sport'];
}
function isLikelyEventPage(url,hints){
  try{
    const u=new URL(url);
    const hay=(u.pathname+' '+u.search).toLowerCase();
    return hints.some(h=>h&&hay.includes(h));
  }catch{return false}
}

async function scrapeAuthorisedProvider(env,base,category){
  if(typeof HTMLRewriter==='undefined'){
    const err=new Error('HTML scraping mode requires the Cloudflare Workers HTMLRewriter runtime.');
    err.status=500;
    throw err;
  }

  const pathTemplate=String(env.LIVE_CONTENT_SCRAPE_PATH||'/').trim()||'/';
  const path=pathTemplate.replace(/\{category\}/g,encodeURIComponent(category));
  const listingUrl=new URL(path,base).toString();

  if(!allowedProviderPageUrl(listingUrl,base,env)){
    const err=new Error('LIVE_CONTENT_SCRAPE_PATH resolves to a provider page host that is not allowed.');
    err.status=500;
    throw err;
  }

  const headers={
    accept:'text/html,application/xhtml+xml',
    'user-agent':'CommandCentre/1.0 authorised-content-integration'
  };
  if(env.LIVE_CONTENT_API_KEY)headers.authorization=`Bearer ${env.LIVE_CONTENT_API_KEY}`;

  const listingResponse=await fetch(listingUrl,{headers,redirect:'follow'});
  if(!listingResponse.ok){
    const err=new Error(`Live content provider HTTP ${listingResponse.status}`);
    err.status=listingResponse.status>=400&&listingResponse.status<500?listingResponse.status:502;
    throw err;
  }

  const listing=await extractAuthorisedHtmlPage(listingResponse,listingUrl);
  const hints=scrapeLinkHints(env,category);
  const maxPages=Math.max(1,Math.min(24,Number(env.LIVE_CONTENT_MAX_SCRAPE_PAGES)||12));

  const eventPages=listing.pageLinks
    .filter(url=>allowedProviderPageUrl(url,base,env))
    .filter(url=>isLikelyEventPage(url,hints))
    .filter(url=>url!==listingUrl)
    .slice(0,maxPages);

  const streams=[];

  // If the listing itself directly contains player embeds, expose them as one stream.
  if(listing.embedCandidates.length){
    streams.push({
      id:'listing-live',
      name:listing.ogTitle||listing.title||`Live ${category}`,
      category,
      league:'',
      thumbnail_url:listing.thumbnail,
      sources:listing.embedCandidates.map((url,i)=>({url,label:`Source ${i+1}`}))
    });
  }

  const pageResults=await Promise.all(eventPages.map(async pageUrl=>{
    try{
      const r=await fetch(pageUrl,{headers,redirect:'follow'});
      if(!r.ok)return null;
      const page=await extractAuthorisedHtmlPage(r,pageUrl);

      // Some frameworks link straight to an allowed player URL rather than placing
      // the iframe in the event page.
      const directEmbedLinks=page.pageLinks.filter(url=>allowedEmbedUrl(url,base,env));
      const sources=[...new Set([...page.embedCandidates,...directEmbedLinks])];
      if(!sources.length)return null;

      return {
        id:new URL(pageUrl).pathname.slice(-180)||pageUrl.slice(-180),
        name:page.ogTitle||page.title||streamSlugFromUrl(pageUrl),
        category,
        league:'',
        thumbnail_url:page.thumbnail,
        sources:sources.map((url,i)=>({url,label:`Source ${i+1}`}))
      };
    }catch{
      return null;
    }
  }));

  streams.push(...pageResults.filter(Boolean));
  return {count:streams.length,streams};
}

async function fetchAuthorisedApiProvider(env,base,category){
  const pathTemplate=String(env.LIVE_CONTENT_API_PATH||'/api/v1/streams').trim()||'/api/v1/streams';
  const endpoint=new URL(pathTemplate,base);
  if(!endpoint.searchParams.has('category'))endpoint.searchParams.set('category',category);

  const headers={accept:'application/json'};
  if(env.LIVE_CONTENT_API_KEY)headers.authorization=`Bearer ${env.LIVE_CONTENT_API_KEY}`;

  const r=await fetch(endpoint.toString(),{headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(data?.message||data?.error||`Live content provider HTTP ${r.status}`);
    err.status=r.status>=400&&r.status<500?r.status:502;
    throw err;
  }
  return data;
}

async function liveContentStreams(env,category='soccer',requestUrl='https://local/api/live-content',force=false){
  const base=liveContentBaseUrl(env);
  if(!base){
    const err=new Error('Set LIVE_CONTENT_BASE_URL (or the older LIVE_CONTENT_API_BASE_URL) first.');
    err.status=503;
    throw err;
  }

  const mode=liveContentMode(env);
  const safeCategory=String(category||'soccer').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'soccer';

  let cache=null,key=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache&&!force){
      const u=new URL(requestUrl);
      u.pathname='/__cache/live-content';
      u.search=new URLSearchParams({category:safeCategory,mode}).toString();
      key=new Request(u.toString());
      const hit=await cache.match(key);
      if(hit)return hit.json();
    }
  }catch{
    cache=null;key=null;
  }

  const data=mode==='scrape'
    ?await scrapeAuthorisedProvider(env,base,safeCategory)
    :await fetchAuthorisedApiProvider(env,base,safeCategory);

  const providerStreams=Array.isArray(data.streams)?data.streams:[];
  const rejectedHostsSet=new Set();

  const streams=providerStreams.map(s=>{
    const allHosts=providerSourceHosts(s);
    const sources=allowedStreamSources(s,base,env);

    if(!sources.length)allHosts.forEach(host=>rejectedHostsSet.add(host));

    return {
      id:String(s.id||'').slice(0,200),
      name:String(s.name||'Live stream').slice(0,180),
      category:String(s.category||safeCategory).slice(0,80),
      league:String(s.league||'').slice(0,120),
      stream_key:String(s.stream_key||'').slice(0,200),
      match_timestamp:Number(s.match_timestamp)||null,
      viewers:Number(s.viewers)||0,
      embed_url:sources[0]?.url||'',
      sources:sources.map((entry,index)=>({
        url:entry.url,
        label:String(entry.label||`Source ${index+1}`).slice(0,60)
      })),
      source_count:sources.length,
      thumbnail_url:safeHttpsUrl(s.thumbnail_url||''),
      team1:s.team1&&typeof s.team1==='object'?{
        name:String(s.team1.name||'').slice(0,120),
        logo:safeHttpsUrl(s.team1.logo||'')
      }:null,
      team2:s.team2&&typeof s.team2==='object'?{
        name:String(s.team2.name||'').slice(0,120),
        logo:safeHttpsUrl(s.team2.logo||'')
      }:null
    };
  }).filter(s=>s.embed_url);

  const configuredAllowedHosts=csvHosts(env.LIVE_CONTENT_ALLOWED_EMBED_HOSTS);
  const rejectedHosts=[...rejectedHostsSet].sort();

  const payload={
    mode,
    count:streams.length,
    providerCount:providerStreams.length,
    rejectedCount:Math.max(0,providerStreams.length-streams.length),
    configuredAllowedHosts,
    rejectedHosts,
    diagnostic:
      providerStreams.length>0&&streams.length===0
        ?'The provider returned streams, but none of their HTTPS player hosts matched LIVE_CONTENT_ALLOWED_EMBED_HOSTS.'
        :rejectedHosts.length
          ?'Some provider streams were rejected because their player hosts were not on the allowlist.'
          :'All usable provider stream hosts passed the allowlist check.',
    streams,
    category:safeCategory,
    updatedAt:new Date().toISOString()
  };

  if(cache){
    try{
      if(!key){
        const u=new URL(requestUrl);
        u.pathname='/__cache/live-content';
        u.search=new URLSearchParams({category:safeCategory,mode}).toString();
        key=new Request(u.toString());
      }
      await cache.put(key,new Response(JSON.stringify(payload),{
        headers:{'content-type':'application/json','cache-control':'public,max-age=120'}
      }));
    }catch{}
  }
  return payload;
}


function mediaBaseUrl(env){
  const raw=String(env.MEDIA_EMBED_BASE_URL||'').trim().replace(/\/$/,'');
  if(!raw){const e=new Error('MEDIA_EMBED_BASE_URL is not configured.');e.status=503;throw e}
  const u=new URL(raw);
  if(u.protocol!=='https:'){const e=new Error('MEDIA_EMBED_BASE_URL must use HTTPS.');e.status=500;throw e}
  return u;
}
function mediaAllowedHosts(env,base){
  const configured=String(env.MEDIA_EMBED_ALLOWED_HOSTS||'')
    .split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  return configured.length?configured:[base.hostname.toLowerCase()];
}
function mediaPathForMode(env,mode){
  if(mode==='torrent')return String(env.MEDIA_EMBED_PATH_TORRENT||'/embed/torrent').trim()||'/embed/torrent';
  if(mode==='agg')return String(env.MEDIA_EMBED_PATH_AGG||'/embed/agg').trim()||'/embed/agg';
  return String(env.MEDIA_EMBED_PATH_STANDARD||'/embed').trim()||'/embed';
}
function buildMediaEmbedUrl(env,{type,id,season,episode,mode='standard'}){
  if(!['movie','tv'].includes(type)){const e=new Error('type must be movie or tv.');e.status=400;throw e}
  if(!/^\d+$/.test(String(id||''))){const e=new Error('A numeric TMDB id is required.');e.status=400;throw e}
  if(!['standard','torrent','agg'].includes(mode)){const e=new Error('Unsupported provider mode.');e.status=400;throw e}
  if(type==='tv'){
    if(!Number.isInteger(Number(season))||Number(season)<1){const e=new Error('A valid season is required for TV.');e.status=400;throw e}
    if(!Number.isInteger(Number(episode))||Number(episode)<1){const e=new Error('A valid episode is required for TV.');e.status=400;throw e}
  }
  const base=mediaBaseUrl(env);
  const u=new URL(base.toString());
  const path=mediaPathForMode(env,mode);
  u.pathname=(base.pathname.replace(/\/$/,'')+'/'+path.replace(/^\//,'')).replace(/\/+/g,'/');
  u.search='';
  u.searchParams.set('type',type);
  u.searchParams.set('id',String(id));
  if(type==='tv'){
    u.searchParams.set('season',String(Number(season)));
    u.searchParams.set('episode',String(Number(episode)));
  }
  const hosts=mediaAllowedHosts(env,base);
  if(!hosts.includes(u.hostname.toLowerCase())){const e=new Error('Generated provider host is not in MEDIA_EMBED_ALLOWED_HOSTS.');e.status=500;throw e}
  return u.toString();
}
async function tmdbFetch(env,path,params={}){
  if(!env.TMDB_API_KEY){const e=new Error('TMDB_API_KEY is not configured.');e.status=503;throw e}
  const u=new URL(`https://api.themoviedb.org/3${path}`);
  u.searchParams.set('api_key',env.TMDB_API_KEY);
  u.searchParams.set('language','en-GB');
  for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data?.status_message||`TMDB HTTP ${r.status}`);e.status=r.status>=400&&r.status<500?r.status:502;throw e}
  return data;
}
function tmdbPoster(path){
  return path?`https://image.tmdb.org/t/p/w342${path}`:'';
}
async function mediaSearch(env,q,type='multi'){
  const query=String(q||'').trim();
  if(query.length<2){const e=new Error('Search query must be at least 2 characters.');e.status=400;throw e}
  const safeType=['movie','tv','multi'].includes(type)?type:'multi';
  const data=await tmdbFetch(env,`/search/${safeType}`,{query,include_adult:'false',page:'1'});
  const results=(Array.isArray(data.results)?data.results:[])
    .map(x=>{
      const detected=safeType==='multi'?x.media_type:safeType;
      if(!['movie','tv'].includes(detected))return null;
      const title=detected==='movie'?(x.title||x.original_title):(x.name||x.original_name);
      const date=detected==='movie'?x.release_date:x.first_air_date;
      return {
        id:Number(x.id),
        type:detected,
        title:String(title||'Untitled').slice(0,180),
        year:String(date||'').slice(0,4),
        overview:String(x.overview||'').slice(0,600),
        posterUrl:tmdbPoster(x.poster_path),
        popularity:Number(x.popularity)||0
      };
    })
    .filter(Boolean)
    .slice(0,20);
  return {results,count:results.length};
}

function normaliseTmdbMedia(x,forcedType=''){
  const detected=forcedType||x.media_type;
  if(!['movie','tv'].includes(detected))return null;
  const title=detected==='movie'?(x.title||x.original_title):(x.name||x.original_name);
  const date=detected==='movie'?x.release_date:x.first_air_date;
  return {
    id:Number(x.id),
    type:detected,
    title:String(title||'Untitled').slice(0,180),
    year:String(date||'').slice(0,4),
    overview:String(x.overview||'').slice(0,700),
    posterUrl:x.poster_path?`https://image.tmdb.org/t/p/w342${x.poster_path}`:'',
    backdropUrl:x.backdrop_path?`https://image.tmdb.org/t/p/w780${x.backdrop_path}`:'',
    popularity:Number(x.popularity)||0,
    rating:Number(x.vote_average)||0
  };
}
async function mediaExplore(env,section='trending'){
  const allowed=new Set(['trending','movies','tv','new','top']);
  const mode=allowed.has(section)?section:'trending';
  let rows=[];

  if(mode==='trending'){
    const data=await tmdbFetch(env,'/trending/all/day',{page:'1'});
    rows=(data.results||[]).map(x=>normaliseTmdbMedia(x)).filter(Boolean);
  }else if(mode==='movies'){
    const data=await tmdbFetch(env,'/movie/popular',{page:'1',region:'GB'});
    rows=(data.results||[]).map(x=>normaliseTmdbMedia(x,'movie')).filter(Boolean);
  }else if(mode==='tv'){
    const data=await tmdbFetch(env,'/tv/popular',{page:'1'});
    rows=(data.results||[]).map(x=>normaliseTmdbMedia(x,'tv')).filter(Boolean);
  }else if(mode==='new'){
    const [movies,tv]=await Promise.all([
      tmdbFetch(env,'/movie/now_playing',{page:'1',region:'GB'}),
      tmdbFetch(env,'/tv/on_the_air',{page:'1'})
    ]);
    rows=[
      ...(movies.results||[]).map(x=>normaliseTmdbMedia(x,'movie')),
      ...(tv.results||[]).map(x=>normaliseTmdbMedia(x,'tv'))
    ].filter(Boolean).sort((a,b)=>b.popularity-a.popularity);
  }else if(mode==='top'){
    const [movies,tv]=await Promise.all([
      tmdbFetch(env,'/movie/top_rated',{page:'1'}),
      tmdbFetch(env,'/tv/top_rated',{page:'1'})
    ]);
    rows=[
      ...(movies.results||[]).map(x=>normaliseTmdbMedia(x,'movie')),
      ...(tv.results||[]).map(x=>normaliseTmdbMedia(x,'tv'))
    ].filter(Boolean).sort((a,b)=>b.rating-a.rating);
  }

  const seen=new Set();
  const results=rows.filter(x=>{
    const k=`${x.type}:${x.id}`;
    if(seen.has(k))return false;
    seen.add(k);return true;
  }).slice(0,24);

  return {section:mode,count:results.length,results,updatedAt:new Date().toISOString()};
}

async function mediaRecommendations(env,type,id){
  if(!['movie','tv'].includes(type)){const e=new Error('type must be movie or tv.');e.status=400;throw e}
  if(!/^\d+$/.test(String(id||''))){const e=new Error('A numeric TMDB id is required.');e.status=400;throw e}
  const data=await tmdbFetch(env,`/${type}/${encodeURIComponent(id)}/recommendations`,{page:'1'});
  const results=(Array.isArray(data.results)?data.results:[]).map(x=>normaliseTmdbMedia(x,type)).filter(Boolean).slice(0,16);
  return {type,id:Number(id),count:results.length,results};
}

async function mediaTvDetails(env,id){
  if(!/^\d+$/.test(String(id||''))){const e=new Error('A numeric TMDB id is required.');e.status=400;throw e}
  const data=await tmdbFetch(env,`/tv/${encodeURIComponent(id)}`);
  const seasons=(Array.isArray(data.seasons)?data.seasons:[]).map(s=>({
    seasonNumber:Number(s.season_number),
    name:String(s.name||`Season ${s.season_number}`).slice(0,120),
    episodeCount:Number(s.episode_count)||0,
    airDate:String(s.air_date||'')
  })).filter(s=>Number.isFinite(s.seasonNumber));
  return {id:Number(id),title:String(data.name||''),numberOfSeasons:Number(data.number_of_seasons)||0,seasons};
}
async function mediaSeason(env,id,season){
  if(!/^\d+$/.test(String(id||''))){const e=new Error('A numeric TMDB id is required.');e.status=400;throw e}
  const s=Number(season);
  if(!Number.isInteger(s)||s<1){const e=new Error('A valid season is required.');e.status=400;throw e}
  const data=await tmdbFetch(env,`/tv/${encodeURIComponent(id)}/season/${encodeURIComponent(s)}`);
  const episodes=(Array.isArray(data.episodes)?data.episodes:[]).map(ep=>({
    episodeNumber:Number(ep.episode_number),
    name:String(ep.name||`Episode ${ep.episode_number}`).slice(0,160),
    airDate:String(ep.air_date||'')
  })).filter(ep=>Number.isInteger(ep.episodeNumber)&&ep.episodeNumber>=1);
  return {id:Number(id),season:s,episodes};
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


const FOOTBALL_COMPETITIONS=new Set(['PL','PD','BL1','SA','FL1','DED','PPL','ELC','EL1','EL2','ENL','CL','EL','UCL','FAC','FLC']);

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
    const baseMessage=data?.message||data?.error||`football-data.org HTTP ${r.status}`;
    const err=new Error(r.status===403
      ? `${baseMessage} This competition may require a higher football-data.org access tier for your API key.`
      : baseMessage);
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

  const liveContentBaseConfigured=!!(env.LIVE_CONTENT_BASE_URL||env.LIVE_CONTENT_API_BASE_URL);
  services.push({
    name:'Live content provider',
    state:liveContentBaseConfigured?'Configured':'Not configured',
    kind:liveContentBaseConfigured?'info':'warn',
    detail:liveContentBaseConfigured
      ?`Provider base URL is present • mode: ${liveContentMode(env)}.`
      :'Add LIVE_CONTENT_BASE_URL to enable the live Sport player.'
  });
  services.push({
    name:'Movies & TV metadata',
    state:env.TMDB_API_KEY?'Configured':'Not configured',
    kind:env.TMDB_API_KEY?'info':'warn',
    detail:env.TMDB_API_KEY?'TMDB_API_KEY is present.':'Add TMDB_API_KEY to enable movie/TV search.'
  });
  services.push({
    name:'Movies & TV embed provider',
    state:env.MEDIA_EMBED_BASE_URL?'Configured':'Not configured',
    kind:env.MEDIA_EMBED_BASE_URL?'info':'warn',
    detail:env.MEDIA_EMBED_BASE_URL?'Authorised media provider base URL is present.':'Add MEDIA_EMBED_BASE_URL to enable the Movies & TV player.'
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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS football_notification_teams (
    device_id TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL DEFAULT '',
    team_crest TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(device_id,team_id)
  )`).run();
  // One-time/backward-compatible migration from the old single favourite columns.
  await env.DB.prepare(`INSERT OR IGNORE INTO football_notification_teams
    (device_id,team_id,team_name,team_crest,updated_at)
    SELECT device_id,team_id,team_name,team_crest,updated_at
    FROM football_notification_preferences
    WHERE team_id IS NOT NULL`).run();
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
async function footballTeamsForDevice(env,deviceId){
  await ensureFootballNotificationTables(env);
  const rows=await env.DB.prepare(`SELECT team_id,team_name,team_crest
    FROM football_notification_teams WHERE device_id=? ORDER BY team_name`)
    .bind(deviceId).all();
  return rows.results||[];
}
async function syncFootballPreferenceNow(env,deviceId){
  await ensureFootballNotificationTables(env);
  const pref=await env.DB.prepare(`SELECT p.*,d.endpoint,d.p256dh,d.auth
    FROM football_notification_preferences p
    LEFT JOIN devices d ON d.device_id=p.device_id
    WHERE p.device_id=?`).bind(deviceId).first();

  await env.DB.prepare("DELETE FROM notifications WHERE device_id=? AND kind='football' AND sent=0")
    .bind(deviceId).run();

  if(!pref||!pref.enabled)return {scheduled:0,teams:0};
  const teams=await footballTeamsForDevice(env,deviceId);
  if(!teams.length)return {scheduled:0,teams:0};
  if(!pref.endpoint)return {scheduled:0,teams:teams.length,warning:'This device is not registered for Web Push yet.'};

  let scheduled=0;
  const teamCache=new Map();
  for(const team of teams){
    const teamId=Number(team.team_id);
    let matches=teamCache.get(teamId);
    if(!matches){
      matches=await footballTeamMatches(env,teamId,2,21);
      teamCache.set(teamId,matches);
    }
    const teamPref={...pref,team_id:teamId,team_name:team.team_name,team_crest:team.team_crest};
    scheduled+=await scheduleFootballAlertsForPreference(env,teamPref,matches);
    await sendFootballFinalScores(env,teamPref,matches);
  }
  return {scheduled,teams:teams.length};
}
async function refreshFootballNotifications(env){
  if(!env.FOOTBALL_DATA_API_KEY)return;
  await ensureFootballNotificationTables(env);
  const rows=await env.DB.prepare(`SELECT
      p.device_id,p.enabled,p.timezone,p.notify_24h,p.notify_1h,p.notify_kickoff,p.notify_final,
      d.endpoint,d.p256dh,d.auth,
      t.team_id,t.team_name,t.team_crest
    FROM football_notification_preferences p
    JOIN devices d ON d.device_id=p.device_id
    JOIN football_notification_teams t ON t.device_id=p.device_id
    WHERE p.enabled=1`).all();
  const prefs=rows.results||[];
  if(!prefs.length)return;

  const devices=[...new Set(prefs.map(p=>p.device_id))];
  for(const deviceId of devices){
    await env.DB.prepare("DELETE FROM notifications WHERE device_id=? AND kind='football' AND sent=0")
      .bind(deviceId).run();
  }

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
    }catch(e){console.error('football notification schedule failed',pref.device_id,pref.team_id,e)}
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
          deviceId,enabled=true,teams=[],timezone='Europe/London',
          notify24h=true,notify1h=true,notifyKickoff=true,notifyFinal=true
        }=body||{};
        if(!deviceId)return json({error:'deviceId required'},400);

        const cleanTeams=(Array.isArray(teams)?teams:[])
          .map(t=>({
            id:Number(t?.id)||0,
            name:String(t?.name||'').slice(0,120),
            crest:String(t?.crest||'').slice(0,500)
          }))
          .filter(t=>t.id>0)
          .filter((t,i,a)=>a.findIndex(x=>x.id===t.id)===i)
          .slice(0,20);

        await ensureFootballNotificationTables(env);
        const primary=cleanTeams[0]||null;

        // Keep the original single-team columns populated for backward
        // compatibility while the new child table stores every favourite.
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
            deviceId,enabled?1:0,primary?.id||null,primary?.name||'',primary?.crest||'',
            timezone||'Europe/London',
            notify24h?1:0,notify1h?1:0,notifyKickoff?1:0,notifyFinal?1:0,Date.now()
          ).run();

        await env.DB.prepare('DELETE FROM football_notification_teams WHERE device_id=?')
          .bind(deviceId).run();
        for(const team of cleanTeams){
          await env.DB.prepare(`INSERT INTO football_notification_teams
            (device_id,team_id,team_name,team_crest,updated_at) VALUES(?,?,?,?,?)`)
            .bind(deviceId,team.id,team.name,team.crest,Date.now()).run();
        }

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
        const teams=await footballTeamsForDevice(env,deviceId);
        const names=teams.map(t=>t.team_name).filter(Boolean);
        const label=names.length<=3?names.join(', '):`${names.slice(0,3).join(', ')} +${names.length-3} more`;
        await sendOne({
          endpoint:pref.endpoint,p256dh:pref.p256dh,auth:pref.auth,
          title:'⚽ Football alerts are working',
          body:names.length?`You will receive match alerts for ${label}.`:'Your football notifications are ready.',
          url:'/#football',
          id:`football-test-${Date.now()}`
        },env);
        return json({ok:true,teams:names.length});
      }

      if(url.pathname==='/api/media/status'&&request.method==='GET'){
        const providerConfigured=!!env.MEDIA_EMBED_BASE_URL;
        const tmdbConfigured=!!env.TMDB_API_KEY;
        return json({
          ready:providerConfigured&&tmdbConfigured,
          providerConfigured,
          tmdbConfigured,
          routes:{
            standard:env.MEDIA_EMBED_PATH_STANDARD||'/embed',
            alternate:env.MEDIA_EMBED_PATH_TORRENT||'/embed/torrent',
            aggregator:env.MEDIA_EMBED_PATH_AGG||'/embed/agg'
          }
        },providerConfigured&&tmdbConfigured?200:503);
      }

      if(url.pathname==='/api/media/explore'&&request.method==='GET'){
        return json(await mediaExplore(env,url.searchParams.get('section')||'trending'));
      }

      if(url.pathname==='/api/media/recommendations'&&request.method==='GET'){
        return json(await mediaRecommendations(env,url.searchParams.get('type')||'',url.searchParams.get('id')||''));
      }

      if(url.pathname==='/api/media/search'&&request.method==='GET'){
        return json(await mediaSearch(
          env,
          url.searchParams.get('q')||'',
          url.searchParams.get('type')||'multi'
        ));
      }

      if(url.pathname==='/api/media/tv'&&request.method==='GET'){
        return json(await mediaTvDetails(env,url.searchParams.get('id')||''));
      }

      if(url.pathname==='/api/media/season'&&request.method==='GET'){
        return json(await mediaSeason(
          env,
          url.searchParams.get('id')||'',
          url.searchParams.get('season')||''
        ));
      }

      if(url.pathname==='/api/media/embed-url'&&request.method==='GET'){
        return json({
          embedUrl:buildMediaEmbedUrl(env,{
            type:url.searchParams.get('type')||'',
            id:url.searchParams.get('id')||'',
            season:url.searchParams.get('season')||'',
            episode:url.searchParams.get('episode')||'',
            mode:url.searchParams.get('mode')||'standard'
          })
        });
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
