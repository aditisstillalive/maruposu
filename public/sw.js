// Maraca POS service worker: keeps the cashier app usable without internet.
// - /api/* and other origins are never touched (live data goes through the
//   tablet's own outbox; the page CSP doesn't allow other origins anyway).
// - Build assets are cache-first (their URLs change every deploy).
// - Pages are network-first, falling back to the last copy (or /pos).
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PRECACHE = ['/maraca-logo.png', '/maraca-wordmark.png', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(ASSETS).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== PAGES && k !== ASSETS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isAsset = url =>
  url.pathname.startsWith('/_next/static/') || PRECACHE.includes(url.pathname) || url.pathname.startsWith('/icons/');

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          // A redirect (e.g. / → /pos) can't be replayed for a navigation
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then(c => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(url.pathname)) || (await cache.match('/pos')) || (await cache.match('/')) || Response.error();
        })
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then(async cache => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
  }
});
