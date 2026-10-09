const $=id=>document.getElementById(id);
let state=null,busy=false,lastVisual='',lastMessages='',lastChats='',botLoaded=false,reviewJid=null,online=false;
const labels={disconnected:'Sin conexión',connecting:'Conectando',qr:'Escanea el QR',pairing:'Esperando código',connected:'Conectado',paused:'En pausa',reconnecting:'Reconectando',error:'Sin conexión'};
// 'app': public app for client accounts (welcome, sign-up, pairing); 'panel': the owner's private panel.
let appMode=false;
const titles={connection:'Ajustes',inbox:'Chats',bot:'Mi bot'};
const date=t=>new Intl.DateTimeFormat('es',{dateStyle:'short',timeStyle:'short'}).format(new Date(t));
function page(name){for(const section of document.querySelectorAll('.page'))section.hidden=section.id!==name;for(const button of document.querySelectorAll('.nav')){button.classList.toggle('active',button.dataset.page===name);if(button.dataset.page===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}$('page-title').textContent=titles[name];document.body.dataset.page=name;if(name==='connection')updatePushCard();syncChatFocus();window.scrollTo({top:0,behavior:'instant'});}
document.addEventListener('click',e=>{const button=e.target.closest('[data-page]');if(button)page(button.dataset.page);});
async function api(path,input={},{keepalive=false}={}){const res=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),keepalive,signal:AbortSignal.timeout(35000)});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'No se pudo completar la acción ('+res.status+').');return data;}
function ask(text,ok='Confirmar',danger=false){return new Promise(resolve=>{const d=$('confirm-generic');$('confirm-text').textContent=text;$('confirm-ok').textContent=ok;$('confirm-ok').className=danger?'danger':'primary';d.onclose=()=>resolve(d.returnValue==='ok');d.returnValue='';d.showModal();});}
$('confirm-cancel').onclick=()=>$('confirm-generic').close('cancel');$('confirm-ok').onclick=()=>$('confirm-generic').close('ok');
// Short-lived floating notices (bottom of the screen) instead of lines of text in the layout.
let lastToast='',lastToastAt=0;
function toast(message,kind='info'){if(!message)return;const now=Date.now();if(message===lastToast&&now-lastToastAt<5000)return;lastToast=message;lastToastAt=now;const box=$('toasts'),item=document.createElement('div');item.className='toast '+kind;item.textContent=message;box.append(item);while(box.children.length>3)box.firstChild.remove();setTimeout(()=>{item.classList.add('leaving');setTimeout(()=>item.remove(),300);},kind==='error'?5200:3400);}
const notice=message=>toast(message);
function error(message){if(message)toast(message,'error');}
async function action(name,input={}){if(busy)return;busy=true;error('');try{const data=await api(name,input);await refresh();return data;}catch(e){error(e.message);}finally{busy=false;if(state&&online)render();}}
$('connect').onclick=()=>action('connect');$('pause').onclick=()=>action('pause');$('disconnect').onclick=()=>$('confirm-disconnect').showModal();$('cancel-disconnect').onclick=()=>$('confirm-disconnect').close();$('confirm-action').onclick=()=>{$('confirm-disconnect').close();action('disconnect');};
$('logout').onclick=async()=>{(await currentSubscription())?.unsubscribe().catch(()=>{});await action('logout');stopListening();state=null;botLoaded=false;lastUnreadTotal=null;$('messages').replaceChildren();$('chat-list').replaceChildren();$('qr-area').replaceChildren();lastVisual='';lastMessages='';lastChats='';resetInbox();};
document.getElementById('login-form')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('login',{token:$('access-token').value.trim()});$('access-token').value='';await refresh();}catch(err){error(err.message);}});
function render(){
 const c=state.connection,badge=$('global-status');badge.textContent=labels[c.status]||'Sin conexión';badge.className='badge '+(c.status==='connected'?'good':['connecting','qr','reconnecting'].includes(c.status)?'pending':'neutral');
 $('device-name').textContent=c.identity?.name||'Tu conexión';$('connect').hidden=c.status==='connected';$('connect').textContent=c.status==='paused'?'Reanudar conexión':state.role==='client'&&!c.hasSession?'Vincular con código':c.hasSession?'Reconectar':'Generar QR';$('connect').disabled=busy||['connecting','reconnecting','qr'].includes(c.status);$('pause').hidden=!['connected','connecting','qr','reconnecting'].includes(c.status);$('pause').disabled=busy;$('disconnect').hidden=c.status!=='connected';$('disconnect').disabled=busy;
 $('connection-note').textContent=c.note||'';document.querySelector('.connection-layout')?.classList.toggle('is-connected',c.status==='connected');
 $('account-card').hidden=state.role!=='client';if(state.role==='client'){$('account-number').textContent='+'+state.account.number+(state.account.demo?' · cuenta de demostración':'');$('account-delete').hidden=$('account-password').hidden=!!state.account.demo;}
 const visual=JSON.stringify([c.status,c.qr,c.pairingCode]);if(visual!==lastVisual){lastVisual=visual;const area=$('qr-area');area.replaceChildren();if(c.pairingCode){const code=el('output','pairing-code',c.pairingCode),p=el('p','','En WhatsApp: Dispositivos vinculados → Vincular un dispositivo → Vincular con el número de teléfono.');area.append(el('h3','','Escribe este código en WhatsApp'),code,p);}else if(c.qr){const img=document.createElement('img');img.src=c.qr;img.alt='QR privado para vincular WhatsApp';area.append(img);}else{const mark=document.createElement('div');mark.className=['connecting','reconnecting','qr'].includes(c.status)?'spinner':c.status==='connected'?'checkmark':'empty-mark';mark.setAttribute('aria-hidden','true');mark.textContent=c.status==='connected'?'✓':'↗';const h=document.createElement('h3');h.textContent=c.status==='connected'?'Conectado':c.status==='paused'?'En pausa':['connecting','reconnecting','qr'].includes(c.status)?'Conectando…':'Sin vincular';const p=document.createElement('p');p.textContent=c.status==='connected'&&c.identity?.number?'+'+c.identity.number:'';area.append(mark,h,p);}}
 renderInbox();applyBrand(state.brand);renderOwnerCard();
 const bot=state.bot;$('bot-state').textContent=bot.enabled?'Bot activado':'Bot desactivado';$('bot-state').className='badge '+(bot.enabled?'good':'neutral');$('bot-toggle').textContent=bot.enabled?'Detener bot':'Activar bot';$('bot-toggle').disabled=busy;$('bot-summary').textContent='Corte de seguridad: '+(c.link?.firstLinkedAt?date(c.link.firstLinkedAt):'pendiente de vinculación')+'. '+(c.link?.cutoffSource==='legacy-conservative'?'Sesión anterior: se aplica el corte conservador de la actualización. ':'')+(bot.handoffAfterReply?'Una respuesta por chat y luego pasa a tu revisión. ':'')+'Límite: 60 respuestas por hora. STOP detiene las respuestas al contacto.';
 if(!botLoaded){loadReplyEditor(bot);botLoaded=true;}
 renderReplyLibrary();
}
$('review-cancel').onclick=()=>$('review-chat').close();$('review-confirm').onclick=()=>{$('review-chat').close();action('chat/review',{jid:reviewJid,enabled:true});};
$('bot-toggle').onclick=async()=>{if(!state.bot.enabled&&!await ask('¿Activar el bot? Enviará tus textos guardados, sin cambios, a los chats nuevos que hayas revisado cuando un mensaje coincida con sus palabras clave.','Activar bot'))return;action('bot/config',{enabled:!state.bot.enabled});};
$('preview-form').onsubmit=async e=>{e.preventDefault();$('preview-result').textContent='Preparando respuesta…';const result=await action('bot/preview',{text:$('preview-question').value});$('preview-result').textContent=result ? (result.text||'Sin una coincidencia única: el bot no enviará ningún mensaje y pasará el chat a revisión.') : 'No se pudo completar la prueba.';};
// Screens: owner sign-in, client welcome, WhatsApp pairing, or the app itself.
function showScreen(name){document.body.dataset.screen=name;$('locked').hidden=name!=='locked';$('welcome').hidden=name!=='welcome';$('pairing').hidden=name!=='pairing';$('workspace').hidden=name!=='app';}
function welcomeError(message){$('welcome-error').textContent=message||'';$('welcome-error').hidden=!message;}
function welcomeTab(name){for(const [tab,form] of [['tab-signup','signup-form'],['tab-login','client-login']]){const on=form===name;$(tab).setAttribute('aria-selected',String(on));$(tab).classList.toggle('selected',on);$(form).hidden=!on;}$('recover-form').hidden=name!=='recover-form';welcomeError('');}
$('tab-signup').onclick=()=>welcomeTab('signup-form');$('tab-login').onclick=()=>welcomeTab('client-login');
$('forgot').onclick=()=>{welcomeTab('recover-form');$('recover-number').value=$('login-number').value;$('recover-step2').hidden=true;$('recover-note').textContent='';$('recover-submit').textContent='Enviarme el código';$('recover-number').focus();};
$('recover-back').onclick=()=>welcomeTab('client-login');
async function submitting(form,work){const button=form.querySelector('button[type=submit]');button.disabled=true;welcomeError('');try{await work();}catch(e){welcomeError(e.message);}finally{button.disabled=false;}}
$('signup-form').onsubmit=e=>{e.preventDefault();submitting(e.target,async()=>{if(!$('signup-accept').checked)throw new Error('Para continuar, marca la casilla de aceptación.');await api('account/signup',{number:$('signup-number').value,password:$('signup-password').value,accept:true});$('signup-password').value='';await refresh();});};
$('client-login').onsubmit=e=>{e.preventDefault();submitting(e.target,async()=>{await api('account/login',{number:$('login-number').value,password:$('login-password').value});$('login-password').value='';await refresh();});};
$('recover-form').onsubmit=e=>{e.preventDefault();submitting(e.target,async()=>{const number=$('recover-number').value;
 if($('recover-step2').hidden){const r=await api('account/recover',{number});if(r.method==='code'){$('recover-step2').hidden=false;$('recover-submit').textContent='Guardar contraseña nueva';$('recover-note').textContent='Listo: revisa tu chat «Mensaje a ti mismo» en WhatsApp. El código caduca en 10 minutos.';$('recover-code').focus();}
  else $('recover-note').textContent='No pudimos enviarte el código porque tu WhatsApp no está conectado a Conversa. Si nunca terminaste de vincularlo, vuelve a crear la cuenta pasados 30 minutos; si no, escríbenos desde ese número (ver «Eliminar cuenta» o «Privacidad» para el contacto).';return;}
 await api('account/recover/verify',{number,code:$('recover-code').value,password:$('recover-password').value});$('recover-password').value='';await refresh();});};
