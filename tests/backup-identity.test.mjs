import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf("const BACKUP_DEVICE_KEY='cc_transfer_device_v1'");
const end=html.indexOf('function commandCentreBackupPayload',start);
const source=html.slice(start,end);
const context={
  crypto:webcrypto,TextEncoder,TextDecoder,
  btoa:value=>Buffer.from(value,'binary').toString('base64'),
  atob:value=>Buffer.from(value,'base64').toString('binary')
};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.backupIdentity={encryptBackupDeviceSession,decryptBackupDeviceSession};`,context);

test('paired-device backup encryption round-trips without exposing its bearer token',async()=>{
  const session={token:'a'.repeat(64),device:{id:'12345678-1234-1234-1234-123456789abc',name:'My iPhone'}};
  const encrypted=await context.backupIdentity.encryptBackupDeviceSession(session,'correct horse battery staple');
  assert.equal(encrypted.cipher,'AES-GCM');
  assert.equal(encrypted.iterations,210000);
  assert.ok(!JSON.stringify(encrypted).includes(session.token));
  const restored=await context.backupIdentity.decryptBackupDeviceSession(encrypted,'correct horse battery staple');
  assert.equal(restored.token,session.token);assert.equal(restored.device.id,session.device.id);assert.equal(restored.device.name,session.device.name);
  await assert.rejects(()=>context.backupIdentity.decryptBackupDeviceSession(encrypted,'wrong password'),/incorrect or the encrypted device connection is damaged/);
});
