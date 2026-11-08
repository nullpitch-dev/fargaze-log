'use client';

// /entry — the entry app's home (#71 step 2, Design §15.7; agreed with Hyoje 8 Nov 2026).
//   Presets · + New · Copy recent
//   To confirm  plans whose start has passed: Started / Done as planned · Adjust · Delete
//   Open        records with no end: End now
//   Today       today's records (a tap opens the edit page)
//   Coming up   plans in the next 7 days (a tap opens Adjust)
// After a save or a delete, a toast with Undo.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { localNow, zoneCodeFor, type ZoneRow } from '@/lib/entry/time';

interface Point { date: string; hour: string; timezone: string }
interface Item { id: string; activity: string; category: string; title: string; start: Point; end: Point; place: string; updatedAt: string; status?: 'running' | 'over'; repeat?: boolean }
interface Preset { id: string; name: string; order: number; time: { kind: 'open' | 'moment' | 'length'; minutes: number | null } }
interface Home { today: string; toConfirm: Item[]; open: Item[]; todayRecords: Item[]; comingUp: Item[]; recent: Item[]; presets: Preset[] }
interface Toast { text: string; undo?: () => Promise<string | null> }

const btn = 'px-3 py-1.5 rounded text-sm border disabled:opacity-40 disabled:cursor-not-allowed';
const primary = `${btn} border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white`;
const secondary = `${btn} border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const small = 'px-2 py-1 rounded text-xs border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-40';
const heading = 'text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400';
const card = 'bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayLabel(date: string, today: string): string {
  if (!date) return '';
  if (date === today) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const [ty, tm, td] = today.split('-').map(Number);
  const diff = Math.round((t.getTime() - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${WD[t.getUTCDay()]} ${d} ${MO[m - 1]}${y !== ty ? ` ${y}` : ''}`;
}
function when(it: Item, today: string, withDay = true): string {
  const s = it.start.hour ? it.start.hour : 'All day';
  const moment = it.end.hour === it.start.hour && (!it.end.date || it.end.date === it.start.date);
  const e = it.end.hour && !moment ? `–${it.end.date && it.end.date !== it.start.date ? `${dayLabel(it.end.date, today)} ` : ''}${it.end.hour}` : '';
  return `${withDay ? `${dayLabel(it.start.date, today)} · ` : ''}${s}${e}`;
}
const name = (it: Item) => (it.title ? `${it.activity} · ${it.title}` : it.activity);

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; b: any }> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  return { ok: r.ok, b };
}