// Pairing: a code typed in WhatsApp on the same phone; the app opens on its own once WhatsApp accepts it.
function renderPairing(){const c=state.connection,code=c.pairingCode;$('pairing-code').textContent=code||'····-····';$('pairing-copy').disabled=!code;
 const expired=c.status==='disconnected'||c.status==='error',left=c.pairingExpiresAt?Math.max(0,Math.round((c.pairingExpiresAt-Date.now())/60000)):0;
 $('pairing-status').textContent=expired?(c.note||'El código caducó. Pide uno nuevo.'):code?`Esperando a que escribas el código en WhatsApp…${left?` Caduca en unos ${left} min.`:''}`:c.status==='connected'?'¡Vinculado! Abriendo tu bandeja…':'Pidiendo el código a WhatsApp…';
 $('pairing-status').classList.toggle('warn',expired);$('pairing-retry').hidden=!expired&&!!code;$('pairing-retry').disabled=busy;}
$('pairing-copy').onclick=()=>{const code=state?.connection.pairingCode;if(code)copyText(code.replace('-',''),'Código copiado.').then(()=>{$('pairing-status').textContent='Código copiado. Pégalo en WhatsApp.';});};
$('pairing-retry').onclick=async()=>{busy=true;try{await api('connect');}catch(e){$('pairing-status').textContent=e.message;}finally{busy=false;}refresh();};
$('pairing-logout').onclick=()=>$('logout').onclick();
// Client account: change password, sign out, delete the account (with its data and the WhatsApp link).
$('account-logout').onclick=()=>$('logout').onclick();
$('account-password').onclick=()=>{$('password-error').hidden=true;$('password-form').reset();$('password-dialog').showModal();};
$('password-cancel').onclick=()=>$('password-dialog').close();
$('password-form').onsubmit=async e=>{e.preventDefault();try{await api('account/password',{current:$('password-current').value,password:$('password-new').value});$('password-dialog').close();notice('Contraseña cambiada.');}catch(err){$('password-error').textContent=err.message;$('password-error').hidden=false;}};
$('account-delete').onclick=()=>{$('delete-error').hidden=true;$('delete-form').reset();$('delete-dialog').showModal();};
$('delete-cancel').onclick=()=>$('delete-dialog').close();
$('delete-form').onsubmit=async e=>{e.preventDefault();try{await api('account/delete',{password:$('delete-password').value});$('delete-dialog').close();(await currentSubscription())?.unsubscribe().catch(()=>{});stopListening();state=null;online=false;resetInbox();showScreen('welcome');welcomeTab('signup-form');welcomeError('');$('welcome-error').hidden=false;$('welcome-error').textContent='Tu cuenta y tus datos se eliminaron.';}catch(err){$('delete-error').textContent=err.message;$('delete-error').hidden=false;}};
// One refresh at a time; a change announced meanwhile triggers exactly one more.
let refreshing=null,refreshAgain=false,lastRefreshAt=0,events=null,eventsOpen=false,changeTimer=null;
async function refresh(){if(refreshing){refreshAgain=true;return refreshing;}refreshing=(async()=>{try{do{refreshAgain=false;await loadState();}while(refreshAgain);}finally{refreshing=null;}})();return refreshing;}
async function loadState(){try{const res=await fetch('/api/state',{signal:AbortSignal.timeout(8000)});lastRefreshAt=Date.now();if(res.status===401){online=false;stopListening();state=null;showScreen(appMode?'welcome':'locked');$('global-status').textContent='Acceso privado';return;}if(!res.ok)throw new Error();state=await res.json();const recovered=!online;online=true;if(recovered){error('');presence();}
 // A client account that has not linked WhatsApp yet sees only the pairing screen.
 if(state.role==='client'&&!state.account.linked){showScreen('pairing');renderPairing();listen();return;}
 showScreen('app');render();listen();}catch{const was=online;online=false;$('global-status').textContent='Sin servidor';$('global-status').className='badge neutral';document.querySelectorAll('.device-actions button').forEach(b=>b.disabled=true);$('bot-toggle').disabled=true;if(was)error('Sin conexión con el servidor');}}
// Live updates: the server announces every change; polling stays as a slow safety net (and the only way in the file demo).
function listen(){if(events||!LIVE||!window.EventSource||!online)return;events=new EventSource('/api/events');events.addEventListener('change',()=>{clearTimeout(changeTimer);changeTimer=setTimeout(refresh,60);});events.onopen=()=>{eventsOpen=true;};events.onerror=()=>{eventsOpen=false;if(events?.readyState===EventSource.CLOSED)events=null;};}
function stopListening(){events?.close();events=null;eventsOpen=false;}
// Tells the server whether a panel is on screen, so it does not also send a push for what you are already seeing.
const TAB=Math.random().toString(36).slice(2,12);
// keepalive: the «hidden» notice still leaves when a phone suspends the page right away.
function presence(){if(LIVE&&online)api('presence',{visible:!document.hidden,tab:TAB},{keepalive:true}).catch(()=>{});}
async function loginFromLink(){const params=new URLSearchParams(location.hash.slice(1)),token=params.get('access'),chat=params.get('chat');if(token||chat)history.replaceState(null,'',location.pathname);if(chat)pendingOpen=chat;if(token){try{await api('login',{token});}catch(e){error(e.message);}}await refresh();}
async function init(){page('inbox');applyTheme(document.documentElement.dataset.themeChoice||'auto');if(LIVE){try{const config=await (await fetch('/api/config')).json();appMode=config.mode==='app';document.body.dataset.mode=config.mode;if(appMode&&!config.signup){$('tab-signup').hidden=true;welcomeTab('client-login');}}catch{}}await loginFromLink();window.addEventListener('hashchange',loginFromLink);setInterval(()=>{if(!document.hidden&&!busy&&(!eventsOpen||Date.now()-lastRefreshAt>30000))refresh();},3000);setInterval(()=>{if(!document.hidden)presence();},50000);document.addEventListener('visibilitychange',()=>{presence();if(!document.hidden)refresh();});setupApp();}

