import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createCipheriv,createHmac,createECDH,createHash} from 'node:crypto';
import {getMediaKeys} from '@whiskeysockets/baileys';
import {Store} from '../src/store.mjs';
import {History,messageRecord,mediaSource} from '../src/history.mjs';
import {Connector} from '../src/connector.mjs';
import {createApp} from '../src/server.mjs';

const raw=(jid,id,message,fromMe=false)=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(Date.now()/1000),message});
const img=extra=>({imageMessage:{mimetype:'image/jpeg',mediaKey:randomBytes(32),fileLength:10,...extra}});

test('only genuine WhatsApp media paths are kept: a sender cannot aim the server at another address',()=>{
 for(const bad of [{url:'http://127.0.0.1:9/admin'},{url:'https://evil.example/x',directPath:'@evil.example/x'},{directPath:'/x/../../etc'},{directPath:'https://evil.example/v/x'},{directPath:'/v/x@evil.example'},{directPath:'/v/t62/../x'}])
  assert.equal(mediaSource(raw('1@s.whatsapp.net','a',img(bad))),null,JSON.stringify(bad));
 const ok=mediaSource(raw('1@s.whatsapp.net','a',img({url:'https://evil.example/x',directPath:'/v/t62.7118-24/1_2_n.enc?ccb=11-4&oh=01_Q5Aa&oe=6534A2F1&_nc_sid=5e03e0&mms3=true'})));
 assert.equal(ok.message.url,undefined,'the URL from the message is never stored');assert.match(ok.message.directPath,/^\/v\/t62/);
});

test('view-once stays closed however deeply it is wrapped',()=>{
 let message={imageMessage:{viewOnce:true,mediaKey:randomBytes(32),directPath:'/v/t62/x'}};
 for(let depth=1;depth<=6;depth++){message={ephemeralMessage:{message}};const r=raw('1@s.whatsapp.net','v'+depth,message),rec=messageRecord(r);
  assert.equal(mediaSource(r),null,'depth '+depth);assert.ok(!rec||rec.kind==='view_once','depth '+depth);}
});

