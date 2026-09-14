const encoder=new TextEncoder();
let cachedSigner={fingerprint:'',key:null,token:'',expiresAt:0};

function base64url(value){
  const bytes=value instanceof Uint8Array?value:encoder.encode(String(value));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function privateKeyBytes(pem){
  const compact=String(pem||'').replace(/\\n/g,'\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g,'');
  if(!compact)throw new Error('APNS_PRIVATE_KEY is missing.');
  const binary=atob(compact),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

export function apnsConfigured(env){
  return !!(env?.APNS_KEY_ID&&env?.APNS_TEAM_ID&&env?.APNS_PRIVATE_KEY);
}

async function providerToken(env){
  if(!apnsConfigured(env))throw new Error('APNs provider credentials are not configured.');
  const fingerprint=`${env.APNS_KEY_ID}:${env.APNS_TEAM_ID}:${String(env.APNS_PRIVATE_KEY).slice(-48)}`;
  const now=Math.floor(Date.now()/1000);
  if(cachedSigner.fingerprint===fingerprint&&cachedSigner.token&&cachedSigner.expiresAt>now+60)return cachedSigner.token;
  let key=cachedSigner.fingerprint===fingerprint?cachedSigner.key:null;
  if(!key){
    key=await crypto.subtle.importKey('pkcs8',privateKeyBytes(env.APNS_PRIVATE_KEY),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  }
  const header=base64url(JSON.stringify({alg:'ES256',kid:String(env.APNS_KEY_ID)}));
  const claims=base64url(JSON.stringify({iss:String(env.APNS_TEAM_ID),iat:now}));
  const input=`${header}.${claims}`;
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(input)));
  const token=`${input}.${base64url(signature)}`;
  cachedSigner={fingerprint,key,token,expiresAt:now+50*60};
  return token;
}

export async function sendAPNSNotification(row,env){
  const deviceToken=String(row?.apnsToken||row?.apns_token||'').trim().toLowerCase();
  if(!/^[a-f0-9]{32,256}$/.test(deviceToken))throw new Error('The APNs device token is invalid.');
  const topic=String(env.APNS_BUNDLE_ID||'tech.wolveer.commandcentre.native').trim();
  if(!/^[A-Za-z0-9.-]{3,200}$/.test(topic))throw new Error('APNS_BUNDLE_ID is invalid.');
  const sandbox=String(env.APNS_ENVIRONMENT||'production').toLowerCase()==='sandbox';
  const endpoint=`https://${sandbox?'api.sandbox.push.apple.com':'api.push.apple.com'}/3/device/${deviceToken}`;
  const target=String(row?.url||'/').slice(0,500);
  const collapse=String(row?.id||'command-centre').replace(/[^A-Za-z0-9._-]/g,'-').slice(0,64)||'command-centre';
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{
      authorization:`bearer ${await providerToken(env)}`,
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
