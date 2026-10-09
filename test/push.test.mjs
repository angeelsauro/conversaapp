import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv,createECDH,createHmac,createPublicKey,randomBytes,verify} from 'node:crypto';
import {vapidKeys,validSubscription,encrypt,vapidAuthorization,sendPush} from '../src/push.mjs';

const fakeStore=()=>{const m=new Map(),k=(w,b,id)=>JSON.stringify([w,b,id]);return {puts:0,get(w,b,id){return m.has(k(w,b,id))?JSON.parse(m.get(k(w,b,id))):null;},put(w,b,id,v){this.puts++;m.set(k(w,b,id),JSON.stringify(v));}};};
const ua=()=>{const e=createECDH('prime256v1');e.generateKeys();return {ecdh:e,auth:randomBytes(16),keys(){return {p256dh:e.getPublicKey().toString('base64url'),auth:this.auth.toString('base64url')};}};};
const FCM='https://fcm.googleapis.com/fcm/send/dX1:APA91bExample';
// User-agent side of RFC 8291 / RFC 8188, written independently of src/push.mjs.
function decrypt(body,uaEcdh,auth){
 const h=(key,...p)=>{const m=createHmac('sha256',key);for(const x of p)m.update(x);return m.digest();};
 const salt=body.subarray(0,16),rs=body.readUInt32BE(16),idlen=body[20],asPublic=body.subarray(21,21+idlen),record=body.subarray(21+idlen);
 assert.equal(rs,4096);assert.equal(idlen,65);assert.ok(record.length<=rs);
 const uaPublic=uaEcdh.getPublicKey(),prkKey=h(auth,uaEcdh.computeSecret(asPublic)),ikm=h(prkKey,Buffer.concat([Buffer.from('WebPush: info\0'),uaPublic,asPublic,Buffer.from([1])]));
 const prk=h(salt,ikm),cek=h(prk,Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0,16),nonce=h(prk,Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0,12);
 const d=createDecipheriv('aes-128-gcm',cek,nonce);d.setAuthTag(record.subarray(-16));const plain=Buffer.concat([d.update(record.subarray(0,-16)),d.final()]);
 let end=plain.length-1;while(end>=0&&plain[end]===0)end--;assert.equal(plain[end],2,'last-record delimiter');return plain.subarray(0,end);
}

test('payload encryption round-trips through an independent user-agent decryptor',()=>{
 const u=ua();
 for(const payload of ['Hola 👋 nuevo mensaje','',Buffer.from([0,1,2,255]),'x'.repeat(3000)]){
  const body=encrypt({keys:u.keys()},payload);assert.deepEqual(decrypt(body,u.ecdh,u.auth),Buffer.from(payload));
 }
 const a=encrypt({keys:u.keys()},'same'),b=encrypt({keys:u.keys()},'same');
 assert.notDeepEqual(a.subarray(0,16),b.subarray(0,16));assert.notDeepEqual(a.subarray(21,86),b.subarray(21,86));
 assert.throws(()=>encrypt({keys:u.keys()},'x'.repeat(3001)),/demasiado grande/);
 assert.throws(()=>encrypt({keys:u.keys()},{text:'no'}),/inválida/);
 assert.throws(()=>decrypt(encrypt({keys:{...u.keys(),auth:randomBytes(16).toString('base64url')}},'x'),u.ecdh,u.auth));
});

test('RFC 8291 Appendix A known-answer vector',()=>{
 const asPrivate='yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',asPublic='BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',plain='When I grow up, I want to be a watermelon';
 const keys={p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',auth:'BTBZMqHH6r4Tts7J_aSIgg'};
 const body=encrypt({keys},plain,{salt:'DGv6ra1nlYgDCS1FRnbzlw',serverKeys:{privateKey:asPrivate,publicKey:asPublic}});
 assert.equal(body.toString('base64url'),'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
 const u=createECDH('prime256v1');u.setPrivateKey(Buffer.from('q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94','base64url'));assert.equal(u.getPublicKey().toString('base64url'),keys.p256dh);
 assert.equal(decrypt(body,u,Buffer.from(keys.auth,'base64url')).toString(),plain);
 assert.throws(()=>encrypt({keys},plain,{serverKeys:{privateKey:asPrivate,publicKey:keys.p256dh}}),/Clave/);
 assert.throws(()=>encrypt({keys},plain,{salt:randomBytes(15)}),/Clave/);
});

test('VAPID keys persist and sign an ES256 JWT for the endpoint origin',()=>{
 const store=fakeStore(),keys=vapidKeys(store),again=vapidKeys(store),now=Date.UTC(2026,9,9,12);
 assert.equal(store.puts,1);assert.equal(again.publicKey,keys.publicKey);assert.equal(keys.privateKey.type,'private');
 const raw=Buffer.from(keys.publicKey,'base64url');assert.equal(raw.length,65);assert.equal(raw[0],4);
 assert.notEqual(vapidKeys(fakeStore()).publicKey,keys.publicKey);assert.notEqual(vapidKeys(store,'other').publicKey,keys.publicKey);
 const header=vapidAuthorization(FCM,keys,{now}),m=/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);assert.ok(m,header);
 assert.equal(m[4],keys.publicKey);assert.deepEqual(JSON.parse(Buffer.from(m[1],'base64url')),{typ:'JWT',alg:'ES256'});
 const claims=JSON.parse(Buffer.from(m[2],'base64url'));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.sub,'mailto:owner@conversa.invalid');
 assert.ok(claims.exp>now/1000&&claims.exp<=now/1000+86400);
 const pub=createPublicKey({key:store.get('owner','settings','vapid').publicJwk,format:'jwk'}),sig=Buffer.from(m[3],'base64url');assert.equal(sig.length,64);
 assert.ok(verify('sha256',Buffer.from(m[1]+'.'+m[2]),{key:pub,dsaEncoding:'ieee-p1363'},sig));
 assert.ok(!verify('sha256',Buffer.from(m[1]+'.'+m[2]+'x'),{key:pub,dsaEncoding:'ieee-p1363'},sig));
 assert.match(vapidAuthorization(FCM,keys,{subject:'https://conversa.example'}),/^vapid t=/);
 for(const subject of ['owner@x.com','http://x.com','mailto:'])assert.throws(()=>vapidAuthorization(FCM,keys,{subject}),/VAPID/);
 assert.ok(!JSON.stringify(keys).includes(store.get('owner','settings','vapid').privateJwk.d));
});

