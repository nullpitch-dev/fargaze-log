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
 *   RSC of /entry/…        (a tap on a link inside the app) network, but no answer within
 *                          PAGE_WAIT (or WEAK_WAIT while weak) → an error, so Next loads the
 *                          page itself and the page rule above serves the saved copy (25 Nov:
 *                          with a weak signal a tap on Copy recent did nothing at all).
 *   everything else        untouched (saving, other pages' data, sign-in).
 *
 * Bump VERSION when this file changes in a way old caches must not survive.
 */
const VERSION = 'v2';
const STATIC = `fg-static-${VERSION}`;
const PAGES = `fg-pages-${VERSION}`;
const DATA = `fg-data-${VERSION}`;
const KEEP = [STATIC, PAGES, DATA];
// Shorter waits (Hyoje, 22 Nov: deciding it was offline took too long): the saved copy
// shows sooner and the page swaps in the fresh answer when it comes (Today retries).
const PAGE_WAIT = 2500;
const DATA_WAIT = 3500;
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
// Weak signal remembered (Hyoje, 24 Nov: wifi he couldn't use — every page and form waited
// the full time again): after a wait runs out or the network fails, the next minute waits
// only WEAK_WAIT; any answer from the network clears it.
const WEAK_FOR = 60000, WEAK_WAIT = 400;
let weakUntil = 0;

async function networkFirst(event, cacheName, key, wait, nothing) {
  const cache = await caches.open(cacheName);
  const net = fetch(event.request).then(async res => {
    weakUntil = 0;
    if (keepable(res)) await cache.put(key, await stamped(res.clone()));
    return res;
  });
  net.catch(() => { weakUntil = Date.now() + WEAK_FOR; });
  event.waitUntil(net.catch(() => {}));
  const saved = () => cache.match(key);
  // X-FG-Fresh: the page wants the network's answer (after showing a saved copy): no race,
  // the saved copy only if the network fails.
  const fresh = event.request.headers.get('X-FG-Fresh') === '1';
  const limit = self.navigator.onLine === false ? 0 : Date.now() < weakUntil ? Math.min(wait, WEAK_WAIT) : wait;
  try {
    if (fresh) return await net;
    return await Promise.race([
      net,
      new Promise((_, no) => setTimeout(() => { weakUntil = Date.now() + WEAK_FOR; no(new Error('slow')); }, limit)),
    ]);
  } catch (e) {
    const hit = await saved();
    if (hit) return fromCache(hit);
    // Nothing saved: wait for the network after all (or its error).
    return nothing ? net.catch(nothing) : net;
  }
}

/** An RSC payload within PAGE_WAIT (WEAK_WAIT while the signal is weak), else an error. */
async function rscWithin(event) {
  const net = fetch(event.request).then(res => { weakUntil = 0; return res; });
  net.catch(() => { weakUntil = Date.now() + WEAK_FOR; });
  const limit = self.navigator.onLine === false ? 0 : Date.now() < weakUntil ? WEAK_WAIT : PAGE_WAIT;
  try {
    return await Promise.race([
      net,
      new Promise((_, no) => setTimeout(() => { weakUntil = Date.now() + WEAK_FOR; no(new Error('slow')); }, limit)),
    ]);
  } catch {
    return Response.error();
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

  // A tap on a link inside the entry app: Next asks for the page's RSC payload and waits for
  // it with no time limit. Give up in time, so Next loads the page itself (served above).
  if (req.headers.get('RSC') === '1' && isEntryPage(p)) { event.respondWith(rscWithin(event)); return; }
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
      // only: just the listed data (Copy recent's search results, 25 Nov)
      ...(m.only ? [] : WARM_PAGES.map(u => put(PAGES, u, u))),
      ...(m.only ? [] : WARM_DATA.map(u => put(DATA, u, u))),
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
