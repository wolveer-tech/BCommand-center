import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import '../public/manga-library.js';

const library=globalThis.CommandCentreMangaLibrary;
const source=readFileSync('public/accounts-client.js','utf8').replace('window.CommandCentreAccounts={','window.__start=()=>{user={id:"student"};linked=true;};window.CommandCentreAccounts={');
const clone=value=>structuredClone(value);
const note=(id='lesson',extra={})=>({id,title:'Biology',body:'<p>Cells</p>',folder:'School',pinned:false,deletedAt:'',purged:false,createdAt:'2026-10-01',updatedAt:'2026-10-02',...extra});
const book=(id='book',extra={})=>note(id,{kind:'schoolbook',subject:'Cells',coverColor:'#466454',paper:'lined',pages:[{id:'page-1',title:'Lesson 1',body:'<p>Writing</p><img src="data:image/png;base64,PHOTO">',createdAt:'2026-10-01'}],...extra});

function client({notes=[],remote=[],metadata,quota=false,hook=()=>{},snapshotError=false}={}){
  const state={notes:clone(notes),noteFolders:['School'],mangaLibrary:library.merge(),noteSyncMetadata:clone(metadata)},server=new Map(remote.map(row=>[row.note.id,clone(row)]));
  const nodes=new Map(),writes=[],commits=[],snapshots=[],cache=new Map(),storage=new Map();let id=0;
  const modal={open:false,classList:{contains(){return modal.open}}};
  const window=new EventTarget();window.CommandCentreMangaReader={refresh(){}};
  const context=vm.createContext({window,state,CommandCentreMangaLibrary:library,crypto:webcrypto,TextEncoder,AbortSignal,Event,Date,JSON,console,
    editingNoteId:null,setTimeout:()=>1,clearTimeout(){},makeId:()=>`generated-${++id}`,nowIso:()=>new Date().toISOString(),
    sanitizeImportedNoteHtml:html=>String(html||''),CommandCentreNotebooks:{normalise:value=>({...value})},renderNotes(){},
    CommandCentreSafety:{database:()=>({run:async(mode,action)=>{const req={result:undefined};const read=action({put:(value,key)=>{cache.set(key,clone(value));return req},get:key=>{req.result=cache.get(key);return req}});return read()}})},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(quota)throw Object.assign(Error('Full'),{name:'QuotaExceededError'});storage.set(key,value)}},
    document:{getElementById:key=>{if(key==='noteModal')return modal;if(!nodes.has(key))nodes.set(key,{});return nodes.get(key)},querySelectorAll:()=>[]},
    stateSafety:{ready:true,flush:async()=>{},snapshot:async(value,reason)=>{if(snapshotError)throw Error('Snapshot failed');snapshots.push({state:clone(value),reason})}},
    saveState:()=>{commits.push(clone(state));return true},
    fetch:async(url,options)=>{
      const overridden=await hook({url,options,state,server,context});if(overridden)return overridden;
      if(url.endsWith('/collections/manga'))return Response.json({library:library.merge(),revision:0});
      if(url.endsWith('/notes'))return Response.json({notes:[...server.values()].map(row=>({id:row.note.id,revision:row.revision}))});
      const key=decodeURIComponent(url.split('/').at(-1)),old=server.get(key);
      if(options.method==='PUT'){
        const data=JSON.parse(options.body);writes.push(data);
        if(data.revision!==(old?.revision||0))return Response.json({conflict:true,error:'Changed'},{status:409});
        const row={note:data.note,revision:(old?.revision||0)+1};server.set(key,row);return Response.json({revision:row.revision});
      }
      assert.ok(old,'Unexpected note request '+url);return Response.json(old);
    }});
  vm.runInContext(source,context);window.__start();
  return {api:window.CommandCentreAccounts,state,server,nodes,context,modal,writes,commits,snapshots,storage};
}

test('record order, default fields and timestamps do not create false note conflicts',async()=>{
  const local={updatedAt:'today',body:'<p>Cells</p>',title:'Biology',id:'lesson',folder:'School'},remote=note();
  const h=client({notes:[local],remote:[{note:remote,revision:1}]});await h.api.sync();
  assert.equal(h.state.notes.length,1);assert.equal(h.writes.length,0);
  assert.equal(h.state.noteSyncMetadata.entries.lesson.revision,1);
  assert.match(h.nodes.get('accountStatus').textContent,/Synced at/);
});

test('schoolbook preview and timestamps can differ while the saved pages are identical',async()=>{
  const local=book('book',{body:'Preview from autosave'}),remote=book('book',{body:'Other preview',updatedAt:'another time'});
  remote.pages[0].createdAt='other timestamp';
  const h=client({notes:[local],remote:[{note:remote,revision:2}]});await h.api.sync();
  assert.equal(h.state.notes.length,1);assert.equal(h.state.notes[0].pages[0].body,local.pages[0].body);
});

