import test from 'node:test';
import assert from 'node:assert/strict';
import {mangaKatanaRequest,parseMangaKatanaSearch,parseMangaKatanaChapters,parseMangaKatanaPages} from '../mangakatana-reader.js';
import {mangaRequest} from '../manga-reader.js';
import {searchHtml,chaptersHtml,pagesHtml} from './fixtures/mangakatana.mjs';
const base='https://mangakatana.com/manga/test-story.42',url=path=>new URL('https://app.test/api/manga/'+path),html=value=>new Response(value,{headers:{'content-type':'text/html; charset=utf-8'}});

test('MangaKatana search uses catalogue titles and covers, excluding duplicate, sidebar and script links',()=>{
 const r=parseMangaKatanaSearch(searchHtml);assert.deepEqual(r.map(x=>x.title),['Test & Story','Second & Story']);assert.equal(r[0].source,'mangakatana');assert.equal(r[0].status,'Ongoing');assert.equal(r[0].description,'A story.');assert.equal(r[0].cover,'https://mangakatana.com/imgs/cover/a/cover.jpg');assert.equal(r[1].cover,'');
});
test('MangaKatana single-match redirects can return a title rather than a catalogue',async()=>{
 let calls=0;const r=await mangaKatanaRequest(url('search?q=test'),async()=>++calls===1?new Response(null,{status:302,headers:{location:base}}):html(chaptersHtml+'<meta property="og:image" content="https://mangakatana.com/imgs/cover/a/cover.webp">'));
 assert.equal(r.results[0].title,'Test & Story');assert.equal(r.results[0].id,'/manga/test-story.42');assert.match(r.results[0].cover,/cover.webp$/);
});
test('MangaKatana chapters preserve zero and decimal numbering in ascending order and exclude other titles',()=>{
 const r=parseMangaKatanaChapters(chaptersHtml,base);assert.deepEqual(r.map(x=>x.chapter),['0','2','2.5','10']);assert.equal(r[2].title,'Bonus & more');assert.equal(r[1].url,base+'/c2');
});
test('MangaKatana reads the literal public page array in order without running upstream code',()=>{
 assert.deepEqual(parseMangaKatanaPages(pagesHtml),['https://i1.mangakatana.com/token/test%3At/0.jpg','https://i1.mangakatana.com/token/test%3At/1.jpg']);
 assert.deepEqual(parseMangaKatanaPages(`<script>var thzq=[fetch('https://attacker.test/')];</script>`),[]);
 assert.deepEqual(parseMangaKatanaPages(`<script>var thzq=['https://i1.mangakatana.com.attacker.test/token/a/1.jpg'];</script>`),[]);
 assert.deepEqual(parseMangaKatanaPages(`<script>var thzq=['https://i1.mangakatana.com@127.0.0.1/token/a/1.jpg'];</script>`),[]);
 assert.deepEqual(parseMangaKatanaPages(`<script>var thzq=['https://i1.mangakatana.com:8443/token/a/1.jpg'];</script>`),[]);
 assert.deepEqual(parseMangaKatanaPages(`<script>var thzq=['https://i1.mangakatana.com/token/a/1.jpg'];</script>`.replace('<script>','<!--<script>')+'-->'),[]);
});
test('MangaKatana direct reader image markup excludes covers, ads and foreign hosts',()=>{
 assert.deepEqual(parseMangaKatanaPages(`<img src="https://i1.mangakatana.com/token/ad/0.jpg"><div id="imgs"><div><img data-src="https://i2.mangakatana.com/manga/a/1.webp"><img data-src="https://attacker.test/p.jpg"><img src="https://mangakatana.com/imgs/cover/a/c.jpg"></div></div>`),['https://i2.mangakatana.com/manga/a/1.webp']);
});
test('MangaKatana routes through the manga API, encodes search and uses manual same-site redirects',async()=>{
 let called;const r=await mangaRequest(url('search?source=mangakatana&q=Test%20%26%20Story'),async(u,options)=>{called=new URL(u);assert.equal(options.redirect,'manual');return html(searchHtml)});
 assert.equal(called.hostname,'mangakatana.com');assert.equal(called.searchParams.get('search'),'Test & Story');assert.equal(called.searchParams.get('search_by'),'m_name');assert.equal(r.source,'MangaKatana');assert.equal(r.results.length,2);
});
test('MangaKatana endpoints return complete chapter lists and ordered page images',async()=>{
 const chapters=await mangaKatanaRequest(url('chapters?id='+encodeURIComponent('/manga/test-story.42')),async()=>html(chaptersHtml));assert.equal(chapters.nextOffset,null);assert.equal(chapters.total,4);
 const pages=await mangaKatanaRequest(url('pages?id='+encodeURIComponent('/manga/test-story.42/c2.5')),async()=>html(pagesHtml));assert.equal(pages.pages.length,2);assert.deepEqual(pages.originalPages,[]);assert.equal(pages.url,base+'/c2.5');
});
test('MangaKatana rejects external, private, credentialed and non-reader redirects before following them',async()=>{
 for(const location of ['https://attacker.test/','https://mangakatana.com.attacker.test/','http://mangakatana.com/','https://user:pass@mangakatana.com/','https://mangakatana.com:8443/','https://127.0.0.1/','https://mangakatana.com/static/private']){
  let calls=0;await assert.rejects(mangaKatanaRequest(url('search?q=test'),async()=>{calls++;return new Response(null,{status:302,headers:{location}})}),/Unsupported MangaKatana/);assert.equal(calls,1);
 }
});
test('MangaKatana rejects arbitrary IDs, encoded traversal, blank searches and unsupported languages before fetching',async()=>{
 for(const query of ['search?q=','chapters?id=https://attacker.test/','chapters?id='+encodeURIComponent('/manga/a.1/../b.2'),'pages?id='+encodeURIComponent('/manga/a.1/c1?url=https://attacker.test'),'pages?id='+encodeURIComponent('/manga/a.1/%63%31'),'chapters?id=/manga/a.1&language=ja','unknown'])await assert.rejects(mangaKatanaRequest(url(query),()=>assert.fail('Unexpected fetch')));
});
test('MangaKatana rate limits, oversized pages, access failures and unavailable reader data produce explicit errors',async()=>{
 for(const status of [429,403,503])await assert.rejects(mangaKatanaRequest(url('search?q=test'),async()=>new Response('',{status})),status===429?/busy/:new RegExp('HTTP '+status));
 await assert.rejects(mangaKatanaRequest(url('search?q=test'),async()=>html('<h1>Checking browser</h1>')),/search is unavailable/);
 await assert.rejects(mangaKatanaRequest(url('search?q=test'),async()=>new Response('oops',{headers:{'content-type':'application/json'}})),/unsupported page/);
 await assert.rejects(mangaKatanaRequest(url('search?q=test'),async()=>new Response('',{headers:{'content-type':'text/html','content-length':String(7*1024*1024)}})),/too large/);
 await assert.rejects(mangaKatanaRequest(url('pages?id=/manga/a.1/c1'),async()=>html('<h1>No pages</h1>')),/readable page images/);
 await assert.rejects(mangaKatanaRequest(url('chapters?id=/manga/a.1'),async()=>html('<h1>No chapters</h1>')),/chapter list/);
 const empty=await mangaKatanaRequest(url('search?q=no-match'),async()=>html('<div id="book_list">No results</div>'));assert.deepEqual(empty.results,[]);
});
