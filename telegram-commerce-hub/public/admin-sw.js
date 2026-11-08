const CACHE='gold-feather-admin-static-v3';
const OFFLINE='/admin-offline.html';
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll([OFFLINE,'/admin-icon.svg']);await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gold-feather-admin-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 // Admin documents and all dynamic/private data are network-only. Never cache sessions, customers, payments or API responses.
 if(request.mode==='navigate'&&url.pathname.startsWith('/admin')){
   event.respondWith(fetch(request).catch(async()=> (await caches.match(OFFLINE))||Response.error()));
   return;
 }
 if(url.pathname.startsWith('/_next/static/')||url.pathname==='/admin-icon.svg'||url.pathname===OFFLINE){
   event.respondWith(caches.open(CACHE).then(async cache=>{
     const cached=await cache.match(request);
     if(cached)return cached;
     const response=await fetch(request);
     if(response.ok)await cache.put(request,response.clone());
     return response;
   }));
 }
});
