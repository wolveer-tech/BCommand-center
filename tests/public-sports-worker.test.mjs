import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('public sports feeds run with actual Cloudflare fetch validation',async t=>{
 let redirect=false;const calls=[];
 const bundle=await build({entryPoints:['sports-providers.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const mf=new Miniflare(convertV4MiniflareOptions({name:'sports-feed-runtime',modules:true,compatibilityDate:'2026-08-31',script:bundle.outputFiles[0].text+`\nexport default {async fetch(request){try{return Response.json(await fetchPublicSports(new URL(request.url).searchParams.get('provider'),'soccer'));}catch(error){return Response.json({error:error.message},{status:502});}}}`,outboundService:async request=>{
  const url=new URL(request.url);calls.push(url.hostname);if(redirect)return new Response(null,{status:302,headers:{location:'https://unrelated.example/'}});
  assert.ok(['matchora.to','api.ppv.tj','api.ppv.st','tim-streams.com'].includes(url.hostname));
  return Response.json(url.hostname==='matchora.to'?{events:[{id:'12',sport:'Soccer',home:'Home',away:'Away',embed_url:'https://matchora.to/embed/match/12'}]}:url.hostname==='tim-streams.com'?{genres:[{id:1,name:'Soccer'}],events:[{url:'home-v-away',name:'Home v Away',genre:1,time:'2026-10-24T07:30',streams:[{name:'Player',url:'https://ehgembxe.cfd/abcd-123'}]}]}:{streams:[{category:'Football',streams:[{id:34,name:'Match',iframe:'https://taifood-blog.asia/embed/match'}]}]});
 }}));t.after(()=>mf.dispose());
 await t.test('Matchora, PPV and TimStreams accept Worker-compatible request options',async()=>{
  for(const provider of ['matchora','ppv','timstreams']){const response=await mf.dispatchFetch('https://test/?provider='+provider),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.streams.length,1);}
 });
 await t.test('redirects fail without contacting the redirect destination',async()=>{
  redirect=true;const response=await mf.dispatchFetch('https://test/?provider=matchora'),data=await response.json();assert.equal(response.status,502);assert.match(data.error,/302/);assert.equal(calls.includes('unrelated.example'),false);
 });
});
