import {createCipheriv,createECDH,createHmac,createPrivateKey,createPublicKey,generateKeyPairSync,randomBytes,sign} from 'node:crypto';

// Web Push without libraries: RFC 8291 (aes128gcm payload encryption, RFC 8188 single record) and RFC 8292 (VAPID, ES256 JWT).
const RS=4096,MAX_PAYLOAD=3000;
const EXACT=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com'],SUFFIX=['push.apple.com','notify.windows.com'];
const b64u=b=>Buffer.from(b).toString('base64url');
const hmac=(key,...parts)=>{const h=createHmac('sha256',key);for(const p of parts)h.update(p);return h.digest();};
const invalid=()=>{throw new Error('Suscripción inválida.');};
// Buffer.from(...,'base64url') silently skips junk characters, so check the alphabet first.
const decode=s=>typeof s==='string'&&s.length<=128&&/^[A-Za-z0-9_-]+={0,2}$/.test(s)?Buffer.from(s.replace(/=+$/,''),'base64url'):invalid();
const bytes=(v,n)=>{const b=Buffer.isBuffer(v)||v instanceof Uint8Array?Buffer.from(v):typeof v==='string'?Buffer.from(v,'base64url'):null;if(!b||b.length!==n)throw new Error('Clave de cifrado inválida.');return b;};
const allowedHost=h=>EXACT.includes(h)||SUFFIX.some(s=>h===s||h.endsWith('.'+s));

function subKeys(keys){
 if(!keys||typeof keys!=='object')invalid();
 const p256dh=decode(keys.p256dh),auth=decode(keys.auth);
 if(p256dh.length!==65||p256dh[0]!==4||auth.length!==16)invalid();
 try{createPublicKey({key:{kty:'EC',crv:'P-256',x:b64u(p256dh.subarray(1,33)),y:b64u(p256dh.subarray(33))},format:'jwk'});}catch{invalid();}
 return {p256dh,auth};
}

export function vapidKeys(store,workspace='owner'){
 let v=store.get(workspace,'settings','vapid');
 if(!v){const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});v={publicJwk:publicKey.export({format:'jwk'}),privateJwk:privateKey.export({format:'jwk'}),createdAt:Date.now()};store.put(workspace,'settings','vapid',v);}
 // The last 65 bytes of a P-256 SPKI are the uncompressed point, which is what applicationServerKey expects.
 const publicKey=b64u(createPublicKey({key:v.publicJwk,format:'jwk'}).export({format:'der',type:'spki'}).subarray(-65));
 return {publicKey,privateKey:createPrivateKey({key:v.privateJwk,format:'jwk'})};
}

export function validSubscription(sub){
 if(!sub||typeof sub!=='object'||typeof sub.endpoint!=='string'||sub.endpoint.length>1024)invalid();
 let url;try{url=new URL(sub.endpoint);}catch{invalid();}
 // URL drops the default :443, so any remaining port is non-standard. The host allowlist keeps this from becoming an SSRF primitive.
 if(url.protocol!=='https:'||url.username||url.password||url.port||!allowedHost(url.hostname))invalid();
 const {p256dh,auth}=subKeys(sub.keys);
 return {endpoint:url.href,keys:{p256dh:b64u(p256dh),auth:b64u(auth)}};
}

export function encrypt(sub,payload,{salt,serverKeys}={}){
 const data=typeof payload==='string'?Buffer.from(payload):Buffer.isBuffer(payload)||payload instanceof Uint8Array?Buffer.from(payload):null;
 if(!data)throw new Error('Notificación inválida.');if(data.length>MAX_PAYLOAD)throw new Error('Notificación demasiado grande.');
 const {p256dh:uaPublic,auth}=subKeys(sub?.keys);salt=salt===undefined?randomBytes(16):bytes(salt,16);
 const ecdh=createECDH('prime256v1');if(serverKeys){ecdh.setPrivateKey(bytes(serverKeys.privateKey,32));if(serverKeys.publicKey!==undefined&&!bytes(serverKeys.publicKey,65).equals(ecdh.getPublicKey()))throw new Error('Clave de cifrado inválida.');}else ecdh.generateKeys();
 const asPublic=ecdh.getPublicKey(),secret=ecdh.computeSecret(uaPublic);
 const ikm=hmac(hmac(auth,secret),Buffer.from('WebPush: info\0'),uaPublic,asPublic,Buffer.from([1]));
 const prk=hmac(salt,ikm),cek=hmac(prk,Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0,16),nonce=hmac(prk,Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0,12);
 // Single last record: payload || 0x02, no padding. 86 header bytes + payload + 17 always fit in rs=4096.
 const cipher=createCipheriv('aes-128-gcm',cek,nonce),body=Buffer.concat([cipher.update(data),cipher.update(Buffer.from([2])),cipher.final(),cipher.getAuthTag()]);
 const header=Buffer.alloc(21);salt.copy(header);header.writeUInt32BE(RS,16);header[20]=asPublic.length;
 return Buffer.concat([header,asPublic,body]);
}

export function vapidAuthorization(endpoint,keys,{subject='mailto:owner@conversa.invalid',now=Date.now()}={}){
 if(typeof subject!=='string'||subject.length>256||!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject))throw new Error('Contacto VAPID inválido.');
 if(!keys?.privateKey||typeof keys.publicKey!=='string')throw new Error('Claves VAPID inválidas.');
 const part=o=>b64u(JSON.stringify(o)),data=part({typ:'JWT',alg:'ES256'})+'.'+part({aud:new URL(endpoint).origin,exp:Math.floor(now/1000)+12*3600,sub:subject});
 return `vapid t=${data}.${b64u(sign('sha256',Buffer.from(data),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}))}, k=${keys.publicKey}`;
}

export async function sendPush(sub,payload,keys,{fetch=globalThis.fetch,ttl=86400,urgency='high',topic,subject,timeoutMs=10000}={}){
 const s=validSubscription(sub),body=encrypt(s,payload);
 if(!Number.isInteger(ttl)||ttl<0||ttl>2419200)throw new Error('TTL inválido.');
 if(!['very-low','low','normal','high'].includes(urgency))throw new Error('Urgencia inválida.');
 if(topic!==undefined&&(typeof topic!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(topic)))throw new Error('Tema inválido.');
 const headers={'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',TTL:String(ttl),Urgency:urgency,Authorization:vapidAuthorization(s.endpoint,keys,{subject})};
 if(topic)headers.Topic=topic;
 const signal=AbortSignal.timeout(timeoutMs);
 let status;try{const res=await fetch(s.endpoint,{method:'POST',headers,body,redirect:'error',signal});status=Number.isInteger(res?.status)?res.status:0;try{await res.body?.cancel?.();}catch{}}catch{return {ok:false,status:0,gone:false};}
 return {ok:status>=200&&status<300,status,gone:status===404||status===410};
}
