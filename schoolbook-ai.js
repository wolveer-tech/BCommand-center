import {authenticateAccount} from './accounts.js';
import {readAIKey} from './ai-vault.js';
import './public/schoolbook-practice-core.js';
import './public/schoolbook-providers.js';

const core=globalThis.CommandCentrePracticeCore;
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const string={type:'string'},strings={type:'array',items:string};
const ledgerSchema=object({account:string,currency:string,entries:{type:'array',items:object({label:string,side:{type:'string',enum:['debit','credit']},amount:{type:'number'}})}});
const questionSchema=object({type:{type:'string',enum:['multiple-choice','written','t-account']},question:string,difficulty:{type:'integer',minimum:1,maximum:5},skill:string,points:strings,options:strings,correctIndex:{type:['integer','null']},optionExplanations:strings,ledger:{anyOf:[ledgerSchema,{type:'null'}]},modelAnswer:string,hint:string,sources:{type:'array',items:object({page:{type:'integer'},quote:string})}});
const schemas={generate:object({error:{type:['string','null']},questions:{type:'array',items:questionSchema}}),mark:object({awarded:{type:'array',items:{type:'integer',enum:[0,1]}},feedback:string,improvements:strings})};

function qwenConfiguration(request,stored=null,modelOverride=null){
  const key=stored?.key||request.headers.get('x-qwen-key')||'',model=modelOverride||stored?.model||request.headers.get('x-qwen-model')||'qwen3.7-plus';
  if(!/^sk-[A-Za-z0-9_-]{8,240}$/.test(key))fail(400,'Add your QwenCloud API key in Settings → Integrations.');
  if(!globalThis.CommandCentreSchoolbookProviders.qwenModels.includes(model))fail(400,'Choose a supported QwenCloud model in Settings.');
  return {key,model,url:`https://${key.startsWith('sk-sp-')?'token-plan.':''}maas.qwencloudapi.com/compatible-mode/v1/chat/completions`};
}
async function deepSeekResponse(contract,kind,request,config){
  let body;try{body=globalThis.CommandCentreSchoolbookProviders.deepSeekBody(contract,kind==='mark',config)}catch(error){fail(400,error.message)}
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(kind==='mark'?120000:180000)]);let response;
  try{response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'manual',signal,headers:{'content-type':'application/json',authorization:`Bearer ${config.key}`},body:JSON.stringify(body)})}
  catch{fail(504,signal.aborted?'DeepSeek request stopped or timed out. Your answer and previous set are kept.':'Could not reach DeepSeek. Try again later.')}
  if(!response.ok)fail(response.status===429?429:502,({401:'DeepSeek rejected your saved key. Replace it in secure AI key settings.',402:'Your DeepSeek account needs API credit.',429:'DeepSeek credit or request limit reached. Try again later.'})[response.status]||'DeepSeek could not complete the request. Your answer is kept.');
  let data;try{data=await response.json()}catch{fail(502,'DeepSeek returned an unreadable response.')}
  const choice=data.choices?.[0],raw=choice?.message?.content;
  if(choice?.finish_reason!=='stop'||typeof raw!=='string'||raw.length>150000)fail(502,'DeepSeek returned an incomplete answer. Try fewer pages or a lower reasoning setting.');
  try{return JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))}catch{fail(502,'DeepSeek returned incomplete JSON. Your answer is kept.')}
}
async function qwenResponse(contract,kind,request,config){
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(kind==='mark'?60000:120000)]);let response;
  try{response=await fetch(config.url,{method:'POST',redirect:'manual',signal,headers:{'content-type':'application/json',authorization:`Bearer ${config.key}`},body:JSON.stringify({model:config.model,enable_thinking:false,max_tokens:kind==='mark'?3000:16000,response_format:{type:'json_schema',json_schema:{name:'schoolbook_'+kind,strict:true,schema:schemas[kind]}},messages:[{role:'system',content:contract.system},{role:'user',content:contract.parts}]})})}
  catch{fail(504,signal.aborted?'QwenCloud request stopped or timed out. Your answer and previous set are kept.':'Could not reach QwenCloud. Try again later.')}
  if(!response.ok)fail(response.status===429?429:502,({401:'QwenCloud rejected the key. Check it in Settings.',402:'Your QwenCloud account needs API credit.',403:'Your QwenCloud key cannot access this model. Check its model permissions or plan.',404:'This QwenCloud model is unavailable on your plan. Choose another in Settings.',429:'QwenCloud credit or request limit reached. Check your account and retry later.'})[response.status]||'QwenCloud could not complete the request. Your answer and previous set are kept.');
  let data;try{data=await response.json()}catch{fail(502,'QwenCloud returned an unreadable response.')}
  const choice=data.choices?.[0];
  if(choice?.finish_reason!=='stop')fail(502,'QwenCloud returned an incomplete answer. Try fewer pages or a shorter set.');
  const raw=choice.message?.content;
  if(typeof raw!=='string'||raw.length>150000)fail(502,'QwenCloud returned an unreadable response.');
  try{return JSON.parse(raw)}catch{fail(502,'QwenCloud returned incomplete JSON. Your answer is kept.')}
}

