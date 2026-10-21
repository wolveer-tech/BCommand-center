// Inspect binding names without printing values. --apply removes one verified redundant default.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const auth=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'auth','token','--json'],{encoding:'utf8',windowsHide:true});
if(auth.status!==0)throw Error('Cloudflare authentication is unavailable. No settings were changed.');
let credentials;try{credentials=JSON.parse(auth.stdout)}catch{throw Error('Could not read CLI authentication. No settings were changed.')}
if(!credentials.token)throw Error('Use the existing Wrangler OAuth or API-token login.');
const url='https://api.cloudflare.com/client/v4/accounts/1a1562661855218c589a2b06d4b609ff/workers/scripts/bcommand-center/settings';
const headers={authorization:'Bearer '+credentials.token};
async function call(init={}){const response=await fetch(url,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok||!data.success)throw Error('Cloudflare settings request failed (HTTP '+response.status+'); no credentials were printed.');return data.result}
const settings=await call(),bindings=settings.bindings;
if(!Array.isArray(bindings))throw Error('Missing binding inventory.');
console.log(`Worker has ${bindings.filter(b=>['secret_text','plain_text','json'].includes(b.type)).length} variables.`);
if(process.argv.includes('--apply')){
// This exact public default is already present in both release source and configuration.
// Removing its remote copy makes room for the encryption secret; deployment must also omit it.
const name='LIVE_PROVIDER_3_NAME',binding=bindings.find(b=>b.name===name);
if(!binding){console.log('Redundant name binding already absent.');process.exit(0)}
if(binding.type!=='plain_text'||binding.text!=='SportsindX')throw Error('Binding differs from the reviewed default; preserved unchanged.');
const worker=readFileSync('worker.js','utf8'),config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(!worker.includes("env.LIVE_PROVIDER_3_NAME||'SportsindX'")||Object.hasOwn(config.vars||{},name))throw Error('Source must retain the default and deployment config must omit the redundant binding.');
const form=new FormData();
form.set('settings',new Blob([JSON.stringify({bindings:bindings.filter(b=>b.name!==name).map(b=>['secret_text','secret_key'].includes(b.type)?{name:b.name,type:'inherit'}:b)})],{type:'application/json'}));
await call({method:'PATCH',body:form});
const checked=await call();
if(checked.bindings.some(b=>b.name===name))throw Error('The redundant binding was not removed.');
for(const b of bindings.filter(b=>b.name!==name))if(!checked.bindings.some(c=>c.name===b.name&&c.type===b.type))throw Error('Binding verification failed for '+b.name);
console.log('Removed only the redundant public provider name. All other binding names and types are preserved.');
}
