const CACHE = 'workout-shell-v5';
const ROOT = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './styles.css', './app.js', './model.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192-v3.png', './icons/icon-512-v3.png'].map(path => new URL(path, ROOT).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('workout-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // Network-first navigation receives updates; the complete shell is cached for offline use.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => response.ok ? response : caches.match(new URL('index.html', ROOT).href)).catch(() => caches.match(new URL('index.html', ROOT).href)));
  } else if (ASSETS.includes(url.href)) {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
  }
});
