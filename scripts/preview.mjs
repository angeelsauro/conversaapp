// Vista previa local con datos ficticios: no conecta con WhatsApp ni envía mensajes reales.
// Uso: npm run preview  →  abre el enlace que imprime (puerto 4319 por defecto).
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import QRCode from 'qrcode';
import {createApp} from '../src/server.mjs';
import {History} from '../src/history.mjs';

if(process.env.NODE_ENV==='production')throw new Error('La vista previa no se ejecuta en producción.');
const port=Number(process.env.PREVIEW_PORT||4319),minute=60000,day=86400000,now=Date.now();
const dir=mkdtempSync(join(tmpdir(),'conversa-preview-'));
const owner='34600000000';

function previewConnector(store){
 const history=new History(store),timers=[];
 const c={history,workspace:'owner',status:'disconnected',qr:null,epoch:1,note:'',identity:null,socket:null,
  snapshot:()=>({status:c.status,qr:c.qr,qrExpiresAt:null,note:c.note,identity:c.identity,hasSession:c.status!=='disconnected',autoReply:!!store.get('owner','settings','bot')?.enabled,link:history.meta(),history:store.get('owner','settings','history'),retries:0}),
  async connect(){if(['connecting','qr','connected'].includes(c.status))return;const epoch=++c.epoch;
   // With a stored (fictional) session it reconnects directly; otherwise it shows a QR that links nothing.
   if(c.identity){Object.assign(c,{status:'connecting',note:''});timers.push(setTimeout(()=>{if(c.epoch===epoch)online();},1500));return;}
   Object.assign(c,{status:'qr',note:'Vista previa: este QR es ficticio y no vincula ningún teléfono.',qr:await QRCode.toDataURL('Vista previa de Conversa. Este código no vincula ningún dispositivo.',{width:300,margin:2,errorCorrectionLevel:'M'})});
   timers.push(setTimeout(()=>{if(c.epoch===epoch&&c.status==='qr')online();},6000));},
  pause(){c.epoch++;clearInterval(c.script);Object.assign(c,{status:'paused',qr:null,socket:null,note:'Recepción y respuestas pausadas.'});},
  async disconnect(){c.pause();Object.assign(c,{status:'disconnected',identity:null,note:'Sesión de vista previa desvinculada.'});},
  async resume(){online();},
  stop(){clearInterval(c.script);for(const t of timers)clearTimeout(t);}
 };
 // The fake socket accepts the bot's reply and echoes nothing: no network involved.
 function online(){c.epoch++;Object.assign(c,{status:'connected',qr:null,note:'',identity:{name:'Panadería Demo',number:owner},socket:{async sendMessage(jid,content,{messageId}){return {key:{remoteJid:jid,id:messageId,fromMe:true}};},async fetchMessageHistory(){}}});
  // Scripted contacts: an unverified chat writes after a few seconds (unread badge, optional sound, no reply);
  // once the bot is active and Diego's chat is eligible, Diego asks something that matches a keyword.
  const epoch=c.epoch,started=Date.now();let carmen=false,diego=false;clearInterval(c.script);
  c.script=setInterval(()=>{if(c.epoch!==epoch)return clearInterval(c.script);const t=Date.now();
   if(!carmen&&t-started>8000){carmen=true;history.ingest(raw('34600000105@s.whatsapp.net','live-carmen-'+t,t,'¿Me confirmas si estará listo a las 10?','Carmen López'),'live');}
   if(!diego&&store.get('owner','settings','bot')?.enabled&&history.eligible(history.chat('34600000104@s.whatsapp.net'))){diego=true;timers.push(setTimeout(()=>{if(c.epoch===epoch){const now=Date.now();history.ingest(raw('34600000104@s.whatsapp.net','live-diego-'+now,now,'Hola, ¿a qué hora abren mañana?','Diego Martín'),'live');}},4000));}
  },1000);c.script.unref?.();
 }
 return c;
}
const raw=(jid,id,ts,text,name,{fromMe=false,message}={})=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ts/1000),pushName:fromMe?undefined:name,message:message||{conversation:text}});

