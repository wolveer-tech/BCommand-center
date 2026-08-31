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
  }
};
