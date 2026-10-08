import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {History} from '../src/history.mjs';
import {Bot} from '../src/bot.mjs';
import {createApp,testEndpointsEnabled} from '../src/server.mjs';
const raw=(jid,id,ms,text,fromMe=false)=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ms/1000),message:{conversation:text}});

test('auxiliary test routes are off in production unless explicitly enabled',()=>{
 assert.equal(testEndpointsEnabled({}),true);
 assert.equal(testEndpointsEnabled({CONVERSA_TEST_ENDPOINTS:'off'}),false);
 assert.equal(testEndpointsEnabled({NODE_ENV:'production'}),false);
 assert.equal(testEndpointsEnabled({NODE_ENV:'production',CONVERSA_TEST_ENDPOINTS:'yes'}),false);
 assert.equal(testEndpointsEnabled({NODE_ENV:'production',CONVERSA_TEST_ENDPOINTS:'on'}),true);
});

test('disabled test routes answer 404; destructive routes validate the chat; security headers are sent',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-hardening-')),port=49331;
 const app=createApp({dir,port,testEndpoints:false,connectorFactory:store=>({history:new History(store),status:'connected',socket:{async fetchMessageHistory(){throw new Error('must not be called');}},snapshot:()=>({status:'connected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 const base=`http://127.0.0.1:${port}`,post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 try{
  const login=await post('/api/login',{token:readFileSync(join(dir,'owner-token'),'utf8')}),cookie=login.headers.get('set-cookie').split(';')[0];
  for(const header of ['content-security-policy','cross-origin-opener-policy','permissions-policy','x-content-type-options'])assert.ok(login.headers.get(header),header);
  assert.equal((await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json()).tests,false);
  assert.equal((await post('/api/bot/test',{jid:'200@s.whatsapp.net'},cookie)).status,404);
  assert.equal((await post('/api/chat/send-standard-once',{jid:'200@s.whatsapp.net',incomingId:'x'},cookie)).status,404);
  for(const jid of [undefined,'','123@g.us','status@broadcast',{}]){
   assert.equal((await post('/api/chat/delete',{jid},cookie)).status,400);
   assert.equal((await post('/api/history/more',{jid},cookie)).status,400);
  }
  assert.equal(app.store.count('owner','chats'),0);
 }finally{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});}
});

test('only the contact can opt out; the owner writing "cancelar" just pauses the chat',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-optout-')),store=new Store(dir);
 try{const h=new History(store),t=h.establish('1').firstLinkedAt+1000,jid='5@s.whatsapp.net';
  h.ingest(raw(jid,'a',t,'Hola'),'live');h.ingest(raw(jid,'b',t,'Cancelar',true),'live');
  assert.equal(h.chat(jid).optOut,undefined);assert.equal(h.chat(jid).enabled,false);h.review(jid,true);assert.equal(h.eligible(h.chat(jid)),true);
  h.ingest(raw(jid,'c',t,'STOP'),'live');assert.equal(h.chat(jid).optOut,true);assert.throws(()=>h.review(jid,true));
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('queue pruning drops only finished jobs older than 7 days',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-prune-')),store=new Store(dir);
 try{const h=new History(store),bot=new Bot(store,{history:h,status:'disconnected'}),now=Date.now(),old=now-8*86400000;
  for(const [id,state,timestamp] of [['old-sent','sent',old],['old-skipped','skipped',old],['old-failed','failed',old],['old-uncertain','uncertain',old],['old-pending','pending',old],['new-sent','sent',now]])store.put('owner','queue',id,{id,state,timestamp});
  bot.prune(now);
  assert.deepEqual(store.list('owner','queue',-1).map(j=>j.id).sort(),['new-sent','old-pending','old-uncertain']);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
