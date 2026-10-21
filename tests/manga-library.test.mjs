import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/manga-library.js';
const {merge,history}=globalThis.CommandCentreMangaLibrary;
const series={id:'same-id',source:'asura',title:'A story',url:'https://asurascans.com/comics/a',cover:'https://cdn.asurascans.com/cover.jpg'};
const entry=(id='one',time=1,page=1)=>({...series,chapter:{id,chapter:id},page,pageCount:12,readAt:time});
test('favourites survive JSON backup round-trips and keep identical IDs from different sources separate',()=>{
 const original=merge({}, {favourites:[{...series,savedAt:1},{...series,source:'mangadex',savedAt:2}]});
 assert.equal(original.favourites.length,2);
 const restored=merge(original,JSON.parse(JSON.stringify(original)));assert.equal(restored.favourites.length,2);
 assert.equal(restored.favourites[0].source,'mangadex');
});
test('reading history deduplicates per chapter and merges the most recent saved page',()=>{
 const current=merge({}, {history:[entry('one',10,3),entry('two',20,2)]});
 const restored=merge(current,{history:[entry('one',30,8),entry('two',5,1)]});
 assert.equal(restored.history.length,2);assert.equal(restored.history[0].page,8);assert.equal(restored.history[1].page,2);
});
test('history keeps the newest 200 chapters and validates imported data',()=>{
 const current=merge({}, {history:Array.from({length:220},(_,i)=>entry(String(i),i+1))});
 assert.equal(current.history.length,200);assert.equal(current.history.at(-1).readAt,21);
 const row=history({...entry(),page:99,pageCount:4,readAt:Infinity,url:'javascript:alert(1)',cover:'data:text/html,hi'});
 assert.equal(row.page,4);assert.ok(Number.isFinite(row.readAt));assert.equal(row.url,'');assert.equal(row.cover,'');
 assert.equal(merge({}, {favourites:[null,{id:'bad',source:'unknown'}],history:[null,series]}).history.length,0);
});
test('deletions sync across devices and deliberate re-additions are kept',()=>{
 const old=merge({}, {favourites:[{...series,savedAt:1}],history:[entry('one',2,3)]});
 let phone=globalThis.CommandCentreMangaLibrary.remove(old,'favourites',old.favourites[0]);
 phone=globalThis.CommandCentreMangaLibrary.remove(phone,'history',old.history[0]);
 assert.equal(merge(phone,old).favourites.length,0);assert.equal(merge(old,phone).history.length,0);
 const time=globalThis.CommandCentreMangaLibrary.timestamp(phone,'favourites',globalThis.CommandCentreMangaLibrary.seriesKey(series));
 assert.equal(merge(phone,{favourites:[{...series,savedAt:time}]}).favourites.length,1);
});
test('Comix saved chapter links survive account/backup normalisation without pretending to track pages',()=>{
 const saved=merge({}, {history:[{...entry(),source:'comix',id:'/title/a-story',readingMode:'source'}]});
 assert.equal(saved.history[0].readingMode,'source');
});
test('MangaKatana favourites and page progress survive account/backup merge and stay separate from other sources',()=>{
 const katana={...series,id:'/manga/a-story.42',source:'mangakatana',url:'https://mangakatana.com/manga/a-story.42'};
 const original=merge({}, {favourites:[{...katana,savedAt:5}, {...katana,source:'asura',savedAt:4}],history:[{...katana,chapter:{id:katana.id+'/c2.5',chapter:'2.5',url:katana.url+'/c2.5'},page:3,pageCount:15,readAt:6}]});
 const restored=merge({},JSON.parse(JSON.stringify(original)));assert.equal(restored.favourites.length,2);assert.equal(restored.history[0].source,'mangakatana');assert.equal(restored.history[0].page,3);assert.equal(restored.history[0].chapter.chapter,'2.5');
});
