import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {History,messageRecord} from '../src/history.mjs';
import {createApp} from '../src/server.mjs';

const raw=(jid,id,message,fromMe=false,ms=Date.now())=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ms/1000),pushName:'Ana',message});

test('locations, contacts, polls, events, invitations, calls and video notes are shown; bookkeeping-only messages are not',()=>{
 const rec=message=>messageRecord(raw('1@s.whatsapp.net','x',message));
 assert.deepEqual(rec({locationMessage:{degreesLatitude:-12.0464,degreesLongitude:-77.0428,name:'Plaza de Armas',address:'Lima'}}).detail,{name:'Plaza de Armas',address:'Lima',lat:-12.0464,lng:-77.0428,live:undefined});
 assert.equal(rec({locationMessage:{degreesLatitude:999,degreesLongitude:5}}).detail.lat,undefined,'impossible coordinates are dropped');
 assert.deepEqual(rec({contactMessage:{displayName:'Luis',vcard:'BEGIN:VCARD\nTEL;type=CELL;waid=51999:+51 999 888 777\nEND:VCARD'}}).detail,{name:'Luis',phone:'+51999888777',count:undefined});
 assert.deepEqual(rec({pollCreationMessageV3:{name:'¿Qué día?',options:[{optionName:'Lunes'},{optionName:'Martes'}]}}).detail,{name:'¿Qué día?',options:['Lunes','Martes']});
 assert.equal(rec({eventMessage:{name:'Cumpleaños'}}).kind,'event');assert.equal(rec({groupInviteMessage:{groupName:'Familia'}}).detail.name,'Familia');assert.equal(rec({callLogMesssage:{isVideo:true}}).kind,'call');
 assert.equal(rec({ptvMessage:{mimetype:'video/mp4',seconds:9}}).kind,'video');assert.equal(rec({lottieStickerMessage:{message:{stickerMessage:{mimetype:'application/was'}}}}).kind,'sticker');
 for(const quiet of [{senderKeyDistributionMessage:{}},{messageContextInfo:{}},{pollUpdateMessage:{}},{keepInChatMessage:{}},{pinInChatMessage:{}},{encReactionMessage:{}}])assert.equal(rec(quiet),null,JSON.stringify(quiet));
 assert.equal(rec({fooBarMessage:{}}).kind,'other','unknown visible types still appear, as «not supported»');
});

test('«delete for everyone» wipes the message; edits change the text; only the author can do either',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-amend-')),store=new Store(dir);
 try{const h=new History(store),t=h.establish('1').firstLinkedAt+1000,a='7@s.whatsapp.net',get=id=>store.get('owner','messages',`${a}:${id}`);
  h.ingest(raw(a,'m1',{conversation:'Mi número es 999'},false,t),'live');h.ingest(raw(a,'m2',{conversation:'Nos vemos a las 5'},false,t+1000),'live');h.ingest(raw(a,'m3',{conversation:'Vale'},true,t+2000),'live');
  h.ingest(raw(a,'p1',{protocolMessage:{type:0,key:{remoteJid:a,id:'m3',fromMe:false}}},false,t+3000),'live');assert.equal(get('m3').text,'Vale','a contact cannot delete my message');
  h.ingest(raw(a,'p2',{protocolMessage:{type:0,key:{remoteJid:a,id:'m1',fromMe:true}}},false,t+4000),'live');assert.equal(get('m1').text,'');assert.equal(get('m1').kind,'deleted');
  h.ingest(raw(a,'p3',{editedMessage:{message:{protocolMessage:{type:14,key:{remoteJid:a,id:'m2',fromMe:true},editedMessage:{conversation:'Nos vemos a las 6'}}}}},false,t+5000),'live');
  assert.equal(get('m2').text,'Nos vemos a las 6');assert.equal(get('m2').edited,true);
  h.ingest(raw('8@s.whatsapp.net','p4',{protocolMessage:{type:14,key:{remoteJid:a,id:'m2'},editedMessage:{conversation:'hackeado'}}}),'live');assert.equal(get('m2').text,'Nos vemos a las 6','another chat cannot edit it');
  assert.equal(store.count('owner','messages'),3,'protocol messages are not stored as messages');
  // A message an older version could not read is filled in when WhatsApp delivers it again.
  store.put('owner','messages',`${a}:old`,{id:`${a}:old`,key:{remoteJid:a,id:'old',fromMe:false},jid:a,text:'',kind:'other',timestamp:t-9000,source:'history'});
  h.ingest(raw(a,'old',{locationMessage:{degreesLatitude:1,degreesLongitude:2,name:'Casa'}},false,t-9000),'history');assert.equal(get('old').kind,'location');assert.equal(get('old').detail.name,'Casa');
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('HTTP: contact profile, shared files and asking WhatsApp for older messages',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-profile-')),port=49980,history=[];let aboutCalls=0;
 const app=createApp({dir,port,avatarFetch:async()=>new Response(Buffer.from('BIGJPEG'),{headers:{'content-type':'image/jpeg'}}),connectorFactory:store=>({history:new History(store),status:'connected',snapshot:()=>({status:'connected'}),pause(){},
  socket:{async fetchMessageHistory(n,key,ts){history.push({n,key,ts});}},async contactAbout(){aboutCalls++;return 'Disponible 🌿';},async profilePicture(jid,type){return type==='image'?'https://pps.whatsapp.net/v/full.jpg':null;}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`,cookie=(await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})})).headers.get('set-cookie').split(';')[0];
 const get=path=>fetch(base+path,{headers:{Cookie:cookie}}),post=(path,body)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000,pn='51999888777@s.whatsapp.net';
 h.map({pn,lid:'77@lid'});h.ingest(raw('77@lid','a1',{conversation:'hola'},false,tm),'live');h.ingest(raw(pn,'a2',{imageMessage:{mimetype:'image/jpeg',jpegThumbnail:'dGh1bWI=',mediaKey:'a2V5',directPath:'/v/t62/a'}},false,tm+1000),'live');h.ingest(raw(pn,'a3',{documentMessage:{fileName:'menu.pdf',mimetype:'application/pdf'}},false,tm+2000),'live');
 const contact=await (await get('/api/contact?jid='+pn)).json();
 assert.deepEqual({number:contact.number,about:contact.about,files:contact.files},{number:'51999888777',about:'Disponible 🌿',files:{photos:1,documents:1,audio:0}});
 await get('/api/contact?jid='+pn);assert.equal(aboutCalls,1,'info is kept for an hour');
 assert.equal((await (await get('/api/contact?jid=77@lid')).json()).number,'51999888777','a LID chat shows its number when WhatsApp mapped it');
 const media=await (await get('/api/chat/media?jid='+pn)).json();assert.deepEqual(media.items.map(i=>[i.kind,i.media?.available]),[['document',false],['image',true]]);
 const full=await get('/api/avatar/full?jid='+pn);assert.equal(full.status,200);assert.equal(await full.text(),'BIGJPEG');
 // Older messages: counted back from the oldest one, whichever address it was stored under.
 assert.equal((await post('/api/history/more',{jid:pn})).status,200);assert.deepEqual(history[0].key,{remoteJid:'77@lid',fromMe:false,id:'a1'});
 const none=await post('/api/history/more',{jid:'51000@s.whatsapp.net'});assert.equal(none.status,400);assert.match((await none.json()).error,/no tiene mensajes guardados/);
});
