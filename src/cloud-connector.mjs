// Conector del API oficial de WhatsApp (Cloud API). Implementa la misma interfaz
// que el conector actual (Baileys), para que el resto de Conversa no cambie:
// el bot y el panel llaman a socket.sendMessage / status / snapshot / history igual.
// Se activa solo cuando hay credenciales guardadas; mientras, queda "desconectado".
import {History} from './history.mjs';
import {sendText,sendTemplate} from './cloud-api.mjs';

const numberOf=jid=>String(jid||'').split('@')[0];

// Convierte un mensaje entrante del Cloud API al formato interno (estilo Baileys).
// El texto y las respuestas de botón/lista entran como texto (pueden activar el bot);
// las fotos, audios, videos y documentos entran con su tipo real, así se muestran con
// su ícono y NO activan el bot (igual que el conector por QR, que nunca responde a multimedia).
function toMessage(m){
 const caption=m.text||undefined;
 switch(m.type){
  case 'image':return {imageMessage:{caption}};
  case 'video':case 'ptv':return {videoMessage:{caption}};
  case 'audio':case 'voice':return {audioMessage:{}};
  case 'document':return {documentMessage:{caption}};
  case 'sticker':return {stickerMessage:{}};
  case 'location':return {locationMessage:{}};
  case 'contacts':return {contactMessage:{displayName:caption}};
  default:return {conversation:m.text||(m.type&&m.type!=='text'?`[${m.type}]`:'')};
 }
}

export class CloudConnector {
 constructor(store,workspace='owner',{fetch=globalThis.fetch}={}) {
  this.store=store;this.workspace=workspace;this.history=new History(store,workspace);
  this.epoch=0;this.status='disconnected';this.note='';this.identity=null;this.qr=null;this._fetch=fetch;
  this.socket={sendMessage:(jid,content,opts)=>this.sendMessage(jid,content,opts)};
  this._refresh();
 }
 creds(){return this.store.get(this.workspace,'settings','cloud')||null;}
 ready(){const c=this.creds();return !!(c?.token&&c?.phoneId);}
 _refresh(){const c=this.creds();this.status=this.ready()?'connected':'disconnected';this.identity=c?.number?{number:c.number,name:'WhatsApp (oficial)'}:null;}
 // Guarda/actualiza las credenciales del API (token, phoneId, etc.) para este espacio.
 configure(input={}){const c={...(this.creds()||{})};for(const k of ['token','phoneId','wabaId','verifyToken','appSecret','number'])if(k in input)c[k]=typeof input[k]==='string'?input[k].trim():input[k];this.store.put(this.workspace,'settings','cloud',c);this.epoch++;this._refresh();this.ensureCutoff();return {connected:this.status==='connected'};}
 // Fija el momento desde el cual los mensajes son "en vivo", si aún no existe. Sin esto, cada
 // mensaje entrante se tomaría como historial antiguo y el bot no respondería. Respeta un corte
 // previo (p. ej. del conector por QR) y no toca el número guardado, para no chocar con él.
 // El corte se alinea al inicio del segundo actual: las marcas de tiempo entrantes se redondean a
 // segundos, así un mensaje llegado en el mismo segundo de la configuración cuenta como «en vivo», no viejo.
 ensureCutoff(){if(!this.ready())return;const meta=this.history.meta();if(meta.firstLinkedAt)return;this.store.put(this.workspace,'settings','link',{...meta,firstLinkedAt:Math.floor(Date.now()/1000)*1000,cutoffSource:'cloud'});}
 // El bot y el panel envían por aquí. Devuelve algo "verdadero" cuando se aceptó.
 async sendMessage(jid,content={},opts={}){
  const c=this.creds();if(!c?.token||!c?.phoneId)throw new Error('Configura el API oficial de WhatsApp primero.');
  const to=numberOf(jid);if(!/^\d{6,15}$/.test(to))throw new Error('Número inválido.');
  if(content.react)return {key:{id:opts.messageId}};// el Cloud API no reacciona igual; se ignora sin romper
  const id=await sendText({token:c.token,phoneId:c.phoneId,to,body:content.text||'',fetch:this._fetch});
  return id?{key:{id}}:null;
 }
 async sendTemplate(jid,{name,language,components}={}){const c=this.creds();if(!c?.token||!c?.phoneId)throw new Error('Configura el API oficial primero.');return sendTemplate({token:c.token,phoneId:c.phoneId,to:numberOf(jid),name,language,components,fetch:this._fetch});}
 // Entra un lote del webhook ya interpretado (por cloud-api.parseWebhook) → a la bandeja.
 ingestWebhook(parsed){
  this.ensureCutoff();
  for(const m of parsed?.messages||[]){const jid=numberOf(m.from)+'@s.whatsapp.net';
   this.history.ingest({key:{remoteJid:jid,id:m.id,fromMe:false},messageTimestamp:Math.floor((m.timestamp||Date.now())/1000),pushName:m.name||undefined,message:toMessage(m)},'live');}
  return (parsed?.messages||[]).length;
 }
 snapshot(){const c=this.creds();return {status:this.status,qr:null,qrExpiresAt:null,pairingCode:null,pairingExpiresAt:null,note:this.note,identity:this.identity,hasSession:this.ready(),mode:'cloud',autoReply:!!this.store.get(this.workspace,'settings','bot')?.enabled,link:this.history.meta(),retries:0};}
 async resume(){this._refresh();this.ensureCutoff();}
 async connect(){this._refresh();this.ensureCutoff();}
 async pair(){throw new Error('El API oficial no se vincula con código: se configura con tus credenciales de Meta.');}
 desired(){} pause(){} stop(){} async disconnect(){this.epoch++;}
 async profilePicture(){return null;}// el Cloud API no entrega la foto de perfil del contacto
}
export const cloudFactory=(store,workspace)=>new CloudConnector(store,workspace);
