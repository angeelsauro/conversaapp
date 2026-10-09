import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createECDH,randomBytes} from 'node:crypto';
import {History} from '../src/history.mjs';
import {createApp,clientKey} from '../src/server.mjs';
import {demoConnector} from '../scripts/demo-data.mjs';

// A fake WhatsApp per workspace that, like Baileys, reports the messages the server sends as new messages.
function fakes(){const made=new Map(),sent=[];
 const factory=(store,w)=>{const c={workspace:w,history:new History(store,w),status:'disconnected',socket:null,identity:null,pairingCode:null,pairs:0,
  snapshot:()=>({status:c.status,pairingCode:c.pairingCode}),pause(){c.status='paused';},async pair(n){c.pairs++;c.pairedWith=n;c.pairingCode='ABCD-EFGH';c.status='pairing';},async connect(){},async resume(){},async disconnect(){c.status='disconnected';},
  link(number){Object.assign(c,{status:'connected',identity:{number},pairingCode:null,socket:{async sendMessage(to,content,options={}){const id=options.messageId||randomBytes(8).toString('hex');sent.push({w,to,text:content.text,id});
   c.history.ingest({key:{remoteJid:to,id,fromMe:true},messageTimestamp:Math.floor(Date.now()/1000),message:{conversation:content.text}},'live');return {key:{remoteJid:to,id,fromMe:true}};}}});}};made.set(w,c);return c;};
 return {factory,made,sent};}
function request(port,host,method,path,{body,cookie,headers={}}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,agent:false,headers:{Host:host,...(body?{'Content-Type':'application/json',Origin:'https://'+host}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{let json=null;try{json=JSON.parse(data);}catch{}resolve({status:res.statusCode,headers:res.headers,json});});});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});}
async function boot(t,options={}){const dir=options.dir||mkdtempSync(join(tmpdir(),'conversa-sec-')),port=51900+Math.floor(Math.random()*900),f=fakes();
 const app=createApp({dir,port,publicOrigin:'https://panel.example',appOrigin:'https://app.example',connectorFactory:f.factory,...options,dir});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));await app.start();
 const stop=async()=>{app.close();await new Promise(r=>app.server.close(r));};
 t.after(async()=>{await stop().catch(()=>{});if(!options.dir)rmSync(dir,{recursive:true,force:true});});
 const api=(m,p,o)=>request(port,'app.example',m,p,o),cookieOf=r=>r.headers['set-cookie']?.[0]?.split(';')[0];
 const signup=async(number,password='clave-segura-1')=>cookieOf(await api('POST','/api/account/signup',{body:{number,password,accept:true}}));
 const tenant=number=>[...f.made.values()].find(c=>c.pairedWith===number);
 return {app,dir,port,api,cookieOf,signup,tenant,stop,...f};}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const sub=()=>{const ua=createECDH('prime256v1');ua.generateKeys();return {endpoint:'https://fcm.googleapis.com/push/'+randomBytes(4).toString('hex'),keys:{p256dh:ua.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};};

test('rate limits group IPv6 clients by /64 and read IPv4-mapped addresses as IPv4',()=>{
 assert.equal(clientKey('203.0.113.9'),'203.0.113.9');assert.equal(clientKey('::ffff:203.0.113.9'),'203.0.113.9');
 assert.equal(clientKey('2001:db8:1:2:aaaa::1'),clientKey('2001:0db8:0001:0002:bbbb:cccc:dddd:eeee'));assert.equal(clientKey('2001:db8:1:2::1'),'2001:db8:1:2::/64');
 assert.notEqual(clientKey('2001:db8:1:3::1'),clientKey('2001:db8:1:2::1'));assert.equal(clientKey('fe80::1%eth0'),'fe80:0:0:0::/64');
});

test('six addresses in one IPv6 /64 count as one for sign-ups',async t=>{
 const {api}=await boot(t,{trustProxyIp:true});
 const from=(i,number)=>api('POST','/api/account/signup',{body:{number,password:'clave-segura-1',accept:true},headers:{'CF-Connecting-IP':`2001:db8:5:6::${i}`}});
 for(let i=1;i<=5;i++)assert.equal((await from(i,'5197000000'+i)).status,200);
 assert.equal((await from(6,'51970000006')).status,429);
});

test('sign-ups never confirmed on the phone free their number and their place after 30 minutes',async t=>{
 const {app,api,signup}=await boot(t,{maxAccounts:2});
 await signup('51911100001');await signup('51911100002');
 assert.equal((await api('GET','/api/config')).json.signup,false);
 await app.housekeeping(Date.now()+29*60000);assert.equal(app.store.list('system','accounts',-1).length,2,'not before 30 minutes');
 await app.housekeeping(Date.now()+31*60000);
 assert.equal(app.store.list('system','accounts',-1).length,0);assert.equal(app.store.count('system','numbers'),0);assert.equal((await api('GET','/api/config')).json.signup,true);
});

test('the same number signing up twice at once creates one account',async t=>{
 const {app,api}=await boot(t);
 const both=await Promise.all([1,2].map(()=>api('POST','/api/account/signup',{body:{number:'51922200002',password:'clave-segura-1',accept:true}})));
 assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);assert.equal(app.store.list('system','accounts',-1).length,1);
});

