import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {CloudConnector} from '../src/cloud-connector.mjs';

function make(t,{fetch}={}){
 const dir=mkdtempSync(join(tmpdir(),'conversa-cloud-')),keyFile=join(dir,'key');
 writeFileSync(keyFile,randomBytes(32));
 const store=new Store(dir,{keyFile});
 const c=new CloudConnector(store,'owner',{fetch});
 t.after(()=>{try{store.close?.();}catch{}rmSync(dir,{recursive:true,force:true});});
 return {store,c};
}

test('conector: nace desconectado y pasa a conectado al configurar credenciales',t=>{
 const {c}=make(t);
 assert.equal(c.status,'disconnected');
 assert.equal(c.snapshot().hasSession,false);
 const r=c.configure({token:'TKN',phoneId:'134',number:'15556055877'});
 assert.equal(r.connected,true);
 assert.equal(c.status,'connected');
 assert.equal(c.snapshot().mode,'cloud');
 assert.equal(c.identity.number,'15556055877');
});

test('conector: sin credenciales, enviar lanza un error claro',async t=>{
 const {c}=make(t);
 await assert.rejects(c.socket.sendMessage('51999@s.whatsapp.net',{text:'hola'}),/Configura el API oficial/);
});

test('conector: enviar usa el número del jid y devuelve el id del mensaje',async t=>{
 let cap=null;
 const fetch=async(url,opts)=>{cap={url,body:JSON.parse(opts.body)};return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.OUT'}]})};};
 const {c}=make(t,{fetch});
 c.configure({token:'TKN',phoneId:'134'});
 const res=await c.socket.sendMessage('51999888777@s.whatsapp.net',{text:'hola'},{messageId:'local-1'});
 assert.equal(res.key.id,'wamid.OUT');
 assert.equal(cap.body.to,'51999888777');
 assert.equal(cap.body.text.body,'hola');
});

test('conector: un webhook entrante aparece en la bandeja con nombre y texto',t=>{
 const {c}=make(t);
 c.configure({token:'TKN',phoneId:'134'});
 c.history.establish('15556055877');
 const n=c.ingestWebhook({phoneId:'134',messages:[{from:'51999888777',id:'wamid.IN',timestamp:Date.now(),type:'text',text:'buenas',name:'Juan'}]});
 assert.equal(n,1);
 const chat=c.history.chat('51999888777@s.whatsapp.net');
 assert.equal(chat.name,'Juan');
 assert.equal(chat.last.text,'buenas');
});
