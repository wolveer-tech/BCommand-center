import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {searchHtml,chaptersHtml,pagesHtml} from './fixtures/asura.mjs';
import * as katana from './fixtures/mangakatana.mjs';

test('manga requests run in the actual Workers runtime',async t=>{
 const id='00000000-0000-4000-8000-000000000001',calls=[];
 const bundle=await build({entryPoints:['manga-reader.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const mf=new Miniflare(convertV4MiniflareOptions({name:'manga-worker-test',modules:true,compatibilityDate:'2026-08-31',
  script:bundle.outputFiles[0].text+'\nexport default {fetch(request,env,ctx){return handleManga(request,ctx)}}',
  outboundService:async request=>{
   const url=new URL(request.url);calls.push(url);
   if(url.hostname==='asurascans.com')return new Response(url.pathname==='/browse'?searchHtml:url.pathname.includes('/chapter/')?pagesHtml:chaptersHtml,{headers:{'content-type':'text/html'}});
   if(url.hostname==='mangakatana.com')return new Response(url.pathname==='/'?katana.searchHtml:/\/c\d/.test(url.pathname)?katana.pagesHtml:katana.chaptersHtml,{headers:{'content-type':'text/html'}});
   assert.equal(url.hostname,'api.mangadex.org');
   if(url.searchParams.get('title')==='Redirect')return new Response(null,{status:302,headers:{location:'https://unrelated.example/'}});
   const data=url.pathname==='/manga'?{data:[{id,attributes:{title:{en:'Test manga'}}}]}:
    url.pathname.endsWith('/feed')?{total:1,data:[{id,attributes:{chapter:'1',pages:2}}]}:
    {baseUrl:'https://cdn.mangadex.network',chapter:{hash:'a'.repeat(32),data:['1.png','2.png'],dataSaver:['1.jpg','2.jpg']}};
   return new Response(JSON.stringify({result:'ok',...data}),{headers:{'content-type':'application/json'}});
  }}));
 t.after(()=>mf.dispose());
 async function call(path){const response=await mf.dispatchFetch('https://app.test/api/manga/'+path);return {status:response.status,data:await response.json()};}
 await t.test('search works with Cloudflare fetch redirect validation',async()=>{const r=await call('search?q=Title');assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.results[0].title,'Test manga')});
 await t.test('chapter requests work with Cloudflare fetch redirect validation',async()=>{const r=await call('chapters?id='+id);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.chapters[0].pages,2)});
 await t.test('page requests work with Cloudflare fetch redirect validation',async()=>{const r=await call('pages?id='+id);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.pages.length,2)});
 await t.test('upstream redirects are rejected without following another host',async()=>{const before=calls.length,r=await call('search?q=Redirect');assert.equal(r.status,502);assert.match(r.data.error,/HTTP 302/);assert.equal(calls.length,before+1)});
 await t.test('Asura search, chapters and pages run with Workers fetch validation',async()=>{
  const search=await call('search?source=asura&q=test');assert.equal(search.status,200,JSON.stringify(search.data));assert.equal(search.data.results[0].title,'Test & Title');
  const chapters=await call('chapters?source=asura&id=%2Fcomics%2Ftest-title');assert.equal(chapters.status,200,JSON.stringify(chapters.data));assert.equal(chapters.data.chapters.length,2);
  const pages=await call('pages?source=asura&id=%2Fcomics%2Ftest-title%2Fchapter%2F2');assert.equal(pages.status,200,JSON.stringify(pages.data));assert.equal(pages.data.pages.length,2);
 });
 await t.test('MangaKatana search, chapters and pages run with Workers fetch validation',async()=>{
  const search=await call('search?source=mangakatana&q=test');assert.equal(search.status,200,JSON.stringify(search.data));assert.equal(search.data.results[0].title,'Test & Story');
  const chapters=await call('chapters?source=mangakatana&id=%2Fmanga%2Ftest-story.42');assert.equal(chapters.status,200,JSON.stringify(chapters.data));assert.equal(chapters.data.total,4);
  const pages=await call('pages?source=mangakatana&id=%2Fmanga%2Ftest-story.42%2Fc2.5');assert.equal(pages.status,200,JSON.stringify(pages.data));assert.equal(pages.data.pages.length,2);
 });
});
