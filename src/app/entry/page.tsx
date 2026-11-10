'use client';

// /entry — the entry app's home and the site's landing page (#71 step 2, Design §15.7;
// layout by Hyoje, 9 Nov 2026).
//   Presets · + New · Copy recent · Stamp
//   Stamps       times saved with one tap (+ a short note), waiting to become records:
//                End now; a tap opens New with its times; long press → Edit note / Delete
//   Coming up    today's plans (and earlier ones) not started: Start now; a tap opens the plan
//   In progress  open records started today, and last night's 수면: End now
//   Done         records that ended today
//   Ongoing      open records started before today: End now (folded)
// Tomorrow onwards is on the Calendar. After a save or a delete, a toast with Undo.
// Long press (Hyoje, 10 Nov): on Start now → Done now (starts and ends now: paying a bill);
// on any title → Copy to new entry.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { localNow, zoneCodeFor, type ZoneRow } from '@/lib/entry/time';
import { DetailPanel, formatDuration, type LogEntry } from '@/app/_components/LogDetailPanel';
import { ActionSheet, useLongPress, type SheetAction } from './_components/LongPress';

interface Point { date: string; hour: string; timezone: string }
interface Item { id: string; activity: string; category: string; title: string; start: Point; end: Point; place: string; updatedAt: string; seconds?: number | null; repeat?: boolean; started?: boolean; plannedEnd?: { date: string; hour: string } | null }
interface Preset { id: string; name: string; order: number; time: { kind: 'open' | 'moment' | 'length'; minutes: number | null } }
interface Stamp { id: string; note: string; start: Point; end: Point; updatedAt: string }
interface Home { today: string; stamps: Stamp[]; comingUp: Item[]; inProgress: Item[]; done: Item[]; ongoing: Item[]; recent: Item[]; presets: Preset[] }
interface Toast { text: string; undo?: () => Promise<string | null> }

