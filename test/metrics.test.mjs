import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {History} from '../src/history.mjs';
import {createApp} from '../src/server.mjs';

const raw=(jid,id,text,ts,fromMe=false)=>({key:{remoteJid:jid,id,fromMe},messageTimestamp:Math.floor(ts/1000),message:{conversation:text},pushName:'Cliente'});

test('metrics: cuenta contactos y mensajes recibidos/enviados de los últimos 7 días',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-metrics-')),port=49940;
 const app=createApp({dir,port,connectorFactory:store=>({history:new History(store),status:'connected',snapshot:()=>({status:'connected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${port}`,cookie=(await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})})).headers.get('set-cookie').split(';')[0];
 const h=app.connector.history,t0=h.establish('1').firstLinkedAt;
 h.ingest(raw('51900000001@s.whatsapp.net','a1','hola',t0+1000),'live');
 h.ingest(raw('51900000001@s.whatsapp.net','a2','respuesta',t0+2000,true),'live');
 h.ingest(raw('51900000002@s.whatsapp.net','b1','buenas',t0+3000),'live');
 const r=await fetch(base+'/api/metrics',{headers:{Cookie:cookie}});
 assert.equal(r.status,200);
 const m=await r.json();
 assert.equal(m.chats,2,'dos contactos');
 assert.ok(m.nuevos7>=2,'dos contactos nuevos esta semana');
 assert.ok(m.recibidos7>=2,'al menos 2 recibidos');
 assert.ok(m.enviados7>=1,'al menos 1 enviado');
 assert.equal(m.porDia.length,7,'siete días en el gráfico');
 assert.ok(m.porDia.every(d=>typeof d.in==='number'&&typeof d.out==='number'&&typeof d.label==='string'));
});
