import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {makePlayVerifier,loadServiceAccount} from '../src/play-billing.mjs';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const sa={client_email:'svc@proj.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})};
const tokenRoute=['oauth2.googleapis.com/token',()=>({ok:true,status:200,json:async()=>({access_token:'ya29.fake',expires_in:3600})})];
function fakeFetch(routes){const calls=[];const fn=async(url,opts)=>{calls.push({url:String(url),opts});for(const [m,h] of routes)if(String(url).includes(m))return h(String(url),opts);return {ok:false,status:404,json:async()=>({})};};fn.calls=calls;return fn;}
const subRoute=(state,exp,ack='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',extra={})=>['purchases/subscriptionsv2/tokens/',()=>({ok:true,status:200,json:async()=>({subscriptionState:state,acknowledgementState:ack,lineItems:[{productId:'conversa_mensual',expiryTime:new Date(exp).toISOString(),...extra}]})})];

test('verifies an active subscription, authenticating with the service-account JWT',async()=>{
 const expiry=Date.now()+30*86400000;
 const fetch=fakeFetch([tokenRoute,subRoute('SUBSCRIPTION_STATE_ACTIVE',expiry,'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',{autoRenewingPlan:{autoRenewEnabled:true}})]);
 const r=await makePlayVerifier({serviceAccount:sa,packageName:'com.andinamusic.conversa',fetch})('conversa_mensual','tok-active');
 assert.ok(r&&Math.abs(r.expiry-expiry)<1000);assert.equal(r.autoRenew,true);
 assert.ok(fetch.calls.some(c=>c.url.includes('/token')&&/assertion=/.test(String(c.opts?.body))),'requested an access token with a signed assertion');
 assert.ok(fetch.calls.some(c=>c.url.includes('subscriptionsv2')&&c.opts?.headers?.Authorization==='Bearer ya29.fake'),'queried the purchase with the bearer token');
});

test('acknowledges a pending purchase so Google does not auto-refund',async()=>{
 const expiry=Date.now()+30*86400000;let ackUrl=null;
 const fetch=fakeFetch([tokenRoute,
  ['purchases/subscriptions/conversa_mensual/tokens/',u=>{ackUrl=u;return {ok:true,status:200,json:async()=>({})};}],
  subRoute('SUBSCRIPTION_STATE_ACTIVE',expiry,'ACKNOWLEDGEMENT_STATE_PENDING')]);
 const r=await makePlayVerifier({serviceAccount:sa,packageName:'p',fetch})('conversa_mensual','tok-pending');
 assert.ok(r.expiry>Date.now());assert.ok(ackUrl&&ackUrl.endsWith(':acknowledge'),'called the acknowledge endpoint');
});

test('canceled but within the paid period still grants; expired does not',async()=>{
 const future=Date.now()+5*86400000,past=Date.now()-86400000;
 let v=makePlayVerifier({serviceAccount:sa,packageName:'p',fetch:fakeFetch([tokenRoute,subRoute('SUBSCRIPTION_STATE_CANCELED',future)])});
 assert.ok((await v('conversa_mensual','t')).expiry>Date.now(),'canceled, still within period → granted');
 v=makePlayVerifier({serviceAccount:sa,packageName:'p',fetch:fakeFetch([tokenRoute,subRoute('SUBSCRIPTION_STATE_EXPIRED',past)])});
 assert.equal((await v('conversa_mensual','t')).expiry,0,'expired → not granted');
});

test('an unknown or foreign token (API 4xx) returns null',async()=>{
 const v=makePlayVerifier({serviceAccount:sa,packageName:'p',fetch:fakeFetch([tokenRoute])});// subscriptionsv2 falls through to 404
 assert.equal(await v('conversa_mensual','ghost'),null);
});

test('loadServiceAccount reads inline JSON or a file path, and rejects junk',()=>{
 const json=JSON.stringify({client_email:'a@b',private_key:'k'});
 assert.equal(loadServiceAccount({}),null);
 assert.deepEqual(loadServiceAccount({CONVERSA_GOOGLE_SA_JSON:json}),{client_email:'a@b',private_key:'k'});
 assert.deepEqual(loadServiceAccount({CONVERSA_GOOGLE_SA:'/x.json'},()=>json),{client_email:'a@b',private_key:'k'});
 assert.equal(loadServiceAccount({CONVERSA_GOOGLE_SA_JSON:'{bad'}),null);
 assert.equal(loadServiceAccount({CONVERSA_GOOGLE_SA_JSON:JSON.stringify({client_email:'a@b'})}),null,'needs a private key');
});
