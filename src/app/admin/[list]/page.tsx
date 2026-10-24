'use client';

// /admin/<list> — one master list, read-only for now (#67 step 1):
// search, sort, how many records use each row, values used in records but missing
// from the list, and the changes made since a chosen date.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type ColumnType = 'text' | 'number' | 'zoneTime' | 'coords';
interface Column { key: string; label: string; type: ColumnType; required?: boolean }
type Cell = string | number | null | { timezone: string; local: string } | { lat: number; lng: number };
interface Row { _id: string; values: Record<string, Cell>; updatedAt: string | null; used: number | null }
interface Orphan { values: Record<string, string>; records: number }
interface Change {
  _id: string;
  kind: 'add' | 'edit' | 'delete' | 'rename' | 'merge';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  recordsChanged: number;
  sheetSteps: string[];
  sheetDone: boolean;
  undoneAt: string | null;
  createdAt: string;
}
interface ListResponse {
  list: { slug: string; title: string; group: string; note: string | null; columns: Column[]; recordsFollow: boolean; usageCounted: boolean };
  rows: Row[];
  orphans: Orphan[];
  since: string;
  changes: Change[];
}

// ── Formatting ───────────────────────────────────────────────────────────────

function cellText(c: Cell, type: ColumnType): string {
  if (c === null || c === undefined || c === '') return '';
  if (type === 'zoneTime' && typeof c === 'object' && 'local' in c) return `${c.local} ${c.timezone}`;
  if (type === 'coords' && typeof c === 'object' && 'lat' in c) return `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
  if (type === 'number' && typeof c === 'number') return c.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return String(c);
}

function sortValue(c: Cell, type: ColumnType): string | number {
  if (c === null || c === undefined) return type === 'number' ? -Infinity : '';
  if (type === 'number' && typeof c === 'number') return c;
  return cellText(c, type);
}

// A row's values joined in the list's column order (category before activity),
// with any other keys (e.g. bowel's field) after them.
function valuesText(v: Record<string, unknown> | null, columns: Column[]): string {
  if (!v) return '';
  const keys = [...columns.map(c => c.key).filter(k => k in v), ...Object.keys(v).filter(k => !columns.some(c => c.key === k))];
  return keys
    .map(k => v[k])
    .filter(x => x !== null && x !== undefined && x !== '')
    .map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x)))
    .join(' › ');
}

const KIND_LABEL: Record<Change['kind'], string> = { add: 'Added', edit: 'Edited', delete: 'Deleted', rename: 'Renamed', merge: 'Merged' };

const monthAgo = () => new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminListPage() {
  const { list: slug } = useParams<{ list: string }>();
  const [since, setSince] = useState(monthAgo);
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  // Ticks (or unticks) a change as repeated in the sheet, then reloads the list.
  async function setSheetDone(id: string, sheetDone: boolean) {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/changes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetDone }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
      setReload(n => n + 1);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    setError('');
    fetch(`/api/admin/lists/${encodeURIComponent(slug)}?since=${since}`)
      .then(r => (r.ok ? r.json() : r.json().then(b => Promise.reject(new Error(b.error ?? `HTTP ${r.status}`)))))
      .then(setData)
      .catch(e => setError(String(e.message ?? e)));
  }, [slug, since, reload]);

  const columns = data?.list.columns ?? [];

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let out = q
      ? data.rows.filter(r => columns.some(c => cellText(r.values[c.key], c.type).toLowerCase().includes(q)))
      : data.rows;
    if (sort) {
      const col = columns.find(c => c.key === sort.key);
      out = [...out].sort((a, b) => {
        const va = sort.key === '__used' ? a.used ?? -1 : sortValue(a.values[sort.key], col?.type ?? 'text');
        const vb = sort.key === '__used' ? b.used ?? -1 : sortValue(b.values[sort.key], col?.type ?? 'text');
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ko');
        return cmp * sort.dir;
      });
    }
    return out;
  }, [data, query, sort, columns]);

  const clickSort = (key: string) =>
    setSort(s => (s?.key === key ? (s.dir === 1 ? { key, dir: -1 } : null) : { key, dir: 1 }));
  const arrow = (key: string) => (sort?.key === key ? (sort.dir === 1 ? '▲' : '▼') : '');

  const th = 'text-left font-medium px-3 py-2 cursor-pointer select-none whitespace-nowrap hover:text-stone-800 dark:hover:text-zinc-100';

  return (
    <div className="flex flex-col flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
      <Link href="/admin" className="text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100 mb-3">← Master lists</Link>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          Could not load this list: {error}
        </div>
      )}
      {!data && !error && <p className="text-sm text-stone-500 dark:text-zinc-400">Loading…</p>}

      {data && (
        <>
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">{data.list.title}</h1>
            <span className="text-xs text-stone-500 dark:text-zinc-400">{data.list.group} · {data.rows.length.toLocaleString()} rows</span>
          </div>
          {data.list.note && <p className="text-sm text-stone-500 dark:text-zinc-400 mb-1">{data.list.note}</p>}
          {data.list.recordsFollow && (
            <p className="text-xs text-stone-500 dark:text-zinc-400 mb-1">Renaming, merging or moving a row here will change past records too.</p>
          )}

          {data.orphans.length > 0 && (
            <div className="mt-4 px-4 py-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
              <p className="text-amber-800 dark:text-amber-300 mb-2">
                {data.orphans.length} value{data.orphans.length === 1 ? '' : 's'} used in records but missing from this list. The migration will refuse these records.
              </p>
              <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
                {data.orphans.slice(0, 30).map((o, i) => (
                  <li key={i}>{valuesText(o.values, columns)} <span className="text-amber-700 dark:text-amber-400">— {o.records.toLocaleString()} record{o.records === 1 ? '' : 's'}</span></li>
                ))}
                {data.orphans.length > 30 && <li>… and {data.orphans.length - 30} more</li>}
              </ul>
            </div>
          )}

          <div className="mt-5 mb-3 flex gap-3 items-center">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              className="flex-1 max-w-sm bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded-lg px-3 py-2 text-stone-900 dark:text-zinc-50 placeholder-stone-400 focus:outline-none focus:border-stone-400 text-sm shadow-sm"
            />
            {query && <span className="text-xs text-stone-500 dark:text-zinc-400">{rows.length} of {data.rows.length}</span>}
          </div>

          <div className="border border-stone-200 dark:border-zinc-700 rounded-lg overflow-x-auto shadow-sm bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-xs text-stone-500 dark:text-zinc-400">
                  {columns.map(c => (
                    <th key={c.key} onClick={() => clickSort(c.key)} className={`${th} ${c.type === 'number' ? 'text-right' : ''}`}>
                      {c.label} <span className="text-[8px]">{arrow(c.key)}</span>
                    </th>
                  ))}
                  {data.list.usageCounted && (
                    <th onClick={() => clickSort('__used')} className={`${th} text-right w-24`}>
                      Records <span className="text-[8px]">{arrow('__used')}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._id} className="border-b last:border-0 border-stone-100 dark:border-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-800/60">
                    {columns.map(c => (
                      <td key={c.key} className={`px-3 py-1.5 ${c.type === 'number' || c.type === 'coords' ? 'font-mono text-xs' : ''} ${c.type === 'number' ? 'text-right' : ''} text-stone-800 dark:text-zinc-100`}>
                        {cellText(r.values[c.key], c.type) || <span className="text-stone-300 dark:text-zinc-600">—</span>}
                      </td>
                    ))}
                    {data.list.usageCounted && (
                      <td className={`px-3 py-1.5 text-right font-mono text-xs ${r.used ? 'text-stone-600 dark:text-zinc-300' : 'text-stone-300 dark:text-zinc-600'}`}>
                        {(r.used ?? 0).toLocaleString()}
                      </td>
                    )}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} className="px-3 py-4 text-center text-sm text-stone-500 dark:text-zinc-400">No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!data.list.usageCounted && (
            <p className="mt-2 text-xs text-stone-500 dark:text-zinc-400">Records are not counted for this list.</p>
          )}

          <section className="mt-8">
            <div className="flex items-center gap-3 mb-2">
              <p className="text-xs text-stone-500 dark:text-zinc-400 uppercase tracking-widest">Changes since</p>
              <input
                type="date"
                value={since}
                onChange={e => e.target.value && setSince(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-2 py-1 text-stone-800 dark:text-zinc-100 text-xs focus:outline-none focus:border-stone-400"
              />
            </div>
            {data.changes.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-zinc-400">No changes since {data.since}.</p>
            ) : (
              <div className="border border-stone-200 dark:border-zinc-700 rounded-lg overflow-x-auto shadow-sm bg-white dark:bg-zinc-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 text-xs text-stone-500 dark:text-zinc-400">
                      <th className="text-left font-medium px-3 py-2 w-28">Date</th>
                      <th className="text-left font-medium px-3 py-2 w-24">Change</th>
                      <th className="text-left font-medium px-3 py-2">What</th>
                      <th className="text-right font-medium px-3 py-2 w-20">Records</th>
                      <th className="text-right font-medium px-3 py-2 w-36">Sheet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.changes.map(ch => (
                      <tr key={ch._id} className="border-b last:border-0 border-stone-100 dark:border-zinc-800 align-top">
                        <td className="px-3 py-1.5 font-mono text-xs text-stone-500 dark:text-zinc-400">{ch.createdAt.slice(0, 10)}</td>
                        <td className="px-3 py-1.5 text-xs text-stone-700 dark:text-zinc-200">
                          {KIND_LABEL[ch.kind]}{ch.undoneAt && <span className="text-stone-400 dark:text-zinc-500"> (undone)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-stone-800 dark:text-zinc-100">
                          {ch.before && <span className={ch.after ? 'text-stone-500 dark:text-zinc-400' : ''}>{valuesText(ch.before, columns)}</span>}
                          {ch.before && ch.after && <span className="text-stone-400 dark:text-zinc-500"> → </span>}
                          {ch.after && <span>{valuesText(ch.after, columns)}</span>}
                          {!ch.sheetDone && ch.sheetSteps.length > 0 && (
                            <ul className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                              {ch.sheetSteps.map((st, i) => <li key={i}>{st}</li>)}
                            </ul>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-stone-600 dark:text-zinc-300">{ch.recordsChanged ? ch.recordsChanged.toLocaleString() : '—'}</td>
                        <td className="px-3 py-1.5 text-right text-xs">
                          {ch.sheetDone ? (
                            <span className="text-stone-500 dark:text-zinc-400 whitespace-nowrap">
                              ✓ repeated{' '}
                              <button
                                onClick={() => setSheetDone(ch._id, false)}
                                disabled={busy === ch._id}
                                title="Mark as not yet repeated in the sheet"
                                className="text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 underline disabled:opacity-40"
                              >undo</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setSheetDone(ch._id, true)}
                              disabled={busy === ch._id}
                              className="whitespace-nowrap px-2 py-1 rounded border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-40"
                            >Mark repeated</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
