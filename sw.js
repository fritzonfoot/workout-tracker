const CACHE = 'workout-shell-v7';
const ROOT = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './styles.css?v=7', './app.js?v=7', './model.js?v=7', './manifest.webmanifest?v=7', './icons/icon.svg', './icons/icon-192-v3.png', './icons/icon-512-v3.png'].map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('workout-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // Always refresh navigation online, and use only this version's complete shell offline.
  const cached = async request => (await caches.open(CACHE)).match(request);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => response.ok ? response : cached(new URL('index.html', ROOT).href)).catch(() => cached(new URL('index.html', ROOT).href)));
  } else {
    const asset = ASSETS.find(path => new URL(path).pathname === url.pathname);
    if (asset) event.respondWith(cached(asset).then(response => response || fetch(new Request(asset, { cache: 'reload' }))));
  }
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
