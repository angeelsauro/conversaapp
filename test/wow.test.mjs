import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createECDH,randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {History,messageRecord,mediaSource} from '../src/history.mjs';
import {createApp} from '../src/server.mjs';

const raw=(jid,id,ms,message,fromMe=false)=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ms/1000),pushName:'Ana',message});
const thumb=Buffer.from('fake-jpeg-thumbnail');
const image=(caption)=>({imageMessage:{caption,mimetype:'image/jpeg',fileLength:{low:2048,high:0,unsigned:true},width:800,height:600,jpegThumbnail:new Uint8Array(thumb),mediaKey:new Uint8Array(32).fill(7),directPath:'/v/t62/x',url:'https://mmg.whatsapp.net/x',fileEncSha256:new Uint8Array(32).fill(1),fileSha256:new Uint8Array(32).fill(2)}});

test('photos keep caption, size and preview; the file stays on WhatsApp until opened; view-once never',()=>{
 const m=messageRecord(raw('1@s.whatsapp.net','a',Date.now(),image('Así quedó')));
 assert.equal(m.kind,'image');assert.equal(m.text,'Así quedó');assert.equal(m.media.size,2048);assert.equal(m.media.thumb,thumb.toString('base64'));assert.equal(m.media.mimetype,'image/jpeg');
 const src=mediaSource(raw('1@s.whatsapp.net','a',Date.now(),image('')));assert.equal(src.type,'imageMessage');assert.equal(src.message.mediaKey,Buffer.alloc(32,7).toString('base64'));assert.equal(src.message.fileLength,2048);
 assert.equal(mediaSource(raw('1@s.whatsapp.net','b',Date.now(),{viewOnceMessageV2:{message:image('')}})),null);
 assert.equal(messageRecord(raw('1@s.whatsapp.net','c',Date.now(),{stickerMessage:{mimetype:'image/webp'}})).kind,'sticker');
 assert.equal(messageRecord(raw('1@s.whatsapp.net','d',Date.now(),{audioMessage:{mimetype:'audio/ogg; codecs=opus',seconds:7,ptt:true}})).media.seconds,7);
});

test('quoted replies and reactions attach to the right message',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-quote-')),store=new Store(dir);
 try{const h=new History(store),t=h.establish('1').firstLinkedAt+1000,jid='7@s.whatsapp.net';
  h.ingest(raw(jid,'mine',t,{conversation:'¿Te va bien el viernes?'},true),'live');
  h.ingest(raw(jid,'reply',t+1000,{extendedTextMessage:{text:'Sí, perfecto',contextInfo:{stanzaId:'mine',participant:'1@s.whatsapp.net',quotedMessage:{conversation:'¿Te va bien el viernes?'}}}}),'live');
  const reply=store.get('owner','messages',`${jid}:reply`);assert.deepEqual(reply.quote,{id:'mine',text:'¿Te va bien el viernes?',kind:'text',fromMe:true});
  h.ingest(raw(jid,'r1',t+2000,{reactionMessage:{key:{remoteJid:jid,id:'mine',fromMe:true},text:'❤️'}}),'live');
  assert.deepEqual(store.get('owner','messages',`${jid}:mine`).reactions,{contact:'❤️'});assert.match(h.chat(jid).last.text,/Reaccionó ❤️/);
  h.ingest(raw(jid,'r2',t+3000,{reactionMessage:{key:{remoteJid:jid,id:'mine',fromMe:true},text:''}}),'live');
  assert.deepEqual(store.get('owner','messages',`${jid}:mine`).reactions,{});assert.equal(store.count('owner','messages'),2,'reactions are not messages');
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

function setup(t,extra={}){
 const dir=mkdtempSync(join(tmpdir(),'conversa-wow-')),port=49400+Math.floor(Math.random()*500),sent=[],pushes=[];let downloads=0,photoCalls=0;
 const app=createApp({dir,port,pushSender:async(sub,payload)=>{pushes.push({sub,payload:JSON.parse(payload)});return extra.pushResult||{ok:true,status:201,gone:false};},avatarFetch:async url=>{assert.match(url,/^https:\/\/pps\.whatsapp\.net\//);return new Response(Buffer.from('JPEGDATA'),{headers:{'content-type':'image/jpeg','content-length':'8'}});},
  connectorFactory:store=>({history:new History(store),status:'connected',socket:{async sendMessage(to,content,options){sent.push({to,content,options});return {key:{id:options?.messageId||'r'}};}},snapshot:()=>({status:'connected'}),pause(){},
   async downloadMedia(src){downloads++;return Buffer.from(src.type==='documentMessage'?'%PDF-1.7 documento':'0123456789');},
   async profilePicture(jid){photoCalls++;return jid.startsWith('11')?'https://pps.whatsapp.net/v/t61/photo.jpg':jid.startsWith('22')?'https://evil.example/photo.jpg':null;}})});
 const base=`http://127.0.0.1:${port}`;
 const ready=new Promise(r=>app.server.listen(port,'127.0.0.1',r)).then(async()=>{const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})});return login.headers.get('set-cookie').split(';')[0];});
 t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 return {app,base,ready,sent,pushes,counts:()=>({downloads,photoCalls})};
}
const post=(base,path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});

