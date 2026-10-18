/* Pitch positions come from provider coordinates, formation rows, then positions. */
(function(root){
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function positions(team){
    const players=Array.isArray(team.starting)?team.starting:[];
    if(players.length&&players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))return players.map(p=>({...p,x:10+p.x*80,y:10+(1-p.y)*80}));
    const formation=String(team.formation||'').split('-').map(Number),valid=formation.length>=2&&formation.every(n=>n>0&&n<=6)&&formation.reduce((a,b)=>a+b,0)===players.length-1;
    let rows;
    if(valid){let at=0;rows=[1,...formation].map(count=>players.slice(at,at+=count));}
    else{rows=[[],[],[],[]];for(const p of players){const pos=String(p.position||'').toLowerCase();rows[/goal|^g$/.test(pos)?0:/defen|back|^d$/.test(pos)?1:/mid|^m$/.test(pos)?2:3].push(p);}rows=rows.filter(row=>row.length);}
    return rows.flatMap((row,index)=>row.map((p,i)=>({...p,x:(i+1)*100/(row.length+1),y:88-index*76/Math.max(1,rows.length-1)})));
  }
  function render(team){
    const players=positions(team);if(!players.length)return '<div class="empty">Starting lineup not announced.</div>';
    return `<div class="football-pitch" role="img" aria-label="${esc(team.name)} starting formation ${esc(team.formation||'by position')}"><div class="pitch-centre" aria-hidden="true"></div><div class="pitch-box top" aria-hidden="true"></div><div class="pitch-box bottom" aria-hidden="true"></div>${players.map(p=>`<div class="pitch-player" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%" title="${esc(p.name)}${p.position?' · '+esc(p.position):''}"><span class="pitch-shirt">${esc(p.number??'–')}</span><span class="pitch-name">${esc(p.name)}${p.captain?' ©':''}</span></div>`).join('')}</div>`;
  }
  root.CommandCentreFootballPitch={positions,render};
})(globalThis);
