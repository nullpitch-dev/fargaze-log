'use client';
// Offline support (#71 step 3, slice 1): registers public/sw.js where allowed and asks it to
// keep what the entry app needs; elsewhere removes it (the off switch). Shows a thin bar
// while the phone has no signal.
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { offlineAllowed } from '@/lib/offline/config';
import { flushOutbox, listOutbox } from '@/lib/offline/outbox';

/** Ask the worker to save the entry app's pages and data, and the files this page loaded. */
function warm(reg: ServiceWorkerRegistration) {
  const sw = reg.active ?? navigator.serviceWorker.controller;
  if (!sw || !navigator.onLine) return;
  const urls = performance.getEntriesByType('resource').map(e => e.name);
  sw.postMessage({
    type: 'warm',
    statics: urls.filter(u => u.includes('/_next/static/')),
    data: urls.filter(u => /\/api\/entry\/(home|rules|recent)/.test(u)),
  });
}

export default function OfflineSupport() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (!offlineAllowed(location.hostname)) {
      // The off switch: remove a worker left from before, and its caches.
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      if ('caches' in window) caches.keys().then(ks => ks.filter(k => k.startsWith('fg-')).forEach(k => caches.delete(k))).catch(() => {});
      return;
    }
    setOn(true);
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);

  // Refresh the saved copies: on a page change at most every 5 minutes (battery, Hyoje 11 Nov),
  // and always when the signal comes back. Files the pages load are saved as they load anyway.
  useEffect(() => {
    if (!on) return;
    const go = (force: boolean) => {
      try {
        const last = Number(localStorage.getItem('fg-warm-pages') || 0);
        if (!force && Date.now() - last < 5 * 60_000) return;
        localStorage.setItem('fg-warm-pages', String(Date.now()));
      } catch { /* storage blocked: refresh anyway */ }
      navigator.serviceWorker.ready.then(r => setTimeout(() => warm(r), 1500)).catch(() => {});
    };
    const back = () => go(true);
    go(false);
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [on, pathname]);

  // The outbox (slice 2): send on every page, when the signal comes back, when the app comes
  // back on screen, and every 30 s while it is on screen (stopped while hidden: battery).
  useEffect(() => {
    if (!on) return;
    const send = () => { if (document.visibilityState === 'visible' && listOutbox().some(x => x.state === 'waiting')) flushOutbox(); };
    let t: ReturnType<typeof setInterval> | null = null;
    const timer = () => {
      if (t) { clearInterval(t); t = null; }
      if (document.visibilityState === 'visible') t = setInterval(send, 30_000);
    };
    const seen = () => { timer(); send(); };
    send(); timer();
    window.addEventListener('online', send);
    document.addEventListener('visibilitychange', seen);
    return () => { window.removeEventListener('online', send); document.removeEventListener('visibilitychange', seen); if (t) clearInterval(t); };
  }, [on, pathname]);

  useEffect(() => {
    const set = () => setOffline(!navigator.onLine);
    set();
    window.addEventListener('online', set);
    window.addEventListener('offline', set);
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set); };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="sticky top-0 z-50 px-4 py-1 text-xs text-center bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-b border-amber-200 dark:border-amber-900">
      No signal{on ? ' — Entry saves new entries and stamps on the phone' : ''}
    </div>
  );
}