test('live events: an open panel hears about new messages at once, even past the request timeout',async t=>{
 const {app,base,ready}=setup(t),cookie=await ready;app.server.requestTimeout=300;
 const h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000;
 const events=await new Promise((resolve,reject)=>{const req=http.get(base+'/api/events',{headers:{Cookie:cookie,Host:new URL(base).host}},res=>{assert.equal(res.headers['content-type'],'text/event-stream; charset=utf-8');let buffer='',armed=false;res.on('data',c=>{buffer+=c;if(armed&&buffer.includes('event: change')){req.destroy();resolve(buffer);}});
  // Only an event after the request timeout counts: the stream must outlive it.
  setTimeout(()=>{buffer='';armed=true;h.ingest(raw('5@s.whatsapp.net','x',tm,{conversation:'hola'}),'live');},500);});req.on('error',e=>{if(e.code!=='ECONNRESET')reject(e);});});
 assert.match(events,/event: change\ndata: \d+/);
 assert.equal((await fetch(base+'/api/events')).status,401,'needs a session');
});

test('files open on demand: cached in memory, byte ranges for audio/video, documents only as downloads, view-once never',async t=>{
 const {app,base,ready,counts}=setup(t),cookie=await ready,h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000,jid='5@s.whatsapp.net';
 h.ingest(raw(jid,'img',tm,image('')),'live');
 h.ingest(raw(jid,'doc',tm+1,{documentMessage:{fileName:'factura "marzo".pdf',mimetype:'application/pdf',fileLength:20,mediaKey:new Uint8Array(32),directPath:'/v/doc'}}),'live');
 h.ingest(raw(jid,'once',tm+2,{viewOnceMessageV2:{message:image('')}}),'live');
 const get=(id,headers={})=>fetch(`${base}/api/media?id=${encodeURIComponent(`${jid}:${id}`)}`,{headers:{Cookie:cookie,...headers}});
 const full=await get('img');assert.equal(full.status,200);assert.equal(full.headers.get('content-type'),'image/jpeg');assert.equal(full.headers.get('content-disposition'),'inline');assert.equal(await full.text(),'0123456789');
 const part=await get('img',{Range:'bytes=2-5'});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),'bytes 2-5/10');assert.equal(await part.text(),'2345');
 assert.equal((await get('img',{Range:'bytes=50-'})).status,416);
 assert.equal(counts().downloads,1,'second and third requests come from memory');
 const doc=await get('doc');assert.equal(doc.headers.get('content-type'),'application/octet-stream');assert.match(doc.headers.get('content-disposition'),/^attachment; filename\*=UTF-8''factura%20marzo.pdf$/);
 assert.equal((await get('once')).status,404);assert.equal(app.store.get('owner','media',`${jid}:once`),null);
 const state=await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json();assert.equal(state.messages.find(m=>m.id===`${jid}:img`).media.thumb,undefined,'state polling stays light');
 const page=await (await fetch(`${base}/api/chat/messages?jid=${jid}`,{headers:{Cookie:cookie}})).json();assert.ok(page.messages.find(m=>m.id===`${jid}:img`).media.thumb,'the chat view gets the preview');
 app.connector.status='paused';assert.equal((await fetch(`${base}/api/media?id=${encodeURIComponent(`${jid}:doc`)}`,{headers:{Cookie:cookie}})).status,200,'cached files still open');
 h.ingest(raw(jid,'img2',tm+3,image('')),'live');assert.equal((await get('img2')).status,409);
});

test('profile photos: fetched from WhatsApp only, stored small, served to the panel',async t=>{
 const {app,base,ready,counts}=setup(t),cookie=await ready,h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000;
 for(const [jid,i] of [['11@s.whatsapp.net',3],['22@s.whatsapp.net',2],['33@s.whatsapp.net',1]])h.ingest(raw(jid,'m'+i,tm+i,{conversation:'hola'}),'live');
 for(let i=0;i<4;i++)await app.avatarTick();
 assert.equal(counts().photoCalls,3,'one request per chat, then nothing until it is a day old');
 const chats=Object.fromEntries((await (await fetch(base+'/api/state',{headers:{Cookie:cookie}})).json()).chats.map(c=>[c.jid,c]));
 assert.ok(chats['11@s.whatsapp.net'].photo);assert.equal(chats['22@s.whatsapp.net'].photo,undefined,'non-WhatsApp hosts are ignored');assert.equal(chats['33@s.whatsapp.net'].photo,undefined);
 const photo=await fetch(`${base}/api/avatar?jid=11@s.whatsapp.net`,{headers:{Cookie:cookie}});assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');assert.equal(await photo.text(),'JPEGDATA');
 assert.equal((await fetch(`${base}/api/avatar?jid=33@s.whatsapp.net`,{headers:{Cookie:cookie}})).status,404);
});

