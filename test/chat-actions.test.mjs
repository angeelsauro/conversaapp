import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {History} from '../src/history.mjs';
import {createApp} from '../src/server.mjs';

const raw=(jid,id,text,ms=Date.now())=>({key:{remoteJid:jid,id,fromMe:false},messageTimestamp:Math.floor(ms/1000),pushName:'Ana',message:{conversation:text}});

test('HTTP: pin/unpin a chat and mark it unread',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-chatact-')),port=49930;
 const app=createApp({dir,port,connectorFactory:store=>({history:new History(store),status:'connected',snapshot:()=>({status:'connected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`,cookie=(await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})})).headers.get('set-cookie').split(';')[0];
 const post=(p,b)=>fetch(base+p,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(b)});
 const h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000,a='51999000001@s.whatsapp.net',b='51999000002@s.whatsapp.net';
 h.ingest(raw(a,'a1','hola',tm),'live');h.ingest(raw(b,'b1','buenas',tm+1000),'live');
 // Pin the older chat → it should carry a pinned timestamp.
 assert.equal((await post('/api/chat/pin',{jid:a,pinned:true})).status,200);
 assert.ok(app.store.get('owner','chats',a).pinned>0,'pinned timestamp set');
 assert.equal(app.store.get('owner','chats',b).pinned,undefined,'other chat not pinned');
 // Unpin.
 await post('/api/chat/pin',{jid:a,pinned:false});assert.equal(app.store.get('owner','chats',a).pinned,undefined);
 // Read it first (unread 0), then mark unread → 1.
 await post('/api/chat/read',{jid:b});assert.equal(app.store.get('owner','chats',b).unread,0);
 assert.equal((await post('/api/chat/unread',{jid:b})).status,200);
 assert.equal(app.store.get('owner','chats',b).unread,1);
 // A chat with no messages cannot be marked unread.
 assert.equal((await post('/api/chat/unread',{jid:'51000@s.whatsapp.net'})).status,404);
 // Invalid jid is rejected.
 assert.equal((await post('/api/chat/pin',{jid:'notachat',pinned:true})).status,400);
});
