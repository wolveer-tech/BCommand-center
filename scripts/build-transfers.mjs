import { transform } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const source=readFileSync('client/transfers-client.js','utf8')
  .replace("import { createSHA256, createMD5 } from 'hash-wasm';",'const {createSHA256,createMD5}=hashwasm;')
  .replace('export async function hashFile','async function hashFile');
const result=await transform(source,{format:'iife',target:['safari16','chrome110','edge110'],minify:true});
const hashes=readFileSync('node_modules/hash-wasm/dist/sha256.umd.min.js','utf8')+'\n'+readFileSync('node_modules/hash-wasm/dist/md5.umd.min.js','utf8');
writeFileSync('public/transfers.bundle.js',hashes+'\n'+result.code);
console.log('Transfers browser bundle built.');
const messages=await transform(readFileSync('client/messages-client.js','utf8'),{format:'iife',target:['safari16','chrome110','edge110'],minify:true});
writeFileSync('public/messages.bundle.js',messages.code);
console.log('Messages browser bundle built.');
