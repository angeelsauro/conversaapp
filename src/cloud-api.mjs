// Núcleo del conector del API oficial de WhatsApp (Cloud API, Graph v25).
// Funciones puras y testeables: enviar texto/plantilla, interpretar el webhook
// de entrada, verificar el handshake y validar la firma. El conector completo
// (que implementa la interfaz de Conversa) se arma sobre estas piezas.
import {createHmac,timingSafeEqual} from 'node:crypto';

const BASE='https://graph.facebook.com';
export const GRAPH_VERSION=process.env.CONVERSA_WA_VERSION||'v25.0';

// Envía un mensaje de texto libre (válido dentro de la ventana de 24 h).
export async function sendText({token,phoneId,to,body,version=GRAPH_VERSION,fetch=globalThis.fetch}){
 if(!token||!phoneId)throw new Error('Faltan credenciales del API de WhatsApp.');
 const r=await fetch(`${BASE}/${version}/${encodeURIComponent(phoneId)}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:String(to),type:'text',text:{preview_url:false,body:String(body).slice(0,4096)}})});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j?.error?.message||('WhatsApp API '+r.status));
 return j?.messages?.[0]?.id||null;
}

// Envía una plantilla aprobada (para iniciar conversación fuera de la ventana de 24 h).
export async function sendTemplate({token,phoneId,to,name,language='es',components,version=GRAPH_VERSION,fetch=globalThis.fetch}){
 if(!token||!phoneId)throw new Error('Faltan credenciales del API de WhatsApp.');
 const template={name,language:{code:language}};if(components)template.components=components;
 const r=await fetch(`${BASE}/${version}/${encodeURIComponent(phoneId)}/messages`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:String(to),type:'template',template})});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(j?.error?.message||('WhatsApp API '+r.status));
 return j?.messages?.[0]?.id||null;
}

// Interpreta el cuerpo del webhook de Meta → mensajes y estados de entrega normalizados.
export function parseWebhook(body){
 const out={phoneId:null,messages:[],statuses:[]};
 for(const entry of body?.entry||[])for(const change of entry?.changes||[]){
  const v=change?.value||{};out.phoneId=v?.metadata?.phone_number_id||out.phoneId;
  const names=new Map((v.contacts||[]).map(c=>[c.wa_id,c.profile?.name]));
  for(const m of v.messages||[]){
   const text=m.text?.body||m.button?.text||m.interactive?.list_reply?.title||m.interactive?.button_reply?.title||m[m.type]?.caption||'';
   out.messages.push({from:m.from,id:m.id,timestamp:(Number(m.timestamp)||0)*1000||Date.now(),type:m.type,text,name:names.get(m.from)||''});
  }
  for(const s of v.statuses||[])out.statuses.push({id:s.id,status:s.status,recipient:s.recipient_id,timestamp:(Number(s.timestamp)||0)*1000||Date.now()});
 }
 return out;
}

// Handshake de verificación del webhook (GET con hub.*). Devuelve el challenge o null.
export function verifyChallenge({mode,token,challenge,verifyToken}){
 return mode==='subscribe'&&verifyToken&&token===verifyToken?String(challenge):null;
}

// Valida la firma X-Hub-Signature-256 con el secreto de la app (anti-falsificación).
export function validSignature(rawBody,signature,appSecret){
 if(!signature||!appSecret)return false;
 const expected='sha256='+createHmac('sha256',appSecret).update(rawBody).digest('hex');
 try{const a=Buffer.from(signature),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}
}
