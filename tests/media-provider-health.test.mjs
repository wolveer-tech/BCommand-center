import test from 'node:test';
import assert from 'node:assert/strict';
import {probeMediaProvider} from '../media-provider-health.js';
test('provider health identifies upstream server failures without claiming video playback works',async()=>{
 let options;assert.deepEqual(await probeMediaProvider('https://provider.test/watch/550',async(url,opts)=>{options=opts;return {status:522};}),{state:'unavailable',status:522});
 assert.equal(options.method,'HEAD');assert.equal(options.redirect,'manual');
 assert.deepEqual(await probeMediaProvider('https://provider.test/watch/550',async()=>({status:200})),{state:'available',status:200});
 assert.deepEqual(await probeMediaProvider('https://provider.test/watch/550',async()=>({status:403})),{state:'unknown',status:403});
});
test('a timeout or network error remains unknown instead of inventing a provider outage',async()=>{
 assert.deepEqual(await probeMediaProvider('https://provider.test',async()=>{throw Error('network');}),{state:'unknown',status:null});
 assert.deepEqual(await probeMediaProvider('https://provider.test',async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))),5),{state:'unknown',status:null});
});
