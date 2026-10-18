import {readFileSync,existsSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve('public'), html=readFileSync(resolve(root,'index.html'),'utf8');
const paths=new Set(['index.html','sw.js','workspace-art.svg']);
for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)){
  if(/^(?:https?:|data:)/.test(match[1]))continue;
  paths.add(match[1].split('?')[0].replace(/^\//,''));
}
for(const file of ['sports-providers.js','storage-tools.js','workspace-design.js','workspace-design.css','glass-design.css','space-motion.js','space-motion.css']){
  if(!paths.has(file)&&file!=='sports-providers.js')throw Error('Required UI asset is not linked: '+file);
  paths.add(file);
}
const base=process.argv.find(arg=>arg.startsWith('--url='))?.slice(6);
for(const file of paths){
  const path=resolve(root,file);
  if(!path.startsWith(root+sep)||!existsSync(path))throw Error('Missing asset: '+file);
  if(!base)continue;
  const response=await fetch(new URL(file,base.endsWith('/')?base:base+'/'),{cache:'no-store',signal:AbortSignal.timeout(15000)});
  const remote=Buffer.from(await response.arrayBuffer()),local=readFileSync(path),type=response.headers.get('content-type')||'';
  if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);
  if(/\.(?:css|js)$/.test(file)&&!(/\.css$/.test(file)?/text\/css/:/(?:javascript|ecmascript)/).test(type))throw Error(`${file}: wrong type ${type}`);
  // Git checkouts on Windows and Cloudflare's Linux builder can differ only
  // in line endings. Compare equivalent text while keeping binary files exact.
  const hash=data=>createHash('sha256').update(/\.(?:html|css|js|svg|json|webmanifest)$/.test(file)?data.toString('utf8').replaceAll('\r\n','\n'):data).digest('hex');
  if(hash(remote)!==hash(local))throw Error(file+': deployed content differs from this release');
}
console.log(`Verified ${paths.size} ${base?'deployed':'local'} app assets, including the complete design and launch animation.`);
