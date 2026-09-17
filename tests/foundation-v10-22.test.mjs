import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../public/index.html');

test('football defaults to one selected league and exposes an explicit worldwide mode',()=>{
  assert.match(html,/footballCompetition:'PL'/);
  assert.match(html,/<option value="ALL">All — worldwide<\/option>/);
  assert.match(html,/function footballMatchInCompetition\(match,selection\)/);
  assert.match(html,/scopedMatches=matches\.filter\(match=>footballMatchInCompetition\(match,selection\)\)/);
  assert.match(html,/const allMode=competition==='ALL'/);
  assert.match(html,/allMode\?Promise\.resolve\(\{matches:\[\],standings:\[\]/);
});

test('worldwide football is grouped by relevance and competition priority',()=>{
  assert.match(html,/function footballMatchIsPersonal\(match\)/);
  assert.match(html,/function footballCompetitionPriority\(match\)/);
  assert.match(html,/function footballPrioritiseWorldwide\(rows,newestFirst=false\)/);
  assert.match(html,/a\.personal===b\.personal/);
  assert.match(html,/football-league-heading/);
  assert.match(html,/Your teams/);
  assert.match(html,/Top competition/);
  assert.match(html,/biggest and most relevant leagues first/);
});

test('football scope and priority functions order representative matches correctly',()=>{
  const start=html.indexOf('const FOOTBALL_COMPETITIONS=');
  const end=html.indexOf('function footballScoreText',start);
  const context={localStorage:{getItem:()=>null,setItem:()=>{}},dayKey:()=> '2026-09-14',state:{footballFollowedMatches:[],footballFavouriteTeams:[{id:1,name:'Arsenal'}]}};
  context.effectiveFollowedMatchIDs=()=>context.state.footballFollowedMatches;
  context.footballFavouriteTeams=()=>context.state.footballFavouriteTeams;
  vm.createContext(context);
  vm.runInContext(`${html.slice(start,end)}\nglobalThis.footballApi={footballMatchInCompetition,footballPrioritiseWorldwide};`,context);
  const match=(id,name,code,homeId)=>({id,utcDate:`2026-09-14T${String(id).padStart(2,'0')}:00:00Z`,competition:{id:id+100,name,code},homeTeam:{id:homeId,name:homeId===1?'Arsenal':'Home'},awayTeam:{id:id+20,name:'Away'}});
  const premier=match(2,'Premier League','ENG',9),champions=match(3,'UEFA Champions League','',10),small=match(1,'Regional League','FRA',11),personal=match(4,'Regional Cup','ENG',1);
  assert.equal(context.footballApi.footballMatchInCompetition(premier,'PL'),true);
  assert.equal(context.footballApi.footballMatchInCompetition(champions,'PL'),false);
  assert.equal(context.footballApi.footballMatchInCompetition(champions,'CL'),true);
  assert.equal(context.footballApi.footballMatchInCompetition(small,'ALL'),true);
  assert.equal(JSON.stringify(context.footballApi.footballPrioritiseWorldwide([small,champions,premier,personal]).map(item=>item.id)),JSON.stringify([4,2,3,1]));
});

test('notes use a compact expandable keyboard dock',()=>{
  assert.match(html,/id="noteFormatToggle"[^>]*>Aa<\/button>/);
  assert.match(html,/id="noteFormatDetails"/);
  assert.match(html,/id="noteKeyboardDone"/);
  assert.match(html,/id="noteFontFamily"/);
  assert.match(html,/noteExec\('fontName',e\.target\.value\)/);
  assert.match(html,/note-keyboard-open\.note-body-focused \.modal-actions\{display:none\}/);
  assert.match(html,/note-keyboard-open\.note-body-focused \.note-toolbar\{position:absolute/);
  assert.match(html,/\.note-toolbar\.expanded \.note-format-details\{display:flex/);
});

test('note formatting keeps and restores the body selection',()=>{
  assert.match(html,/let noteSavedRange=null/);
  assert.match(html,/function rememberNoteSelection\(\)/);
  assert.match(html,/function restoreNoteSelection\(\)/);
  assert.match(html,/el\.focus\(\{preventScroll:true\}\);restoreNoteSelection\(\);document\.execCommand/);
  assert.match(html,/document\.addEventListener\('selectionchange'/);
});
