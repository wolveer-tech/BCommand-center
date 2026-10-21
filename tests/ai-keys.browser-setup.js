// Disposable local UI fixture. This file is never shipped in public assets.
Object.assign(state,{noteAccountOwner:'fixture-source-owner',mangaAccountOwner:'fixture-source-owner',schoolbookProvider:'auto',deepSeekKey:'',qwenKey:''});
const fixtureFetch=window.fetch,fixtureAccount={id:'fixture-cloud-account',username:'vault-preview'};
let fixtureKeys={deepseek:{configured:false},qwen:{configured:false}};
window.fetch=async(url,init={})=>{
 if(url==='/api/accounts/me')return Response.json({account:fixtureAccount});
 if(String(url).startsWith('/api/accounts/ai-keys')){
  if(init.method==='PUT'){
   const data=JSON.parse(init.body);if(data.accountId!==fixtureAccount.id)return Response.json({error:'Account changed.'},{status:409});
   for(const name of ['deepseek','qwen'])if(data[name])fixtureKeys[name]={configured:true,model:data[name].model,...(data[name].effort?{effort:data[name].effort}:{}),updatedAt:Date.now()};
  }
  if(init.method==='DELETE')fixtureKeys[String(url).split('/').at(-1)]={configured:false};
  return Response.json({available:true,accountId:fixtureAccount.id,providers:fixtureKeys});
 }
 if(String(url).startsWith('/api/accounts/practice/')){
  if(init.headers?.['x-qwen-key']||init.headers?.authorization)throw Error('A saved credential was downloaded or resent by the browser.');
  const response=await fixtureFetch(url,init),data=await response.json(),body=init.body?JSON.parse(init.body):{};
  if(!url.endsWith('/status')){
   const pick=CommandCentreSchoolbookProviders.automatic({available:Object.fromEntries(Object.entries(fixtureKeys).filter(([,value])=>value.configured)),source:body.source,question:body.question,format:body.options?.format});
   data.ai={...pick,keySource:'account'};
  }
  return Response.json(data);
 }
 return Response.json({error:'Disabled in this disposable local fixture.'},{status:503});
};