test('push: a new message notifies subscribed devices unless a panel is on screen; dead subscriptions are removed',async t=>{
 const {app,base,ready,pushes}=setup(t),cookie=await ready,h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000;
 const ua=createECDH('prime256v1');ua.generateKeys();
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/abc',keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')},expirationTime:null};
 assert.equal((await post(base,'/api/push/subscribe',{subscription:{...subscription,endpoint:'https://evil.example/push'}},cookie)).status,400);
 assert.equal((await post(base,'/api/push/subscribe',{subscription},cookie)).status,200);
 const key=await (await fetch(base+'/api/push/key',{headers:{Cookie:cookie}})).json();assert.equal(Buffer.from(key.publicKey,'base64url').length,65);
 h.ingest(raw('5@s.whatsapp.net','n1',tm,{conversation:'¿Abren mañana?'}),'live');await new Promise(r=>setTimeout(r,20));
 assert.equal(pushes.length,1);assert.deepEqual({title:pushes[0].payload.title,body:pushes[0].payload.body,jid:pushes[0].payload.jid},{title:'Ana',body:'¿Abren mañana?',jid:'5@s.whatsapp.net'});
 h.ingest(raw('5@s.whatsapp.net','old',tm-5000,{conversation:'historial'}),'history');h.ingest(raw('5@s.whatsapp.net','me',tm+1,{conversation:'yo'},true),'live');await new Promise(r=>setTimeout(r,20));
 assert.equal(pushes.length,1,'history and own messages never notify');
 await post(base,'/api/presence',{visible:true},cookie);h.ingest(raw('6@s.whatsapp.net','n2',tm+2,{conversation:'otro'}),'live');await new Promise(r=>setTimeout(r,20));
 assert.equal(pushes.length,1,'panel on screen: the in-app sound is enough');
 await post(base,'/api/presence',{visible:false},cookie);await post(base,'/api/push/settings',{preview:false},cookie);
 h.ingest(raw('7@s.whatsapp.net','n3',tm+3,{conversation:'secreto'}),'live');await new Promise(r=>setTimeout(r,20));
 assert.deepEqual({title:pushes[1].payload.title,body:pushes[1].payload.body},{title:'Conversa',body:'Tienes un mensaje nuevo'},'private mode hides name and text');
 const test1=await (await post(base,'/api/push/test',{},cookie)).json();assert.deepEqual(test1,{sent:1,devices:1});
 assert.equal(app.store.count('owner','push'),1);
});

test('push: a subscription the push service reports as gone is deleted',async t=>{
 const {app,base,ready}=setup(t,{pushResult:{ok:false,status:410,gone:true}}),cookie=await ready;
 const ua=createECDH('prime256v1');ua.generateKeys();
 await post(base,'/api/push/subscribe',{subscription:{endpoint:'https://web.push.apple.com/QGx',keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}},cookie);
 assert.deepEqual(await (await post(base,'/api/push/test',{},cookie)).json(),{sent:0,devices:1});assert.equal(app.store.count('owner','push'),0);
});

test('reply quoting a message and react from the panel',async t=>{
 const {app,base,ready,sent}=setup(t),cookie=await ready,h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000,jid='5@s.whatsapp.net';
 h.ingest(raw(jid,'q',tm,{conversation:'¿Tenéis tarta de queso?'}),'live');
 const r=await post(base,'/api/chat/send',{jid,text:'¡Sí! Hoy recién hecha.',quoteId:`${jid}:q`},cookie);assert.equal(r.status,200);
 assert.deepEqual(sent[0].options.quoted.key,{remoteJid:jid,id:'q',fromMe:false});assert.equal(sent[0].options.quoted.message.conversation,'¿Tenéis tarta de queso?');
 const {id}=await r.json();assert.deepEqual(app.store.get('owner','messages',id).quote,{id:'q',text:'¿Tenéis tarta de queso?',kind:'text',fromMe:false});
 assert.equal((await post(base,'/api/chat/send',{jid,text:'x',quoteId:'otro:chat'},cookie)).status,400);
 const react=await post(base,'/api/chat/react',{id:`${jid}:q`,emoji:'👍'},cookie);assert.equal(react.status,200);assert.deepEqual(sent[1].content,{react:{text:'👍',key:{remoteJid:jid,id:'q',fromMe:false}}});
 assert.deepEqual(app.store.get('owner','messages',`${jid}:q`).reactions,{me:'👍'});
 assert.equal((await post(base,'/api/chat/react',{id:`${jid}:q`,emoji:'💩'},cookie)).status,400);
});

test('the PWA files are served with the right types',async t=>{
 const {base,ready}=setup(t);await ready;
 for(const [path,type] of [['/manifest.webmanifest','application/manifest+json; charset=utf-8'],['/sw.js','text/javascript; charset=utf-8'],['/theme.js','text/javascript; charset=utf-8'],['/icon-192.png','image/png'],['/apple-touch-icon.png','image/png']]){const r=await fetch(base+path);assert.equal(r.status,200,path);assert.equal(r.headers.get('content-type'),type);}
 const manifest=await (await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
});
