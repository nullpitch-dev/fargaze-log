'use client';

// /admin/calendar-settings (Hyoje, 26 Nov 2026): the Calendar settings that left its filter
// panel — the hidden activities (exact names, never shown anywhere in the Calendar, records
// and plans alike, search included) and the category colours. Saved with the Calendar's own
// settings (/api/calendar/settings), so the phone and the desktop agree.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { colorFor, colorKeyFor, PALETTE } from '@/app/calendar/_lib/calendar-colors';

const card = 'border border-stone-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 shadow-sm p-4 flex flex-col gap-3';
const note = 'text-xs text-stone-500 dark:text-zinc-400';

export default function CalendarSettingsPage() {
  const [names, setNames] = useState<string[] | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    fetch('/api/calendar/settings').then(r => r.json()).then(s => {
      if (s?.error) throw new Error(s.error);
      setNames(s.hiddenNames ?? []); setColors(s.colors ?? {});
    }).catch(e => setError(String(e.message ?? e)));
    fetch('/api/calendar/options').then(r => r.json()).then(o => setCategories(o.categories ?? [])).catch(() => {});
  }, []);

  async function save(patch: { hiddenNames?: string[]; colors?: Record<string, string> }, done: string) {
    setError(''); setSaved('');
    try {
      const r = await fetch('/api/calendar/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
      setNames(b.hiddenNames ?? []); setColors(b.colors ?? {}); setSaved(done);
    } catch (e: any) { setError(`Not saved: ${e.message ?? e}`); }
  }

  return (
    <div className="flex flex-col flex-1 px-4 py-8 max-w-3xl mx-auto w-full gap-6">
      <div>
        <Link href="/admin" className="text-sm text-stone-500 dark:text-zinc-400 hover:underline">← Master lists</Link>
        <h1 className="mt-2 text-lg font-semibold text-stone-800 dark:text-zinc-100">Calendar settings</h1>
        <p className={note}>The Calendar&apos;s own Hide list (categories and activities, records or plans) is in its filter panel.</p>
      </div>
      {error && <p className="px-3 py-2 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && <p className="text-sm text-stone-500 dark:text-zinc-400" role="status">{saved}</p>}

      <section className={card}>
        <div>
          <h2 className="text-sm font-semibold text-stone-800 dark:text-zinc-100">Hidden activities</h2>
          <p className={note}>Never shown in the Calendar — records and plans, every view, search too. The exact activity name. Today is not affected.</p>
        </div>
        {names === null ? <p className={note}>Loading…</p>
          : <HiddenNames names={names} onChange={next => save({ hiddenNames: next }, 'Hidden activities saved.')} />}
      </section>

      <section className={card}>
        <div>
          <h2 className="text-sm font-semibold text-stone-800 dark:text-zinc-100">Category colours</h2>
          <p className={note}>How each category is drawn in the Calendar.</p>
        </div>
        <div className="flex flex-col">
          {categories.map(c => (
            <ColourRow key={c.name} name={c.name} count={c.count} colors={colors}
              onPick={key => {
                const next = { ...colors };
                if (key) next[c.name] = key; else delete next[c.name];
                setColors(next);
                void save({ colors: next }, `Colour of ${c.name} saved.`);
              }} />
          ))}
          {!categories.length && <p className={note}>Loading…</p>}
        </div>
      </section>
    </div>
  );
}

function ColourRow({ name, count, colors, onPick }: { name: string; count: number; colors: Record<string, string>; onPick: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const current = colorKeyFor(name, colors);
  return (
    <div ref={ref} className="relative flex items-center gap-3 py-1.5 border-t first:border-t-0 border-stone-100 dark:border-zinc-800 text-sm">
      <button onClick={() => setOpen(o => !o)} aria-label={`Colour for ${name}`}
        className="w-5 h-5 rounded-full border border-black/10 shrink-0" style={{ background: colorFor(name, colors) }} />
      <span className="flex-1 min-w-0 truncate text-stone-700 dark:text-zinc-200">{name}</span>
      {name in colors && <span className="text-[10px] text-stone-400 dark:text-zinc-500">custom</span>}
      <span className="tabular-nums text-xs text-stone-400 dark:text-zinc-500">{count.toLocaleString()}</span>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-0.5 w-[196px] p-2 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg">
          <div className="grid grid-cols-7 gap-1.5">
            {PALETTE.map(p => (
              <button key={p.key} onClick={() => { onPick(p.key); setOpen(false); }} title={p.label} aria-label={p.label}
                className="w-5 h-5 rounded-full flex items-center justify-center hover:scale-110 transition-transform" style={{ background: p.hex }}>
                {p.key === current && <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" stroke="#fff" strokeWidth="1.8" fill="none" /></svg>}
              </button>
            ))}
          </div>
          <button onClick={() => { onPick(null); setOpen(false); }} disabled={!(name in colors)}
            className="mt-2 w-full text-left text-[11px] text-blue-600 dark:text-blue-400 hover:underline disabled:text-stone-300 dark:disabled:text-zinc-600 disabled:no-underline">
            Default colour
          </button>
        </div>
      )}
    </div>
  );
}

/** Activity names that never show (e.g. 정식 운동). Exact match. */
function HiddenNames({ names, onChange }: { names: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !names.includes(v)) onChange([...names, v]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-2">
      {names.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {names.map(nm => (
            <span key={nm} className="inline-flex items-center gap-1 rounded bg-stone-100 dark:bg-zinc-800 px-2 py-0.5 text-sm text-stone-700 dark:text-zinc-200">
              {nm}
              <button onClick={() => onChange(names.filter(x => x !== nm))} aria-label={`Show ${nm} again`}
                className="text-stone-400 hover:text-stone-800 dark:hover:text-zinc-100 leading-none px-0.5">×</button>
            </span>
          ))}
        </div>
      ) : <p className={note}>None.</p>}
      <div className="flex gap-2 max-w-sm">
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Activity name"
          className="flex-1 min-w-0 border border-stone-300 dark:border-zinc-600 rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200" />
        <button onClick={add} disabled={!draft.trim()}
          className="border border-stone-300 dark:border-zinc-600 rounded px-3 text-sm text-stone-700 dark:text-zinc-200 disabled:opacity-40">Hide</button>
      </div>
    </div>
  );
}
