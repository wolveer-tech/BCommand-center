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

test('Atlantic builds direct movie and episode watch pages',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  const env={MEDIA_ATLANTIC_BASE_URL:'https://atlantic.st',MEDIA_ATLANTIC_ALLOWED_HOSTS:'atlantic.st'};
  assert.equal(buildMediaEmbedUrl(env,{type:'movie',id:'550',mode:'atlantic'}),'https://atlantic.st/watch/550');
  assert.equal(buildMediaEmbedUrl(env,{type:'tv',id:'1399',season:'2',episode:'3',mode:'atlantic'}),'https://atlantic.st/watch/1399/2/3');
});

test('Boomflix builds its stable TMDB title pages',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  const env={MEDIA_BOOMFLIX_BASE_URL:'https://boomflix.qzz.io',MEDIA_BOOMFLIX_ALLOWED_HOSTS:'boomflix.qzz.io'};
  assert.equal(buildMediaEmbedUrl(env,{type:'movie',id:'550',mode:'boomflix'}),'https://boomflix.qzz.io/title/movie/550');
  assert.equal(buildMediaEmbedUrl(env,{type:'tv',id:'1399',season:'2',episode:'3',mode:'boomflix'}),'https://boomflix.qzz.io/title/tv/1399');
});

test('new provider hosts require HTTPS and explicit host approval',async()=>{
  const {buildMediaEmbedUrl}=await mediaHelpers();
  assert.throws(
    ()=>buildMediaEmbedUrl({MEDIA_ATLANTIC_BASE_URL:'http://atlantic.st'},{type:'movie',id:'550',mode:'atlantic'}),
    /HTTPS/
  );
  assert.throws(
    ()=>buildMediaEmbedUrl({MEDIA_BOOMFLIX_BASE_URL:'https://boomflix.qzz.io',MEDIA_BOOMFLIX_ALLOWED_HOSTS:'example.com'},{type:'movie',id:'550',mode:'boomflix'}),
    /allowed/i
  );
});
