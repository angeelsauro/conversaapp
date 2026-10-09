// Genera dist/conversa-demo.html: el panel real en un solo archivo, con datos ficticios, sin servidor ni WhatsApp.
// Se abre con doble clic. Ejecuta el código real de src/history.mjs y src/bot.mjs sobre un almacén en memoria;
// las rutas /api/* se atienden en el navegador imitando src/server.mjs. Uso: npm run demo
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,resolve} from 'node:path';
import QRCode from 'qrcode';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),read=p=>readFileSync(join(root,p),'utf8');
const module=p=>read(p).replace(/^import .*$/gm,'').replace(/^export /gm,'');
const qr=await QRCode.toDataURL('Vista previa de Conversa. Este código no vincula ningún dispositivo.',{width:300,margin:2,errorCorrectionLevel:'M'});
const icon='data:image/svg+xml;base64,'+Buffer.from(read('public/icon.svg')).toString('base64');
const index=read('public/index.html'),body=index.slice(index.indexOf('<body>')+6,index.lastIndexOf('</body>'));

const runtime=`(()=>{
const randomBytes=n=>({toString:()=>Array.from(crypto.getRandomValues(new Uint8Array(n)),b=>b.toString(16).padStart(2,'0')).join('')});
// Same interface as src/store.mjs, in memory and without encryption: the demo holds fictional data only.
class Store{
 constructor(){this.rows=new Map();this.seq=0;}
 key(w,b,id){return JSON.stringify([w,b,id]);}
 get(w,b,id){const r=this.rows.get(this.key(w,b,id));return r?JSON.parse(r.value):null;}
 put(w,b,id,value){this.rows.set(this.key(w,b,id),{w,b,value:JSON.stringify(value),updated:++this.seq});}
 remove(w,b,id){this.rows.delete(this.key(w,b,id));}
 clear(w,b){for(const[k,r]of this.rows)if(r.w===w&&r.b===b)this.rows.delete(k);}
 list(w,b,limit=500,offset=0){const all=[...this.rows.values()].filter(r=>r.w===w&&r.b===b).sort((x,y)=>y.updated-x.updated);return (limit<0?all.slice(offset):all.slice(offset,offset+limit)).map(r=>JSON.parse(r.value));}
 count(w,b){let n=0;for(const r of this.rows.values())if(r.w===w&&r.b===b)n++;return n;}
 trim(){}
 transaction(fn){return fn();}
}
${module('src/history.mjs')}
${module('src/bot.mjs')}
${module('scripts/demo-data.mjs')}
${module('scripts/demo-media.mjs')}
const store=new Store(),connector=demoConnector(store,{History,qr:${JSON.stringify(qr)},media:DEMO_MEDIA}),bot=new Bot(store,connector);
seedDemo({store,history:connector.history,bot,media:DEMO_MEDIA});connector.resume();bot.start();
// Without a server, images and audio cannot load from /api/media: the panel asks this hook for the fictional files.
window.conversaDemoMedia=id=>{const name=store.get('owner','media',id)?.message.directPath?.split('/').pop(),type={photo:'image/jpeg',voice:'audio/wav'}[name];return type&&DEMO_MEDIA[name]?'data:'+type+';base64,'+DEMO_MEDIA[name]:null;};
let authed=true;
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const withConversation=m=>({...m,conversationJid:connector.history.canonical(m.jid)});
// Mirrors the routes of src/server.mjs that the panel uses. The auxiliary test routes stay off, as in production.
async function route(method,path,query,input){
 if(method==='GET'){
  if(!authed)return json(401,{error:'Entra con tu acceso privado.'});
  if(path==='/api/state')return json(200,{connection:connector.snapshot(),messages:store.list('owner','messages',100).map(withConversation),totalMessages:store.count('owner','messages'),chats:store.list('owner','chats',2000),totalChats:store.count('owner','chats'),bot:{...bot.config(),aiAvailable:false},queue:store.list('owner','queue',100).map(j=>({state:j.state,timestamp:j.timestamp})),checkedAt:Date.now(),workspace:{name:'Mi espacio',mode:'Vista previa'},notifications:{devices:0,preview:true}});
  if(path==='/api/chat/messages'){const jid=query.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});const target=connector.history.canonical(jid),before=Number(query.get('before'))||Infinity;const all=store.list('owner','messages',-1).filter(m=>m.timestamp<before&&connector.history.canonical(m.jid)===target).sort((a,b)=>a.timestamp-b.timestamp);return json(200,{messages:all.slice(-150).map(m=>({...m,conversationJid:target,...(m.media?{media:{...m.media,available:!!store.get('owner','media',m.id)}}:{})})),more:all.length>150});}
  if(path==='/api/chat/media'){const jid=query.get('jid');if(!direct(jid))return json(400,{error:'Chat inválido.'});const target=connector.history.canonical(jid);const items=store.list('owner','messages',-1).filter(m=>connector.history.canonical(m.jid)===target&&['image','video','document'].includes(m.kind)).sort((a,b)=>b.timestamp-a.timestamp).slice(0,120);return json(200,{items:items.map(m=>({id:m.id,kind:m.kind,text:m.text||'',fromMe:!!m.fromMe,timestamp:m.timestamp,media:m.media?{...m.media,available:!!store.get('owner','media',m.id)}:null}))});}
  if(path==='/api/messages'){const offset=Math.max(0,Math.min(10000000,Number(query.get('offset'))||0));return json(200,{messages:store.list('owner','messages',100,offset).map(withConversation),total:store.count('owner','messages')});}
  return json(404,{error:'Ruta no encontrada.'});
 }
 if(path==='/api/login'){if(typeof input.token!=='string'||!input.token.trim())return json(401,{error:'Acceso privado inválido.'});authed=true;return json(200,{ok:true});}
 if(!authed)return json(401,{error:'Tu sesión terminó. Vuelve a entrar.'});
 try{
  if(path==='/api/logout'||path==='/api/revoke-sessions')authed=false;
  else if(path==='/api/connect')await connector.connect();
  else if(path==='/api/pause')connector.pause();
  else if(path==='/api/disconnect')await connector.disconnect();
  else if(path==='/api/bot/config')return json(200,{bot:bot.configure(input)});
  else if(path==='/api/bot/preview')return json(200,{text:await bot.preview(input.text)});
  else if(path==='/api/chat/send'){if(!direct(input.jid))throw new Error('Chat inválido');if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4000)throw new Error('Escribe un mensaje de hasta 4000 caracteres.');return json(200,await bot.sendManual(input.jid,input.text,{quoteId:input.quoteId}));}
  else if(path==='/api/chat/react'){if(typeof input.id!=='string'||!['👍','❤️','😂','😮','😢','🙏',''].includes(input.emoji))throw new Error('Reacción no disponible.');return json(200,await bot.react(input.id,input.emoji));}
  else if(path==='/api/presence'){}
  else if(path==='/api/chat/read'){if(!direct(input.jid))throw new Error('Chat inválido');const chat=connector.history.chat(input.jid);if(chat.unread){chat.unread=0;connector.history.save(chat);}}
  else if(path==='/api/chat/review'){if(typeof input.enabled!=='boolean')throw new Error('Selección inválida');connector.history.review(input.jid,input.enabled);}
  else if(path==='/api/history/more'){if(!direct(input.jid))throw new Error('Chat inválido');if(connector.status!=='connected')throw new Error('Conecta WhatsApp primero');}
  else if(path==='/api/chat/delete'){
   if(!direct(input.jid))throw new Error('Chat inválido');
   const chat=connector.history.chat(input.jid);chat.enabled=false;chat.deleted=true;chat.classification='old';chat.name='Contacto eliminado';delete chat.earliest;delete chat.latest;connector.history.save(chat);
   for(const m of store.list('owner','messages',-1))if(connector.history.canonical(m.jid)===chat.jid)store.remove('owner','messages',m.id);
   for(const j of store.list('owner','queue',-1))if(connector.history.canonical(j.jid)===chat.jid)store.remove('owner','queue',j.id);
  }else return json(404,{error:'Ruta no encontrada.'});
  return json(200,{ok:true});
 }catch(error){return json(400,{error:['/api/disconnect','/api/bot/config','/api/chat/review','/api/bot/preview','/api/chat/send','/api/chat/react'].includes(path)?error.message:'No se pudo completar la acción.'});}
}
const realFetch=window.fetch.bind(window);
window.fetch=async(resource,init={})=>{
 if(typeof resource!=='string'||!resource.startsWith('/api/'))return realFetch(resource,init);
 const url=new URL(resource,'http://demo.invalid');await new Promise(r=>setTimeout(r,60));
 let input={};try{input=init.body?JSON.parse(init.body):{};}catch{return json(400,{error:'Solicitud inválida.'});}
 return route(init.method||'GET',url.pathname,url.searchParams,input);
};
// No server behind the page: the export link and the home link would leave the demo.
document.addEventListener('click',e=>{const a=e.target.closest('a[href="/api/export"],a[href="/"]');if(!a)return;e.preventDefault();if(a.getAttribute('href')==='/api/export'){const n=document.getElementById('inbox-notice');if(n)n.textContent='En la vista previa no se exporta nada: la exportación real descarga un JSON con los mensajes del servidor.';}},true);
})();`;

