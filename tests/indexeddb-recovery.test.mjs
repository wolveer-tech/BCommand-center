import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/state-safety.js';

// A fault-injecting transactional store. Browser tests cover native IndexedDB;
// this harness reproduces close/abort events that are nondeterministic on phones.
function storage(){
  const records=new Map(),connections=[];let startErrors=[],abortErrors=[];
  const error=name=>Object.assign(new Error(name==='InvalidStateError'?'The database connection is closing.':name),{name});
  const indexedDB={open(){
    const request={};queueMicrotask(()=>{
      const db={closed:false,objectStoreNames:{contains:()=>true},close(){db.closed=true},forceClose(){db.closed=true;db.onclose?.()},transaction(store,mode){
        if(db.closed)throw error('InvalidStateError');if(startErrors.length)throw error(startErrors.shift());
        const tx={},working=new Map(structuredClone([...records])),requests=[];
        const add=action=>{const req={};requests.push({req,action});return req};
        const objectStore={getAll:()=>add(()=>[...working.values()]),get:key=>add(()=>working.get(key)),put:(value,key)=>add(()=>{working.set(key??value.id,structuredClone(value));return key??value.id}),delete:key=>add(()=>working.delete(key))};
        tx.objectStore=()=>objectStore;tx.abort=()=>{tx.error=error('AbortError')};
        queueMicrotask(()=>{
          while(requests.length&&!tx.error){const {req,action}=requests.shift();req.result=action();req.onsuccess?.()}
          if(!tx.error&&abortErrors.length)tx.error=error(abortErrors.shift());
          if(tx.error){tx.onabort?.();return}
          if(mode==='readwrite'){records.clear();for(const [key,value] of working)records.set(key,value)}tx.oncomplete?.();
        });
        return tx;
      }};
      connections.push(db);request.result=db;request.onsuccess?.();
    });return request;
  }};
  return {indexedDB,records,connections,startErrors:names=>{startErrors=names},abortErrors:names=>{abortErrors=names}};
}
const open=h=>CommandCentreSafety.database({indexedDB:h.indexedDB,name:'test',store:'snapshots',keyPath:'id'});
const put=(db,value)=>db.run('readwrite',store=>{const req=store.put(value);return ()=>req.result});
const get=(db,id)=>db.run('readonly',store=>{const req=store.get(id);return ()=>req.result});

test('a forced-close event invalidates the cached connection and retains all records',async()=>{
  const h=storage(),db=open(h);await put(db,{id:'note',body:'Saved writing'});
  h.connections[0].forceClose();assert.equal((await get(db,'note')).body,'Saved writing');assert.equal(h.connections.length,2);
});

test('a silently closing connection is reopened before retrying the complete transaction',async()=>{
  const h=storage(),db=open(h);await put(db,{id:'old',body:'Original'});h.connections[0].closed=true;
  await put(db,{id:'new',body:'New writing'});assert.equal(h.connections.length,2);assert.equal(h.records.size,2);
});

test('an aborted write retries atomically, including its note and sync revision',async()=>{
  const h=storage(),db=open(h);h.abortErrors(['UnknownError']);let attempts=0;
  await db.run('readwrite',store=>{attempts++;store.put({id:'note',body:'Writing'});store.put({id:'metadata',revision:2});return ()=>true});
  assert.equal(attempts,2);assert.equal(h.connections.length,2);assert.equal(h.records.size,2);assert.equal(h.records.get('metadata').revision,2);
});

test('persistent connection failure is bounded and a later request can recover',async()=>{
  const h=storage(),db=open(h);h.startErrors(['InvalidStateError','InvalidStateError','InvalidStateError']);
  await assert.rejects(put(db,{id:'note',body:'Writing'}),{name:'InvalidStateError'});assert.equal(h.connections.length,3);assert.equal(h.records.size,0);
  await put(db,{id:'note',body:'Writing'});assert.equal(h.records.size,1);assert.equal(h.connections.length,4);
});

test('quota and schema errors are surfaced without repeated write attempts',async()=>{
  for(const name of ['QuotaExceededError','DataCloneError','NotFoundError']){
    const h=storage(),db=open(h);h.startErrors([name]);await assert.rejects(put(db,{id:'note'}),{name});assert.equal(h.connections.length,1);assert.equal(h.records.size,0);
  }
});

test('protected state recovers after close with notes and sync metadata in the same saved record',async()=>{
  const h=storage(),values=new Map(),local={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const options={indexedDB:h.indexedDB,storage:local},a=CommandCentreSafety.create(options);await a.initialize();
  const state={notes:[{id:'lesson',body:'Saved writing'}],events:[],reminders:[],noteSyncMetadata:{accountId:'student',entries:{lesson:{revision:4,hash:'content'}}}};
  h.connections[0].closed=true;h.abortErrors(['AbortError']);assert.ok(a.save(state));await a.flush();values.clear();
  const b=CommandCentreSafety.create(options),recovered=await b.initialize();assert.equal(recovered.notes[0].body,'Saved writing');assert.equal(recovered.noteSyncMetadata.entries.lesson.revision,4);
  assert.ok((await b.list()).length>=1,'Recovery history must survive the reconnect too');
});
