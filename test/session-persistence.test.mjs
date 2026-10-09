import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Connector} from '../src/connector.mjs';
import {lockDirectory} from '../src/lock.mjs';

const make=()=>{const dir=mkdtempSync(join(tmpdir(),'conversa-session-'));return {dir,store:new Store(dir),done(){this.store.close();rmSync(dir,{recursive:true,force:true});}};};
const factory=sockets=>()=>{const sock={ev:new EventEmitter(),end(){},user:{id:'34600000000:5@s.whatsapp.net',name:'Prueba'}};sockets.push(sock);return sock;};
const close=(sock,statusCode,data)=>sock.ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode},data}}});
// Links a connector: the socket saves its credentials and opens.
async function linked(store,sockets){const c=new Connector(store,'owner',factory(sockets));await c.connect();const sock=sockets.at(-1);sock.ev.emit('creds.update');sock.ev.emit('connection.update',{connection:'open'});await new Promise(r=>setImmediate(r));assert.equal(c.status,'connected');return c;}
const hasLink=store=>!!store.get('owner','auth','creds');

test('transient WhatsApp errors (500 bad session, 503, 408, 428) keep the link and reconnect',async()=>{
 const t=make(),sockets=[];
 try{const c=await linked(t.store,sockets);
  for(const code of [500,503,408,428]){const sock=sockets.at(-1);close(sock,code,{tag:'unknown'});await new Promise(r=>setImmediate(r));
   assert.equal(hasLink(t.store),true,`code ${code} must not unlink`);assert.equal(c.status,'reconnecting');
   clearTimeout(c.retryTimer);await c.connect(true);sockets.at(-1).ev.emit('connection.update',{connection:'open'});await new Promise(r=>setImmediate(r));assert.equal(c.status,'connected');}
  c.pause(false);
 }finally{t.done();}
});

test('a server restart or power cut resumes the same link without a new QR',async()=>{
 const t=make(),sockets=[];
 try{const c=await linked(t.store,sockets);c.pause(false);// shutdown: SIGTERM or the process simply dies
  const after=new Connector(t.store,'owner',factory(sockets));await after.resume();
  assert.equal(sockets.length,2,'resume opens a new socket with the saved credentials');assert.equal(after.status,'connecting');assert.equal(hasLink(t.store),true);after.pause(false);
  // An explicit pause from the panel is the one state a restart keeps.
  const paused=new Connector(t.store,'owner',factory(sockets));paused.pause();await new Connector(t.store,'owner',factory(sockets)).resume();assert.equal(sockets.length,2);
 }finally{t.done();}
});

test('another connection with the same link pauses this one, but a restart resumes it',async()=>{
 const t=make(),sockets=[];
 try{const c=await linked(t.store,sockets);close(sockets.at(-1),440,{tag:'conflict',attrs:{type:'replaced'}});
  assert.equal(c.status,'paused');assert.equal(hasLink(t.store),true);
  await new Connector(t.store,'owner',factory(sockets)).resume();assert.equal(sockets.length,2);
 }finally{t.done();}
});

test('only removing Conversa from Linked devices on the phone ends the link',async()=>{
 for(const [code,data] of [[401,undefined],[440,{tag:'conflict',attrs:{type:'device_removed'}}]]){
  const t=make(),sockets=[];
  try{const c=await linked(t.store,sockets);close(sockets.at(-1),code,data);
   assert.equal(hasLink(t.store),false);assert.equal(c.status,'disconnected');assert.match(c.note,/Dispositivos vinculados/);
   await new Connector(t.store,'owner',factory(sockets)).resume();assert.equal(sockets.length,1,'no reconnection without a new QR');
  }finally{t.done();}
 }
});

test('a local failure retries later instead of leaving WhatsApp off until a restart',async()=>{
 const t=make(),sockets=[];
 try{const c=await linked(t.store,sockets);c.fail('Error de prueba');assert.equal(c.status,'error');assert.ok(c.retryTimer,'retry scheduled');
  c.pause(false);
  const unlinked=new Connector(t.store,'owner',factory(sockets));unlinked.desired(false);unlinked.retryTimer=undefined;unlinked.fail('x');assert.equal(unlinked.retryTimer,undefined,'an explicit pause is respected');
 }finally{t.done();}
});

test('after a reboot the new process may get the PID written in the old lock: it is reclaimed',()=>{
 const dir=mkdtempSync(join(tmpdir(),'conversa-lock-'));
 try{
 // Same PID and, by coincidence, the same start tick as the process that died: nothing tells them apart.
 let start;try{start=readFileSync('/proc/self/stat','utf8').split(') ')[1].split(' ')[19];}catch{}
 writeFileSync(join(dir,'server.lock'),JSON.stringify({pid:process.pid,start}));const unlock=lockDirectory(dir);assert.equal(existsSync(join(dir,'server.lock')),true);unlock();assert.equal(existsSync(join(dir,'server.lock')),false);}
 finally{rmSync(dir,{recursive:true,force:true});}
});
