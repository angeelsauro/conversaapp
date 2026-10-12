import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {History} from '../src/history.mjs';
import {createApp} from '../src/server.mjs';
import {demoConnector} from '../scripts/demo-data.mjs';

function request(port,host,method,path,{body,cookie}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method,agent:false,headers:{Host:host,...(body?{'Content-Type':'application/json',Origin:'https://'+host}:{}),...(cookie?{Cookie:cookie}:{})}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{let j=null;try{j=JSON.parse(d);}catch{}resolve({status:res.statusCode,headers:res.headers,json:j});});});req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();});}

async function boot(t,opts={}){const dir=opts.dir||mkdtempSync(join(tmpdir(),'conversa-sub-')),port=52300+Math.floor(Math.random()*600);
 const factory=(store,w)=>({workspace:w,history:new History(store,w),status:'disconnected',socket:{async sendMessage(){return {key:{id:'x'}};}},snapshot:()=>({status:'disconnected'}),pause(){},async pair(){},async connect(){},link(n){this.status='connected';this.identity={number:n};}});
 const app=createApp({dir,port,publicOrigin:'https://panel.example',appOrigin:'https://app.example',connectorFactory:factory,requireSubscription:true,...opts});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));await app.start();
 t.after(async()=>{app.close();await new Promise(r=>app.server.close(r));if(!opts.dir)rmSync(dir,{recursive:true,force:true});});
 const api=(m,p,o)=>request(port,'app.example',m,p,o),panel=(m,p,o)=>request(port,'panel.example',m,p,o);
 const owner=(await panel('POST','/api/login',{body:{token:readFileSync(join(dir,'owner-token'),'utf8')}})).headers['set-cookie'][0].split(';')[0];
 const signup=async n=>(await api('POST','/api/account/signup',{body:{number:n,password:'clave-segura-9',accept:true}})).headers['set-cookie'][0].split(';')[0];
 return {app,dir,api,panel,owner,signup};}

test('a client with no subscription is walled off; everything else returns 402',async t=>{
 const {api,signup}=await boot(t);
 const c=await signup('51988880001');
 const st=(await api('GET','/api/state',{cookie:c})).json;
 assert.equal(st.subscription.active,false);assert.equal(st.subscription.required,true);assert.equal(st.subscription.productId,'conversa_mensual');
 assert.equal((await api('GET','/api/subscription',{cookie:c})).json.active,false);
 // Functional routes are blocked with 402 and a subscribe flag.
 for(const [m,p,b] of [['POST','/api/connect',{}],['POST','/api/bot/config',{savedReplies:[]}],['GET','/api/chat/messages?jid=5199@s.whatsapp.net'],['POST','/api/chat/send',{jid:'5199@s.whatsapp.net',text:'hola'}]]){
  const r=await api(m,p,b?{cookie:c,body:b}:{cookie:c});assert.equal(r.status,402,m+' '+p);assert.equal(r.json.subscribe,true);}
 // But the account can still manage itself and sign out.
 assert.equal((await api('POST','/api/account/password',{cookie:c,body:{current:'clave-segura-9',password:'otra-clave-99'}})).status,200);
});

test('verifying a Google purchase unlocks the account; an expired one keeps it locked',async t=>{
 let next=null;const verifyPurchase=async(pid,token)=>{assert.equal(pid,'conversa_mensual');assert.ok(token);return next;};
 const {api,signup}=await boot(t,{verifyPurchase});
 const c=await signup('51988880002');
 // No active purchase found → stays locked (402).
 next=null;assert.equal((await api('POST','/api/subscription/verify',{cookie:c,body:{token:'tok-none'}})).status,402);
 next={expiry:Date.now()-1000};assert.equal((await api('POST','/api/subscription/verify',{cookie:c,body:{token:'tok-expired'}})).status,402);
 assert.equal((await api('GET','/api/state',{cookie:c})).json.subscription.active,false);
 // An active purchase → unlocked, and functional routes work.
 next={expiry:Date.now()+30*86400000,autoRenew:true};
 const ok=await api('POST','/api/subscription/verify',{cookie:c,body:{token:'tok-active'}});assert.equal(ok.status,200);assert.equal(ok.json.active,true);
 assert.equal((await api('GET','/api/state',{cookie:c})).json.subscription.active,true);
 assert.equal((await api('POST','/api/connect',{cookie:c,body:{}})).status,200);
 // Refresh re-checks the stored token; if Google now says expired, it locks again.
 next={expiry:Date.now()-1};assert.equal((await api('POST','/api/subscription/refresh',{cookie:c,body:{}})).status,402);
 assert.equal((await api('POST','/api/connect',{cookie:c,body:{}})).status,402);
});

test('the reviewer demo account and the owner are never walled off',async t=>{
 const demoFactory=(store,w)=>demoConnector(store,{History,workspace:w});
 const {api,panel,owner}=await boot(t,{demoAccount:'51900000000:ConversaDemo2026',demoFactory});
 await new Promise(r=>setTimeout(r,200));
 const demo=(await api('POST','/api/account/login',{body:{number:'51900000000',password:'ConversaDemo2026'}})).headers['set-cookie'][0].split(';')[0];
 assert.equal((await api('GET','/api/state',{cookie:demo})).json.subscription.active,true);
 assert.equal((await api('GET','/api/state',{cookie:demo})).json.subscription.required,false);
 assert.equal((await api('POST','/api/connect',{cookie:demo,body:{}})).status,200,'demo is never blocked');
 // The owner panel has no subscription wall at all.
 assert.equal((await panel('GET','/api/subscription',{cookie:owner})).json.active,true);
 assert.equal((await panel('GET','/api/state',{cookie:owner})).json.subscription,null);
});
