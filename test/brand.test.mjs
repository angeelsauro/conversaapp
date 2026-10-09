import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {deflateSync,crc32} from 'node:zlib';
import {createECDH,randomBytes} from 'node:crypto';
import {History} from '../src/history.mjs';
import {createApp} from '../src/server.mjs';

// A real (tiny, solid colour) PNG of the given size.
function png(w,h=w){const chunk=(type,data)=>{const len=Buffer.alloc(4),crc=Buffer.alloc(4);len.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type),data])));return Buffer.concat([len,Buffer.from(type),data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const row=Buffer.concat([Buffer.from([0]),Buffer.alloc(w*3,0x5a)]);
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.concat(Array(h).fill(row)))),chunk('IEND',Buffer.alloc(0))]);}
const dataUrl=b=>'data:image/png;base64,'+b.toString('base64');
function request(port,host,method,path,{body,cookie}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,agent:false,headers:{Host:host,...(body?{'Content-Type':'application/json',Origin:'https://'+host}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>{const buf=Buffer.concat(parts);let json=null;try{json=JSON.parse(buf);}catch{}resolve({status:res.statusCode,headers:res.headers,buf,json});});});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});}

async function boot(t){const dir=mkdtempSync(join(tmpdir(),'conversa-brand-')),port=51000+Math.floor(Math.random()*800),payloads=[];
 const factory=(store,w)=>({workspace:w,history:new History(store,w),status:'disconnected',snapshot:()=>({status:'disconnected'}),pause(){},async pair(){},async connect(){}});
 const app=createApp({dir,port,publicOrigin:'https://panel.example',appOrigin:'https://app.example',connectorFactory:factory,pushSender:async(sub,payload)=>{payloads.push(JSON.parse(payload));return {ok:true};}});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));await app.start();
 t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const panel=(m,p,o)=>request(port,'panel.example',m,p,o),api=(m,p,o)=>request(port,'app.example',m,p,o);
 const owner=(await panel('POST','/api/login',{body:{token:readFileSync(join(dir,'owner-token'),'utf8')}})).headers['set-cookie'][0].split(';')[0];
 const client=(await api('POST','/api/account/signup',{body:{number:'51955555555',password:'clave-cliente-5',accept:true}})).headers['set-cookie'][0].split(';')[0];
 return {app,panel,api,owner,client,payloads};}

test('only the super admin can rename the app and change its logo; clients never see the option',async t=>{
 const {panel,api,owner,client}=await boot(t);
 const cs=(await api('GET','/api/state',{cookie:client})).json;assert.equal(cs.brand,null);assert.equal(cs.brandEditable,false);
 assert.equal((await api('POST','/api/brand',{cookie:client,body:{name:'Mía'}})).status,404,'a client account cannot set a brand');
 assert.equal((await panel('GET','/api/state',{cookie:owner})).json.brandEditable,true);
 // Logos must be real PNGs of the exact sizes, both at once.
 for(const bad of [{icon192:'data:image/svg+xml;base64,PHN2Zz4=',icon512:dataUrl(png(512))},{icon192:dataUrl(png(200)),icon512:dataUrl(png(512))},{icon192:dataUrl(png(192))},{icon192:dataUrl(Buffer.from('not a png')),icon512:dataUrl(png(512))}])
  assert.equal((await panel('POST','/api/brand',{cookie:owner,body:{name:'Calculadora',...bad}})).status,400,JSON.stringify(Object.keys(bad)));
 assert.equal((await panel('POST','/api/brand',{cookie:owner,body:{name:'  '}})).status,400,'a name is required');
 assert.equal((await panel('POST','/api/brand',{cookie:owner,body:{name:'x'.repeat(40)}})).json.brand.name.length,30,'long names are cut to 30');
 const icon192=png(192),saved=await panel('POST','/api/brand',{cookie:owner,body:{name:'Calculadora',icon192:dataUrl(icon192),icon512:dataUrl(png(512))}});
 assert.equal(saved.status,200);assert.deepEqual({name:saved.json.brand.name,icon:saved.json.brand.icon},{name:'Calculadora',icon:true});
 // The owner's installed app takes the new name and icon; the public app and anyone without the owner session keep Conversa.
 const manifest=(await panel('GET','/manifest.webmanifest',{cookie:owner})).json;assert.equal(manifest.name,'Calculadora');assert.equal(manifest.short_name,'Calculadora');assert.doesNotMatch(JSON.stringify(manifest),/Conversa|WhatsApp/);assert.match(manifest.icons[0].src,/^\/brand\/icon-192\.png\?v=\d+$/);
 assert.equal((await panel('GET','/manifest.webmanifest')).json.name,'Conversa');assert.equal((await api('GET','/manifest.webmanifest',{cookie:client})).json.name,'Conversa');
 assert.deepEqual((await panel('GET','/brand/icon-192.png',{cookie:owner})).buf,icon192);assert.notDeepEqual((await panel('GET','/brand/icon-192.png')).buf,icon192);
 assert.equal((await panel('GET','/api/state',{cookie:owner})).json.brand.name,'Calculadora');
 // Renaming keeps the logo; restoring brings Conversa back.
 await panel('POST','/api/brand',{cookie:owner,body:{name:'Notas'}});assert.deepEqual((await panel('GET','/brand/icon-192.png',{cookie:owner})).buf,icon192);
 assert.equal((await panel('POST','/api/brand',{cookie:owner,body:{reset:true}})).status,200);assert.equal((await panel('GET','/manifest.webmanifest',{cookie:owner})).json.name,'Conversa');assert.equal((await panel('GET','/api/state',{cookie:owner})).json.brand,null);
});