const app=createApp({dir,port,connectorFactory:previewConnector,testEndpoints:false});
const {store,bot}=app,h=app.connector.history,cutoff=now-3*day;
store.put('owner','settings','link',{number:owner,firstLinkedAt:cutoff,cutoffSource:'first-connection'});
bot.configure({mode:'standard',keywordOnly:true,handoffAfterReply:true,activeReplyId:'horario',savedReplies:[
 {id:'horario',name:'Horario',text:'¡Hola! Abrimos de lunes a sábado de 8:00 a 20:00 y los domingos de 9:00 a 14:00.',keywords:['horario','a qué hora','abren']},
 {id:'carta',name:'Carta y precios',text:'Aquí tienes nuestra carta con precios actualizados: https://ejemplo.com/carta',keywords:['precio','precios','carta','cuánto cuesta']},
 {id:'encargos',name:'Encargos',text:'Para encargos, dinos qué necesitas y para qué día. Te confirmamos personalmente.',keywords:['encargo','pedido','reservar']}
]});
const add=(jid,name,items)=>{for(const [i,[ago,text,opts]] of items.entries())h.ingest(raw(jid,'seed-'+jid.split('@')[0]+'-'+i,now-ago,text,name,opts),opts?.live?'live':'history');};
const botReply=(jid,ago,text)=>{const ts=now-ago,id='BOT'+ts;store.put('owner','messages',`${jid}:${id}`,{id:`${jid}:${id}`,key:{remoteJid:jid,id,fromMe:true},jid,name:'Conversa',text,kind:'text',timestamp:ts,fromMe:true,bot:true});const chat=h.chat(jid);Object.assign(chat,{enabled:false,handoffAt:ts,handoffReason:'greeting',latest:ts});h.save(chat);};
// Old chat (before the cutoff): always excluded.
add('34600000101@s.whatsapp.net','Marcos Ruiz',[[6*day,'¿Me guardas dos barras para el sábado?'],[6*day-20*minute,'Claro, quedan apartadas.',{fromMe:true}],[50*minute,'¿Tenéis pan sin gluten esta semana?']]);
add('34600000102@s.whatsapp.net','Elena Castro',[[9*day,'',{message:{imageMessage:{caption:''}}}],[9*day-5*minute,'Así quedó la tarta, ¡gracias!'],[2*day,'',{message:{audioMessage:{}}}]]);
// New chat reviewed by the owner: the bot answered once and handed it over.
const lucia='34600000103@s.whatsapp.net';add(lucia,'Lucía Fernández',[[2*day,'Hola, buenas'],[26*minute,'¿Cuál es el horario de hoy?',{live:true}]]);
h.review(lucia,true);botReply(lucia,25*minute,'¡Hola! Abrimos de lunes a sábado de 8:00 a 20:00 y los domingos de 9:00 a 14:00.');
// New chat reviewed and available for the bot (receives the scripted live message).
const diego='34600000104@s.whatsapp.net';add(diego,'Diego Martín',[[1*day,'Buenas tardes, ¿hacéis envíos a domicilio?'],[1*day-30*minute,'Hola Diego, por ahora solo recogida en tienda.',{fromMe:true}]]);
{const chat=h.chat(diego);delete chat.humanAt;chat.enabled=false;h.save(chat);}h.review(diego,true);
// New chat not yet verified by the owner.
add('34600000105@s.whatsapp.net','Carmen López',[[3*60*minute,'Hola, quiero hacer un encargo para el viernes']]);
// View-once content: never opened, chat goes to review.
add('34600000106@s.whatsapp.net','Sofía Navarro',[[2*day,'Hola'],[90*minute,'',{live:true,message:{viewOnceMessageV2:{message:{imageMessage:{}}}}}]]);
// Contact opted out with STOP.
add('34600000107@s.whatsapp.net','Pablo Gómez',[[2*day,'Hola, ¿precio de la empanada?'],[2*day-10*minute,'STOP']]);
store.put('owner','settings','history',{updatedAt:now,progress:100,received:true,complete:false});

app.server.listen(port,'127.0.0.1',async()=>{
 await app.start();
 const token=readFileSync(join(dir,'owner-token'),'utf8').trim();
 console.log(`\nVista previa de Conversa con datos ficticios (sin WhatsApp, sin envíos reales).\nAbre: http://127.0.0.1:${port}/#access=${token}\nEl código es temporal y se borra al cerrar (Ctrl+C).\n`);
});
let closing=false;
const shutdown=()=>{if(closing)return;closing=true;app.connector.stop();app.close();rmSync(dir,{recursive:true,force:true});process.exit(0);};
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,shutdown);
app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`El puerto ${port} está ocupado. Usa PREVIEW_PORT=otro.`:e.message);shutdown();});
