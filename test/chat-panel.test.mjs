import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {History} from '../src/history.mjs';
import {Bot} from '../src/bot.mjs';
import {createApp} from '../src/server.mjs';
const raw=(jid,id,ms,text,fromMe=false)=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ms/1000),message:{conversation:text}});

test('each chat keeps its last message and live unread count; the owner replying clears it',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-last-')),store=new Store(dir);
 try{const h=new History(store),t=h.establish('1').firstLinkedAt,jid='7@s.whatsapp.net';
  h.ingest(raw(jid,'old',t-5000,'antiguo'),'history');assert.equal(h.chat(jid).last.text,'antiguo');assert.equal(h.chat(jid).unread,undefined);
  h.ingest(raw(jid,'a',t+1000,'hola'),'live');h.ingest(raw(jid,'b',t+2000,'¿hay pan?'),'live');h.ingest(raw(jid,'b',t+2000,'¿hay pan?'),'live');
  assert.equal(h.chat(jid).unread,2);assert.equal(h.chat(jid).last.text,'¿hay pan?');
  h.ingest(raw(jid,'c',t+3000,'sí',true),'live');assert.equal(h.chat(jid).unread,0);assert.equal(h.chat(jid).last.fromMe,true);
  // The same message under the contact's LID address is stored once.
  h.map({pn:jid,lid:'9@lid'});h.ingest(raw('9@lid','c',t+3000,'sí',true),'live');assert.equal(store.count('owner','messages'),4);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('chats stored before 0.3 get their last message once at startup',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-backfill-')),store=new Store(dir);
 try{const h=new History(store);h.establish('1');const jid='8@s.whatsapp.net';
  h.save({jid,name:'Ana',classification:'old',enabled:false});
  store.put('owner','messages',`${jid}:x`,{id:`${jid}:x`,jid,text:'primero',kind:'text',timestamp:1000});
  store.put('owner','messages',`${jid}:y`,{id:`${jid}:y`,jid,text:'último',kind:'text',timestamp:2000});
  h.backfillLast();assert.equal(h.chat(jid).last.text,'último');
  store.put('owner','messages',`${jid}:z`,{id:`${jid}:z`,jid,text:'posterior',kind:'text',timestamp:3000});h.backfillLast();assert.equal(h.chat(jid).last.text,'último');
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('a reply typed in the panel is sent as-is, pauses the bot in that chat and records its delivery state',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-manual-')),store=new Store(dir);
 try{const h=new History(store),t=h.establish('1').firstLinkedAt+1000,jid='5@s.whatsapp.net',sent=[];let fail=false;
  const bot=new Bot(store,{history:h,status:'connected',socket:{async sendMessage(to,{text},{messageId}){if(fail)throw new Error('offline');sent.push([to,text]);return {key:{id:messageId}};}}});
  h.ingest(raw(jid,'in',t,'Hola'),'live');h.review(jid,true);assert.equal(h.eligible(h.chat(jid)),true);
  const ok=await bot.sendManual(jid,'  Hola, ¿en qué te ayudo?\nSaludos ');
  assert.equal(ok.status,'sent');assert.deepEqual(sent,[[jid,'  Hola, ¿en qué te ayudo?\nSaludos ']]);
  assert.equal(store.get('owner','messages',ok.id).status,'sent');assert.equal(h.chat(jid).unread,0);assert.equal(h.eligible(h.chat(jid)),false);
  // The echo WhatsApp sends back for our own message does not create a second copy.
  h.ingest(raw(jid,ok.id.split(':')[1],Date.now(),'  Hola, ¿en qué te ayudo?\nSaludos ',true),'live');assert.equal(store.count('owner','messages'),2);
  fail=true;assert.equal((await bot.sendManual(jid,'otra')).status,'uncertain');
  await assert.rejects(()=>new Bot(store,{history:h,status:'paused'}).sendManual(jid,'x'),/Conecta WhatsApp/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('HTTP: one chat history, mark as read and send from the panel',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-chatapi-')),port=49341,sent=[];
 const app=createApp({dir,port,connectorFactory:store=>({history:new History(store),status:'connected',socket:{async sendMessage(to,{text},{messageId}){sent.push(text);return {key:{id:messageId}};}},snapshot:()=>({status:'connected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 const base=`http://127.0.0.1:${port}`,post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 try{const h=app.connector.history,t=h.establish('1').firstLinkedAt+1000,a='11@s.whatsapp.net',b='22@s.whatsapp.net';
  for(let i=0;i<3;i++)h.ingest(raw(a,'a'+i,t+i*1000,'a'+i),'live');h.ingest(raw(b,'b0',t,'b0'),'live');
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})}),cookie=login.headers.get('set-cookie').split(';')[0];
  const page=await (await fetch(`${base}/api/chat/messages?jid=${a}`,{headers:{Cookie:cookie}})).json();
  assert.deepEqual(page.messages.map(m=>m.text),['a0','a1','a2']);assert.equal(page.more,false);
  const older=await (await fetch(`${base}/api/chat/messages?jid=${a}&before=${page.messages[1].timestamp}`,{headers:{Cookie:cookie}})).json();
  assert.deepEqual(older.messages.map(m=>m.text),['a0']);
  assert.equal((await fetch(`${base}/api/chat/messages?jid=123@g.us`,{headers:{Cookie:cookie}})).status,400);
  const state=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();
  assert.equal(state.chats.find(c=>c.jid===a).unread,3);assert.equal(state.chats.find(c=>c.jid===a).last.text,'a2');assert.equal(state.totalChats,2);
  assert.equal((await post('/api/chat/read',{jid:a},cookie)).status,200);assert.equal(h.chat(a).unread,0);
  const res=await post('/api/chat/send',{jid:b,text:'Hola desde el panel'},cookie);assert.equal(res.status,200);assert.equal((await res.json()).status,'sent');assert.deepEqual(sent,['Hola desde el panel']);
  const empty=await post('/api/chat/send',{jid:b,text:'   '},cookie);assert.equal(empty.status,400);assert.match((await empty.json()).error,/Escribe un mensaje/);
 }finally{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});}
});
