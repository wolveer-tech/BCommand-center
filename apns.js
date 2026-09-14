const encoder=new TextEncoder();
let cachedSigner={fingerprint:'',key:null,token:'',expiresAt:0};

function base64url(value){
  const bytes=value instanceof Uint8Array?value:encoder.encode(String(value));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function privateKeyBytes(pem){
  const compact=String(pem||'').replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
  if(!compact)throw new Error('The APNs private key is missing.');
  const binary=atob(compact),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

export function apnsSettings(env={}){
  const raw=env?.APNS_CONFIG;
  let packed={};
  if(raw&&typeof raw==='object'&&typeof raw.get!=='function')packed=raw;
  else if(String(raw||'').trim()){
    const text=String(raw).trim();
    try{packed=JSON.parse(text)}catch{
      const parts=text.includes('\n')?text.replace(/\r/g,'').split('\n') : text.split('|');
      const keyId=String(parts.shift()||'').trim(),teamId=String(parts.shift()||'').trim();
      packed={keyId,teamId,privateKey:parts.join(text.includes('\n')?'\n':'|').trim()};
    }
  }
  return {
    keyId:String(packed.keyId||packed.key_id||packed.APNS_KEY_ID||env?.APNS_KEY_ID||'').trim(),
    teamId:String(packed.teamId||packed.team_id||packed.APNS_TEAM_ID||env?.APNS_TEAM_ID||'').trim(),
    privateKey:String(packed.privateKey||packed.private_key||packed.APNS_PRIVATE_KEY||env?.APNS_PRIVATE_KEY||''),
    bundleId:String(packed.bundleId||packed.bundle_id||packed.APNS_BUNDLE_ID||env?.APNS_BUNDLE_ID||'tech.wolveer.commandcentre.native').trim(),
    environment:String(packed.environment||packed.APNS_ENVIRONMENT||env?.APNS_ENVIRONMENT||'production').trim().toLowerCase()
  };
}

export function apnsConfigured(env){
  const settings=apnsSettings(env);
  return !!(settings.keyId&&settings.teamId&&settings.privateKey);
}

async function providerToken(env,settings=apnsSettings(env)){
  if(!(settings.keyId&&settings.teamId&&settings.privateKey))throw new Error('APNs provider credentials are not configured.');
  const fingerprint=`${settings.keyId}:${settings.teamId}:${settings.privateKey.slice(-48)}`;
  const now=Math.floor(Date.now()/1000);
  if(cachedSigner.fingerprint===fingerprint&&cachedSigner.token&&cachedSigner.expiresAt>now+60)return cachedSigner.token;
  let key=cachedSigner.fingerprint===fingerprint?cachedSigner.key:null;
  if(!key){
    key=await crypto.subtle.importKey('pkcs8',privateKeyBytes(settings.privateKey),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  }
  const header=base64url(JSON.stringify({alg:'ES256',kid:settings.keyId}));
  const claims=base64url(JSON.stringify({iss:settings.teamId,iat:now}));
  const input=`${header}.${claims}`;
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(input)));
  const token=`${input}.${base64url(signature)}`;
  cachedSigner={fingerprint,key,token,expiresAt:now+50*60};
  return token;
}

export async function sendAPNSNotification(row,env){
  const deviceToken=String(row?.apnsToken||row?.apns_token||'').trim().toLowerCase();
  if(!/^[a-f0-9]{32,256}$/.test(deviceToken))throw new Error('The APNs device token is invalid.');
  const settings=apnsSettings(env),topic=settings.bundleId;
  if(!/^[A-Za-z0-9.-]{3,200}$/.test(topic))throw new Error('APNS_BUNDLE_ID is invalid.');
  const sandbox=settings.environment==='sandbox';
  const endpoint=`https://${sandbox?'api.sandbox.push.apple.com':'api.push.apple.com'}/3/device/${deviceToken}`;
  const target=String(row?.url||'/').slice(0,500);
  const collapse=String(row?.id||'command-centre').replace(/[^A-Za-z0-9._-]/g,'-').slice(0,64)||'command-centre';
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{
      authorization:`bearer ${await providerToken(env,settings)}`,
      'content-type':'application/json',
      'apns-topic':topic,
      'apns-push-type':'alert',
      'apns-priority':'10',
      'apns-expiration':'0',
      'apns-collapse-id':collapse
    },
    body:JSON.stringify({aps:{alert:{title:String(row?.title||'Command Centre').slice(0,140),body:String(row?.body||'You have an update.').slice(0,500)},sound:'default','thread-id':target.includes('messages')?'messages':target.includes('transfers')?'transfers':'command-centre'},url:target})
  });
  if(response.ok)return {ok:true};
  const payload=await response.json().catch(()=>({}));
  const reason=String(payload?.reason||`HTTP ${response.status}`);
  const error=new Error(`APNs ${reason}`);error.status=response.status;error.reason=reason;
  error.invalidToken=response.status===410||['BadDeviceToken','DeviceTokenNotForTopic','Unregistered'].includes(reason);
  throw error;
}
