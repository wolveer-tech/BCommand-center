#!/usr/bin/env node
// Node.js 22+; no npm packages required. Tokens stay on this computer.
import { readFile, writeFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, basename, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const configPath=process.env.CC_TRANSFER_CONFIG || join(process.env.APPDATA || join(homedir(),'.config'),'CommandCentreTransfer','connection.json');
function protect(value, decrypt=false){
  if(process.platform!=='win32')return value;
  // DPAPI binds the credential to this Windows user. No token in process arguments.
  const code=decrypt ? '$s=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; [Console]::Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($s),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))' : '$s=[Console]::In.ReadToEnd(); Add-Type -AssemblyName System.Security; [Console]::Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($s),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))';
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',code],{input:value,encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw new Error('Could not access the Windows-protected device credential.');
  return result.stdout.trim();
}
async function readConfig(){const c=JSON.parse(await readFile(configPath,'utf8'));c.token=protect(c.credential,process.platform==='win32');return c;}
async function saveConfig(c){await mkdir(dirname(configPath),{recursive:true});const {token,...rest}=c;await writeFile(configPath,JSON.stringify({...rest,credential:protect(token)},null,2),{mode:0o600});}
function siteUrl(value){const url=new URL(value);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('Use your https:// Command Centre site URL.');return url.origin;}
export async function api(config,path,data,method){
  const response=await fetch(config.url+'/api/transfers'+path,{method:method||(data===undefined?'GET':'POST'),headers:{'Content-Type':'application/json',...(config.token?{Authorization:'Bearer '+config.token}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Transfer request failed.');return result;
}
async function prompt(question){const rl=createInterface({input:stdin,output:stdout});try{return(await rl.question(question)).trim();}finally{rl.close();}}
function options(args){const result={_:[]};for(let i=0;i<args.length;i++){if(args[i]==='--'){result._.push(...args.slice(i+1));break;}if(args[i].startsWith('--')){const key=args[i].slice(2);if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for --'+key);result[key]=args[++i];}else result._.push(args[i]);}return result;}
function ttl(value){const values={'1h':3600,'1d':86400,'7d':604800,'never':0};if(value!==undefined&&!(value in values))throw new Error('Expiry must be 1h, 1d, 7d or never.');return values[value??'1d'];}

export async function sendFile(config,path,settings={}){
  const file=await open(path,'r'),stat=await file.stat();let upload,completing=false;
  try{
    if(!stat.isFile())throw new Error('Choose a file. Zip folders yourself before sending.');
    upload=await api(config,'/uploads',{filename:basename(path),mime:'application/octet-stream',size:stat.size,...settings});
    const hash=createHash('sha256'),parts=[];
    for(let partNumber=1;partNumber<=upload.parts;partNumber++){
      const offset=(partNumber-1)*upload.partSize,length=Math.min(upload.partSize,stat.size-offset),buffer=Buffer.alloc(length);let filled=0;
      while(filled<length){const read=await file.read(buffer,filled,length-filled,offset+filled);if(!read.bytesRead)throw new Error('Source file changed during upload.');filled+=read.bytesRead;}
      hash.update(buffer);const md5=createHash('md5').update(buffer).digest('base64');let etag;
      for(let attempt=0;attempt<3;attempt++){
        try{const signed=await api(config,`/uploads/${upload.id}/part`,{partNumber,md5});const response=await fetch(signed.url,{method:'PUT',headers:signed.headers,body:buffer});
          if(!response.ok)throw new Error('R2 upload failed ('+response.status+').');etag=(response.headers.get('etag')||'').replaceAll('"','');if(!/^[A-Za-z0-9+\/_=-]{1,256}$/.test(etag))throw new Error('R2 did not return a valid ETag.');break;
        }catch(e){if(attempt===2)throw e;}
      }
      parts.push({partNumber,etag});console.log(`${basename(path)}: ${Math.round((offset+length)/Math.max(stat.size,1)*100)}%`);
    }
    const after=await file.stat();if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw new Error('Source file changed during upload. Try again after saving it.');
    const sha256=hash.digest('hex');completing=true;let result;
    try{result=await api(config,`/uploads/${upload.id}/complete`,{parts,sha256});}catch(first){try{result=await api(config,`/uploads/${upload.id}/complete`,{parts,sha256});}catch{throw first;}}
    console.log(`Sent ${basename(path)}\nID: ${result.item.id}\nSHA-256: ${sha256}`);return result.item;
  }catch(e){if(upload&&!completing)await api(config,'/uploads/'+upload.id,undefined,'DELETE').catch(()=>{});if(completing)e.message+=' Check Sent before resending: completion could not be confirmed.';throw e;}
  finally{await file.close();}
}

export async function download(config,itemId,target){
  const info=await api(config,`/items/${itemId}/download`,{}),destination=resolve(target||basename(info.filename)),temporary=destination+'.'+randomUUID()+'.part';
  const output=await open(temporary,'wx',0o600),hash=createHash('sha256');let bytes=0;
  try{
    const response=await fetch(info.url);if(!response.ok)throw new Error('Download failed ('+response.status+').');
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>info.size)throw new Error('Downloaded size exceeds the original.');hash.update(chunk);let offset=0;while(offset<chunk.length){const result=await output.write(chunk,offset);offset+=result.bytesWritten;}}
    if(bytes!==info.size||hash.digest('hex')!==info.sha256)throw new Error('SHA-256 verification failed. Download was not saved.');
    await output.close();
    // Refuse to overwrite an existing user file, including on Windows.
    const dest=await open(destination,'wx');await dest.close();
    try{await rename(temporary,destination);}catch(e){await unlink(destination).catch(()=>{});throw e;}
    console.log('Saved and verified: '+destination);await api(config,`/items/${itemId}/read`,{}).catch(()=>{});return destination;
  }catch(e){await output.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw e;}
}

export async function main(args){
  const command=args.shift(),opts=options(args);
  if(command==='connect'){
    const url=siteUrl(opts.url||await prompt('Command Centre site URL: ')),name=opts.name||await prompt('Device name (e.g. Home PC): '),code=await prompt('Pairing code from Transfers > Devices: ');
    const result=await api({url},'/claim',{name,code});await saveConfig({url,...result});console.log('Connected as '+result.device.name);return;
  }
  if(!command||command==='help'){console.log(`Command Centre Transfer — Node.js 22+\n\nconnect --url https://YOUR-SITE --name "Home PC"\n  Prompts for a one-use pairing code.\npair-code\ndevices\nsend --to DEVICE_ID --expires 1d -- "file.pdf" "video.mov"\nmessage --text "Restart the server" --expires 1h\nlink --url https://example.com --title "Read later"\nlist --view inbox\ndownload TRANSFER_ID --out "C:\\Downloads\\file.pdf"\ndisconnect\n\n--to is optional; omitted sends to all other paired devices.\nExpiry choices: 1h, 1d (default), 7d, never.\nYou can run these commands in the VS Code terminal.\nNo AI services or file conversion are used.`);return;}
  const config=await readConfig().catch(()=>{throw new Error('This computer is not connected. Run the connect command first.');});
  const settings={recipientId:opts.to||'all',ttl:ttl(opts.expires)};
  if(command==='send'){if(!opts._.length)throw new Error('Provide one or more file paths.');for(const path of opts._)await sendFile(config,path,settings);}
  else if(command==='message'||command==='link'){const content=command==='link'?opts.url:opts.text;if(!content)throw new Error(command==='link'?'Use --url.':'Use --text.');const r=await api(config,'/items',{kind:command,content,title:opts.title||'',...settings});console.log('Sent '+r.item.id);}
  else if(command==='devices')console.table((await api(config,'/devices')).devices);
  else if(command==='pair-code'){const r=await api(config,'/pair',{});console.log('One-use code (10 minutes): '+r.code);}
  else if(command==='list'){const r=await api(config,'/items?view='+encodeURIComponent(opts.view||'inbox'));console.table(r.items.map(t=>({id:t.id,kind:t.kind,title:t.title,from:t.sender_name,bytes:t.size})));if(r.hasMore)console.log('More items are available in the app.');}
  else if(command==='download'){if(!opts._[0])throw new Error('Provide a transfer ID.');await download(config,opts._[0],opts.out);}
  else if(command==='disconnect'){await api(config,'/devices/'+config.device.id,undefined,'DELETE');await unlink(configPath);console.log('Device disconnected.');}
  else throw new Error('Unknown command. Run help.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
