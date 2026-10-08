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
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
// Auxiliary admin test routes (/api/bot/test, /api/chat/send-standard-once) stay off in production unless explicitly enabled.
export const testEndpointsEnabled=(env=process.env)=>env.CONVERSA_TEST_ENDPOINTS==='on'||(env.NODE_ENV!=='production'&&env.CONVERSA_TEST_ENDPOINTS!=='off');
export function createApp({dir=process.env.CONVERSA_DATA_DIR||join(root,'.data'),port=4318,connectorFactory,respond,publicOrigin=process.env.PUBLIC_ORIGIN,testEndpoints=testEndpointsEnabled()}={}) {
 const production=process.env.NODE_ENV==='production';
 if(production&&(!publicOrigin?.startsWith('https://')||!process.env.CONVERSA_KEY_FILE||!process.env.CONVERSA_OWNER_TOKEN_FILE))throw new Error('Production requires HTTPS origin and external secret files');
 if(publicOrigin&&new URL(publicOrigin).origin!==publicOrigin)throw new Error('PUBLIC_ORIGIN must be an exact origin');
 mkdirSync(dir,{recursive:true,mode:0o700});const unlock=lockDirectory(dir);let store;
 try{store=new Store(dir);}catch(e){unlock();throw e;}
 const tokenPath=process.env.CONVERSA_OWNER_TOKEN_FILE||join(dir,'owner-token');
 if(!existsSync(tokenPath))writeFileSync(tokenPath,randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});
 const token=readFileSync(tokenPath,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Owner access must be a 256-bit hexadecimal secret');
 const connector=connectorFactory?connectorFactory(store):new Connector(store);const bot=new Bot(store,connector,{respond});
 const attempts=new Map();
 const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
 const origins=new Set(publicOrigin?[publicOrigin]:[`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
 const hosts=new Set([...origins].map(x=>new URL(x).host));const secure=publicOrigin?.startsWith('https://');
 const cookie=(id,age)=>`conversa_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
  if(!hosts.has(req.headers.host))return json(403,{error:'Host no permitido.'});
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  try {
   if(req.method==='GET'&&path==='/healthz')return json(200,{ok:true});
   if(req.method==='GET'&&['/','/app.js','/styles.css','/icon.svg'].includes(path)){const name=path==='/'?'index.html':path.slice(1),type=name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html';res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(readFileSync(join(root,'public',name)));return;}
   const sid=req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith('conversa_session='))?.slice(17);
   const session=sid&&sid.length===64?store.get('owner','sessions',hash(sid)):null;
   const authenticated=session?.expiry>Date.now()&&session.tokenVersion===hash(token);
   if(req.method==='GET'){
    if(!authenticated)return json(401,{error:'Entra con tu acceso privado.'});
    if(path==='/api/state')return json(200,{connection:connector.snapshot(),messages:store.list('owner','messages',100).map(m=>({...m,conversationJid:connector.history.canonical(m.jid)})),totalMessages:store.count('owner','messages'),chats:store.list('owner','chats',200),bot:{...bot.config(),aiAvailable:!!respond},queue:store.list('owner','queue',100).map(j=>({state:j.state,timestamp:j.timestamp})),checkedAt:Date.now(),workspace:{name:'Mi espacio',mode:'Privado • un propietario'},tests:testEndpoints,keywordTest:(t=>t&&{jid:t.jid,expiresAt:t.expiresAt,consumedAt:t.consumedAt||null})(store.get('owner','settings','keyword-test'))});
    if(path==='/api/messages'){const offset=Math.max(0,Math.min(10000000,Number(url.searchParams.get('offset'))||0));return json(200,{messages:store.list('owner','messages',100,offset).map(m=>({...m,conversationJid:connector.history.canonical(m.jid)})),total:store.count('owner','messages')});}
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
   if(path==='/api/logout'){store.remove('owner','sessions',hash(sid));res.setHeader('Set-Cookie',cookie('',0));}
   else if(path==='/api/revoke-sessions'){store.clear('owner','sessions');res.setHeader('Set-Cookie',cookie('',0));}
   else if(path==='/api/connect')await connector.connect();
   else if(path==='/api/pause')connector.pause();
   else if(path==='/api/disconnect')await connector.disconnect();
   else if(path==='/api/bot/test'&&testEndpoints)return json(200,bot.armKeywordTest(input.jid));
   else if(path==='/api/bot/config')return json(200,{bot:bot.configure(input)});
   else if(path==='/api/chat/send-standard-once'&&testEndpoints)return json(200,await bot.sendStandardOnce(input));
   else if(path==='/api/bot/preview')return json(200,{text:await bot.preview(input.text)});
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
    for(const m of store.list('owner','messages',-1))if(connector.history.canonical(m.jid)===chat.jid)store.remove('owner','messages',m.id);
    for(const j of store.list('owner','queue',-1))if(connector.history.canonical(j.jid)===chat.jid)store.remove('owner','queue',j.id);
   }else return json(404,{error:'Ruta no encontrada.'});
   return json(200,{ok:true});
  }catch(error){return json(400,{error:['/api/disconnect','/api/bot/config','/api/chat/review','/api/bot/preview'].includes(path)?error.message:'No se pudo completar la acción.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 let closed=false,monitor,lastStatus;
 return {server,store,connector,bot,start:async()=>{await connector.resume?.();bot.start();monitor=setInterval(()=>{if(connector.status!==lastStatus){lastStatus=connector.status;console.log(JSON.stringify({event:'connection_status',status:lastStatus,at:new Date().toISOString()}));}},5000);monitor.unref?.();},close:()=>{if(closed)return;closed=true;clearInterval(monitor);bot.stop();connector.pause(false);server.close();store.close();unlock();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||4318),host=process.env.HOST||'127.0.0.1';
 if(!['127.0.0.1','localhost','::1'].includes(host)&&process.env.NODE_ENV!=='production')throw new Error('Public binding requires production configuration');
 const app=createApp({port});app.server.listen(port,host,async()=>{console.log(JSON.stringify({event:'server_started',port}));try{await app.start();}catch{console.error(JSON.stringify({event:'resume_failed'}));}});
 app.server.on('error',()=>{app.close();process.exit(1);});for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{app.close();process.exit(0);});
}
