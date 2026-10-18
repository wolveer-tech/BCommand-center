(function(root){
  const key=value=>String(value||'').toLowerCase().replace(/\b(fc|afc|football club)\b/g,'').replace(/[^a-z0-9]/g,'');
  const female=value=>value?.gender==='female'||/women|\(w\)|ladies/i.test(String(value?.name||''));
  const namespace=id=>Math.abs(Number(id))>=900000000000?'sofascore':Math.abs(Number(id))>=800000000000?'fotmob':Number(id)<0?'api-football':'football-data';
  function favourite(match,teams=[]){return teams.some(team=>[match.homeTeam,match.awayTeam].some(other=>{
    if(!other)return false;
    if(Number(team.id)&&Number(team.id)===Number(other.id))return true;
    if(female(team)!==(match.gender==='female'||female(other)))return false;
    if(Number(team.id)&&Number(other.id)&&namespace(team.id)===namespace(other.id))return false;
    return !!key(team.name)&&key(team.name)===key(other.name);
  }));}
  function followed(state,matches,now=Date.now()){
    const manual=new Set((state.footballFollowedMatches||[]).map(Number).filter(Number.isSafeInteger).filter(Boolean));
    const excluded=new Set((state.footballExcludedMatches||[]).map(Number));
    const automatic=state.footballAutoFollowTeams!==false?matches.filter(match=>{
      const time=Date.parse(match.utcDate||'');
      return Number.isFinite(time)&&time>=now-6*3600000&&time<=now+14*86400000&&
        // Keep recent final results followed so native activities receive their final score.
        !['CANCELLED','POSTPONED'].includes(match.status)&&favourite(match,state.footballFavouriteTeams||[]);
    }).sort((a,b)=>Date.parse(a.utcDate)-Date.parse(b.utcDate)).map(match=>Number(match.id)):[];
    return [...new Set([...manual,...automatic])].filter(id=>Number.isSafeInteger(id)&&id!==0&&!excluded.has(id)).slice(0,60);
  }
  root.CommandCentreFootballFollowing={favourite,followed};
})(globalThis);
