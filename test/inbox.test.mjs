import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.mjs';
import {History} from '../src/history.mjs';
test('inbox API groups phone and linked-device messages under the same conversation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-inbox-')),port=49329;
 const app=createApp({dir,port,connectorFactory:store=>({history:new History(store),snapshot:()=>({status:'disconnected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 try{const h=app.connector.history;h.establish('100');h.ingest({key:{remoteJid:'123@lid',id:'one'},messageTimestamp:Date.now()/1000,message:{conversation:'test'}},'history');h.map({pn:'456@s.whatsapp.net',lid:'123@lid'});
 const base=`http://127.0.0.1:${port}`,res=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})});const headers={Cookie:res.headers.get('set-cookie').split(';')[0]};
 for(const route of ['/api/state','/api/messages?offset=0']){const response=await fetch(base+route,{headers});assert.equal(response.status,200);const data=await response.json();assert.equal(data.messages[0].conversationJid,'456@s.whatsapp.net');assert.equal(data.messages[0].jid,'123@lid');}
 }finally{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});}
});
