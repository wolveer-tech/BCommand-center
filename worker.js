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

async function sendOne(row,env){
  const sub={endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}};
  await sendPushNotification(sub,{title:row.title,body:row.body,icon:'/icon-192.png',badge:'/icon-192.png',tag:row.id,data:{url:row.url}},{publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT||'mailto:command-centre@example.com'});
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
        await env.DB.prepare('DELETE FROM notifications WHERE device_id=? AND sent=0').bind(deviceId).run();
        for(const x of items.slice(0,5000)){
          await env.DB.prepare('INSERT OR IGNORE INTO notifications(id,device_id,item_id,kind,due_at,title,body,url,frequency,local_date,local_time,timezone,sent) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0)').bind(x.id,deviceId,x.itemId,x.kind,x.dueAt,x.title,x.body,x.url,x.frequency||'none',x.localDate,x.localTime,x.timezone||timezone||'Europe/London').run();
        }
        return json({ok:true,count:items.length});
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

      if(url.pathname==='/api/push/test'&&request.method==='POST'){
        const {deviceId}=await request.json(); const row=await env.DB.prepare('SELECT d.*, d.device_id FROM devices d WHERE d.device_id=?').bind(deviceId).first();
        if(!row)return json({error:'Device not registered'},404);
        await sendOne({endpoint:row.endpoint,p256dh:row.p256dh,auth:row.auth,title:'Command Centre',body:'Background notifications are working.',url:'/' ,id:'cc-test'},env);
        return json({ok:true});
      }
      return json({error:'Not found'},404);
    }catch(e){console.error(e);return json({error:e?.message||String(e)},500)}
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
    // News is checked once per hour so the minute-by-minute reminder cron does not burn API quota.
    if(new Date().getUTCMinutes()===5) ctx.waitUntil(sendNewsPushes(env));
  }
};
