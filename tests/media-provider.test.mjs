import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

async function mediaHelpers(){
  const source=await readFile(new URL('../worker.js',import.meta.url),'utf8');
  const start=source.indexOf('function mediaBaseUrl');
  const end=source.indexOf('async function tmdbFetch',start);
  assert.ok(start>=0&&end>start,'media provider helper block exists');
  return Function(`${source.slice(start,end)}; return {buildMediaEmbedUrl};`)();
}

test('Flixer builds exact in-app movie and TV embed pages from TMDB selections',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  const env={MEDIA_FLIXER_BASE_URL:'https://flixer.gd',MEDIA_FLIXER_ALLOWED_HOSTS:'flixer.gd'};
  assert.equal(
    buildMediaEmbedUrl(env,{type:'movie',id:'550',mode:'flixer'}),
    'https://flixer.gd/watch/movie/550?embed=1'
  );
  assert.equal(
    buildMediaEmbedUrl(env,{type:'tv',id:'1399',season:'1',episode:'2',mode:'flixer'}),
    'https://flixer.gd/watch/tv/1399/1/2?embed=1'
  );
});

test('Flixer requires HTTPS and an allowed hostname',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  assert.throws(
    ()=>buildMediaEmbedUrl({MEDIA_FLIXER_BASE_URL:'http://flixer.gd'},{type:'movie',id:'550',mode:'flixer'}),
    /HTTPS/
  );
  assert.throws(
    ()=>buildMediaEmbedUrl({MEDIA_FLIXER_BASE_URL:'https://flixer.gd',MEDIA_FLIXER_ALLOWED_HOSTS:'example.com'},{type:'movie',id:'550',mode:'flixer'}),
    /allowed/i
  );
});

test('ShuttleTV uses its movie and episode watch routes',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  assert.equal(buildMediaEmbedUrl({},{type:'movie',id:'550',mode:'shuttletv'}),'https://shuttletv.su/watch/550');
  assert.equal(buildMediaEmbedUrl({},{type:'tv',id:'1399',season:'2',episode:'3',mode:'shuttletv'}),'https://shuttletv.su/watch/1399?s=2&e=3');
});

test('CineSrc uses its documented movie and episode embeds',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  assert.equal(buildMediaEmbedUrl({},{type:'movie',id:'550',mode:'cinesrc'}),'https://cinesrc.st/embed/movie/550');
  assert.equal(buildMediaEmbedUrl({},{type:'tv',id:'1399',season:'2',episode:'3',mode:'cinesrc'}),'https://cinesrc.st/embed/tv/1399?s=2&e=3');
});

test('Atlantic remains independent and removed Flystream routes cannot be used',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  assert.equal(buildMediaEmbedUrl({},{type:'movie',id:'550',mode:'atlantic'}),'https://atlantic.st/watch/550');
  assert.equal(buildMediaEmbedUrl({},{type:'tv',id:'1399',season:'2',episode:'3',mode:'atlantic'}),'https://atlantic.st/watch/1399/2/3');
  assert.throws(()=>buildMediaEmbedUrl({MEDIA_FLYSTREAM_BASE_URL:'https://flystream.net'},{type:'movie',id:'550',mode:'flystream'}),/Unsupported provider mode/);
});

test('Boomflix builds its stable TMDB title pages',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  const env={MEDIA_BOOMFLIX_BASE_URL:'https://boomflix.qzz.io',MEDIA_BOOMFLIX_ALLOWED_HOSTS:'boomflix.qzz.io'};
  assert.equal(buildMediaEmbedUrl(env,{type:'movie',id:'550',mode:'boomflix'}),'https://boomflix.qzz.io/title/movie/550');
  assert.equal(buildMediaEmbedUrl(env,{type:'tv',id:'1399',season:'2',episode:'3',mode:'boomflix'}),'https://boomflix.qzz.io/title/tv/1399');
});

test('new provider hosts require HTTPS and explicit host approval',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  for(const [mode,key,host] of [['shuttletv','SHUTTLETV','shuttletv.su'],['cinesrc','CINESRC','cinesrc.st']]){
    assert.throws(()=>buildMediaEmbedUrl({[`MEDIA_${key}_BASE_URL`]:'http://'+host},{type:'movie',id:'550',mode}),/HTTPS/);
    assert.throws(()=>buildMediaEmbedUrl({[`MEDIA_${key}_BASE_URL`]:'https://'+host+'.attacker.example',[`MEDIA_${key}_ALLOWED_HOSTS`]:host},{type:'movie',id:'550',mode}),/allowed/i);
    assert.throws(()=>buildMediaEmbedUrl({},{type:'tv',id:'1399',season:0,episode:1,mode}),/season/);
    assert.throws(()=>buildMediaEmbedUrl({},{type:'tv',id:'1399',season:1,episode:0,mode}),/episode/);
    assert.throws(()=>buildMediaEmbedUrl({},{type:'movie',id:'550/other',mode}),/numeric TMDB/);
  }
  assert.throws(
    ()=>buildMediaEmbedUrl({MEDIA_BOOMFLIX_BASE_URL:'https://boomflix.qzz.io',MEDIA_BOOMFLIX_ALLOWED_HOSTS:'example.com'},{type:'movie',id:'550',mode:'boomflix'}),
    /allowed/i
  );
});

test('Alternate uses 1Shows and Aggregator uses Anicine for exact TMDB titles and episodes',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  const env={MEDIA_EMBED_BASE_URL:'https://existing.example',MEDIA_EMBED_PATH_TORRENT:'/old-route',MEDIA_EMBED_PATH_AGG:'/old-aggregator'};
  assert.equal(buildMediaEmbedUrl(env,{type:'movie',id:550,mode:'torrent'}),'https://www.1shows.org/movies/550?streaming=true');
  assert.equal(buildMediaEmbedUrl(env,{type:'tv',id:1399,season:2,episode:3,mode:'torrent'}),'https://www.1shows.org/tv/1399?streaming=true&season=2&episode=3');
  assert.equal(buildMediaEmbedUrl({}, {type:'movie',id:550,mode:'agg'}),'https://anicine.xyz/watch/movie/550');
  assert.equal(buildMediaEmbedUrl({}, {type:'tv',id:1399,season:2,episode:3,mode:'agg'}),'https://anicine.xyz/watch/tv/1399?s=2&e=3');
  assert.equal(buildMediaEmbedUrl(env,{type:'movie',id:550,mode:'standard'}),'https://existing.example/embed?type=movie&id=550');
  for(const mode of ['torrent','agg'])assert.throws(()=>buildMediaEmbedUrl({}, {type:'tv',id:1399,season:0,episode:3,mode}),/season/);
});
