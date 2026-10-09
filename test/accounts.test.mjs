import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {Store} from '../src/store.mjs';
import {History} from '../src/history.mjs';
import {Connector} from '../src/connector.mjs';
import {createApp,normalizeNumber} from '../src/server.mjs';
import {demoConnector,seedDemo} from '../scripts/demo-data.mjs';
import {Bot} from '../src/bot.mjs';

const raw=(jid,id,text,ms=Date.now())=>({key:{remoteJid:jid,id,fromMe:false},messageTimestamp:Math.floor(ms/1000),pushName:'Ana',message:{conversation:text}});
// A fake WhatsApp per workspace: pairing gives a code; tests decide when the phone accepts it.
function fakes(){const made=new Map(),sent=[];
 const factory=(store,w)=>{const c={workspace:w,history:new History(store,w),status:'disconnected',socket:null,identity:null,pairingCode:null,
  snapshot:()=>({status:c.status,pairingCode:c.pairingCode,identity:c.identity}),pause(){c.status='paused';},
  async pair(n){c.pairedWith=n;c.pairingCode='ABCD-EFGH';c.status='pairing';},async connect(){c.status='connecting';},async resume(){},
  async disconnect(){c.loggedOut=true;c.status='disconnected';},
  link(number){Object.assign(c,{status:'connected',identity:{number},pairingCode:null,socket:{async sendMessage(to,content){sent.push({w,to,text:content.text});return {key:{id:'x'}};}}});}};made.set(w,c);return c;};
 return {factory,made,sent};}
function request(port,host,method,path,{body,cookie,origin}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,agent:false,headers:{Host:host,...(body?{'Content-Type':'application/json',Origin:origin||'https://'+host}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{let json=null;try{json=JSON.parse(data);}catch{}resolve({status:res.statusCode,headers:res.headers,json,text:data});});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});}
async function boot(t,options={}){const dir=mkdtempSync(join(tmpdir(),'conversa-accounts-')),port=50100+Math.floor(Math.random()*800),f=fakes();
 const app=createApp({dir,port,publicOrigin:'https://panel.example',appOrigin:'https://app.example',connectorFactory:f.factory,...options});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));await app.start();
 t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const api=(method,path,opts)=>request(port,'app.example',method,path,opts),panel=(method,path,opts)=>request(port,'panel.example',method,path,opts);
 const cookieOf=r=>r.headers['set-cookie']?.[0]?.split(';')[0];
 return {app,dir,port,api,panel,cookieOf,...f};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

test('numbers are stored as international digits only',()=>{
 assert.equal(normalizeNumber('+51 999 888 777'),'51999888777');assert.equal(normalizeNumber('0051-999-888-777'),'51999888777');
 for(const bad of ['123','abc','+0 999 888 777','9'.repeat(16),null,{}])assert.equal(normalizeNumber(bad),null);
});

test('sign up: accept the risk, get a pairing code, and the account becomes usable once WhatsApp confirms the same number',async t=>{
 const {api,cookieOf,made,app}=await boot(t);
 assert.equal((await api('POST','/api/account/signup',{body:{number:'51 999 888 777',password:'clave-segura-1'}})).status,400,'the risk notice must be accepted');
 assert.equal((await api('POST','/api/account/signup',{body:{number:'51999888777',password:'corta',accept:true}})).status,400);
 const r=await api('POST','/api/account/signup',{body:{number:'+51 999 888 777',password:'clave-segura-1',accept:true}});
 assert.equal(r.status,200);assert.equal(r.json.pairingCode,'ABCD-EFGH');const cookie=cookieOf(r);assert.match(r.headers['set-cookie'][0],/^__Host-conversa_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000; Secure$/);
 const pending=(await api('GET','/api/state',{cookie})).json;assert.deepEqual({role:pending.role,linked:pending.account.linked,code:pending.connection.pairingCode},{role:'client',linked:false,code:'ABCD-EFGH'});
 const tenant=[...made.values()].find(c=>c.pairedWith==='51999888777');assert.ok(tenant&&tenant.workspace.startsWith('u_'));
 tenant.link('51999888777');await wait(700);
 assert.equal((await api('GET','/api/state',{cookie})).json.account.linked,true);
 assert.equal((await api('POST','/api/account/signup',{body:{number:'51999888777',password:'otra-clave-22',accept:true}})).status,409,'a linked number cannot be taken');
 assert.equal(app.store.get('system','accounts',[...app.store.list('system','accounts',-1)][0].id).passwordHash.startsWith('scrypt$'),true);
});