// Conversation UI: all contact content is inserted as text, never HTML.
let selectedChat=null,lastBubbleId=null,chatFilter='all',inboxSignature='',inboxChats=[],lastUnreadTotal=null,audioContext=null,chatCache={jid:null,messages:[],more:false,loading:false,lastTs:null,unreadAtOpen:0},reading=new Set(),bubbleCache=new Map(),players=new Map(),replyTo=null,pendingOpen=null;
let soundEnabled=false;try{soundEnabled=localStorage.getItem('conversa-sound')==='on';}catch{}
const LIVE=/^https?:$/.test(location.protocol),MEDIA_KINDS=['image','video','audio','document','sticker'],REACTIONS=['👍','❤️','😂','😮','😢','🙏'];
const EMOJIS='😀 😂 🤣 😊 😍 😘 😉 😎 🤔 😅 🙂 🤗 😇 😢 😭 😡 👍 👎 👏 🙏 💪 👌 🙌 👋 🎉 🔥 ❤️ 💚 💯 ✅ ❌ ⭐ 🎂 🍰 🥖 ☕ 🛵 📦 📍 ⏰ 📞 💬'.split(' ');
// The single-file demo has no server: it provides its fictional files through this hook.
const mediaUrl=id=>window.conversaDemoMedia?.(id)||'/api/media?id='+encodeURIComponent(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
// Fixed icon set (constant markup, never contact data): the same drawing on Android, iOS and Windows.
const ICONS={check:'<path d="M20 6 9 17l-5-5"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',alert:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',spark:'<path d="m12 3 1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/>',audio:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',video:'<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>',document:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',view_once:'<circle cx="12" cy="12" r="9"/><path d="m11 9 2-1v8"/>',sticker:'<path d="M15.5 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l8-8V8.5z"/><path d="M14 21v-4a3 3 0 0 1 3-3h4"/>',other:'<path d="m21.4 11.6-9.2 9.2a5.7 5.7 0 0 1-8-8l9.2-9.2a3.8 3.8 0 0 1 5.3 5.3l-9.2 9.2a1.9 1.9 0 0 1-2.7-2.7l8.5-8.5"/>',play:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',pause:'<rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>',reply:'<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',smile:'<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',contrast:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',location:'<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',contact:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',poll:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',event:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',invite:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a6 6 0 0 0-4-5.6"/>',call:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',deleted:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'};
const CARD_KINDS=['location','contact','poll','event','invite','call'];
// «Contacto» is WhatsApp's placeholder: show the number instead when we have it.
const displayName=c=>c.name&&c.name!=='Contacto'?c.name:/@s\.whatsapp\.net$/.test(c.jid||'')?'+'+c.jid.split('@')[0]:'Contacto';
const icon=(name,cls='')=>{const t=document.createElement('template');t.innerHTML=`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(ICONS,name)?ICONS[name]:ICONS.other}</svg>`;return t.content.firstChild;};
const initials=name=>Array.from((name||'?').trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]).join('')).slice(0,2).join('').toUpperCase();
const avatarTone=jid=>'tone-'+([...jid].reduce((v,c)=>v+c.charCodeAt(0),0)%5);
const clockTime=t=>new Intl.DateTimeFormat('es',{hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const startOfDay=t=>{const d=new Date(t);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();};
// Chat list: time for today, then «Ayer», weekday for the last week and a short date before that.
const listTime=t=>{const today=startOfDay(Date.now());if(t>=today)return clockTime(t);if(t>=today-86400000)return 'Ayer';if(t>=today-6*86400000)return new Intl.DateTimeFormat('es',{weekday:'long'}).format(new Date(t));return new Intl.DateTimeFormat('es',{dateStyle:'short'}).format(new Date(t));};
const dayLabel=t=>{const today=startOfDay(Date.now());if(t>=today)return 'Hoy';if(t>=today-86400000)return 'Ayer';return new Intl.DateTimeFormat('es',{day:'numeric',month:'long',year:'numeric'}).format(new Date(t));};
const duration=s=>{s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const fileSize=b=>!b?'':b>=1048576?(b/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(b/1024))+' KB';
const lastTime=c=>c.last?.timestamp||c.latest||0,stamp=c=>lastTime(c)+'|'+(c.rev||0);
function chatStatus(c){if(c.handoffAt)return {label:'Para tu revisión',tone:'review'};if(c.optOut)return {label:'Respuestas bloqueadas',tone:'paused'};if(c.classification==='old')return {label:'Chat anterior',tone:'paused'};if(c.enabled)return {label:state.bot.enabled?'Bot disponible':'Bot desactivado',tone:state.bot.enabled?'bot':'paused'};return {label:'Pendiente de verificar',tone:'paused'};}
function mediaLabel(kind){return ({view_once:'Visualización única',image:'Foto',audio:'Mensaje de voz',video:'Video',document:'Documento',sticker:'Sticker',location:'Ubicación',contact:'Contacto',poll:'Encuesta',event:'Evento',invite:'Invitación a un grupo',call:'Llamada',deleted:'Se eliminó este mensaje'})[kind]||'Mensaje no compatible';}
// Initials first; the contact's WhatsApp photo fades in over them once the server has it.
function fillAvatar(node,chat){const key=chat.jid+'|'+(chat.photo||'')+'|'+chat.name;if(node.dataset.key===key)return node;node.dataset.key=key;node.className='contact-avatar '+avatarTone(chat.jid);node.textContent=initials(displayName(chat).replace(/^\+/,'#'));node.setAttribute('aria-hidden','true');
 if(chat.photo&&LIVE){const img=new Image();img.alt='';img.decoding='async';img.onload=()=>node.classList.add('has-photo');img.onerror=()=>img.remove();img.src=`/api/avatar?jid=${encodeURIComponent(chat.jid)}&v=${chat.photo}`;node.append(img);}return node;}
function updateSoundButton(){const b=$('sound-toggle');b.setAttribute('aria-pressed',String(soundEnabled));b.setAttribute('aria-label',soundEnabled?'Desactivar sonido de mensajes':'Activar sonido de mensajes');b.title=soundEnabled?'Sonido activado':'Sonido desactivado';b.classList.toggle('sound-on',soundEnabled);}
async function chime(){if(!soundEnabled)return;try{navigator.vibrate?.(60);if(!audioContext||audioContext.state!=='running')return;const t=audioContext.currentTime;for(const [delay,freq]of [[0,660],[.12,880]]){const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,t+delay);g.gain.linearRampToValueAtTime(.08,t+delay+.015);g.gain.exponentialRampToValueAtTime(.001,t+delay+.24);o.connect(g);g.connect(audioContext.destination);o.start(t+delay);o.stop(t+delay+.25);}}catch{}}
$('sound-toggle').onclick=async()=>{soundEnabled=!soundEnabled;try{localStorage.setItem('conversa-sound',soundEnabled?'on':'off');if(soundEnabled){audioContext ||=new(window.AudioContext||window.webkitAudioContext)();await audioContext.resume();}}catch{soundEnabled=false;}updateSoundButton();chime();notice(soundEnabled?'Sonido activado':'Sonido desactivado');};
// A gesture unlocks previously opted-in audio after a reload; no notification permission is requested.
document.addEventListener('pointerdown',()=>{if(soundEnabled){try{audioContext ||=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume().catch(()=>{});}catch{}}},{once:true});
function stopPlayers(){for(const a of players.values())a.pause();players.clear();}
function resetInbox(){selectedChat=null;inboxSignature='';chatCache={jid:null,messages:[],more:false,loading:false,lastTs:null,unreadAtOpen:0};bubbleCache=new Map();stopPlayers();cancelReply();closeReactMenu();$('chat-detail').hidden=true;$('chat-empty').hidden=false;$('inbox-layout').classList.remove('chat-open');syncChatFocus();}
$('chat-search').addEventListener('input',()=>drawChatList());
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{chatFilter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});drawChatList();});
$('chat-back').onclick=()=>{resetInbox();drawChatList();$('chat-search').focus();};
$('chat-options').onclick=()=>$('profile').hidden?openProfile():closeProfile();
$('profile-open').onclick=()=>openProfile();
// Contact profile: large photo, number, WhatsApp «info», shared files and the bot options for this chat.
let profileFor=null;
async function openProfile(){const chat=inboxChats.find(c=>c.jid===selectedChat);if(!chat)return;closeReactMenu();profileFor=chat.jid;const panel=$('profile');panel.hidden=false;$('chat-options').setAttribute('aria-expanded','true');
 fillAvatar($('profile-avatar'),chat);$('profile-name').textContent=displayName(chat);const number=/@s\.whatsapp\.net$/.test(chat.jid)?chat.jid.split('@')[0]:null;
 $('profile-number').textContent=number?'+'+number:'Número oculto por WhatsApp';$('profile-whatsapp').hidden=$('profile-copy').hidden=!number;if(number)$('profile-whatsapp').href='https://wa.me/'+number;
 $('profile-about').textContent='Cargando…';$('profile-files').textContent='';$('profile-media').replaceChildren();$('profile-docs').replaceChildren();$('profile-close').focus();
 if(!LIVE){$('profile-about').textContent='Vista previa: la info del contacto llega de WhatsApp.';}
 try{const [contact,media]=await Promise.all([LIVE?fetch('/api/contact?jid='+encodeURIComponent(chat.jid)).then(r=>r.ok?r.json():null):null,fetch('/api/chat/media?jid='+encodeURIComponent(chat.jid)).then(r=>r.ok?r.json():{items:[]})]);if(profileFor!==chat.jid)return;
  if(LIVE)$('profile-about').textContent=contact?.about||'Sin info visible. El contacto puede ocultarla en su privacidad de WhatsApp.';
  const items=media?.items||[],photos=items.filter(m=>m.kind!=='document'),docs=items.filter(m=>m.kind==='document');$('profile-files').textContent=items.length?items.length+(items.length===120?'+':''):'Ninguno';
  for(const m of photos.slice(0,60)){const b=el('button','profile-thumb'+(m.kind==='video'?' is-video':''));b.type='button';b.setAttribute('aria-label',(m.kind==='video'?'Video':'Foto')+' del '+listTime(m.timestamp));if(m.media?.thumb){const img=new Image();img.alt='';img.src='data:image/jpeg;base64,'+m.media.thumb;b.append(img);}else b.append(icon(m.kind));if(m.kind==='video')b.append(el('span','thumb-play','▶'));b.onclick=()=>openLightbox(m);$('profile-media').append(b);}
  for(const m of docs.slice(0,30)){const row=m.media?.available?el('a','profile-doc'):el('span','profile-doc');if(m.media?.available){row.href=mediaUrl(m.id);row.download=m.media?.name||'';}row.append(icon('document'));const t=el('span','');t.append(el('strong','',m.media?.name||'Documento'),el('small','',[fileSize(m.media?.size),listTime(m.timestamp),m.media?.available?'':'Ábrelo en WhatsApp'].filter(Boolean).join(' · ')));row.append(t);$('profile-docs').append(row);}
 }catch{if(profileFor===chat.jid)$('profile-about').textContent='No se pudo cargar la info.';}}
function closeProfile(focus=true){if($('profile').hidden)return;$('profile').hidden=true;profileFor=null;$('chat-options').setAttribute('aria-expanded','false');if(focus)$('chat-options').focus();}
$('profile-close').onclick=()=>closeProfile();
$('profile-copy').onclick=()=>copyText($('profile-number').textContent,'Número copiado.');
$('profile-photo').onclick=()=>{const chat=inboxChats.find(c=>c.jid===selectedChat);if(!chat?.photo||!LIVE)return;openImage(`/api/avatar/full?jid=${encodeURIComponent(chat.jid)}`,`/api/avatar?jid=${encodeURIComponent(chat.jid)}&v=${chat.photo}`,displayName(chat));};
$('profile-search').onclick=()=>{closeProfile(false);openFind();};
// Search inside the loaded messages of the open chat; Enter jumps to older matches.
let findHits=[],findAt=0;
function openFind(){$('chat-find').hidden=false;$('chat-find-input').focus();$('chat-find-input').select();}
function closeFind(){$('chat-find').hidden=true;$('chat-find-input').value='';for(const n of $('messages').querySelectorAll('.find-hit'))n.classList.remove('find-hit','find-current');findHits=[];$('chat-find-count').textContent='';}
function runFind(step=0){const term=$('chat-find-input').value.trim().toLocaleLowerCase('es');for(const n of $('messages').querySelectorAll('.find-hit'))n.classList.remove('find-hit','find-current');
 if(!term){findHits=[];$('chat-find-count').textContent='';return;}
 findHits=[...$('messages').querySelectorAll('.bubble')].filter(n=>(n.querySelector('p')?.textContent||'').toLocaleLowerCase('es').includes(term));findHits.forEach(n=>n.classList.add('find-hit'));
 if(!findHits.length){$('chat-find-count').textContent=chatCache.more?'Sin resultados en lo cargado':'Sin resultados';return;}
 findAt=step?(findAt+step+findHits.length)%findHits.length:findHits.length-1;const hit=findHits[findAt];hit.classList.add('find-current');hit.scrollIntoView({block:'center'});$('chat-find-count').textContent=(findAt+1)+' de '+findHits.length;}
