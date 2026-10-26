'use client';
// src/app/insights/_components/JourneyMap.tsx
//
// Places map for the Journeys widget, on Google Maps (Maps JavaScript API).
//
//   • Places: dots whose AREA grows with arrivals; homes are dark, the rest blue.
//     The 5 busiest places carry a permanent label; every dot shows its name on hover.
//   • Routes: straight lines between From and To (A→B and B→A drawn as one line),
//     thicker for more journeys, semi-transparent so overlaps build up.
//   • Click a dot: only its routes stay strong, and a line under the map names it.
//     Click empty map to reset.
//   • Start view: the busiest place and every place within START_KM of it, so far
//     trips (Edinburgh, Busan) don't shrink the everyday area. They are still drawn —
//     zoom out to see them.
//   • Scrolling the page never zooms the map ("cooperative": Ctrl + wheel zooms).
//
// The key comes from /api/maps-key (signed-in users only; env GOOGLE_MAPS_BROWSER_KEY),
// so it is never baked into the public JavaScript files. It is still restricted in
// Google Cloud to the site's addresses and to the Maps JavaScript API.
// Dots and labels are one custom overlay (plain DOM), so no Map ID or deprecated
// Marker class is needed; lines are ordinary Polylines.

import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMaps } from '@/app/_components/google-maps';

/* eslint-disable @typescript-eslint/no-explicit-any */
type G = any;

export interface MapPlace { name: string; arrivals: number; lat: number | null; lng: number | null; home: boolean }
export interface MapRoute { from: string; to: string; count: number; a: [number, number] | null; b: [number, number] | null }

const LABELS = 5;
const START_KM = 50;
const DOT_MIN = 6, DOT_MAX = 28;          // px diameter
const LINE_MIN = 1, LINE_MAX = 8;         // px width

// ── Loading the API: src/app/_components/google-maps.ts (shared with the admin point picker)

// ── Map styles (no Map ID, so plain style arrays work) ────────────────────────

const QUIET = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];
const NIGHT = [
  ...QUIET,
  { elementType: 'geometry', stylers: [{ color: '#1f2933' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa5b1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1f2933' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#323f4b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f2933' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1520' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#3e4c59' }] },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function JourneyMap({ places, routes, isDark, accent }: {
  places: MapPlace[];
  routes: MapRoute[];
  isDark: boolean;
  accent: string;
}) {
  const [key, setKey] = useState<string | null>(null);   // null = still asking
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<G>(null);
  const gRef = useRef<G>(null);
  const linesRef = useRef<{ line: G; ends: [string, string] }[]>([]);
  const overlayRef = useRef<G>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Only places and routes that can be drawn
  const pts = useMemo(() => places.filter(p => p.lat !== null && p.lng !== null), [places]);
  const lines = useMemo(() => {
    const m = new Map<string, { a: [number, number]; b: [number, number]; ends: [string, string]; count: number }>();
    for (const r of routes) {
      if (!r.a || !r.b || r.from === r.to) continue;
      const [x, y] = r.from < r.to ? [r.from, r.to] : [r.to, r.from];
      const k = `${x}\u0000${y}`;
      const cur = m.get(k) ?? { a: r.a, b: r.b, ends: [r.from, r.to] as [string, string], count: 0 };
      cur.count += r.count;
      m.set(k, cur);
    }
    return [...m.values()].sort((p, q) => p.count - q.count);   // busiest drawn last (on top)
  }, [routes]);

  // Ask the server for the key once
  useEffect(() => {
    let cancelled = false;
    fetch('/api/maps-key')
      .then(r => (r.ok ? r.json() : { key: '' }))
      .then((d: { key?: string }) => { if (!cancelled) setKey(d.key ?? ''); })
      .catch(() => { if (!cancelled) setKey(''); });
    return () => { cancelled = true; };
  }, []);

  // Create the map once
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    loadGoogleMaps(key)
      .then(async (g) => {
        const { Map } = await g.maps.importLibrary('maps');
        if (cancelled || !boxRef.current) return;
        gRef.current = g;
        mapRef.current = new Map(boxRef.current, {
          center: { lat: 51.37, lng: -0.46 }, zoom: 11,
          disableDefaultUI: true, zoomControl: true, fullscreenControl: true,
          clickableIcons: false, gestureHandling: 'cooperative',
        });
        mapRef.current.addListener('click', () => setSelected(null));
        setReady(true);
      })
      .catch((e: Error) => { if (!cancelled) setFailed(e.message); });
    return () => { cancelled = true; };
  }, [key]);

  // Light / dark style
  useEffect(() => {
    if (ready) mapRef.current.setOptions({ styles: isDark ? NIGHT : QUIET });
  }, [ready, isDark]);

  // Draw lines and dots whenever the data changes; refit the start view
  useEffect(() => {
    if (!ready) return;
    const g = gRef.current, map = mapRef.current;
    setSelected(null);

    for (const l of linesRef.current) l.line.setMap(null);
    const maxCount = Math.max(1, ...lines.map(l => l.count));
    linesRef.current = lines.map(l => ({
      ends: l.ends,
      line: new g.maps.Polyline({
        map, path: [{ lat: l.a[0], lng: l.a[1] }, { lat: l.b[0], lng: l.b[1] }],
        strokeColor: accent, strokeOpacity: 0.35, clickable: false,
        strokeWeight: LINE_MIN + (LINE_MAX - LINE_MIN) * Math.sqrt(l.count / maxCount),
      }),
    }));

    overlayRef.current?.setMap(null);
    overlayRef.current = makeDotsOverlay(g, pts, accent, isDark, name => setSelected(name));
    overlayRef.current.setMap(map);

    // Start view: the busiest place and everything within START_KM of it
    const hub = [...pts].sort((x, y) => y.arrivals - x.arrivals)[0];
    const core = hub ? pts.filter(p => kmBetween(p, hub) <= START_KM) : [];
    if (core.length === 1) { map.setCenter({ lat: core[0].lat, lng: core[0].lng }); map.setZoom(13); }
    else if (core.length > 1) {
      const bounds = new g.maps.LatLngBounds();
      for (const p of core) bounds.extend({ lat: p.lat, lng: p.lng });
      map.fitBounds(bounds, 48);
    }
  }, [ready, pts, lines, accent, isDark]);

  // Selection: fade every line not touching the selected place
  useEffect(() => {
    if (!ready) return;
    for (const { line, ends } of linesRef.current) {
      const on = !selected || ends.includes(selected);
      line.setOptions({ strokeOpacity: selected ? (on ? 0.85 : 0.06) : 0.35 });
    }
    overlayRef.current?.select(selected);
  }, [ready, selected]);

  const sel = selected ? pts.find(p => p.name === selected) : null;
  const selRoutes = selected ? lines.filter(l => l.ends.includes(selected)).length : 0;

  if (key === '') {
    return (
      <p className="text-[11px] text-stone-400 dark:text-zinc-500">
        Map needs GOOGLE_MAPS_BROWSER_KEY in .env.local / Vercel (then restart the dev server).
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {/* Google owns everything inside the map div, so React must never render
          children into it — the loading note is a sibling laid over it. */}
      <div className="relative w-full h-80 rounded-lg overflow-hidden bg-stone-100 dark:bg-zinc-800 border border-stone-200 dark:border-zinc-700">
        <div ref={boxRef} className="absolute inset-0" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-stone-400 dark:text-zinc-500">
            {failed ?? 'Loading map…'}
          </div>
        )}
      </div>
      <p className="text-[11px] min-h-4 text-stone-600 dark:text-zinc-300">
        {sel ? <><b className="font-medium">{sel.name}</b> · {sel.arrivals} arrivals · {selRoutes} {selRoutes === 1 ? 'route' : 'routes'}</> : null}
      </p>
    </div>
  );
}