test('a reaction only applies inside the chat its message belongs to',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-react-')),store=new Store(dir);
 try{const h=new History(store);h.establish('1');const a='7@s.whatsapp.net';
  h.ingest(raw(a,'m1',{conversation:'hola'},true),'live');
  for(const from of ['8@s.whatsapp.net','123@g.us','status@broadcast'])h.ingest(raw(from,'x'+from,{reactionMessage:{key:{remoteJid:a,id:'m1',fromMe:true},text:'😡'}}),'live');
  assert.equal(store.get('owner','messages',`${a}:m1`).reactions,undefined);
  h.ingest(raw(a,'ok',{reactionMessage:{key:{remoteJid:a,id:'m1',fromMe:true},text:'👍'}}),'live');assert.deepEqual(store.get('owner','messages',`${a}:m1`).reactions,{contact:'👍'});
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

// A real WhatsApp-encrypted file: AES-256-CBC with keys derived from mediaKey, plus a 10-byte HMAC.
async function encryptedFile(plain,type='image'){const mediaKey=randomBytes(32),{cipherKey,iv,macKey}=await getMediaKeys(mediaKey,type),c=createCipheriv('aes-256-cbc',cipherKey,iv),body=Buffer.concat([c.update(plain),c.final()]);return {mediaKey,file:Buffer.concat([body,createHmac('sha256',macKey).update(iv).update(body).digest().subarray(0,10)])};}
const stores=[];test.after(()=>{for(const [store,dir] of stores){store.close();rmSync(dir,{recursive:true,force:true});}});
function connector(responses,calls){const dir=mkdtempSync(join(tmpdir(),'conversa-dl-')),store=new Store(dir);stores.push([store,dir]);const c=new Connector(store,'owner',()=>({}));Object.assign(c,{status:'connected',socket:{async updateMediaMessage(m){calls.push('reupload');m.message.imageMessage.directPath=responses.reuploadPath;return m;}}});
 c.fetch=async(url,init)=>{calls.push([url,init.redirect,!!init.signal]);const r=responses[new URL(url).pathname]||{status:404};return new Response(r.body||null,{status:r.status||200,headers:r.headers||{}});};return c;}

test('downloads go only to WhatsApp, without redirects, with a size cap and an integrity check',async()=>{
 const plain=Buffer.from('foto real'),{mediaKey,file}=await encryptedFile(plain),calls=[];
 const source=p=>({key:{remoteJid:'1@s.whatsapp.net',id:'a'},type:'imageMessage',message:{directPath:p,mediaKey:mediaKey.toString('base64'),mimetype:'image/jpeg'}});
 const c=connector({'/v/t62/ok':{body:file},'/v/t62/tampered':{body:Buffer.concat([file.subarray(0,-1),Buffer.from([file.at(-1)^1])])},'/v/t62/huge':{body:randomBytes(5000)},'/v/t62/new':{body:file},reuploadPath:'/v/t62/new'},calls);
 assert.deepEqual(await c.downloadMedia(source('/v/t62/ok')),plain);
 assert.deepEqual(calls[0],['https://mmg.whatsapp.net/v/t62/ok','error',true]);
 await assert.rejects(c.downloadMedia(source('/v/t62/tampered')),/BAD_MAC/);
 await assert.rejects(c.downloadMedia(source('/v/t62/huge'),{max:1000}),/TOO_BIG/);
 await assert.rejects(c.downloadMedia(source('@evil.example/x')),/BAD_PATH/);assert.ok(!calls.some(x=>String(x[0]).includes('evil')));
 // Expired file: the sender's phone uploads it again, and the new path is checked too.
 assert.deepEqual(await c.downloadMedia(source('/v/t62/expired')),plain);assert.ok(calls.includes('reupload'));
 const evil=connector({reuploadPath:'@evil.example/x'},[]);await assert.rejects(evil.downloadMedia(source('/v/t62/expired')),/BAD_PATH/);
});

test('logging out stops that device\'s notifications; revoking stops all; the push topic reveals no phone number',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-pushsess-')),port=49950,options=[];
 const app=createApp({dir,port,pushSender:async(sub,payload,keys,opts)=>{options.push(opts);return {ok:true,status:201};},connectorFactory:store=>({history:new History(store),status:'connected',socket:{},snapshot:()=>({status:'connected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`,post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
 const login=async()=>(await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})})).headers.get('set-cookie').split(';')[0];
 const sub=host=>{const ua=createECDH('prime256v1');ua.generateKeys();return {endpoint:`https://${host}/push/${randomBytes(4).toString('hex')}`,keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};};
 const phone=await login(),laptop=await login();
 await post('/api/push/subscribe',{subscription:sub('fcm.googleapis.com')},phone);await post('/api/push/subscribe',{subscription:sub('web.push.apple.com')},laptop);
 const h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000;h.ingest({key:{remoteJid:'34611222333@s.whatsapp.net',id:'n',fromMe:false},messageTimestamp:Math.floor(tm/1000),message:{conversation:'hola'}},'live');await new Promise(r=>setTimeout(r,30));
 assert.equal(options.length,2);assert.match(options[0].topic,/^[a-f0-9]{32}$/);assert.notEqual(options[0].topic,createHash('sha256').update('34611222333@s.whatsapp.net').digest('hex').slice(0,32));
 const out=await post('/api/logout',{},phone);assert.equal(out.headers.get('clear-site-data'),'"cache"');assert.equal(app.store.count('owner','push'),1,'only the phone\'s subscription is gone');
 await post('/api/revoke-sessions',{},laptop);assert.equal(app.store.count('owner','push'),0);
 const media=await fetch(base+'/api/media?id=x',{headers:{Cookie:await login()}});assert.equal(media.status,404);
});
