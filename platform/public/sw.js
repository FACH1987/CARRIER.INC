const offlinePage = `<!doctype html>
<html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión · Carrier.INC</title>
<style>body{margin:0;background:#f6f8fd;color:#152d52;font:1rem system-ui}main{max-width:32rem;margin:12vh auto;padding:1.5rem}a{color:#1d4ed8}</style>
<main><h1>Sin conexión</h1><p>Conéctate a Internet para consultar cargas, chats y suscripciones.</p><a href="/market.html">Volver a Carrier.INC</a></main></html>`;

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // Always fetch the live page. Account data and requests stay out of offline storage.
  event.respondWith(fetch(request).catch(() => new Response(offlinePage, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': 'no-store' },
  })));
});
