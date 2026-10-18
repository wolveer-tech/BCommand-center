import test from 'node:test';
import assert from 'node:assert/strict';
import {asuraRequest,parseAsuraSearch,parseAsuraChapters,parseAsuraPages} from '../asura-reader.js';
import {searchHtml,chaptersHtml,pagesHtml} from './fixtures/asura.mjs';
const base='https://asurascans.com/comics/test-title';
test('Asura search extracts titles and safe covers, deduplicating title links',()=>{const result=parseAsuraSearch(searchHtml);assert.equal(result.length,1);assert.equal(result[0].title,'Test & Title');assert.equal(result[0].source,'asura');assert.match(result[0].cover,/cdn.asurascans.com/)});
test('Asura chapters sort numerically and exclude duplicates and other series',()=>{assert.deepEqual(parseAsuraChapters(chaptersHtml,base).map(c=>c.chapter),['2','10'])});
test('Asura images follow page order, excluding duplicates, scripts and unrelated hosts',()=>{assert.deepEqual(parseAsuraPages(pagesHtml,base).map(p=>p.split('/').at(-1)),['001.webp','002.webp'])});
test('Asura search encodes the title and requests public HTML without following arbitrary redirects',async()=>{
 let called;const r=await asuraRequest(new URL('https://app.test/api/manga/search?q=Test%20%26%20Title'),async(url,options)=>{called=new URL(url);assert.equal(options.redirect,'manual');return new Response(searchHtml)});
 assert.equal(called.hostname,'asurascans.com');assert.equal(called.pathname,'/browse');assert.equal(called.searchParams.get('q'),'Test & Title');assert.equal(r.results.length,1);
});
test('Asura canonical same-site redirects preserve the updated series chapter paths',async()=>{
 let calls=0;const r=await asuraRequest(new URL('https://app.test/api/manga/chapters?id=%2Fcomics%2Fold-title'),async()=>++calls===1?new Response(null,{status:302,headers:{location:base}}):new Response(chaptersHtml));
 assert.equal(calls,2);assert.equal(r.chapters[0].id,'/comics/test-title/chapter/2');assert.equal(r.nextOffset,null);
});
test('Asura rejects external redirects without fetching the destination',async()=>{
 let calls=0;await assert.rejects(asuraRequest(new URL('https://app.test/api/manga/search?q=test'),async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://other.example/'}})}),/Unsupported Asura/);assert.equal(calls,1);
});
test('Asura rejects arbitrary IDs, traversal and unsupported languages before fetching',async()=>{
 for(const [endpoint,id,extra] of [['chapters','https://other.example/',''],['chapters','/comics/a/../b',''],['pages','/comics/a/chapter/1?x=1',''],['chapters','/comics/test-title','&language=ja']])await assert.rejects(asuraRequest(new URL('https://app.test/api/manga/'+endpoint+'?id='+encodeURIComponent(id)+extra),()=>assert.fail('Unexpected fetch')));
});
test('Asura page endpoint exposes ordered safe images and an explicit empty-page error',async()=>{
 const url=new URL('https://app.test/api/manga/pages?id=%2Fcomics%2Ftest-title%2Fchapter%2F2');const r=await asuraRequest(url,async()=>new Response(pagesHtml));assert.equal(r.pages.length,2);assert.deepEqual(r.originalPages,[]);
 await assert.rejects(asuraRequest(url,async()=>new Response('<h1>No images</h1>')),/did not provide readable/);
});
test('Asura reports upstream rate limits and access failures',async()=>{
 for(const status of [429,403])await assert.rejects(asuraRequest(new URL('https://app.test/api/manga/search?q=test'),async()=>new Response('',{status})),status===429?/busy/:/HTTP 403/);
});
