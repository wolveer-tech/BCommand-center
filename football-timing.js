// The half times have no zone. Anchor their elapsed duration to UTC kickoff.
// This is an estimate: the referee determines when the second half starts.
export function fotmobHalftimeEnd(status){
  if(!/half.?time|^ht$/i.test(String(status?.reason?.long||status?.reason?.short||status?.liveTime?.short||'')))return null;
  if(status?.halfs?.secondHalfStarted)return null;
  const wall=value=>{const m=String(value||'').match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);return m?Date.UTC(+m[3],+m[2]-1,+m[1],+m[4],+m[5],+m[6]):NaN;};
  const elapsed=wall(status?.halfs?.firstHalfEnded)-wall(status?.halfs?.firstHalfStarted),kickoff=Date.parse(status?.utcTime||'');
  return Number.isFinite(kickoff)&&elapsed>=30*60000&&elapsed<=90*60000?kickoff+elapsed+15*60000:null;
}
export function halftimeDeadline(match,now=Date.now(),previous=null){
  if(!['PAUSED','HALF_TIME','HT'].includes(match?.status)||(Number(match?.minute)||0)>60)return null;
  const supplied=Number(match?.halftimeEndsAt),saved=Number(previous);
  if(Number.isFinite(supplied)&&supplied>now-60*60000&&supplied<=now+16*60000)return supplied;
  if(Number.isFinite(saved)&&saved>0&&saved<=now+16*60000)return saved;
  return now+15*60000;
}