test('every client sees only their own workspace; the owner panel and the public app never mix',async t=>{
 const {api,panel,cookieOf,made,app}=await boot(t);
 const a=cookieOf(await api('POST','/api/account/signup',{body:{number:'51911111111',password:'clave-a-111',accept:true}})),b=cookieOf(await api('POST','/api/account/signup',{body:{number:'51922222222',password:'clave-b-222',accept:true}}));
 const ta=[...made.values()].find(c=>c.pairedWith==='51911111111'),tb=[...made.values()].find(c=>c.pairedWith==='51922222222');ta.link('51911111111');tb.link('51922222222');await wait(700);
 const tm=ta.history.establish('51911111111').firstLinkedAt+1000;ta.history.ingest(raw('51777@s.whatsapp.net','secret1','Mensaje privado de A',tm),'live');
 const sa=(await api('GET','/api/state',{cookie:a})).json,sb=(await api('GET','/api/state',{cookie:b})).json;
 assert.equal(sa.chats.length,1);assert.equal(sb.chats.length,0,'B does not see A');
 assert.equal((await api('GET','/api/chat/messages?jid=51777@s.whatsapp.net',{cookie:b})).json.messages.length,0);
 assert.equal((await api('GET','/api/media?id='+encodeURIComponent('51777@s.whatsapp.net:secret1'),{cookie:b})).status,404);
 assert.equal(app.store.count('owner','messages'),0,'nothing lands in the owner workspace');
 // Hosts: the owner code only works on the private panel; client accounts only on the app.
 assert.equal((await api('POST','/api/login',{body:{token:'x'.repeat(64)}})).status,404,'no owner login on the public app');
 assert.equal((await panel('POST','/api/account/login',{body:{number:'51911111111',password:'clave-a-111'}})).status,404,'no client login on the private panel');
 assert.equal((await panel('GET','/api/state',{cookie:a})).status,401,'a client session is not valid on the panel');
 assert.equal((await api('GET','/api/admin/accounts',{cookie:a})).status,404);
 const config=(await api('GET','/api/config')).json;assert.equal(config.mode,'app');assert.equal((await panel('GET','/api/config')).json.mode,'panel');
});

test('log in with number and password, with limits on guessing',async t=>{
 const {api,cookieOf}=await boot(t);
 await api('POST','/api/account/signup',{body:{number:'51933333333',password:'mi-clave-333',accept:true}});
 assert.equal((await api('POST','/api/account/login',{body:{number:'51933333333',password:'mala-clave'}})).status,401);
 assert.equal((await api('POST','/api/account/login',{body:{number:'51900000001',password:'mi-clave-333'}})).json.error,'Número o contraseña incorrectos.','same answer for unknown numbers');
 const ok=await api('POST','/api/account/login',{body:{number:'+51 933 333 333',password:'mi-clave-333'}});assert.equal(ok.status,200);assert.ok(cookieOf(ok));
 let last;for(let i=0;i<10;i++)last=await api('POST','/api/account/login',{body:{number:'51933333333',password:'adivina'+i}});assert.equal(last.status,429);
});

test('deleting an account erases its workspace, unlinks WhatsApp and frees the number',async t=>{
 const {api,cookieOf,made,app}=await boot(t);
 const cookie=cookieOf(await api('POST','/api/account/signup',{body:{number:'51944444444',password:'borrar-444-x',accept:true}}));
 const c=[...made.values()].find(x=>x.pairedWith==='51944444444');c.link('51944444444');await wait(700);
 const w=c.workspace,tm=c.history.establish('51944444444').firstLinkedAt+1000;c.history.ingest(raw('51888@s.whatsapp.net','m1','hola',tm),'live');assert.ok(app.store.count(w,'messages')>0);
 assert.equal((await api('POST','/api/account/delete',{cookie,body:{password:'incorrecta'}})).status,401);
 const del=await api('POST','/api/account/delete',{cookie,body:{password:'borrar-444-x'}});assert.equal(del.status,200);assert.match(del.headers['clear-site-data'],/cache/);
 assert.equal(c.loggedOut,true,'the linked device is removed from WhatsApp');
 assert.equal(app.store.count(w,'messages'),0);assert.equal(app.store.count(w,'chats'),0);assert.equal(app.store.count('system','accounts'),0);
 assert.equal((await api('GET','/api/state',{cookie})).status,401);
 assert.equal((await api('POST','/api/account/signup',{body:{number:'51944444444',password:'nueva-444-y',accept:true}})).status,200,'the number can sign up again');
});