function EntryHome() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<Home | null>(null);
  const [zones, setZones] = useState<ZoneRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyQ, setCopyQ] = useState('');
  const [editPresets, setEditPresets] = useState(false);
  const [found, setFound] = useState<Item[] | null>(null);
  const iana = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London', []);

  const load = useCallback(async () => {
    try {
      const [h, z] = await Promise.all([
        fetch(`/api/entry/home?tz=${encodeURIComponent(iana)}`, { cache: 'no-store' }),
        zones ? Promise.resolve(null) : fetch('/api/entry/rules'),
      ]);
      const hb = await h.json().catch(() => ({}));
      if (!h.ok) throw new Error(hb.error ?? `HTTP ${h.status}`);
      if (z) { const zb = await z.json().catch(() => ({})); if (z.ok) setZones(zb.zones ?? []); }
      setData(hb); setError('');
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, [iana, zones]);
  useEffect(() => { load(); }, [load]);

  // Copy recent: typing searches every record (all years), not only the latest.
  useEffect(() => {
    const q = copyQ.trim();
    if (!q) { setFound(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/entry/recent?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
      const b = await r.json().catch(() => ({}));
      if (live && r.ok) setFound(b.recent ?? []);
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [copyQ]);

  // A toast for what the form just did (?saved=record|plan&id=…, ?deleted=<plan id>).
  useEffect(() => {
    const saved = params.get('saved'), id = params.get('id'), deleted = params.get('deleted');
    if (!saved && !deleted) return;
    if (deleted) {
      setToast({ text: 'Plan deleted', undo: async () => { const r = await call(`/api/entry/plans/${deleted}/restore`, 'POST'); return r.ok ? null : r.b.error ?? 'Undo failed'; } });
    } else if (id) {
      const fromPlan = params.get('from') === 'plan';
      setToast({
        text: saved === 'plan' ? (fromPlan ? 'Plan saved' : 'Saved as a plan') : 'Saved',
        undo: fromPlan ? undefined : async () => { const r = await call(`/api/entry/records/${id}`, 'DELETE'); return r.ok ? null : r.b.error ?? 'Undo failed'; },
      });
    }
    router.replace('/entry', { scroll: false });
  }, [params, router]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const nowPoint = (): Point => {
    const l = localNow(iana);
    return { ...l, timezone: (zones && zoneCodeFor(iana, l.date, l.hour, zones)) || '' };
  };

  async function act(key: string, fn: () => Promise<{ ok: boolean; b: any }>, done: Toast | ((b: any) => Toast)) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) {
        setToast({ text: [r.b.error ?? 'Failed', ...(r.b.problems ?? [])].join(' — ') });
        return;
      }
      setToast(typeof done === 'function' ? done(r.b) : done);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const confirm = (it: Item) => act(`c${it.id}`, () => call(`/api/entry/plans/${it.id}/confirm`, 'POST', { updatedAt: it.updatedAt }), { text: it.status === 'running' ? 'Started: saved as a record' : 'Done: saved as a record' });
  const del = (it: Item) => act(`d${it.id}`, () => call(`/api/entry/plans/${it.id}`, 'DELETE', { updatedAt: it.updatedAt }),
    { text: 'Plan deleted', undo: async () => { const r = await call(`/api/entry/plans/${it.id}/restore`, 'POST'); return r.ok ? null : r.b.error ?? 'Undo failed'; } });
  const endNow = (it: Item) => act(`e${it.id}`, () => call(`/api/entry/records/${it.id}/end`, 'POST', { end: nowPoint(), updatedAt: it.updatedAt }), { text: `${it.activity} ended` });

  async function undoToast() {
    if (!toast?.undo) return;
    const err = await toast.undo();
    setToast(err ? { text: err } : { text: 'Undone' });
    await load();
  }

  // Presets: order, rename, delete.
  async function movePreset(i: number, by: number) {
    if (!data) return;
    const list = [...data.presets];
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setData({ ...data, presets: list });
    await call('/api/entry/presets', 'PUT', { ids: list.map(p => p.id) });
  }
  async function renamePreset(p: Preset) {
    const n = window.prompt('Preset name', p.name)?.trim();
    if (!n || n === p.name) return;
    const r = await call(`/api/entry/presets/${p.id}`, 'PUT', { name: n });
    if (!r.ok) setToast({ text: r.b.error ?? 'Rename failed' });
    await load();
  }
  async function deletePreset(p: Preset) {
    if (!window.confirm(`Delete the preset “${p.name}”? Records made with it stay.`)) return;
    await call(`/api/entry/presets/${p.id}`, 'DELETE');
    await load();
  }

  if (error) {
    return (
      <div className="px-4 py-8 max-w-3xl mx-auto w-full">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <button onClick={load} className={`${secondary} mt-3`}>Try again</button>
      </div>
    );
  }
  if (!data) return <div className="px-4 py-8 max-w-3xl mx-auto w-full text-sm text-stone-500 dark:text-zinc-400">Loading…</div>;

  const today = data.today;
  const lastPlace = [...data.todayRecords].reverse().find(r => r.place)?.place ?? '';
  const newHref = (extra: Record<string, string> = {}) => `/entry/new?${new URLSearchParams({ ...(lastPlace ? { place: lastPlace } : {}), ...extra })}`;
  const recent = copyQ.trim() ? (found ?? data.recent.filter(r => name(r).toLowerCase().includes(copyQ.trim().toLowerCase()))) : data.recent;

  const row = (it: Item, right: React.ReactNode, href?: string, sub?: string) => (
    <li key={it.id} className="flex items-start gap-3 px-3 py-2.5 border-t first:border-t-0 border-stone-100 dark:border-zinc-800">
      <div className="flex-1 min-w-0">
        {href
          ? <Link href={href} className="block text-sm text-stone-800 dark:text-zinc-100 hover:underline truncate">{name(it)}</Link>
          : <span className="block text-sm text-stone-800 dark:text-zinc-100 truncate">{name(it)}</span>}
        <span className="block text-xs text-stone-500 dark:text-zinc-400 truncate">{sub ?? when(it, today)}{it.place ? ` · ${it.place}` : ''}</span>
      </div>
      {right}
    </li>
  );

  return (
    <div className="flex flex-col flex-1 w-full pb-24">
      <div className="px-4 pt-5 pb-2 max-w-3xl mx-auto w-full flex flex-col gap-4">
        {/* Presets and new */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">Entry</h1>
            {data.presets.length > 0 && (
              <button onClick={() => setEditPresets(v => !v)} className="text-xs text-stone-500 dark:text-zinc-400 underline">{editPresets ? 'Done' : 'Edit presets'}</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.presets.map((p, i) => editPresets ? (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-stone-300 dark:border-zinc-600 pl-3 pr-1 py-0.5 text-sm text-stone-700 dark:text-zinc-200">
                {p.name}
                <button aria-label={`Move ${p.name} left`} onClick={() => movePreset(i, -1)} disabled={i === 0} className="px-1 text-stone-400 disabled:opacity-30">←</button>
                <button aria-label={`Move ${p.name} right`} onClick={() => movePreset(i, 1)} disabled={i === data.presets.length - 1} className="px-1 text-stone-400 disabled:opacity-30">→</button>
                <button aria-label={`Rename ${p.name}`} onClick={() => renamePreset(p)} className="px-1 text-stone-400">✎</button>
                <button aria-label={`Delete ${p.name}`} onClick={() => deletePreset(p)} className="px-1 text-red-500">×</button>
              </span>
            ) : (
              <Link key={p.id} href={newHref({ preset: p.id })}
                className="rounded-full border border-stone-300 dark:border-zinc-600 px-3 py-1 text-sm text-stone-800 dark:text-zinc-100 hover:bg-stone-50 dark:hover:bg-zinc-800">{p.name}</Link>
            ))}
          </div>
          <div className="flex gap-2">
            <Link href={newHref()} className={primary}>+ New</Link>
            <button onClick={() => setCopyOpen(v => !v)} className={secondary} aria-expanded={copyOpen}>Copy recent</button>
          </div>
          {data.presets.length === 0 && <p className="text-xs text-stone-400 dark:text-zinc-500">No presets yet: make one with “Save as preset…” at the bottom of the New form.</p>}
          {copyOpen && (
            <div className={`${card} p-2 flex flex-col gap-2`}>
              <input value={copyQ} onChange={e => setCopyQ(e.target.value)} placeholder="Search all records" autoFocus
                className="w-full rounded border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm text-stone-800 dark:text-zinc-100" />
              <ul className="max-h-72 overflow-y-auto">
                {recent.map(r => row(r, null, newHref({ copy: r.id })))}
                {recent.length === 0 && <li className="px-3 py-2 text-sm text-stone-500 dark:text-zinc-400">Nothing matches.</li>}
              </ul>
            </div>
          )}
        </section>

        {data.toConfirm.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className={heading}>To confirm</h2>
            <ul className="flex flex-col gap-2">
              {data.toConfirm.map(it => (
                <li key={it.id} className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 p-3 flex flex-col gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-amber-900 dark:text-amber-100 truncate">{name(it)}</span>
                      <span className="shrink-0 text-[11px] rounded px-1.5 py-0.5 bg-amber-200/70 dark:bg-amber-900 text-amber-900 dark:text-amber-200">{it.status === 'running' ? 'under way' : 'over'}</span>
                    </div>
                    <span className="block text-xs text-amber-800 dark:text-amber-300 truncate">{when(it, today)}{it.place ? ` · ${it.place}` : ''}{it.repeat ? ' · repeats' : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => confirm(it)} disabled={busy !== null} className={primary}>{it.status === 'running' ? 'Started as planned' : 'Done as planned'}</button>
                    <Link href={`/entry/plan/${it.id}`} className={secondary}>Adjust</Link>
                    <button onClick={() => del(it)} disabled={busy !== null} className={secondary}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.open.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className={heading}>Open</h2>
            <ul className={card}>
              {data.open.map(it => row(it,
                <button onClick={() => endNow(it)} disabled={busy !== null} className={small}>End now</button>,
                `/records/${it.id}`, `since ${when(it, today).replace(/^(Today|Yesterday|Tomorrow)/, m => m.toLowerCase())}`))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className={heading}>Today</h2>
          {data.todayRecords.length > 0
            ? <ul className={card}>{data.todayRecords.map(it => row(it, null, `/records/${it.id}`, when(it, today, false)))}</ul>
            : <p className="text-sm text-stone-500 dark:text-zinc-400">Nothing yet today.</p>}
        </section>

        {data.comingUp.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className={heading}>Coming up</h2>
            <ul className={card}>{data.comingUp.map(it => row(it, it.repeat ? <span className="text-[11px] text-stone-400 dark:text-zinc-500 pt-0.5">repeats</span> : null, `/entry/plan/${it.id}`))}</ul>
          </section>
        )}
      </div>

      {toast && (
        <div role="status" className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-md rounded-lg bg-stone-800 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-3 text-sm flex items-center gap-3 shadow-lg">
          <span className="flex-1 min-w-0">{toast.text}</span>
          {toast.undo && <button onClick={undoToast} className="font-semibold underline">Undo</button>}
          <button onClick={() => setToast(null)} aria-label="Close" className="opacity-70">×</button>
        </div>
      )}
    </div>
  );
}

export default function EntryPage() {
  return <Suspense fallback={null}><EntryHome /></Suspense>;
}