const btn = 'px-3 py-1.5 rounded text-sm border disabled:opacity-40 disabled:cursor-not-allowed';
const primary = `${btn} border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white`;
const secondary = `${btn} border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const small = 'px-2 py-1 rounded text-xs border border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-40';
const heading = 'text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400';
const card = 'bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg';

/** Presets are deferred (Hyoje, 10 Nov): Copy recent covers the need for now. */
const PRESETS_ON = false;

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
  const [pane, setPane] = useState<LogEntry | null>(null);
  const [menu, setMenu] = useState<{ title: string; actions: SheetAction[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const press = useLongPress();
  // The note being typed on a stamp (a new stamp opens it at once; Hyoje 10 Nov).
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  /** Done: a tap opens the record pane (Edit is in it), like the Calendar (Hyoje, 10 Nov). */
  async function openPane(id: string) {
    const r = await fetch(`/api/records/${id}?view=1`, { cache: 'no-store' });
    const b = await r.json().catch(() => ({}));
    if (r.ok && b.entry) setPane(b.entry); else setToast({ text: b.error ?? 'Could not open the record' });
  }
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

  const startNow = (it: Item) => act(`s${it.id}`, () => call(`/api/entry/plans/${it.id}/confirm`, 'POST', { updatedAt: it.updatedAt, how: 'now', now: nowPoint() }), { text: `${it.activity} started` });
  const doneNow = (it: Item) => act(`d${it.id}`, () => call(`/api/entry/plans/${it.id}/confirm`, 'POST', { updatedAt: it.updatedAt, how: 'nowDone', now: nowPoint() }), { text: `${it.activity} done` });
  // Stamps.
  async function stamp() {
    setBusy('stamp');
    try {
      const r = await call('/api/entry/stamps', 'POST', { start: nowPoint() });
      if (!r.ok) { setToast({ text: r.b.error ?? 'Stamp failed' }); return; }
      const s: Stamp = r.b.stamp;
      setData(d => d ? { ...d, stamps: [s, ...(d.stamps ?? [])] } : d);
      setNoteFor(s.id); setNoteText('');
      setToast({ text: `Stamped ${s.start.hour}`, undo: async () => { const x = await call(`/api/entry/stamps/${s.id}`, 'DELETE'); return x.ok ? null : x.b.error ?? 'Undo failed'; } });
    } finally { setBusy(null); }
  }
  async function saveNote(s: Stamp) {
    setNoteFor(null);
    const text = noteText.trim();
    if (text === s.note) return;
    setData(d => d ? { ...d, stamps: d.stamps.map(x => x.id === s.id ? { ...x, note: text } : x) } : d);
    const r = await call(`/api/entry/stamps/${s.id}`, 'PUT', { note: text });
    if (!r.ok) { setToast({ text: r.b.error ?? 'Could not save the note' }); await load(); }
  }
  const endStamp = (s: Stamp) => act(`e${s.id}`, () => call(`/api/entry/stamps/${s.id}`, 'PUT', { end: nowPoint() }), { text: 'Stamp ended' });
  const deleteStamp = (s: Stamp) => act(`x${s.id}`, () => call(`/api/entry/stamps/${s.id}`, 'DELETE'), b => ({
    text: 'Stamp deleted',
    undo: async () => { const x = await call('/api/entry/stamps', 'POST', { restore: b.stamp }); return x.ok ? null : x.b.error ?? 'Undo failed'; },
  }));

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
  const newHref = (extra: Record<string, string> = {}) => `/entry/new?${new URLSearchParams(extra)}`;
  const recent = copyQ.trim() ? (found ?? data.recent.filter(r => name(r).toLowerCase().includes(copyQ.trim().toLowerCase()))) : data.recent;

  // A long press on a title: Copy to new entry (a plan in Coming up copies from log_plan).
  const copyMenu = (it: Item, plan = false) => press(() => setMenu({ title: name(it), actions: [
    { label: 'Copy to new entry', hint: 'Same fields, starting today at its time', run: () => router.push(newHref({ copy: it.id, ...(plan ? { from: 'plan' } : {}) })) },
  ] }));
  // A long press on Start now: Done now, for things with no length.
  const startMenu = (it: Item) => press(() => setMenu({ title: name(it), actions: [
    { label: 'Done now', hint: 'Starts and ends now — for things with no length, like paying a bill', run: () => doneNow(it) },
    { label: 'Start now', hint: 'Starts now; End now later', run: () => startNow(it) },
  ] }));

  const row = (it: Item, right: React.ReactNode, href?: string | (() => void), sub?: string, plan = false) => (
    <li key={it.id} data-longpress="" className="flex items-start gap-3 px-3 py-2.5 border-t first:border-t-0 border-stone-100 dark:border-zinc-800 select-none [-webkit-touch-callout:none]">
      <div className="flex-1 min-w-0">
        {typeof href === 'function'
          ? <button type="button" onClick={href} {...copyMenu(it, plan)} className="block w-full text-left text-sm text-stone-800 dark:text-zinc-100 hover:underline truncate select-none">{name(it)}</button>
          : href
          ? <Link href={href} {...copyMenu(it, plan)} className="block text-sm text-stone-800 dark:text-zinc-100 hover:underline truncate select-none">{name(it)}</Link>
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
            {PRESETS_ON && data.presets.length > 0 && (
              <button onClick={() => setEditPresets(v => !v)} className="text-xs text-stone-500 dark:text-zinc-400 underline">{editPresets ? 'Done' : 'Edit presets'}</button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS_ON && data.presets.map((p, i) => editPresets ? (
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
            <button onClick={stamp} disabled={busy !== null} className={secondary} title="Save the time now; fill it in later">Stamp</button>
          </div>
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

        {data.stamps?.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className={heading}>Stamps</h2>
            <ul className={card}>
              {data.stamps.map(s => (
                <li key={s.id} data-longpress="" className="flex items-start gap-3 px-3 py-2.5 border-t first:border-t-0 border-stone-100 dark:border-zinc-800 select-none [-webkit-touch-callout:none]">
                  <div className="flex-1 min-w-0">
                    {noteFor === s.id ? (
                      <form onSubmit={e => { e.preventDefault(); saveNote(s); }}>
                        <input value={noteText} onChange={e => setNoteText(e.target.value)} onBlur={() => saveNote(s)} autoFocus maxLength={40}
                          placeholder="Note (optional): 보고, 역으로 …" aria-label="Stamp note"
                          className="w-full rounded border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1 text-sm text-stone-800 dark:text-zinc-100" />
                      </form>
                    ) : (
                      <Link href={`/entry/new?stamp=${s.id}`} {...press(() => setMenu({ title: s.note || `Stamp ${s.start.hour}`, actions: [
                          { label: 'Edit note', run: () => { setNoteFor(s.id); setNoteText(s.note); } },
                          { label: 'Delete', hint: 'The time is lost; Undo on the toast brings it back', run: () => deleteStamp(s) },
                        ] }))}
                        className={`block text-sm hover:underline truncate select-none ${s.note ? 'text-stone-800 dark:text-zinc-100' : 'italic text-stone-500 dark:text-zinc-400'}`}>{s.note || 'Stamp'}</Link>
                    )}
                    <span className="block text-xs text-stone-500 dark:text-zinc-400 truncate">{s.end.hour ? '' : 'since '}{when({ start: s.start, end: s.end } as Item, today).replace(/^(Today|Yesterday|Tomorrow)/, m => (s.end.hour ? m : m.toLowerCase()))}</span>
                  </div>
                  {!s.end.hour && <button onClick={() => endStamp(s)} disabled={busy !== null} className={small}>End now</button>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className={heading}>Coming up</h2>
          {data.comingUp.length > 0 ? (
            <ul className={card}>
              {data.comingUp.map(it => row(it,
                <button onClick={() => startNow(it)} {...startMenu(it)} disabled={busy !== null} className={`${small} select-none`}>Start now</button>,
                `/entry/plan/${it.id}`,
                `${when(it, today)}${it.repeat ? ' · repeats' : ''}`, true))}
            </ul>
          ) : <p className="text-sm text-stone-500 dark:text-zinc-400">Nothing planned for the rest of today.</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={heading}>In progress</h2>
          {data.inProgress.length > 0 ? (
            <ul className={card}>
              {data.inProgress.map(it => row(it,
                <button onClick={() => endNow(it)} disabled={busy !== null} className={small}>End now</button>,
                `/records/${it.id}`,
                `since ${when(it, today).replace(/^(Today|Yesterday|Tomorrow)/, m => m.toLowerCase())}${it.plannedEnd ? ` · planned until ${it.plannedEnd.hour}` : ''}`))}
            </ul>
          ) : <p className="text-sm text-stone-500 dark:text-zinc-400">Nothing running.</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className={heading}>Done</h2>
          {data.done.length > 0
            ? <ul className={card}>{data.done.map(it => row(it,
                it.seconds ? <span className="shrink-0 pt-0.5 text-xs tabular-nums text-stone-500 dark:text-zinc-400">{formatDuration(it.seconds)}</span> : null,
                () => openPane(it.id), when(it, today, it.start.date !== today)))}</ul>
            : <p className="text-sm text-stone-500 dark:text-zinc-400">Nothing finished yet today.</p>}
        </section>

        {data.ongoing.length > 0 && (
          <details className="group">
            <summary className={`${heading} cursor-pointer list-none flex items-center gap-1 select-none`}>
              <span className="inline-block transition-transform group-open:rotate-90">›</span> Ongoing <span className="normal-case tracking-normal font-normal">({data.ongoing.length})</span>
            </summary>
            <ul className={`${card} mt-2`}>
              {data.ongoing.map(it => row(it,
                <button onClick={() => endNow(it)} disabled={busy !== null} className={small}>End now</button>,
                `/records/${it.id}`, `since ${when(it, today)}`))}
            </ul>
          </details>
        )}
      </div>

      {pane && <DetailPanel entry={pane} onClose={() => setPane(null)} />}
      {menu && <ActionSheet title={menu.title} actions={menu.actions} onClose={closeMenu} />}

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
