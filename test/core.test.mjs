import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import {Store} from '../src/store.mjs';
import {Connector,incomingMessage,authState} from '../src/connector.mjs';
import {createApp} from '../src/server.mjs';

function temp(){return mkdtempSync(join(tmpdir(),'conversa-test-'));}
test('encrypted storage survives reopening and isolates workspaces',()=>{
 const dir=temp();let s=new Store(dir);
 try{s.put('a','auth','same',{secret:'DO-NOT-STORE-PLAINTEXT'});s.put('b','auth','same',{secret:'tenant-b'});
 assert.equal(s.get('a','auth','same').secret,'DO-NOT-STORE-PLAINTEXT');assert.equal(s.get('b','auth','same').secret,'tenant-b');
 const row=s.db.prepare('SELECT value FROM records WHERE workspace=?').get('a');assert.equal(Buffer.from(row.value).includes(Buffer.from('DO-NOT-STORE-PLAINTEXT')),false);
 assert.throws(()=>s.decode(JSON.stringify(['b','auth','same']),row.value));s.close();s=new Store(dir);assert.equal(s.get('a','auth','same').secret,'DO-NOT-STORE-PLAINTEXT');
 s.clear('a','auth');assert.equal(s.get('a','auth','same'),null);assert.equal(s.get('b','auth','same').secret,'tenant-b');
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('Signal auth keys and credentials persist with binary types',async()=>{
 const dir=temp(),s=new Store(dir);try{const a=authState(s,'owner');a.save();await a.state.keys.set({'pre-key':{'1':{key:Buffer.from('hello')}}});const b=authState(s,'owner');assert.ok(Buffer.isBuffer(b.state.creds.noiseKey.private));const data=await b.state.keys.get('pre-key',['1']);assert.equal(data['1'].key.toString(),'hello');await b.state.keys.set({'pre-key':{'1':null}});assert.deepEqual(await b.state.keys.get('pre-key',['1']),{});}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
test('only new direct incoming messages are retained',()=>{
 const raw={key:{remoteJid:'123@s.whatsapp.net',id:'A',fromMe:false},messageTimestamp:2000,message:{conversation:'Hola'}};
 assert.equal(incomingMessage(raw,1000000).text,'Hola');assert.equal(incomingMessage(raw,3000000),null);
 for(const jid of ['123@g.us','status@broadcast','123@newsletter'])assert.equal(incomingMessage({...raw,key:{...raw.key,remoteJid:jid}},0),null);
 assert.equal(incomingMessage({...raw,key:{...raw.key,fromMe:true}},0),null);
 assert.equal(incomingMessage({...raw,message:{protocolMessage:{}}},0),null);
 assert.equal(incomingMessage({...raw,messageTimestamp:undefined},0),null);
});
test('pause invalidates delayed QR events; live events deduplicate without sends',async()=>{
 const dir=temp(),s=new Store(dir);const sockets=[];const c=new Connector(s,'owner',()=>{const sock={ev:new EventEmitter(),end(){},user:{id:'123:1@s.whatsapp.net',name:'Test'}};sockets.push(sock);return sock;});
 try{await c.connect();const old=sockets[0];c.pause();old.ev.emit('connection.update',{connection:'open'});assert.equal(c.status,'paused');
 await c.connect();const sock=sockets[1];sock.ev.emit('connection.update',{connection:'open'});assert.equal(c.status,'connected');
 const msg={key:{id:'A',remoteJid:'456@s.whatsapp.net'},messageTimestamp:Math.ceil(Date.now()/1000),message:{conversation:'Hi'}};
 sock.ev.emit('messages.upsert',{type:'append',messages:[msg]});assert.equal(s.list('owner','messages').length,1);
 sock.ev.emit('messages.upsert',{type:'notify',messages:[msg,msg]});assert.equal(s.list('owner','messages').length,1);
 assert.equal(c.snapshot().autoReply,false);
 }finally{c.pause();s.close();rmSync(dir,{recursive:true,force:true});}
});
test('HTTP rejects anonymous access, bad origins, host rebinding and wrong credentials',async()=>{
 const dir=temp(),port=49318;let connects=0;
 const app=createApp({dir,port,connectorFactory:()=>({snapshot:()=>({status:'disconnected'}),pause(){},connect(){connects++;},disconnect(){}})});
 await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));const base=`http://127.0.0.1:${port}`;
 const post=(path,body,extra={})=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 try{
 assert.equal((await fetch(base+'/api/state')).status,401);
 assert.equal((await post('/api/connect',{})).status,401);
 assert.equal((await post('/api/login',{token:'wrong'})).status,401);
 assert.equal((await post('/api/login',{token:readFileSync(join(dir,'owner-token'),'utf8')},{Origin:'https://evil.example'})).status,403);
 const hostileHost=await new Promise((resolve,reject)=>{const req=http.get(base+'/',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(hostileHost,403);
 const login=await post('/api/login',{token:readFileSync(join(dir,'owner-token'),'utf8')});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 assert.equal((await fetch(base+'/api/state',{headers:{Cookie:cookie}})).status,200);
 assert.equal((await post('/api/connect',{}, {Cookie:cookie})).status,200);assert.equal(connects,1);
 assert.equal((await post('/api/connect',{}, {Cookie:cookie,Origin:'https://evil.example'})).status,403);
 assert.equal((await post('/api/connect',{payload:'x'.repeat(5000)},{Cookie:cookie})).status,413);
 }finally{await new Promise(resolve=>app.server.close(resolve));app.store.close();rmSync(dir,{recursive:true,force:true});}
});

