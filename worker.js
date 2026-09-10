import { sendPushNotification } from '@mmmike/web-push/send';
import { handleTransfers, cleanTransfers, flushTransferPushes } from './transfers.js';
import { handleMessages, cleanMessages, flushMessagePushes } from './messages.js';

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
function financialRelevanceScore(article){
  const title=String(article?.title||'').toLowerCase();
  const desc=String(article?.description||article?.summary||'').toLowerCase();
  const categories=(Array.isArray(article?.category)?article.category:[]).join(' ').toLowerCase();
  const text=`${title} ${desc} ${categories}`;

  const strong=[
    'stock market','stocks','shares','equities','ftse','s&p 500','s&p500','nasdaq','dow jones',
    'bond market','bonds','treasury yield','gilt','yields','interest rate','rate cut','rate hike',
    'bank of england','federal reserve','fed rate','ecb','central bank','inflation','cpi','gdp',
    'recession','economic growth','unemployment','jobs report','payrolls','earnings','quarterly results',
    'revenue','operating profit','net profit','profit warning','dividend','buyback','ipo','initial public offering',
    'merger','acquisition','takeover','valuation','market cap','investor','investment','portfolio',
    'forex','foreign exchange','currency','sterling','pound','dollar','euro','yen',
    'oil price','crude oil','gold price','commodities','bitcoin','crypto','cryptocurrency',
    'mortgage rates','banking sector','financial markets','financial market','economy macro',
    'economy monetary','earnings'
  ];
  const medium=[
    'market','economy','economic','finance','financial','bank','lender','company','business',
    'trade','tariff','budget','fiscal','debt','credit','fund','asset','wealth','pension'
  ];
  const noise=[
    'celebrity','film','movie','music','tv show','football','soccer','tennis','basketball',
    'fashion','recipe','weather forecast','crime scene','murder','royal family','horoscope'
  ];

  let score=0;
  strong.forEach(k=>{if(text.includes(k))score+=3});
  medium.forEach(k=>{if(text.includes(k))score+=1});
  noise.forEach(k=>{if(text.includes(k))score-=2});

  // Alpha Vantage topic metadata is particularly useful for keeping this feed focused.
  const topicText=categories.replaceAll('_',' ');
  if(['financial markets','economy macro','economy monetary','earnings'].some(k=>topicText.includes(k)))score+=4;

  return score;
}
function filterFinancialArticles(items,limit=10){
  const seen=new Set();
  return (Array.isArray(items)?items:[])
    .map(a=>({...a,_financeScore:financialRelevanceScore(a)}))
    .filter(a=>a.title&&a.link&&a._financeScore>=3)
    .sort((a,b)=>(b._financeScore-a._financeScore)||String(b.pubDate||'').localeCompare(String(a.pubDate||'')))
    .filter(a=>{
      const key=String(a.title||'').toLowerCase().replace(/\s+/g,' ').trim();
      if(!key||seen.has(key))return false;
      seen.add(key);return true;
    })
    .slice(0,limit)
    .map(({_financeScore,...a})=>a);
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
  const mapped=(Array.isArray(data.feed)?data.feed:[]).map(a=>({
    id:String(a.url||`${a.title||''}-${a.time_published||''}`),
    kind:'financial',title:String(a.title||'').trim(),description:String(a.summary||'').trim().slice(0,500),
    link:String(a.url||''),source:String(a.source||'Alpha Vantage'),pubDate:a.time_published||'',
    category:(a.topics||[]).map(x=>x.topic).filter(Boolean),
    overallSentimentLabel:a.overall_sentiment_label||'',overallSentimentScore:Number(a.overall_sentiment_score)
  })).filter(a=>a.title&&a.link);
  return filterFinancialArticles(mapped,14);
}

