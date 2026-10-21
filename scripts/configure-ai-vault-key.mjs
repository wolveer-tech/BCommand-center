// Provision once. Never print or save the master key, and never rotate an existing key.
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const cli=resolve('node_modules/wrangler/bin/wrangler.js');
const listed=spawnSync(process.execPath,[cli,'secret','list','--format','json'],{encoding:'utf8',windowsHide:true});
if(listed.status!==0){process.stderr.write(listed.stderr||listed.stdout||'Could not check Worker secrets.');process.exit(1)}
let names;try{names=JSON.parse(listed.stdout)}catch{throw Error('Could not parse Worker secret names; no secret was changed.')}
if(!Array.isArray(names))throw Error('Unexpected Worker secret inventory; no secret was changed.');
if(names.some(item=>item.name==='AI_VAULT_KEY')){console.log('AI_VAULT_KEY is already configured; preserved unchanged.');process.exit(0)}
const secret=randomBytes(32).toString('base64');
const saved=spawnSync(process.execPath,[cli,'secret','put','AI_VAULT_KEY'],{input:secret+'\n',encoding:'utf8',windowsHide:true});
if(saved.status!==0){process.stderr.write(saved.stderr||'Could not save the vault master key.');process.exit(1)}
console.log('AI_VAULT_KEY configured securely. Its value was not printed or written to a file.');