test('subscriptions must point to a known push service with valid keys',()=>{
 const keys=ua().keys(),ok=endpoint=>validSubscription({endpoint,keys});
 assert.deepEqual(validSubscription({endpoint:FCM,expirationTime:null,keys:{...keys,extra:1},extra:'drop'}),{endpoint:FCM,keys});
 for(const e of ['https://web.push.apple.com/QGuQyavXutnMH','https://api.push.apple.com/x','https://updates.push.services.mozilla.com/wpush/v2/abc','https://wns2-par02p.notify.windows.com/w/?token=x','https://fcm.googleapis.com:443/fcm/send/x'])assert.ok(ok(e).endpoint.startsWith('https://'),e);
 for(const e of ['http://fcm.googleapis.com/fcm/send/x','https://example.com/push','https://evilfcm.googleapis.com.attacker.com/x','https://fcm.googleapis.com.evil.com/x','https://xfcm.googleapis.com/x','https://evilpush.apple.com/x','https://push.apple.com.evil.com/x','https://notify.windows.com.evil/x','https://fcm.googleapis.com:8443/x','https://user:pw@fcm.googleapis.com/x','https://u@fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com./x','fcm.googleapis.com/x','https://fcm.googleapis.com/'+'x'.repeat(1024),'',null,42])
  assert.throws(()=>ok(e),{message:'Suscripción inválida.'},String(e));
 const p=Buffer.from(keys.p256dh,'base64url'),offCurve=Buffer.from(p);offCurve[64]^=1;
 for(const k of [{...keys,p256dh:p.subarray(0,64).toString('base64url')},{...keys,p256dh:Buffer.concat([Buffer.from([5]),p.subarray(1)]).toString('base64url')},{...keys,p256dh:offCurve.toString('base64url')},{...keys,p256dh:keys.p256dh+'!'},{...keys,auth:randomBytes(15).toString('base64url')},{...keys,auth:randomBytes(17).toString('base64url')},{p256dh:keys.p256dh},null])
  assert.throws(()=>validSubscription({endpoint:FCM,keys:k}),{message:'Suscripción inválida.'});
 assert.throws(()=>validSubscription(null),{message:'Suscripción inválida.'});
});

test('sendPush posts an encrypted, VAPID-signed request and reports gone subscriptions',async()=>{
 const u=ua(),sub={endpoint:FCM,keys:u.keys()},keys=vapidKeys(fakeStore());let seen;
 const fetch=async(url,init)=>{seen={url,init,payload:decrypt(Buffer.from(init.body),u.ecdh,u.auth).toString()};return new Response(null,{status:201});};
 assert.deepEqual(await sendPush(sub,JSON.stringify({title:'Ana',body:'Hola'}),keys,{fetch,topic:'chat-1'}),{ok:true,status:201,gone:false});
 assert.equal(seen.url,FCM);assert.equal(seen.init.method,'POST');assert.equal(seen.init.redirect,'error');assert.ok(seen.init.signal instanceof AbortSignal);
 assert.deepEqual(JSON.parse(seen.payload),{title:'Ana',body:'Hola'});
 const h=seen.init.headers;assert.equal(h['Content-Encoding'],'aes128gcm');assert.equal(h['Content-Type'],'application/octet-stream');assert.equal(h.TTL,'86400');assert.equal(h.Urgency,'high');assert.equal(h.Topic,'chat-1');assert.match(h.Authorization,/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
 await sendPush(sub,'x',keys,{fetch,ttl:60,urgency:'normal'});assert.equal(seen.init.headers.TTL,'60');assert.equal(seen.init.headers.Urgency,'normal');assert.equal('Topic' in seen.init.headers,false);
 assert.deepEqual(await sendPush(sub,'x',keys,{fetch:async()=>new Response('gone',{status:410})}),{ok:false,status:410,gone:true});
 assert.deepEqual(await sendPush(sub,'x',keys,{fetch:async()=>new Response(null,{status:404})}),{ok:false,status:404,gone:true});
 assert.deepEqual(await sendPush(sub,'x',keys,{fetch:async()=>new Response(null,{status:429})}),{ok:false,status:429,gone:false});
 assert.deepEqual(await sendPush(sub,'x',keys,{fetch:async()=>{throw new TypeError('fetch failed');}}),{ok:false,status:0,gone:false});
 let calls=0;const counting=async()=>{calls++;return new Response(null,{status:201});};
 await assert.rejects(sendPush(sub,'x'.repeat(3001),keys,{fetch:counting}),/demasiado grande/);
 await assert.rejects(sendPush({...sub,endpoint:'https://169.254.169.254/latest'},'x',keys,{fetch:counting}),/Suscripción inválida/);
 await assert.rejects(sendPush(sub,'x',keys,{fetch:counting,topic:'not a valid topic!'}),/Tema/);
 await assert.rejects(sendPush(sub,'x',keys,{fetch:counting,urgency:'urgent'}),/Urgencia/);
 assert.equal(calls,0);
});
