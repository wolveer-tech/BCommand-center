import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync('public/sw.js','utf8');
function harness({htmlInsteadOfCss=false,offline=false}={}){
  const events=new Map(),stores=new Map(),deleted=[];
  const open=async name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const rows=stores.get(name);
    return {put:async(key,response)=>rows.set(String(key),response),match:async key=>rows.get(String(key))?.clone()};
  };
  const self={location:{origin:'https://app.test'},addEventListener:(name,fn)=>events.set(name,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  const fetch=async request=>{
    if(offline)throw Error('Offline');
    const path=new URL(typeof request==='string'?request:request.url,'https://app.test').pathname;
    const type=path.endsWith('.js')?'application/javascript':path.endsWith('.css')&&!htmlInsteadOfCss?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':path.endsWith('.webmanifest')?'application/manifest+json':'text/html';
    return new Response(type==='text/html'?'<html>app</html>':'asset',{headers:{'content-type':type}});
  };
  const context=vm.createContext({self,caches:{open,keys:async()=>[...stores.keys()],delete:async key=>{deleted.push(key);return stores.delete(key)}},fetch,URL,Response,console});
  vm.runInContext(source,context);
  const dispatch=async(name,extra={})=>{
    let result,pending=[];
    events.get(name)({...extra,waitUntil:p=>pending.push(p),respondWith:p=>{result=p}});
    const response=await result;await Promise.all(pending);return response;
  };
  return {stores,deleted,open,dispatch};
}

test('the shell installs one cache entry per asset and removes only obsolete app caches',async()=>{
  const h=harness();await h.open('command-centre-shell-old');await h.open('user-downloads');
  await h.dispatch('install');await h.dispatch('activate');
  assert.deepEqual(h.deleted,['command-centre-shell-old']);assert.equal(h.stores.has('user-downloads'),true);
  const current=[...h.stores].find(([key])=>key.includes('10.33.7'))[1];
  assert.equal([...current.keys()].some(key=>key.includes('?')),false);
  assert.equal(current.has('/workspace-design.css'),true);assert.equal(current.has('/storage-tools.js'),true);
});

test('a missing stylesheet returning SPA HTML prevents activation of an incomplete shell',async()=>{
  const h=harness({htmlInsteadOfCss:true});
  await assert.rejects(h.dispatch('install'),/Missing or invalid app asset/);
  assert.equal([...h.stores.values()].some(rows=>rows.has('/workspace-design.css')),false);
});

test('version queries reuse one canonical file instead of duplicating files across releases',async()=>{
  const h=harness();await h.dispatch('install');
  for(const version of ['10.33.7','10.33.8','10.33.9']){
    const response=await h.dispatch('fetch',{request:{method:'GET',url:'https://app.test/workspace-design.css?v='+version}});
    assert.equal(response.headers.get('content-type'),'text/css');
  }
  const rows=[...h.stores.values()][0];
  assert.equal([...rows.keys()].filter(key=>key.startsWith('/workspace-design.css')).length,1);
});

test('offline navigation reads the current shell rather than unrelated older caches',async()=>{
  const h=harness({offline:true});
  const rows=await h.open('command-centre-shell-v10.33.7-launch-ui-storage');
  await rows.put('/index.html',new Response('current shell',{headers:{'content-type':'text/html'}}));
  const response=await h.dispatch('fetch',{request:{method:'GET',mode:'navigate',url:'https://app.test/'}});
  assert.equal(await response.text(),'current shell');
});
