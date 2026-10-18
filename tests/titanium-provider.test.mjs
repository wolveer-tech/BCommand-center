import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTitaniumListing,parsePortalFeed,fetchTitaniumSports,resolveTitaniumSource} from '../titanium-provider.js';
const card=(file,name='Alpha &amp; Beta')=>`<a class="box" href="${file}" data-event-id="event"><img src="match.jpg"><div class="countdown" data-date="2026-10-14T19:00:00.000Z"></div><span class="title-text">${name}</span><div class="box-meta">League</div></a>`;
const listing=card('footballevent1.html')+card('footballevent1b.html');
const portal={streams:[{category:'Football',streams:[{id:'a',name:'Backup match',always_live:'1',sources:[{source:'admin',id:'match-a'}]}]},{category:'Tennis',streams:[{name:'Court',always_live:'1',sources:[{source:'hotel',id:'court-a'}]}]}]};
test('Titanium keeps match metadata and groups main/alternate players without duplicate cards',()=>{
 const streams=parseTitaniumListing(listing+card('https://evil.example/event.html')+card('../footballevent2.html'));
 assert.equal(streams.length,1);assert.equal(streams[0].name,'Alpha & Beta');assert.equal(streams[0].source_refs.length,2);assert.equal(streams[0].match_timestamp,1792004400);
 assert.equal(streams[0].thumbnail_url,'https://titaniumstream.pages.dev/match.jpg');
});
test('StreamPortal categories stay separate and expired/empty entries are excluded',()=>{
 const data=structuredClone(portal);data.streams[0].streams.push({name:'Expired',starts_at:10,ends_at:20,sources:[{source:'admin',id:'old'}]},{name:'Empty',sources:[]});
 assert.deepEqual(parsePortalFeed(data,'soccer',100).map(s=>s.name),['Backup match']);
 assert.deepEqual(parsePortalFeed(data,'tennis',100).map(s=>s.name),['Court']);assert.equal(parsePortalFeed(data,'athletics',100).length,0);
});
test('main is preferred, with bounded backup on error or an empty listing',async()=>{
 for(const main of ['ok','empty','error']){
  const calls=[];const result=await fetchTitaniumSports('soccer',{fetcher:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');assert.ok(options.signal);if(url.includes('titanium')){if(main==='error')throw Error('offline');return new Response(main==='ok'?listing:'No events');}return Response.json(portal);}});
  assert.equal(result.site,main==='ok'?'main':'backup');assert.equal(calls.length,main==='ok'?1:2);
 }
});
test('provider redirects are rejected without following a different origin',async()=>{
 const calls=[];const result=await fetchTitaniumSports('soccer',{fetcher:async url=>{calls.push(url);return url.includes('titanium')?new Response(null,{status:302,headers:{location:'https://unrelated.example'}}):Response.json(portal);}});
 assert.equal(result.site,'backup');assert.equal(calls.length,2);assert.equal(calls.some(url=>url.includes('unrelated')),false);
});
test('the main site canonical HTML redirect is followed only within its exact origin',async()=>{
 const calls=[];const result=await fetchTitaniumSports('soccer',{fetcher:async url=>{calls.push(url);return url.endsWith('.html')?new Response(null,{status:301,headers:{location:'/football'}}):new Response(listing);}});
 assert.equal(result.site,'main');assert.deepEqual(calls,['https://titaniumstream.pages.dev/football.html','https://titaniumstream.pages.dev/football']);
 let count=0;await assert.rejects(resolveTitaniumSource('titanium','footballevent1.html',{fetcher:async()=>{count++;return new Response(null,{status:301,headers:{location:'/loop'}});}}),/too many/);assert.equal(count,3);
});
test('manual backup and sports not on the main site go directly to StreamPortal',async()=>{
 for(const [category,backup] of [['soccer',true],['tennis',false]]){const calls=[];const result=await fetchTitaniumSports(category,{backup,fetcher:async url=>{calls.push(url);return Response.json(portal);}});assert.equal(calls.length,1);assert.match(calls[0],/streamportal1111/);assert.equal(result.site,'backup');assert.equal(result.streams.length,1);}
});
test('Titanium resolves observed player hosts and ignores chat/unrelated iframe URLs',async()=>{
 const result=await resolveTitaniumSource('titanium','footballevent1.html',{fetcher:async()=>new Response('<iframe src="https://chat.example/widget"></iframe><iframe src="https://taifood-blog.asia/embed/match"></iframe>')});
 assert.equal(result.url,'https://taifood-blog.asia/embed/match');
 await assert.rejects(resolveTitaniumSource('titanium','../secret',{fetcher:()=>{throw Error('must not fetch');}}),/Invalid Titanium/);
});
test('backup resolves its array response, encodes references and strictly validates player URLs',async()=>{
 let endpoint;const result=await resolveTitaniumSource('portal:admin','match&x=1',{fetcher:async url=>{endpoint=new URL(url);return Response.json([{embedUrl:'https://embed.st.attacker.example/x'},{embedUrl:'http://embed.st/x'},{embedUrl:'https://embed.st/x',language:'en',hd:true}]);}});
 assert.equal(endpoint.searchParams.get('id'),'match&x=1');assert.equal(endpoint.searchParams.has('x'),false);assert.equal(result.url,'https://embed.st/x');assert.equal(result.sources.length,1);
 await assert.rejects(resolveTitaniumSource('portal:admin','match',{fetcher:async()=>Response.json([{embedUrl:'https://unknown.example/x'}])}),/no supported live player/);
});
