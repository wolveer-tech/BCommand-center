import test from 'node:test';
import assert from 'node:assert/strict';
import {comixRequest,parseComixSearch} from '../comix-reader.js';
const {parse}=globalThis.CommandCentreComixLinks;
const url=path=>new URL('https://app.test/api/manga/'+path);
test('Comix title and chapter links validate both official domains and retain stable identities',()=>{
 const a=parse('https://comix.to/title/ab123-a-story/456-chapter-12','A story');
 const b=parse('https://comix.ws/title/ab123-a-story/456-chapter-12','A story');
 assert.equal(a.series.id,b.series.id);assert.equal(a.chapter.chapter,'12');assert.equal(a.series.readingMode,'source');
 for(const value of ['https://comix.to.attacker.test/title/a','http://comix.to/title/a','https://comix.to:444/title/a','https://user@comix.to/title/a','https://comix.to/title/../api','javascript:alert(1)'])assert.throws(()=>parse(value));
});
test('Comix link search works without bypassing or contacting a protected API',async()=>{
 const result=await comixRequest(url('search?q='+encodeURIComponent('https://comix.to/title/ab-a-story')),()=>assert.fail('No network needed'));
 assert.equal(result.results[0].source,'comix');assert.equal(result.results[0].title,'a story');
});
test('public Comix HTML search uses only title links and excludes foreign hosts and chapters',()=>{
 const result=parseComixSearch('<a href="/title/ab-a-story"><img alt="A story"></a><a href="/title/ab-a-story/33-chapter-1">Chapter 1</a><a href="https://evil.test/title/b">Other</a>');
 assert.equal(result.length,1);assert.equal(result[0].title,'A story');
});
test('Comix falls back to its other domain on access failure and reports browser checks honestly',async()=>{
 const calls=[];await assert.rejects(comixRequest(url('search?q=Story'),async address=>{calls.push(new URL(address).hostname);return new Response('<title>Just a moment...</title>',{status:403});}),error=>error.status===503&&error.externalUrls.length===2&&/browser check/.test(error.message));
 assert.deepEqual(calls,['comix.to','comix.ws']);
});
test('Comix chapter access supplies a source-reader action instead of fake page images',async()=>{
 await assert.rejects(comixRequest(url('pages?id='+encodeURIComponent('/title/ab-a-story/33-chapter-1')),()=>assert.fail('No protected API call')),error=>error.status===503&&error.externalUrls[0]==='https://comix.to');
});