$('chat-find-input').addEventListener('input',()=>runFind());
$('chat-find-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runFind(e.shiftKey?1:-1);}if(e.key==='Escape'){e.stopPropagation();closeFind();}});
$('chat-find-close').onclick=()=>closeFind();
// «Go to latest» button with the count of messages that arrived while reading older ones.
let newBelow=0;
const nearBottom=()=>{const s=$('conversation-scroll');return s.scrollHeight-s.scrollTop-s.clientHeight<200;};
function updateScrollButton(){const show=!nearBottom();if(!show)newBelow=0;$('scroll-bottom').hidden=!show;$('scroll-new').hidden=!newBelow;$('scroll-new').textContent=newBelow>99?'99+':String(newBelow);}
$('conversation-scroll').addEventListener('scroll',updateScrollButton,{passive:true});
$('scroll-bottom').onclick=()=>{const s=$('conversation-scroll');s.scrollTo({top:s.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});newBelow=0;updateScrollButton();};
async function loadChat(jid,{older=false}={}){
 const before=older&&chatCache.messages.length?chatCache.messages[0].timestamp:'';
 if(!older)chatCache.loading=!chatCache.messages.length;
 try{const res=await fetch(`/api/chat/messages?jid=${encodeURIComponent(jid)}${before?'&before='+before:''}`,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('No se pudo cargar este chat.');const data=await res.json();if(selectedChat!==jid)return;
  // Merge by id: a refresh replaces the newest page and keeps older pages already loaded; optimistic sends survive until confirmed.
  const byId=new Map(chatCache.messages.filter(m=>!m.pending).map(m=>[m.id,m]));for(const m of data.messages)byId.set(m.id,m);
  const pending=chatCache.messages.filter(m=>m.pending&&!byId.has(m.id));
  chatCache.messages=[...byId.values(),...pending].sort((a,b)=>a.timestamp-b.timestamp);
  if(older||!chatCache.lastTs)chatCache.more=data.more;
 }catch(e){error(e.message);}finally{chatCache.loading=false;if(selectedChat===jid)drawConversation();}
}
function markRead(chat){if(!chat.unread||reading.has(chat.jid)||document.hidden||$('inbox').hidden)return;reading.add(chat.jid);api('chat/read',{jid:chat.jid}).catch(()=>{}).finally(()=>reading.delete(chat.jid));chat.unread=0;}
function openChat(jid){const chat=inboxChats.find(c=>c.jid===jid);if(selectedChat!==jid){selectedChat=jid;inboxSignature='';bubbleCache=new Map();stopPlayers();cancelReply();closeReactMenu();chatCache={jid,messages:[],more:false,loading:true,lastTs:null,unreadAtOpen:chat?.unread||0};closeProfile(false);closeFind();newBelow=0;$('composer-input').value='';closeQuickMenu();closeEmojiMenu();}
 loadChat(jid).then(()=>{if(selectedChat===jid)chatCache.lastTs=stamp(inboxChats.find(c=>c.jid===jid)||{});});if(chat)markRead(chat);
 drawChatList();drawConversation();$('inbox-layout').classList.add('chat-open');syncChatFocus();if(matchMedia('(max-width: 680px)').matches)$('chat-back').focus();else $('composer-input').focus();}
function renderInbox(){inboxChats=(state.chats||[]).filter(c=>!c.deleted).sort((a,b)=>lastTime(b)-lastTime(a));
 if(selectedChat&&!inboxChats.some(c=>c.jid===selectedChat))resetInbox();
 const open=inboxChats.find(c=>c.jid===selectedChat),arrived=inboxChats.reduce((n,c)=>n+(c.unread||0),0);
 // The chime compares server counts; the open chat is then marked read and leaves the badge.
 if(lastUnreadTotal!==null&&arrived>lastUnreadTotal){chime();notice(arrived-lastUnreadTotal===1?'Nuevo mensaje':(arrived-lastUnreadTotal)+' mensajes nuevos');}
 lastUnreadTotal=arrived;if(open)markRead(open);
 const unreadTotal=inboxChats.reduce((n,c)=>n+(c.unread||0),0);$('count').textContent=unreadTotal>99?'99+':unreadTotal;$('count').hidden=!unreadTotal;document.title=(unreadTotal?`(${unreadTotal}) `:'')+brandName;
 $('review-count').textContent=inboxChats.filter(c=>c.handoffAt).length;updateSoundButton();drawChatList();
 // A notification tap (or #chat= link) opens its chat once the list has it.
 if(pendingOpen&&inboxChats.some(c=>c.jid===pendingOpen)){const jid=pendingOpen;pendingOpen=null;page('inbox');openChat(jid);return;}
 if(open){if(chatCache.lastTs!==null&&stamp(open)!==chatCache.lastTs){chatCache.lastTs=stamp(open);loadChat(selectedChat);}else drawConversation();}
}
function drawChatList(){const list=$('chat-list'),term=$('chat-search').value.trim().toLocaleLowerCase('es');const chats=inboxChats.filter(c=>{const status=chatStatus(c);// Contacts WhatsApp sent without any conversation only show up when you search for them (like WhatsApp itself).
  if(!term&&!lastTime(c)&&c.jid!==selectedChat)return false;
  return (!term||(c.name+' '+c.jid.split('@')[0]+' '+(c.last?.text||'')).toLocaleLowerCase('es').includes(term))&&(chatFilter==='all'||(chatFilter==='unread'?c.unread>0||c.jid===selectedChat:status.tone===chatFilter));});
 const signature=JSON.stringify([chats.map(c=>[c.jid,c.name,c.last,c.unread,c.handoffAt,c.enabled,c.classification,c.optOut,c.photo]),selectedChat,chatFilter,term,state.bot.enabled]);if(list.dataset.signature===signature)return;list.dataset.signature=signature;list.replaceChildren();
 if(!chats.length){const empty=el('div','list-empty');empty.append(el('strong','',term?'No encontramos ese chat':chatFilter==='unread'?'Estás al día':'No hay chats aquí'),el('p','',term?'Prueba con otro nombre, número o palabra.':'Las conversaciones aparecerán cuando WhatsApp las entregue.'));list.append(empty);return;}
 for(const c of chats){const last=c.last,status=chatStatus(c),unreadCount=c.unread||0,row=el('button','chat-row'+(selectedChat===c.jid?' current':'')+(unreadCount?' has-unread':''));row.setAttribute('aria-label','Abrir chat de '+displayName(c)+(unreadCount?', '+unreadCount+' sin leer':''));row.setAttribute('aria-pressed',String(selectedChat===c.jid));
  const avatar=fillAvatar(el('span'),c),content=el('span','chat-row-content'),top=el('span','chat-row-top');top.append(el('strong','',displayName(c)),el('time','',lastTime(c)?listTime(lastTime(c)):''));
  const preview=el('span','chat-preview');if(last){if(last.bot)preview.append(el('span','preview-who bot-who','Bot: '));else if(last.fromMe)preview.append(el('span','preview-who','Tú: '));if(MEDIA_KINDS.includes(last.kind)||CARD_KINDS.includes(last.kind)||['view_once','deleted'].includes(last.kind))preview.append(icon(last.kind,'preview-icon'),' ');preview.append(document.createTextNode(last.kind==='deleted'?mediaLabel('deleted'):last.text||mediaLabel(last.kind)));if(last.kind==='deleted')preview.classList.add('is-deleted');}else preview.textContent='Sin mensajes todavía';
  const bottom=el('span','chat-row-bottom');bottom.append(preview);if(['review','bot'].includes(status.tone))bottom.append(el('span','chat-tag '+status.tone,status.tone==='review'?'Revisión':'Bot'));if(unreadCount)bottom.append(el('span','unread-count',unreadCount>99?'99+':String(unreadCount)));
  content.append(top,bottom);row.append(avatar,content);row.onclick=()=>openChat(c.jid);list.append(row);}
}
// Media inside the chat. Photos show WhatsApp's tiny preview at once and the real file fades in when it arrives.
function photoNode(m,{full:withFull=true}={}){const box=el('button','media-photo'+(m.kind==='sticker'?' is-sticker':''));box.type='button';box.setAttribute('aria-label',m.kind==='sticker'?'Ver sticker':'Ver foto en grande');const w=m.media?.width,h=m.media?.height;if(w&&h&&m.kind!=='sticker')box.style.aspectRatio=`${w} / ${h}`;
 if(m.media?.thumb){const t=new Image();t.className='media-thumb';t.alt='';t.src='data:image/jpeg;base64,'+m.media.thumb;box.append(t);}
 if(withFull){const full=new Image();full.className='media-full';full.alt=m.text||mediaLabel(m.kind);full.decoding='async';full.loading='lazy';full.onload=()=>box.classList.add('loaded');full.onerror=()=>{box.classList.add('media-failed');full.remove();};full.src=mediaUrl(m.id);box.append(full);}else box.classList.add('loaded');box.onclick=()=>openLightbox(m);return box;}
function videoNode(m){const box=photoNode(m,{full:false});box.classList.add('is-video');box.setAttribute('aria-label','Reproducir video');const play=el('span','video-play');play.append(icon('play'));box.append(play);if(m.media?.seconds)box.append(el('span','video-time',duration(m.media.seconds)));return box;}
function audioFor(m){let a=players.get(m.id);if(a)return a;a=new Audio();a.preload='none';a.src=mediaUrl(m.id);
 const sync=()=>{const v=a.view;if(!v)return;const p=a.duration&&isFinite(a.duration)?a.currentTime/a.duration:0;v.bars.forEach((b,i)=>b.classList.toggle('played',(i+.5)/v.bars.length<=p));v.wave.setAttribute('aria-valuenow',String(Math.round(p*100)));v.time.textContent=duration(a.currentTime||(isFinite(a.duration)?a.duration:m.media?.seconds));v.wrap.classList.toggle('playing',!a.paused);v.play.replaceChildren(icon(a.paused?'play':'pause'));v.play.setAttribute('aria-label',a.paused?'Reproducir mensaje de voz':'Pausar mensaje de voz');};
 for(const name of ['timeupdate','play','pause','loadedmetadata'])a.addEventListener(name,sync);a.addEventListener('ended',()=>{a.currentTime=0;sync();});a.addEventListener('error',()=>{if(a.view){a.view.wrap.classList.add('voice-error');a.view.time.textContent='No se puede reproducir aquí';}});
 a.sync=sync;players.set(m.id,a);return a;}
// Voice notes: play, a waveform you can tap or move with the arrow keys, and 1×/1,5×/2× speed.
function voiceNode(m){const wrap=el('div','voice'),play=el('button','voice-play'),wave=el('div','voice-wave'),time=el('span','voice-time',duration(m.media?.seconds)),speed=el('button','voice-speed','1×'),link=el('a','voice-download','Descargar');
 play.type='button';play.setAttribute('aria-label','Reproducir mensaje de voz');play.append(icon('play'));speed.type='button';speed.setAttribute('aria-label','Velocidad de reproducción');link.href=mediaUrl(m.id);link.download='';
 wave.setAttribute('role','slider');wave.tabIndex=0;wave.setAttribute('aria-label','Posición del mensaje de voz');wave.setAttribute('aria-valuemin','0');wave.setAttribute('aria-valuemax','100');wave.setAttribute('aria-valuenow','0');
 let seed=[...m.id].reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,7);const bars=[];for(let i=0;i<30;i++){seed=(seed*1103515245+12345)>>>0;const bar=el('span');bar.style.height=(24+((seed>>>16)%76))+'%';bars.push(bar);wave.append(bar);}
 const a=players.get(m.id);if(a){a.view={wrap,play,wave,time,bars};a.sync();if(a.playbackRate!==1){speed.dataset.rate=a.playbackRate;speed.textContent=String(a.playbackRate).replace('.',',')+'×';}}
 const audio=()=>{const x=audioFor(m);x.view={wrap,play,wave,time,bars};return x;};
 const seek=ratio=>{const x=audio(),go=()=>{if(isFinite(x.duration))x.currentTime=Math.max(0,Math.min(1,ratio))*x.duration;x.sync();};if(isFinite(x.duration)&&x.duration)go();else{x.addEventListener('loadedmetadata',go,{once:true});x.load();}};
 play.onclick=e=>{e.stopPropagation();const x=audio();if(x.paused){for(const o of players.values())if(o!==x)o.pause();x.playbackRate=Number(speed.dataset.rate||1);x.play().catch(()=>{wrap.classList.add('voice-error');time.textContent='No se puede reproducir aquí';});}else x.pause();};
 wave.onclick=e=>{e.stopPropagation();const r=wave.getBoundingClientRect();seek((e.clientX-r.left)/r.width);};
 wave.onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const x=audio();if(!isFinite(x.duration)||!x.duration)return seek(0);x.currentTime=Math.max(0,Math.min(x.duration,x.currentTime+(e.key==='ArrowRight'?5:-5)));x.sync();};
 speed.onclick=e=>{e.stopPropagation();const next={1:1.5,1.5:2,2:1}[speed.dataset.rate||1];speed.dataset.rate=next;speed.textContent=String(next).replace('.',',')+'×';const x=players.get(m.id);if(x)x.playbackRate=next;};
 wrap.append(play,wave,time,speed,link);return wrap;}