async function readBody(request){
  if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'Use a JSON request.');
  const reader=request.body?.getReader();if(!reader)fail(400,'Choose book pages first.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>13*1024*1024){await reader.cancel();fail(413,'Choose fewer pages or photos (13 MB maximum request).')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  try{const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw 0;return data}catch{fail(400,'Expected a JSON object.')}
}
function sourceData(raw){
  if(!raw||!Array.isArray(raw.pages)||!raw.pages.length||raw.pages.length>200)fail(400,'Select valid book pages.');
  const pages=raw.pages.map(p=>{
    if(!p||!Number.isInteger(p.number)||p.number<1||p.number>200||typeof p.text!=='string'||!Array.isArray(p.images)||p.images.some(url=>typeof url!=='string'||!/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/.test(url)))fail(400,'Use selected page text and inline photos. Re-add linked photos to your book or turn off photos.');
    return {number:p.number,id:String(p.id||'').slice(0,140),title:String(p.title||'').slice(0,200),text:p.text,images:p.images};
  });
  if(new Set(pages.map(p=>p.number)).size!==pages.length)fail(400,'Select distinct pages.');
  return core.prepare({kind:raw.kind==='lesson'?'lesson':'schoolbook',title:String(raw.title||'').slice(0,300),subject:String(raw.subject||'').slice(0,100),pages});
}
async function rate(env,user){
  const now=Date.now();
  // Reuse account_attempts with separate scopes, so the existing accounts migration suffices.
  for(const [name,duration,limit] of [['hour',3600000,60],['day',86400000,150]]){
    const row=await env.DB.prepare(`INSERT INTO account_attempts(scope,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=CASE WHEN account_attempts.expires_at<=? THEN 1 ELSE account_attempts.attempts+1 END,expires_at=CASE WHEN account_attempts.expires_at<=? THEN excluded.expires_at ELSE account_attempts.expires_at END RETURNING attempts`).bind(`schoolbook:${name}:${user.id}`,now+duration,now,now).first();
    if(row.attempts>limit)fail(429,`Schoolbook AI request limit reached (${limit} per ${name}). Try again later.`);
  }
}
async function responseData(contract,kind,request,env){
  const timeout=AbortSignal.timeout(kind==='mark'?45000:90000),signal=AbortSignal.any([request.signal,timeout]);
  let response;
  try{
    response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal,headers:{'content-type':'application/json',authorization:`Bearer ${env.OPENAI_API_KEY.trim()}`},body:JSON.stringify({model:env.OPENAI_SCHOOLBOOK_MODEL||'gpt-6-luna',store:false,instructions:contract.system,input:[{role:'user',content:contract.parts.map(part=>part.type==='text'?{type:'input_text',text:part.text}:{type:'input_image',image_url:part.image_url.url,detail:'high'})}],max_output_tokens:kind==='mark'?2400:16000,text:{format:{type:'json_schema',name:'schoolbook_'+kind,strict:true,schema:schemas[kind]}}})});
  }catch{fail(504,signal.aborted?'Request stopped or timed out. Your previous practice is kept.':'Could not reach OpenAI. Try again later.')}
  if(!response.ok){
    // Never relay provider bodies: they may echo request data or credential fragments.
    fail(response.status===429?429:502,({401:'The server OpenAI key was rejected. Ask the app owner to update it.',403:'The configured OpenAI model is unavailable to this project.',404:'The configured OpenAI model is unavailable. Update OPENAI_SCHOOLBOOK_MODEL.',429:'OpenAI credit or request limit reached. Check the API project balance and retry later.'})[response.status]||'OpenAI could not complete the request. Your existing practice is kept.');
  }
  let data;try{data=await response.json()}catch{fail(502,'OpenAI returned an unreadable response. Please retry.')}
  if(data.status!=='completed')fail(502,'The AI response was incomplete. Try fewer pages or a shorter set.');
  const content=(data.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]);
  if(content.some(item=>item.type==='refusal'))fail(422,'OpenAI could not generate this practice. Try different lesson pages.');
  const raw=content.filter(item=>item.type==='output_text').map(item=>item.text).join('');
  if(!raw||raw.length>150000)fail(502,'OpenAI returned an unreadable response. Please retry.');
  try{return JSON.parse(raw)}catch{fail(502,'The AI response was incomplete. Your answer is kept.')}
}
export async function handleSchoolbookAI(request,env){
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  try{
    const url=new URL(request.url),kind=url.pathname.split('/').at(-1),route=url.pathname.split('/')[4],selected=['qwen','deepseek','auto'].includes(route)?route:'openai',qwen=selected==='qwen';
    if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Open schoolbook practice from this app.');
    if(!env.DB)fail(503,'Account storage is not configured.');
    const user=await authenticateAccount(request,env);
    if(request.headers.has('x-ai-account')&&request.headers.get('x-ai-account')!==user.id)fail(409,'Your account changed. Start the request again from the current account.');
    if(kind==='chat'&&selected==='deepseek'&&request.method==='POST'){
      const data=await readBody(request);
      if(typeof data.message!=='string'||!data.message.trim()||data.message.length>6000)fail(400,'Write a message of up to 6,000 characters.');
      const config=await readAIKey(env,user.id,'deepseek');if(!config)fail(400,'Save a DeepSeek key to your account in Settings first.');
      await rate(env,user);let response;
      try{response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'manual',signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)]),headers:{'content-type':'application/json',authorization:`Bearer ${config.key}`},body:JSON.stringify({model:config.model,thinking:{type:config.effort==='instant'?'disabled':'enabled'},...(config.effort!=='instant'?{reasoning_effort:config.effort}:{}),max_tokens:12000,messages:[{role:'user',content:data.message}]})})}catch{fail(504,'DeepSeek could not be reached. Try again later.')}
      if(!response.ok)fail(response.status===429?429:502,'DeepSeek could not complete the request. Check the saved key and API credit in Settings.');
      let result;try{result=await response.json()}catch{fail(502,'DeepSeek returned an unreadable response.')}
      const choice=result.choices?.[0],text=choice?.message?.content;
      if(choice?.finish_reason!=='stop'||typeof text!=='string'||!text||text.length>50000)fail(502,'DeepSeek returned an incomplete reply. Please retry.');
      return reply({text});
    }
    if(kind==='status'&&request.method==='GET')return reply(selected==='openai'?{provider:'OpenAI',configured:!!env.OPENAI_API_KEY?.trim()}:selected==='qwen'?{provider:'QwenCloud',userKeyRequired:true}:{provider:selected,accountKeyRequired:true});
    if(!['generate','mark'].includes(kind))fail(404,'Unknown schoolbook practice action.');
    if(request.method!=='POST')fail(405,'Use POST for schoolbook practice.');
    if(selected==='openai'&&!env.OPENAI_API_KEY?.trim())fail(503,'OpenAI schoolbook practice needs the OPENAI_API_KEY Worker secret. Ask the app owner to finish setup.');
    const data=await readBody(request);let contract,source,options,question;
    try{
      if(kind==='generate'){
        source=sourceData(data.source);const raw=data.options||{};
        if(!['multiple-choice','written','mixed','t-account','journal-entry'].includes(raw.format)||![5,8].includes(raw.count)||!core.levels[raw.target-1]||!Number.isInteger(raw.target)||!['A-level / Higher','GCSE / National 5','University / advanced'].includes(raw.level))fail(400,'Choose a supported format, level and set size.');
        options={format:raw.format,count:raw.count,target:raw.target,level:raw.level,course:String(raw.course||'').slice(0,160)};contract=core.generation(source,options);
      }else{
        const raw=data.question;
        if(!raw||raw.type&&!['written','t-account'].includes(raw.type)||typeof data.answer!=='string'||!data.answer.trim()||data.answer.length>6000||!Array.isArray(raw.sources))fail(400,'Supply a written or T-account question and your answer.');
        const evidence={pages:raw.sources.map(ref=>({number:ref.page,text:ref.quote,images:[]}))};
        question=core.questions({questions:[raw]},evidence,1,raw.type||'written')[0];contract=core.marking(question,data.answer);
      }
    }catch(error){if(error.status)throw error;fail(400,error.message)}
    let chosen=selected,config=null,reason='Selected by you.';
    if(selected==='auto'){
      const available={deepseek:await readAIKey(env,user.id,'deepseek'),qwen:await readAIKey(env,user.id,'qwen')};let pick;
      try{pick=globalThis.CommandCentreSchoolbookProviders.automatic({source,question,format:options?.format,available})}catch(error){fail(400,error.message)}
      chosen=pick.provider;reason=pick.reason;config={...available[chosen],...pick};
    }else if(selected==='deepseek'||selected==='qwen'&&!request.headers.has('x-qwen-key')){
      if(selected==='qwen'&&!env.AI_VAULT_KEY)qwenConfiguration(request);
      config=await readAIKey(env,user.id,selected);if(!config)fail(400,`Save a ${selected==='qwen'?'QwenCloud':'DeepSeek'} key to your account in Settings first.`);
      if(data.providerConfig){
        const raw=data.providerConfig;
        if(selected==='deepseek'&&(!['deepseek-flash','deepseek-v4-pro'].includes(raw.model)||!['instant','high','max'].includes(raw.effort))||selected==='qwen'&&!globalThis.CommandCentreSchoolbookProviders.qwenModels.includes(raw.model))fail(400,'Choose a supported provider configuration.');
        config={...config,model:raw.model,...(selected==='deepseek'?{effort:raw.effort}:{})};
      }
    }
    const qwenConfig=chosen==='qwen'?qwenConfiguration(request,config):null;
    await rate(env,user);
    const result=chosen==='qwen'?await qwenResponse(contract,kind,request,qwenConfig):chosen==='deepseek'?await deepSeekResponse(contract,kind,request,config):await responseData(contract,kind,request,env);
    const ai={provider:chosen,model:chosen==='qwen'?qwenConfig.model:config?.model||env.OPENAI_SCHOOLBOOK_MODEL||'gpt-6-luna',...(chosen==='deepseek'?{effort:config.effort}:{}),reason,keySource:config?'account':chosen==='openai'?'server':'device'};
    try{return kind==='generate'?reply({questions:core.questions(result,source,options.count,options.format),ai}):reply({...core.grade(result,question),ai})}catch(error){fail(422,error.message)}
  }catch(error){return reply({error:error.status?error.message:'Schoolbook practice is unavailable. Check the account setup and retry.'},error.status||503)}
}
