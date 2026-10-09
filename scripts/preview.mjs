// Vista previa local con datos ficticios: no conecta con WhatsApp ni envía mensajes reales.
// Uso: npm run preview  →  abre el enlace que imprime (puerto 4319 por defecto, PREVIEW_PORT para cambiarlo).
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import QRCode from 'qrcode';
import {createApp} from '../src/server.mjs';
import {History} from '../src/history.mjs';
import {demoConnector,seedDemo} from './demo-data.mjs';
import {DEMO_MEDIA} from './demo-media.mjs';

if(process.env.NODE_ENV==='production')throw new Error('La vista previa no se ejecuta en producción.');
const port=Number(process.env.PREVIEW_PORT||4319),dir=mkdtempSync(join(tmpdir(),'conversa-preview-'));
const qr=await QRCode.toDataURL('Vista previa de Conversa. Este código no vincula ningún dispositivo.',{width:300,margin:2,errorCorrectionLevel:'M'});
const app=createApp({dir,port,connectorFactory:(store,workspace)=>demoConnector(store,{History,qr,media:DEMO_MEDIA,workspace}),testEndpoints:process.env.CONVERSA_TEST_ENDPOINTS==='on'});
seedDemo({store:app.store,history:app.connector.history,bot:app.bot,media:DEMO_MEDIA});

app.server.listen(port,'127.0.0.1',async()=>{
 await app.start();
 const token=readFileSync(join(dir,'owner-token'),'utf8').trim();
 console.log(`\nVista previa de Conversa con datos ficticios (sin WhatsApp, sin envíos reales).\nTu panel:          http://127.0.0.1:${port}/#access=${token}\nApp para clientes: http://localhost:${port}/  (registro con un código ficticio)\nEl código es temporal y se borra al cerrar (Ctrl+C).\n`);
});
let closing=false;
const shutdown=()=>{if(closing)return;closing=true;app.connector.stop();app.close();rmSync(dir,{recursive:true,force:true});process.exit(0);};
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,shutdown);
app.server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`El puerto ${port} está ocupado. Usa PREVIEW_PORT=otro.`:e.message);shutdown();});
