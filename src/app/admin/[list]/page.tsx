'use client';

// /admin/<list> — one master list (#67): search, sort, how many records use each
// row, values used in records but missing from the list, add / edit / delete in
// place (step 2), and the changes made since a chosen date with their sheet ticks.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type ColumnType = 'text' | 'number' | 'zoneTime' | 'coords';
interface Column { key: string; label: string; type: ColumnType; required?: boolean; pickExisting?: boolean }
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
  list: { slug: string; title: string; group: string; note: string | null; columns: Column[]; recordsFollow: boolean; usageCounted: boolean; locked: string[]; fixedOnEdit: string[]; zoneCodes: string[] };
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

// ── Editing ──────────────────────────────────────────────────────────────────

type DraftCell = string | { timezone: string; local: string };
type Draft = Record<string, DraftCell>;

function toDraft(columns: Column[], row: Row | null): Draft {
  const d: Draft = {};
  for (const c of columns) {
    const v = row?.values[c.key] ?? null;
    if (c.type === 'zoneTime') d[c.key] = v && typeof v === 'object' && 'local' in v ? { timezone: v.timezone, local: v.local } : { timezone: '', local: '' };
    else if (c.type === 'coords') d[c.key] = v && typeof v === 'object' && 'lat' in v ? `${v.lat}, ${v.lng}` : '';
    else d[c.key] = v == null ? '' : String(v);
  }
  return d;
}

const rowLabel = (columns: Column[], row: Row) =>
  columns.filter(c => c.type === 'text').map(c => row.values[c.key]).filter(Boolean).join(' › ');

