import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync}from 'node:fs';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {History}from '../src/history.mjs';
import {createApp}from '../src/server.mjs';

const img={imageMessage:{mimetype:'image/jpeg',fileLength:11,mediaKey:new Uint8Array(32).fill(7),directPath:'/v/t62/ok',fileSha256:new Uint8Array(32),fileEncSha256:new Uint8Array(32)}};
const raw=(jid,id,ts,msg)=>({key:{remoteJid:jid,id,fromMe:false},messageTimestamp:Math.floor(ts/1000),message:msg,pushName:'X'});

async function startApp(dir,port,downloadMedia){
 const app=createApp({dir,port,connectorFactory:store=>({history:new History(store),status:'connected',downloadMedia,snapshot:()=>({status:'connected'}),pause(){}})});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
 const base=`http://127.0.0.1:${port}`;
 const cookie=(await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({token:readFileSync(join(dir,'owner-token'),'utf8')})})).headers.get('set-cookie').split(';')[0];
 return {app,base,cookie};
}

test('media: un archivo descargado queda guardado y se sirve aun cuando WhatsApp ya no lo da',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-mediap-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const jid='51900000009@s.whatsapp.net',mid=encodeURIComponent(jid+':vid');

 // App 1: WhatsApp entrega el archivo una vez → Conversa lo descarga y lo GUARDA en el almacén cifrado.
 let downloads=0;
 const a1=await startApp(dir,49970,async()=>{downloads++;return Buffer.from('BYTES-DEL-VIDEO');});
 a1.app.connector.history.establish('51999999999');
 a1.app.connector.history.ingest(raw(jid,'vid',Date.now(),img),'live');
 const r1=await fetch(`${a1.base}/api/media?id=${mid}`,{headers:{Cookie:a1.cookie}});
 assert.equal(r1.status,200);
 assert.equal(await r1.text(),'BYTES-DEL-VIDEO');
 assert.equal(downloads,1,'se descargó de WhatsApp una vez');
 assert.ok(a1.app.vault.has('owner',jid+':vid'),'quedó guardado en el almacén');
 a1.app.close();await new Promise(r=>a1.app.server.close(r));

 // App 2 (como un reinicio): ahora WhatsApp YA NO entrega el archivo (lo borró / caducó).
 // Debe servirse igual, desde el almacén en disco.
 const a2=await startApp(dir,49971,async()=>{throw new Error('EXPIRED');});
 const r2=await fetch(`${a2.base}/api/media?id=${mid}`,{headers:{Cookie:a2.cookie}});
 assert.equal(r2.status,200,'se sirve desde el disco aunque WhatsApp ya no lo tenga');
 assert.equal(await r2.text(),'BYTES-DEL-VIDEO','el contenido es el mismo');
 a2.app.close();await new Promise(r=>a2.app.server.close(r));
});
