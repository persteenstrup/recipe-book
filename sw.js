// Network first (so new recipes show up), falling back to the cache when offline.
const CACHE = 'recipe-book-v8';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/parse.js', 'js/units.js', 'js/notes.js', 'js/menu.js', 'manifest.webmanifest', 'icon.svg', 'recipes/index.yaml'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
