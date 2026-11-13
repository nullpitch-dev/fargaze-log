'use client';
// + New on the Calendar (Hyoje, 13 Nov): enter plans and records without leaving the Calendar.
// A split button: "+ New" opens the New form; ▾ opens Copy recent straight away (open plans
// first, then the latest of each activity + title + place; typing searches everything). No Stamp
// here (Hyoje, 13 Nov: stamps belong to Today). Whatever is opened from here comes back to the
// Calendar, at the same view and date, after saving (?back=).

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Row { id: string; activity: string; title: string; place: string; plan?: boolean; start: { date: string; hour: string } }

const btn = 'border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800 text-[11px] py-1';
const label = (r: Row) => [r.activity, r.title].filter(Boolean).join(' · ');

export function NewMenu({ compact }: { compact: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Placed under the button, kept on screen (on a phone the button can sit at the left edge).
  // No keyboard popping up on a phone until the search box is tapped.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null);
  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(288, window.innerWidth - 16);
    setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), width });
  };

  const back = () => `back=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  const goNew = (extra = '') => { setOpen(false); router.push(`/entry/new?${extra}${extra ? '&' : ''}${back()}`); };

  // Closes on a tap outside or Escape.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // A phone's keyboard opening resizes and scrolls the page: the menu follows, it doesn't
    // close (it closed at once on the phone, 13 Nov).
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  // Copy recent: the default list, or a search after a short pause.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/entry/recent?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
        const b = await r.json().catch(() => ({}));
        if (live) setRows(r.ok ? b.recent ?? [] : []);
      } catch { if (live) setRows([]); }
    }, q.trim() ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [open, q]);

  return (
    <div ref={box} className="relative flex">
      <button onClick={() => goNew()} className={`${btn} rounded-l px-2.5 font-medium`} title="New entry or plan">
        {compact ? '+' : '+ New'}
      </button>
      <button onClick={() => { place(); setOpen(o => !o); setQ(''); setRows(null); }} aria-expanded={open} aria-label="Copy recent" title="Copy recent"
        className={`${btn} rounded-r border-l-0 px-1.5`}>▾</button>
      {open && at && (
        <div style={{ position: 'fixed', top: at.top, left: at.left, width: at.width }} className="z-40 rounded-lg border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 shadow-lg p-2 flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400 px-1">Copy recent</p>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all records" autoFocus={!touch}
                className="w-full rounded border border-stone-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm text-stone-800 dark:text-zinc-100" />
              <ul className="max-h-72 overflow-y-auto">
                {rows === null && <li className="px-2 py-1.5 text-xs text-stone-500 dark:text-zinc-400">Loading…</li>}
                {rows?.length === 0 && <li className="px-2 py-1.5 text-xs text-stone-500 dark:text-zinc-400">Nothing matches.</li>}
                {rows?.map(r => (
                  <li key={r.id} className="border-t first:border-t-0 border-stone-200 dark:border-zinc-700">
                    <button onClick={() => goNew(`copy=${r.id}${r.plan ? '&from=plan' : ''}`)}
                      className="w-full text-left px-2 py-1.5 flex items-start gap-2 hover:bg-stone-50 dark:hover:bg-zinc-800">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-stone-800 dark:text-zinc-100 truncate">{label(r)}</span>
                        <span className="block text-xs text-stone-500 dark:text-zinc-400 truncate">{r.start.date} {r.start.hour}{r.place ? ` · ${r.place}` : ''}</span>
                      </span>
                      {r.plan && <span className="shrink-0 self-center text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400">Plan</span>}
                    </button>
                  </li>
                ))}
              </ul>
        </div>
      )}
    </div>
  );
}