function kmBetween(a: MapPlace, b: MapPlace): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat! - a.lat!) / 2) ** 2
    + Math.cos(rad(a.lat!)) * Math.cos(rad(b.lat!)) * Math.sin(rad(b.lng! - a.lng!) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// ── Dots and labels: one overlay of plain DOM elements ────────────────────────

function makeDotsOverlay(g: G, pts: MapPlace[], accent: string, isDark: boolean, onPick: (name: string) => void) {
  const maxArr = Math.max(1, ...pts.map(p => p.arrivals));
  const labelled = new Set([...pts].sort((a, b) => b.arrivals - a.arrivals).slice(0, LABELS).map(p => p.name));
  const homeFill = isDark ? '#f4f4f5' : '#1c1917';
  const ring = isDark ? '#18181b' : '#ffffff';
  const textColor = isDark ? '#e4e4e7' : '#1c1917';

  class DotsOverlay extends g.maps.OverlayView {
    root: HTMLDivElement | null = null;
    items: { p: MapPlace; el: HTMLDivElement; d: number }[] = [];

    onAdd() {
      this.root = document.createElement('div');
      this.root.style.position = 'absolute';
      // Smaller dots on top, so a big dot never hides a small one
      const order = [...pts].sort((a, b) => b.arrivals - a.arrivals);
      for (const p of order) {
        const d = DOT_MIN + (DOT_MAX - DOT_MIN) * Math.sqrt(p.arrivals / maxArr);
        const el = document.createElement('div');
        el.title = `${p.name} · ${p.arrivals} arrivals`;
        Object.assign(el.style, {
          position: 'absolute', width: `${d}px`, height: `${d}px`, borderRadius: '50%',
          background: p.home ? homeFill : accent, opacity: '0.85',
          border: `1.5px solid ${ring}`, boxSizing: 'border-box', cursor: 'pointer',
          transform: 'translate(-50%, -50%)',
        } as CSSStyleDeclaration);
        el.addEventListener('click', e => { e.stopPropagation(); onPick(p.name); });
        if (labelled.has(p.name)) {
          const lab = document.createElement('span');
          lab.textContent = p.name;
          Object.assign(lab.style, {
            position: 'absolute', left: `${d + 3}px`, top: '50%', transform: 'translateY(-50%)',
            whiteSpace: 'nowrap', fontSize: '11px', fontWeight: '500', color: textColor,
            textShadow: `0 0 3px ${ring}, 0 0 3px ${ring}, 0 0 3px ${ring}`, pointerEvents: 'none',
          } as CSSStyleDeclaration);
          el.appendChild(lab);
        }
        this.root.appendChild(el);
        this.items.push({ p, el, d });
      }
      this.getPanes().overlayMouseTarget.appendChild(this.root);
      // Clicks on dots must not reach the map (which would clear the selection)
      g.maps.OverlayView.preventMapHitsAndGesturesFrom(this.root);
    }

    draw() {
      const proj = this.getProjection();
      if (!proj) return;
      for (const { p, el } of this.items) {
        const pt = proj.fromLatLngToDivPixel(new g.maps.LatLng(p.lat, p.lng));
        if (!pt) continue;
        el.style.left = `${pt.x}px`;
        el.style.top = `${pt.y}px`;
      }
    }

    onRemove() {
      this.root?.remove();
      this.root = null;
      this.items = [];
    }

    select(name: string | null) {
      for (const { p, el } of this.items) {
        el.style.opacity = !name || p.name === name ? '0.85' : '0.3';
        el.style.outline = p.name === name ? `2px solid ${accent}` : 'none';
        el.style.outlineOffset = '2px';
      }
    }
  }
  return new DotsOverlay();
}
