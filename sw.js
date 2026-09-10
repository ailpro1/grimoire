/* ============================================================
   GRIMOIRE - service worker

   Strategy:
   - the app shell (html/css/js/fonts/icons) is precached and
     served cache-first, so the app opens with no network at all
   - navigations fall back to the cached index.html
   - anything else is network-first with a cache fallback

   Bump CACHE when you change any app file, or the old copy will
   keep being served.
   ============================================================ */

const CACHE = 'grimoire-v2';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/audio.js',
  './js/ui.js',
  './js/sprites.js',
  './js/actions.js',
  './js/textkit.js',
  './js/markup.js',
  './js/media.js',
  './js/photos.js',
  './js/views/dashboard.js',
  './js/views/scrolls.js',
  './js/views/editor.js',
  './js/views/chronicle.js',
  './js/views/quests.js',
  './js/views/options.js',
  './js/views/search.js',
  './assets/fonts/PressStart2P-latin.woff2',
  './assets/fonts/PressStart2P-latin-ext.woff2',
  './assets/fonts/Silkscreen-400-latin.woff2',
  './assets/fonts/Silkscreen-400-latin-ext.woff2',
  './assets/fonts/Silkscreen-700-latin.woff2',
  './assets/fonts/Silkscreen-700-latin-ext.woff2',
  './assets/fonts/VT323-latin.woff2',
  './assets/fonts/VT323-latin-ext.woff2',
  './icons/icon-32.png',
  './icons/icon-64.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // add one at a time so a single missing file cannot fail the install
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] could not cache', url, err); }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // nothing external is used

  // page navigations: cached shell first, so it opens offline
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) ||
               (await cache.match('index.html')) ||
               new Response('Offline and no cached copy.', { status: 503 });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) {
      // refresh quietly in the background for next time
      fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('Offline.', { status: 503, statusText: 'Offline' });
    }
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