test('linking codes for one number are capped at 5 an hour, and every link is announced on the phone',async t=>{
 const {api,signup,tenant,sent,app}=await boot(t);
 const cookie=await signup('51933300003');const c=tenant('51933300003');
 for(let i=0;i<4;i++)assert.equal((await api('POST','/api/connect',{cookie,body:{}})).status,200);
 const sixth=await api('POST','/api/connect',{cookie,body:{}});assert.equal(sixth.status,400);assert.match(sixth.json.error,/muchos códigos/);assert.equal(c.pairs,5);
 c.link('51933300003');await wait(700);
 assert.equal(sent.length,1);assert.equal(sent[0].to,'51933300003@s.whatsapp.net');assert.match(sent[0].text,/Si no fuiste tú/);
 assert.equal(app.store.count(c.workspace,'messages'),0,'the notice is not stored in the inbox');
});

test('the recovery code never lands in the inbox, so a session cookie alone cannot read it',async t=>{
 const {app,api,signup,tenant,sent}=await boot(t);
 const cookie=await signup('51944400004');const c=tenant('51944400004');c.link('51944400004');await wait(700);
 assert.deepEqual((await api('POST','/api/account/recover',{body:{number:'51944400004'}})).json,{method:'code'});
 const code=/(\d{6})/.exec(sent.at(-1).text)[1];
 assert.equal(app.store.count(c.workspace,'messages'),0);assert.equal(app.store.count(c.workspace,'chats'),0);
 const seen=JSON.stringify([(await api('GET','/api/state',{cookie})).json,(await api('GET','/api/chat/messages?jid=51944400004@s.whatsapp.net',{cookie})).json]);
 assert.ok(!seen.includes(code));
});

test('changing the password: limited guesses, and the other sessions lose their notifications too',async t=>{
 const {app,api,signup,tenant,cookieOf}=await boot(t);
 const phone=await signup('51955500005','primera-clave-5');tenant('51955500005').link('51955500005');await wait(700);
 const laptop=cookieOf(await api('POST','/api/account/login',{body:{number:'51955500005',password:'primera-clave-5'}}));
 assert.equal((await api('POST','/api/push/subscribe',{cookie:phone,body:{subscription:sub()}})).status,200);
 const w=tenant('51955500005').workspace;assert.equal(app.store.count(w,'push'),1);
 assert.equal((await api('POST','/api/account/password',{cookie:laptop,body:{current:'primera-clave-5',password:'segunda-clave-5'}})).status,200);
 assert.equal(app.store.count(w,'push'),0,'the closed session stops receiving message previews');
 assert.equal((await api('GET','/api/state',{cookie:phone})).status,401);
 const guesses=[];for(let i=0;i<6;i++)guesses.push((await api('POST','/api/account/password',{cookie:laptop,body:{current:'mala-'+i,password:'otra-clave-55'}})).status);
 assert.deepEqual(guesses,[401,401,401,401,429,429],'4 wrong guesses after the change, then a wait');
});

test('a request still arriving when the account is deleted writes nothing back',async t=>{
 const {app,api,signup,tenant,port}=await boot(t);
 const cookie=await signup('51966600006','borrar-clave-6');const c=tenant('51966600006');c.link('51966600006');await wait(700);
 // Start a settings change whose body arrives slowly…
 const body=JSON.stringify({mode:'standard',keywordOnly:true,savedReplies:[{id:'a',name:'Hola',text:'Hola',keywords:['hola']}]});
 const slow=new Promise(resolve=>{const req=http.request({host:'127.0.0.1',port,path:'/api/bot/config',method:'POST',agent:false,headers:{Host:'app.example',Origin:'https://app.example','Content-Type':'application/json',Cookie:cookie,'Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.write(body.slice(0,10));setTimeout(()=>req.end(body.slice(10)),400);});
 await wait(100);
 // …while the account is deleted from another device.
 assert.equal((await api('POST','/api/account/delete',{cookie,body:{password:'borrar-clave-6'}})).status,200);
 assert.equal(await slow,401);
 assert.equal(app.store.get(c.workspace,'settings','bot'),null);assert.equal(app.store.list('system','accounts',-1).length,0);
});

test('presence keeps at most 6 tabs per session; exporting is limited',async t=>{
 const {api,signup}=await boot(t);
 const cookie=await signup('51977700007');
 const tabs=[];for(let i=0;i<7;i++)tabs.push((await api('POST','/api/presence',{cookie,body:{tab:'tab'+i,visible:true}})).status);
 assert.deepEqual(tabs,[200,200,200,200,200,200,429]);
 assert.equal((await api('POST','/api/presence',{cookie,body:{tab:'tab0',visible:true}})).status,200,'an open tab keeps reporting');
 const exports=[];for(let i=0;i<6;i++)exports.push((await api('GET','/api/export',{cookie})).status);assert.deepEqual(exports,[200,200,200,200,200,429]);
});

test('changing the reviewer demo password in the settings takes effect on restart',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-demo-pass-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const demoFactory=(store,w)=>demoConnector(store,{History,workspace:w});
 const first=await boot(t,{dir,demoAccount:'51900000999:primera-demo-1',demoFactory});await wait(300);
 assert.equal((await first.api('POST','/api/account/login',{body:{number:'51900000999',password:'primera-demo-1'}})).status,200);await first.stop();
 const second=await boot(t,{dir,demoAccount:'51900000999:segunda-demo-2',demoFactory});await wait(300);
 assert.equal((await second.api('POST','/api/account/login',{body:{number:'51900000999',password:'segunda-demo-2'}})).status,200);
 assert.equal((await second.api('POST','/api/account/login',{body:{number:'51900000999',password:'primera-demo-1'}})).status,401);
});
