import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const context=vm.createContext({window:{}});vm.runInContext(readFileSync('public/schoolbook-providers.js','utf8'),context);
const providers=context.window.CommandCentreSchoolbookProviders;
const contract={system:'Return JSON only.',parts:[{type:'text',text:'Selected book notes'}]};
test('Automatic selects by task and availability, returns no credentials, and keeps manual preferences intact',()=>{
  const available={deepseek:{key:'PRIVATE',model:'deepseek-v4-pro',effort:'max'},qwen:{key:'PRIVATE-QWEN',model:'qwen3.8-flash'}};
  assert.equal(providers.automatic({available}).provider,'qwen');
  assert.equal(providers.automatic({available,format:'journal-entry'}).provider,'deepseek');
  assert.equal(providers.automatic({available,question:{question:'Calculate the current ratio.'}}).provider,'deepseek');
  assert.equal(providers.automatic({available,question:{question:'Explain osmosis.'}}).provider,'qwen');
  const source={pages:[{images:['photo']}]};
  assert.equal(providers.automatic({available,source,format:'t-account'}).provider,'qwen');
  const onlyDS=providers.automatic({available:{deepseek:available.deepseek},source});assert.equal(onlyDS.model,'deepseek-flash');assert.match(onlyDS.reason,/Pro cannot/);
  assert.equal(available.deepseek.model,'deepseek-v4-pro');assert.ok(!JSON.stringify(onlyDS).includes('PRIVATE'));
  assert.throws(()=>providers.automatic(),/Save a DeepSeek/);
});
test('DeepSeek defaults to current Flash with high thinking and separates output from private settings',()=>{
  const config=providers.deepSeekConfig({deepSeekKey:'PRIVATE-KEY'}),body=providers.deepSeekBody(contract,false,config);
  assert.equal(body.model,'deepseek-flash');assert.equal(body.thinking.type,'enabled');assert.equal(body.reasoning_effort,'high');assert.equal(body.max_tokens,24000);
  assert.equal(body.temperature,undefined);assert.equal(body.response_format.type,'json_object');assert.equal(body.messages[1].content[0].text,'Selected book notes');
  assert.ok(!JSON.stringify(config).includes('PRIVATE-KEY'));assert.ok(!JSON.stringify(body).includes('PRIVATE-KEY'));
});
test('DeepSeek respects explicit model and reasoning choices and blocks Pro photos before a paid request',()=>{
  const config=providers.deepSeekConfig({deepSeekModel:'deepseek-v4-pro',deepSeekEffort:'max'}),body=providers.deepSeekBody(contract,true,config);
  assert.equal(body.model,'deepseek-v4-pro');assert.equal(body.reasoning_effort,'max');assert.equal(body.max_tokens,12000);
  const photo={...contract,parts:[...contract.parts,{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]};
  assert.throws(()=>providers.deepSeekBody(photo,false,config),/text-only/);
  assert.equal(providers.deepSeekBody(photo,false,{model:'deepseek-flash',effort:'instant'}).thinking.type,'disabled');
  assert.equal(providers.deepSeekBody(contract,true,{effort:'instant'}).temperature,0.15);
  assert.equal(providers.deepSeekConfig({deepSeekModel:'made-up',deepSeekEffort:'made-up'}).model,'deepseek-flash');
});
test('Qwen session settings contain only a supported model, and portable backups exclude its key',()=>{
  const config=providers.qwenConfig({qwenKey:'PRIVATE-QWEN',qwenModel:'qwen3.8-flash'});assert.equal(config.model,'qwen3.8-flash');assert.ok(!JSON.stringify(config).includes('PRIVATE-QWEN'));
  assert.equal(providers.qwenConfig({qwenModel:'made-up'}).model,'qwen3.7-plus');
  const html=readFileSync('public/index.html','utf8'),source=html.slice(html.indexOf('function commandCentreBackupPayload'),html.indexOf('function backupFileName'));
  const backupContext=vm.createContext({state:{qwenKey:'PRIVATE-QWEN',deepSeekKey:'PRIVATE-DEEPSEEK',entertainment:{}},CommandCentreMangaLibrary:{merge:()=>({})},nowIso:()=>''});
  vm.runInContext(source+';globalThis.payload=commandCentreBackupPayload();',backupContext);
  assert.ok(!JSON.stringify(backupContext.payload).includes('PRIVATE-QWEN'));assert.ok(!JSON.stringify(backupContext.payload).includes('PRIVATE-DEEPSEEK'));
});
