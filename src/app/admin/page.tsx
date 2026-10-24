'use client';

// /admin — every master list with its row count, last change and sheet status (#67).

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ListSummary {
  slug: string;
  title: string;
  group: string;
  rows: number;
  lastChange: string | null;
  pendingSheet: number;
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

export default function AdminHome() {
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState('');

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

      {!lists && !error && <p className="text-sm text-stone-500 dark:text-zinc-400">Loading…</p>}

      {groups.map(g => (
        <section key={g} className="mb-6">
          <p className="text-xs text-stone-500 dark:text-zinc-400 uppercase tracking-widest mb-2">{g}</p>
          <div className="border border-stone-200 dark:border-zinc-700 rounded-lg overflow-hidden shadow-sm bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-xs text-stone-500 dark:text-zinc-400">
                  <th className="text-left font-medium px-4 py-2">List</th>
                  <th className="text-right font-medium px-4 py-2 w-20">Rows</th>
                  <th className="text-right font-medium px-4 py-2 w-32">Last change</th>
                  <th className="text-right font-medium px-4 py-2 w-28">Sheet</th>
                </tr>
              </thead>
              <tbody>
                {lists!.filter(l => l.group === g).map(l => (
                  <tr key={l.slug} className="border-b last:border-0 border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800/60">
                    <td className="px-4 py-2">
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
