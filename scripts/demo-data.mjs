// Datos y conexión ficticios para `npm run preview` y `npm run demo`. Nada aquí conecta con WhatsApp.
// Sin imports a propósito: build-demo.mjs incrusta este archivo tal cual en la demo de navegador.
export const DEMO_OWNER='34600000000';
const DEMO_DIEGO='34600000104@s.whatsapp.net',DEMO_CARMEN='34600000105@s.whatsapp.net',demoMinute=60000,demoDay=86400000;
const demoRaw=(jid,id,ts,text,name,{fromMe=false,message}={})=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ts/1000),pushName:fromMe?undefined:name,message:message||{conversation:text}});

// Same surface the server and the bot use from the real Connector. The socket accepts sends and goes nowhere.
export function demoConnector(store,{History,qr,media={}}){
 const history=new History(store),timers=[],later=(fn,ms)=>timers.push(setTimeout(fn,ms));let script,carmen=false,diego=false;
 const c={history,workspace:'owner',status:'disconnected',qr:null,epoch:1,note:'',identity:null,socket:null,
  snapshot:()=>({status:c.status,qr:c.qr,qrExpiresAt:null,note:c.note,identity:c.identity,hasSession:!!c.identity,autoReply:!!store.get('owner','settings','bot')?.enabled,link:history.meta(),history:store.get('owner','settings','history'),retries:0}),
  async connect(){if(['connecting','qr','connected'].includes(c.status))return;const epoch=++c.epoch;
   // A stored (fictional) session reconnects directly; otherwise a QR that links nothing is shown for a few seconds.
   if(c.identity){Object.assign(c,{status:'connecting',note:''});later(()=>{if(c.epoch===epoch)online();},1500);return;}
   Object.assign(c,{status:'qr',qr,note:'Vista previa: este QR es ficticio y no vincula ningún teléfono.'});
   later(()=>{if(c.epoch===epoch&&c.status==='qr')online();},6000);},
  pause(){c.epoch++;clearInterval(script);Object.assign(c,{status:'paused',qr:null,socket:null,note:'Recepción y respuestas pausadas.'});},
  async disconnect(){c.pause();Object.assign(c,{status:'disconnected',identity:null,note:'Sesión de vista previa desvinculada.'});},
  async resume(){online();},
  // Fictional files keyed by their path; the real connector downloads them from WhatsApp.
  async downloadMedia(source){const file=media[source.message.directPath?.split('/').pop()];if(c.status!=='connected'||!file)throw new Error('OFFLINE');return Buffer.from(file,'base64');},
  stop(){clearInterval(script);for(const t of timers)clearTimeout(t);}
 };
 function online(){const epoch=++c.epoch,started=Date.now();
  Object.assign(c,{status:'connected',qr:null,note:'',identity:{name:'Panadería Demo',number:DEMO_OWNER},socket:{async sendMessage(jid,content,options={}){return {key:{remoteJid:jid,id:options.messageId||'DEMO'+Date.now(),fromMe:true}};},async fetchMessageHistory(){}}});
  // Scripted contacts: an unverified chat writes after a few seconds (unread badge, optional sound, never answered);
  // once the bot is active and Diego's chat is eligible, Diego asks something that matches a saved keyword.
  clearInterval(script);script=setInterval(()=>{if(c.epoch!==epoch)return clearInterval(script);const t=Date.now();
   if(!carmen&&t-started>8000){carmen=true;history.ingest(demoRaw(DEMO_CARMEN,'live-carmen-'+t,t,'¿Me confirmas si estará listo a las 10?','Carmen López'),'live');}
   if(!diego&&store.get('owner','settings','bot')?.enabled&&history.eligible(history.chat(DEMO_DIEGO))){diego=true;later(()=>{if(c.epoch===epoch){const now=Date.now();history.ingest(demoRaw(DEMO_DIEGO,'live-diego-'+now,now,'Hola, ¿a qué hora abren mañana?','Diego Martín'),'live');}},4000);}
  },1000);script.unref?.();
 }
 return c;
}

