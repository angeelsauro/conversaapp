// Verifies Google Play subscription purchases with the Play Developer API.
// Zero dependencies: signs the service-account JWT with node:crypto and talks
// to androidpublisher over fetch. Returns {expiry, autoRenew} or null, which is
// exactly what createApp's verifyPurchase hook expects.
import {createSign} from 'node:crypto';

const TOKEN_URL='https://oauth2.googleapis.com/token';
const SCOPE='https://www.googleapis.com/auth/androidpublisher';
const API='https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
// States where the user still has access: active, in a billing grace period, or
// cancelled but not yet past the paid-through date (auto-renew off, still valid).
const GRANT=new Set(['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED']);

const b64url=buf=>Buffer.from(buf).toString('base64').replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');

function signJwt(sa){
 const now=Math.floor(Date.now()/1000);
 const head=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
 const body=b64url(JSON.stringify({iss:sa.client_email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600}));
 const data=head+'.'+body;
 return data+'.'+b64url(createSign('RSA-SHA256').update(data).sign(sa.private_key));
}

// Reads the service account from CONVERSA_GOOGLE_SA_JSON (inline JSON) or
// CONVERSA_GOOGLE_SA (path to the JSON file). Returns null when none is set.
export function loadServiceAccount(env=process.env,readFile){
 const inline=env.CONVERSA_GOOGLE_SA_JSON;
 const path=env.CONVERSA_GOOGLE_SA;
 let raw=inline;
 if(!raw&&path&&readFile){try{raw=readFile(path);}catch{return null;}}
 if(!raw)return null;
 try{const sa=JSON.parse(raw);return (sa&&sa.client_email&&sa.private_key)?sa:null;}catch{return null;}
}

export function makePlayVerifier({serviceAccount,packageName,fetch=globalThis.fetch,now=Date.now}){
 if(!serviceAccount?.client_email||!serviceAccount?.private_key)throw new Error('Service account inválida.');
 if(!packageName)throw new Error('Falta el nombre del paquete.');
 const app=API+'/'+encodeURIComponent(packageName);
 let cached=null;// {token,exp}
 async function accessToken(){
  if(cached&&cached.exp>now()+60000)return cached.token;
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signJwt(serviceAccount)});
  const r=await fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok)throw new Error('No se pudo autenticar con Google ('+r.status+').');
  const j=await r.json();
  cached={token:j.access_token,exp:now()+((j.expires_in||3600)*1000)};
  return cached.token;
 }
 return async function verifyPurchase(productId,token){
  const auth='Bearer '+await accessToken();
  const r=await fetch(app+'/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token),{headers:{Authorization:auth}});
  if(!r.ok)return null;// 400/404/410 → token unknown, cancelled long ago, or not ours
  const sub=await r.json();
  const items=Array.isArray(sub.lineItems)?sub.lineItems:[];
  const expiry=items.map(i=>Date.parse(i?.expiryTime||'')).filter(n=>n>0).reduce((a,b)=>Math.max(a,b),0);
  const autoRenew=items.some(i=>i?.autoRenewingPlan?.autoRenewEnabled);
  const granted=GRANT.has(sub.subscriptionState)&&expiry>now();
  // Acknowledge pending purchases so Google does not auto-refund after 3 days.
  if(granted&&sub.acknowledgementState==='ACKNOWLEDGEMENT_STATE_PENDING'){
   const sku=items[0]?.productId||productId;
   try{await fetch(app+'/purchases/subscriptions/'+encodeURIComponent(sku)+'/tokens/'+encodeURIComponent(token)+':acknowledge',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:'{}'});}catch{}
  }
  return {expiry:granted?expiry:0,autoRenew};
 };
}
