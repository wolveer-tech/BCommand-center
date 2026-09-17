import {authenticateTransferDevice,readTransferJSON} from './transfers.js';
import {apnsConfigured,sendActivityPush} from './apns.js';
import './public/football-following.js';
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const ids=value=>[...new Set((Array.isArray(value)?value:[]).map(Number).filter(n=>Number.isSafeInteger(n)&&n!==0))].slice(0,200);
const token=value=>/^[a-f0-9]{32,512}$/i.test(String(value||''))?String(value).toLowerCase():null;
export async function ensureLiveActivities(env){
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS live_activity_devices(device_id TEXT PRIMARY KEY,start_token TEXT,preferences TEXT NOT NULL DEFAULT '{}',updated_at INTEGER NOT NULL,last_error TEXT)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS live_activity_matches(device_id TEXT NOT NULL,match_id INTEGER NOT NULL,activity_id TEXT,update_token TEXT,last_sent INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,ended INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,PRIMARY KEY(device_id,match_id))`)
 ]);
}
export async function handleLiveActivities(request,env){
 try{
  if(!env.DB)return reply({error:'D1 is not configured.'},503);
  const device=await authenticateTransferDevice(request,env);await ensureLiveActivities(env);
  const path=new URL(request.url).pathname.slice('/api/live-activities'.length);
  if(request.method==='GET'&&path==='/status'){
   const row=await env.DB.prepare('SELECT start_token,last_error FROM live_activity_devices WHERE device_id=?').bind(device.id).first();
   return reply({configured:apnsConfigured(env),startReady:!!row?.start_token,error:row?.last_error||null});
  }
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  const body=await readTransferJSON(request),now=Date.now();
  await env.DB.prepare(`INSERT OR IGNORE INTO live_activity_devices(device_id,updated_at) VALUES(?,?)`).bind(device.id,now).run();
  if(path==='/preferences'){
   const prefs={footballAutoFollowTeams:body.autoFollow!==false,footballFavouriteTeams:(Array.isArray(body.teams)?body.teams:[]).slice(0,30).map(t=>({id:Number(t.id)||0,name:String(t.name||'').slice(0,120)})),footballFollowedMatches:ids(body.followed),footballExcludedMatches:ids(body.excluded)};
   await env.DB.prepare('UPDATE live_activity_devices SET preferences=?,updated_at=? WHERE device_id=?').bind(JSON.stringify(prefs),now,device.id).run();
  }else if(path==='/start-token'){
   const value=token(body.token);if(!value)return reply({error:'Invalid ActivityKit start token'},400);
   await env.DB.prepare('UPDATE live_activity_devices SET start_token=?,updated_at=? WHERE device_id=?').bind(value,now,device.id).run();
  }else if(path==='/register'){
   const matchId=Number(body.matchId),value=token(body.token),activityId=String(body.activityId||'');
   if(!Number.isSafeInteger(matchId)||!matchId||(!value&&body.pending!==true)||!activityId||activityId.length>160)return reply({error:'Invalid Live Activity registration'},400);
   const count=await env.DB.prepare('SELECT COUNT(*) n FROM live_activity_matches WHERE device_id=? AND ended=0').bind(device.id).first();
   const existing=await env.DB.prepare('SELECT match_id FROM live_activity_matches WHERE device_id=? AND match_id=?').bind(device.id,matchId).first();
   if(!existing&&Number(count.n)>=10)return reply({error:'Too many active matches'},429);
   await env.DB.prepare(`INSERT INTO live_activity_matches(device_id,match_id,activity_id,update_token,created_at) VALUES(?,?,?,?,?) ON CONFLICT(device_id,match_id) DO UPDATE SET activity_id=excluded.activity_id,update_token=CASE WHEN excluded.activity_id=live_activity_matches.activity_id THEN COALESCE(excluded.update_token,live_activity_matches.update_token) ELSE excluded.update_token END,ended=0`).bind(device.id,matchId,activityId,value,now).run();
  }else if(path==='/end'){
   await env.DB.prepare('UPDATE live_activity_matches SET ended=1 WHERE device_id=? AND match_id=? AND activity_id=?').bind(device.id,Number(body.matchId)||0,String(body.activityId||'')).run();
  }else return reply({error:'Not found'},404);
  return reply({ok:true,configured:apnsConfigured(env),message:apnsConfigured(env)?'Server push configured.':'Closed-app Live Activities need APNS_CONFIG for this signing team.'});
 }catch(error){return reply({error:error.message||'Live Activity request failed'},Number(error.status)||500)}
}
export function activityContent(match,now=Date.now()){
 const phase=String(match.status||'SCHEDULED'),finished=['FINISHED','CANCELLED','POSTPONED'].includes(phase);
 const score=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
 return {timestamp:Math.floor(now/1000),event:finished?'end':'update','content-state':{homeScore:score(match.score?.fullTime?.home),awayScore:score(match.score?.fullTime?.away),phase,minute:score(match.minute),updatedAt:now/1000-978307200},'stale-date':Math.floor(now/1000)+180,...(finished?{'dismissal-date':Math.floor(now/1000)+1800}:{})};
}
export async function refreshLiveActivityPushes(env,getSchedule,getMatch){
 if(!env.DB||!apnsConfigured(env))return;
 await ensureLiveActivities(env);
 const devices=(await env.DB.prepare(`SELECT l.* FROM live_activity_devices l JOIN transfer_devices d ON d.id=l.device_id WHERE d.revoked_at IS NULL`).all()).results||[];
 if(!devices.length)return;
 let schedule=[];try{schedule=(await getSchedule()).matches||[]}catch{ /* Registered activities can still be updated from match details. */ }
 const now=Date.now(),cache=new Map();
 const detail=id=>{if(!cache.has(id))cache.set(id,getMatch(id));return cache.get(id)};
 for(const device of devices){
  try{
   const prefs=JSON.parse(device.preferences);
   if(!Array.isArray(prefs.footballFollowedMatches))continue;
   const wanted=new Set(globalThis.CommandCentreFootballFollowing.followed(prefs,schedule,now));
   const rows=(await env.DB.prepare('SELECT * FROM live_activity_matches WHERE device_id=? AND ended=0').bind(device.device_id).all()).results||[];
   for(const row of rows){
    if(!row.update_token)continue;
    const fixture=schedule.find(match=>Number(match.id)===row.match_id);
    if(wanted.has(row.match_id)&&fixture&&Date.parse(fixture.utcDate)>now+10*60000)continue;
    const claim=await env.DB.prepare('UPDATE live_activity_matches SET lease_until=? WHERE device_id=? AND match_id=? AND lease_until<? AND last_sent<? AND ended=0 RETURNING match_id').bind(now+55000,device.device_id,row.match_id,now,now-50000).first();
    if(!claim)continue;
    try{
     const payload=await detail(row.match_id),match=payload.match;if(!match)throw Error('No current match data');
     const aps=activityContent(match);
     // A disappeared schedule entry alone must not cancel an already active favourite match.
     const stillWanted=wanted.has(row.match_id)||(!(prefs.footballExcludedMatches||[]).includes(row.match_id)&&prefs.footballAutoFollowTeams!==false&&globalThis.CommandCentreFootballFollowing.favourite(match,prefs.footballFavouriteTeams));
     if(!stillWanted){aps.event='end';aps['dismissal-date']=Math.floor(now/1000)}
     await sendActivityPush(row.update_token,aps,env,`match-${row.match_id}`);
     await env.DB.prepare('UPDATE live_activity_matches SET last_sent=?,lease_until=0,ended=? WHERE device_id=? AND match_id=? AND update_token=?').bind(now,aps.event==='end'?1:0,device.device_id,row.match_id,row.update_token).run();
     await env.DB.prepare('UPDATE live_activity_devices SET last_error=NULL WHERE device_id=?').bind(device.device_id).run();
    }catch(error){
     if(error.invalidToken)await env.DB.prepare('UPDATE live_activity_matches SET ended=1 WHERE device_id=? AND match_id=? AND update_token=?').bind(device.device_id,row.match_id,row.update_token).run();
     await env.DB.prepare('UPDATE live_activity_devices SET last_error=? WHERE device_id=?').bind(String(error.message).slice(0,300),device.device_id).run();
    }
   }
   if(!device.start_token)continue;
   let activeCount=rows.length;
   for(const match of schedule.filter(m=>wanted.has(Number(m.id))&&Date.parse(m.utcDate)<=now+5*60000&&Date.parse(m.utcDate)>=now-3*3600000&&!['FINISHED','CANCELLED','POSTPONED'].includes(m.status))){
    if(activeCount>=3)break;
    const claim=await env.DB.prepare('INSERT OR IGNORE INTO live_activity_matches(device_id,match_id,created_at,lease_until) VALUES(?,?,?,?) RETURNING match_id').bind(device.device_id,Number(match.id),now,now+120000).first();
    if(!claim)continue;
    try{
     const current=(await detail(Number(match.id))).match;if(!current||['FINISHED','CANCELLED','POSTPONED'].includes(current.status)){await env.DB.prepare('UPDATE live_activity_matches SET ended=1 WHERE device_id=? AND match_id=?').bind(device.device_id,Number(match.id)).run();continue}
     const aps={...activityContent(current),event:'start','attributes-type':'FootballMatchAttributes',attributes:{matchID:Number(current.id),competition:current.competition?.name||'Football',homeTeam:current.homeTeam?.name||'Home',awayTeam:current.awayTeam?.name||'Away',kickoff:Date.parse(current.utcDate)/1000-978307200},alert:{title:'Followed match',body:`${current.homeTeam?.name||'Home'} vs ${current.awayTeam?.name||'Away'}`},'input-push-token':1};
     await sendActivityPush(device.start_token,aps,env,`start-${match.id}`);activeCount++;
    }catch(error){
     // Keep the claim on ambiguous network errors to avoid duplicate remote starts.
     if(error.status)await env.DB.prepare('DELETE FROM live_activity_matches WHERE device_id=? AND match_id=? AND update_token IS NULL').bind(device.device_id,Number(match.id)).run();
     if(error.invalidToken)await env.DB.prepare('UPDATE live_activity_devices SET start_token=NULL WHERE device_id=? AND start_token=?').bind(device.device_id,device.start_token).run();
     await env.DB.prepare('UPDATE live_activity_devices SET last_error=? WHERE device_id=?').bind(String(error.message).slice(0,300),device.device_id).run();
    }
   }
  }catch(error){console.warn('Live Activity refresh failed',String(error.message))}
 }
 await env.DB.prepare('DELETE FROM live_activity_matches WHERE created_at<?').bind(now-7*86400000).run();
}