const input = 'w-full min-w-0 bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-2 py-1 text-sm text-stone-900 dark:text-zinc-50 focus:outline-none focus:border-stone-500 disabled:bg-stone-100 disabled:text-stone-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500';
const linkBtn = 'text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed';

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
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);   // id 'new' = adding
  const [rowError, setRowError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const startEdit = (row: Row | null) => {
    setRowError(''); setNotice('');
    setEditing({ id: row ? row._id : 'new', draft: toDraft(data!.list.columns, row) });
  };
  const setCell = (key: string, v: DraftCell) => setEditing(e => (e ? { ...e, draft: { ...e.draft, [key]: v } } : e));

  // Saves the row being edited; a new category (or group, label …) is confirmed first.
  async function save(confirmNew = false) {
    if (!editing) return;
    setSaving(true); setRowError('');
    try {
      const isNew = editing.id === 'new';
      const r = await fetch(`/api/admin/lists/${encodeURIComponent(slug)}${isNew ? '' : '/' + editing.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: editing.draft, confirmNew }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (b.needsConfirm && window.confirm(`Create a new ${String(b.needsConfirm.label).toLowerCase()} "${b.needsConfirm.value}"?`)) {
          setSaving(false);
          return save(true);
        }
        setRowError(b.needsConfirm ? 'Not saved.' : b.error ?? `HTTP ${r.status}`);
        return;
      }
      setEditing(null);
      setNotice(isNew ? 'Added. Repeat it in the sheet, then tick it below.' : 'Saved. Repeat it in the sheet, then tick it below.');
      setReload(n => n + 1);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    if (!data) return;
    const label = rowLabel(data.list.columns, row);
    const warn = data.list.usageCounted ? '' : '\n\nRecords are not counted for this list, so pages that use it (such as Journeys) will change.';
    if (!window.confirm(`Delete "${label}"?${warn}`)) return;
    setBusy(row._id); setRowError(''); setNotice('');
    try {
      const r = await fetch(`/api/admin/lists/${encodeURIComponent(slug)}/${row._id}`, { method: 'DELETE' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setRowError(b.error ?? `HTTP ${r.status}`); return; }
      setNotice('Deleted. Repeat it in the sheet, then tick it below.');
      setReload(n => n + 1);
    } finally {
      setBusy(null);
    }
  }

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

  // The row being added or edited, as input boxes in place.
  function editorRow(row: Row | null) {
    if (!editing || !data) return null;
    const used = row?.used ?? 0;
    const fixedHere = (key: string) => !!row && data.list.fixedOnEdit.includes(key);
    const lockedHere = (key: string) => fixedHere(key) || (!!row && used > 0 && data.list.locked.includes(key));
    return (
      <tr key={row?._id ?? 'new'} className="border-b border-stone-200 dark:border-zinc-700 bg-amber-50/60 dark:bg-zinc-800">
        {data.list.columns.map(c => {
          const v = editing.draft[c.key];
          const locked = lockedHere(c.key);
          const title = !locked ? undefined
            : fixedHere(c.key) ? 'Records refer to this by name; renaming comes later'
            : `${used.toLocaleString()} record${used === 1 ? '' : 's'} use this value; renaming comes later`;
          return (
            <td key={c.key} className="px-2 py-1.5 align-top">
              {c.type === 'zoneTime' ? (
                <div className="flex gap-1">
                  <input value={(v as any).timezone} onChange={e => setCell(c.key, { ...(v as any), timezone: e.target.value })}
                    list="dl-zones" placeholder="Zone" className={`${input.replace('w-full ', '')} w-16 flex-none`} disabled={locked} title={title} />
                  <input value={(v as any).local} onChange={e => setCell(c.key, { ...(v as any), local: e.target.value })}
                    placeholder="YYYY-MM-DD HH:mm" className={`${input} font-mono`} disabled={locked} title={title} />
                </div>
              ) : (
                <input
                  value={v as string}
                  onChange={e => setCell(c.key, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(null); }}
                  list={c.pickExisting ? `dl-${c.key}` : undefined}
                  inputMode={c.type === 'number' ? 'decimal' : undefined}
                  placeholder={c.type === 'coords' ? 'lat, lng' : c.required ? c.label : `${c.label} (optional)`}
                  className={`${input} ${c.type === 'number' ? 'text-right font-mono' : ''}`}
                  disabled={locked}
                  title={title}
                />
              )}
            </td>
          );
        })}
        {data.list.usageCounted && (
          <td className="px-3 py-1.5 text-right font-mono text-xs text-stone-500 dark:text-zinc-400 align-top pt-3">{row ? used.toLocaleString() : ''}</td>
        )}
        <td className="px-3 py-1.5 text-right whitespace-nowrap align-top pt-2.5 space-x-3">
          <button onClick={() => save()} disabled={saving} className="text-xs font-medium text-stone-900 dark:text-zinc-100 hover:underline disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setEditing(null); setRowError(''); }} disabled={saving} className={linkBtn}>Cancel</button>
        </td>
      </tr>
    );
  }

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
            <span className="text-xs text-stone-500 dark:text-zinc-400">{data.list.group} · {data.rows.length.toLocaleString()} row{data.rows.length === 1 ? '' : 's'}</span>
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
            <button
              onClick={() => startEdit(null)}
              disabled={!!editing}
              className="ml-auto px-3 py-2 bg-stone-800 dark:bg-zinc-700 text-white rounded-lg text-sm font-medium hover:bg-stone-900 dark:hover:bg-zinc-600 transition-colors disabled:opacity-40"
            >+ Add</button>
          </div>
          {editing && editing.id !== 'new' && (data.list.fixedOnEdit.length > 0 || ((data.rows.find(r => r._id === editing.id)?.used ?? 0) > 0 && data.list.locked.length > 0)) && (
            <p className="mb-2 text-xs text-stone-500 dark:text-zinc-400">
              Grey boxes can't change here: records refer to them. Renaming and merging come later.
            </p>
          )}
          {rowError && (
            <div className="mb-3 px-4 py-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">{rowError}</div>
          )}
          {notice && !rowError && (
            <div className="mb-3 px-4 py-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-300 text-sm">{notice}</div>
          )}
          {columns.filter(c => c.pickExisting).map(c => (
            <datalist key={c.key} id={`dl-${c.key}`}>
              {[...new Set(data.rows.map(r => r.values[c.key]).filter(v => typeof v === 'string'))].sort().map(v => <option key={String(v)} value={String(v)} />)}
            </datalist>
          ))}
          {data.list.zoneCodes.length > 0 && (
            <datalist id="dl-zones">{data.list.zoneCodes.map(z => <option key={z} value={z} />)}</datalist>
          )}

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
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {editing?.id === 'new' && editorRow(null)}
                {rows.map(r => editing?.id === r._id ? editorRow(r) : (
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
                    <td className="px-3 py-1.5 text-right whitespace-nowrap space-x-3">
                      <button onClick={() => startEdit(r)} disabled={!!editing} className={linkBtn}>Edit</button>
                      <button
                        onClick={() => remove(r)}
                        disabled={!!editing || busy === r._id || !!r.used}
                        title={r.used ? `${r.used.toLocaleString()} record${r.used === 1 ? '' : 's'} use this row` : undefined}
                        className={linkBtn}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && editing?.id !== 'new' && (
                  <tr><td colSpan={columns.length + 2} className="px-3 py-4 text-center text-sm text-stone-500 dark:text-zinc-400">No rows.</td></tr>
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
