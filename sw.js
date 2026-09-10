/* ============================================================
   GRIMOIRE - service worker

   Strategy:
   - the app shell (html/css/js/fonts/icons) is precached and
     served cache-first, so the app opens with no network at all
   - navigations fall back to the cached index.html
   - anything else is network-first with a cache fallback

   Updating, without a build step and without bumping anything
   by hand: the worker keeps a fingerprint (a SHA-256 of every
   code file it cached) and can be asked to compare it against
   the server. If anything changed, the whole set is written
   into the cache in one go and the app is told an update is
   ready - it takes effect on the next load. See js/update.js.

   CACHE only needs bumping when this file's own caching rules
   change; ordinary app edits are picked up by the check above.
   ============================================================ */

const CACHE = 'grimoire-v4';
const FINGERPRINT_KEY = './__grimoire-fingerprint';

/* The files that actually change when the app is edited. These are
   the ones the update check compares - fonts and icons are left out
   because they are large and effectively fixed. */
const CODE = [
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
  './js/richtext.js',
  './js/markup.js',
  './js/media.js',
  './js/photos.js',
  './js/update.js',
  './js/views/dashboard.js',
  './js/views/scrolls.js',
  './js/views/editor.js',
  './js/views/chronicle.js',
  './js/views/quests.js',
  './js/views/options.js',
  './js/views/search.js',
];

const ASSETS = [
  './',
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

const SHELL = [...CODE, ...ASSETS];

/* ---------- fingerprinting ---------- */

async function hashBuffer(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A short id for the whole set, shown to the user as the build. */
async function buildId(map) {
  const text = CODE.map((u) => `${u}:${map[u] || ''}`).join('|');
  return hashBuffer(new TextEncoder().encode(text));
}

async function readFingerprint(cache) {
  try {
    const res = await cache.match(FINGERPRINT_KEY);
    return res ? await res.json() : null;
  } catch { return null; }
}

async function writeFingerprint(cache, map) {
  const record = { files: map, build: await buildId(map), updatedAt: Date.now() };
  await cache.put(FINGERPRINT_KEY, new Response(JSON.stringify(record), {
    headers: { 'Content-Type': 'application/json' },
  }));
  return record;
}

/* ---------- install / activate ---------- */

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const map = {};
    // add one at a time so a single missing file cannot fail the install
    await Promise.all(SHELL.map(async (url) => {
      try {
        const res = await fetch(new Request(url, { cache: 'reload' }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (CODE.includes(url)) map[url] = await hashBuffer(await res.clone().arrayBuffer());
        await cache.put(url, res);
      } catch (err) {
        console.warn('[sw] could not cache', url, err);
      }
    }));
    await writeFingerprint(cache, map);
    // no skipWaiting here: the page decides when to switch over, so a
    // running session is never served half of one version and half of
    // another. js/update.js sends 'skip-waiting' when the user agrees.
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------- the update check ---------- */

let checking = null;

async function notify(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach((c) => c.postMessage(message));
}

/**
 * Re-fetches every code file, compares the hashes with what is in the
 * cache and, if anything moved, swaps the whole set in at once.
 * Resolves {status:'ready'|'current'|'offline', build, updatedAt}.
 */
function checkForUpdate() {
  if (checking) return checking;
  checking = (async () => {
    const cache = await caches.open(CACHE);
    const known = await readFingerprint(cache);
    const fresh = {};
    const bodies = new Map();

    for (const url of CODE) {
      let res;
      try {
        res = await fetch(new Request(url, { cache: 'reload' }));
      } catch {
        return { status: 'offline', build: known?.build || null, updatedAt: known?.updatedAt || 0 };
      }
      if (!res.ok) {
        return { status: 'offline', build: known?.build || null, updatedAt: known?.updatedAt || 0 };
      }
      const buf = await res.clone().arrayBuffer();
      fresh[url] = await hashBuffer(buf);
      bodies.set(url, res);
    }

    const changed = !known || CODE.some((u) => (known.files || {})[u] !== fresh[u]);
    if (!changed) {
      return { status: 'current', build: known.build, updatedAt: known.updatedAt };
    }

    // everything arrived intact - swap the set in together
    for (const [url, res] of bodies) await cache.put(url, res);
    const record = await writeFingerprint(cache, fresh);
    await notify({ type: 'update-ready', build: record.build, updatedAt: record.updatedAt });
    return { status: 'ready', build: record.build, updatedAt: record.updatedAt };
  })().finally(() => { checking = null; });
  return checking;
}

/* ---------- fetch ---------- */

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
    // Cached app files are served as they are, with no quiet refresh:
    // a session keeps one consistent version, and new files only land
    // through the update check above.
    const hit = await cache.match(req, { ignoreSearch: false });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('Offline.', { status: 503, statusText: 'Offline' });
    }
  })());
});

/* ---------- messages from the page ---------- */

self.addEventListener('message', (e) => {
  const data = e.data;
  const reply = (payload) => {
    if (e.ports && e.ports[0]) e.ports[0].postMessage(payload);
  };

  if (data === 'skip-waiting' || data?.type === 'skip-waiting') {
    self.skipWaiting();
    return;
  }

  if (data?.type === 'check') {
    e.waitUntil(checkForUpdate().then(reply).catch(() => reply({ status: 'offline' })));
    return;
  }

  if (data?.type === 'version') {
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      const fp = await readFingerprint(cache);
      reply({ cache: CACHE, build: fp?.build || null, updatedAt: fp?.updatedAt || 0 });
    })());
  }
});
