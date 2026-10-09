import makeWASocket, { initAuthCreds, BufferJSON, proto, DisconnectReason, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import {History,messageRecord} from './history.mjs';
const logger=pino({level:'silent'});
export function authState(store,workspace,active=()=>true) {
 const read=id=>{if(!active())throw new Error('STALE_SESSION');const v=store.get(workspace,'auth',id);return v?JSON.parse(v,BufferJSON.reviver):null;};
 const write=(id,v)=>{if(!active())throw new Error('STALE_SESSION');store.put(workspace,'auth',id,JSON.stringify(v,BufferJSON.replacer));};
 const creds=read('creds')||initAuthCreds();
 return {state:{creds,keys:{
  async get(type,ids){const result={};for(const id of ids){let v=read(`${type}-${id}`);if(type==='app-state-sync-key'&&v)v=proto.Message.AppStateSyncKeyData.fromObject(v);if(v)result[id]=v;}return result;},
  async set(data){if(!active())throw new Error('STALE_SESSION');store.transaction(()=>{for(const [type,entries]of Object.entries(data))for(const[id,v]of Object.entries(entries)){const key=`${type}-${id}`;if(v)write(key,v);else store.remove(workspace,'auth',key);}});}
 }},save:()=>write('creds',creds)};
}
export function incomingMessage(raw,startedAt) {const m=messageRecord(raw);return m&&!m.fromMe&&m.timestamp>=startedAt?m:null;}
export class Connector {
 constructor(store,workspace='owner',factory=makeWASocket) {
  Object.assign(this,{store,workspace,factory,status:'disconnected',qr:null,socket:null,epoch:0,retries:0,note:'',identity:null});
  this.history=new History(store,workspace);
  this.legacy=!!store.get(workspace,'auth','creds')&&!this.history.meta().firstLinkedAt;
  if(this.legacy)store.put(workspace,'settings','link',{firstLinkedAt:Date.now(),cutoffSource:'legacy-conservative'});
  if(!store.get(workspace,'settings','history-migration')) {
   store.transaction(()=>{
    for(const m of store.list(workspace,'messages',-1))this.history.ingest({key:m.key||{id:m.id.slice(m.jid.length+1),remoteJid:m.jid,fromMe:!!m.fromMe},messageTimestamp:m.timestamp/1000,pushName:m.name,message:{conversation:m.text||'[Archivo multimedia]'}},'history');
    store.put(workspace,'settings','history-migration',{done:true});
   });
  }
 }
 snapshot(){return {status:this.status,qr:this.qr,qrExpiresAt:this.qrExpiresAt||null,note:this.note,identity:this.identity,hasSession:!!this.store.get(this.workspace,'auth','creds'),autoReply:!!this.store.get(this.workspace,'settings','bot')?.enabled,link:this.history.meta(),history:this.store.get(this.workspace,'settings','history'),retries:this.retries};}
 desired(active){this.store.put(this.workspace,'settings','connection',{active});}
 async resume(){if(this.store.get(this.workspace,'auth','creds')&&this.store.get(this.workspace,'settings','connection')?.active!==false)await this.connect();}
 async connect(retry=false){
  if(['connecting','qr','connected'].includes(this.status)&&!retry)return;
  this.desired(true);clearTimeout(this.retryTimer);clearTimeout(this.qrTimer);
  const epoch=++this.epoch;this.socket?.end(new Error('Connection replaced'));
  Object.assign(this,{socket:null,qr:null,qrExpiresAt:null,status:'connecting',note:''});
  if(!retry)this.retries=0;
  const active=()=>this.epoch===epoch, auth=authState(this.store,this.workspace,active);
  const guard=fn=>(...args)=>{if(!active())return;try{Promise.resolve(fn(...args)).catch(()=>{if(active())this.fail('No se pudo conservar la sesión o un mensaje. Revisa almacenamiento y reinicia el servicio.');});}catch{if(active())this.fail('No se pudieron guardar datos. Revisa el almacenamiento.');}};
  try {
   const sock=this.factory({auth:{creds:auth.state.creds,keys:makeCacheableSignalKeyStore(auth.state.keys,logger)},logger,browser:['Conversa','Desktop','2.0.0'],markOnlineOnConnect:false,syncFullHistory:true,shouldSyncHistoryMessage:()=>true,getMessage:async key=>{const m=this.store.get(this.workspace,'messages',`${key.remoteJid}:${key.id}`);return m?.text?{conversation:m.text}:undefined;}});
   this.socket=sock;
   sock.ev.on('creds.update',guard(()=>auth.save()));
   sock.ev.on('connection.update',guard(u=>this.update(u,epoch)));
   sock.ev.on('messages.upsert',guard(event=>{for(const raw of event.messages)this.history.ingest(raw,'live');}));
   sock.ev.on('messaging-history.set',guard(event=>this.history.ingestBatch(event)));
   sock.ev.on('lid-mapping.update',guard(m=>this.history.map(m)));
   sock.ev.on('messaging-history.status',guard(event=>{this.store.put(this.workspace,'settings','history',{...this.store.get(this.workspace,'settings','history'),updatedAt:Date.now(),phaseStatus:event.status,explicit:event.explicit,complete:false});}));
  }catch{this.fail('No se pudo iniciar la conexión. Revisa el servicio.');}
 }
 fail(note){++this.epoch;this.status='error';this.qr=null;this.qrExpiresAt=null;this.note=note;clearTimeout(this.retryTimer);clearTimeout(this.qrTimer);this.socket?.end(new Error('Stopped'));this.socket=null;
  // A linked session retries in a minute after a local failure; only an explicit pause or unlink stops reconnecting.
  let linked=false;try{linked=!!this.store.get(this.workspace,'auth','creds')&&this.store.get(this.workspace,'settings','connection')?.active!==false;}catch{}
  if(linked){const epoch=this.epoch;this.retryTimer=setTimeout(()=>{if(this.epoch===epoch)this.connect(true).catch(()=>{});},60000);this.retryTimer.unref?.();}
 }
 async update(update,epoch){
  if(this.epoch!==epoch)return;
  if(update.qr){const image=await QRCode.toDataURL(update.qr,{width:300,margin:2,errorCorrectionLevel:'M'});if(this.epoch!==epoch)return;this.qr=image;this.status='qr';this.qrExpiresAt=Date.now()+55000;clearTimeout(this.qrTimer);this.qrTimer=setTimeout(()=>{if(this.epoch===epoch){this.qr=null;this.qrExpiresAt=null;}},55000);this.qrTimer.unref?.();}
  if(update.connection==='open'){
   const identity={name:this.socket.user?.name||'Mi WhatsApp',number:this.socket.user?.id?.split(':')[0]?.split('@')[0]||''};
   if(!identity.number){this.fail('WhatsApp no entregó la identidad de la cuenta.');return;}
   try{this.history.establish(identity.number,this.legacy);}catch{this.desired(false);this.fail('Esta cuenta no corresponde al espacio. Vuelve a vincular el número original.');return;}
   this.identity=identity;this.status='connected';this.qr=null;this.qrExpiresAt=null;clearTimeout(this.qrTimer);this.retries=0;this.note='';
  }
  if(update.connection==='close'){
   // Invalidate key stores immediately, before any cleanup or retry.
   ++this.epoch;this.socket=null;this.qr=null;this.qrExpiresAt=null;clearTimeout(this.qrTimer);
   const error=update.lastDisconnect?.error,code=error?.output?.statusCode,detail=error?.data;
   // The link ends only when WhatsApp revokes this device: the owner removed it in Linked devices (401, or a
   // device_removed conflict). Generic stream errors arrive as 500 "bad session" and are usually transient, so
   // they keep the keys and reconnect like any other drop.
   if(code===DisconnectReason.loggedOut||(detail?.tag==='conflict'&&detail?.attrs?.type==='device_removed')){this.desired(false);this.store.clear(this.workspace,'auth');this.status='disconnected';this.identity=null;this.retries=0;this.note='Conversa se quitó de Dispositivos vinculados en tu teléfono. Escanea otro QR para volver a vincularlo.';return;}
   // Another client is using this same link. Pause without persisting it: a restart resumes on its own.
   if(code===DisconnectReason.connectionReplaced){this.status='paused';this.note='Se abrió otra conexión con esta misma vinculación (otro servidor o una copia de los datos). Conversa se pausó para no competir con ella; pulsa «Reanudar conexión» si ya no existe.';return;}
   this.retries++;this.status='reconnecting';this.note=this.retries>=5?'WhatsApp no acepta la conexión por ahora. Conversa conserva la vinculación y sigue reintentando; si en el teléfono ya no aparece en Dispositivos vinculados, desvincula aquí y escanea otro QR.':'Reconexión automática en curso…';const nextEpoch=this.epoch;
   this.retryTimer=setTimeout(()=>{if(this.epoch===nextEpoch)this.connect(true).catch(()=>this.fail('No se pudo recuperar la sesión.'));},Math.min(1000*2**Math.min(this.retries,6),60000)+Math.floor(Math.random()*2000));this.retryTimer.unref?.();
  }
 }
 pause(persist=true){if(persist)this.desired(false);++this.epoch;clearTimeout(this.retryTimer);clearTimeout(this.qrTimer);this.socket?.end(new Error('Paused'));Object.assign(this,{socket:null,qr:null,qrExpiresAt:null,status:'paused',note:'Recepción y respuestas pausadas.'});}
 async disconnect(){const sock=this.socket;let timer;try{if(sock&&this.status==='connected')await Promise.race([sock.logout(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),8000);})]);else if(this.store.get(this.workspace,'auth','creds'))throw new Error('offline');}catch{throw new Error('No se pudo desvincular. Reanuda o elimina Conversa en Dispositivos vinculados del teléfono.');}finally{clearTimeout(timer);}this.pause();this.store.clear(this.workspace,'auth');this.identity=null;this.status='disconnected';this.note='Sesión desvinculada; se conserva la exclusión de chats antiguos.';}
}
