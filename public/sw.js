// Service worker: notifications only. It caches nothing, so the panel always comes from the server (and Cloudflare Access).
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 // Browsers require a visible notification for every push; the server skips pushes while a panel is on screen.
 event.waitUntil(self.registration.showNotification(data.title||'Conversa',{body:data.body||'Tienes un mensaje nuevo',tag:data.tag||'conversa',renotify:true,icon:'/icon-192.png',badge:'/icon-192.png',data:{jid:data.jid||''}}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const jid=event.notification.data?.jid||'';
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){if('focus' in client){await client.focus();client.postMessage({type:'open-chat',jid});return;}}
  await self.clients.openWindow(jid?'/#chat='+encodeURIComponent(jid):'/');
 })());
});
