import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Bot} from '../src/bot.mjs';

function makeBot(t){
 const dir=mkdtempSync(join(tmpdir(),'conversa-vars-')),keyFile=join(dir,'key');
 writeFileSync(keyFile,randomBytes(32));
 const store=new Store(dir,{keyFile});
 const b=new Bot(store,{workspace:'owner',history:{chat:jid=>({jid,name:'Contacto'})}});
 t.after(()=>{try{store.close?.();}catch{}rmSync(dir,{recursive:true,force:true});});
 return b;
}

test('{nombre} usa el primer nombre; se limpia si no se conoce',t=>{
 const b=makeBot(t);
 assert.equal(b.personalize('Hola {nombre}, gracias por escribir',{name:'Juan Pérez'}),'Hola Juan, gracias por escribir');
 assert.equal(b.personalize('Hola {nombre}, gracias',{name:'Contacto'}),'Hola, gracias');
 assert.equal(b.personalize('Bienvenido {nombre}!',{}),'Bienvenido!');
});

test('un texto sin variables queda EXACTAMENTE igual',t=>{
 const b=makeBot(t);
 for(const s of ['Gracias por escribir.','Precio: 100. ¿Algo más?','Atendemos de lunes a sábado  :)'])
  assert.equal(b.personalize(s,{name:'Ana'}),s);
});

test('{saludo} devuelve un saludo según la hora',t=>{
 const b=makeBot(t);
 assert.match(b.personalize('{saludo}, {nombre}',{name:'Ana López'}),/^(Buenos días|Buenas tardes|Buenas noches), Ana$/);
});
