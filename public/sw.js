/* FarGaze Log — offline support (#71 step 3, slice 1: the entry app opens with no signal).
 *
 * Registered only where src/lib/offline/config.ts allows it (the test site first); anywhere
 * else the page unregisters it and deletes these caches (the off switch).
 *
 *   /_next/static/…        cache first (file names change with every build)
 *   pages /entry, /entry/… network first; no answer within PAGE_WAIT or no signal → the copy
 *                          saved last time. Other pages: network only; offline → a short note.
 *   GET /api/entry/…,      network first; no answer within DATA_WAIT or no signal → the copy
 *   /api/records/options,  saved last time, marked x-offline-saved: <ms> so the page can say
 *   /api/records/<id>      how old it is. Home asks for its plans, stamps and recent records
 *                          to be saved (slice 2), so they open and copy offline.
 *   everything else        untouched (saving, other pages' data, sign-in).
 *
 * Bump VERSION when this file changes in a way old caches must not survive.
 */
const VERSION = 'v2';
const STATIC = `fg-static-${VERSION}`;
const PAGES = `fg-pages-${VERSION}`;
const DATA = `fg-data-${VERSION}`;
const KEEP = [STATIC, PAGES, DATA];
const PAGE_WAIT = 5000;
const DATA_WAIT = 8000;
const STATIC_MAX = 400;

// What the entry app needs to open offline; fetched again on every online visit.
const WARM_PAGES = ['/entry', '/entry/new'];
const WARM_DATA = ['/api/entry/rules', '/api/records/options', '/api/entry/recent'];

const isEntryPage = p => p === '/entry' || p.startsWith('/entry/');
// A record's form (/api/records/<id>): Copy to new entry works offline for the ones saved.
const isData = p => p.startsWith('/api/entry/') || p === '/api/records/options' || /^\/api\/records\/[0-9a-f]{24}$/.test(p);

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fg-') && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

/** A copy to keep, stamped with when it was saved. */
async function stamped(res) {
  const h = new Headers(res.headers);
  h.set('x-offline-saved', String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}
/** The saved copy, marked as such. */
function fromCache(res) {
  const h = new Headers(res.headers);
  h.set('x-offline-from-cache', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
const keepable = res => res && res.ok && !res.redirected && res.type === 'basic';

/** Network first: the network's answer if it comes within `wait`; else the saved copy (the
 *  network keeps going and refreshes it); with neither, the network's error. */
async function networkFirst(event, cacheName, key, wait, nothing) {
  const cache = await caches.open(cacheName);
  const net = fetch(event.request).then(async res => {
    if (keepable(res)) await cache.put(key, await stamped(res.clone()));
    return res;
  });
  event.waitUntil(net.catch(() => {}));
  const saved = () => cache.match(key);
  try {
    return await Promise.race([
      net,
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), self.navigator.onLine === false ? 0 : wait)),
    ]);
  } catch (e) {
    const hit = await saved();
    if (hit) return fromCache(hit);
    // Nothing saved: wait for the network after all (or its error).
    return nothing ? net.catch(nothing) : net;
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (keepable(res)) { await cache.put(event.request, res.clone()); trim(cache); }
  return res;
}
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_MAX; i++) await cache.delete(keys[i]);   // oldest first
}

const OFFLINE_NOTE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>No signal</title><body style="font-family:system-ui;padding:2rem;background:#09090b;color:#e4e4e7">
<p>No signal, and this page needs one.</p><p><a href="/entry" style="color:#2dd4bf">Entry</a> works offline.</p></body>`;

const offlineNote = () => new Response(OFFLINE_NOTE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;

  if (p.startsWith('/_next/static/')) { event.respondWith(cacheFirst(event)); return; }

  if (req.mode === 'navigate') {
    // The page's HTML is the same for any ?copy=… or ?stamp=…: keep one copy per path.
    if (isEntryPage(p)) { event.respondWith(networkFirst(event, PAGES, p, PAGE_WAIT, offlineNote)); return; }
    event.respondWith(fetch(req).catch(offlineNote));
    return;
  }

  // Page data (not the RSC payloads of client navigations: those fail offline and Next then
  // loads the page itself, which the rule above serves).
  if (isData(p) && req.headers.get('RSC') !== '1') {
    event.respondWith(networkFirst(event, DATA, p + url.search, DATA_WAIT));
  }
});

// The page asks for a refresh of what the entry app needs, plus the files it loaded itself
// before this worker was in charge.
self.addEventListener('message', event => {
  const m = event.data || {};
  if (m.type !== 'warm') return;
  event.waitUntil((async () => {
    const put = async (cacheName, key, url) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (keepable(res)) await (await caches.open(cacheName)).put(key, await stamped(res));
      } catch { /* offline: keep what is there */ }
    };
    await Promise.all([
      ...WARM_PAGES.map(u => put(PAGES, u, u)),
      ...WARM_DATA.map(u => put(DATA, u, u)),
      ...(m.data || []).filter(u => isData(new URL(u, self.location.origin).pathname))
        .map(u => { const x = new URL(u, self.location.origin); return put(DATA, x.pathname + x.search, x.href); }),
    ]);
    const statics = (m.statics || []).filter(u => new URL(u, self.location.origin).pathname.startsWith('/_next/static/'));
    const cache = await caches.open(STATIC);
    for (const u of statics) {
      if (await cache.match(u)) continue;
      try { const res = await fetch(u); if (keepable(res)) await cache.put(u, res); } catch { /* offline */ }
    }
  })());
});
