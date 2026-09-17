(function(root){
  const key=value=>String(value||'').toLowerCase().replace(/\b(fc|afc|football club)\b/g,'').replace(/[^a-z0-9]/g,'');
  function favourite(match,teams=[]){return teams.some(team=>[match.homeTeam,match.awayTeam].some(other=>other&&((Number(team.id)!==0&&Number(team.id)===Number(other.id))||(key(team.name)&&key(team.name)===key(other.name))))) }
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
