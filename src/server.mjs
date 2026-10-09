import http from 'node:http';
import {randomBytes,timingSafeEqual,createHash,scrypt,randomInt} from 'node:crypto';
import {promisify} from 'node:util';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {Store} from './store.mjs';
import {Connector} from './connector.mjs';
import {Bot} from './bot.mjs';
import {lockDirectory} from './lock.mjs';
import {History,direct} from './history.mjs';
import {vapidKeys,validSubscription,sendPush} from './push.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
const scryptAsync=promisify(scrypt);
// Auxiliary admin test routes (/api/bot/test, /api/chat/send-standard-once) stay off in production unless explicitly enabled.
export const testEndpointsEnabled=(env=process.env)=>env.CONVERSA_TEST_ENDPOINTS==='on'||(env.NODE_ENV!=='production'&&env.CONVERSA_TEST_ENDPOINTS!=='off');
const PUBLIC={'/':'index.html','/app.js':'app.js','/theme.js':'theme.js','/sw.js':'sw.js','/styles.css':'styles.css','/icon.svg':'icon.svg','/manifest.webmanifest':'manifest.webmanifest','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/icon-maskable-512.png':'icon-maskable-512.png','/icon-mono-512.png':'icon-mono-512.png','/apple-touch-icon.png':'apple-touch-icon.png'};
const TYPES={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml; charset=utf-8',webmanifest:'application/manifest+json; charset=utf-8',png:'image/png',json:'application/json; charset=utf-8'};
// Files the browser may show or play in place; anything else (documents, unknown types) is only downloaded.
const INLINE=/^(image\/(jpeg|png|webp|gif)|audio\/(ogg|mpeg|mp4|aac|webm|amr|wav)|video\/(mp4|webm|3gpp))$/,MEDIA_MAX=25*1048576,LABELS={image:'📷 Foto',audio:'🎤 Mensaje de voz',video:'🎥 Video',document:'📄 Documento',sticker:'Sticker',view_once:'Visualización única',location:'📍 Ubicación',contact:'👤 Contacto',poll:'📊 Encuesta',event:'📅 Evento',invite:'👥 Invitación a un grupo',call:'📞 Llamada'},REACTIONS=new Set(['👍','❤️','😂','😮','😢','🙏','']);
const ERRORS_SHOWN=['/api/brand','/api/disconnect','/api/bot/config','/api/chat/review','/api/bot/preview','/api/chat/send','/api/chat/react','/api/push/subscribe','/api/history/more','/api/connect'];
// Client accounts: international number (country code, digits only) and a password hashed with scrypt.
export const normalizeNumber=v=>{if(typeof v!=='string'&&typeof v!=='number')return null;const d=String(v).replace(/[^\d]/g,'').replace(/^00/,'');return /^[1-9]\d{7,14}$/.test(d)?d:null;};
async function hashPassword(password){const salt=randomBytes(16),key=await scryptAsync(password,salt,32,{N:16384,r:8,p:1,maxmem:64*1048576});return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;}
async function checkPassword(password,stored){if(typeof password!=='string'||typeof stored!=='string')return false;const [,salt,key]=stored.split('$');const got=await scryptAsync(password,Buffer.from(salt,'base64'),32,{N:16384,r:8,p:1,maxmem:64*1048576}),want=Buffer.from(key,'base64');return got.length===want.length&&timingSafeEqual(got,want);}
const TERMS_VERSION='2026-10-09';
// Custom brand (name + logo): for now only the owner (super admin); later a paid option for client accounts.
const brandAllowed=ctx=>ctx?.role==='owner';
const pngSize=b=>b.length>24&&b.readUInt32BE(0)===0x89504e47&&b.readUInt32BE(4)===0x0d0a1a0a&&b.toString('latin1',12,16)==='IHDR'?[b.readUInt32BE(16),b.readUInt32BE(20)]:null;
// Rate limits count IPv4 clients by address and IPv6 clients by /64 (one home or mobile network).
export function clientKey(ip){ip=String(ip||'').split('%')[0];const v4=/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);if(v4)return v4[1];if(!ip.includes(':'))return ip;const [head,tail='']=ip.split('::'),a=head?head.split(':'):[],b=tail?tail.split(':'):[],full=[...a,...Array(Math.max(0,8-a.length-b.length)).fill('0'),...b];return full.slice(0,4).map(x=>(x.toLowerCase().replace(/^0+(?=.)/,''))).join(':')+'::/64';}
export function createApp({dir=process.env.CONVERSA_DATA_DIR||join(root,'.data'),port=4318,connectorFactory,respond,publicOrigin=process.env.PUBLIC_ORIGIN||undefined,appOrigin=process.env.APP_ORIGIN||undefined,testEndpoints=testEndpointsEnabled(),pushSender=sendPush,avatarFetch=globalThis.fetch,maxAccounts=Number(process.env.CONVERSA_MAX_ACCOUNTS||30),trustProxyIp=process.env.CONVERSA_TRUST_CF==='1',android={package:process.env.CONVERSA_ANDROID_PACKAGE,sha256:process.env.CONVERSA_ANDROID_SHA256},demoAccount=process.env.CONVERSA_DEMO_ACCOUNT||undefined,demoFactory}={}) {
 const production=process.env.NODE_ENV==='production';
 if(production&&(!publicOrigin?.startsWith('https://')||!process.env.CONVERSA_KEY_FILE||!process.env.CONVERSA_OWNER_TOKEN_FILE))throw new Error('Production requires HTTPS origin and external secret files');
 for(const o of [publicOrigin,appOrigin])if(o&&new URL(o).origin!==o)throw new Error('PUBLIC_ORIGIN and APP_ORIGIN must be exact origins');
 if(production&&appOrigin&&(!appOrigin.startsWith('https://')||appOrigin===publicOrigin))throw new Error('APP_ORIGIN must be HTTPS and different from the private panel');
 mkdirSync(dir,{recursive:true,mode:0o700});const unlock=lockDirectory(dir);let store;
 try{store=new Store(dir);}catch(e){unlock();throw e;}
 const tokenPath=process.env.CONVERSA_OWNER_TOKEN_FILE||join(dir,'owner-token');
 if(!existsSync(tokenPath))writeFileSync(tokenPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
 const token=readFileSync(tokenPath,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Owner access must be a 256-bit hexadecimal secret');
 // Live updates: any write a panel shows wakes that workspace's open panels through /api/events, coalesced every 120 ms.
 const streams=new Set(),visible=new Map(),dirty=new Set(),gone=new Set();let version=0,flush=null;
 const changed=(w='owner')=>{version++;dirty.add(w);if(flush)return;flush=setTimeout(()=>{flush=null;for(const s of streams)if(dirty.has(s.w))s.res.write(`event: change\ndata: ${version}\n\n`);dirty.clear();},120);flush.unref?.();};
 // A deleted account's workspace never gets data back from a request or download that was still running.
 for(const name of ['put','remove','clear']){const original=store[name].bind(store);store[name]=(w,b,...rest)=>{if(name==='put'&&gone.has(w))return;const result=original(w,b,...rest);if(['messages','chats','settings','queue'].includes(b))changed(w);return result;};}
 // Workspaces: the owner's private panel ('owner') and one isolated workspace per client account ('u_…').
 const tenants=new Map();
 function wire(t){if(t.connector.history)t.connector.history.onIncoming=(msg,chat)=>{notify(t.w,msg,chat).catch(()=>{});};}
 function makeTenant(w,account){
  const connector=account?.demo?demoFactory(store,w):connectorFactory?connectorFactory(store,w):new Connector(store,w);connector.workspace ||=w;
  if(account&&!account.demo)connector.expectedNumber=account.number;
  connector.history?.backfillLast?.();const bot=new Bot(store,connector,{respond}),t={w,connector,bot,accountId:account?.id||null};wire(t);tenants.set(w,t);if(started)bot.start();return t;}
 let started=false;
 const owner=makeTenant('owner'),connector=owner.connector,bot=owner.bot;
 const tenantOf=account=>tenants.get(account.w)||makeTenant(account.w,account);
 const accounts=()=>store.list('system','accounts',-1).filter(a=>!a.deletedAt);
 const accountByNumber=number=>{const ref=store.get('system','numbers',number);return ref&&store.get('system','accounts',ref.account);};
 // Google Play reviewers sign in with a demo account: fictional chats, nothing ever reaches WhatsApp.
 if(demoAccount&&demoFactory){const [n,...rest]=demoAccount.split(':'),number=normalizeNumber(n),password=rest.join(':');const prior=number&&accountByNumber(number);if(number&&password.length>=8&&(!prior||prior.demo)){(prior?checkPassword(password,prior.passwordHash):Promise.resolve(false)).then(same=>same||hashPassword(password).then(passwordHash=>{const a={id:'demo',w:'demo',number,passwordHash,demo:true,linked:true,createdAt:prior?.createdAt||Date.now(),terms:TERMS_VERSION};store.put('system','accounts','demo',a);store.put('system','numbers',number,{account:'demo'});}));}}
 const ownerWatching=w=>{const now=Date.now();let seen=false;for(const [k,t] of visible){if(now-t>75000)visible.delete(k);else if(k.startsWith(w+'|'))seen=true;}return seen;};
 // Push: only while no panel of that workspace is on screen, at most one per chat every 3 s. The payload is end-to-end encrypted to the device.
 // Topic and tag travel to Google/Apple: keyed HMAC of the chat, never something a phone number can be guessed from.
 const lastPush=new Map(),pushSubject=[publicOrigin,appOrigin].find(o=>o?.startsWith('https://')),topicOf=(w,jid)=>store.index(w,'push-topic',jid).slice(0,32);
 async function notify(w,msg,chat){const subs=store.list(w,'push',-1);if(!subs.length||ownerWatching(w))return;const now=Date.now(),key=w+'|'+chat.jid;if(now-(lastPush.get(key)||0)<3000)return;lastPush.set(key,now);
  const hidden=store.get(w,'settings','push')?.preview===false,brand=store.get(w,'settings','brand'),appName=brand?.name||'Conversa',payload=JSON.stringify({title:hidden?appName:chat.name,body:hidden?'Tienes un mensaje nuevo':msg.text?msg.text.slice(0,140).toWellFormed():[LABELS[msg.kind]||'Mensaje nuevo',msg.detail?.name].filter(Boolean).join(': '),tag:topicOf(w,chat.jid).slice(0,16),jid:chat.jid,...(brand?.icon192?{icon:'/brand/icon-192.png?v='+brand.updatedAt}:{})});
  const keys=vapidKeys(store);for(const sub of subs){const r=await pushSender(sub,payload,keys,{topic:topicOf(w,chat.jid),subject:pushSubject}).catch(()=>({}));if(r.gone)store.remove(w,'push',sub.id);}}
 // Opened files live in memory only (LRU, 80 MB shared by every workspace); the same file requested twice downloads once.
 const mediaCache=new Map(),downloads=new Map(),waiting=[];let cached=0,active=0;
 // At most 3 downloads from WhatsApp at a time (20 waiting); the rest get 503 and the panel keeps the preview.
 const slot=()=>active<3?(active++,Promise.resolve()):waiting.length>=20?null:new Promise(r=>waiting.push(r)),release=()=>{const next=waiting.shift();if(next)next();else active--;};
 const remember=(key,file)=>{mediaCache.set(key,file);cached+=file.data.length;for(const [k,f] of mediaCache){if(cached<=80*1048576)break;mediaCache.delete(k);cached-=f.data.length;}};
 const forget=prefix=>{for(const [k,f] of mediaCache)if(k.startsWith(prefix)){cached-=f.data.length;mediaCache.delete(k);}};
 // Profile photos: one small preview per chat, most recent chats first, refreshed daily; never more than one request at a time, across workspaces.
 const avatars={busy:false,pausedUntil:0,turn:0};
 async function avatarTick(){
  if(avatars.busy||Date.now()<avatars.pausedUntil)return;const ready=[...tenants.values()].filter(t=>t.connector.status==='connected'&&typeof t.connector.profilePicture==='function');if(!ready.length)return;
  avatars.busy=true;
  try{const now=Date.now();let t,next;for(let i=0;i<ready.length&&!next;i++){t=ready[(avatars.turn+i)%ready.length];next=store.list(t.w,'chats',400).filter(c=>!c.deleted&&direct(c.jid)).sort((a,b)=>(b.last?.timestamp||b.latest||0)-(a.last?.timestamp||a.latest||0)).find(c=>{const a=store.get(t.w,'avatars',c.jid);return !a||now-a.at>(a.data?86400000:3*86400000);});}
   avatars.turn++;if(!next)return;
   let link=null;try{link=await t.connector.profilePicture(next.jid);}catch(e){if(e?.output?.statusCode===429||e?.data===429||/rate/i.test(e?.message||'')){avatars.pausedUntil=Date.now()+600000;return;}}
   let data=null,type=null;try{const u=link&&new URL(link);if(u&&u.protocol==='https:'&&/(^|\.)whatsapp\.net$/.test(u.hostname)){const r=await avatarFetch(u.href,{signal:AbortSignal.timeout(8000),redirect:'error'}),ct=(r.headers.get('content-type')||'').split(';')[0].trim();if(r.ok&&/^image\/(jpeg|png|webp)$/.test(ct)&&Number(r.headers.get('content-length')||0)<=300000){const buf=Buffer.from(await r.arrayBuffer());if(buf.length<=300000){data=buf.toString('base64');type=ct;}}}}catch{}
   if(!tenants.has(t.w))return;// account deleted while we waited for WhatsApp
   const chat=t.connector.history.chat(next.jid);if(chat.deleted)return;
   store.put(t.w,'avatars',next.jid,{at:Date.now(),type,data});
   if(data)chat.photo=Date.now();else delete chat.photo;if(data||next.photo)t.connector.history.save(chat);
  }finally{avatars.busy=false;}
 }
 const lite=m=>m.media?.thumb?{...m,media:{...m.media,thumb:undefined}}:m;
 // Profile: large photo and «info» are fetched from WhatsApp only when someone opens a profile (kept briefly in memory).
 const profiles=new Map(),keep=(map,key,value,limit)=>{map.delete(key);map.set(key,value);while(map.size>limit)map.delete(map.keys().next().value);};
 async function profilePhoto(t,jid){const key=t.w+'|photo:'+jid,hit=profiles.get(key);if(hit&&Date.now()-hit.at<3600000)return hit;let photo={at:Date.now(),data:null};
  try{const link=await t.connector.profilePicture(jid,'image'),u=link&&new URL(link);if(u&&u.protocol==='https:'&&/(^|\.)whatsapp\.net$/.test(u.hostname)){const r=await avatarFetch(u.href,{signal:AbortSignal.timeout(8000),redirect:'error'}),ct=(r.headers.get('content-type')||'').split(';')[0].trim();if(r.ok&&/^image\/(jpeg|png|webp)$/.test(ct)&&Number(r.headers.get('content-length')||0)<=1500000){const buf=Buffer.from(await r.arrayBuffer());if(buf.length<=1500000)photo={at:Date.now(),data:buf,type:ct};}}}catch{}
  keep(profiles,key,photo,40);return photo;}
 // Rate limits: by IP (Cloudflare's client IP only when the tunnel is the sole way in) and by number.
 const limits=new Map();
 // Constant cost per check: expired entries are swept every minute and the map never holds more than 20 000 keys.
 const limited=(key,max,windowMs)=>{const now=Date.now(),v=limits.get(key);if(!v||now-v.start>windowMs){limits.delete(key);if(limits.size>=20000)limits.delete(limits.keys().next().value);limits.set(key,{count:1,start:now,window:windowMs});return false;}v.count++;return v.count>max;};
 const signingUp=new Set();
 // Password recovery: a 6-digit code sent from the client's own linked WhatsApp to their «message yourself» chat.
 const recoveries=new Map();
 const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 const panelOrigins=publicOrigin?[publicOrigin]:[`http://127.0.0.1:${port}`],appOrigins=appOrigin?[appOrigin]:publicOrigin?[]:[`http://localhost:${port}`];
 const origins=new Set([...panelOrigins,...appOrigins]),hosts=new Set([...origins].map(x=>new URL(x).host)),appHosts=new Set(appOrigins.map(o=>new URL(o).host));
 // In production the private panel host serves only the owner and the app host only clients. Locally both work everywhere.
 const ownerHost=h=>!publicOrigin||!appHosts.has(h),clientHost=h=>!publicOrigin||appHosts.has(h);
 const secure=[publicOrigin,appOrigin].some(o=>o?.startsWith('https://'));
 // HTTPS: __Host- prefix, so a sibling subdomain of the same company domain cannot plant or overwrite the session cookie.
 const cookieName=secure?'__Host-conversa_session':'conversa_session';
 const cookie=(id,age)=>`${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 // Client sessions last 30 days (a phone app should not ask for the password every day); the record keeps its own key for revocation.
 const startClientSession=(res,account)=>{const id=randomBytes(32).toString('hex'),key=hash(id);store.put('system','sessions',key,{id:key,expiry:Date.now()+30*86400000,account:account.id});res.setHeader('Set-Cookie',cookie(id,30*86400));};
 // Closing sessions also stops the notifications, presence and live streams those sessions had.
 const dropSessions=(account,except)=>{const dropped=new Set();for(const s of store.list('system','sessions',-1))if(s.account===account.id&&s.id&&s.id!==except){store.remove('system','sessions',s.id);dropped.add(s.id);}
  if(!dropped.size)return;for(const sub of store.list(account.w,'push',-1))if(dropped.has(sub.session))store.remove(account.w,'push',sub.id);
  for(const k of visible.keys())if(k.startsWith(account.w+'|')&&dropped.has(k.slice(account.w.length+1).split(':')[0]))visible.delete(k);endStreams(s=>dropped.has(s.sid));};
 const endStreams=match=>{for(const s of streams)if(match(s))s.res.end();};
 async function removeAccount(account){
  const t=tenants.get(account.w);gone.add(account.w);
  if(t){try{if(t.connector.status==='connected')await t.connector.disconnect();}catch{}t.bot.stop();t.connector.pause?.(false);t.connector.stop?.();tenants.delete(account.w);}
  dropSessions(account);
  store.purge(account.w);store.remove('system','numbers',account.number);store.remove('system','accounts',account.id);
  forget(account.w+'|');for(const k of profiles.keys())if(k.startsWith(account.w+'|'))profiles.delete(k);for(const k of visible.keys())if(k.startsWith(account.w+'|'))visible.delete(k);endStreams(s=>s.w===account.w);recoveries.delete(account.number);
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
  const host=req.headers.host;if(!hosts.has(host))return json(403,{error:'Host no permitido.'});
  // The public app (and its legal pages) may be indexed; the private panel never.
  if(!appHosts.has(host)||publicOrigin===undefined)res.setHeader('X-Robots-Tag','noindex, nofollow');
  const url=new URL(req.url,'http://localhost'),path=url.pathname,ip=clientKey(trustProxyIp&&typeof req.headers['cf-connecting-ip']==='string'?req.headers['cf-connecting-ip'].slice(0,64):req.socket.remoteAddress);
  try {
   if(req.method==='GET'&&path==='/healthz')return json(200,{ok:true});
   if(req.method==='GET'&&(['/manifest.webmanifest','/brand/icon-192.png','/brand/icon-512.png'].includes(path)||/^\/brand\/preset\/[a-z]{1,20}\.svg$/.test(path))){
    // The installed app takes the owner's brand when one is set; everyone else gets Conversa.
    const sid0=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1),key0=sid0&&/^[a-f0-9]{64}$/.test(sid0)?hash(sid0):null,s0=key0&&ownerHost(host)&&store.get('owner','sessions',key0),brand=s0?.expiry>Date.now()&&s0.tokenVersion===hash(token)?store.get('owner','settings','brand'):null,owner=!!(s0?.expiry>Date.now()&&s0.tokenVersion===hash(token));
    // Ready-made generic logos (games, calculator, calendar…) to disguise the app: only the super admin sees them.
    if(path.startsWith('/brand/preset/')){const file=join(root,'public','brand-presets',path.slice(14));if(!owner||!existsSync(file))return json(404,{error:'Ruta no encontrada.'});res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'private, max-age=86400'});return res.end(readFileSync(file));}
    if(path==='/manifest.webmanifest'){const m=JSON.parse(readFileSync(join(root,'public','manifest.webmanifest'),'utf8'));if(brand){m.name=m.short_name=m.description=brand.name;if(brand.icon512)m.icons=[{src:'/brand/icon-192.png?v='+brand.updatedAt,sizes:'192x192',type:'image/png'},{src:'/brand/icon-512.png?v='+brand.updatedAt,sizes:'512x512',type:'image/png'},{src:'/brand/icon-512.png?v='+brand.updatedAt,sizes:'512x512',type:'image/png',purpose:'maskable'}];}res.writeHead(200,{'Content-Type':TYPES.webmanifest});return res.end(JSON.stringify(m));}
    const size=path.includes('512')?'512':'192',data=brand?.['icon'+size]?Buffer.from(brand['icon'+size],'base64'):readFileSync(join(root,'public',`icon-${size}.png`));res.writeHead(200,{'Content-Type':'image/png','Content-Length':data.length});return res.end(data);
   }
   if(req.method==='GET'&&Object.hasOwn(PUBLIC,path)){const name=PUBLIC[path];res.writeHead(200,{'Content-Type':TYPES[name.split('.').pop()]});res.end(readFileSync(join(root,'public',name)));return;}
   // Public legal pages (privacy, terms, account deletion) required by app stores.
   if(req.method==='GET'&&/^\/legal\/[a-z-]{1,40}\.(html|css)$/.test(path)){const file=join(root,'public',path);if(!existsSync(file))return json(404,{error:'Página no encontrada.'});res.writeHead(200,{'Content-Type':TYPES[path.split('.').pop()],'Cache-Control':'public, max-age=3600'});res.end(readFileSync(file));return;}
   // Digital Asset Links: lets the Android app (TWA) open the web app full screen, without the browser bar.
   // Android apps (TWA) that may open this site full screen: one or more packages (admin and client apps), comma-separated.
   if(req.method==='GET'&&path==='/.well-known/assetlinks.json'){const fingerprints=String(android?.sha256||'').split(',').map(s=>s.trim().toUpperCase()).filter(s=>/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s)),packages=String(android?.package||'').split(',').map(s=>s.trim()).filter(s=>/^[a-z][\w]*(\.[a-z][\w]*)+$/i.test(s));if(!packages.length||!fingerprints.length)return json(404,{error:'Sin app Android configurada.'});return json(200,packages.map(package_name=>({relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name,sha256_cert_fingerprints:fingerprints}})));}
   // The admin Android app (opens the private panel): downloadable only from the panel host, which Cloudflare Access guards.
   if(req.method==='GET'&&path==='/descargas/conversa-admin.apk'){const file=join(root,'public','downloads','conversa-admin.apk');if(!ownerHost(host)||!existsSync(file))return json(404,{error:'Ruta no encontrada.'});const data=readFileSync(file);res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Length':data.length,'Content-Disposition':'attachment; filename="Conversa-Admin.apk"'});return res.end(data);}
   if(req.method==='GET'&&path==='/api/config')return json(200,{mode:appHosts.has(host)?'app':'panel',signup:accounts().length<maxAccounts,terms:TERMS_VERSION});
   const sid=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   const sidHash=sid&&sid.length===64&&/^[a-f0-9]+$/.test(sid)?hash(sid):null;
   // Who is calling: the owner (private panel) or a client account (its own workspace only).
   let ctx=null;
   if(sidHash&&ownerHost(host)){const s=store.get('owner','sessions',sidHash);if(s?.expiry>Date.now()&&s.tokenVersion===hash(token))ctx={...owner,role:'owner'};}
   if(!ctx&&sidHash&&clientHost(host)){const s=store.get('system','sessions',sidHash),a=s?.expiry>Date.now()&&store.get('system','accounts',s.account);if(a&&!a.deletedAt&&(!a.demo||demoFactory))ctx={...tenantOf(a),role:'client',account:a};}
   const w=ctx?.w,c=ctx?.connector,b=ctx?.bot;
   if(req.method==='GET'){
    if(!ctx)return json(401,{error:'Entra con tu acceso privado.'});
    // Routes that read a workspace's whole message store: generous for a person, a wall for a script.
    if(['/api/chat/messages','/api/chat/media','/api/contact'].includes(path)&&limited('heavy|'+w,240,60000))return json(429,{error:'Demasiadas solicitudes. Espera un momento.'});
    if(path==='/api/export'&&limited('export|'+w,5,600000))return json(429,{error:'Exportaste hace poco. Inténtalo en unos minutos.'});
    if(path==='/api/state'){const pending=ctx.role==='client'&&!ctx.account.linked;
     return json(200,{connection:c.snapshot(),messages:pending?[]:store.list(w,'messages',100).map(m=>({...lite(m),conversationJid:c.history.canonical(m.jid)})),totalMessages:store.count(w,'messages'),chats:pending?[]:store.list(w,'chats',2000),totalChats:store.count(w,'chats'),bot:{...b.config(),aiAvailable:!!respond},queue:store.list(w,'queue',100).map(j=>({state:j.state,timestamp:j.timestamp})),checkedAt:Date.now(),
      workspace:ctx.role==='owner'?{name:'Mi espacio',mode:'Privado • un propietario'}:{name:'+'+ctx.account.number,mode:ctx.account.demo?'Cuenta de demostración':'Tu cuenta'},role:ctx.role,account:ctx.role==='client'?{number:ctx.account.number,linked:!!ctx.account.linked,demo:!!ctx.account.demo,createdAt:ctx.account.createdAt}:null,
      brand:(b=>b?{name:b.name,icon:!!b.icon192,updatedAt:b.updatedAt}:null)(brandAllowed(ctx)?store.get(w,'settings','brand'):null),brandEditable:brandAllowed(ctx),
      notifications:{devices:store.count(w,'push'),preview:store.get(w,'settings','push')?.preview!==false},tests:ctx.role==='owner'&&testEndpoints,keywordTest:ctx.role==='owner'?(t=>t&&{jid:t.jid,expiresAt:t.expiresAt,consumedAt:t.consumedAt||null})(store.get(w,'settings','keyword-test')):null});}
    if(path==='/api/messages'){const offset=Math.max(0,Math.min(10000000,Number(url.searchParams.get('offset'))||0));return json(200,{messages:store.list(w,'messages',100,offset).map(m=>({...lite(m),conversationJid:c.history.canonical(m.jid)})),total:store.count(w,'messages')});}
    if(path==='/api/chat/messages'){
     // One chat's history, newest page first; `before` pages back in time.
     const jid=url.searchParams.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});
     const target=c.history.canonical(jid),before=Number(url.searchParams.get('before'))||Infinity;
     const all=store.list(w,'messages',-1).filter(m=>m.timestamp<before&&c.history.canonical(m.jid)===target).sort((x,y)=>x.timestamp-y.timestamp);
     return json(200,{messages:all.slice(-150).map(m=>({...m,conversationJid:target,...(m.media?{media:{...m.media,available:!!store.get(w,'media',m.id)}}:{})})),more:all.length>150});
    }
    if(path==='/api/events'){
     if([...streams].filter(s=>s.w===w).length>=8||streams.size>=400)return json(429,{error:'Demasiadas pestañas abiertas.'});
     res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no'});res.write('retry: 3000\n\n');
     const stream={res,sid:sidHash,w,role:ctx.role};streams.add(stream);
     // Every 25 s: keeps proxies from closing the stream and ends it once the session is gone.
     const alive=()=>{if(stream.role==='owner'){const s=store.get('owner','sessions',stream.sid);return s?.expiry>Date.now()&&s.tokenVersion===hash(token);}const s=store.get('system','sessions',stream.sid);return s?.expiry>Date.now()&&!!store.get('system','accounts',s.account);};
     const ping=setInterval(()=>{if(!alive())return res.end();res.write(': ping\n\n');},25000);
     req.on('close',()=>{clearInterval(ping);streams.delete(stream);});return;
    }
    if(path==='/api/media'){
     const id=url.searchParams.get('id')||'',m=id.length<300&&store.get(w,'messages',id),source=m&&!m.viewOnce&&store.get(w,'media',id),key=w+'|'+id;
     if(!source)return json(404,{error:'Archivo no disponible.'});
     let file=mediaCache.get(key);
     if(file){mediaCache.delete(key);mediaCache.set(key,file);}
     else{
      if((source.message.fileLength||0)>MEDIA_MAX)return json(413,{error:'Archivo demasiado grande: ábrelo en WhatsApp.'});
      if(c.status!=='connected'||typeof c.downloadMedia!=='function')return json(409,{error:'Conecta WhatsApp para abrir archivos.'});
      try{let pending=downloads.get(key);if(!pending){const turn=slot();if(!turn)return json(503,{error:'Demasiadas descargas a la vez. Inténtalo en un momento.'});pending=turn.then(()=>c.downloadMedia(source,{max:MEDIA_MAX})).finally(release);downloads.set(key,pending);pending.finally(()=>downloads.delete(key)).catch(()=>{});}
       const data=Buffer.from(await pending);if(data.length>MEDIA_MAX)return json(413,{error:'Archivo demasiado grande: ábrelo en WhatsApp.'});
       const base=String(source.message.mimetype||'').split(';')[0].trim().toLowerCase();file={data,type:INLINE.test(base)?base:'application/octet-stream',name:String(m.media?.name||'archivo').replace(/[\u0000-\u001f"\\]/g,'').slice(0,150).toWellFormed()||'archivo'};if(!mediaCache.has(key)&&tenants.has(w))remember(key,file);}
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
     const a=store.get(w,'avatars',c.history.canonical(jid));if(!a?.data)return json(404,{error:'Sin foto.'});
     const data=Buffer.from(a.data,'base64');res.writeHead(200,{'Content-Type':a.type,'Content-Length':data.length,'Cache-Control':'private, max-age=86400'});return res.end(data);
    }
    if(path==='/api/contact'){
     const jid=url.searchParams.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});const chat=c.history.chat(jid);if(chat.deleted)return json(404,{error:'Chat borrado.'});
     const aboutKey=w+'|about:'+chat.jid;let about=profiles.get(aboutKey);if(!about||Date.now()-about.at>3600000){about={at:Date.now(),text:await c.contactAbout?.(chat.jid)||null};if(about.text||c.status==='connected')keep(profiles,aboutKey,about,400);}
     const files=store.list(w,'messages',-1).filter(m=>c.history.canonical(m.jid)===chat.jid&&['image','video','document','audio'].includes(m.kind));
     return json(200,{jid:chat.jid,name:chat.name,number:/@s\.whatsapp\.net$/.test(chat.jid)?chat.jid.split('@')[0]:null,photo:chat.photo||null,about:about.text,files:{photos:files.filter(m=>['image','video'].includes(m.kind)).length,documents:files.filter(m=>m.kind==='document').length,audio:files.filter(m=>m.kind==='audio').length}});
    }
    if(path==='/api/chat/media'){
     // Shared photos, videos and documents of one chat, newest first, with WhatsApp's small previews.
     const jid=url.searchParams.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});const target=c.history.canonical(jid);
     const items=store.list(w,'messages',-1).filter(m=>c.history.canonical(m.jid)===target&&['image','video','document'].includes(m.kind)).sort((x,y)=>y.timestamp-x.timestamp).slice(0,120);
     return json(200,{items:items.map(m=>({id:m.id,kind:m.kind,text:m.text?m.text.slice(0,200):'',fromMe:!!m.fromMe,timestamp:m.timestamp,media:m.media?{...m.media,available:!!store.get(w,'media',m.id)}:null}))});
    }
    if(path==='/api/avatar/full'){
     const jid=url.searchParams.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});const chat=c.history.chat(jid);if(chat.deleted||c.status!=='connected')return json(404,{error:'Sin foto.'});
     const photo=await profilePhoto(ctx,chat.jid);if(!photo.data)return json(404,{error:'Sin foto.'});res.writeHead(200,{'Content-Type':photo.type,'Content-Length':photo.data.length,'Cache-Control':'private, no-store'});return res.end(photo.data);
    }
    if(path==='/api/push/key')return json(200,{publicKey:vapidKeys(store).publicKey});
    if(path==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="conversa-mensajes.json"');return json(200,{exportedAt:new Date().toISOString(),messages:store.list(w,'messages',-1),chats:store.list(w,'chats',-1)});}
    // The owner sees how many client accounts exist (no message content).
    if(path==='/api/admin/accounts'&&ctx.role==='owner')return json(200,{max:maxAccounts,accounts:accounts().map(a=>({number:a.number.slice(0,-4).replace(/\d/g,'•')+a.number.slice(-4),createdAt:a.createdAt,linked:!!a.linked,demo:!!a.demo,status:tenants.get(a.w)?.connector.status||'paused'}))});
    return json(404,{error:'Ruta no encontrada.'});
   }
   if(req.method!=='POST')return json(404,{error:'Ruta no encontrada.'});
   if(!origins.has(req.headers.origin)||req.headers['content-type']!=='application/json')return json(403,{error:'Solicitud no permitida.'});
   let body='';const limit=path==='/api/bot/config'?128000:path==='/api/brand'?1600000:4096;for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>limit)return json(413,{error:'Solicitud demasiado grande.'});}
   let input;try{input=JSON.parse(body||'{}');if(!input||typeof input!=='object'||Array.isArray(input))throw new Error();}catch{return json(400,{error:'Solicitud inválida.'});}
   // The account may have been deleted while the body was arriving.
   if(ctx?.role==='client'&&(gone.has(ctx.w)||!store.get('system','accounts',ctx.account.id)))return json(401,{error:'Tu sesión terminó. Vuelve a entrar.'});
   if(path==='/api/login'){
    if(!ownerHost(host))return json(404,{error:'Ruta no encontrada.'});
    if(limited('owner-login|'+ip,10,60000))return json(429,{error:'Demasiados intentos. Espera un minuto.'});
    if(!equal(input.token,token))return json(401,{error:'Acceso privado inválido.'});
    const id=randomBytes(32).toString('hex');store.put('owner','sessions',hash(id),{expiry:Date.now()+43200000,tokenVersion:hash(token)});store.trim('owner','sessions',20);
    res.setHeader('Set-Cookie',cookie(id,43200));return json(200,{ok:true});
   }
   // ---- Client accounts (public app) ----
   if(path.startsWith('/api/account/')&&!['/api/account/delete','/api/account/password'].includes(path)){
    if(!clientHost(host))return json(404,{error:'Ruta no encontrada.'});
    const number=normalizeNumber(input.number);if(!number)return json(400,{error:'Escribe tu número de WhatsApp con el código de país, por ejemplo 51 999 888 777.'});
    if(path==='/api/account/signup'){
     if(limited('signup|'+ip,5,3600000))return json(429,{error:'Demasiados registros desde esta conexión. Inténtalo en una hora.'});
     if(signingUp.has(number))return json(409,{error:'Ese número ya se está registrando. Espera un momento.'});
     if(typeof input.password!=='string'||input.password.length<8||input.password.length>128)return json(400,{error:'La contraseña debe tener entre 8 y 128 caracteres.'});
     if(input.accept!==true)return json(400,{error:'Para continuar, acepta las condiciones y el aviso sobre la conexión no oficial.'});
     let account=accountByNumber(number);
     // An unfinished sign-up (never linked) older than 10 minutes can be started again; anything else belongs to someone.
     if(account&&(account.linked||Date.now()-account.createdAt<600000))return json(409,{error:'Ese número ya tiene una cuenta. Entra o recupera tu contraseña.'});
     // Each sign-up makes WhatsApp show a linking request on that phone: at most 5 an hour per number.
     if(limited('pair-number|'+number,5,3600000))return json(429,{error:'Demasiados intentos con este número. Inténtalo en una hora.'});
     signingUp.add(number);try{
     if(account)await removeAccount(account);
     if(accounts().length>=maxAccounts)return json(503,{error:'Por ahora no hay plazas disponibles. Inténtalo más tarde.'});
     account={id:randomBytes(12).toString('hex'),w:'u_'+randomBytes(8).toString('hex'),number,passwordHash:await hashPassword(input.password),linked:false,createdAt:Date.now(),acceptedAt:Date.now(),terms:TERMS_VERSION};
     store.put('system','accounts',account.id,account);store.put('system','numbers',number,{account:account.id});
     const t=tenantOf(account);await t.connector.pair(number);startClientSession(res,account);
     // WhatsApp usually answers within a few seconds; the app also keeps polling /api/state for it.
     for(let i=0;i<40&&!t.connector.pairingCode&&t.connector.status!=='error'&&t.connector.status!=='disconnected';i++)await new Promise(r=>setTimeout(r,250));
     return json(200,{ok:true,pairingCode:t.connector.pairingCode||null});
     }finally{signingUp.delete(number);}
    }
    if(path==='/api/account/login'){
     if(limited('login|'+ip,10,60000)||limited('login-number|'+number,10,900000))return json(429,{error:'Demasiados intentos. Espera unos minutos.'});
     const account=accountByNumber(number);
     // Same answer and similar time whether the number exists or not.
     const ok=await checkPassword(input.password,account?.passwordHash||'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
     if(!account||!ok)return json(401,{error:'Número o contraseña incorrectos.'});
     startClientSession(res,account);return json(200,{ok:true,linked:!!account.linked});
    }
    if(path==='/api/account/recover'){
     if(limited('recover-ip|'+ip,10,3600000)||limited('recover|'+number,5,3600000))return json(429,{error:'Demasiados intentos. Inténtalo en una hora.'});
     const account=accountByNumber(number),t=account&&!account.demo&&tenants.get(account.w);
     if(!t||t.connector.status!=='connected'||!t.connector.socket)return json(200,{method:'support'});
     const code=String(randomInt(0,1000000)).padStart(6,'0');recoveries.set(number,{hash:hash(code+number),expires:Date.now()+600000,attempts:0});
     // Sent to the account's own chat with an id the history skips, so a session cookie alone never reveals the code.
     const messageId=randomBytes(16).toString('hex').toUpperCase();t.connector.history?.skip?.(messageId);
     try{await t.connector.socket.sendMessage(number+'@s.whatsapp.net',{text:`Conversa: tu código para crear una contraseña nueva es ${code}. Caduca en 10 minutos. Si no lo pediste, ignora este mensaje.`},{messageId});}catch{return json(200,{method:'support'});}
     return json(200,{method:'code'});
    }
    if(path==='/api/account/recover/verify'){
     const r=recoveries.get(number),account=accountByNumber(number);
     if(!r||!account||r.expires<Date.now()||r.attempts>=5){recoveries.delete(number);return json(400,{error:'El código caducó. Pide uno nuevo.'});}
     r.attempts++;if(typeof input.code!=='string'||!equal(hash(input.code.trim()+number),r.hash))return json(400,{error:'Código incorrecto.'});
     if(typeof input.password!=='string'||input.password.length<8||input.password.length>128)return json(400,{error:'La contraseña debe tener entre 8 y 128 caracteres.'});
     recoveries.delete(number);const passwordHash=await hashPassword(input.password),fresh=accountByNumber(number);
     if(!fresh||fresh.id!==account.id)return json(400,{error:'El código caducó. Pide uno nuevo.'});
     store.put('system','accounts',fresh.id,{...fresh,passwordHash});
     // A new password closes every other session of that account.
     dropSessions(fresh);startClientSession(res,fresh);return json(200,{ok:true});
    }
    return json(404,{error:'Ruta no encontrada.'});
   }
   if(!ctx)return json(401,{error:'Tu sesión terminó. Vuelve a entrar.'});
   // Logging out (or revoking every session) also stops that device's notifications and clears what the browser cached.
   if(path==='/api/logout'){store.remove(ctx.role==='owner'?'owner':'system','sessions',sidHash);for(const k of visible.keys())if(k.startsWith(w+'|'+sidHash))visible.delete(k);endStreams(s=>s.sid===sidHash);for(const sub of store.list(w,'push',-1))if(sub.session===sidHash)store.remove(w,'push',sub.id);res.setHeader('Set-Cookie',cookie('',0));res.setHeader('Clear-Site-Data','"cache"');}
   else if(path==='/api/revoke-sessions'){if(ctx.role==='owner')store.clear('owner','sessions');else dropSessions(ctx.account);store.clear(w,'push');for(const k of visible.keys())if(k.startsWith(w+'|'))visible.delete(k);endStreams(s=>s.w===w);res.setHeader('Set-Cookie',cookie('',0));res.setHeader('Clear-Site-Data','"cache"');}
   else if(path==='/api/account/delete'){
    if(ctx.role!=='client')return json(404,{error:'Ruta no encontrada.'});if(ctx.account.demo)return json(400,{error:'La cuenta de demostración no se puede eliminar.'});
    if(limited('delete|'+ctx.account.id,5,3600000))return json(429,{error:'Demasiados intentos. Inténtalo en una hora.'});
    if(!await checkPassword(input.password,ctx.account.passwordHash))return json(401,{error:'Contraseña incorrecta.'});
    if(store.get('system','accounts',ctx.account.id))await removeAccount(ctx.account);res.setHeader('Set-Cookie',cookie('',0));res.setHeader('Clear-Site-Data','"cache", "storage"');return json(200,{ok:true,deleted:true});
   }
   else if(path==='/api/account/password'){
    if(ctx.role!=='client')return json(404,{error:'Ruta no encontrada.'});if(ctx.account.demo)return json(400,{error:'La cuenta de demostración no cambia de contraseña.'});
    if(limited('password-ip|'+ip,20,3600000)||limited('password|'+ctx.account.id,5,900000))return json(429,{error:'Demasiados intentos. Espera unos minutos.'});
    if(!await checkPassword(input.current,ctx.account.passwordHash))return json(401,{error:'La contraseña actual no es correcta.'});
    if(typeof input.password!=='string'||input.password.length<8||input.password.length>128)return json(400,{error:'La contraseña debe tener entre 8 y 128 caracteres.'});
    const passwordHash=await hashPassword(input.password),fresh=store.get('system','accounts',ctx.account.id);
    if(!fresh)return json(401,{error:'Tu sesión terminó. Vuelve a entrar.'});
    store.put('system','accounts',fresh.id,{...fresh,passwordHash});dropSessions(fresh,sidHash);
   }
   else if(path==='/api/brand'){
    if(!brandAllowed(ctx))return json(404,{error:'Ruta no encontrada.'});
    if(input.reset===true){store.remove(w,'settings','brand');return json(200,{brand:null});}
    const name=typeof input.name==='string'?input.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,30).toWellFormed():'';if(!name)throw new Error('Escribe un nombre de hasta 30 caracteres.');
    const prior=store.get(w,'settings','brand')||{},brand={name,updatedAt:Date.now()};
    // Logo: two square PNGs made in the browser (192 and 512 px); checked by signature and size, never served as anything else.
    for(const [field,px,max] of [['icon192',192,250000],['icon512',512,900000]]){const v=input[field];if(v===undefined){if(prior[field])brand[field]=prior[field];continue;}if(typeof v!=='string'||!v.startsWith('data:image/png;base64,'))throw new Error('El logo debe ser una imagen.');const buf=Buffer.from(v.slice(22),'base64'),dims=pngSize(buf);if(!dims||dims[0]!==px||dims[1]!==px||buf.length>max)throw new Error('No se pudo usar esa imagen como logo.');brand[field]=buf.toString('base64');}
    if(!brand.icon192!==!brand.icon512)throw new Error('No se pudo usar esa imagen como logo.');
    store.put(w,'settings','brand',brand);return json(200,{brand:{name:brand.name,icon:!!brand.icon192,updatedAt:brand.updatedAt}});
   }
   else if(path==='/api/presence'){const tab=typeof input.tab==='string'&&/^[a-z0-9-]{1,64}$/i.test(input.tab)?input.tab:'',prefix=w+'|'+sidHash+':',key=prefix+tab;
    if(input.visible===true){if(!visible.has(key)){let mine=0;for(const k of visible.keys())if(k.startsWith(prefix))mine++;if(mine>=6||visible.size>=5000)return json(429,{error:'Demasiadas pestañas abiertas.'});}visible.set(key,Date.now());}else visible.delete(key);}
   else if(path==='/api/push/subscribe'){const sub=validSubscription(input.subscription),id=hash(sub.endpoint);store.put(w,'push',id,{...sub,id,session:sidHash,createdAt:Date.now()});store.trim(w,'push',10);}
   else if(path==='/api/push/unsubscribe'){if(typeof input.endpoint==='string')store.remove(w,'push',hash(input.endpoint));}
   else if(path==='/api/push/settings'){if(typeof input.preview!=='boolean')throw new Error('Ajuste inválido');store.put(w,'settings','push',{preview:input.preview});}
   else if(path==='/api/push/test'){const keys=vapidKeys(store),subs=store.list(w,'push',-1),brand=store.get(w,'settings','brand');let sent=0;for(const sub of subs){const r=await pushSender(sub,JSON.stringify({title:brand?.name||'Conversa',body:'Notificaciones activas.',tag:'conversa-test',...(brand?.icon192?{icon:'/brand/icon-192.png?v='+brand.updatedAt}:{})}),keys,{subject:pushSubject}).catch(()=>({}));if(r.ok)sent++;if(r.gone)store.remove(w,'push',sub.id);}return json(200,{sent,devices:subs.length});}
   else if(path==='/api/connect'){
    // Clients link (or re-link) with a code for their own number; the owner keeps the QR.
    if(ctx.role==='client'&&!ctx.account.demo&&(!ctx.account.linked||!store.get(w,'auth','creds'))){if(limited('pair|'+ctx.account.id,6,3600000)||limited('pair-number|'+ctx.account.number,5,3600000))throw new Error('Pediste muchos códigos. Espera un rato e inténtalo de nuevo.');await c.pair(ctx.account.number);}
    else await c.connect();
   }
   else if(path==='/api/pause')c.pause();
   else if(path==='/api/disconnect')await c.disconnect();
   else if(path==='/api/bot/test'&&testEndpoints&&ctx.role==='owner')return json(200,b.armKeywordTest(input.jid));
   else if(path==='/api/bot/config')return json(200,{bot:b.configure(input)});
   else if(path==='/api/chat/send-standard-once'&&testEndpoints&&ctx.role==='owner')return json(200,await b.sendStandardOnce(input));
   else if(path==='/api/bot/preview')return json(200,{text:await b.preview(input.text)});
   else if(path==='/api/chat/send'){if(!direct(input.jid))throw new Error('Chat inválido');if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw new Error('Escribe un mensaje de hasta 4000 caracteres.');if(input.quoteId!==undefined&&(typeof input.quoteId!=='string'||input.quoteId.length>300))throw new Error('No se encontró el mensaje citado.');return json(200,await b.sendManual(input.jid,input.text,{quoteId:input.quoteId}));}
   else if(path==='/api/chat/react'){if(typeof input.id!=='string'||input.id.length>300||!REACTIONS.has(input.emoji))throw new Error('Reacción no disponible.');return json(200,await b.react(input.id,input.emoji));}
   else if(path==='/api/chat/read'){if(!direct(input.jid))throw new Error('Chat inválido');const chat=c.history.chat(input.jid);if(chat.unread){chat.unread=0;c.history.save(chat);}}
   else if(path==='/api/chat/review'){if(typeof input.enabled!=='boolean')throw new Error('Selección inválida');c.history.review(input.jid,input.enabled);}
   else if(path==='/api/history/more'){
    if(!direct(input.jid))throw new Error('Chat inválido');
    if(c.status!=='connected')throw new Error('Conecta WhatsApp primero.');
    // WhatsApp only sends older messages counted back from one we already have (any of the contact's addresses).
    const target=c.history.canonical(input.jid),oldest=store.list(w,'messages',-1).filter(m=>m.key?.id&&c.history.canonical(m.jid)===target).sort((x,y)=>x.timestamp-y.timestamp)[0];
    if(!oldest)throw new Error('Este chat no tiene mensajes guardados, y WhatsApp solo entrega los anteriores a partir de uno que ya tengamos. Aparecerán cuando el contacto te escriba o le escribas.');
    try{await c.socket.fetchMessageHistory(50,{remoteJid:oldest.key.remoteJid||oldest.jid,fromMe:!!oldest.key.fromMe,id:oldest.key.id},Math.floor(oldest.timestamp/1000));}catch{throw new Error('WhatsApp no aceptó la petición. Inténtalo de nuevo en unos minutos.');}
   }
   else if(path==='/api/chat/delete'){
    if(!direct(input.jid))throw new Error('Chat inválido');
    const chat=c.history.chat(input.jid);chat.enabled=false;chat.deleted=true;chat.classification='old';chat.name='Contacto eliminado';delete chat.earliest;delete chat.latest;c.history.save(chat);
    for(const m of store.list(w,'messages',-1))if(c.history.canonical(m.jid)===chat.jid){store.remove(w,'messages',m.id);store.remove(w,'media',m.id);forget(w+'|'+m.id);}
    store.remove(w,'avatars',chat.jid);profiles.delete(w+'|photo:'+chat.jid);profiles.delete(w+'|about:'+chat.jid);delete chat.photo;c.history.save(chat);
    for(const j of store.list(w,'queue',-1))if(c.history.canonical(j.jid)===chat.jid)store.remove(w,'queue',j.id);
   }else return json(404,{error:'Ruta no encontrada.'});
   return json(200,{ok:true});
  }catch(error){return json(400,{error:ERRORS_SHOWN.includes(path)?error.message:'No se pudo completar la acción.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 let closed=false,monitor,watch,avatarTimer,sweeper,lastStatus;const signals=new Map();
 // The phone's own chat hears about every new link, so a number registered by someone else is noticed at once.
 function linkNotice(t,a){const messageId=randomBytes(16).toString('hex').toUpperCase();t.connector.history?.skip?.(messageId);
  Promise.resolve(t.connector.socket?.sendMessage(a.number+'@s.whatsapp.net',{text:'Conversa quedó vinculada a este WhatsApp. En Dispositivos vinculados aparece como «Chrome (Ubuntu)». Si no fuiste tú, ciérrala ahí.'},{messageId})).catch(()=>{});}
 // Every minute: expired limits and presence go away, and sign-ups never confirmed on the phone free their number and place after 30 minutes.
 async function housekeeping(now=Date.now()){
  for(const [k,v] of limits)if(now-v.start>v.window)limits.delete(k);for(const [k,seen] of visible)if(now-seen>75000)visible.delete(k);for(const [n,r] of recoveries)if(r.expires<now)recoveries.delete(n);
  for(const a of accounts())if(!a.linked&&!a.demo&&now-a.createdAt>1800000&&!signingUp.has(a.number)&&tenants.get(a.w)?.connector.status!=='connected')await removeAccount(a);
 }
 return {server,store,connector,bot,tenants,avatarTick,changed,start:async()=>{
   started=true;await connector.resume?.();bot.start();
   // Client workspaces that finished linking reconnect on their own after a restart, like the owner's.
   for(const a of accounts())if(a.linked&&(!a.demo||demoFactory)){const t=tenantOf(a);try{await t.connector.resume?.();}catch{}}
   monitor=setInterval(()=>{if(connector.status!==lastStatus){lastStatus=connector.status;console.log(JSON.stringify({event:'connection_status',status:lastStatus,at:new Date().toISOString()}));}},5000);monitor.unref?.();
   // Connection state lives in memory (status, QR, pairing code): watch it so the panel hears about it at once.
   // A client whose code was accepted (connected with its own number) becomes a linked account.
   watch=setInterval(()=>{for(const t of tenants.values()){const k=t.connector,signal=[k.status,k.qr,k.pairingCode,k.note,k.identity?.number].join('|');if(signal!==signals.get(t.w)){signals.set(t.w,signal);changed(t.w);}
     if(t.accountId&&k.status==='connected'){const a=store.get('system','accounts',t.accountId);if(a&&!a.linked){a.linked=true;a.linkedAt=Date.now();store.put('system','accounts',a.id,a);changed(t.w);if(!a.demo)linkNotice(t,a);}}}},500);watch.unref?.();
   avatarTimer=setInterval(()=>{avatarTick().catch(()=>{});},1500);avatarTimer.unref?.();
   sweeper=setInterval(()=>{housekeeping().catch(()=>{});},60000);sweeper.unref?.();},
  housekeeping,close:()=>{if(closed)return;closed=true;clearInterval(monitor);clearInterval(watch);clearInterval(avatarTimer);clearInterval(sweeper);clearTimeout(flush);for(const s of streams)s.res.end();for(const t of tenants.values()){t.bot.stop();t.connector.pause?.(false);t.connector.stop?.();}server.close();store.close();unlock();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4318),host=process.env.HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&process.env.NODE_ENV!=='production')throw new Error('Public binding requires production configuration');
 // The reviewer demo account (CONVERSA_DEMO_ACCOUNT=number:password) runs on fictional data from the preview.
 let demoFactory;if(process.env.CONVERSA_DEMO_ACCOUNT){const [{demoConnector,seedDemo},{DEMO_MEDIA}]=await Promise.all([import('../scripts/demo-data.mjs'),import('../scripts/demo-media.mjs')]);
  demoFactory=(store,w)=>{const c=demoConnector(store,{History,qr:null,media:DEMO_MEDIA,workspace:w});if(!store.count(w,'messages'))seedDemo({store,history:c.history,bot:new Bot(store,c),media:DEMO_MEDIA});return c;};}
 const app=createApp({port,demoFactory});app.server.listen(port,host,async()=>{console.log(JSON.stringify({event:'server_started',port}));try{await app.start();}catch{console.error(JSON.stringify({event:'resume_failed'}));}});
 app.server.on('error',()=>{app.close();process.exit(1);});for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{app.close();process.exit(0);});
}