function docNode(m){const a=el('a','doc-card');a.href=mediaUrl(m.id);a.download=m.media?.name||'';const badge=el('span','media-icon');badge.append(icon('document'));const info=el('span','media-info');info.append(el('strong','',m.media?.name||'Documento'),el('span','',[fileSize(m.media?.size),'Toca para descargar'].filter(Boolean).join(' · ')));const dl=el('span','doc-download');dl.append(icon('download'));a.append(badge,info,dl);a.onclick=e=>e.stopPropagation();return a;}
function mediaCard(m){const media=el('div','media-card');media.append(el('span','media-icon'));media.firstChild.append(icon(m.kind));const info=el('span','media-info');info.append(el('strong','',mediaLabel(m.kind)),el('span','',m.kind==='view_once'?'No se abre aquí, por privacidad':'Ábrelo en WhatsApp'));media.append(info);return media;}
function quoteNode(q,chat){const b=el('button','quote'+(q.fromMe?' mine':''));b.type='button';b.append(el('strong','',q.fromMe?'Tú':chat.name));const text=el('span','');if(q.kind&&q.kind!=='text')text.append(icon(q.kind,'preview-icon'),' ');text.append(document.createTextNode(q.text||mediaLabel(q.kind)));b.append(text);b.setAttribute('aria-label','Ir al mensaje citado');
 b.onclick=e=>{e.stopPropagation();const target=[...$('messages').querySelectorAll('.bubble')].find(n=>n.dataset.key===q.id);if(!target){notice('Ese mensaje es más antiguo: carga mensajes anteriores.');return;}target.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});target.classList.remove('flash');void target.offsetWidth;target.classList.add('flash');};return b;}
// Links in messages open in a new tab without telling the site where they came from; everything else stays plain text.
function linkify(p,text){const re=/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;let at=0,match;while((match=re.exec(text))){let url=match[0].replace(/[.,;:!?)\]»"']+$/,'');const end=match.index+url.length;p.append(document.createTextNode(text.slice(at,match.index)));
  let href=null;try{const u=new URL(/^www\./i.test(url)?'https://'+url:url);if(['http:','https:'].includes(u.protocol))href=u.href;}catch{}
  if(href){const a=el('a','msg-link',url);a.href=href;a.target='_blank';a.rel='noopener noreferrer nofollow';a.onclick=e=>e.stopPropagation();p.append(a);}else p.append(document.createTextNode(url));at=end;re.lastIndex=end;}
 p.append(document.createTextNode(text.slice(at)));return p;}
// Location, contact, poll, event, invitation and call: a card with what the contact shared.
function infoCard(m){const d=m.detail||{},card=el('div','info-card kind-'+m.kind),badge=el('span','media-icon');badge.append(icon(m.kind));const info=el('span','media-info');
 const title={location:d.live?'Ubicación en tiempo real':d.name||'Ubicación',contact:d.name||'Contacto',poll:d.name||'Encuesta',event:d.name||'Evento',invite:'Invitación a un grupo',call:d.video?'Videollamada':'Llamada de voz'}[m.kind];
 const sub={location:d.address||(d.name?'Ubicación':''),contact:[d.phone?'+'+d.phone.replace(/^\+/,''):'',d.count?d.count+' contactos':''].filter(Boolean).join(' · ')||'Contacto compartido',poll:'Encuesta · vota en WhatsApp',event:d.description||'Evento de WhatsApp',invite:d.name||'',call:'Ver en WhatsApp'}[m.kind];
 info.append(el('strong','',title),el('span','',sub));card.append(badge,info);
 if(m.kind==='poll'&&d.options?.length){const ul=el('ul','poll-options');for(const o of d.options)ul.append(el('li','',o));card.append(ul);}
 if(m.kind==='location'&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)){const a=el('a','card-link','Abrir en el mapa');a.href=`https://www.google.com/maps?q=${d.lat},${d.lng}`;a.target='_blank';a.rel='noopener noreferrer';a.onclick=e=>e.stopPropagation();card.append(a);}
 return card;}
async function copyText(text,message){try{await navigator.clipboard.writeText(text);notice(message);}catch{notice('No se pudo copiar');}}
function bubbleNode(m,grouped,chat){
 const isMedia=MEDIA_KINDS.includes(m.kind),available=isMedia&&!!m.media?.available&&(LIVE||!!window.conversaDemoMedia),reactions=[...new Set(Object.values(m.reactions||{}))];
 const bubble=el('article','bubble'+(m.fromMe?' outgoing':' incoming')+(grouped?' grouped':'')+(m.bot?' from-bot':'')+(m.failed?' failed':'')+(m.text?'':' media')+(available?' has-media kind-'+m.kind:'')+(reactions.length?' has-reactions':'')+(m.kind==='deleted'?' is-deleted':'')+(CARD_KINDS.includes(m.kind)?' has-card':''));bubble.dataset.id=m.id;bubble.dataset.key=m.key?.id||'';
 if(m.bot){const tag=el('span','bot-label');tag.append(icon('spark'),document.createTextNode('Respuesta automática'));bubble.append(tag);}
 if(m.quote)bubble.append(quoteNode(m.quote,chat));
 if(available)bubble.append(m.kind==='audio'?voiceNode(m):m.kind==='document'?docNode(m):m.kind==='video'?videoNode(m):photoNode(m));
 else if(isMedia&&m.media?.thumb){const box=photoNode(m,{full:false});box.classList.add('media-offline');box.setAttribute('aria-label',mediaLabel(m.kind)+': ábrelo en WhatsApp');box.onclick=null;box.append(el('span','offline-note','Ábrelo en WhatsApp'));bubble.append(box);}
 else if(m.kind==='deleted'){const p=el('p','deleted-text');p.append(icon('deleted'),document.createTextNode(m.fromMe?'Eliminaste este mensaje':'Se eliminó este mensaje'));bubble.append(p);}
 else if(CARD_KINDS.includes(m.kind))bubble.append(infoCard(m));
 else if(!m.text||isMedia||m.kind==='view_once')bubble.append(mediaCard(m));
 if(m.text&&m.kind!=='deleted')bubble.append(linkify(el('p'),m.text));
 const meta=el('span','bubble-meta'),time=el('time','',clockTime(m.timestamp));time.dateTime=new Date(m.timestamp).toISOString();time.title=new Intl.DateTimeFormat('es',{dateStyle:'full',timeStyle:'short'}).format(new Date(m.timestamp));if(m.edited)meta.append(el('span','edited','editado'));meta.append(time);
 if(m.fromMe&&(m.status||m.pending||m.failed)){const s=m.failed?['alert','No se pudo enviar']:m.pending||m.status==='sending'?['clock','Enviando']:m.status==='uncertain'?['alert','Sin confirmar: revisa en WhatsApp']:['check','Enviado'];const mark=el('span','delivery '+(m.failed||m.status==='uncertain'?'warn':''));mark.title=s[1];mark.setAttribute('aria-label',s[1]);mark.append(icon(s[0]));meta.append(mark);}
 bubble.append(meta);
 if(reactions.length){const r=el('span','reactions',reactions.join(''));if(Object.keys(m.reactions).length>1&&reactions.length===1)r.append(el('small','','2'));r.setAttribute('aria-label','Reacciones: '+Object.entries(m.reactions).map(([who,e])=>(who==='me'?'tú ':chat.name+' ')+e).join(', '));bubble.append(r);}
 // Reply and react: on hover with a mouse, after a tap on touch screens.
 if(m.key&&!m.pending&&!m.failed&&!['view_once','deleted'].includes(m.kind)){const tools=el('span','bubble-tools'),react=el('button','tool-button'),reply=el('button','tool-button');react.type=reply.type='button';react.setAttribute('aria-label','Reaccionar');react.title='Reaccionar';react.append(icon('smile'));reply.setAttribute('aria-label','Responder');reply.title='Responder';reply.append(icon('reply'));
  react.onclick=e=>{e.stopPropagation();openReactMenu(m,react);};reply.onclick=e=>{e.stopPropagation();startReply(m,chat);};tools.append(react,reply);
  if(m.text){const copy=el('button','tool-button');copy.type='button';copy.setAttribute('aria-label','Copiar mensaje');copy.title='Copiar';copy.append(icon('copy'));copy.onclick=e=>{e.stopPropagation();copyText(m.text,'Mensaje copiado.');bubble.classList.remove('show-tools');};tools.append(copy);}
  bubble.append(tools);
  bubble.addEventListener('click',e=>{if(e.target.closest('button,a,.voice')||!matchMedia('(hover: none)').matches)return;const open=!bubble.classList.contains('show-tools');for(const n of $('messages').querySelectorAll('.show-tools'))n.classList.remove('show-tools');bubble.classList.toggle('show-tools',open);});}
 bubble.addEventListener('animationend',()=>bubble.classList.remove('fresh','flash'));
 return bubble;}
