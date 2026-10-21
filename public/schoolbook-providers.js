/* Shared request configuration. No credentials are persisted by this module. */
((root)=>{
  'use strict';
  const qwenModels=['qwen3.7-plus','qwen3.8-flash','qwen3.8-max'];
  function deepSeekConfig(state={}){
    return {model:state.deepSeekModel==='deepseek-v4-pro'?'deepseek-v4-pro':'deepseek-flash',effort:['instant','high','max'].includes(state.deepSeekEffort)?state.deepSeekEffort:'high'};
  }
  function deepSeekBody(contract,marking=false,config={}){
    const {model,effort}=deepSeekConfig({deepSeekModel:config.model,deepSeekEffort:config.effort}),thinking=effort!=='instant';
    if(model==='deepseek-v4-pro'&&contract.parts.some(part=>part.type==='image_url'))throw Error('DeepSeek V4 Pro is text-only. Choose Flash for photos, or turn off photos for this set.');
    return {model,thinking:{type:thinking?'enabled':'disabled'},...(thinking?{reasoning_effort:effort}:{temperature:marking?0.15:0.5}),max_tokens:thinking?(marking?12000:24000):(marking?2400:10000),response_format:{type:'json_object'},messages:[{role:'system',content:contract.system},{role:'user',content:contract.parts}]};
  }
  function qwenConfig(state={}){return {model:qwenModels.includes(state.qwenModel)?state.qwenModel:'qwen3.7-plus'}}
  function automatic({source,question,format='',available={}}={}){
    const photos=!!source?.pages?.some(page=>page.images?.length),numeric=['t-account','journal-entry'].includes(format)||question?.type==='t-account'||/\b(calculate|calculation|journal|debit|credit|formula|solve|ratio)\b|\d/i.test(question?.question||'');
    let provider=photos?'qwen':numeric?'deepseek':'qwen',reason=photos?'Photos: QwenCloud visual and structured output.':numeric?'Calculations or accounting entries: DeepSeek reasoning.':'Question generation or written explanations: QwenCloud structured output.';
    if(!available[provider]){provider=provider==='qwen'?'deepseek':'qwen';reason='Using your available saved provider.'}
    if(!available[provider])throw Error('Save a DeepSeek or QwenCloud key to your account before using Automatic.');
    const config=provider==='deepseek'?deepSeekConfig({deepSeekModel:available.deepseek.model,deepSeekEffort:available.deepseek.effort}):qwenConfig({qwenModel:available.qwen.model});
    if(photos&&provider==='deepseek'&&config.model==='deepseek-v4-pro'){config.model='deepseek-flash';reason='Photos: selected DeepSeek Flash because Pro cannot read images.'}
    return {provider,...config,reason};
  }
  root.CommandCentreSchoolbookProviders={deepSeekConfig,deepSeekBody,qwenConfig,qwenModels,automatic};
})(typeof window==='undefined'?globalThis:window);
