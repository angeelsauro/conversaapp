import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readdirSync,readFileSync}from 'node:fs';
import {randomBytes}from 'node:crypto';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {Store}from '../src/store.mjs';
import {MediaVault}from '../src/media-vault.mjs';

function make(t,opts){
 const dir=mkdtempSync(join(tmpdir(),'conversa-vault-')),keyFile=join(dir,'key');
 writeFileSync(keyFile,randomBytes(32));
 const store=new Store(dir,{keyFile});
 const vault=new MediaVault(store,join(dir,'media'),opts);
 t.after(()=>{try{store.close?.();}catch{}rmSync(dir,{recursive:true,force:true});});
 return {store,vault,dir};
}

test('vault: guarda y recupera el mismo archivo',t=>{
 const {vault}=make(t);
 const data=Buffer.from('contenido de un video de prueba 🎥');
 assert.equal(vault.save('owner','m1',data),true);
 assert.equal(vault.has('owner','m1'),true);
 assert.deepEqual(vault.load('owner','m1'),data);
 assert.equal(vault.load('owner','noexiste'),null);
});

test('vault: el archivo en disco está CIFRADO (no se lee en claro)',t=>{
 const {vault,dir}=make(t);
 const secret=Buffer.from('SECRETO_VISIBLE_1234567890');
 vault.save('owner','m2',secret);
 // Junta todos los bytes de los archivos en la carpeta media y comprueba que el texto no aparece.
 const mediaDir=join(dir,'media');let found=false;
 const walk=p=>{for(const n of readdirSync(p,{withFileTypes:true})){const f=join(p,n.name);if(n.isDirectory())walk(f);else if(readFileSync(f).includes(secret))found=true;}};
 walk(mediaDir);
 assert.equal(found,false,'el contenido NO debe aparecer en claro en el disco');
});

test('vault: respeta el límite de espacio y borra los más antiguos',t=>{
 const {vault}=make(t,{maxBytes:1000});
 vault.save('owner','a',Buffer.alloc(400,1));
 vault.save('owner','b',Buffer.alloc(400,2));
 assert.equal(vault.has('owner','a'),true);
 assert.equal(vault.has('owner','b'),true);
 vault.save('owner','c',Buffer.alloc(400,3));// ahora 1200 > 1000 → borra el más viejo (a)
 assert.equal(vault.has('owner','a'),false,'el más antiguo se borró');
 assert.equal(vault.has('owner','b'),true);
 assert.equal(vault.has('owner','c'),true);
 assert.ok(vault.usage().bytes<=1000);
});

test('vault: el índice sobrevive al reinicio (se reconstruye desde el Store)',t=>{
 const {store,vault,dir}=make(t);
 vault.save('owner','persiste',Buffer.from('dato que debe seguir ahí'));
 // Simula reinicio: un vault nuevo sobre el mismo Store y carpeta.
 const vault2=new MediaVault(store,join(dir,'media'));
 assert.equal(vault2.has('owner','persiste'),true);
 assert.deepEqual(vault2.load('owner','persiste'),Buffer.from('dato que debe seguir ahí'));
});

test('vault: purgar un espacio borra solo sus archivos',t=>{
 const {vault}=make(t);
 vault.save('u_cliente','x',Buffer.from('del cliente'));
 vault.save('owner','y',Buffer.from('del dueño'));
 vault.purge('u_cliente');
 assert.equal(vault.has('u_cliente','x'),false);
 assert.equal(vault.has('owner','y'),true);
});

test('vault: deshabilitado (maxBytes 0) no guarda nada',t=>{
 const {vault}=make(t,{maxBytes:0});
 assert.equal(vault.enabled(),false);
 assert.equal(vault.save('owner','z',Buffer.from('algo')),false);
 assert.equal(vault.has('owner','z'),false);
});
