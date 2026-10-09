import {randomBytes} from 'node:crypto';
import {preview} from './history.mjs';
export class Bot {
 constructor(store,connector,{respond}={}) {this.store=store;this.c=connector;this.w=connector.workspace||'owner';this.respond=respond;this.running=false;
  for(const job of store.list(this.w,'queue',-1))if(['generating','sending'].includes(job.state)){job.state=job.state==='sending'?'uncertain':'pending';store.put(this.w,'queue',job.id,job);}
 }
 config(){const config=this.store.get(this.w,'settings','bot')||{enabled:false,instructions:'',knowledge:'',fallback:'Gracias por escribir.',mode:'standard'};return {...config,savedReplies:config.savedReplies||[{id:'welcome',name:'Saludo inicial',text:config.fallback}],activeReplyId:config.activeReplyId||'welcome'};}
 configure(input){const prior=this.config();const config={...prior};
  for(const key of ['instructions','knowledge','fallback'])if(key in input){if(typeof input[key]!=='string'||input[key].length>12000)throw new Error('Texto demasiado largo');config[key]=input[key].trim();}
  if(input.savedReplies!==undefined){if(!Array.isArray(input.savedReplies)||input.savedReplies.length<1||input.savedReplies.length>20)throw new Error('Guarda entre 1 y 20 respuestas.');const ids=new Set();config.savedReplies=input.savedReplies.map(r=>{if(!r||typeof r.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(r.id)||ids.has(r.id)||typeof r.name!=='string'||!r.name.trim()||r.name.length>80||typeof r.text!=='string'||!r.text.trim()||r.text.length>4000)throw new Error('Respuesta guardada inválida.');ids.add(r.id);const keywords=r.keywords||[];if(!Array.isArray(keywords)||keywords.length>20||keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>100))throw new Error('Palabras clave inválidas.');return {id:r.id,name:r.name.trim(),text:r.text,keywords:keywords.map(k=>k.trim())};});}
  else if(input.fallback!==undefined){config.savedReplies=prior.savedReplies.map(r=>r.id===prior.activeReplyId?{...r,text:config.fallback}:r);}
  if(input.activeReplyId!==undefined)config.activeReplyId=input.activeReplyId;
  const selected=config.savedReplies.find(r=>r.id===config.activeReplyId);if(!selected)throw new Error('Selecciona una respuesta guardada existente.');config.fallback=selected.text;
  if(input.reviewWaitMinutes!==undefined){if(!Number.isInteger(input.reviewWaitMinutes)||input.reviewWaitMinutes<1||input.reviewWaitMinutes>1440)throw new Error('Plazo inválido');config.reviewWaitMinutes=input.reviewWaitMinutes;}
  if(input.keywordOnly!==undefined){if(typeof input.keywordOnly!=='boolean')throw new Error('Regla inválida');config.keywordOnly=input.keywordOnly;}
  if(input.mode!==undefined){if(!['standard','ai'].includes(input.mode))throw new Error('Modo inválido');config.mode=input.mode;}
  if(input.handoffAfterReply!==undefined){if(typeof input.handoffAfterReply!=='boolean')throw new Error('Revisión inválida');config.handoffAfterReply=input.handoffAfterReply;}
  if(input.enabled!==undefined){if(typeof input.enabled!=='boolean')throw new Error('Activación inválida');if(input.enabled&&(!config.fallback||config.mode==='ai'&&!this.respond))throw new Error('Configura primero la respuesta y el proveedor de IA.');if(input.enabled&&config.keywordOnly&&!config.savedReplies.some(r=>r.keywords?.length))throw new Error('Añade palabras clave a una respuesta antes de activar el bot.');config.enabled=input.enabled;if(!prior.enabled&&config.enabled)config.enabledAt=Date.now();}
  this.store.put(this.w,'settings','bot',config);return config;
 }
 chooseReply(text){const c=this.config(),rules=c.savedReplies.filter(r=>r.keywords?.length);if(!rules.length)return c.keywordOnly?'':c.fallback;const norm=s=>' '+s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').replace(/[^\p{L}\p{N}]+/gu,' ').trim()+' ';const message=norm(text);const found=rules.filter(r=>r.keywords.some(k=>norm(k).trim()&&message.includes(norm(k))));return found.length===1?found[0].text:'';}
 async preview(text){if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Escribe una pregunta de hasta 4000 caracteres.');const config=this.config();return config.mode==='ai'&&this.respond?await this.respond(config,text):this.chooseReply(text);}
 async sendStandardOnce({jid,incomingId}){
  const chat=this.c.history.chat(jid),msg=this.store.get(this.w,'messages',incomingId);
  if(!msg||msg.fromMe||msg.source!=='live'||this.c.history.canonical(msg.jid)!==chat.jid||Date.now()-msg.timestamp>86400000||chat.deleted||chat.optOut)throw new Error('La prueba necesita un mensaje entrante reciente de ese contacto.');
  const key='manual-standard:'+incomingId,prior=this.store.get(this.w,'queue',key);if(prior)return {state:prior.state,duplicate:true};
  if(this.c.status!=='connected'||!this.c.socket)throw new Error('Conecta WhatsApp primero.');
  const text=this.config().fallback;if(!text)throw new Error('Configura la respuesta estándar.');
  const id=randomBytes(16).toString('hex').toUpperCase(),timestamp=Date.now();
  const job={id:key,jid:chat.jid,state:'sending',timestamp,outgoingId:id,manual:true};
  this.store.transaction(()=>{this.store.put(this.w,'queue',key,job);const record={id:chat.jid+':'+id,key:{remoteJid:chat.jid,id,fromMe:true},jid:chat.jid,name:'Conversa',text,kind:'text',timestamp,fromMe:true,bot:true,status:'sending'};chat.enabled=false;chat.handoffAt=timestamp;chat.handoffReason='greeting';chat.last=preview(record);chat.latest=Math.max(chat.latest||0,timestamp);this.c.history.save(chat);this.store.put(this.w,'messages',record.id,record);});
  let timer;try{const sent=await Promise.race([this.c.socket.sendMessage(chat.jid,{text},{messageId:id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),10000);})]);job.state=sent?'sent':'uncertain';}catch{job.state='uncertain';}finally{clearTimeout(timer);}
  this.store.put(this.w,'queue',key,job);this.markSent(`${chat.jid}:${id}`,job.state);return {state:job.state};
 }
 // Owner reply typed in the panel: sent as-is, and like a reply from the phone it pauses the bot in that chat.
 async sendManual(jid,text){
  const chat=this.c.history.chat(jid);
  if(chat.deleted)throw new Error('Este chat fue borrado.');
  if(this.c.status!=='connected'||!this.c.socket)throw new Error('Conecta WhatsApp primero.');
  const id=randomBytes(16).toString('hex').toUpperCase(),timestamp=Date.now();
  const record={id:`${chat.jid}:${id}`,key:{remoteJid:chat.jid,id,fromMe:true},jid:chat.jid,name:'Tú',text,kind:'text',timestamp,fromMe:true,manual:true,source:'live',status:'sending'};
  this.store.transaction(()=>{this.store.put(this.w,'messages',record.id,record);this.store.put(this.w,'seen',id,{first:record.id});Object.assign(chat,{enabled:false,humanAt:timestamp,unread:0,last:preview(record),latest:Math.max(chat.latest||0,timestamp)});this.c.history.save(chat);});
  let timer,state;try{const sent=await Promise.race([this.c.socket.sendMessage(chat.jid,{text},{messageId:id}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),10000);})]);state=sent?'sent':'uncertain';}catch{state='uncertain';}finally{clearTimeout(timer);}
  this.markSent(record.id,state);return {id:record.id,status:state};
 }
 markSent(messageId,state){const m=this.store.get(this.w,'messages',messageId);if(m){m.status=state==='sent'?'sent':'uncertain';this.store.put(this.w,'messages',messageId,m);}}
 armKeywordTest(jid){if(typeof jid!=='string'||!/^\d+@s\.whatsapp\.net$/.test(jid))throw new Error('Contacto inválido');const chat=this.c.history.chat(jid);if(!chat.earliest||chat.deleted||chat.optOut||chat.handoffReason==='view-once')throw new Error('Contacto no disponible para prueba');const now=Date.now(),test={id:randomBytes(16).toString('hex'),jid:chat.jid,armedAt:now,expiresAt:now+600000,text:'Mensaje de prueba recibido correctamente.'};this.store.put(this.w,'settings','keyword-test',test);return {expiresAt:test.expiresAt,keyword:'PRUEBA'};}
 start(){this.prune();this.timer=setInterval(()=>this.tick().catch(()=>{this.lastError='QUEUE_FAILURE';}),1000);this.timer.unref?.();this.pruneTimer=setInterval(()=>{try{this.prune();}catch{}},3600000);this.pruneTimer.unref?.();}
 stop(){clearInterval(this.timer);clearInterval(this.pruneTimer);this.stopped=true;}
 // tick() decrypts the whole queue every second: drop finished jobs after 7 days. Pending and uncertain jobs stay for the owner.
 prune(now=Date.now()){for(const job of this.store.list(this.w,'queue',-1))if(['sent','skipped','failed'].includes(job.state)&&now-job.timestamp>7*86400000)this.store.remove(this.w,'queue',job.id);}
 allowed(job){if(job.testId){const t=this.store.get(this.w,'settings','keyword-test'),chat=this.c.history.chat(job.jid);return !this.stopped&&this.c.status==='connected'&&t?.id===job.testId&&!t.consumedAt&&t.expiresAt>Date.now()&&job.timestamp>=t.armedAt&&chat.jid===t.jid&&!chat.deleted&&!chat.optOut&&chat.handoffReason!=='view-once';}const config=this.config();return !this.stopped&&config.enabled&&job.timestamp>=config.enabledAt&&this.c.status==='connected'&&this.c.history.eligible(this.c.history.chat(job.jid));}
 async tick(){
  if(this.running||this.stopped||this.c.status!=='connected')return;this.running=true;
  try {
   const job=this.store.list(this.w,'queue',-1).filter(j=>j.state==='pending'&&j.nextAt<=Date.now()).sort((a,b)=>a.timestamp-b.timestamp)[0];if(!job)return;
   const save=()=>{if(this.store.get(this.w,'queue',job.id))this.store.put(this.w,'queue',job.id,job);};
   if(!this.allowed(job)||Date.now()-job.timestamp>24*3600000){job.state='skipped';save();return;}
   // Global hourly budget is persisted; no more than 60 attempts/hour.
   const budget=this.store.get(this.w,'settings','budget')||{since:Date.now(),count:0};if(Date.now()-budget.since>3600000){budget.since=Date.now();budget.count=0;}if(budget.count>=60)return;
   const msg=this.store.get(this.w,'messages',job.id);if(!msg){job.state='skipped';save();return;}
   const epoch=this.c.epoch;job.state='generating';job.attempts++;save();
   let text;try{text=job.testId?this.store.get(this.w,'settings','keyword-test').text:await this.preview(msg.text);}catch{if(this.stopped)return;job.state=job.attempts>=3?'failed':'pending';job.nextAt=Date.now()+60000*job.attempts;save();return;}
   if(this.stopped)return;
   if(!text||!this.allowed(job)||this.c.epoch!==epoch){job.state='skipped';save();if(!text){const chat=this.c.history.chat(job.jid);chat.enabled=false;chat.handoffAt=Date.now();chat.handoffReason='keyword-review';this.c.history.save(chat);}return;}
   text=text.slice(0,4000);const id=randomBytes(16).toString('hex').toUpperCase();
   job.state='sending';job.outgoingId=id;job.sentAt=Date.now();
   // Persist intent before the network call. An uncertain send is never retried automatically.
   this.store.transaction(()=>{save();budget.count++;this.store.put(this.w,'settings','budget',budget);if(job.testId){const t=this.store.get(this.w,'settings','keyword-test');t.consumedAt=Date.now();this.store.put(this.w,'settings','keyword-test',t);}const record={id:`${job.jid}:${id}`,key:{remoteJid:job.jid,id,fromMe:true},jid:job.jid,name:'Conversa',text,kind:'text',timestamp:Date.now(),fromMe:true,bot:true,status:'sending'},chat=this.c.history.chat(job.jid);if(job.testId||this.config().handoffAfterReply){chat.enabled=false;chat.handoffAt=Date.now();chat.handoffReason='greeting';}chat.last=preview(record);chat.latest=Math.max(chat.latest||0,record.timestamp);this.c.history.save(chat);this.store.put(this.w,'messages',record.id,record);});
   let timeout;try{const result=await Promise.race([this.c.socket.sendMessage(job.jid,{text},{messageId:id}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('SEND_TIMEOUT')),30000);})]);job.state=result?'sent':'uncertain';}catch{job.state='uncertain';}finally{clearTimeout(timeout);}
   if(!this.stopped){save();this.markSent(`${job.jid}:${id}`,job.state);}
  }finally{this.running=false;}
 }
}