// Seven fictional chats covering every state the panel shows. Link cutoff three days ago.
export function seedDemo({store,history:h,bot,now=Date.now(),media={}}){
 store.put('owner','settings','link',{number:DEMO_OWNER,firstLinkedAt:now-3*demoDay,cutoffSource:'first-connection'});
 bot.configure({mode:'standard',keywordOnly:true,handoffAfterReply:true,activeReplyId:'horario',savedReplies:[
  {id:'horario',name:'Horario',text:'¡Hola! Abrimos de lunes a sábado de 8:00 a 20:00 y los domingos de 9:00 a 14:00.',keywords:['horario','a qué hora','abren']},
  {id:'carta',name:'Carta y precios',text:'Aquí tienes nuestra carta con precios actualizados: https://ejemplo.com/carta',keywords:['precio','precios','carta','cuánto cuesta']},
  {id:'encargos',name:'Encargos',text:'Para encargos, dinos qué necesitas y para qué día. Te confirmamos personalmente.',keywords:['encargo','pedido','reservar']}
 ]});
 const add=(jid,name,items)=>{for(const [i,[ago,text,opts]] of items.entries())h.ingest(demoRaw(jid,'seed-'+jid.split('@')[0]+'-'+i,now-ago,text,name,opts),opts?.live?'live':'history');};
 const botReply=(jid,ago,text)=>{const ts=now-ago,id='BOT'+ts;store.put('owner','messages',`${jid}:${id}`,{id:`${jid}:${id}`,key:{remoteJid:jid,id,fromMe:true},jid,name:'Conversa',text,kind:'text',timestamp:ts,fromMe:true,bot:true});const chat=h.chat(jid);Object.assign(chat,{enabled:false,handoffAt:ts,handoffReason:'greeting',latest:ts,last:{text,kind:'text',fromMe:true,bot:true,timestamp:ts}});h.save(chat);};
 // Before the cutoff: always excluded.
 add('34600000101@s.whatsapp.net','Marcos Ruiz',[[6*demoDay,'¿Me guardas dos barras para el sábado?'],[6*demoDay-20*demoMinute,'Claro, quedan apartadas.',{fromMe:true}],[50*demoMinute,'¿Tenéis pan sin gluten esta semana?']]);
 // Elena: a photo with its preview, the owner's reply (she reacts ❤️ to it) and a voice note, all openable in the preview.
 const elena='34600000102@s.whatsapp.net',file=(name,extra)=>({mediaKey:'ZGVtbw==',directPath:'/demo/'+name,...extra});
 add(elena,'Elena Castro',[[9*demoDay,'',{message:{imageMessage:file('photo',{caption:'Así quedó la tarta, ¡gracias! 🎂',mimetype:'image/jpeg',width:640,height:480,fileLength:14117,jpegThumbnail:media.thumb})}}],[9*demoDay-5*demoMinute,'¡Qué bonita! Gracias a ti, Elena 😊',{fromMe:true}],[2*demoDay,'',{message:{audioMessage:file('voice',{mimetype:'audio/wav',seconds:6,ptt:true,fileLength:48044})}}]]);
 h.ingest({key:{remoteJid:elena,id:'seed-elena-react',fromMe:false},messageTimestamp:Math.floor((now-9*demoDay+6*demoMinute)/1000),message:{reactionMessage:{key:{remoteJid:elena,id:'seed-34600000102-1',fromMe:true},text:'❤️'}}},'history');
 // New chat reviewed by the owner: the bot answered once and handed it over.
 const lucia='34600000103@s.whatsapp.net';add(lucia,'Lucía Fernández',[[2*demoDay,'Hola, buenas'],[26*demoMinute,'¿Cuál es el horario de hoy?',{live:true}]]);
 h.review(lucia,true);botReply(lucia,25*demoMinute,'¡Hola! Abrimos de lunes a sábado de 8:00 a 20:00 y los domingos de 9:00 a 14:00.');
 // New chat reviewed and available for the bot (receives the scripted message once the bot is active).
 add(DEMO_DIEGO,'Diego Martín',[[demoDay,'Buenas tardes, ¿hacéis envíos a domicilio?'],[demoDay-30*demoMinute,'Hola Diego, por ahora solo recogida en tienda.',{fromMe:true}],[demoDay-40*demoMinute,'',{message:{extendedTextMessage:{text:'Perfecto, paso el sábado entonces 👌',contextInfo:{stanzaId:'seed-34600000104-1',participant:DEMO_OWNER+'@s.whatsapp.net',quotedMessage:{conversation:'Hola Diego, por ahora solo recogida en tienda.'}}}}}]]);
 h.review(DEMO_DIEGO,true);
 // New chat the owner has not verified yet.
 add(DEMO_CARMEN,'Carmen López',[[3*60*demoMinute,'Hola, quiero hacer un encargo para el viernes']]);
 // View-once content: never opened, the chat goes to review.
 add('34600000106@s.whatsapp.net','Sofía Navarro',[[2*demoDay,'Hola'],[90*demoMinute,'',{live:true,message:{viewOnceMessageV2:{message:{imageMessage:{}}}}}]]);
 // The contact opted out with STOP.
 add('34600000107@s.whatsapp.net','Pablo Gómez',[[2*demoDay,'Hola, ¿precio de la empanada?'],[2*demoDay-10*demoMinute,'STOP']]);
 store.put('owner','settings','history',{updatedAt:now,progress:100,received:true,complete:false});
}