// Keyed redraw: unchanged bubbles (and a voice note that is playing) stay in place; only new or changed ones are built.
function placeNodes(parent,nodes){let cur=parent.firstChild;for(const n of nodes){if(n===cur){cur=cur.nextSibling;continue;}parent.insertBefore(n,cur);}while(cur){const next=cur.nextSibling;cur.remove();cur=next;}}
function drawConversation(){const chat=inboxChats.find(c=>c.jid===selectedChat);if(!chat)return;const messages=chatCache.jid===chat.jid?chatCache.messages:[],connected=state.connection.status==='connected',signature=JSON.stringify([chat,messages.map(m=>[m.id,m.status,m.text,m.kind,m.edited,m.pending,m.failed,m.reactions,m.media?.available]),chatCache.loading,chatCache.more,state.connection.status,state.bot.enabled,state.tests,state.keywordTest]);if(signature===inboxSignature)return;const changed=inboxSignature==='',scroll=$('conversation-scroll'),atBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<90,previousTop=scroll.scrollTop,previousHeight=scroll.scrollHeight;inboxSignature=signature;
 $('chat-empty').hidden=true;$('chat-detail').hidden=false;$('detail-name').textContent=displayName(chat);fillAvatar($('detail-avatar'),chat);const status=chatStatus(chat);$('detail-status').textContent=status.label;$('detail-status').className=status.tone;$('profile-status').textContent=status.label;$('profile-status').className=status.tone;
 $('chat-policy').textContent=chat.handoffReason==='view-once'?'Recibió una visualización única: bot detenido.':chat.handoffAt?'El bot ya respondió: ahora sigues tú.':chat.classification==='old'?'Chat anterior a la vinculación: sin bot.':chat.optOut?'Pidió no recibir respuestas automáticas.':'Confirma que es un chat nuevo para activar el bot.';
 const actions=$('chat-actions');actions.replaceChildren();const toggle=el('button','secondary',chat.enabled?'Pausar bot en este chat':'Revisar chat nuevo');toggle.disabled=busy||!!chat.handoffAt||chat.classification==='old'||!!chat.optOut||!chat.earliest;toggle.onclick=()=>{if(chat.enabled)action('chat/review',{jid:chat.jid,enabled:false});else{reviewJid=chat.jid;$('review-name').textContent=chat.name+' · Corte: '+date(state.connection.link.firstLinkedAt);$('review-chat').showModal();}};const more=el('button','secondary','Pedir mensajes anteriores a WhatsApp'),empty=!messages.length&&!chatCache.loading;more.disabled=busy||!connected||empty;more.title=empty?'Sin mensajes guardados: WhatsApp necesita uno para pedir los anteriores.':'';more.onclick=async()=>{const r=await action('history/more',{jid:chat.jid});if(r)notice('Pedido a WhatsApp');};const del=el('button','text-button','Borrar mensajes');del.onclick=async()=>{if(await ask('¿Borrar los mensajes de este contacto? Se conservará su exclusión para evitar respuestas futuras.','Borrar mensajes',true))action('chat/delete',{jid:chat.jid}).then(()=>refresh());};actions.append(toggle,more);
 // Local-only real test (the server hides it in production): one fixed neutral reply if this contact sends PRUEBA within 10 minutes.
 if(state.tests&&/@s\.whatsapp\.net$/.test(chat.jid)&&chat.earliest&&!chat.optOut&&chat.handoffReason!=='view-once'){const t=state.keywordTest,armed=!!t&&t.jid===chat.jid&&!t.consumedAt&&t.expiresAt>Date.now(),test=el('button','secondary',armed?'Prueba real activa hasta '+clockTime(t.expiresAt):'Prueba real (PRUEBA)');test.disabled=busy||armed||!connected;test.onclick=async()=>{if(!await ask('Durante 10 minutos, si '+chat.name+' envía exactamente PRUEBA, Conversa le responderá una sola vez: «Mensaje de prueba recibido correctamente.» Funciona aunque sea un chat anterior y no activa el bot para nadie más.','Activar prueba'))return;const r=await action('bot/test',{jid:chat.jid});if(r)notice('Prueba activa hasta '+clockTime(r.expiresAt));};actions.append(test);}
 actions.append(del);
 const list=$('messages'),nodes=[],next=new Map();let day='',prev=null;const unreadFrom=chatCache.unreadAtOpen?messages.length-chatCache.unreadAtOpen:-1;
 const keep=(key,sig,build)=>{let item=bubbleCache.get(key);if(!item||item.sig!==sig)item={sig,node:build()};next.set(key,item);nodes.push(item.node);return item;};
 messages.forEach((m,i)=>{const currentDay=dayLabel(m.timestamp);if(day!==currentDay){keep('day:'+currentDay,currentDay,()=>el('div','day-divider',currentDay));day=currentDay;prev=null;}
  if(i===unreadFrom){const label=chatCache.unreadAtOpen===1?'1 mensaje no leído':chatCache.unreadAtOpen+' mensajes no leídos';keep('unread',label,()=>el('div','unread-divider',label));prev=null;}
  const grouped=!!prev&&!!prev.fromMe===!!m.fromMe&&!!prev.bot===!!m.bot&&m.timestamp-prev.timestamp<180000;
  keep(m.id,JSON.stringify([m.text,m.kind,m.edited,m.detail,m.status,m.pending,m.failed,m.reactions,m.media?.available,m.quote,grouped,chat.name]),()=>bubbleNode(m,grouped,chat));prev=m;});
 if(!messages.length)nodes.push(el('p','conversation-empty',chatCache.loading?'Cargando mensajes…':'Sin mensajes todavía'));
 bubbleCache=next;placeNodes(list,nodes);
 // Only a message that just arrived animates; opening a chat or loading older pages does not.
 const newest=messages.at(-1)?.id;if(!changed&&newest&&lastBubbleId&&newest!==lastBubbleId){bubbleCache.get(newest)?.node.classList.add('fresh');if(!atBottom)newBelow++;}lastBubbleId=newest||null;
 $('load-more').hidden=!chatCache.more;
 const input=$('composer-input');input.disabled=!connected||!!chat.deleted;input.placeholder=connected?'Escribe un mensaje':'Conecta WhatsApp para enviar mensajes';$('composer-send').disabled=input.disabled;$('quick-replies').disabled=input.disabled;$('emoji-toggle').disabled=input.disabled;
 if(changed||atBottom)scroll.scrollTop=scroll.scrollHeight;else scroll.scrollTop=previousTop+Math.max(0,scroll.scrollHeight-previousHeight);
 updateScrollButton();if(!$('chat-find').hidden&&$('chat-find-input').value)runFind();if(profileFor&&profileFor!==chat.jid)closeProfile(false);
}
$('load-more').onclick=()=>{if(selectedChat)loadChat(selectedChat,{older:true});};
// Photo and video viewer.
function openLightbox(m){const chat=inboxChats.find(c=>c.jid===selectedChat),body=$('lightbox-body');body.replaceChildren();
 if(m.kind==='video'){const v=document.createElement('video');v.controls=true;v.autoplay=true;v.playsInline=true;v.src=mediaUrl(m.id);if(m.media?.thumb)v.poster='data:image/jpeg;base64,'+m.media.thumb;body.append(v);}
 else{const img=new Image();img.alt=m.text||mediaLabel(m.kind);img.onerror=()=>{img.onerror=null;if(m.media?.thumb)img.src='data:image/jpeg;base64,'+m.media.thumb;};img.src=mediaUrl(m.id);body.append(img);}
 $('lightbox-title').textContent=(m.fromMe?'Tú':chat?.name||'')+' · '+clockTime(m.timestamp);$('lightbox-caption').textContent=m.text||'';$('lightbox-download').href=mediaUrl(m.id);$('lightbox').showModal();}
