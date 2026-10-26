'use client';

// /admin — every master list with its row count, last change and sheet status (#67).
// ☆ / ★ pins a list to the gear menu (saved per user, so phone and desktop agree).

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ListSummary {
  slug: string;
  title: string;
  group: string;
  rows: number;
  lastChange: string | null;
  pendingSheet: number;
  pinned: boolean;
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

export default function AdminHome() {
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');
  const [pinError, setPinError] = useState('');

  // Ticks at once; puts it back if the server refuses.
  async function togglePin(slug: string, pinned: boolean) {
    setPinError('');
    const flip = (to: boolean) => setLists(ls => ls && ls.map(l => (l.slug === slug ? { ...l, pinned: to } : l)));
    flip(pinned);
    try {
      const r = await fetch('/api/admin/pins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, pinned }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`);
    } catch (e) {
      flip(!pinned);
      setPinError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    fetch('/api/admin/lists')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { setLists(d.lists); setPending(d.pendingSheet); })
      .catch(e => setError(String(e.message ?? e)));
  }, []);

  const groups = lists ? [...new Set(lists.map(l => l.group))] : [];

  return (
    <div className="flex flex-col flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
      <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100 mb-1">Master lists</h1>
      <p className="text-sm text-stone-500 dark:text-zinc-400 mb-6">
        The database holds these lists. Repeat every change in the sheet by hand until cutover.
      </p>

      {pending > 0 && (
        <div className="mb-6 px-4 py-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300 text-sm">
          {pending} change{pending === 1 ? '' : 's'} not yet repeated in the sheet. The migration will not run until each is ticked.
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          Could not load the lists: {error}
        </div>
      )}

      {pinError && (
        <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          Could not change the shortcut: {pinError}
        </div>
      )}

      {!lists && !error && <p className="text-sm text-stone-500 dark:text-zinc-400">Loading…</p>}

      {groups.map(g => (
        <section key={g} className="mb-6">
          <p className="text-xs text-stone-500 dark:text-zinc-400 uppercase tracking-widest mb-2">{g}</p>
          <div className="border border-stone-200 dark:border-zinc-700 rounded-lg overflow-hidden shadow-sm bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-xs text-stone-500 dark:text-zinc-400">
                  <th className="w-10" aria-label="Shortcut in the gear menu" title="Shortcut in the gear menu" />
                  <th className="text-left font-medium pr-4 py-2">List</th>
                  <th className="text-right font-medium px-4 py-2 w-20">Rows</th>
                  <th className="text-right font-medium px-4 py-2 w-32">Last change</th>
                  <th className="text-right font-medium px-4 py-2 w-28">Sheet</th>
                </tr>
              </thead>
              <tbody>
                {lists!.filter(l => l.group === g).map(l => (
                  <tr key={l.slug} className="border-b last:border-0 border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800/60">
                    <td className="pl-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => togglePin(l.slug, !l.pinned)}
                        aria-pressed={l.pinned}
                        aria-label={l.pinned ? `Unpin ${l.title} from the gear menu` : `Pin ${l.title} to the gear menu`}
                        title={l.pinned ? 'In the gear menu — tap to remove' : 'Add to the gear menu'}
                        className={`w-8 h-8 text-base leading-none rounded-md transition-colors ${
                          l.pinned
                            ? 'text-amber-500 dark:text-amber-400 hover:text-amber-600'
                            : 'text-stone-300 dark:text-zinc-600 hover:text-stone-500 dark:hover:text-zinc-400'
                        }`}
                      >
                        {l.pinned ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="pr-4 py-2">
                      <Link href={`/admin/${l.slug}`} className="text-stone-800 dark:text-zinc-100 hover:underline">{l.title}</Link>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-stone-600 dark:text-zinc-300">{l.rows.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-stone-500 dark:text-zinc-400">{fmtDate(l.lastChange)}</td>
                    <td className="px-4 py-2 text-right text-xs">
                      {l.pendingSheet > 0
                        ? <span className="text-amber-700 dark:text-amber-400">{l.pendingSheet} to repeat</span>
                        : <span className="text-stone-300 dark:text-zinc-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
