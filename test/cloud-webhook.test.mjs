import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';

const VERIFY='mi-token-secreto',SECRET='app-secret-123',PHONE='134';

function start(t,{cloud=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'conversa-wh-')),port=49950+Math.floor(Math.random()*40);
 const app=createApp({dir,port,cloudConfig:cloud?{token:'TKN',phoneId:PHONE,verifyToken:VERIFY,appSecret:SECRET,number:'15556055877'}:{}});
 t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 return {app,base:`http://127.0.0.1:${port}`,listen:()=>new Promise(r=>app.server.listen(port,'127.0.0.1',r))};
}

test('webhook GET: devuelve el challenge solo con el token de verificación correcto',async t=>{
 const {listen,base}=start(t);await listen();
 const ok=await fetch(base+`/api/wa/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=98765`);
 assert.equal(ok.status,200);assert.equal(await ok.text(),'98765');
 const bad=await fetch(base+`/api/wa/webhook?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=98765`);
 assert.equal(bad.status,403);
});

test('webhook POST: con firma válida, el mensaje entra en la bandeja del propietario',async t=>{
 const {app,listen,base}=start(t);await listen();
 app.connector.history.establish('15556055877');
 const payload=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:PHONE},contacts:[{wa_id:'51999888777',profile:{name:'Ana'}}],messages:[{from:'51999888777',id:'wamid.IN1',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'hola oficial'}}]}}]}]});
 const sig='sha256='+createHmac('sha256',SECRET).update(payload).digest('hex');
 const r=await fetch(base+'/api/wa/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig},body:payload});
 assert.equal(r.status,200);
 const chat=app.connector.history.chat('51999888777@s.whatsapp.net');
 assert.equal(chat.name,'Ana');
 assert.equal(chat.last.text,'hola oficial');
});

test('webhook POST: una firma inválida se rechaza y no entra nada',async t=>{
 const {app,listen,base}=start(t);await listen();
 app.connector.history.establish('15556055877');
 const payload=JSON.stringify({entry:[{changes:[{value:{metadata:{phone_number_id:PHONE},messages:[{from:'519',id:'x',timestamp:'1',type:'text',text:{body:'falso'}}]}}]}]});
 const r=await fetch(base+'/api/wa/webhook',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':'sha256=deadbeef'},body:payload});
 assert.equal(r.status,403);
 assert.equal(app.connector.history.chat('519@s.whatsapp.net').name,'Contacto');// no se creó
});

test('sin configurar la API oficial, el webhook no existe y el conector sigue siendo el normal',async t=>{
 const {app,listen,base}=start(t,{cloud:false});await listen();
 const r=await fetch(base+`/api/wa/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`);
 assert.equal(r.status,404);
 assert.equal(app.connector.constructor.name,'Connector');// Baileys, no CloudConnector
});

test('con la API oficial configurada, el conector del propietario es el oficial',async t=>{
 const {app,listen}=start(t);await listen();
 assert.equal(app.connector.constructor.name,'CloudConnector');
 assert.equal(app.connector.status,'connected');
 assert.equal(app.connector.creds().phoneId,PHONE);
});