function openImage(src,fallback,title){const body=$('lightbox-body'),img=new Image();body.replaceChildren(img);img.alt='Foto de perfil de '+title;img.onerror=()=>{img.onerror=null;img.src=fallback;};img.src=src;$('lightbox-title').textContent=title;$('lightbox-caption').textContent='';$('lightbox-download').href=src;$('lightbox').showModal();}
$('lightbox-close').onclick=()=>$('lightbox').close();
$('lightbox').addEventListener('click',e=>{if(e.target===$('lightbox')||e.target===$('lightbox-body'))$('lightbox').close();});
$('lightbox').addEventListener('close',()=>$('lightbox-body').replaceChildren());
// Reactions: one per side, like WhatsApp. Choosing your current one again removes it.
let reactAnchor=null;
// Bubbles keep the message they were built with; after a reload the current copy lives in chatCache.
const current=m=>chatCache.messages.find(x=>x.id===m.id)||m;
function openReactMenu(m,anchor){m=current(m);const menu=$('react-menu');menu.replaceChildren();reactAnchor=anchor;for(const e of REACTIONS){const mine=m.reactions?.me===e,b=el('button','react-option'+(mine?' selected':''),e);b.type='button';b.setAttribute('role','menuitem');b.setAttribute('aria-label',(mine?'Quitar reacción ':'Reaccionar con ')+e);b.onclick=ev=>{ev.stopPropagation();sendReaction(m,mine?'':e);};menu.append(b);}
 menu.hidden=false;const r=anchor.getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight;menu.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';menu.style.top=(r.top-h-10<8?r.bottom+10:r.top-h-10)+'px';menu.firstChild.focus();}
function closeReactMenu(){const menu=$('react-menu');if(menu.hidden)return;menu.hidden=true;reactAnchor?.focus?.();reactAnchor=null;}
// Only the latest reaction on a message may roll back: an older failed request must not undo a newer choice.
const reactionTurn=new Map();
async function sendReaction(m,emoji){m=current(m);closeReactMenu();const turn=(reactionTurn.get(m.id)||0)+1;reactionTurn.set(m.id,turn);const before=m.reactions;m.reactions={...m.reactions};if(emoji)m.reactions.me=emoji;else delete m.reactions.me;inboxSignature='';drawConversation();
 try{await api('chat/react',{id:m.id,emoji});}catch(e){if(reactionTurn.get(m.id)===turn){current(m).reactions=before;inboxSignature='';drawConversation();}error(e.message);}}
$('conversation-scroll').addEventListener('scroll',()=>closeReactMenu(),{passive:true});
// Reply quoting a message.
function startReply(m,chat){showReply({id:m.id,key:m.key?.id,text:m.text,kind:m.kind,fromMe:!!m.fromMe,who:m.fromMe?'Tú':chat.name});$('composer-input').focus();}
function showReply(r){replyTo=r;$('reply-who').textContent=r.who;$('reply-text').textContent=r.text||mediaLabel(r.kind);$('reply-bar').hidden=false;}
function cancelReply(){replyTo=null;$('reply-bar').hidden=true;}
$('reply-cancel').onclick=()=>{cancelReply();$('composer-input').focus();};
// Composer: what the owner types goes out exactly as written; like a reply from the phone, it pauses the bot in that chat.
function growComposer(){const input=$('composer-input');input.style.height='auto';input.style.height=Math.min(input.scrollHeight,140)+'px';}
$('composer-input').addEventListener('input',growComposer);
$('composer-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!matchMedia('(pointer: coarse)').matches){e.preventDefault();$('composer').requestSubmit();}if(e.key==='Escape'&&replyTo)cancelReply();});
$('composer').onsubmit=async e=>{e.preventDefault();const input=$('composer-input'),text=input.value,jid=selectedChat,quote=replyTo;if(!jid||!text.trim()||input.disabled)return;
 const chat=inboxChats.find(c=>c.jid===jid),wasBotOn=!!chat?.enabled&&state.bot.enabled,temp={id:'pending-'+Date.now(),text,kind:'text',fromMe:true,pending:true,timestamp:Date.now(),...(quote?{quote:{id:quote.key,text:quote.text,kind:quote.kind,fromMe:quote.fromMe}}:{})};
 chatCache.messages=[...chatCache.messages,temp];input.value='';growComposer();closeQuickMenu();closeEmojiMenu();cancelReply();drawConversation();$('conversation-scroll').scrollTop=$('conversation-scroll').scrollHeight;
 try{const r=await api('chat/send',{jid,text,...(quote?{quoteId:quote.id}:{})});if(lastBubbleId===temp.id)lastBubbleId=r.id;temp.id=r.id;temp.pending=false;temp.status=r.status;if(wasBotOn)notice('Bot en pausa en este chat');await refresh();if(selectedChat===jid)loadChat(jid);}
 catch(err){temp.pending=false;temp.failed=true;error(err.message);if(!input.value){input.value=text;growComposer();if(quote&&!replyTo&&selectedChat===jid)showReply(quote);}drawConversation();}};
function closeQuickMenu(){$('quick-menu').hidden=true;$('quick-replies').setAttribute('aria-expanded','false');}
$('quick-replies').onclick=()=>{const menu=$('quick-menu');if(!menu.hidden)return closeQuickMenu();closeEmojiMenu();menu.replaceChildren();const replies=state.bot.savedReplies||[];
 menu.append(el('p','quick-title','Respuestas guardadas'));for(const r of replies){const b=el('button','quick-item');b.type='button';b.setAttribute('role','menuitem');b.append(el('strong','',r.name),el('span','',r.text));b.onclick=()=>{const input=$('composer-input');input.value=r.text;growComposer();closeQuickMenu();input.focus();};menu.append(b);}
 menu.hidden=false;$('quick-replies').setAttribute('aria-expanded','true');};
function closeEmojiMenu(){$('emoji-menu').hidden=true;$('emoji-toggle').setAttribute('aria-expanded','false');}
$('emoji-toggle').onclick=()=>{const menu=$('emoji-menu');if(!menu.hidden)return closeEmojiMenu();closeQuickMenu();if(!menu.childElementCount)for(const e of EMOJIS){const b=el('button','emoji-option',e);b.type='button';b.setAttribute('aria-label','Insertar '+e);b.onclick=()=>{const input=$('composer-input');input.focus();input.setRangeText(e,input.selectionStart,input.selectionEnd,'end');growComposer();};menu.append(b);}
 menu.hidden=false;$('emoji-toggle').setAttribute('aria-expanded','true');};
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||$('lightbox').open)return;const menus=!$('quick-menu').hidden||!$('emoji-menu').hidden||!$('react-menu').hidden;if(!$('quick-menu').hidden){closeQuickMenu();$('quick-replies').focus();}if(!$('emoji-menu').hidden){closeEmojiMenu();$('emoji-toggle').focus();}closeReactMenu();if(!menus&&!$('profile').hidden)closeProfile();else if(!menus&&!$('chat-find').hidden)closeFind();});
document.addEventListener('click',e=>{if(!$('quick-menu').hidden&&!e.target.closest('.quick-wrap'))closeQuickMenu();if(!$('emoji-menu').hidden&&!e.target.closest('.quick-wrap'))closeEmojiMenu();if(!e.target.closest('#react-menu'))closeReactMenu();});
// Custom brand (name + logo), only for the super admin for now: menu, tab title, favicon, installed-app icon and notifications.
let brandName='Conversa',brandDraft=null;
const brandTargets=[[$('brand-logo'),'src',192],[document.querySelector('link[rel=icon]'),'href',192],[document.querySelector('link[rel=apple-touch-icon]'),'href',512]].filter(([n])=>n).map(([n,attr,size])=>({n,attr,size,original:n.getAttribute(attr)}));
function applyBrand(brand){brandName=brand?.name||'Conversa';$('brand-name').textContent=brand?.name||'conversa';document.querySelector('meta[name=apple-mobile-web-app-title]')?.setAttribute('content',brandName);
 for(const t of brandTargets){const want=brand?.icon?`/brand/icon-${t.size}.png?v=${brand.updatedAt}`:t.original;if(t.n.getAttribute(t.attr)!==want)t.n.setAttribute(t.attr,want);}}
