export const direct = jid => typeof jid==='string' && /@(s\.whatsapp\.net|lid)$/.test(jid);
const MEDIA=[['imageMessage','image'],['videoMessage','video'],['audioMessage','audio'],['documentMessage','document'],['stickerMessage','sticker']];
const b64=v=>v instanceof Uint8Array?Buffer.from(v).toString('base64'):v?.type==='Buffer'&&Array.isArray(v.data)?Buffer.from(v.data).toString('base64'):typeof v==='string'?v:'';
const num=v=>typeof v==='number'?v:v&&typeof v.low==='number'?(v.high>>>0)*4294967296+(v.low>>>0):Number(v)||0;
// Ephemeral and document-with-caption containers are opened; view-once content is flagged and never unwrapped.
function unwrap(message){let content=message,viewOnce=false;for(let i=0;i<4;i++){if(content?.viewOnceMessage||content?.viewOnceMessageV2||content?.viewOnceMessageV2Extension||content?.imageMessage?.viewOnce||content?.videoMessage?.viewOnce||content?.audioMessage?.viewOnce){viewOnce=true;break;}const inner=content?.ephemeralMessage?.message||content?.documentWithCaptionMessage?.message;if(!inner)break;content=inner;}return {content,viewOnce};}
const mediaOf=content=>{const [type,kind]=MEDIA.find(([t])=>content?.[t])||[];return type?{type,kind,media:content[type]}:{};};
export function messageRecord(raw) {
  const jid=raw.key?.remoteJid, timestamp=Number(raw.messageTimestamp)*1000;
  if(!direct(jid)||!raw.key?.id||!Number.isFinite(timestamp)||timestamp<=0) return null;
  const {content,viewOnce}=unwrap(raw.message);
  if(!content||content.protocolMessage||content.reactionMessage) return null;
  const {kind:mediaKind,media}=viewOnce?{}:mediaOf(content);
  const text=viewOnce?'':content.conversation||content.extendedTextMessage?.text||media?.caption||'';
  const kind=viewOnce?'view_once':mediaKind||(text?'text':'other');
  const record={id:`${jid}:${raw.key.id}`,key:raw.key,jid,name:(raw.pushName||'Contacto').slice(0,100),text:String(text).slice(0,8000),kind,viewOnce,timestamp,fromMe:!!raw.key.fromMe};
  // Media metadata and WhatsApp's inline preview only; the file itself is fetched on demand and never stored.
  if(media){record.media={mimetype:String(media.mimetype||'').slice(0,100),size:num(media.fileLength),seconds:num(media.seconds)||undefined,ptt:!!media.ptt||undefined,name:media.fileName?String(media.fileName).slice(0,200):undefined,width:num(media.width)||undefined,height:num(media.height)||undefined};const thumb=b64(media.jpegThumbnail);if(thumb&&thumb.length<=16000)record.media.thumb=thumb;}
  const ctx=(content.extendedTextMessage||media)?.contextInfo;
  if(ctx?.stanzaId&&ctx.quotedMessage){const q=unwrap(ctx.quotedMessage),qm=q.viewOnce?{}:mediaOf(q.content);record.quote={id:String(ctx.stanzaId).slice(0,128),text:q.viewOnce?'':String(q.content?.conversation||q.content?.extendedTextMessage?.text||qm.media?.caption||'').slice(0,300),kind:q.viewOnce?'view_once':qm.kind||'text',participant:typeof ctx.participant==='string'?ctx.participant:undefined};}
  return record;
}
// What WhatsApp needs to download a file again later (keys, path, size). Never for view-once content.
export function mediaSource(raw) {
  const {content,viewOnce}=unwrap(raw.message);if(viewOnce)return null;
  const {type,media:m}=mediaOf(content);if(!m?.mediaKey||!(m.directPath||m.url))return null;
  return {key:{remoteJid:raw.key.remoteJid,id:raw.key.id,fromMe:!!raw.key.fromMe},type,message:{url:m.url||undefined,directPath:m.directPath||undefined,mediaKey:b64(m.mediaKey),fileEncSha256:b64(m.fileEncSha256)||undefined,fileSha256:b64(m.fileSha256)||undefined,fileLength:num(m.fileLength),mimetype:m.mimetype||undefined,mediaKeyTimestamp:num(m.mediaKeyTimestamp)||undefined}};
}

export const preview = m => ({text:(m.text||'').slice(0,200),kind:m.kind,fromMe:!!m.fromMe,bot:!!m.bot,timestamp:m.timestamp});

