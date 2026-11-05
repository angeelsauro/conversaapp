import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sendText,parseWebhook,verifyChallenge,validSignature} from '../src/cloud-api.mjs';

test('sendText: POST a v25.0 con bearer, devuelve el id del mensaje',async()=>{
 let cap=null;
 const fetch=async(url,opts)=>{cap={url,opts};return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.ABC'}]})};};
 const id=await sendText({token:'TKN',phoneId:'1348410968363707',to:'51999',body:'hola',fetch});
 assert.equal(id,'wamid.ABC');
 assert.match(cap.url,/graph\.facebook\.com\/v25\.0\/1348410968363707\/messages$/);
 assert.equal(cap.opts.headers.Authorization,'Bearer TKN');
 const sent=JSON.parse(cap.opts.body);
 assert.equal(sent.messaging_product,'whatsapp');assert.equal(sent.to,'51999');assert.equal(sent.text.body,'hola');
});

test('sendText: lanza el mensaje de error que devuelve la API',async()=>{
 const fetch=async()=>({ok:false,status:401,json:async()=>({error:{message:'Invalid OAuth access token'}})});
 await assert.rejects(sendText({token:'x',phoneId:'1',to:'2',body:'h',fetch}),/Invalid OAuth access token/);
});

test('parseWebhook: extrae texto, remitente y nombre del contacto',()=>{
 const body={object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:'134'},contacts:[{wa_id:'51999',profile:{name:'Juan Pérez'}}],messages:[{from:'51999',id:'wamid.1',timestamp:'1730800000',type:'text',text:{body:'hola'}}]}}]}]};
 const r=parseWebhook(body);
 assert.equal(r.phoneId,'134');
 assert.equal(r.messages.length,1);
 assert.deepEqual({from:r.messages[0].from,text:r.messages[0].text,name:r.messages[0].name},{from:'51999',text:'hola',name:'Juan Pérez'});
 assert.equal(r.messages[0].timestamp,1730800000000);
});

test('parseWebhook: recoge estados de entrega',()=>{
 const r=parseWebhook({entry:[{changes:[{value:{statuses:[{id:'wamid.1',status:'delivered',recipient_id:'51999',timestamp:'1730800001'}]}}]}]});
 assert.equal(r.statuses[0].status,'delivered');assert.equal(r.statuses[0].recipient,'51999');
});

test('verifyChallenge: solo con el token correcto',()=>{
 assert.equal(verifyChallenge({mode:'subscribe',token:'secreto',challenge:'123',verifyToken:'secreto'}),'123');
 assert.equal(verifyChallenge({mode:'subscribe',token:'malo',challenge:'123',verifyToken:'secreto'}),null);
 assert.equal(verifyChallenge({mode:'otro',token:'secreto',challenge:'123',verifyToken:'secreto'}),null);
});

test('validSignature: acepta la firma correcta y rechaza la falsa',()=>{
 const raw='{"a":1}',secret='appsecret';
 const good='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 assert.equal(validSignature(raw,good,secret),true);
 assert.equal(validSignature(raw,'sha256=deadbeef',secret),false);
 assert.equal(validSignature(raw,good,'otro-secreto'),false);
 assert.equal(validSignature(raw,'',secret),false);
});