test('a failed later download retains the first conflict and its durable revision checkpoint',async()=>{
  let fail=true;
  const local=book(),remote=book();remote.pages[0].body='<p>Edited on PC</p>';
  const h=client({notes:[local,note('later')],remote:[{note:remote,revision:2},{note:note('later',{body:'PC edit'}),revision:3}],hook:({url})=>url.endsWith('/later')&&fail?Response.json({error:'Interrupted'},{status:503}):undefined});
  await h.api.sync();
  const saved=h.commits.at(-1);assert.equal(saved.noteSyncMetadata.entries.book.revision,2);
  assert.equal(saved.notes.filter(n=>n.title.endsWith('(conflicting copy)')).length,1);
  // Simulate reload from the protected record after the interrupted request.
  Object.assign(h.state,clone(saved));fail=false;await h.api.sync();await h.api.sync();
  assert.equal(h.state.notes.filter(n=>n.title.endsWith('(conflicting copy)')&&n.kind==='schoolbook').length,1);
  assert.ok(h.state.notes.some(n=>n.pages?.[0].body===local.pages[0].body));
  assert.ok(h.state.notes.some(n=>n.pages?.[0].body===remote.pages[0].body));
});

test('replaying a stale original after an interruption reuses the same preserved conflict',async()=>{
  const local=book(),remote=book();remote.pages[0].body='PC edit';
  const h=client({notes:[local],remote:[{note:remote,revision:2}]});await h.api.sync();
  const copy=clone(h.state.notes.find(n=>n.id.startsWith('note-conflict-')));
  h.state.notes=[clone(local),copy];h.state.noteSyncMetadata=null;h.storage.clear();await h.api.sync();
  assert.equal(h.state.notes.length,2);assert.equal(h.state.notes.find(n=>n.id===copy.id).pages[0].body,local.pages[0].body);
});

test('full localStorage does not discard sync baselines or generate repeated copies',async()=>{
  const h=client({notes:[note()],quota:true});await h.api.sync();await h.api.sync();
  assert.equal(h.writes.length,1);assert.equal(h.state.notes.length,1);
  assert.equal(h.commits.at(-1).noteSyncMetadata.entries.lesson.revision,1);
  assert.match(h.nodes.get('accountStatus').textContent,/Synced at/);
});

test('opening an editor while a remote schoolbook downloads leaves its draft untouched',async()=>{
  let opened=false;
  const local=book(),remote=book();remote.pages[0].body='Remote writing';
  const h=client({notes:[local],remote:[{note:remote,revision:1}],hook:({url,context})=>{if(url.endsWith('/book')&&!opened){opened=true;context.editingNoteId='book';h.modal.open=true}}});
  await h.api.sync();assert.equal(h.state.notes.length,1);assert.equal(h.state.notes[0].pages[0].body,local.pages[0].body);
  h.modal.open=false;await h.api.sync();assert.equal(h.state.notes.length,2);
});

test('an edit during upload stays dirty and uploads on the next pass',async()=>{
  let edited=false;
  const h=client({notes:[note()],hook:({options,state})=>{if(options.method==='PUT'&&!edited){edited=true;state.notes=state.notes.map(n=>({...n,body:'<p>Newer writing</p>'}))}}});
  await h.api.sync();assert.equal(h.state.notes[0].body,'<p>Newer writing</p>');
  await h.api.sync();assert.equal(h.server.get('lesson').note.body,'<p>Newer writing</p>');assert.equal(h.state.notes.length,1);
});

test('cleanup snapshots first, soft-deletes identical copies and preserves different pages and photos',async()=>{
  const original=book(),copy=book('copy',{title:'Biology (conflicting copy)',updatedAt:'later'});copy.pages[0].id='different-generated-id';copy.pages[0].createdAt='later';
  const writing=book('writing',{title:'Biology (conflicting copy)'});writing.pages[0].body+='<p>Unique writing</p>';
  const photo=book('photo',{title:'Biology (conflicting copy)'});photo.pages[0].body=photo.pages[0].body.replace('PHOTO','DIFFERENT');
  const extraPage=book('extra-page',{title:'Biology (conflicting copy)'});extraPage.pages.push({id:'page-2',body:'Extra lesson'});
  const originalNote=note('note'),noteCopy=note('note-copy',{title:'Biology (conflicting copy)'});
  const h=client({notes:[original,copy,writing,photo,extraPage,originalNote,noteCopy]});await h.api.cleanConflicts();
  assert.equal(h.snapshots.length,1);assert.equal(h.snapshots[0].state.notes.filter(n=>n.deletedAt).length,0);
  assert.deepEqual(h.state.notes.filter(n=>n.deletedAt).map(n=>n.id).sort(),['copy','note-copy']);
  assert.equal(h.state.notes.filter(n=>!n.deletedAt).length,5);assert.ok(h.state.notes.every(n=>!n.purged));
  assert.match(h.nodes.get('accountStatus').textContent,/2 identical copies moved.*3 copies with different content kept/);
});

test('cleanup keeps all copies when its protective snapshot fails',async()=>{
  const h=client({notes:[note(),note('copy',{title:'Biology (conflicting copy)'})],snapshotError:true});await h.api.cleanConflicts();
  assert.ok(h.state.notes.every(n=>!n.deletedAt));assert.match(h.nodes.get('accountStatus').textContent,/Snapshot failed/);
});
