export const direct = jid => typeof jid==='string' && /@(s\.whatsapp\.net|lid)$/.test(jid);
export function messageRecord(raw) {
  const jid=raw.key?.remoteJid, timestamp=Number(raw.messageTimestamp)*1000;
  if(!direct(jid)||!raw.key?.id||!Number.isFinite(timestamp)||timestamp<=0) return null;
  let content=raw.message,viewOnce=false;
  for(let i=0;i<4;i++){if(content?.viewOnceMessage||content?.viewOnceMessageV2||content?.viewOnceMessageV2Extension||content?.imageMessage?.viewOnce||content?.videoMessage?.viewOnce||content?.audioMessage?.viewOnce){viewOnce=true;break;}const inner=content?.ephemeralMessage?.message;if(!inner)break;content=inner;}
  if(!content||content.protocolMessage||content.reactionMessage) return null;
  const text=viewOnce?'':content.conversation||content.extendedTextMessage?.text||'';
  const kind=viewOnce?'view_once':text?'text':content.imageMessage?'image':content.audioMessage?'audio':content.videoMessage?'video':content.documentMessage?'document':'other';
  return {id:`${jid}:${raw.key.id}`,key:raw.key,jid,name:(raw.pushName||'Contacto').slice(0,100),text:text.slice(0,8000),kind,viewOnce,timestamp,fromMe:!!raw.key.fromMe};
}

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
    const msg=messageRecord(raw);if(!msg)return;
    const existing=this.store.get(this.w,'messages',msg.id),chat=this.chat(msg.jid),cutoff=this.meta().firstLinkedAt;
    if(chat.deleted)return;
    chat.name=msg.name==='Contacto'?chat.name:msg.name;
    chat.earliest=Math.min(chat.earliest||Infinity,msg.timestamp);
    chat.latest=Math.max(chat.latest||0,msg.timestamp);
    if(!cutoff||msg.timestamp<cutoff) { chat.classification='old';chat.enabled=false; }
    if(msg.viewOnce&&!msg.fromMe){chat.enabled=false;chat.handoffAt=chat.handoffAt||Date.now();chat.handoffReason='view-once';}
    if(msg.fromMe && !existing?.bot) { chat.enabled=false;chat.humanAt=Date.now(); }
    if(/^(stop|basta|parar|no me escribas|cancelar|salir)$/i.test(msg.text.trim())) { chat.optOut=true;chat.enabled=false; }
    this.save(chat);
    const seen=this.store.get(this.w,'seen',raw.key.id);
    if(!seen)this.store.put(this.w,'seen',raw.key.id,{first:msg.id});
    if(existing){if(!existing.key)this.store.put(this.w,'messages',msg.id,{...existing,key:msg.key,fromMe:msg.fromMe});return existing;}
    msg.source=source;this.store.put(this.w,'messages',msg.id,msg);
    // History is view-only. Only events received after explicit activation can queue.
    const bot=this.store.get(this.w,'settings','bot');
    const test=this.store.get(this.w,'settings','keyword-test');
    if(test&&!test.consumedAt&&test.expiresAt>Date.now()&&!seen&&source==='live'&&!msg.fromMe&&msg.kind==='text'&&msg.timestamp>=test.armedAt&&chat.jid===test.jid&&!chat.optOut&&!chat.deleted&&chat.handoffReason!=='view-once'&&/^prueba[.!?]*$/i.test(msg.text.trim())){this.store.put(this.w,'queue',msg.id,{id:msg.id,jid:msg.jid,timestamp:msg.timestamp,state:'pending',attempts:0,nextAt:Date.now(),testId:test.id});return msg;}
    if(!seen&&source==='live'&&!msg.fromMe&&msg.kind==='text'&&cutoff&&msg.timestamp>=cutoff&&bot?.enabled&&msg.timestamp>=bot.enabledAt&&this.eligible(chat)) {
      this.store.put(this.w,'queue',msg.id,{id:msg.id,jid:msg.jid,timestamp:msg.timestamp,state:'pending',attempts:0,nextAt:Date.now()});
    }
    return msg;
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