test('password recovery: a code sent to the client\'s own WhatsApp; a new password closes the other sessions',async t=>{
 const {api,cookieOf,made,sent}=await boot(t);
 const old=cookieOf(await api('POST','/api/account/signup',{body:{number:'51955555555',password:'olvidada-555',accept:true}}));
 const c=[...made.values()].find(x=>x.pairedWith==='51955555555');c.link('51955555555');await wait(700);
 const r=await api('POST','/api/account/recover',{body:{number:'51955555555'}});assert.deepEqual(r.json,{method:'code'});
 assert.equal(sent[0].to,'51955555555@s.whatsapp.net','sent to the client\'s own chat');const code=/(\d{6})/.exec(sent[0].text)[1];
 assert.equal((await api('POST','/api/account/recover/verify',{body:{number:'51955555555',code:'000000'===code?'111111':'000000',password:'nueva-clave-55'}})).status,400);
 const ok=await api('POST','/api/account/recover/verify',{body:{number:'51955555555',code,password:'nueva-clave-55'}});assert.equal(ok.status,200);
 assert.equal((await api('GET','/api/state',{cookie:old})).status,401,'old sessions are closed');
 assert.equal((await api('POST','/api/account/login',{body:{number:'51955555555',password:'nueva-clave-55'}})).status,200);
 assert.equal((await api('POST','/api/account/recover',{body:{number:'51900000002'}})).json.method,'support','unknown or offline numbers get the support path');
});

test('account limit, Android asset links and public legal pages',async t=>{
 const {api,panel}=await boot(t,{maxAccounts:1,android:{package:'com.andinamusic.conversa',sha256:'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'}});
 assert.equal((await api('POST','/api/account/signup',{body:{number:'51966666661',password:'clave-666-1',accept:true}})).status,200);
 assert.equal((await api('POST','/api/account/signup',{body:{number:'51966666662',password:'clave-666-2',accept:true}})).status,503);
 const links=await api('GET','/.well-known/assetlinks.json');assert.equal(links.status,200);assert.equal(links.json[0].target.package_name,'com.andinamusic.conversa');
 const escape=await api('GET','/legal/../src/server.mjs');assert.notEqual(escape.status,200);assert.ok(!escape.text.includes('createApp'),'source files are never served');
 assert.equal((await api('GET','/legal/no-existe.html')).status,404);
 assert.equal((await api('GET','/legal/privacidad.html')).headers['x-robots-tag'],undefined,'the public app pages may be indexed');
 assert.equal((await panel('GET','/api/config')).headers['x-robots-tag'],'noindex, nofollow','the private panel never');
});

test('the reviewer demo account shows fictional chats and can never reach WhatsApp',async t=>{
 const demoFactory=(store,w)=>{const c=demoConnector(store,{History,qr:null,media:{},workspace:w});if(!store.count(w,'messages'))seedDemo({store,history:c.history,bot:new Bot(store,c)});return c;};
 const {api,cookieOf}=await boot(t,{demoAccount:'51900000000:revisor-demo-2026',demoFactory});await wait(300);
 const cookie=cookieOf(await api('POST','/api/account/login',{body:{number:'51900000000',password:'revisor-demo-2026'}}));assert.ok(cookie);
 const state=(await api('GET','/api/state',{cookie})).json;assert.equal(state.account.demo,true);assert.ok(state.chats.length>=7);
 assert.equal((await api('POST','/api/account/delete',{cookie,body:{password:'revisor-demo-2026'}})).status,400);
});

test('connector: pairing code for the account\'s number; a code used from another WhatsApp is undone; an unused code expires',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-pair-')),store=new Store(dir),socks=[];
 try{const c=new Connector(store,'u_test',()=>{const s={ev:new EventEmitter(),end(){},user:{id:'51911111111:3@s.whatsapp.net'},asked:[],async requestPairingCode(n){s.asked.push(n);return 'ABCDEFGH';},async logout(){s.loggedOut=true;}};socks.push(s);return s;});c.expectedNumber='51999888777';
  await c.pair('51999888777');socks[0].ev.emit('connection.update',{qr:'ref'});await new Promise(r=>setImmediate(r));
  assert.deepEqual(socks[0].asked,['51999888777']);assert.equal(c.snapshot().pairingCode,'ABCD-EFGH');assert.equal(c.status,'pairing');assert.equal(c.snapshot().qr,null,'no QR in code mode');
  socks[0].ev.emit('connection.update',{isNewLogin:true});socks[0].ev.emit('creds.update');socks[0].ev.emit('connection.update',{connection:'open'});await new Promise(r=>setImmediate(r));
  assert.equal(socks[0].loggedOut,true,'another number: logged out at once');assert.equal(c.status,'disconnected');assert.equal(store.get('u_test','auth','creds'),null);assert.match(c.note,/otro número/);
  await c.pair('51999888777');socks[1].ev.emit('connection.update',{qr:'ref'});await new Promise(r=>setImmediate(r));
  socks[1].ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:408}}}});
  assert.equal(c.status,'disconnected');assert.match(c.note,/caducó/);assert.equal(c.snapshot().pairingCode,null);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
