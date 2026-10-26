'use client';
// src/app/admin/_components/PointPicker.tsx
//
// Checks a place point on Google Maps and moves it (26 Oct 2026, Hyoje):
//   • the point is a pin: drag it, or tap the map to put it there
//   • 📍 Here moves it to where the phone or browser says you are (with ±accuracy)
//   • Map / Satellite to check the building
//   • "Apply this point" hands back exactly where the pin is (6 decimals ≈ 0.1 m);
//     the page saves it like any other edit, or puts it in the row being edited
//
// The pin is Google's classic Marker: the newer AdvancedMarkerElement needs a Map ID
// set up in Google Cloud. The classic one is still supported (it logs a notice).

import { useEffect, useRef, useState } from 'react';
import { ModalShell } from '@/app/insights/_components/ModalShell';
import { loadGoogleMaps, getMapsKey, type G } from '@/app/_components/google-maps';

export interface LatLng { lat: number; lng: number }
export interface Located extends LatLng { accuracy: number }

/** Where an empty point starts: Weybridge. */
const DEFAULT_VIEW: LatLng = { lat: 51.3713, lng: -0.4577 };

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function metres(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(h));
}

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`);

/** The device's position. Needs https (or localhost) and the user's permission. */
export function locate(): Promise<Located> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new Error('This browser cannot tell its position.')); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      e => reject(new Error(
        e.code === e.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in the browser’s site settings and try again.'
          : e.code === e.TIMEOUT ? 'Finding your position took too long. Try again, ideally outdoors or with Wi-Fi on.'
            : 'Your position is not available right now.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export function PointPicker({ title, start, here, applyLabel = 'Apply this point', onApply, onClose }: {
  title: string;
  /** The point to show; null opens on the default view with no pin until you tap or use Here. */
  start: LatLng | null;
  /** Opened from 📍 Here: the pin starts at this position and Apply is ready at once. */
  here?: Located | null;
  applyLabel?: string;
  onApply: (p: LatLng) => void | Promise<void>;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<G>(null);
  const pinRef = useRef<G>(null);
  const [pos, setPos] = useState<LatLng | null>(here ?? start);
  const [accuracy, setAccuracy] = useState<number | null>(here?.accuracy ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');
  const [saving, setSaving] = useState(false);

  // Create the map and the pin once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await getMapsKey();
      if (!key) throw new Error('No Google Maps key (GOOGLE_MAPS_BROWSER_KEY).');
      const g = await loadGoogleMaps(key);
      const { Map } = await g.maps.importLibrary('maps');
      const { Marker } = await g.maps.importLibrary('marker');
      if (cancelled || !boxRef.current) return;
      const first = here ?? start;
      const map = new Map(boxRef.current, {
        center: first ?? DEFAULT_VIEW, zoom: first ? 18 : 12,
        disableDefaultUI: true, zoomControl: true, mapTypeControl: true,
        mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
        clickableIcons: false, gestureHandling: 'greedy',
      });
      const pin = new Marker({ map, position: first ?? null, draggable: true, visible: !!first, title: 'Drag me' });
      pin.addListener('dragend', () => { const p = pin.getPosition(); setPos({ lat: p.lat(), lng: p.lng() }); setAccuracy(null); });
      map.addListener('click', (e: G) => {
        pin.setPosition(e.latLng); pin.setVisible(true);
        setPos({ lat: e.latLng.lat(), lng: e.latLng.lng() }); setAccuracy(null);
      });
      mapRef.current = map;
      pinRef.current = pin;
    })().catch((e: Error) => { if (!cancelled) setFailed(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function goHere() {
    setLocating(true); setLocError('');
    try {
      const p = await locate();
      setPos({ lat: p.lat, lng: p.lng }); setAccuracy(p.accuracy);
      pinRef.current?.setPosition(p); pinRef.current?.setVisible(true);
      mapRef.current?.panTo(p); mapRef.current?.setZoom(18);
    } catch (e) {
      setLocError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocating(false);
    }
  }

  async function apply() {
    if (!pos) return;
    setSaving(true);
    try { await onApply({ lat: round6(pos.lat), lng: round6(pos.lng) }); }
    finally { setSaving(false); }
  }

  const moved = pos && start ? metres(start, pos) : null;
  const ready = !!pos && (here != null || !start || (moved ?? 0) >= 0.5);
  const btn = 'px-3 py-1.5 rounded-lg text-sm disabled:opacity-40';

  return (
    <ModalShell title={title} onClose={onClose}>
      <div ref={boxRef} className="w-full h-[60vh] max-h-[520px] rounded-lg bg-stone-100 dark:bg-zinc-800" />
      {failed && <p className="text-sm text-red-600 dark:text-red-400">Could not load the map: {failed}</p>}
      <div className="text-xs text-stone-600 dark:text-zinc-300 space-y-0.5">
        <p className="font-mono">{pos ? `${round6(pos.lat)}, ${round6(pos.lng)}` : 'No point yet: tap the map or use 📍 Here.'}</p>
        {accuracy != null && <p>Your position, ±{Math.round(accuracy)} m{accuracy > 50 ? ' — not very exact; check the pin.' : '.'}</p>}
        {moved != null && moved >= 0.5 && <p>Moved {fmtDist(moved)} from the saved point.</p>}
        {!failed && <p className="text-stone-400 dark:text-zinc-500">Drag the pin, or tap the map to put it there.</p>}
        {locError && <p className="text-red-600 dark:text-red-400">{locError}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={goHere} disabled={locating || saving}
          className={`${btn} border border-stone-300 dark:border-zinc-600 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800`}>
          {locating ? 'Finding you…' : '📍 Here'}
        </button>
        <button onClick={apply} disabled={!ready || saving}
          className={`${btn} ml-auto bg-stone-800 dark:bg-zinc-700 text-white font-medium hover:bg-stone-900 dark:hover:bg-zinc-600`}>
          {saving ? 'Saving…' : applyLabel}
        </button>
        <button onClick={onClose} disabled={saving} className="text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100">Cancel</button>
      </div>
    </ModalShell>
  );
}