const demoCss='.shell{position:relative}body{background:#F0F5F3}.demo-banner{background:#123F3C;color:#D9F5E9;font-size:12px;line-height:1.5;text-align:center;padding:6px 16px}';
const page=body
 .replace('<div class="shell">','<div class="demo-banner" role="note">Vista previa con datos ficticios. No conecta con WhatsApp ni envía mensajes.</div><div class="shell">')
 .replace('Entrar</button></form></section>','Entrar</button></form><p class="muted">Vista previa: escribe cualquier código.</p></section>')
 .replace('href="/api/export" download','href="/api/export"')
 .replaceAll('src="/icon.svg"',`src="${icon}"`);
for(const [label,text] of [['runtime',runtime],['app',read('public/app.js')]])if(/<\/script/i.test(text))throw new Error(label+' contains a closing script tag');
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#123F3C">
<title>Vista previa de Conversa</title>
<style>${read('public/styles.css')}\n${demoCss}</style>
</head><body>
${page}
<script>${runtime}</script>
<script>${read('public/app.js')}</script>
</body></html>
`;
mkdirSync(join(root,'dist'),{recursive:true});writeFileSync(join(root,'dist','conversa-demo.html'),html);
console.log(`dist/conversa-demo.html (${Math.round(html.length/1024)} KB). Ábrelo en el navegador; usa datos ficticios y no conecta con WhatsApp.`);
