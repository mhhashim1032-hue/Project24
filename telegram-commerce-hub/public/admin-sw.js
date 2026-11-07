const CACHE='gold-feather-admin-shell-v1';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gold-feather-admin-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
// Intentionally do not cache authenticated pages, API calls, Supabase responses or customer data.