// Absence from a partial WhatsApp history is never evidence that a chat is new.
export class History {
  constructor(store, workspace='owner') { this.store=store;this.w=workspace; }
  meta() { return this.store.get(this.w,'settings','link')||{}; }
  establish(number, legacy=false) {
    const prior=this.meta();
    if(prior.number && prior.number!==number) throw new Error('ACCOUNT_MISMATCH');
    const next={...prior,number,firstLinkedAt:prior.firstLinkedAt||Date.now(),cutoffSource:prior.cutoffSource||(legacy?'legacy-conservative':'first-connection')};
    this.store.put(this.w,'settings','link',next);return next;
  }
  canonical(jid) { return this.store.get(this.w,'aliases',jid)?.jid||jid; }
  chat(jid) { jid=this.canonical(jid);return this.store.get(this.w,'chats',jid)||{jid,name:'Contacto',classification:'unknown',enabled:false}; }
  save(chat) { this.store.put(this.w,'chats',chat.jid,chat); }
  map({pn,lid}) {
    if(!direct(pn)||!direct(lid)||pn===lid)return;
    const a=this.chat(pn),b=this.chat(lid);
    const old=a.classification==='old'||b.classification==='old';
    // A new identity association invalidates earlier approvals unless already merged.
    if(this.canonical(lid)===this.canonical(pn))return;
    this.store.put(this.w,'aliases',lid,{jid:pn});
    this.save({...a,handoffAt:a.handoffAt||b.handoffAt,handoffReason:a.handoffReason||b.handoffReason,optOut:a.optOut||b.optOut,name:a.name==='Contacto'?b.name:a.name,classification:old?'old':'unknown',enabled:false,earliest:Math.min(a.earliest||Infinity,b.earliest||Infinity),reviewedAt:null});
    this.store.remove(this.w,'chats',lid);
  }
  ingest(raw, source='history') {
    if(raw.key?.remoteJidAlt) {
      const ids=[raw.key.remoteJid,raw.key.remoteJidAlt];
      this.map({pn:ids.find(x=>x?.endsWith('@s.whatsapp.net')),lid:ids.find(x=>x?.endsWith('@lid'))});
    }
    const reaction=unwrap(raw.message).content?.reactionMessage;if(reaction)return this.react(raw,reaction,source);
    const msg=messageRecord(raw);if(!msg)return;
    const existing=this.store.get(this.w,'messages',msg.id),chat=this.chat(msg.jid),cutoff=this.meta().firstLinkedAt;
    if(chat.deleted)return;
    chat.name=msg.name==='Contacto'?chat.name:msg.name;
    chat.earliest=Math.min(chat.earliest||Infinity,msg.timestamp);
    chat.latest=Math.max(chat.latest||0,msg.timestamp);
    if(!cutoff||msg.timestamp<cutoff) { chat.classification='old';chat.enabled=false; }
    if(msg.viewOnce&&!msg.fromMe){chat.enabled=false;chat.handoffAt=chat.handoffAt||Date.now();chat.handoffReason='view-once';}
    if(msg.fromMe && !existing?.bot) { chat.enabled=false;chat.humanAt=Date.now(); }
    // Only the contact can opt out; the owner's own words (e.g. "cancelar") must not block the chat permanently.
    if(!msg.fromMe && /^(stop|basta|parar|no me escribas|cancelar|salir)$/i.test(msg.text.trim())) { chat.optOut=true;chat.enabled=false; }
    const seen=this.store.get(this.w,'seen',raw.key.id);
    // The chat list shows each chat's last message and its unread count without loading every message.
    if(!existing&&!seen&&msg.timestamp>=(chat.last?.timestamp||0))chat.last=preview(msg);
    if(!existing&&!seen&&source==='live')chat.unread=msg.fromMe?0:(chat.unread||0)+1;
    this.save(chat);
    if(!seen)this.store.put(this.w,'seen',raw.key.id,{first:msg.id});
    if(existing){if(!existing.key)this.store.put(this.w,'messages',msg.id,{...existing,key:msg.key,fromMe:msg.fromMe});return existing;}
    // The same message can arrive again under the contact's other address (PN/LID): keep a single copy.
    if(seen&&seen.first!==msg.id){const first=this.store.get(this.w,'messages',seen.first);if(first)return first;}
    // A quoted message is attributed from the stored original when we have it.
    if(msg.quote){const q=this.store.get(this.w,'seen',msg.quote.id),original=q&&this.store.get(this.w,'messages',q.first);msg.quote.fromMe=original?!!original.fromMe:!!msg.quote.participant&&this.canonical(msg.quote.participant)!==chat.jid;delete msg.quote.participant;}
    msg.source=source;this.store.put(this.w,'messages',msg.id,msg);
    const file=mediaSource(raw);if(file)this.store.put(this.w,'media',msg.id,file);
    if(!seen&&source==='live'&&!msg.fromMe)try{this.onIncoming?.(msg,chat);}catch{}
    // History is view-only. Only events received after explicit activation can queue.
    const bot=this.store.get(this.w,'settings','bot');
    const test=this.store.get(this.w,'settings','keyword-test');
    if(test&&!test.consumedAt&&test.expiresAt>Date.now()&&!seen&&source==='live'&&!msg.fromMe&&msg.kind==='text'&&msg.timestamp>=test.armedAt&&chat.jid===test.jid&&!chat.optOut&&!chat.deleted&&chat.handoffReason!=='view-once'&&/^prueba[.!?]*$/i.test(msg.text.trim())){this.store.put(this.w,'queue',msg.id,{id:msg.id,jid:msg.jid,timestamp:msg.timestamp,state:'pending',attempts:0,nextAt:Date.now(),testId:test.id});return msg;}
    if(!seen&&source==='live'&&!msg.fromMe&&msg.kind==='text'&&cutoff&&msg.timestamp>=cutoff&&bot?.enabled&&msg.timestamp>=bot.enabledAt&&this.eligible(chat)) {
      this.store.put(this.w,'queue',msg.id,{id:msg.id,jid:msg.jid,timestamp:msg.timestamp,state:'pending',attempts:0,nextAt:Date.now()});
    }
    return msg;
  }
  // A reaction updates the message it points to (one per side, like WhatsApp); an empty reaction removes it.
  react(raw,r,source) {
    const id=r.key?.id;if(!id)return;const seen=this.store.get(this.w,'seen',id);
    const target=(seen&&this.store.get(this.w,'messages',seen.first))||this.store.get(this.w,'messages',`${this.canonical(r.key.remoteJid||raw.key?.remoteJid)}:${id}`);if(!target)return;
    const who=raw.key?.fromMe?'me':'contact',emoji=String(r.text||'').slice(0,16);
    target.reactions={...target.reactions};if(emoji)target.reactions[who]=emoji;else delete target.reactions[who];
    this.store.put(this.w,'messages',target.id,target);
    // rev tells an open panel to reload this chat even though its last message did not change.
    const chat=this.chat(target.jid);if(chat.deleted)return target;chat.rev=Date.now();
    if(emoji&&who==='contact'&&source==='live'){const timestamp=Number(raw.messageTimestamp)*1000||Date.now();if(timestamp>=(chat.last?.timestamp||0))chat.last={text:`Reaccionó ${emoji} a «${(target.text||'').slice(0,60)}»`,kind:'reaction',fromMe:false,bot:false,timestamp};}
    this.save(chat);
    return target;
  }
  // One-time fill of chat.last for chats stored before 0.3 (their messages are already there).
  backfillLast() {
    if(this.store.get(this.w,'settings','chat-last'))return;
    const last=new Map();
    for(const m of this.store.list(this.w,'messages',-1)){const jid=this.canonical(m.jid),prior=last.get(jid);if(!prior||m.timestamp>prior.timestamp)last.set(jid,m);}
    this.store.transaction(()=>{
      for(const [jid,m] of last){const chat=this.store.get(this.w,'chats',jid);if(chat&&!chat.deleted){chat.last=preview(m);this.save(chat);}}
      this.store.put(this.w,'settings','chat-last',{done:true});
    });
  }
  eligible(chat) { return chat.classification==='reviewed-new'&&chat.enabled&&!chat.optOut&&!chat.handoffAt; }
  review(jid,enabled) {
    if(!direct(jid))throw new Error('Chat inválido');
    const chat=this.chat(jid);
    if(enabled&&(chat.handoffAt||chat.classification==='old'||chat.optOut||!chat.earliest||chat.earliest<this.meta().firstLinkedAt))throw new Error('Este chat está excluido de las respuestas o pendiente de revisión personal.');
    chat.enabled=!!enabled;if(enabled){chat.classification='reviewed-new';chat.reviewedAt=Date.now();}this.save(chat);
  }
  ingestBatch(event) {
    this.store.transaction(()=>{
      for(const mapping of event.lidPnMappings||[])this.map(mapping);
      for(const contact of event.contacts||[]) {
        if(!direct(contact.id))continue;const c=this.chat(contact.id);c.name=(contact.name||contact.notify||c.name).slice(0,100);this.save(c);
      }
      for(const c of event.chats||[]) {
        if(!direct(c.id))continue;const chat=this.chat(c.id);
        const time=Number(c.conversationTimestamp)*1000;
        if(time&&time<this.meta().firstLinkedAt){chat.classification='old';chat.enabled=false;}
        this.save(chat);
        for(const m of c.messages||[])if(m.message)this.ingest(m.message,'history');
      }
      for(const raw of event.messages||[])this.ingest(raw,'history');
      this.store.put(this.w,'settings','history',{updatedAt:Date.now(),progress:event.progress??null,received:true,complete:false});
    });
  }
}
