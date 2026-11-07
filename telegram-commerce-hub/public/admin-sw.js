const CACHE='gold-feather-admin-static-v2';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gold-feather-admin-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  // Cache only immutable Next.js build assets and the app icon. Never cache documents,
  // API responses, Supabase requests, auth tokens, customer records or checkout data.
  if(url.pathname.startsWith('/_next/static/')||url.pathname==='/admin-icon.svg'){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const cached=await cache.match(request);
      if(cached)return cached;
      const response=await fetch(request);
      if(response.ok)await cache.put(request,response.clone());
      return response;
    }));
  }
});