test('ready-made generic logos are served only to the super admin',async t=>{
 const {panel,api,owner,client}=await boot(t);
 const ok=await panel('GET','/brand/preset/calculadora.svg',{cookie:owner});assert.equal(ok.status,200);assert.match(ok.headers['content-type'],/^image\/svg\+xml/);assert.match(ok.buf.toString(),/^<svg /);assert.doesNotMatch(ok.buf.toString(),/<text|<script|href=/,'pure shapes: no text, scripts or links');
 assert.equal((await panel('GET','/brand/preset/calculadora.svg')).status,404);assert.equal((await api('GET','/brand/preset/calculadora.svg',{cookie:client})).status,404);
 assert.equal((await panel('GET','/brand/preset/nope.svg',{cookie:owner})).status,404);
 for(const path of ['/brand/preset/..%2Fapp.js','/brand/preset/../../src/server.mjs'])assert.notEqual((await panel('GET',path,{cookie:owner})).status,200,path);
});

test('with a custom brand, notifications carry its name and icon instead of Conversa',async t=>{
 const {app,panel,owner,payloads}=await boot(t);
 await panel('POST','/api/brand',{cookie:owner,body:{name:'Clima',icon192:dataUrl(png(192)),icon512:dataUrl(png(512))}});
 const ua=createECDH('prime256v1');ua.generateKeys();
 await panel('POST','/api/push/subscribe',{cookie:owner,body:{subscription:{endpoint:'https://fcm.googleapis.com/push/'+randomBytes(4).toString('hex'),keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}}});
 await panel('POST','/api/push/settings',{cookie:owner,body:{preview:false}});
 const h=app.connector.history,tm=h.establish('1').firstLinkedAt+1000;h.ingest({key:{remoteJid:'51988877766@s.whatsapp.net',id:'n1',fromMe:false},messageTimestamp:Math.floor(tm/1000),message:{conversation:'hola'}},'live');await new Promise(r=>setTimeout(r,40));
 assert.equal(payloads.at(-1).title,'Clima');assert.match(payloads.at(-1).icon,/^\/brand\/icon-192\.png\?v=\d+$/);assert.doesNotMatch(JSON.stringify(payloads.at(-1)),/Conversa|hola/);
 await panel('POST','/api/push/test',{cookie:owner,body:{}});assert.equal(payloads.at(-1).title,'Clima');
});
