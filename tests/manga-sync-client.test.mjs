import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import '../public/manga-library.js';
const lib=globalThis.CommandCentreMangaLibrary;
const source=readFileSync('public/accounts-client.js','utf8').replace('window.CommandCentreAccounts={','window.__start=()=>{user={id:"same-user"};linked=true;};window.__syncManga=syncManga;window.CommandCentreAccounts={');
const chapter=(page,readAt=10)=>({id:'/comics/story',source:'asura',title:'Story',chapter:{id:'/comics/story/chapter/1',chapter:'1'},page,pageCount:20,readAt});
function client(server,library){
 const nodes=new Map(),saved=[];const state={notes:[],noteFolders:[],mangaLibrary:lib.merge(library)};
 const window=new EventTarget();window.CommandCentreMangaReader={refresh(){}};
 const context=vm.createContext({window,state,CommandCentreMangaLibrary:lib,crypto:webcrypto,TextEncoder,AbortSignal,Event,Date,JSON,console,setTimeout:()=>1,clearTimeout(){},localStorage:{getItem:()=>null,setItem(){}},document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);},querySelectorAll:()=>[]},stateSafety:{ready:true},saveState:()=>{saved.push(structuredClone(state));return true;},fetch:async(url,options)=>{
  if(url.endsWith('/notes'))return Response.json({error:'A note service failure must not block manga.'},{status:503});
  assert.ok(url.endsWith('/collections/manga'));
  if(options.method==='PUT'){const body=JSON.parse(options.body);if(body.revision!==server.revision)return Response.json({conflict:true,error:'conflict'},{status:409});server.library=body.library;server.revision++;return Response.json({revision:server.revision});}
  return Response.json(server);
 }});
 vm.runInContext(source,context);window.__start();return {window,state,saved};
}
test('PC and phone exchange reading history even if the notes service fails',async()=>{
 const server={library:lib.merge(),revision:0},pc=client(server,{history:[chapter(7)]}),phone=client(server,{});
 await pc.window.CommandCentreAccounts.sync();assert.equal(server.library.history[0].page,7);
 await phone.window.CommandCentreAccounts.sync();assert.equal(phone.state.mangaLibrary.history[0].page,7);assert.equal(phone.window.CommandCentreAccounts.mangaSyncState,'synced');
 phone.state.mangaLibrary=lib.merge(phone.state.mangaLibrary,{history:[chapter(12,20)]});await phone.window.CommandCentreAccounts.sync();await pc.window.CommandCentreAccounts.sync();assert.equal(pc.state.mangaLibrary.history[0].page,12);
 assert.ok(phone.saved.length);assert.equal(server.library.history.length,1);
});
test('an edit made while manga is downloading is merged and uploaded',async()=>{
 const server={library:lib.merge({history:[chapter(4)]}),revision:1},pc=client(server,{history:[chapter(9,30)]});
 await pc.window.__syncManga('same-user');assert.equal(pc.state.mangaLibrary.history[0].page,9);assert.equal(server.library.history[0].page,9);
});
test('legacy notes-only links are upgraded on session discovery and signing in links device data',()=>{
 assert.match(source,/!state.mangaAccountOwner&&\(!state.noteAccountOwner\|\|state.noteAccountOwner===user.id\)\)await link\(\)/);
 assert.match(source,/if\(linked\)queue\(\);else await link\(\)/);
});
