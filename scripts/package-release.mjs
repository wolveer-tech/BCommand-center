import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';

const release=process.argv[2];
if(!/^\d+\.\d+\.\d+$/.test(release||''))throw Error('Supply a release version, for example 10.33.7');
if(!readFileSync('public/index.html','utf8').includes(`name="cc-release" content="${release}"`))throw Error('HTML release does not match');
const destination=resolve('artifacts/Command-Centre-v'+release+'-COPY-THIS');
if(existsSync(destination))throw Error('Release directory already exists; choose a new release directory instead of overwriting');
mkdirSync(destination,{recursive:true});
const excluded=new Set(['node_modules','artifacts','.git','.wrangler','.codex','.agents','connection.json']);
const allowed=path=>{
  const name=basename(path);
  if(excluded.has(name)||name.endsWith('.log')||name.endsWith('.part'))return false;
  if(/^\.(?:env|dev\.vars)(?:\.|$)/.test(name)&&!name.endsWith('.example'))return false;
  return true;
};
for(const entry of readdirSync('.'))if(allowed(entry))cpSync(entry,join(destination,entry),{recursive:true,filter:allowed});
writeFileSync(join(destination,'UPLOAD-TO-GITHUB.txt'),`Command Centre ${release}\n\nIf GitHub also deploys to Cloudflare, upload the CONTENTS of this FULL folder to the repository root, including public, worker.js, scripts, package files, codemagic.yaml and native-ios. An iOS-only commit can otherwise redeploy the older web files left in the repository.\n\nFor a repository used ONLY by Codemagic: copy codemagic.yaml and the COMPLETE native-ios folder into the repository root. Native version is 1.16.1 (build 25).\n\nFor Cloudflare web deployment: deploy from this FULL folder with npm run deploy.\n\nThe outer Command-Centre-v${release}-COPY-THIS folder is packaging only. Its CONTENTS belong at your repository root.\n`);
console.log(destination);
