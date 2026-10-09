import http from 'node:http';
import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {Store} from './store.mjs';
import {Connector} from './connector.mjs';
import {Bot} from './bot.mjs';
import {lockDirectory} from './lock.mjs';
import {direct} from './history.mjs';
import {vapidKeys,validSubscription,sendPush} from './push.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
// Auxiliary admin test routes (/api/bot/test, /api/chat/send-standard-once) stay off in production unless explicitly enabled.
export const testEndpointsEnabled=(env=process.env)=>env.CONVERSA_TEST_ENDPOINTS==='on'||(env.NODE_ENV!=='production'&&env.CONVERSA_TEST_ENDPOINTS!=='off');
const PUBLIC={'/':'index.html','/app.js':'app.js','/theme.js':'theme.js','/sw.js':'sw.js','/styles.css':'styles.css','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/icon-maskable-512.png':'icon-maskable-512.png','/apple-touch-icon.png':'apple-touch-icon.png'};
const TYPES={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml; charset=utf-8',webmanifest:'application/manifest+json; charset=utf-8',png:'image/png'};
// Files the browser may show or play in place; anything else (documents, unknown types) is only downloaded.
const INLINE=/^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|webm|amr|wav)|video\/(mp4|webm|3gpp))$/,MEDIA_MAX=25*1048576,LABELS={image:'📷 Foto',audio:'🎤 Mensaje de voz',video:'🎥 Video',document:'📄 Documento',sticker:'Sticker',view_once:'Visualización única'},REACTIONS=new Set(['👍','❤️','😂','😮','😢','🙏','']);
export function createApp({dir=process.env.CONVERSA_DATA_DIR||join(root,'.data'),port=4318,connectorFactory,respond,publicOrigin=process.env.PUBLIC_ORIGIN,testEndpoints=testEndpointsEnabled(),pushSender=sendPush,avatarFetch=globalThis.fetch}={}) {
 const production=process.env.NODE_ENV==='production';
 if(production&&(!publicOrigin?.startsWith('https://')||!process.env.CONVERSA_KEY_FILE||!process.env.CONVERSA_OWNER_TOKEN_FILE))throw new Error('Production requires HTTPS origin and external secret files');
 if(publicOrigin&&new URL(publicOrigin).origin!==publicOrigin)throw new Error('PUBLIC_ORIGIN must be an exact origin');
 mkdirSync(dir,{recursive:true,mode:0o700});const unlock=lockDirectory(dir);let store;
 try{store=new Store(dir);}catch(e){unlock();throw e;}
 const tokenPath=process.env.CONVERSA_OWNER_TOKEN_FILE||join(dir,'owner-token');
 if(!existsSync(tokenPath))writeFileSync(tokenPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
 const token=readFileSync(tokenPath,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Owner access must be a 256-bit hexadecimal secret');
 const connector=connectorFactory?connectorFactory(store):new Connector(store);connector.history?.backfillLast?.();const bot=new Bot(store,connector,{respond});
 const attempts=new Map();
 // Live updates: any write the panel shows wakes the open panels through /api/events, coalesced every 120 ms.
 const streams=new Set(),visible=new Map();let version=0,flush=null;
 const changed=()=>{version++;if(flush)return;flush=setTimeout(()=>{flush=null;for(const s of streams)s.res.write(`event: change\ndata: ${version}\n\n`);},120);flush.unref?.();};
 for(const name of ['put','remove','clear']){const original=store[name].bind(store);store[name]=(w,b,...rest)=>{const result=original(w,b,...rest);if(['messages','chats','settings','queue'].includes(b))changed();return result;};}
 const ownerWatching=()=>{const now=Date.now();for(const [k,t] of visible)if(now-t>75000)visible.delete(k);return visible.size>0;};
 // Push: only while no panel is on screen, at most one per chat every 3 s. The payload is end-to-end encrypted to the device.
 // Topic and tag travel to Google/Apple: keyed HMAC of the chat, never something a phone number can be guessed from.
 const lastPush=new Map(),pushSubject=publicOrigin?.startsWith('https://')?publicOrigin:undefined,topicOf=jid=>store.index('owner','push-topic',jid).slice(0,32);
 async function notify(msg,chat){const subs=store.list('owner','push',-1);if(!subs.length||ownerWatching())return;const now=Date.now();if(now-(lastPush.get(chat.jid)||0)<3000)return;lastPush.set(chat.jid,now);
  const hidden=store.get('owner','settings','push')?.preview===false,payload=JSON.stringify({title:hidden?'Conversa':chat.name,body:hidden?'Tienes un mensaje nuevo':msg.text?msg.text.slice(0,140).toWellFormed():LABELS[msg.kind]||'Mensaje nuevo',tag:topicOf(chat.jid).slice(0,16),jid:chat.jid});
  const keys=vapidKeys(store);for(const sub of subs){const r=await pushSender(sub,payload,keys,{topic:topicOf(chat.jid),subject:pushSubject}).catch(()=>({}));if(r.gone)store.remove('owner','push',sub.id);}}
 if(connector.history)connector.history.onIncoming=(msg,chat)=>{notify(msg,chat).catch(()=>{});};
 // Opened files live in memory only (LRU, 80 MB); the same file requested twice downloads once.
 const mediaCache=new Map(),downloads=new Map(),waiting=[];let cached=0,active=0;
 // At most 3 downloads from WhatsApp at a time (20 waiting); the rest get 503 and the panel keeps the preview.
 const slot=()=>active<3?(active++,Promise.resolve()):waiting.length>=20?null:new Promise(r=>waiting.push(r)),release=()=>{const next=waiting.shift();if(next)next();else active--;};
 const remember=(id,file)=>{mediaCache.set(id,file);cached+=file.data.length;for(const [k,f] of mediaCache){if(cached<=80*1048576)break;mediaCache.delete(k);cached-=f.data.length;}};
 // Profile photos: one small preview per chat, most recent chats first, refreshed daily; never more than one request at a time.
 const avatars={busy:false,pausedUntil:0};
 async function avatarTick(){
  if(avatars.busy||Date.now()<avatars.pausedUntil||connector.status!=='connected'||typeof connector.profilePicture!=='function')return;avatars.busy=true;
  try{const now=Date.now(),next=store.list('owner','chats',400).filter(c=>!c.deleted&&direct(c.jid)).sort((a,b)=>(b.last?.timestamp||b.latest||0)-(a.last?.timestamp||a.latest||0)).find(c=>{const a=store.get('owner','avatars',c.jid);return !a||now-a.at>(a.data?86400000:3*86400000);});if(!next)return;
   let link=null;try{link=await connector.profilePicture(next.jid);}catch(e){if(e?.output?.statusCode===429||e?.data===429||/rate/i.test(e?.message||'')){avatars.pausedUntil=Date.now()+600000;return;}}
   let data=null,type=null;try{const u=link&&new URL(link);if(u&&u.protocol==='https:'&&/(^|\.)whatsapp\.net$/.test(u.hostname)){const r=await avatarFetch(u.href,{signal:AbortSignal.timeout(8000),redirect:'error'}),t=(r.headers.get('content-type')||'').split(';')[0].trim();if(r.ok&&/^image\/(jpeg|png|webp)$/.test(t)&&Number(r.headers.get('content-length')||0)<=300000){const buf=Buffer.from(await r.arrayBuffer());if(buf.length<=300000){data=buf.toString('base64');type=t;}}}}catch{}
   const chat=connector.history.chat(next.jid);if(chat.deleted)return;// deleted while we waited for WhatsApp
   store.put('owner','avatars',next.jid,{at:Date.now(),type,data});
   if(data)chat.photo=Date.now();else delete chat.photo;if(data||next.photo)connector.history.save(chat);
  }finally{avatars.busy=false;}
 }
 const lite=m=>m.media?.thumb?{...m,media:{...m.media,thumb:undefined}}:m;
 const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 const origins=new Set(publicOrigin?[publicOrigin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
 const hosts=new Set([...origins].map(x=>new URL(x).host));const secure=publicOrigin?.startsWith('https://');
 // HTTPS: __Host- prefix, so a sibling subdomain of the same company domain cannot plant or overwrite the session cookie.
 const cookieName=secure?'__Host-conversa_session':'conversa_session';
 const cookie=(id,age)=>`${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');res.setHeader('X-Robots-Tag','noindex, nofollow');if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
  if(!hosts.has(req.headers.host))return json(403,{error:'Host no permitido.'});
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  try {
   if(req.method==='GET'&&path==='/healthz')return json(200,{ok:true});
   if(req.method==='GET'&&Object.hasOwn(PUBLIC,path)){const name=PUBLIC[path];res.writeHead(200,{'Content-Type':TYPES[name.split('.').pop()]});res.end(readFileSync(join(root,'public',name)));return;}
   const sid=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   const session=sid&&sid.length===64?store.get('owner','sessions',hash(sid)):null;
   const authenticated=session?.expiry>Date.now()&&session.tokenVersion===hash(token);
   if(req.method==='GET'){
    if(!authenticated)return json(401,{error:'Entra con tu acceso privado.'});
    if(path==='/api/state')return json(200,{connection:connector.snapshot(),messages:store.list('owner','messages',100).map(m=>({...lite(m),conversationJid:connector.history.canonical(m.jid)})),totalMessages:store.count('owner','messages'),chats:store.list('owner','chats',2000),totalChats:store.count('owner','chats'),bot:{...bot.config(),aiAvailable:!!respond},queue:store.list('owner','queue',100).map(j=>({state:j.state,timestamp:j.timestamp})),checkedAt:Date.now(),workspace:{name:'Mi espacio',mode:'Privado • un propietario'},notifications:{devices:store.count('owner','push'),preview:store.get('owner','settings','push')?.preview!==false},tests:testEndpoints,keywordTest:(t=>t&&{jid:t.jid,expiresAt:t.expiresAt,consumedAt:t.consumedAt||null})(store.get('owner','settings','keyword-test'))});
    if(path==='/api/messages'){const offset=Math.max(0,Math.min(10000000,Number(url.searchParams.get('offset'))||0));return json(200,{messages:store.list('owner','messages',100,offset).map(m=>({...lite(m),conversationJid:connector.history.canonical(m.jid)})),total:store.count('owner','messages')});}
    if(path==='/api/chat/messages'){
     // One chat's history, newest page first; `before` pages back in time.
     const jid=url.searchParams.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});
     const target=connector.history.canonical(jid),before=Number(url.searchParams.get('before'))||Infinity;
     const all=store.list('owner','messages',-1).filter(m=>m.timestamp<before&&connector.history.canonical(m.jid)===target).sort((a,b)=>a.timestamp-b.timestamp);
     return json(200,{messages:all.slice(-150).map(m=>({...m,conversationJid:target,...(m.media?{media:{...m.media,available:!!store.get('owner','media',m.id)}}:{})})),more:all.length>150});
    }
    if(path==='/api/events'){
     if(streams.size>=8)return json(429,{error:'Demasiadas pestañas abiertas.'});
     res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'});res.write('retry: 3000\n\n');
     const stream={res,sid:hash(sid)};streams.add(stream);
     // Every 25 s: keeps proxies from closing the stream and ends it once the session is gone.
     const ping=setInterval(()=>{const live=store.get('owner','sessions',stream.sid);if(!(live?.expiry>Date.now()&&live.tokenVersion===hash(token)))return res.end();res.write(': ping\n\n');},25000);
     req.on('close',()=>{clearInterval(ping);streams.delete(stream);});return;
    }
    if(path==='/api/media'){
     const id=url.searchParams.get('id')||'',m=id.length<300&&store.get('owner','messages',id),source=m&&!m.viewOnce&&store.get('owner','media',id);
     if(!source)return json(404,{error:'Archivo no disponible.'});
     let file=mediaCache.get(id);
     if(file){mediaCache.delete(id);mediaCache.set(id,file);}
     else{
      if((source.message.fileLength||0)>MEDIA_MAX)return json(413,{error:'Archivo demasiado grande: ábrelo en WhatsApp.'});
      if(connector.status!=='connected'||typeof connector.downloadMedia!=='function')return json(409,{error:'Conecta WhatsApp para abrir archivos.'});
      try{let pending=downloads.get(id);if(!pending){const turn=slot();if(!turn)return json(503,{error:'Demasiadas descargas a la vez. Inténtalo en un momento.'});pending=turn.then(()=>connector.downloadMedia(source,{max:MEDIA_MAX})).finally(release);downloads.set(id,pending);pending.finally(()=>downloads.delete(id)).catch(()=>{});}
       const data=Buffer.from(await pending);if(data.length>MEDIA_MAX)return json(413,{error:'Archivo demasiado grande: ábrelo en WhatsApp.'});
       const base=String(source.message.mimetype||'').split(';')[0].trim().toLowerCase();file={data,type:INLINE.test(base)?base:'application/octet-stream',name:String(m.media?.name||'archivo').replace(/[\u0000-\u001f"\\]/g,'').slice(0,150).toWellFormed()||'archivo'};if(!mediaCache.has(id))remember(id,file);}
      catch{return json(502,{error:'WhatsApp no entregó el archivo. Ábrelo en el teléfono.'});}
     }
     // Byte ranges: Safari only plays audio and video from servers that support them.
     const size=file.data.length,range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');let start=0,end=size-1;
     if(range&&(range[1]||range[2])){if(range[1]){start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),size-1):size-1;}else start=Math.max(0,size-Number(range[2]));if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}}
     const partial=end-start+1<size;
     res.writeHead(partial?206:200,{'Content-Type':file.type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','Content-Disposition':file.type==='application/octet-stream'?`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`:'inline',...(partial?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
     return res.end(file.data.subarray(start,end+1));
    }
    if(path==='/api/avatar'){
     const jid=url.searchParams.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});
     const a=store.get('owner','avatars',connector.history.canonical(jid));if(!a?.data)return json(404,{error:'Sin foto.'});
     const data=Buffer.from(a.data,'base64');res.writeHead(200,{'Content-Type':a.type,'Content-Length':data.length,'Cache-Control':'private, max-age=86400'});return res.end(data);
    }
    if(path==='/api/push/key')return json(200,{publicKey:vapidKeys(store).publicKey});
    if(path==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="conversa-mensajes.json"');return json(200,{exportedAt:new Date().toISOString(),messages:store.list('owner','messages',-1),chats:store.list('owner','chats',-1)});}
    return json(404,{error:'Ruta no encontrada.'});
   }
   if(req.method!=='POST')return json(404,{error:'Ruta no encontrada.'});
   if(!origins.has(req.headers.origin)||req.headers['content-type']!=='application/json')return json(403,{error:'Solicitud no permitida.'});
   let body='';const limit=path==='/api/bot/config'?128000:4096;for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>limit)return json(413,{error:'Solicitud demasiado grande.'});}
   let input;try{input=JSON.parse(body||'{}');if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();}catch{return json(400,{error:'Solicitud inválida.'});}
   if(path==='/api/login'){
    // Socket address only; never trust user-controlled X-Forwarded-For.
    const address=req.socket.remoteAddress,now=Date.now();for(const[k,v]of attempts)if(now-v.start>60000)attempts.delete(k);
    const prior=attempts.get(address)||{count:0,start:now};prior.count++;attempts.set(address,prior);
    if(prior.count>10)return json(429,{error:'Demasiados intentos. Espera un minuto.'});
    if(!equal(input.token,token))return json(401,{error:'Acceso privado inválido.'});
    const id=randomBytes(32).toString('hex');store.put('owner','sessions',hash(id),{expiry:now+43200000,tokenVersion:hash(token)});store.trim('owner','sessions',20);
    res.setHeader('Set-Cookie',cookie(id,43200));return json(200,{ok:true});
   }
   if(!authenticated)return json(401,{error:'Tu sesión terminó. Vuelve a entrar.'});
   // Logging out (or revoking every session) also stops that device's notifications and clears what the browser cached.
   if(path==='/api/logout'){store.remove('owner','sessions',hash(sid));for(const k of visible.keys())if(k.startsWith(hash(sid)+':'))visible.delete(k);for(const s of streams)if(s.sid===hash(sid))s.res.end();for(const sub of store.list('owner','push',-1))if(sub.session===hash(sid))store.remove('owner','push',sub.id);res.setHeader('Set-Cookie',cookie('',0));res.setHeader('Clear-Site-Data','"cache"');}
   else if(path==='/api/revoke-sessions'){store.clear('owner','sessions');store.clear('owner','push');visible.clear();for(const s of streams)s.res.end();res.setHeader('Set-Cookie',cookie('',0));res.setHeader('Clear-Site-Data','"cache"');}
   else if(path==='/api/presence'){const tab=typeof input.tab==='string'&&/^[a-z0-9-]{1,64}$/i.test(input.tab)?input.tab:'',key=hash(sid)+':'+tab;if(input.visible===true)visible.set(key,Date.now());else visible.delete(key);}
   else if(path==='/api/push/subscribe'){const sub=validSubscription(input.subscription),id=hash(sub.endpoint);store.put('owner','push',id,{...sub,id,session:hash(sid),createdAt:Date.now()});store.trim('owner','push',10);}
   else if(path==='/api/push/unsubscribe'){if(typeof input.endpoint==='string')store.remove('owner','push',hash(input.endpoint));}
   else if(path==='/api/push/settings'){if(typeof input.preview!=='boolean')throw new Error('Ajuste inválido');store.put('owner','settings','push',{preview:input.preview});}
   else if(path==='/api/push/test'){const keys=vapidKeys(store),subs=store.list('owner','push',-1);let sent=0;for(const sub of subs){const r=await pushSender(sub,JSON.stringify({title:'Conversa',body:'Las notificaciones funcionan en este dispositivo.',tag:'conversa-test'}),keys,{subject:pushSubject}).catch(()=>({}));if(r.ok)sent++;if(r.gone)store.remove('owner','push',sub.id);}return json(200,{sent,devices:subs.length});}
   else if(path==='/api/connect')await connector.connect();
   else if(path==='/api/pause')connector.pause();
   else if(path==='/api/disconnect')await connector.disconnect();
   else if(path==='/api/bot/test'&&testEndpoints)return json(200,bot.armKeywordTest(input.jid));
   else if(path==='/api/bot/config')return json(200,{bot:bot.configure(input)});
   else if(path==='/api/chat/send-standard-once'&&testEndpoints)return json(200,await bot.sendStandardOnce(input));
   else if(path==='/api/bot/preview')return json(200,{text:await bot.preview(input.text)});
   else if(path==='/api/chat/send'){if(!direct(input.jid))throw new Error('Chat inválido');if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw new Error('Escribe un mensaje de hasta 4000 caracteres.');if(input.quoteId!==undefined&&(typeof input.quoteId!=='string'||input.quoteId.length>300))throw new Error('No se encontró el mensaje citado.');return json(200,await bot.sendManual(input.jid,input.text,{quoteId:input.quoteId}));}
   else if(path==='/api/chat/react'){if(typeof input.id!=='string'||input.id.length>300||!REACTIONS.has(input.emoji))throw new Error('Reacción no disponible.');return json(200,await bot.react(input.id,input.emoji));}
   else if(path==='/api/chat/read'){if(!direct(input.jid))throw new Error('Chat inválido');const chat=connector.history.chat(input.jid);if(chat.unread){chat.unread=0;connector.history.save(chat);}}
   else if(path==='/api/chat/review'){if(typeof input.enabled!=='boolean')throw new Error('Selección inválida');connector.history.review(input.jid,input.enabled);}
   else if(path==='/api/history/more'){
    if(!direct(input.jid))throw new Error('Chat inválido');
    if(connector.status!=='connected')throw new Error('Conecta WhatsApp primero');
    const oldest=store.list('owner','messages',-1).filter(m=>m.jid===input.jid&&m.key).sort((a,b)=>a.timestamp-b.timestamp)[0];
    if(!oldest)throw new Error('No hay un mensaje de referencia');
    await connector.socket.fetchMessageHistory(50,oldest.key,Math.floor(oldest.timestamp/1000));
   }
   else if(path==='/api/chat/delete'){
    if(!direct(input.jid))throw new Error('Chat inválido');
    const chat=connector.history.chat(input.jid);chat.enabled=false;chat.deleted=true;chat.classification='old';chat.name='Contacto eliminado';delete chat.earliest;delete chat.latest;connector.history.save(chat);
    for(const m of store.list('owner','messages',-1))if(connector.history.canonical(m.jid)===chat.jid){store.remove('owner','messages',m.id);store.remove('owner','media',m.id);const file=mediaCache.get(m.id);if(file){cached-=file.data.length;mediaCache.delete(m.id);}}
    store.remove('owner','avatars',chat.jid);delete chat.photo;connector.history.save(chat);
    for(const j of store.list('owner','queue',-1))if(connector.history.canonical(j.jid)===chat.jid)store.remove('owner','queue',j.id);
   }else return json(404,{error:'Ruta no encontrada.'});
   return json(200,{ok:true});
  }catch(error){return json(400,{error:['/api/disconnect','/api/bot/config','/api/chat/review','/api/bot/preview','/api/chat/send','/api/chat/react','/api/push/subscribe'].includes(path)?error.message:'No se pudo completar la acción.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 let closed=false,monitor,watch,avatarTimer,lastStatus,lastSignal;
 return {server,store,connector,bot,avatarTick,changed,start:async()=>{await connector.resume?.();bot.start();monitor=setInterval(()=>{if(connector.status!==lastStatus){lastStatus=connector.status;console.log(JSON.stringify({event:'connection_status',status:lastStatus,at:new Date().toISOString()}));}},5000);monitor.unref?.();
  // Connection state lives in memory (status, QR): watch it so the panel hears about it at once.
  watch=setInterval(()=>{const signal=[connector.status,connector.qr,connector.note,connector.identity?.number].join('|');if(signal!==lastSignal){lastSignal=signal;changed();}},500);watch.unref?.();
  avatarTimer=setInterval(()=>{avatarTick().catch(()=>{});},1500);avatarTimer.unref?.();},
  close:()=>{if(closed)return;closed=true;clearInterval(monitor);clearInterval(watch);clearInterval(avatarTimer);clearTimeout(flush);for(const s of streams)s.res.end();bot.stop();connector.pause(false);server.close();store.close();unlock();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4318),host=process.env.HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&process.env.NODE_ENV!=='production')throw new Error('Public binding requires production configuration');
 const app=createApp({port});app.server.listen(port,host,async()=>{console.log(JSON.stringify({event:'server_started',port}));try{await app.start();}catch{console.error(JSON.stringify({event:'resume_failed'}));}});
 app.server.on('error',()=>{app.close();process.exit(1);});for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{app.close();process.exit(0);});
}
