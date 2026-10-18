import{readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,existsSync,unlinkSync}from'node:fs';
import{join,resolve}from'node:path';
for(const path of ['native-ios/project.yml','codemagic.yaml'])writeFileSync(path,readFileSync(path,'utf8').replaceAll('1.13.0','1.14.0').replaceAll('CURRENT_PROJECT_VERSION: 21','CURRENT_PROJECT_VERSION: 22').replace('PWA Notification Handoff','Schoolbooks and Background Audio'));
for(const path of ['tests/foundation-v10-24.test.mjs','tests/ui-improvements.test.mjs'])writeFileSync(path,readFileSync(path,'utf8').replaceAll('1\\.13\\.0','1\\.14\\.0').replaceAll('CURRENT_PROJECT_VERSION: 21','CURRENT_PROJECT_VERSION: 22'));
const release=process.argv[2]||'10.32.0';
if(!/^10\.32\.\d+$/.test(release))throw new Error('Expected a 10.32.x release version');
const destination=resolve('artifacts/Command-Centre-v'+release+'-COPY-THIS');mkdirSync(destination,{recursive:true});
for(const relative of ['scripts/update-v10-32.mjs','scripts/finish-v10-32.mjs','public/recovery-qa.html']){const path=join(destination,relative);if(existsSync(path))unlinkSync(path);}
const excluded=new Set(['node_modules','artifacts','.git','.wrangler','.dev.vars','.env','.codex','.agents']);
for(const entry of readdirSync('.',{withFileTypes:true})){if(excluded.has(entry.name)||entry.name.endsWith('.log'))continue;cpSync(entry.name,join(destination,entry.name),{recursive:true});}
console.log(destination);