const PRESETS=[['bloques','Bloques'],['gema','Gema'],['dados','Dados'],['planeta','Planeta'],['burbujas','Burbujas'],['calculadora','Calculadora'],['calendario','Calendario'],['notas','Notas'],['clima','Clima'],['reloj','Reloj']];
function useLogo(src,button){const img=new Image();img.onload=()=>{try{brandDraft={icon192:squarePng(img,192),icon512:squarePng(img,512)};$('brand-preview').src=brandDraft.icon192;document.querySelectorAll('.brand-preset').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}catch{error('No se pudo leer la imagen');}if(src.startsWith('blob:'))URL.revokeObjectURL(src);};img.onerror=()=>{if(src.startsWith('blob:'))URL.revokeObjectURL(src);error('No se pudo leer la imagen');};img.src=src;}
function renderOwnerCard(){const card=$('owner-card');card.hidden=state.role!=='owner';$('brand-section').hidden=!state.brandEditable;if(card.hidden||!state.brandEditable)return;
 // Built only for the super admin, so client accounts never even load these images.
 if(!$('brand-presets').children.length)$('brand-presets').replaceChildren(...PRESETS.map(([id,label])=>{const b=el('button','brand-preset');b.type='button';b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed','false');const i=document.createElement('img');i.src=`/brand/preset/${id}.svg`;i.alt='';i.width=i.height=56;i.loading='lazy';b.append(i);b.onclick=()=>useLogo(i.src,b);return b;}));$('brand-reset').hidden=!state.brand;
 if(!brandDraft){$('brand-input').value=state.brand?.name||'';$('brand-preview').src=state.brand?.icon?`/brand/icon-192.png?v=${state.brand.updatedAt}`:'/icon-192.png';}}
// The logo is squared and resized in the browser to the two PNG sizes Android and iOS use.
function squarePng(img,size){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),side=Math.min(img.naturalWidth,img.naturalHeight);g.imageSmoothingQuality='high';g.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,size,size);return c.toDataURL('image/png');}
$('brand-pick').onclick=()=>$('brand-file').click();
$('brand-file').onchange=()=>{const file=$('brand-file').files[0];$('brand-file').value='';if(!file)return;if(file.size>8*1048576)return error('Imagen demasiado grande');useLogo(URL.createObjectURL(file),null);};
$('brand-save').onclick=async()=>{const name=$('brand-input').value.trim()||brandName;const r=await action('brand',{name,...(brandDraft||{})});if(r){brandDraft=null;document.querySelectorAll('.brand-preset').forEach(b=>b.setAttribute('aria-pressed','false'));applyBrand(r.brand);notice('Guardado');}};
$('brand-reset').onclick=async()=>{if(!await ask('¿Volver al nombre y logo de Conversa?','Restaurar'))return;const r=await action('brand',{reset:true});if(r){brandDraft=null;document.querySelectorAll('.brand-preset').forEach(b=>b.setAttribute('aria-pressed','false'));applyBrand(null);notice('Restaurado');}};
// Theme: automatic (follows the device), dark or light; remembered on this device only.
const THEME_LABELS={auto:'Tema automático',dark:'Tema oscuro',light:'Tema claro'};
function applyTheme(choice){const root=document.documentElement,dark=choice==='dark'||choice==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches;root.dataset.theme=dark?'dark':'light';root.dataset.themeChoice=choice;document.querySelector('meta[name=theme-color]')?.setAttribute('content',dark?'#0A1918':'#123F3C');const b=$('theme-toggle');b.setAttribute('aria-label',THEME_LABELS[choice]+'. Pulsa para cambiar.');b.title=THEME_LABELS[choice];b.replaceChildren(icon(choice==='auto'?'contrast':choice==='dark'?'moon':'sun'));}
$('theme-toggle').onclick=()=>{const next={auto:'dark',dark:'light',light:'auto'}[document.documentElement.dataset.themeChoice||'auto'];try{localStorage.setItem('conversa-theme',next);}catch{}applyTheme(next);};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if((document.documentElement.dataset.themeChoice||'auto')==='auto')applyTheme('auto');});
// Installable app and push notifications. The service worker caches nothing: it only shows notifications.
let swReg=null,installPrompt=null,pushSynced=false;
const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1,standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const pushSupported=()=>LIVE&&isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const keyBytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function currentSubscription(){try{return await swReg?.pushManager.getSubscription()||null;}catch{return null;}}
async function updatePushCard(){const status=$('push-status');$('ios-hint').hidden=!(isIOS&&!standalone());$('push-preview').checked=state?.notifications?.preview!==false;
 if(!pushSupported()){status.textContent=isIOS&&!standalone()?'Primero añade la app a tu pantalla de inicio.':LIVE?'No disponibles en este navegador.':'No disponibles en la vista previa.';for(const id of ['push-enable','push-test','push-disable'])$(id).hidden=true;$('push-preview').disabled=true;return;}
 const sub=await currentSubscription(),denied=Notification.permission==='denied';if(sub&&online&&!pushSynced){pushSynced=true;api('push/subscribe',{subscription:sub.toJSON()}).catch(()=>{});}$('push-enable').hidden=!!sub;$('push-test').hidden=!sub;$('push-disable').hidden=!sub;$('push-enable').disabled=denied;$('push-preview').disabled=false;
 status.textContent=denied?'Bloqueadas en este navegador.':sub?'Activas en este dispositivo.':'Desactivadas.';}
$('push-enable').onclick=async()=>{error('');try{if(await Notification.requestPermission()!=='granted')return updatePushCard();swReg ||=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;const res=await fetch('/api/push/key');if(!res.ok)throw new Error('No se pudo preparar el aviso.');const {publicKey}=await res.json();
 const sub=await swReg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});await api('push/subscribe',{subscription:sub.toJSON()});await refresh();}catch(e){error(e.message||'No se pudieron activar las notificaciones.');}updatePushCard();};
$('push-test').onclick=async()=>{try{const r=await api('push/test');$('push-status').textContent=r.sent?'Prueba enviada: debería llegarte en unos segundos.':'No se pudo entregar la prueba. Desactiva y vuelve a activar las notificaciones.';}catch(e){error(e.message);}};
$('push-disable').onclick=async()=>{const sub=await currentSubscription();if(sub){await api('push/unsubscribe',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe().catch(()=>{});}await refresh();updatePushCard();};
$('push-preview').onchange=()=>action('push/settings',{preview:$('push-preview').checked});
$('install-app').onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice.catch(()=>{});installPrompt=null;$('install-app').hidden=true;};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('install-app').hidden=false;});
window.addEventListener('appinstalled',()=>{installPrompt=null;$('install-app').hidden=true;});
async function setupApp(){if(LIVE&&isSecureContext&&'serviceWorker' in navigator){try{swReg=await navigator.serviceWorker.register('/sw.js');}catch{}
 // A tapped notification opens its chat in the panel that is already open.
 navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='open-chat'&&typeof e.data.jid==='string'){pendingOpen=e.data.jid;refresh();}});}
 updatePushCard();}
function syncChatFocus(){const modal=!!selectedChat&&document.body.dataset.page==='inbox'&&matchMedia('(max-width: 680px)').matches;document.querySelector('.shell>aside').inert=modal;document.querySelector('main>header').inert=modal;}
matchMedia('(max-width: 680px)').addEventListener('change',syncChatFocus);
let editingReplyId=null,replyListSignature='';
function updateReplyLength(){$('reply-length').textContent=$('bot-fallback').value.length+' / 4000 caracteres';}
function loadReplyEditor(bot,id=bot.activeReplyId){const reply=bot.savedReplies?.find(r=>r.id===id)||{id:'welcome',name:'Saludo inicial',text:bot.fallback,keywords:[]};editingReplyId=reply.id;$('reply-name').value=reply.name;$('reply-keywords').value=(reply.keywords||[]).join(', ');$('bot-fallback').value=reply.text;updateReplyLength();replyListSignature='';}
function replyIsDirty(){const stored=state.bot.savedReplies?.find(r=>r.id===editingReplyId);return !stored?!!($('reply-name').value||$('bot-fallback').value||$('reply-keywords').value):stored.name!==$('reply-name').value||stored.text!==$('bot-fallback').value||(stored.keywords||[]).join(', ')!==$('reply-keywords').value;}
function renderReplyLibrary(){const bot=state.bot,list=bot.savedReplies||[],rules=list.filter(r=>r.keywords?.length);$('reply-active-name').textContent=rules.length+' respuestas con palabras clave';$('reply-current-title').textContent='Selección por palabras clave';$('reply-use').hidden=true;$('reply-use').disabled=busy||!list.some(r=>r.id===editingReplyId)||editingReplyId===bot.activeReplyId;$('reply-new').disabled=busy||list.length>=20;$('reply-delete').disabled=busy;
const sig=JSON.stringify([list,editingReplyId,bot.activeReplyId]);if(sig===replyListSignature)return;replyListSignature=sig;const container=$('reply-list');container.replaceChildren();for(const reply of list){const button=el('button','reply-item'+(reply.id===editingReplyId?' selected':''));button.type='button';button.setAttribute('aria-pressed',String(reply.id===editingReplyId));button.append(el('strong','',reply.name),el('span','',reply.keywords?.length?reply.keywords.join(', '):'Sin palabras clave: no se envía'));button.onclick=async()=>{if(replyIsDirty()&&!await ask('¿Descartar los cambios sin guardar?','Descartar',true))return;loadReplyEditor(state.bot,reply.id);$('reply-feedback').textContent='';renderReplyLibrary();};container.append(button);}}
$('bot-fallback').addEventListener('input',updateReplyLength);
$('reply-new').onclick=async()=>{if(replyIsDirty()&&!await ask('¿Descartar los cambios sin guardar?','Descartar',true))return;editingReplyId='r-'+crypto.randomUUID();$('reply-name').value='';$('reply-keywords').value='';$('bot-fallback').value='';$('reply-feedback').textContent='Nueva respuesta. No se enviará hasta guardarla y activar el bot.';updateReplyLength();renderReplyLibrary();$('reply-name').focus();};
$('bot-form').onsubmit=async e=>{e.preventDefault();const reply={id:editingReplyId,name:$('reply-name').value,text:$('bot-fallback').value,keywords:$('reply-keywords').value.split(',').map(x=>x.trim()).filter(Boolean)};const replies=[...(state.bot.savedReplies||[])],i=replies.findIndex(r=>r.id===reply.id);if(i<0)replies.push(reply);else replies[i]=reply;const result=await action('bot/config',{mode:'standard',keywordOnly:true,savedReplies:replies,activeReplyId:state.bot.activeReplyId,handoffAfterReply:true});if(result){loadReplyEditor(result.bot,reply.id);renderReplyLibrary();$('reply-feedback').textContent='Respuesta guardada. No se ha enviado ningún mensaje.';}};
$('reply-delete').onclick=async()=>{const list=state.bot.savedReplies||[],stored=list.some(r=>r.id===editingReplyId);if(stored&&list.length<=1){$('reply-feedback').textContent='Debe quedar al menos una respuesta guardada.';return;}if(!await ask(stored?'¿Eliminar esta respuesta guardada? No afecta a mensajes ya enviados.':'¿Descartar esta respuesta sin guardar?',stored?'Eliminar':'Descartar',true))return;if(!stored){loadReplyEditor(state.bot);$('reply-feedback').textContent='';renderReplyLibrary();return;}const remaining=list.filter(r=>r.id!==editingReplyId),active=remaining.some(r=>r.id===state.bot.activeReplyId)?state.bot.activeReplyId:remaining[0].id;const result=await action('bot/config',{savedReplies:remaining,activeReplyId:active});if(result){loadReplyEditor(result.bot);renderReplyLibrary();$('reply-feedback').textContent='Respuesta eliminada. No se ha enviado ningún mensaje.';}};
$('reply-use').onclick=async()=>{if(replyIsDirty()){$('reply-feedback').textContent='Guarda tus cambios antes de seleccionar esta respuesta.';return;}const result=await action('bot/config',{mode:'standard',activeReplyId:editingReplyId,handoffAfterReply:true});if(result){renderReplyLibrary();$('reply-feedback').textContent='Respuesta inicial seleccionada. El estado del bot no ha cambiado.';}};

init();
