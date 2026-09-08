import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
const html=readFileSync('public/index.html','utf8');
let scripts=0;
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(match[1].trim()){new vm.Script(match[1]);scripts++;}}
new vm.Script(readFileSync('public/transfers.bundle.js','utf8'));
JSON.parse(readFileSync('tools/browser-extension/manifest.json','utf8'));
JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
const transferIds=ids.filter(id=>id.startsWith('tr')||id==='transfersPage');
if(new Set(transferIds).size!==transferIds.length)throw new Error('Duplicate transfer HTML IDs');
// Resolve/read through Node so this check also works in restricted Windows workspaces.
const result=await build({stdin:{contents:"export { default } from './worker.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',tsconfigRaw:{},plugins:[{name:'node-file-loader',setup(build){
  build.onResolve({filter:/.*/},args=>({path:createRequire(args.importer&&args.importer!=='<stdin>'?args.importer:resolve('package.json')).resolve(args.path),namespace:'node-file'}));
  build.onLoad({filter:/.*/,namespace:'node-file'},args=>({contents:readFileSync(args.path,'utf8'),loader:'js'}));
}}]});
if(!result.outputFiles[0].text.includes('handleTransfers'))throw new Error('Transfer routes missing from Worker bundle');
console.log(`Validated ${scripts} inline script, Transfers bundle, unique transfer IDs, extension manifest and full Worker dependency bundle (${result.outputFiles[0].contents.length} bytes).`);
