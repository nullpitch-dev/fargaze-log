// src/app/_components/google-maps.ts
// Loads the Google Maps JavaScript API once per page, for every map on the site
// (Journeys' places map, the admin point picker). Moved out of JourneyMap.tsx on
// 26 Oct 2026 when the point picker needed the same loader.
//
// The key comes from /api/maps-key (signed-in users only; env GOOGLE_MAPS_BROWSER_KEY),
// so it is never baked into the public JavaScript files. It is still restricted in
// Google Cloud to the site's addresses and to the Maps JavaScript API.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type G = any;

let loader: Promise<G> | null = null;
let keyAsk: Promise<string> | null = null;

export function loadGoogleMaps(key: string): Promise<G> {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google?.maps?.importLibrary) { resolve(w.google); return; }
    w.__fargazeMapsReady = () => resolve(w.google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__fargazeMapsReady`;
    s.async = true;
    s.onerror = () => { loader = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(s);
  });
  return loader;
}

/** The browser key from /api/maps-key, asked once per page; '' when not available. */
export function getMapsKey(): Promise<string> {
  if (keyAsk) return keyAsk;
  keyAsk = fetch('/api/maps-key')
    .then(r => (r.ok ? r.json() : { key: '' }))
    .then((d: { key?: string }) => d.key ?? '')
    .catch(() => '');
  keyAsk.then(k => { if (!k) keyAsk = null; });   // ask again next time if it failed
  return keyAsk;
}