async function newsCategory(env,kind,force=false){
  await ensureNewsTables(env);
  // Version the financial cache so older broad/random finance results are not reused.
  const cacheKind=kind==='financial'?'financial-focused-v2':kind;
  const cached=await env.DB.prepare('SELECT payload,updated_at FROM news_cache WHERE kind=?').bind(cacheKind).first();
  const maxAge=60*60*1000;
  if(!force&&cached&&Date.now()-Number(cached.updated_at)<maxAge){
    try{return JSON.parse(cached.payload)}catch{}
  }
  const raw=kind==='financial'
    ? await fetchNewsData('market',env,{})
    : await fetchNewsData('latest',env,{category:'top,world'});
  const mapped=raw.map(a=>cleanNewsArticle(a,kind)).filter(a=>a.title&&a.link);
  const cleaned=kind==='financial'?filterFinancialArticles(mapped,10):mapped.slice(0,10);
  await env.DB.prepare('INSERT INTO news_cache(kind,payload,updated_at) VALUES(?,?,?) ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at')
    .bind(cacheKind,JSON.stringify(cleaned),Date.now()).run();
  return cleaned;
}
async function getNewsBundle(env,force=false,financialProvider='hybrid'){
  const worldPromise=newsCategory(env,'world',force);
  let financialPromise;
  if(financialProvider==='alphavantage'){
    financialPromise=fetchAlphaVantageFinancialNews(env).then(x=>filterFinancialArticles(x,10));
  }else if(financialProvider==='newsdata'){
    financialPromise=newsCategory(env,'financial',force);
  }else{
    financialPromise=(async()=>{
      let av=[],nd=[];
      try{av=await fetchAlphaVantageFinancialNews(env)}catch(e){console.warn('Alpha Vantage financial news failed',e)}
      // If Alpha Vantage does not provide enough strongly relevant stories, top up from NewsData.
      if(av.length<8){
        try{nd=await newsCategory(env,'financial',force)}catch(e){console.warn('NewsData financial news failed',e)}
      }
      return filterFinancialArticles([...av,...nd],10);
    })();
  }
  const [world,financial]=await Promise.all([worldPromise,financialPromise]);
  return {world,financial,updatedAt:new Date().toISOString(),financialProvider,financialFocus:'strict'};
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
function csvHosts(value){
  return String(value||'').split(',').map(x=>x.trim().replace(/\/+$/,'').toLowerCase()).filter(Boolean);
}
function cleanProviderId(value){
  const id=String(value||'1');
  return ['1','2','3'].includes(id)?id:'1';
}
function liveProviderCategory(cfg,category){
  const key=String(category||'soccer').toLowerCase();
  const mapped=cfg?.categoryAliases?.[key];
  return String(mapped||key).trim().toLowerCase().replace(/[^a-z0-9_-]/g,'')||key;
}
function liveProviderConfig(env,providerId='1'){
  const id=cleanProviderId(providerId);

  if(id==='1'){
    return {
      id:'1',
      name:String(env.LIVE_PROVIDER_1_NAME||'Provider 1').trim().slice(0,60)||'Provider 1',
      mode:(['scrape','dynamic'].includes(String(env.LIVE_PROVIDER_1_MODE||'api').trim().toLowerCase())?String(env.LIVE_PROVIDER_1_MODE||'api').trim().toLowerCase():'api'),
      baseUrl:String(env.LIVE_PROVIDER_1_BASE_URL||env.LIVE_CONTENT_API_BASE_URL||'').trim(),
      apiPath:String(env.LIVE_PROVIDER_1_API_PATH||env.LIVE_CONTENT_API_PATH||'/api/v1/streams').trim()||'/api/v1/streams',
      scrapePath:String(env.LIVE_PROVIDER_1_SCRAPE_PATH||'/').trim()||'/',
      pageHosts:String(env.LIVE_PROVIDER_1_ALLOWED_PAGE_HOSTS||'').trim(),
      embedHosts:String(env.LIVE_PROVIDER_1_ALLOWED_EMBED_HOSTS||env.LIVE_CONTENT_ALLOWED_EMBED_HOSTS||'').trim(),
      linkHints:String(env.LIVE_PROVIDER_1_LINK_HINTS||'').trim(),
      maxScrapePages:Number(env.LIVE_PROVIDER_1_MAX_SCRAPE_PAGES)||12,
      apiKey:String(env.LIVE_PROVIDER_1_API_KEY||env.LIVE_CONTENT_API_KEY||'').trim(),
      dynamicPath:String(env.LIVE_PROVIDER_1_DYNAMIC_PATH||'').trim(),
      dynamicBaseUrl:String(env.LIVE_PROVIDER_1_DYNAMIC_BASE_URL||'').trim(),
      dynamicAllowedHosts:String(env.LIVE_PROVIDER_1_ALLOWED_DATA_HOSTS||'').trim(),
      dynamicCacheBustParam:String(env.LIVE_PROVIDER_1_DYNAMIC_CACHEBUST_PARAM||'').trim(),
      dynamicRoot:String(env.LIVE_PROVIDER_1_DYNAMIC_ROOT||'').trim(),
      dynamicCategoryField:String(env.LIVE_PROVIDER_1_DYNAMIC_CATEGORY_FIELD||'').trim(),
      dynamicItemsField:String(env.LIVE_PROVIDER_1_DYNAMIC_ITEMS_FIELD||'').trim(),
      dynamicCategoryParam:String(env.LIVE_PROVIDER_1_DYNAMIC_CATEGORY_PARAM||'').trim(),
      resolverPath:String(env.LIVE_PROVIDER_1_RESOLVE_PATH||'').trim(),
      resolverBaseUrl:String(env.LIVE_PROVIDER_1_RESOLVE_BASE_URL||'').trim(),
      resolverAllowedHosts:String(env.LIVE_PROVIDER_1_ALLOWED_RESOLVE_HOSTS||'').trim(),
      resolverSourceParam:String(env.LIVE_PROVIDER_1_RESOLVE_SOURCE_PARAM||'source').trim()||'source',
      resolverIdParam:String(env.LIVE_PROVIDER_1_RESOLVE_ID_PARAM||'id').trim()||'id',
      resolverUrlField:String(env.LIVE_PROVIDER_1_RESOLVE_URL_FIELD||'').trim(),
      resolverCacheBustParam:String(env.LIVE_PROVIDER_1_RESOLVE_CACHEBUST_PARAM||'').trim(),

      categoryAliases:{
        soccer:String(env.LIVE_PROVIDER_1_CATEGORY_SOCCER||'soccer').trim(),
        tennis:String(env.LIVE_PROVIDER_1_CATEGORY_TENNIS||'tennis').trim(),
        basketball:String(env.LIVE_PROVIDER_1_CATEGORY_BASKETBALL||'basketball').trim()
      }
    };
  }

  if(id==='2'){
    return {
      id:'2',
      name:String(env.LIVE_PROVIDER_2_NAME||'Provider 2').trim().slice(0,60)||'Provider 2',
      mode:(['api','dynamic'].includes(String(env.LIVE_PROVIDER_2_MODE||env.LIVE_CONTENT_PROVIDER_MODE||'scrape').trim().toLowerCase())?String(env.LIVE_PROVIDER_2_MODE||env.LIVE_CONTENT_PROVIDER_MODE||'scrape').trim().toLowerCase():'scrape'),
      baseUrl:String(env.LIVE_PROVIDER_2_BASE_URL||env.LIVE_CONTENT_BASE_URL||'').trim(),
      apiPath:String(env.LIVE_PROVIDER_2_API_PATH||env.LIVE_CONTENT_API_PATH||'/api/v1/streams').trim()||'/api/v1/streams',
      scrapePath:String(env.LIVE_PROVIDER_2_SCRAPE_PATH||env.LIVE_CONTENT_SCRAPE_PATH||'/').trim()||'/',
      pageHosts:String(env.LIVE_PROVIDER_2_ALLOWED_PAGE_HOSTS||env.LIVE_CONTENT_ALLOWED_PAGE_HOSTS||'').trim(),
      embedHosts:String(env.LIVE_PROVIDER_2_ALLOWED_EMBED_HOSTS||env.LIVE_CONTENT_ALLOWED_EMBED_HOSTS||'').trim(),
      linkHints:String(env.LIVE_PROVIDER_2_LINK_HINTS||env.LIVE_CONTENT_LINK_HINTS||'').trim(),
      maxScrapePages:Number(env.LIVE_PROVIDER_2_MAX_SCRAPE_PAGES||env.LIVE_CONTENT_MAX_SCRAPE_PAGES)||12,
      apiKey:String(env.LIVE_PROVIDER_2_API_KEY||env.LIVE_CONTENT_API_KEY||'').trim(),
      dynamicPath:String(env.LIVE_PROVIDER_2_DYNAMIC_PATH||'').trim(),
      dynamicBaseUrl:String(env.LIVE_PROVIDER_2_DYNAMIC_BASE_URL||'').trim(),
      dynamicAllowedHosts:String(env.LIVE_PROVIDER_2_ALLOWED_DATA_HOSTS||'').trim(),
      dynamicCacheBustParam:String(env.LIVE_PROVIDER_2_DYNAMIC_CACHEBUST_PARAM||'').trim(),
      dynamicRoot:String(env.LIVE_PROVIDER_2_DYNAMIC_ROOT||'').trim(),
      dynamicCategoryField:String(env.LIVE_PROVIDER_2_DYNAMIC_CATEGORY_FIELD||'').trim(),
      dynamicItemsField:String(env.LIVE_PROVIDER_2_DYNAMIC_ITEMS_FIELD||'').trim(),
      dynamicCategoryParam:String(env.LIVE_PROVIDER_2_DYNAMIC_CATEGORY_PARAM||'').trim(),
      resolverPath:String(env.LIVE_PROVIDER_2_RESOLVE_PATH||'').trim(),
      resolverBaseUrl:String(env.LIVE_PROVIDER_2_RESOLVE_BASE_URL||'').trim(),
      resolverAllowedHosts:String(env.LIVE_PROVIDER_2_ALLOWED_RESOLVE_HOSTS||'').trim(),
      resolverSourceParam:String(env.LIVE_PROVIDER_2_RESOLVE_SOURCE_PARAM||'source').trim()||'source',
      resolverIdParam:String(env.LIVE_PROVIDER_2_RESOLVE_ID_PARAM||'id').trim()||'id',
      resolverUrlField:String(env.LIVE_PROVIDER_2_RESOLVE_URL_FIELD||'').trim(),
      resolverCacheBustParam:String(env.LIVE_PROVIDER_2_RESOLVE_CACHEBUST_PARAM||'').trim(),

      categoryAliases:{
        soccer:String(env.LIVE_PROVIDER_2_CATEGORY_SOCCER||'soccer').trim(),
        tennis:String(env.LIVE_PROVIDER_2_CATEGORY_TENNIS||'tennis').trim(),
        basketball:String(env.LIVE_PROVIDER_2_CATEGORY_BASKETBALL||'basketball').trim()
      }
    };
  }

  return {
    id:'3',
    name:String(env.LIVE_PROVIDER_3_NAME||'Provider 3').trim().slice(0,60)||'Provider 3',
    mode:(['scrape','dynamic'].includes(String(env.LIVE_PROVIDER_3_MODE||'api').trim().toLowerCase())?String(env.LIVE_PROVIDER_3_MODE||'api').trim().toLowerCase():'api'),
    baseUrl:String(env.LIVE_PROVIDER_3_BASE_URL||'').trim(),
    apiPath:String(env.LIVE_PROVIDER_3_API_PATH||'/api/v1/streams').trim()||'/api/v1/streams',
    scrapePath:String(env.LIVE_PROVIDER_3_SCRAPE_PATH||'/').trim()||'/',
    pageHosts:String(env.LIVE_PROVIDER_3_ALLOWED_PAGE_HOSTS||'').trim(),
    embedHosts:String(env.LIVE_PROVIDER_3_ALLOWED_EMBED_HOSTS||'').trim(),
    linkHints:String(env.LIVE_PROVIDER_3_LINK_HINTS||'').trim(),
    maxScrapePages:Number(env.LIVE_PROVIDER_3_MAX_SCRAPE_PAGES)||12,
    apiKey:String(env.LIVE_PROVIDER_3_API_KEY||'').trim(),
      dynamicPath:String(env.LIVE_PROVIDER_3_DYNAMIC_PATH||'').trim(),
      dynamicBaseUrl:String(env.LIVE_PROVIDER_3_DYNAMIC_BASE_URL||'').trim(),
      dynamicAllowedHosts:String(env.LIVE_PROVIDER_3_ALLOWED_DATA_HOSTS||'').trim(),
      dynamicCacheBustParam:String(env.LIVE_PROVIDER_3_DYNAMIC_CACHEBUST_PARAM||'').trim(),
      dynamicRoot:String(env.LIVE_PROVIDER_3_DYNAMIC_ROOT||'').trim(),
      dynamicCategoryField:String(env.LIVE_PROVIDER_3_DYNAMIC_CATEGORY_FIELD||'').trim(),
      dynamicItemsField:String(env.LIVE_PROVIDER_3_DYNAMIC_ITEMS_FIELD||'').trim(),
      dynamicCategoryParam:String(env.LIVE_PROVIDER_3_DYNAMIC_CATEGORY_PARAM||'').trim(),
      resolverPath:String(env.LIVE_PROVIDER_3_RESOLVE_PATH||'').trim(),
      resolverBaseUrl:String(env.LIVE_PROVIDER_3_RESOLVE_BASE_URL||'').trim(),
      resolverAllowedHosts:String(env.LIVE_PROVIDER_3_ALLOWED_RESOLVE_HOSTS||'').trim(),
      resolverSourceParam:String(env.LIVE_PROVIDER_3_RESOLVE_SOURCE_PARAM||'source').trim()||'source',
      resolverIdParam:String(env.LIVE_PROVIDER_3_RESOLVE_ID_PARAM||'id').trim()||'id',
      resolverUrlField:String(env.LIVE_PROVIDER_3_RESOLVE_URL_FIELD||'').trim(),
      resolverCacheBustParam:String(env.LIVE_PROVIDER_3_RESOLVE_CACHEBUST_PARAM||'').trim(),

    categoryAliases:{
      soccer:String(env.LIVE_PROVIDER_3_CATEGORY_SOCCER||'soccer').trim(),
      tennis:String(env.LIVE_PROVIDER_3_CATEGORY_TENNIS||'tennis').trim(),
      basketball:String(env.LIVE_PROVIDER_3_CATEGORY_BASKETBALL||'basketball').trim()
    }
  };
}
function liveProviderPublicInfo(env,providerId){
  const cfg=liveProviderConfig(env,providerId);
  let hostname='';
  try{hostname=normaliseBaseUrl(cfg.baseUrl)?.hostname||''}catch{}
  return {
    id:cfg.id,
    name:cfg.name,
    mode:cfg.mode,
    configured:!!hostname,
    hostname
  };
}
function configuredLiveProviders(env){
  return ['1','2','3'].map(id=>liveProviderPublicInfo(env,id)).filter(x=>x.configured);
}
function allowedEmbedUrl(embedUrl,base,cfg){
  try{
    const u=new URL(embedUrl);
    if(u.protocol!=='https:')return false;
    const configured=csvHosts(cfg.embedHosts);
    const hosts=configured.length?configured:[base.hostname.toLowerCase()];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
function allowedProviderPageUrl(pageUrl,base,cfg){
  try{
    const u=new URL(pageUrl,base);
    if(u.protocol!=='https:')return false;
    const configured=csvHosts(cfg.pageHosts);
    const hosts=configured.length?configured:[base.hostname.toLowerCase()];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
function allowedDynamicDataUrl(dataUrl,dataBase,cfg){
  try{
    const u=new URL(dataUrl,dataBase);
    if(u.protocol!=='https:')return false;
    const configured=csvHosts(cfg.dynamicAllowedHosts);
    const fallback=[
      dataBase.hostname.toLowerCase(),
      ...csvHosts(cfg.pageHosts)
    ];
    const hosts=configured.length?configured:[...new Set(fallback)];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
function allowedResolverUrl(resolverUrl,resolverBase,cfg){
  try{
    const u=new URL(resolverUrl,resolverBase);
    if(u.protocol!=='https:')return false;
    const configured=csvHosts(cfg.resolverAllowedHosts);
    const fallback=[
      resolverBase.hostname.toLowerCase(),
      ...csvHosts(cfg.dynamicAllowedHosts),
      ...csvHosts(cfg.pageHosts)
    ];
    const hosts=configured.length?configured:[...new Set(fallback)];
    return hosts.includes(u.hostname.toLowerCase());
  }catch{return false}
}
function sourceUrlCandidate(value){
  if(typeof value==='string')return value.trim();
  if(!value||typeof value!=='object')return '';
  const candidate=String(value.embed_url||value.url||value.src||'').trim();
  return /^https:\/\//i.test(candidate)?candidate:'';
}
function sourceLabelCandidate(value,index){
  if(value&&typeof value==='object'){
    const label=String(value.label||value.name||value.quality||value.source||'').trim();
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
function allowedStreamSources(stream,base,cfg){
  return rawStreamSourceEntries(stream).filter(entry=>allowedEmbedUrl(entry.url,base,cfg));
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
  const result={title:'',ogTitle:'',thumbnail:'',embedCandidates:[],pageLinks:[]};
  let titleText='';

  const rewriter=new HTMLRewriter()
    .on('title',{text(chunk){titleText+=chunk.text||''}})
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
        const absolute=safeHttpsUrl(el.getAttribute('src'),pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('video[src]',{
      element(el){
        const absolute=safeHttpsUrl(el.getAttribute('src'),pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('source[src]',{
      element(el){
        const absolute=safeHttpsUrl(el.getAttribute('src'),pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('[data-embed]',{
      element(el){
        const absolute=safeHttpsUrl(el.getAttribute('data-embed'),pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('[data-src]',{
      element(el){
        const absolute=safeHttpsUrl(el.getAttribute('data-src'),pageUrl);
        if(absolute)result.embedCandidates.push(absolute);
      }
    })
    .on('a[href]',{
      element(el){
        const absolute=safeHttpsUrl(el.getAttribute('href'),pageUrl);
        if(absolute)result.pageLinks.push(absolute);
      }
    });

  const transformed=rewriter.transform(response);
  await transformed.text();

  result.title=titleText.trim().replace(/\s+/g,' ').slice(0,180);
  result.embedCandidates=[...new Set(result.embedCandidates)];
  result.pageLinks=[...new Set(result.pageLinks)];
  return result;
}
function scrapeLinkHints(cfg,category){
  const configured=String(cfg.linkHints||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(configured.length)return configured;
  const c=String(category||'soccer').toLowerCase();
  if(c==='tennis')return ['tennis','atp','wta','match','court','event','watch','stream','live','sport'];
  if(c==='basketball')return ['basketball','nba','wnba','game','match','event','watch','stream','live','sport'];
  return ['football','soccer','match','game','event','watch','stream','live','sport'];
}
function isLikelyEventPage(url,hints){
  try{
    const u=new URL(url);
    const hay=(u.pathname+' '+u.search).toLowerCase();
    return hints.some(h=>h&&hay.includes(h));
  }catch{return false}
}

async function scrapeAuthorisedProvider(cfg,base,category){
  if(typeof HTMLRewriter==='undefined'){
    const err=new Error('HTML scraping mode requires the Cloudflare Workers HTMLRewriter runtime.');
    err.status=500;
    throw err;
  }

  const providerCategory=liveProviderCategory(cfg,category);
  const path=String(cfg.scrapePath||'/').replace(/\{category\}/g,encodeURIComponent(providerCategory));
  const listingUrl=new URL(path,base).toString();

  if(!allowedProviderPageUrl(listingUrl,base,cfg)){
    const err=new Error(`Provider ${cfg.id}: scrape path resolves to a page host that is not allowed.`);
    err.status=500;
    throw err;
  }

  const headers={
    accept:'text/html,application/xhtml+xml',
    'user-agent':'CommandCentre/1.0 authorised-content-integration'
  };
  if(cfg.apiKey)headers.authorization=`Bearer ${cfg.apiKey}`;

  const listingResponse=await fetch(listingUrl,{headers,redirect:'follow'});
  if(!listingResponse.ok){
    const err=new Error(`${cfg.name} HTTP ${listingResponse.status}`);
    err.status=listingResponse.status>=400&&listingResponse.status<500?listingResponse.status:502;
    throw err;
  }

  const listing=await extractAuthorisedHtmlPage(listingResponse,listingUrl);
  const hints=scrapeLinkHints(cfg,category);
  const maxPages=Math.max(1,Math.min(24,Number(cfg.maxScrapePages)||12));

  const eventPages=listing.pageLinks
    .filter(url=>allowedProviderPageUrl(url,base,cfg))
    .filter(url=>isLikelyEventPage(url,hints))
    .filter(url=>url!==listingUrl)
    .slice(0,maxPages);

  const streams=[];

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
      const directEmbedLinks=page.pageLinks.filter(url=>allowedEmbedUrl(url,base,cfg));
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


function valueAtPath(obj,path){
  const clean=String(path||'').trim();
  if(!clean)return obj;
  return clean.split('.').filter(Boolean).reduce((cur,key)=>{
    if(cur===null||cur===undefined)return undefined;
    return cur[key];
  },obj);
}
function firstUseful(obj,keys){
  for(const key of keys){
    const v=valueAtPath(obj,key);
    if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;
  }
  return '';
}
function normaliseCategoryWord(value){
  const v=String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(['football','soccer'].includes(v))return 'soccer';
  if(['basketball','basket'].includes(v))return 'basketball';
  if(['tennis','atp','wta'].includes(v))return 'tennis';
  return v;
}
function dynamicItemCategory(item,cfg){
  const explicit=cfg.dynamicCategoryField?valueAtPath(item,cfg.dynamicCategoryField):undefined;
  return firstUseful(
    {explicit,item},
    [
      'explicit','item.__providerCategory','item.category','item.category_name',
      'item.genre_name','item.genreName','item.sport','item.sport_name',
      'item.type','item.group','item.section'
    ]
  );
}
function dynamicCategoryMatches(item,cfg,requestedCategory){
  const found=normaliseCategoryWord(dynamicItemCategory(item,cfg));
  if(!found)return true;
  return found===normaliseCategoryWord(requestedCategory);
}
function dynamicRootItems(data,cfg){
  if(Array.isArray(data))return data;
  if(cfg.dynamicRoot){
    const rooted=valueAtPath(data,cfg.dynamicRoot);
    return Array.isArray(rooted)?rooted:[];
  }
  const candidates=[
    data?.streams,
    data?.data,
    data?.events,
    data?.results,
    data?.items,
    data?.matches
  ];
  return candidates.find(Array.isArray)||[];
}
function dynamicCategoryMetadata(data){
  const groups=[data?.genres,data?.categories,data?.sports].find(Array.isArray)||[];
  const categories=new Map();
  const subcategories=new Map();

  groups.forEach(group=>{
    if(!group||typeof group!=='object')return;
    const id=firstUseful(group,['id','key','value','slug']);
    const name=firstUseful(group,['name','title','label','category','sport']);
    if(id!==''&&id!==undefined&&id!==null&&name){
      categories.set(String(id),String(name));
    }

    const children=[group.sub_categories,group.subCategories,group.subgenres,group.children]
      .find(Array.isArray)||[];
    children.forEach(child=>{
      if(!child||typeof child!=='object')return;
      const childId=firstUseful(child,['id','key','value','slug']);
      const childName=firstUseful(child,['name','title','label']);
      if(id!==''&&childId!==''&&childId!==undefined&&childId!==null&&childName){
        subcategories.set(`${id}:${childId}`,String(childName));
      }
    });
  });

  return {categories,subcategories};
}
function annotateDynamicItems(data,items){
  const rows=Array.isArray(items)?items:[];
  const metadata=dynamicCategoryMetadata(data);
  if(!metadata.categories.size&&!metadata.subcategories.size)return rows;

  return rows.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))return item;
    const categoryId=firstUseful(item,['genre','genre_id','genreId','category_id','categoryId','sport_id','sportId']);
    const subcategoryId=firstUseful(item,['sub_genre','subGenre','sub_genre_id','subGenreId','subcategory_id','subcategoryId']);
    const category=metadata.categories.get(String(categoryId))||'';
    const league=metadata.subcategories.get(`${categoryId}:${subcategoryId}`)||'';
    return category||league?{...item,__providerCategory:category,__providerLeague:league}:item;
  });
}
function dynamicNestedItems(group,cfg){
  if(!group||typeof group!=='object')return [];

  // Explicit configuration wins.
  if(cfg.dynamicItemsField){
    const nested=valueAtPath(group,cfg.dynamicItemsField);
    return Array.isArray(nested)?nested:[];
  }

  // Common nested collection names.
  const candidates=[
    group.streams,
    group.events,
    group.items,
    group.matches,
    group.results,
    group.data
  ];
  return candidates.find(Array.isArray)||[];
}
function dynamicExpandItems(rootItems,cfg,requestedCategory){
  const rows=Array.isArray(rootItems)?rootItems:[];

  // First try the grouped/nested shape:
  // {
  //   "streams": [
  //     {"category":"Football","streams":[...]},
  //     {"category":"Tennis","streams":[...]}
  //   ]
  // }
  // Event rows commonly contain a `streams` source array too. Do not mistake
  // those rows for category groups and flatten away the event title/metadata.
  const looksLikeEvent=row=>!!firstUseful(row,[
    'isevent','match_timestamp','timestamp','starts_at','startTime','start_time',
    'time','url','embed_url','embedUrl','player_url','playerUrl','viewers'
  ]);
  const matchingGroups=rows
    .filter(group=>!looksLikeEvent(group))
    .filter(group=>dynamicCategoryMatches(group,cfg,requestedCategory));
  const nested=matchingGroups.flatMap(group=>dynamicNestedItems(group,cfg));

  if(nested.length){
    return nested.map(item=>({
      ...item,
      __groupCategory:dynamicItemCategory(matchingGroups.find(group=>{
        const items=dynamicNestedItems(group,cfg);
        return items.includes(item);
      })||{},cfg)
    }));
  }

  // Otherwise treat the root array as the stream/event list itself.
  return rows.filter(item=>dynamicCategoryMatches(item,cfg,requestedCategory));
}
function dynamicSourceList(item){
  const raw=firstUseful(
    item,
    ['sources','streams','players','links','mirrors']
  );
  if(Array.isArray(raw))return raw;
  if(raw&&typeof raw==='object')return Object.values(raw);
  return [];
}
function dynamicSourceRefs(item){
  return dynamicSourceList(item).map((value,index)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return null;

    const source=String(
      value.source??value.provider??value.type??value.server??''
    ).trim().slice(0,80);
    const id=String(
      value.id??value.key??value.stream_id??value.streamId??value.slug??''
    ).trim().slice(0,300);

    if(!source||!id)return null;

    const label=String(
      value.label??value.name??value.quality??source??`Source ${index+1}`
    ).trim().slice(0,60)||`Source ${index+1}`;

    return {source,id,label};
  }).filter(Boolean);
}
function safeResolverToken(value,max=300){
  const s=String(value||'').trim();
  if(!s||s.length>max||/[\u0000-\u001f\u007f]/.test(s))return '';
  return s;
}
function resolverUrlCandidate(data,cfg){
  if(cfg.resolverUrlField){
    const configured=valueAtPath(data,cfg.resolverUrlField);
    if(typeof configured==='string'&&configured.trim())return configured.trim();
  }

  const fields=[
    'url','embed_url','embedUrl','iframe','iframe_url','player_url','playerUrl',
    'stream_url','streamUrl','src',
    'data.url','data.embed_url','data.embedUrl','data.iframe','data.player_url','data.stream_url',
    'result.url','result.embed_url','result.embedUrl','result.iframe','result.player_url','result.stream_url',
    'stream.url','stream.embed_url','stream.iframe','stream.player_url',
    'data.stream.url','data.stream.embed_url','data.stream.iframe','data.stream.player_url'
  ];

  for(const field of fields){
    const value=valueAtPath(data,field);
    if(typeof value==='string'&&value.trim())return value.trim();
  }
  return '';
}
function resolvedPlaybackKind(url){
  try{
    const u=new URL(url);
    const path=u.pathname.toLowerCase();
    if(path.endsWith('.m3u8'))return 'hls';
    if(/\.(mp4|webm|mov|m4v)$/i.test(path))return 'video';
  }catch{}
  return 'iframe';
}
async function resolveDynamicSource(env,providerId,sourceValue,idValue){
  const cfg=liveProviderConfig(env,providerId);
  const source=safeResolverToken(sourceValue,80);
  const sourceId=safeResolverToken(idValue,300);

  if(!source||!sourceId){
    const err=new Error('Invalid stream source reference.');
    err.status=400;
    throw err;
  }
  if(!cfg.resolverPath){
    const err=new Error(`${cfg.name} has source references, but LIVE_PROVIDER_${cfg.id}_RESOLVE_PATH is not configured.`);
    err.status=503;
    throw err;
  }

  let resolverBase=null;
  try{
    resolverBase=normaliseBaseUrl(
      cfg.resolverBaseUrl||
      cfg.dynamicBaseUrl||
      cfg.baseUrl
    );
  }catch{
    const err=new Error(`LIVE_PROVIDER_${cfg.id}_RESOLVE_BASE_URL is not a valid HTTPS URL.`);
    err.status=500;
    throw err;
  }
  if(!resolverBase){
    const err=new Error(`${cfg.name} resolver has no base URL.`);
    err.status=500;
    throw err;
  }

  let path=String(cfg.resolverPath||'').trim()
    .replace(/\{source\}/g,encodeURIComponent(source))
    .replace(/\{id\}/g,encodeURIComponent(sourceId));
  const endpoint=new URL(path,resolverBase);

  if(!String(cfg.resolverPath).includes('{source}')){
    endpoint.searchParams.set(cfg.resolverSourceParam||'source',source);
  }
  if(!String(cfg.resolverPath).includes('{id}')){
    endpoint.searchParams.set(cfg.resolverIdParam||'id',sourceId);
  }
  if(cfg.resolverCacheBustParam){
    endpoint.searchParams.set(cfg.resolverCacheBustParam,String(Date.now()));
  }

  if(!allowedResolverUrl(endpoint.toString(),resolverBase,cfg)){
    const err=new Error(
      `${cfg.name}: resolver host "${endpoint.hostname}" is not allowed. `+
      `Add it to LIVE_PROVIDER_${cfg.id}_ALLOWED_RESOLVE_HOSTS.`
    );
    err.status=500;
    throw err;
  }

  const headers={accept:'application/json,text/plain;q=0.9,*/*;q=0.2'};
  if(cfg.apiKey)headers.authorization=`Bearer ${cfg.apiKey}`;

  const r=await fetch(endpoint.toString(),{headers,redirect:'follow'});
  const contentType=String(r.headers.get('content-type')||'').toLowerCase();
  const text=await r.text();

  if(!r.ok){
    const err=new Error(`${cfg.name} source resolver HTTP ${r.status}`);
    err.status=r.status>=400&&r.status<500?r.status:502;
    throw err;
  }

  let resolved='';
  if(contentType.includes('json')||/^\s*[\[{]/.test(text)){
    let data={};
    try{data=JSON.parse(text)}catch{
      const err=new Error(`${cfg.name} source resolver returned invalid JSON.`);
      err.status=502;
      throw err;
    }
    resolved=resolverUrlCandidate(data,cfg);
  }else{
    const plain=String(text||'').trim();
    if(/^https:\/\//i.test(plain))resolved=plain;
  }

  if(!resolved||!/^https:\/\//i.test(resolved)){
    const err=new Error(
      `${cfg.name} source resolver did not return an HTTPS player URL. `+
      `If its JSON stores the URL in a different field, set LIVE_PROVIDER_${cfg.id}_RESOLVE_URL_FIELD.`
    );
    err.status=502;
    throw err;
  }

  const providerBase=normaliseBaseUrl(cfg.baseUrl);
  if(!allowedEmbedUrl(resolved,providerBase,cfg)){
    let host='';
    try{host=new URL(resolved).hostname}catch{}
    const err=new Error(
      `${cfg.name} resolved "${host||'a player host'}", but it is not in LIVE_PROVIDER_${cfg.id}_ALLOWED_EMBED_HOSTS.`
    );
    err.status=403;
    throw err;
  }

  return {
    url:resolved,
    kind:resolvedPlaybackKind(resolved),
    label:source
  };
}
function normaliseDynamicStream(item,index,requestedCategory){
  const embed=firstUseful(item,[
    'embed_url','embedUrl','player_url','playerUrl','iframe','iframe_url','url','stream_url','streamUrl'
  ]);
  const title=firstUseful(item,[
    'name','title','event','match','label','display_name'
  ])||`Live ${requestedCategory} ${index+1}`;
  const league=firstUseful(item,[
    'league','competition','tournament','event_group','category_name'
  ]);
  const thumbnail=firstUseful(item,[
    'thumbnail_url','thumbnail','image','poster','cover'
  ]);
  const timestampValue=firstUseful(item,[
    'match_timestamp','timestamp','start_timestamp','starts_at','startTime','start_time'
  ]);
  const numericTimestamp=Number(timestampValue);
  const parsedDate=Date.parse(String(timestampValue||item?.time||''));
  const parsedTimestamp=numericTimestamp||(Number.isFinite(parsedDate)?Math.floor(parsedDate/1000):NaN);
  const id=firstUseful(item,['id','stream_key','key','slug','url'])||`${requestedCategory}-${index+1}`;
  const tag=String(firstUseful(item,['tag','status','state'])||'').trim();

  return {
    id:String(id).slice(0,200),
    name:String(title).slice(0,180),
    category:String(requestedCategory).slice(0,80),
    league:String(league||item.__providerLeague||item.__groupCategory||'').slice(0,120),
    match_timestamp:Number.isFinite(parsedTimestamp)?parsedTimestamp:null,
    embed_url:typeof embed==='string'?embed:'',
    sources:dynamicSourceList(item),
    source_refs:dynamicSourceRefs(item),
    thumbnail_url:typeof thumbnail==='string'?thumbnail:'',
    tag:String(tag).slice(0,40),
    team1:item?.team1&&typeof item.team1==='object'?item.team1:null,
    team2:item?.team2&&typeof item.team2==='object'?item.team2:null
  };
}
async function fetchDynamicProvider(cfg,base,category){
  const rawPath=String(cfg.dynamicPath||'').trim();
  if(!rawPath){
    const err=new Error(`${cfg.name} is in dynamic mode but LIVE_PROVIDER_${cfg.id}_DYNAMIC_PATH is empty.`);
    err.status=500;
    throw err;
  }

  // A same-page web app may load its JSON from a completely different host
  // (for example a Worker/API subdomain). Allow that host to be configured
  // separately from the visible website.
  let dataBase=base;
  if(cfg.dynamicBaseUrl){
    try{
      dataBase=normaliseBaseUrl(cfg.dynamicBaseUrl);
    }catch{
      const err=new Error(`LIVE_PROVIDER_${cfg.id}_DYNAMIC_BASE_URL is not a valid HTTPS URL.`);
      err.status=500;
      throw err;
    }
  }

  const providerCategory=liveProviderCategory(cfg,category);
  const resolvedPath=rawPath.replace(/\{category\}/g,encodeURIComponent(providerCategory));
  const endpoint=new URL(resolvedPath,dataBase);

  if(cfg.dynamicCategoryParam&&!endpoint.searchParams.has(cfg.dynamicCategoryParam)){
    endpoint.searchParams.set(cfg.dynamicCategoryParam,providerCategory);
  }

  // Some dynamic sites append a changing timestamp such as ?t=1723456789012
  // to bypass CDN/browser caches. If configured, generate it automatically.
  if(cfg.dynamicCacheBustParam){
    endpoint.searchParams.set(cfg.dynamicCacheBustParam,String(Date.now()));
  }

  if(!allowedDynamicDataUrl(endpoint.toString(),dataBase,cfg)){
    const err=new Error(
      `${cfg.name}: dynamic data endpoint host "${endpoint.hostname}" is not allowed. `+
      `Add that hostname to LIVE_PROVIDER_${cfg.id}_ALLOWED_DATA_HOSTS.`
    );
    err.status=500;
    throw err;
  }

  const headers={accept:'application/json,text/json;q=0.9,*/*;q=0.2'};
  if(cfg.apiKey)headers.authorization=`Bearer ${cfg.apiKey}`;

  const r=await fetch(endpoint.toString(),{headers,redirect:'follow'});
  const contentType=String(r.headers.get('content-type')||'').toLowerCase();
  const text=await r.text();

  if(!r.ok){
    const err=new Error(`${cfg.name} dynamic endpoint HTTP ${r.status}`);
    err.status=r.status>=400&&r.status<500?r.status:502;
    throw err;
  }

  let data;
  try{
    data=JSON.parse(text);
  }catch{
    const err=new Error(
      `${cfg.name} dynamic endpoint returned ${contentType||'a non-JSON response'} from ${endpoint.hostname}. `+
      `Check LIVE_PROVIDER_${cfg.id}_DYNAMIC_BASE_URL and LIVE_PROVIDER_${cfg.id}_DYNAMIC_PATH.`
    );
    err.status=502;
    throw err;
  }

  const rootItems=annotateDynamicItems(data,dynamicRootItems(data,cfg));
  const matching=dynamicExpandItems(rootItems,cfg,category);

  return {
    count:matching.length,
    streams:matching.map((item,index)=>normaliseDynamicStream(item,index,category)),
    dynamicEndpointHost:endpoint.hostname,
    dynamicContentType:contentType,
    dynamicRootCount:rootItems.length
  };
}
async function fetchAuthorisedApiProvider(cfg,base,category){
  const endpoint=new URL(String(cfg.apiPath||'/api/v1/streams'),base);
  if(!endpoint.searchParams.has('category'))endpoint.searchParams.set('category',liveProviderCategory(cfg,category));

  const headers={accept:'application/json'};
  if(cfg.apiKey)headers.authorization=`Bearer ${cfg.apiKey}`;

  const r=await fetch(endpoint.toString(),{headers});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(data?.message||data?.error||`${cfg.name} HTTP ${r.status}`);
    err.status=r.status>=400&&r.status<500?r.status:502;
    throw err;
  }
  return data;
}

async function liveContentStreams(env,category='soccer',requestUrl='https://local/api/live-content',force=false,providerId='1'){
  const cfg=liveProviderConfig(env,providerId);
  const base=normaliseBaseUrl(cfg.baseUrl);
  if(!base){
    const err=new Error(`${cfg.name} is not configured.`);
    err.status=503;
    throw err;
  }

  const safeCategory=String(category||'soccer').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'soccer';

  let cache=null,key=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache&&!force){
      const u=new URL(requestUrl);
      u.pathname='/__cache/live-content';
      u.search=new URLSearchParams({category:safeCategory,mode:cfg.mode,provider:cfg.id}).toString();
      key=new Request(u.toString());
      const hit=await cache.match(key);
      if(hit)return hit.json();
    }
  }catch{
    cache=null;key=null;
  }

  const data=cfg.mode==='scrape'
    ?await scrapeAuthorisedProvider(cfg,base,safeCategory)
    :cfg.mode==='dynamic'
      ?await fetchDynamicProvider(cfg,base,safeCategory)
      :await fetchAuthorisedApiProvider(cfg,base,safeCategory);

  const providerStreams=Array.isArray(data.streams)?data.streams:[];
  const rejectedHostsSet=new Set();

  const streams=providerStreams.map(s=>{
    const allHosts=providerSourceHosts(s);
    const sources=allowedStreamSources(s,base,cfg);
    const sourceRefs=(Array.isArray(s.source_refs)?s.source_refs:[]).map((ref,index)=>({
      source:safeResolverToken(ref?.source,80),
      id:safeResolverToken(ref?.id,300),
      label:String(ref?.label||ref?.source||`Source ${index+1}`).slice(0,60)
    })).filter(ref=>ref.source&&ref.id);

    if(!sources.length&&!sourceRefs.length)allHosts.forEach(host=>rejectedHostsSet.add(host));

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
        label:String(entry.label||`Direct ${index+1}`).slice(0,60)
      })),
      source_refs:sourceRefs,
      resolver_enabled:!!cfg.resolverPath,
      source_count:sources.length+sourceRefs.length,
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
  }).filter(s=>s.embed_url||s.source_refs.length);

  const configuredAllowedHosts=csvHosts(cfg.embedHosts);
  const rejectedHosts=[...rejectedHostsSet].sort();

  const payload={
    providerId:cfg.id,
    providerName:cfg.name,
    mode:cfg.mode,
    count:streams.length,
    providerCount:providerStreams.length,
    rejectedCount:Math.max(0,providerStreams.length-streams.length),
    configuredAllowedHosts,
    rejectedHosts,
    diagnostic:
      providerStreams.length>0&&streams.length===0
        ?`${cfg.name} returned streams, but none had an allowed direct player URL or a usable resolver source reference.`
        :streams.some(s=>s.source_refs?.length)
          ?`${cfg.name} returned source references. They will be resolved only when you open or switch a source.`
          :rejectedHosts.length
            ?`Some ${cfg.name} streams were rejected because their player hosts were not on its allowlist.`
            :`All usable ${cfg.name} stream hosts passed the allowlist check.`,
    streams,
    category:safeCategory,
    updatedAt:new Date().toISOString()
  };

  if(cache){
    try{
      if(!key){
        const u=new URL(requestUrl);
        u.pathname='/__cache/live-content';
        u.search=new URLSearchParams({category:safeCategory,mode:cfg.mode,provider:cfg.id}).toString();
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
function buildFlixerEmbedUrl(env,{type,id,season,episode}){
  const raw=String(env.MEDIA_FLIXER_BASE_URL||'https://flixer.gd').trim().replace(/\/$/,'');
  const base=new URL(raw);
  if(base.protocol!=='https:'){const e=new Error('MEDIA_FLIXER_BASE_URL must use HTTPS.');e.status=500;throw e}
  const configured=String(env.MEDIA_FLIXER_ALLOWED_HOSTS||'')
    .split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const hosts=configured.length?configured:[base.hostname.toLowerCase()];
  if(!hosts.includes(base.hostname.toLowerCase())){const e=new Error('Flixer host is not in MEDIA_FLIXER_ALLOWED_HOSTS.');e.status=500;throw e}
  const u=new URL(base.toString());
  const root=base.pathname.replace(/\/$/,'');
  u.pathname=type==='tv'
    ?`${root}/watch/tv/${id}/${Number(season)}/${Number(episode)}`
    :`${root}/watch/movie/${id}`;
  u.search='';
  u.searchParams.set('embed','1');
  return u.toString();
}
function buildMediaEmbedUrl(env,{type,id,season,episode,mode='standard'}){
  if(!['movie','tv'].includes(type)){const e=new Error('type must be movie or tv.');e.status=400;throw e}
  if(!/^\d+$/.test(String(id||''))){const e=new Error('A numeric TMDB id is required.');e.status=400;throw e}
  if(!['standard','torrent','agg','flixer'].includes(mode)){const e=new Error('Unsupported provider mode.');e.status=400;throw e}
  if(type==='tv'){
    if(!Number.isInteger(Number(season))||Number(season)<1){const e=new Error('A valid season is required for TV.');e.status=400;throw e}
    if(!Number.isInteger(Number(episode))||Number(episode)<1){const e=new Error('A valid episode is required for TV.');e.status=400;throw e}
  }
  if(mode==='flixer')return buildFlixerEmbedUrl(env,{type,id,season,episode});
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

async function youtubeComments(env,videoId,pageToken='',requestUrl='https://local/api/youtube/comments',force=false){
  if(!env.YOUTUBE_API_KEY){
    const err=new Error('YOUTUBE_API_KEY is missing. Add it in Cloudflare before loading YouTube comments.');
    err.status=503;throw err;
  }
  const id=String(videoId||'').trim();
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)){
    const err=new Error('A valid YouTube video ID is required.');err.status=400;throw err;
  }
  const token=String(pageToken||'').trim().slice(0,500);
  let cache=null,cacheKey=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const cacheUrl=new URL(requestUrl);
      cacheUrl.pathname='/__cache/youtube-comments';
      cacheUrl.search=new URLSearchParams({videoId:id,pageToken:token}).toString();
      cacheKey=new Request(cacheUrl.toString(),{method:'GET'});
      if(!force){const hit=await cache.match(cacheKey);if(hit)return hit.json()}
    }
  }catch{cache=null;cacheKey=null}

  const u=new URL('https://www.googleapis.com/youtube/v3/commentThreads');
  u.searchParams.set('part','snippet');
  u.searchParams.set('videoId',id);
  u.searchParams.set('maxResults','20');
  u.searchParams.set('order','relevance');
  u.searchParams.set('textFormat','plainText');
  if(token)u.searchParams.set('pageToken',token);
  u.searchParams.set('key',env.YOUTUBE_API_KEY);

  const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const reason=data?.error?.errors?.[0]?.reason||'';
    if(reason==='commentsDisabled')return {videoId:id,items:[],disabled:true,message:'Comments are turned off for this video.'};
    const err=new Error(data?.error?.message||`YouTube comments HTTP ${r.status}`);
    err.status=r.status>=400&&r.status<500?r.status:502;throw err;
  }

  const items=(Array.isArray(data.items)?data.items:[]).map(thread=>{
    const snippet=thread?.snippet?.topLevelComment?.snippet||{};
    return {
      id:String(thread?.id||''),
      author:String(snippet.authorDisplayName||'YouTube user').slice(0,120),
      authorImage:String(snippet.authorProfileImageUrl||''),
      text:String(snippet.textOriginal||snippet.textDisplay||'').slice(0,5000),
      likeCount:Math.max(0,Number(snippet.likeCount)||0),
      publishedAt:String(snippet.publishedAt||''),
      replyCount:Math.max(0,Number(thread?.snippet?.totalReplyCount)||0)
    };
  }).filter(item=>item.id&&item.text);
  const payload={videoId:id,items,nextPageToken:String(data.nextPageToken||''),disabled:false};
  if(cache&&cacheKey){
    try{await cache.put(cacheKey,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public,max-age=300'}}))}catch{}
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

// football-data.org remains the primary provider where the user's key has access.
// Competitions commonly restricted on its free tier go straight to API-Football
// when API_FOOTBALL_KEY is configured, avoiding a pointless HTTP 403 first.
const FOOTBALL_DATA_PRIMARY_CODES=new Set(['PL','PD','BL1','SA','FL1','DED','PPL','ELC','CL']);
const API_FOOTBALL_COMPETITIONS={
  PL:{id:39,name:'Premier League',country:'England'},
  PD:{id:140,name:'La Liga',country:'Spain'},
  BL1:{id:78,name:'Bundesliga',country:'Germany'},
  SA:{id:135,name:'Serie A',country:'Italy'},
  FL1:{id:61,name:'Ligue 1',country:'France'},
  DED:{id:88,name:'Eredivisie',country:'Netherlands'},
  PPL:{id:94,name:'Primeira Liga',country:'Portugal'},
  ELC:{id:40,name:'Championship',country:'England'},
  EL1:{id:41,name:'League One',country:'England'},
  EL2:{id:42,name:'League Two',country:'England'},
  ENL:{id:43,name:'National League',country:'England'},
  CL:{id:2,name:'UEFA Champions League',country:'Europe'},
  EL:{id:3,name:'UEFA Europa League',country:'Europe'},
  UCL:{id:848,name:'UEFA Conference League',country:'Europe'},
  FAC:{id:45,name:'FA Cup',country:'England'},
  FLC:{id:48,name:'League Cup',country:'England'}
};

function isoDayOffset(n){
  const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);
}
async function footballFetch(path,env,extraHeaders={}){
  if(!env.FOOTBALL_DATA_API_KEY){
    const err=new Error('Football is not configured. Add FOOTBALL_DATA_API_KEY as a Cloudflare Worker secret.');
    err.status=503;throw err;
  }
  const r=await fetch(`https://api.football-data.org/v4${path}`,{
    headers:{'X-Auth-Token':env.FOOTBALL_DATA_API_KEY,accept:'application/json',...extraHeaders}
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const retryAfter=Number(r.headers.get('retry-after')||0);
    const baseMessage=data?.message||data?.error||`football-data.org HTTP ${r.status}`;
    let message=baseMessage;
    if(r.status===403)message=`${baseMessage} This competition may require a higher football-data.org access tier for your API key.`;
    if(r.status===429)message=`Football data rate limit reached.${retryAfter?` Try again in about ${retryAfter} seconds.`:' Please wait about a minute before forcing another refresh.'}`;
    const err=new Error(message);
    err.status=r.status===429?429:(r.status>=400&&r.status<500?r.status:502);
    err.retryAfter=retryAfter;
    throw err;
  }
  return data;
}

async function getFootballSchedule(env,force=false,requestUrl='https://local/api/football/schedule'){
  let cache=null,cacheKey=null,cachedPayload=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const u=new URL(requestUrl);u.pathname='/__cache/football-schedule-v1';u.search='';
      cacheKey=new Request(u.toString(),{method:'GET'});
      const hit=await cache.match(cacheKey);if(hit){try{cachedPayload=await hit.json()}catch{}}
    }
  }catch{cache=null;cacheKey=null}
  if(cachedPayload&&!force)return {...cachedPayload,cache:'hit'};
  if(cachedPayload&&force&&Date.now()-Date.parse(cachedPayload.updatedAt||0)<60*1000){
    return {...cachedPayload,cache:'refresh-cooldown'};
  }

  try{
    const dateFrom=isoDayOffset(-1),dateTo=isoDayOffset(14);
    let matches=[],provider='football-data.org';
    if(env.FOOTBALL_DATA_API_KEY){
      const data=await footballFetch(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=500`,env);
      matches=Array.isArray(data.matches)?data.matches:[];
    }else{
      const data=await apiFootballFetch('fixtures',{from:dateFrom,to:dateTo,timezone:'UTC'},env);
      matches=(Array.isArray(data?.response)?data.response:[]).map(cleanApiFootballFixture);
      provider='API-Football';
    }
    matches.sort((a,b)=>Date.parse(a.utcDate||0)-Date.parse(b.utcDate||0));
    const competitions=[...new Map(matches.map(match=>{
      const comp=match?.competition||{};
      return [String(comp.id||comp.code||comp.name||''),{id:comp.id||0,code:comp.code||'',name:comp.name||'Competition',emblem:comp.emblem||''}];
    }).filter(([key])=>key)).values()];
    const payload={matches,competitions,provider,dateFrom,dateTo,updatedAt:new Date().toISOString()};
    if(cache&&cacheKey){
      try{await cache.put(cacheKey,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public,max-age=600'}}))}catch{}
    }
    return {...payload,cache:'fresh'};
  }catch(e){
    if(cachedPayload)return {...cachedPayload,cache:'stale',warning:e?.message||'Showing the last saved football schedule.'};
    throw e;
  }
}

function cleanFootballDataLineupTeam(team){
  const players=list=>(Array.isArray(list)?list:[]).map(player=>({
    id:Number(player?.id)||0,
    name:String(player?.name||'Player').slice(0,120),
    number:player?.shirtNumber==null?null:Number(player.shirtNumber),
    position:String(player?.position||'').slice(0,80)
  }));
  return {
    id:Number(team?.id)||0,name:String(team?.shortName||team?.name||'Team'),crest:String(team?.crest||''),
    formation:String(team?.formation||''),coach:String(team?.coach?.name||''),
    starting:players(team?.lineup),bench:players(team?.bench)
  };
}
function cleanApiFootballLineupTeam(entry){
  const players=list=>(Array.isArray(list)?list:[]).map(row=>{
    const player=row?.player||row||{};
    return {id:Number(player.id)||0,name:String(player.name||'Player').slice(0,120),number:player.number==null?null:Number(player.number),position:String(player.pos||player.position||'').slice(0,80)};
  });
  return {
    id:-(Math.abs(Number(entry?.team?.id)||0)),name:String(entry?.team?.name||'Team'),crest:String(entry?.team?.logo||''),
    formation:String(entry?.formation||''),coach:String(entry?.coach?.name||''),
    starting:players(entry?.startXI),bench:players(entry?.substitutes)
  };
}
async function getFootballLineups(env,matchId,force=false,requestUrl='https://local/api/football/lineups'){
  const id=Number(matchId)||0;
  if(!id){const err=new Error('A valid football match ID is required.');err.status=400;throw err}
  let cache=null,cacheKey=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const u=new URL(requestUrl);u.pathname='/__cache/football-lineups-v1';u.search=new URLSearchParams({matchId:String(id)}).toString();
      cacheKey=new Request(u.toString(),{method:'GET'});
      if(!force){const hit=await cache.match(cacheKey);if(hit)return hit.json()}
    }
  }catch{cache=null;cacheKey=null}

  let teams=[],provider='football-data.org';
  if(id>0){
    const match=await footballFetch(`/matches/${encodeURIComponent(id)}`,env,{'X-Unfold-Lineups':'true'});
    teams=[cleanFootballDataLineupTeam(match.homeTeam),cleanFootballDataLineupTeam(match.awayTeam)];
  }else{
    const data=await apiFootballFetch('fixtures/lineups',{fixture:Math.abs(id)},env);
    teams=(Array.isArray(data?.response)?data.response:[]).map(cleanApiFootballLineupTeam);
    provider='API-Football';
  }
  const available=teams.some(team=>team.starting.length||team.bench.length);
  const payload={matchId:id,teams,available,provider,updatedAt:new Date().toISOString(),message:available?'':'Lineups have not been announced for this match yet.'};
  if(cache&&cacheKey){
    try{await cache.put(cacheKey,new Response(JSON.stringify(payload),{headers:{'content-type':'application/json','cache-control':'public,max-age=120'}}))}catch{}
  }
  return payload;
}

function apiSportsKey(env){
  // API-SPORTS uses one account API key across the sports APIs that are
  // active on the dashboard. Prefer the new shared variable, while keeping
  // API_FOOTBALL_KEY as a backwards-compatible alias.
  return String(env.API_SPORTS_KEY||env.API_FOOTBALL_KEY||'').trim();
}

function currentApiFootballSeason(){
  const d=new Date();
  // European seasons are represented by their starting year in API-Football.
  return d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1;
}
function apiFootballHasErrors(data){
  const errors=data?.errors;
  if(Array.isArray(errors))return errors.length>0;
  return !!(errors&&typeof errors==='object'&&Object.keys(errors).length);
}
function apiFootballErrorText(data){
  const errors=data?.errors;
  if(Array.isArray(errors))return errors.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' • ');
  if(errors&&typeof errors==='object')return Object.values(errors).map(x=>String(x)).join(' • ');
  return '';
}
async function apiFootballFetch(endpoint,params,env){
  const key=apiSportsKey(env);
  if(!key){
    const err=new Error('This competition is outside your football-data.org permissions. Add the shared API_SPORTS_KEY Cloudflare secret to enable the API-SPORTS fallback.');
    err.status=503;err.missingFallbackKey=true;throw err;
  }
  const u=new URL(`https://v3.football.api-sports.io/${String(endpoint||'').replace(/^\/+/, '')}`);
  Object.entries(params||{}).forEach(([k,v])=>{
    if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
  });
  const r=await fetch(u.toString(),{
    headers:{'x-apisports-key':key,accept:'application/json'}
  });
  const data=await r.json().catch(()=>({}));
  const apiError=apiFootballErrorText(data);
  if(!r.ok||apiFootballHasErrors(data)){
    let message=apiError||`API-Football HTTP ${r.status}`;
    if(r.status===403){
      message=`API-Football rejected the shared API-SPORTS key (403)${apiError?`: ${apiError}`:''}. Check that Cloudflare contains the current dashboard API key and that API-SPORTS whitelist restrictions are not blocking the Worker.`;
    }else if(r.status===429||/rate limit|request limit|quota/i.test(message)){
      message='API-Football request limit reached. Command Centre will keep using cached football data where available.';
    }
    const err=new Error(message);
    err.status=r.status===429?429:(r.status>=400&&r.status<500?r.status:502);
    throw err;
  }
  return data;
}
function apiFootballTeam(team){
  const id=Number(team?.id)||0;
  return {
    // Negative IDs namespace API-Football teams so favourites/notifications know
    // which upstream service to query without changing the existing D1 schema.
    id:id?-Math.abs(id):0,
    name:String(team?.name||'Team'),
    shortName:String(team?.name||'Team'),
    tla:'',
    crest:String(team?.logo||'')
  };
}
function apiFootballMatchStatus(fixture){
  const short=String(fixture?.status?.short||'NS').toUpperCase();
  if(['FT','AET','PEN'].includes(short))return 'FINISHED';
  if(['CANC','ABD','AWD','WO'].includes(short))return 'CANCELLED';
  if(['PST'].includes(short))return 'POSTPONED';
  if(['SUSP','INT','HT','BT'].includes(short))return 'PAUSED';
  if(['1H','2H','ET','P','LIVE'].includes(short))return 'IN_PLAY';
  return 'SCHEDULED';
}
function cleanApiFootballFixture(item){
  const fixture=item?.fixture||{};
  const fid=Number(fixture.id)||0;
  const full=item?.score?.fulltime||{};
  const goals=item?.goals||{};
  const homeScore=full.home??goals.home??null;
  const awayScore=full.away??goals.away??null;
  return {
    id:fid?-Math.abs(fid):String(`api-football-${fixture.date||Date.now()}`),
    utcDate:String(fixture.date||new Date().toISOString()),
    status:apiFootballMatchStatus(fixture),
    minute:Number(fixture?.status?.elapsed)||null,
    competition:{
      id:Number(item?.league?.id)||0,
      name:String(item?.league?.name||''),
      code:'',
      emblem:String(item?.league?.logo||'')
    },
    homeTeam:apiFootballTeam(item?.teams?.home),
    awayTeam:apiFootballTeam(item?.teams?.away),
    score:{fullTime:{
      home:homeScore===null||homeScore===undefined?null:Number(homeScore),
      away:awayScore===null||awayScore===undefined?null:Number(awayScore)
    }}
  };
}
function cleanApiFootballStandingRow(row){
  const all=row?.all||{};
  const goals=all?.goals||{};
  return {
    position:Number(row?.rank)||0,
    team:apiFootballTeam(row?.team),
    playedGames:Number(all?.played)||0,
    won:Number(all?.win)||0,
    draw:Number(all?.draw)||0,
    lost:Number(all?.lose)||0,
    points:Number(row?.points)||0,
    goalsFor:Number(goals?.for)||0,
    goalsAgainst:Number(goals?.against)||0,
    goalDifference:Number(row?.goalsDiff)||0
  };
}
function cleanApiFootballStandings(data){
  const response=Array.isArray(data?.response)?data.response:[];
  const groups=Array.isArray(response?.[0]?.league?.standings)?response[0].league.standings:[];
  return groups.map((rows,index)=>{
    const first=Array.isArray(rows)?rows[0]:null;
    const groupName=String(first?.group||'').trim();
    return {
      type:'TOTAL',
      group:groupName&&groups.length>1?groupName:(groups.length>1?`Group ${index+1}`:''),
      table:(Array.isArray(rows)?rows:[]).map(cleanApiFootballStandingRow)
    };
  }).filter(x=>x.table.length);
}
async function apiFootballBundle(env,code){
  const cfg=API_FOOTBALL_COMPETITIONS[code];
  if(!cfg){
    const err=new Error('No API-Football mapping exists for this competition.');
    err.status=503;throw err;
  }
  const season=currentApiFootballSeason();
  const dateFrom=isoDayOffset(-7),dateTo=isoDayOffset(14);

  const [fixturesData,standingsData]=await Promise.all([
    apiFootballFetch('fixtures',{league:cfg.id,season,from:dateFrom,to:dateTo,timezone:'UTC'},env),
    apiFootballFetch('standings',{league:cfg.id,season},env).catch(e=>{
      // Knockout cups may not expose a table. Fixtures should still render.
      console.warn(`API-Football standings unavailable for ${code}`,e?.message||e);
      return {response:[]};
    })
  ]);

  const matches=(Array.isArray(fixturesData?.response)?fixturesData.response:[]).map(cleanApiFootballFixture);
  const standings=cleanApiFootballStandings(standingsData);
  return {
    competition:{id:cfg.id,name:cfg.name,code},
    standings,
    matches,
    provider:'API-Football',
    providerMode:'fallback',
    season,
    warning:`Using API-Football for ${cfg.name} because this competition is not available through the current football-data.org key permissions.`,
    updatedAt:new Date().toISOString()
  };
}
async function getFootballBundle(env,competition='PL',force=false,requestUrl='https://local/api/football'){
  const code=String(competition||'PL').toUpperCase();
  if(!FOOTBALL_COMPETITIONS.has(code)){
    const err=new Error('Unsupported football competition.');
    err.status=400;throw err;
  }

  let cache=null,cacheKey=null,cachedPayload=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const u=new URL(requestUrl);
      u.pathname='/__cache/football-v3';
      u.search=new URLSearchParams({competition:code}).toString();
      cacheKey=new Request(u.toString(),{method:'GET'});
      const hit=await cache.match(cacheKey);
      if(hit){try{cachedPayload=await hit.json()}catch{}}
    }
  }catch(e){console.warn('Football cache read skipped',e);cache=null;cacheKey=null}

  if(cachedPayload&&!force)return {...cachedPayload,cache:'hit'};
  if(cachedPayload&&force){
    const age=Date.now()-Date.parse(cachedPayload.updatedAt||0);
    if(Number.isFinite(age)&&age<60*1000){
      return {...cachedPayload,cache:'refresh-cooldown',warning:cachedPayload.warning||'Using the recent result to protect football API request limits.'};
    }
  }

  const fetchPrimary=async()=>{
    const dateFrom=isoDayOffset(-7),dateTo=isoDayOffset(14);
    const [standingsData,matchesData]=await Promise.all([
      footballFetch(`/competitions/${encodeURIComponent(code)}/standings`,env).catch(e=>{
        if(code==='CL'&&e.status===404)return {competition:{name:'UEFA Champions League',code},standings:[]};
        throw e;
      }),
      footballFetch(`/competitions/${encodeURIComponent(code)}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,env)
    ]);
    return {
      competition:standingsData.competition||matchesData.competition||{code,name:code},
      standings:Array.isArray(standingsData.standings)?standingsData.standings:[],
      matches:Array.isArray(matchesData.matches)?matchesData.matches:[],
      provider:'football-data.org',
      providerMode:'primary',
      updatedAt:new Date().toISOString()
    };
  };

  try{
    let payload;

    // Avoid triggering a known 403 for competitions outside the normal primary-key
    // coverage. If a fallback key is present, go directly to API-Football.
    if(!FOOTBALL_DATA_PRIMARY_CODES.has(code)&&apiSportsKey(env)){
      payload=await apiFootballBundle(env,code);
    }else{
      try{
        payload=await fetchPrimary();
      }catch(primaryError){
        if(primaryError?.status===403&&apiSportsKey(env)){
          console.warn(`football-data.org denied ${code}; using API-Football fallback`);
          payload=await apiFootballBundle(env,code);
        }else if(primaryError?.status===403&&!apiSportsKey(env)&&API_FOOTBALL_COMPETITIONS[code]){
          const cfg=API_FOOTBALL_COMPETITIONS[code];
          const err=new Error(`${cfg.name} is outside the permissions of your football-data.org API key. Add the shared API_SPORTS_KEY as a Cloudflare Worker secret and Command Centre will load it automatically from API-Football.`);
          err.status=503;throw err;
        }else{
          throw primaryError;
        }
      }
    }

    if(cache){
      try{
        if(!cacheKey){
          const u=new URL(requestUrl);
          u.pathname='/__cache/football-v3';
          u.search=new URLSearchParams({competition:code}).toString();
          cacheKey=new Request(u.toString(),{method:'GET'});
        }
        await cache.put(cacheKey,new Response(JSON.stringify(payload),{
          headers:{'content-type':'application/json','cache-control':'public,max-age=900'}
        }));
      }catch(e){console.warn('Football cache write skipped',e)}
    }
    return {...payload,cache:'fresh'};
  }catch(e){
    if((e?.status===429||e?.status===403)&&cachedPayload){
      return {
        ...cachedPayload,
        cache:e.status===429?'stale-rate-limit':'stale-permission-fallback',
        warning:e.message||'Football provider unavailable; showing cached data.'
      };
    }
    throw e;
  }
}

const GENERAL_SPORTS=new Set(['tennis','basketball']);

function sportsDayKey(offset=0){
  const d=new Date();
  d.setUTCDate(d.getUTCDate()+offset);
  return d.toISOString().slice(0,10);
}
function sportsDbDayKey(offset=0){return sportsDayKey(offset)}
async function sportsDbFetchDay(env,sport,date){
  const key=String(env.SPORTSDB_API_KEY||'123').trim()||'123';
  const u=new URL(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/eventsday.php`);
  u.searchParams.set('d',date);
  u.searchParams.set('s',sport);
  const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const err=new Error(r.status===429
      ?'Sports fallback data rate limit reached. Please wait before refreshing again.'
      :`TheSportsDB HTTP ${r.status}`);
    err.status=r.status===429?429:(r.status>=400&&r.status<500?r.status:502);
    throw err;
  }
  return Array.isArray(data.events)?data.events:[];
}
function cleanGeneralSportEvent(e,kind){
  const timestamp=String(e.strTimestamp||'').trim();
  const date=String(e.dateEvent||'').trim();
  const time=String(e.strTime||'').trim();
  return {
    id:String(e.idEvent||`${kind}-${date}-${e.strEvent||''}`),
    sport:kind,
    name:String(e.strEvent||[e.strHomeTeam,e.strAwayTeam].filter(Boolean).join(' vs ')||'Event'),
    league:String(e.strLeague||e.strLeagueAlternate||''),
    home:String(e.strHomeTeam||''),
    away:String(e.strAwayTeam||''),
    homeId:String(e.idHomeTeam||''),
    awayId:String(e.idAwayTeam||''),
    homeScore:e.intHomeScore==null?null:Number(e.intHomeScore),
    awayScore:e.intAwayScore==null?null:Number(e.intAwayScore),
    displayScore:'',
    date,
    time,
    timestamp,
    status:String(e.strStatus||''),
    liveDetail:'',
    isLive:['Q1','Q2','Q3','Q4','OT','HT','BT','LIVE','IN PLAY'].includes(String(e.strStatus||'').toUpperCase()),
    round:String(e.intRound||''),
    venue:String(e.strVenue||''),
    thumbnail:String(e.strThumb||e.strPoster||'')
  };
}

// ---------- API-SPORTS Basketball ----------
function apiSportsErrorText(data){
  const errors=data?.errors;
  if(Array.isArray(errors))return errors.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' • ');
  if(errors&&typeof errors==='object')return Object.values(errors).map(x=>String(x)).filter(Boolean).join(' • ');
  return '';
}
function basketballApiKey(env){
  // Basketball uses the same API-SPORTS account key as API-Football.
  return apiSportsKey(env);
}
async function apiBasketballFetchDay(env,date){
  const key=basketballApiKey(env);
  if(!key){
    const err=new Error('Basketball live data is not configured. Add the single shared API_SPORTS_KEY Cloudflare secret using the API key shown at the top of your API-SPORTS dashboard.');
    err.status=503;err.setupRequired=true;throw err;
  }
  const u=new URL('https://v1.basketball.api-sports.io/games');
  u.searchParams.set('date',date);
  const r=await fetch(u.toString(),{
    headers:{'x-apisports-key':key,accept:'application/json'}
  });
  const data=await r.json().catch(()=>({}));
  const apiError=apiSportsErrorText(data);
  if(!r.ok||apiError){
    let message=apiError||`API-Basketball HTTP ${r.status}`;
    if(r.status===403){
      message=`API-Basketball rejected the shared API-SPORTS key (403)${apiError?`: ${apiError}`:''}. If Basketball shows Active in your dashboard, check that Cloudflare has the same current API key and that API-SPORTS IP/domain whitelist settings are not blocking the Worker.`;
    }else if(r.status===429||/rate limit|quota|request limit/i.test(message)){
      message='API-Basketball request limit reached. Cached basketball scores will be used where available.';
    }
    const err=new Error(message);
    err.status=r.status===429?429:(r.status>=400&&r.status<500?r.status:502);
    throw err;
  }
  return Array.isArray(data?.response)?data.response:[];
}
function cleanApiBasketballGame(g){
  const statusShort=String(g?.status?.short||'').toUpperCase();
  const statusLong=String(g?.status?.long||'').trim();
  const timer=String(g?.status?.timer||'').trim();
  const liveShort=new Set(['Q1','Q2','Q3','Q4','OT','BT','HT']);
  const isLive=liveShort.has(statusShort)||/live|quarter|half|overtime|break/i.test(statusLong);
  const finished=statusShort==='FT'||/finished|final/i.test(statusLong);
  const homeTotal=g?.scores?.home?.total;
  const awayTotal=g?.scores?.away?.total;
  const dateObj=String(g?.date||'').trim();
  let date='',time='',timestamp=dateObj;
  if(dateObj){
    const d=new Date(dateObj);
    if(Number.isFinite(d.getTime())){
      date=d.toISOString().slice(0,10);
      time=d.toISOString().slice(11,19);
      timestamp=d.toISOString();
    }
  }
  const leagueParts=[g?.league?.name,g?.country?.name||g?.country?.code].filter(Boolean);
  return {
    id:`basketball-${String(g?.id||`${dateObj}-${g?.teams?.home?.name||''}-${g?.teams?.away?.name||''}`)}`,
    sport:'basketball',
    name:[g?.teams?.home?.name,g?.teams?.away?.name].filter(Boolean).join(' vs ')||'Basketball game',
    league:leagueParts.join(' • '),
    home:String(g?.teams?.home?.name||'Home'),
    away:String(g?.teams?.away?.name||'Away'),
    homeId:String(g?.teams?.home?.id||''),
    awayId:String(g?.teams?.away?.id||''),
    homeScore:homeTotal===null||homeTotal===undefined?null:Number(homeTotal),
    awayScore:awayTotal===null||awayTotal===undefined?null:Number(awayTotal),
    displayScore:(homeTotal!==null&&homeTotal!==undefined&&awayTotal!==null&&awayTotal!==undefined)?`${homeTotal} – ${awayTotal}`:'',
    date,
    time,
    timestamp,
    status:statusShort||statusLong,
    liveDetail:isLive?[statusShort,statusLong,timer].filter(Boolean).join(' • '):'',
    isLive,
    finished,
    round:String(g?.week||g?.stage||''),
    venue:String(g?.venue||''),
    thumbnail:String(g?.league?.logo||'')
  };
}
async function apiBasketballBundle(env){
  // One request per day. Yesterday gives results; today gives live/current;
  // tomorrow gives upcoming fixtures. This keeps the free quota manageable.
  const dates=[sportsDayKey(-1),sportsDayKey(0),sportsDayKey(1)];
  const results=await Promise.all(dates.map(d=>apiBasketballFetchDay(env,d)));
  const seen=new Set();
  const events=results.flat().map(cleanApiBasketballGame).filter(e=>{
    if(!e.id||seen.has(e.id))return false;
    seen.add(e.id);return true;
  });
  return {
    sport:'basketball',
    provider:'API-Basketball',
    events,
    updatedAt:new Date().toISOString(),
    warning:'',
    windowLabel:'yesterday, today and tomorrow'
  };
}

// ---------- API-Tennis ----------
async function apiTennisFetch(env,method,params={}){
  const key=String(env.API_TENNIS_KEY||'').trim();
  if(!key){
    const err=new Error('Tennis live data is not configured. Add API_TENNIS_KEY as a Cloudflare Worker secret.');
    err.status=503;err.setupRequired=true;throw err;
  }
  const u=new URL('https://api.api-tennis.com/tennis/');
  u.searchParams.set('method',method);
  u.searchParams.set('APIkey',key);
  Object.entries(params).forEach(([k,v])=>{
    if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,String(v));
  });
  const r=await fetch(u.toString(),{headers:{accept:'application/json'}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||Number(data?.success)===0){
    const raw=data?.error||data?.message||data?.result;
    let message=typeof raw==='string'?raw:`API-Tennis HTTP ${r.status}`;
    if(r.status===429||/limit|quota|requests/i.test(message)){
      message='API-Tennis request limit reached. Cached tennis scores will be used where available.';
    }
    const err=new Error(message);
    err.status=r.status===429?429:(r.status>=400&&r.status<500?r.status:502);
    throw err;
  }
  return Array.isArray(data?.result)?data.result:[];
}
function tennisResultText(t){
  const final=String(t?.event_final_result||'').trim();
  const game=String(t?.event_game_result||'').trim();
  if(final&&final!=='-'&&final!=='null')return final.replace(/\s*-\s*/g,' – ');
  if(game&&game!=='-'&&game!=='null')return game.replace(/\s*-\s*/g,' – ');
  return '';
}
function tennisIsLive(t){
  const status=String(t?.event_status||'').trim().toLowerCase();
  if(!status)return false;
  if(/finish|ended|cancel|retired|walkover|postpon/.test(status))return false;
  return /set|game|live|progress|playing|break|serve|rain delay|suspended/.test(status);
}
function cleanApiTennisMatch(t){
  const date=String(t?.event_date||'').trim();
  const time=String(t?.event_time||'').trim();
  let timestamp='';
  if(date){
    const d=new Date(`${date}T${time||'00:00'}:00`);
    if(Number.isFinite(d.getTime()))timestamp=d.toISOString();
  }
  const home=String(t?.event_first_player||'Player 1');
  const away=String(t?.event_second_player||'Player 2');
  const status=String(t?.event_status||'').trim();
  const isLive=tennisIsLive(t);
  const score=tennisResultText(t);
  const type=String(t?.event_type_type||'').trim();
  const tournament=String(t?.tournament_name||t?.tournament_key||'').trim();
  const league=[tournament,type].filter(Boolean).join(' • ');
  return {
    id:`tennis-${String(t?.event_key||`${date}-${time}-${home}-${away}`)}`,
    sport:'tennis',
    name:`${home} vs ${away}`,
    league,
    home,
    away,
    homeId:String(t?.first_player_key||''),
    awayId:String(t?.second_player_key||''),
    homeScore:null,
    awayScore:null,
    displayScore:score,
    date,
    time,
    timestamp,
    status,
    liveDetail:isLive?[status,score].filter(Boolean).join(' • '):'',
    isLive,
    finished:/finish|ended/i.test(status)||(!isLive&&score&&score!=='-'),
    round:String(t?.tournament_round||''),
    venue:'',
    thumbnail:''
  };
}
async function apiTennisBundle(env){
  const dateStart=sportsDayKey(-1),dateStop=sportsDayKey(2);
  const [fixtures,live]=await Promise.all([
    apiTennisFetch(env,'get_fixtures',{
      date_start:dateStart,
      date_stop:dateStop,
      timezone:'Europe/London'
    }),
    apiTennisFetch(env,'get_livescore',{timezone:'Europe/London'}).catch(e=>{
      console.warn('API-Tennis livescore request failed',e?.message||e);
      return [];
    })
  ]);

  const map=new Map();
  fixtures.forEach(t=>{
    const e=cleanApiTennisMatch(t);
    map.set(e.id,e);
  });
  live.forEach(t=>{
    const e=cleanApiTennisMatch(t);
    map.set(e.id,{...(map.get(e.id)||{}),...e,isLive:true});
  });

  return {
    sport:'tennis',
    provider:'API-Tennis',
    events:[...map.values()],
    updatedAt:new Date().toISOString(),
    warning:'',
    windowLabel:'yesterday through the next two days'
  };
}

async function sportsDbFallbackBundle(env,sportKey){
  const providerSport=sportKey==='basketball'?'Basketball':'Tennis';
  const dates=[sportsDayKey(-1),sportsDayKey(0),sportsDayKey(1)];
  let all=[],warnings=[];
  for(const date of dates){
    try{all.push(...await sportsDbFetchDay(env,providerSport,date))}
    catch(e){warnings.push(e.message||String(e));if(e?.status===429)break}
  }
  const seen=new Set();
  const events=all.map(e=>cleanGeneralSportEvent(e,sportKey)).filter(e=>{
    if(!e.id||seen.has(e.id))return false;
    seen.add(e.id);return true;
  });
  return {
    sport:sportKey,
    provider:'TheSportsDB fallback',
    events,
    updatedAt:new Date().toISOString(),
    warning:warnings[0]||`Using fallback ${sportKey} data. Add the dedicated live-data key for fuller coverage.`,
    windowLabel:'yesterday, today and tomorrow',
    setupRequired:true
  };
}

async function getGeneralSportBundle(env,kind='tennis',force=false,requestUrl='https://local/api/sports'){
  const sportKey=String(kind||'tennis').toLowerCase();
  if(!GENERAL_SPORTS.has(sportKey)){
    const err=new Error('Unsupported sport.');
    err.status=400;throw err;
  }

  let cache=null,cacheKey=null,cachedPayload=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const u=new URL(requestUrl);
      u.pathname='/__cache/general-sports-v2';
      u.search=new URLSearchParams({sport:sportKey}).toString();
      cacheKey=new Request(u.toString());
      const hit=await cache.match(cacheKey);
      if(hit){try{cachedPayload=await hit.json()}catch{}}
    }
  }catch{}

  // Ten minutes keeps these feeds useful while protecting free/trial quotas.
  if(cachedPayload&&!force){
    const age=Date.now()-Date.parse(cachedPayload.updatedAt||0);
    if(Number.isFinite(age)&&age<10*60*1000)return {...cachedPayload,cache:'hit'};
  }
  if(cachedPayload&&force){
    const age=Date.now()-Date.parse(cachedPayload.updatedAt||0);
    if(Number.isFinite(age)&&age<60*1000){
      return {...cachedPayload,cache:'refresh-cooldown',warning:cachedPayload.warning||'Using the recent result to protect the live sports API request limit.'};
    }
  }

  try{
    let payload;
    if(sportKey==='basketball'){
      try{
        payload=await apiBasketballBundle(env);
      }catch(e){
        if(e?.setupRequired){
          payload=await sportsDbFallbackBundle(env,sportKey);
          payload.warning=`${e.message} ${payload.events.length?'Limited fallback events are shown below.':''}`.trim();
        }else throw e;
      }
    }else{
      try{
        payload=await apiTennisBundle(env);
      }catch(e){
        if(e?.setupRequired){
          payload=await sportsDbFallbackBundle(env,sportKey);
          payload.warning=`${e.message} ${payload.events.length?'Limited fallback events are shown below.':''}`.trim();
        }else throw e;
      }
    }

    if(cache&&cacheKey){
      try{
        await cache.put(cacheKey,new Response(JSON.stringify(payload),{
          headers:{'content-type':'application/json','cache-control':'public,max-age=600'}
        }));
      }catch{}
    }
    return {...payload,cache:'fresh'};
  }catch(e){
    if(cachedPayload){
      return {...cachedPayload,cache:'stale',warning:e?.message||'Live sports provider unavailable; showing cached data.'};
    }
    throw e;
  }
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
    services.push({name:'Football Data API',state:'Not configured',kind:'warn',detail:'Add FOOTBALL_DATA_API_KEY to use football-data.org as the primary Football Hub provider.'});
  }else if(live){
    const fb=await footballStatus(env);
    services.push({name:'Football Data API',state:fb.ok?'Healthy':'Error',kind:fb.ok?'ok':'bad',detail:fb.ok?(fb.detail||'football-data.org responded.'):(fb.error||'Football API check failed.')});
  }else{
    services.push({name:'Football Data API',state:'Configured',kind:'info',detail:'FOOTBALL_DATA_API_KEY is present.'});
  }

  const sharedApiSportsKey=apiSportsKey(env);
  services.push({
    name:'API-SPORTS shared key',
    state:sharedApiSportsKey?'Configured':'Not configured',
    kind:sharedApiSportsKey?'ok':'warn',
    detail:sharedApiSportsKey
      ?(env.API_SPORTS_KEY
        ?'API_SPORTS_KEY is present and is shared by API-Football and API-Basketball.'
        :'Using the existing API_FOOTBALL_KEY as the shared API-SPORTS key. You can rename it to API_SPORTS_KEY later.')
      :'Add one API_SPORTS_KEY secret using the single API key shown in your API-SPORTS dashboard.'
  });

  const anyFootballApi=!!(env.FOOTBALL_DATA_API_KEY||sharedApiSportsKey);
  services.push({
    name:'Football notification engine',
    state:(anyFootballApi&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)?'Ready':'Needs setup',
    kind:(anyFootballApi&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)?'ok':'warn',
    detail:(anyFootballApi&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)
      ?'Favourite-team fixture alerts and full-time pushes can run in the background across primary and fallback competitions.'
      :'At least one football API key plus the VAPID keys are required for background football alerts.'
  });

  const liveProviders=configuredLiveProviders(env);
  services.push({
    name:'Live Sport providers',
    state:liveProviders.length?`${liveProviders.length} configured`:'Not configured',
    kind:liveProviders.length?'info':'warn',
    detail:liveProviders.length
      ?liveProviders.map(p=>`${p.name} (${p.mode})`).join(' • ')
      :'Configure LIVE_PROVIDER_1_BASE_URL and/or LIVE_PROVIDER_2_BASE_URL.'
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
    name:'Basketball live data',
    state:sharedApiSportsKey?'Configured':'Needs setup',
    kind:sharedApiSportsKey?'ok':'warn',
    detail:sharedApiSportsKey
      ?'Using the same shared API-SPORTS key as Football. Basketball must show Active in the API-SPORTS dashboard.'
      :'Add API_SPORTS_KEY once; do not create a separate Basketball key.'
  });
  services.push({
    name:'Tennis live data',
    state:env.API_TENNIS_KEY?'Configured':'Needs setup',
    kind:env.API_TENNIS_KEY?'ok':'warn',
    detail:env.API_TENNIS_KEY
      ?'API_TENNIS_KEY is present. Live scores and fixtures can be loaded.'
      :'Add API_TENNIS_KEY to enable comprehensive live tennis scores and fixtures.'
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
  const numericId=Number(teamId)||0;
  if(!numericId)return [];
  const dateFrom=isoDayOffset(-daysBack),dateTo=isoDayOffset(daysForward);
  if(numericId<0){
    const data=await apiFootballFetch('fixtures',{
      team:Math.abs(numericId),from:dateFrom,to:dateTo,timezone:'UTC'
    },env);
    return (Array.isArray(data?.response)?data.response:[]).map(cleanApiFootballFixture);
  }
  const data=await footballFetch(`/teams/${encodeURIComponent(numericId)}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,env);
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


function normalizeAudiusTrack(track){
  const art=track?.artwork||{};
  const user=track?.user||{};
  return {
    id:String(track?.id||''),
    source:'audius',
    title:String(track?.title||'Untitled'),
    artist:String(user?.name||user?.handle||track?.artist||'Unknown artist'),
    artwork:String(art?._480x480||art?.['480x480']||art?._1000x1000||art?.['1000x1000']||art?._150x150||art?.['150x150']||''),
    duration:Number(track?.duration)||0,
    genre:String(track?.genre||''),
    permalink:String(track?.permalink||''),
    playCount:Number(track?.playCount??track?.play_count)||0,
    streamable:track?.isStreamable!==false&&track?.is_streamable!==false,
    streamUrl:track?.id?`/api/music/audius/stream?id=${encodeURIComponent(String(track.id))}`:''
  };
}


let musicBrainzLastRequestAt=0;
let musicBrainzGate=Promise.resolve();

async function musicBrainzThrottle(){
  const previous=musicBrainzGate;
  let release;
  musicBrainzGate=new Promise(resolve=>{release=resolve});
  await previous;
  const wait=Math.max(0,1100-(Date.now()-musicBrainzLastRequestAt));
  if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  musicBrainzLastRequestAt=Date.now();
  release();
}

function musicBrainzArtistName(recording){
  const credit=Array.isArray(recording?.['artist-credit'])?recording['artist-credit']:[];
  const joined=credit.map(x=>String(x?.name||x?.artist?.name||'').trim()).filter(Boolean).join(' & ');
  return joined||'Unknown artist';
}

function normalizeMusicBrainzRecording(recording){
  const releases=Array.isArray(recording?.releases)?recording.releases:[];
  const release=releases[0]||{};
  const releaseGroup=release?.['release-group']||{};
  const isrcs=Array.isArray(recording?.isrcs)?recording.isrcs.filter(Boolean):[];
  return {
    id:String(recording?.id||''),
    source:'musicbrainz',
    playable:false,
    title:String(recording?.title||'Untitled'),
    artist:musicBrainzArtistName(recording),
    album:String(releaseGroup?.title||release?.title||''),
    year:String(recording?.['first-release-date']||release?.date||'').slice(0,4),
    duration:Math.max(0,Math.round((Number(recording?.length)||0)/1000)),
    score:Number(recording?.score)||0,
    isrc:isrcs[0]?String(isrcs[0]):'',
    musicBrainzUrl:recording?.id?`https://musicbrainz.org/recording/${encodeURIComponent(String(recording.id))}`:''
  };
}

async function musicBrainzSearch(env,query,requestUrl){
  const q=String(query||'').trim();
  if(q.length<2)return [];

  let cache=null,cacheKey=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache){
      const u=new URL(requestUrl);
      u.pathname='/__cache/musicbrainz-recordings';
      u.search='';
      u.searchParams.set('q',q.toLowerCase());
      cacheKey=new Request(u.toString(),{method:'GET'});
      const hit=await cache.match(cacheKey);
      if(hit){
        const cached=await hit.json();
        return Array.isArray(cached?.recordings)?cached.recordings:[];
      }
    }
  }catch{
    cache=null;
    cacheKey=null;
  }

  await musicBrainzThrottle();

  const url=new URL('https://musicbrainz.org/ws/2/recording/');
  url.searchParams.set('query',q);
  url.searchParams.set('fmt','json');
  url.searchParams.set('limit','12');

  const contact=String(
    env.MUSICBRAINZ_CONTACT||
    env.VAPID_SUBJECT||
    new URL(requestUrl).origin
  ).replace(/^mailto:/i,'').trim();

  const response=await fetch(url.toString(),{
    headers:{
      accept:'application/json',
      'user-agent':`CommandCentre/10.5 (${contact||'Command Centre user'})`
    }
  });

  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const err=new Error(data?.error||`MusicBrainz HTTP ${response.status}`);
    err.status=response.status>=400&&response.status<500?response.status:502;
    throw err;
  }

  const recordings=(Array.isArray(data?.recordings)?data.recordings:[])
    .map(normalizeMusicBrainzRecording)
    .filter(x=>x.id&&x.title)
    .slice(0,12);

  if(cache&&cacheKey){
    try{
      await cache.put(cacheKey,new Response(JSON.stringify({recordings}),{
        headers:{
          'content-type':'application/json',
          'cache-control':'public,max-age=21600'
        }
      }));
    }catch{}
  }

  return recordings;
}

function normalizeMusicYoutube(item){
  return {
    id:String(item?.videoId||''),
    videoId:String(item?.videoId||''),
    source:'youtube',
    title:String(item?.title||''),
    artist:String(item?.channelTitle||'YouTube'),
    channelTitle:String(item?.channelTitle||'YouTube'),
    thumbnail:String(item?.thumbnail||''),
    duration:0,
    genre:'YouTube fallback'
  };
}

async function audiusJson(path,params={},env={}){
  const url=new URL(`https://api.audius.co/v1${path}`);
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined&&v!==null&&String(v)!=='')url.searchParams.set(k,String(v));
  }
  // Read-only Audius endpoints work without credentials. app_name gives the
  // provider useful attribution; an optional bearer token can be used if the
  // user later enables a higher-limit developer plan.
  if(!url.searchParams.has('app_name'))url.searchParams.set('app_name','CommandCentre');
  const headers={accept:'application/json'};
  if(env.AUDIUS_BEARER_TOKEN)headers.authorization=`Bearer ${env.AUDIUS_BEARER_TOKEN}`;
  const response=await fetch(url.toString(),{headers});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const err=new Error(data?.error?.message||data?.error||data?.message||`Audius HTTP ${response.status}`);
    err.status=response.status>=400&&response.status<500?response.status:502;
    throw err;
  }
  return data;
}

async function musicTrending(env,requestUrl,force=false){
  let cache=null,cacheKey=null;
  try{
    cache=(typeof caches!=='undefined'&&caches.default)?caches.default:null;
    if(cache&&!force){
      const u=new URL(requestUrl);u.pathname='/__cache/music-trending';u.search='';
      cacheKey=new Request(u.toString(),{method:'GET'});
      const hit=await cache.match(cacheKey);
      if(hit)return hit.json();
    }
  }catch{cache=null;cacheKey=null}

  const data=await audiusJson('/tracks/trending',{limit:24,time:'week'},env);
  const raw=Array.isArray(data?.data)?data.data:Array.isArray(data)?data:[];
  const tracks=raw.map(normalizeAudiusTrack).filter(x=>x.id&&x.streamable);
  const payload={tracks,youtubeConfigured:!!env.YOUTUBE_API_KEY,musicbrainzAvailable:true};

  if(cache){
    try{
      if(!cacheKey){
        const u=new URL(requestUrl);u.pathname='/__cache/music-trending';u.search='';
        cacheKey=new Request(u.toString(),{method:'GET'});
      }
      await cache.put(cacheKey,new Response(JSON.stringify(payload),{
        headers:{'content-type':'application/json','cache-control':'public,max-age=900'}
      }));
    }catch{}
  }
  return payload;
}


async function musicSearchAudius(env,query){
  const q=String(query||'').trim();
  if(q.length<2){
    const err=new Error('Enter at least 2 characters to search music.');
    err.status=400;throw err;
  }

  const data=await audiusJson('/tracks/search',{
    query:q,
    limit:18,
    sort_method:'relevant'
  },env);

  const raw=Array.isArray(data?.data)?data.data:Array.isArray(data)?data:[];
  return raw.map(normalizeAudiusTrack).filter(x=>x.id&&x.streamable);
}

async function musicSearchYouTube(env,query,requestUrl){
  const q=String(query||'').trim();
  if(q.length<2){
    const err=new Error('Enter at least 2 characters to search music.');
    err.status=400;throw err;
  }

  if(!env.YOUTUBE_API_KEY){
    return {
      tracks:[],
      configured:false,
      message:'YouTube API is not configured.'
    };
  }

  const yt=await searchYouTube(env,`${q} official audio`,requestUrl);
  return {
    tracks:(yt.items||[]).map(normalizeMusicYoutube),
    configured:true,
    message:''
  };
}

async function musicSearch(env,query,requestUrl){
  const q=String(query||'').trim();
  if(q.length<2){
    const err=new Error('Enter at least 2 characters to search music.');
    err.status=400;throw err;
  }

  const [audiusSettled,youtubeSettled,musicbrainzSettled]=await Promise.allSettled([
    musicSearchAudius(env,q),
    musicSearchYouTube(env,q,requestUrl),
    musicBrainzSearch(env,q,requestUrl)
  ]);

  const audius=audiusSettled.status==='fulfilled'?audiusSettled.value:[];
  const youtubeResult=youtubeSettled.status==='fulfilled'
    ?youtubeSettled.value
    :{tracks:[],configured:!!env.YOUTUBE_API_KEY,message:''};
  const musicbrainz=musicbrainzSettled.status==='fulfilled'?musicbrainzSettled.value:[];

  return {
    audius,
    youtube:Array.isArray(youtubeResult?.tracks)?youtubeResult.tracks:[],
    musicbrainz,
    audiusError:audiusSettled.status==='rejected'
      ?(audiusSettled.reason?.message||'Audius search unavailable')
      :'',
    youtubeError:youtubeSettled.status==='rejected'
      ?(youtubeSettled.reason?.message||'YouTube search unavailable')
      :(!youtubeResult?.configured?(youtubeResult?.message||'YouTube API is not configured'):''),
    musicbrainzError:musicbrainzSettled.status==='rejected'
      ?(musicbrainzSettled.reason?.message||'MusicBrainz search unavailable')
      :''
  };
}
async function audiusStreamResponse(request,env,trackId){
  const id=String(trackId||'').trim();
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))return json({error:'Invalid Audius track id'},400);

  const upstream=new URL(`https://api.audius.co/v1/tracks/${encodeURIComponent(id)}/stream`);
  upstream.searchParams.set('app_name','CommandCentre');
  const headers={accept:'audio/mpeg,audio/*;q=0.9,*/*;q=0.1'};
  const range=request.headers.get('range');
  if(range)headers.range=range;
  if(env.AUDIUS_BEARER_TOKEN)headers.authorization=`Bearer ${env.AUDIUS_BEARER_TOKEN}`;

  let response;
  try{
    response=await fetch(upstream.toString(),{headers,redirect:'follow'});
  }catch(e){
    return json({error:`Could not reach Audius audio stream: ${e?.message||e}`},502);
  }
  if(!response.ok&&response.status!==206){
    const text=await response.text().catch(()=>'');
    return json({error:text.slice(0,300)||`Audius stream HTTP ${response.status}`},response.status);
  }

  const outHeaders=new Headers();
  for(const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']){
    const value=response.headers.get(name);
    if(value)outHeaders.set(name,value);
  }
  if(!outHeaders.has('content-type'))outHeaders.set('content-type','audio/mpeg');
  outHeaders.set('cache-control','private,max-age=0,no-store');
  outHeaders.set('access-control-allow-origin','*');
  return new Response(response.body,{status:response.status,headers:outHeaders});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/transfers/')) return handleTransfers(request,env,ctx,sendOne);
    if(url.pathname.startsWith('/api/messages/')) return handleMessages(request,env,ctx,sendOne);
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

      if(url.pathname==='/api/live-content/providers'&&request.method==='GET'){
        return json({providers:configuredLiveProviders(env)});
      }

      if(url.pathname==='/api/live-content'&&request.method==='GET'){
        return json(await liveContentStreams(
          env,
          url.searchParams.get('category')||'soccer',
          request.url,
          url.searchParams.get('refresh')==='1',
          url.searchParams.get('provider')||'1'
        ));
      }

      if(url.pathname==='/api/live-content/resolve'&&request.method==='GET'){
        return json(await resolveDynamicSource(
          env,
          url.searchParams.get('provider')||'1',
          url.searchParams.get('source')||'',
          url.searchParams.get('id')||''
        ));
      }

      if(url.pathname==='/api/status'&&request.method==='GET'){
        return json(await commandCentreStatus(env,url.searchParams.get('live')==='1'));
      }

      if(url.pathname==='/api/football'&&request.method==='GET'){
        const competition=url.searchParams.get('competition')||'PL';
        const force=url.searchParams.get('refresh')==='1';
        return json(await getFootballBundle(env,competition,force,request.url));
      }

      if(url.pathname==='/api/football/schedule'&&request.method==='GET'){
        return json(await getFootballSchedule(env,url.searchParams.get('refresh')==='1',request.url));
      }

      if(url.pathname==='/api/football/lineups'&&request.method==='GET'){
        return json(await getFootballLineups(
          env,
          url.searchParams.get('matchId')||'',
          url.searchParams.get('refresh')==='1',
          request.url
        ));
      }

      if(url.pathname==='/api/sports'&&request.method==='GET'){
        const sport=url.searchParams.get('sport')||'tennis';
        const force=url.searchParams.get('refresh')==='1';
        return json(await getGeneralSportBundle(env,sport,force,request.url));
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
          .filter(t=>t.id!==0)
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
            aggregator:env.MEDIA_EMBED_PATH_AGG||'/embed/agg',
            flixer:'/watch/{type}/{tmdbId}'
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
        const mode=url.searchParams.get('mode')||'standard';
        return json({
          embedUrl:buildMediaEmbedUrl(env,{
            type:url.searchParams.get('type')||'',
            id:url.searchParams.get('id')||'',
            season:url.searchParams.get('season')||'',
            episode:url.searchParams.get('episode')||'',
            mode
          }),
          externalOnly:false
        });
      }

      if(url.pathname==='/api/music/trending'&&request.method==='GET'){
        return json(await musicTrending(env,request.url,url.searchParams.get('refresh')==='1'));
      }

      if(url.pathname==='/api/music/search/audius'&&request.method==='GET'){
        return json({tracks:await musicSearchAudius(env,url.searchParams.get('q')||'')});
      }

      if(url.pathname==='/api/music/search/youtube'&&request.method==='GET'){
        return json(await musicSearchYouTube(env,url.searchParams.get('q')||'',request.url));
      }

      if(url.pathname==='/api/music/search/musicbrainz'&&request.method==='GET'){
        return json({recordings:await musicBrainzSearch(env,url.searchParams.get('q')||'',request.url)});
      }

      if(url.pathname==='/api/music/search'&&request.method==='GET'){
        return json(await musicSearch(env,url.searchParams.get('q')||'',request.url));
      }

      if(url.pathname==='/api/music/status'&&request.method==='GET'){
        return json({
          audius:true,
          youtubeConfigured:!!env.YOUTUBE_API_KEY,
          musicbrainz:true,
          audiusBearerConfigured:!!env.AUDIUS_BEARER_TOKEN,
          musicbrainzContactConfigured:!!(env.MUSICBRAINZ_CONTACT||env.VAPID_SUBJECT)
        });
      }

      if(url.pathname==='/api/music/audius/stream'&&request.method==='GET'){
        return audiusStreamResponse(request,env,url.searchParams.get('id')||'');
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

      if(url.pathname==='/api/youtube/comments'&&request.method==='GET'){
        return json(await youtubeComments(
          env,
          url.searchParams.get('videoId')||'',
          url.searchParams.get('pageToken')||'',
          request.url,
          url.searchParams.get('refresh')==='1'
        ));
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
    ctx.waitUntil(cleanTransfers(env));
    ctx.waitUntil(flushTransferPushes(env,sendOne));
    ctx.waitUntil(cleanMessages(env));
    ctx.waitUntil(flushMessagePushes(env,sendOne));
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
