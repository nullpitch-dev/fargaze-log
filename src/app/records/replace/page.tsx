'use client';

// /records/replace — Find & replace in records (#70 step 4, Design §15.6.3; agreed with
// Hyoje 7–8 Nov). Pick a field, what to find and what to put; optionally only some
// records (a date range, an activity). Preview lists the records (date · activity ·
// before → after) and the sheet steps; Confirm writes one change-list entry; the Saved
// screen has Mark repeated and Undo, as on the edit page. A preview row opens the record
// pane (8 Nov: going to the edit page lost the preview), with its Edit link.
// API: GET /api/records/replace (fields; ?field=&q= used values), POST …/preview, POST.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChangeTable, type Line } from '../_components/ChangeTable';
import { StepList } from '@/app/_components/SheetSteps';
import { DetailPanel, type LogEntry } from '@/app/_components/LogDetailPanel';

type Mode = 'whole' | 'part';
interface Field { key: string; label: string; column: string; modes: Mode[]; item: boolean }
interface Row { id: string; day: string; activity: string; tab: string; findRow: string; before: string; after: string; count: number; skipped: number }
interface Preview {
  title: string; problems: string[]; records: number; places: number; skipped: number;
  byTab: { tab: string; n: number }[]; rows: Row[]; more: number;
  steps: string[]; lines: (Line & { tab: string; findRow: string })[];
}
interface Saved { changeId: string; records: number; places: number; preview: Preview; sheetDone: boolean; undone: string }

const GROUPS: [string, string[]][] = [
  ['Text', ['title', 'additionalInfo', 'online', 'other']],
  ['Items', ['purchaseItem', 'purchaseUnit', 'foodItem', 'drinkItem']],
  ['Notes', ['foodNote', 'drinkNote', 'alcoholNote']],
  ['People', ['person']],
];

const input = 'w-full bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-2 text-sm text-stone-800 dark:text-zinc-100 focus:outline-none focus:border-stone-500';
const label = 'block text-xs font-medium text-stone-500 dark:text-zinc-400 mb-1';
const btn = 'px-3 py-1.5 rounded text-sm border disabled:opacity-40 disabled:cursor-not-allowed';
const primary = 'px-4 py-2 rounded-lg text-sm font-medium bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 hover:bg-stone-900 dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = `${btn} border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const tickBtn = `${btn} border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900`;
const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, w: string) => `${n(x)} ${w}${x === 1 ? '' : 's'}`;

/** `text` with every `part` marked (red for the old text, green for the new). */
function Marked({ text, part, tone }: { text: string; part: string; tone: 'old' | 'new' }) {
  if (!text) return <span className="text-stone-300 dark:text-zinc-600">(empty)</span>;
  if (!part || !text.includes(part)) return <>{text}</>;
  const cls = tone === 'old'
    ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 line-through decoration-red-400/60 rounded-sm px-0.5'
    : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-sm px-0.5';
  const bits = text.split(part);
  return <>{bits.map((b, i) => <span key={i}>{b}{i < bits.length - 1 && <mark className={cls}>{part}</mark>}</span>)}</>;
}

/** A filtered replace has a tab and row on each line: one table per record. */
function byRecord(lines: Preview['lines']) {
  const out: { tab: string; findRow: string; lines: Line[] }[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.tab === l.tab && last.findRow === l.findRow) last.lines.push(l);
    else out.push({ tab: l.tab, findRow: l.findRow, lines: [l] });
  }
  return out;
}

function SheetPart({ p, open }: { p: Preview; open: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400">Then in the sheet</summary>
      <div className="mt-3 flex flex-col gap-3">
        {p.steps.length > 0 && <StepList steps={p.steps} className="text-sm text-stone-700 dark:text-zinc-200 space-y-1" />}
        {p.lines.length > 0 && (
          <>
            <p className="text-sm text-stone-600 dark:text-zinc-300">With a filter, Sheets can’t Find &amp; Replace only these rows: change each record’s cell by hand.</p>
            {byRecord(p.lines).map((r, i) => <ChangeTable key={i} tab={r.tab} findRow={r.findRow} lines={r.lines} />)}
          </>
        )}
      </div>
    </details>
  );
}

export default function FindReplacePage() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [error, setError] = useState('');

  const [field, setField] = useState('title');
  const [mode, setMode] = useState<Mode>('whole');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activity, setActivity] = useState('');

  const [suggest, setSuggest] = useState<{ value: string; records: number }[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  /** The record pane for a preview row; the preview stays as it is underneath. */
  async function openRecord(id: string) {
    setOpening(id); setFail('');
    try {
      const r = await fetch(`/api/records/${id}?view=1`);
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
      setEntry(b.entry);
    } catch (e: any) { setFail(String(e.message ?? e)); } finally { setOpening(null); }
  }

  useEffect(() => {
    fetch('/api/records/replace').then(r => r.json()).then(b => setFields(b.fields)).catch(e => setError(String(e.message ?? e)));
    fetch('/api/records/options').then(r => r.json()).then(b => setActivities((b.activities ?? []).map((a: any) => a.name))).catch(() => {});
  }, []);

  const f = fields?.find(x => x.key === field);
  // A field that can't take part of the text goes back to whole.
  useEffect(() => { if (f && !f.modes.includes(mode)) setMode('whole'); }, [f, mode]);

  // Any change to the request makes the preview stale.
  const req = useMemo(() => ({ field, mode, from, to, dateFrom: dateFrom || null, dateTo: dateTo || null, activity: activity.trim() || null }), [field, mode, from, to, dateFrom, dateTo, activity]);
  useEffect(() => { setPreview(null); setFail(''); }, [req]);

  // Find suggestions: values already used, most used first (250 ms after typing).
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    const tm = setTimeout(() => {
      fetch(`/api/records/replace?field=${encodeURIComponent(field)}&q=${encodeURIComponent(from.trim())}`)
        .then(r => r.json()).then(b => { if (my === seq.current) setSuggest(b.values ?? []); }).catch(() => {});
    }, 250);
    return () => clearTimeout(tm);
  }, [field, from]);

  async function doPreview() {
    setBusy(true); setFail('');
    try {
      const r = await fetch('/api/records/replace/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
      setPreview(b);
    } catch (e: any) { setFail(String(e.message ?? e)); } finally { setBusy(false); }
  }

  async function doApply() {
    if (!preview) return;
    setBusy(true); setFail('');
    try {
      const r = await fetch('/api/records/replace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...req, expectPlaces: preview.places }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error([b.error ?? `HTTP ${r.status}`, ...(b.problems ?? [])].join(' '));
      setSaved({ changeId: b.changeId, records: b.records, places: b.places, preview, sheetDone: false, undone: '' });
      window.scrollTo({ top: 0 });
    } catch (e: any) { setFail(String(e.message ?? e)); } finally { setBusy(false); }
  }

  async function tick(done: boolean) {
    if (!saved) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/changes/${saved.changeId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheetDone: done }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setFail(b.error ?? `HTTP ${r.status}`); else setSaved({ ...saved, sheetDone: done });
    } finally { setBusy(false); }
  }

  async function undo() {
    if (!saved || !window.confirm(`Undo this Find & replace? ${plural(saved.records, 'record')} go back.`)) return;
    setBusy(true); setFail('');
    try {
      const r = await fetch(`/api/admin/changes/${saved.changeId}/undo`, { method: 'POST' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setFail(b.error ?? `HTTP ${r.status}`);
      else setSaved({ ...saved, undone: b.sheetNeeded ? 'Undone. You had repeated it in the sheet, so the undo is waiting in Record changes: repeat it there too.' : 'Undone. Nothing to do in the sheet: it had not been repeated there.' });
    } finally { setBusy(false); }
  }

  function again() { setSaved(null); setPreview(null); setFrom(''); setTo(''); }

  const filtered = !!(dateFrom || dateTo || activity.trim());
  const blocked = !preview || preview.problems.length > 0 || preview.records === 0;

  // ── Saved screen ──
  if (saved) {
    const p = saved.preview;
    return (
      <div className="flex flex-col flex-1 px-4 py-6 max-w-3xl mx-auto w-full gap-4">
        <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">Find &amp; replace</h1>
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
          {saved.undone || <>Saved: {p.title}. {plural(saved.records, 'record')} changed ({plural(saved.places, 'place')}). Now repeat it in the sheet, then press Mark repeated.</>}
        </div>
        {fail && <p className="text-sm text-red-700 dark:text-red-300">{fail}</p>}
        {!saved.undone && <SheetPart p={p} open />}
        <div className="flex flex-wrap items-center gap-2">
          {!saved.undone && (saved.sheetDone ? (
            <span className="text-sm text-stone-600 dark:text-zinc-300">✓ Repeated in the sheet{' '}
              <button onClick={() => tick(false)} disabled={busy} className="text-xs underline text-stone-400 hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-200">untick</button>
            </span>
          ) : <button onClick={() => tick(true)} disabled={busy} className={tickBtn}>Mark repeated</button>)}
          {!saved.undone && <button onClick={undo} disabled={busy} className={secondary}>Undo</button>}
          <button onClick={again} className={secondary}>Another Find &amp; replace</button>
          <Link href="/records/changes" className={secondary}>Record changes</Link>
        </div>
      </div>
    );
  }

  // ── Form and preview ──
  return (
    <div className="flex flex-col flex-1 px-4 py-6 max-w-3xl mx-auto w-full gap-4 pb-28">
      <div>
        <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">Find &amp; replace</h1>
        <p className="text-sm text-stone-600 dark:text-zinc-300 mt-1">
          Change a text in many records at once. Names in master lists are changed on their own page; place names on Place points.
        </p>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!fields && !error && <p className="text-sm text-stone-500 dark:text-zinc-400">Loading…</p>}

      {fields && (
        <div className="flex flex-col gap-3 rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="fr-field">Field</label>
              <select id="fr-field" value={field} onChange={e => setField(e.target.value)} className={input}>
                {GROUPS.map(([g, keys]) => (
                  <optgroup key={g} label={g}>
                    {keys.map(k => fields.find(x => x.key === k)).filter(Boolean).map(x => <option key={x!.key} value={x!.key}>{x!.label} ({x!.column})</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            {f && f.modes.length > 1 && (
              <div>
                <span className={label}>Match</span>
                <div className="flex gap-1" role="radiogroup">
                  {(['whole', 'part'] as Mode[]).map(m => (
                    <button
                      key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                      className={`flex-1 h-9 rounded text-sm ${mode === m ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-semibold' : 'border border-stone-300 dark:border-zinc-600 text-stone-700 dark:text-zinc-200 hover:bg-stone-50 dark:hover:bg-zinc-800'}`}
                    >{m === 'whole' ? (f.item ? 'Whole item' : 'Whole value') : 'Part of the text'}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <label className={label} htmlFor="fr-from">Find</label>
              <input
                id="fr-from" value={from} autoComplete="off"
                onChange={e => { setFrom(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)} onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                placeholder={mode === 'part' ? 'Part of the text' : f?.item ? 'The whole item' : 'The whole value'}
                className={input}
              />
              {showSuggest && suggest.length > 0 && (
                <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto rounded border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg text-sm">
                  {suggest.map(s => (
                    <li key={s.value}>
                      <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setFrom(s.value); setShowSuggest(false); }}
                        className="w-full flex justify-between gap-3 px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-zinc-800">
                        <span className="text-stone-800 dark:text-zinc-100 break-all">{s.value}</span>
                        <span className="font-mono text-xs text-stone-400 dark:text-zinc-500">{n(s.records)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className={label} htmlFor="fr-to">Replace with</label>
              <input id="fr-to" value={to} autoComplete="off" onChange={e => setTo(e.target.value)} className={input} />
            </div>
          </div>

          <details open={filtered}>
            <summary className="cursor-pointer text-sm text-stone-600 dark:text-zinc-300">Only some records{filtered ? ' (filtered)' : ''}</summary>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              <div>
                <label className={label} htmlFor="fr-df">From date</label>
                <input id="fr-df" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label} htmlFor="fr-dt">To date</label>
                <input id="fr-dt" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={input} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={label} htmlFor="fr-act">Activity</label>
                <input id="fr-act" list="fr-acts" value={activity} onChange={e => setActivity(e.target.value)} placeholder="Any" className={input} />
                <datalist id="fr-acts">{activities.map(a => <option key={a} value={a} />)}</datalist>
              </div>
            </div>
          </details>

          <div className="flex items-center gap-3">
            <button onClick={doPreview} disabled={busy || !from.trim()} className={primary}>{busy && !preview ? 'Checking…' : 'Preview'}</button>
            {fail && <p className="text-sm text-red-700 dark:text-red-300">{fail}</p>}
          </div>
        </div>
      )}

      {preview && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium text-stone-900 dark:text-zinc-50 break-words">{preview.title}</p>
            <p className="text-sm text-stone-700 dark:text-zinc-200 mt-1">
              {plural(preview.records, 'record')}, {plural(preview.places, 'place')}
              {preview.skipped > 0 && <> · {n(preview.skipped)} already say it (skipped)</>}
              {preview.byTab.length > 0 && <span className="text-stone-500 dark:text-zinc-400"> · {preview.byTab.map(t => `${n(t.n)} in ${t.tab}`).join(', ')}</span>}
            </p>
          </div>
          {preview.problems.length > 0 && (
            <ul className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-2 text-sm text-red-700 dark:text-red-300 list-disc pl-8">
              {preview.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <div className="rounded-lg border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm divide-y divide-stone-100 dark:divide-zinc-800">
              {preview.rows.map(r => (
                <button key={r.id} type="button" onClick={() => openRecord(r.id)} disabled={opening === r.id} className="block w-full text-left px-4 py-2 hover:bg-stone-50 dark:hover:bg-zinc-800/60 disabled:opacity-60">
                  <div className="flex flex-wrap gap-x-2 text-xs text-stone-500 dark:text-zinc-400">
                    <span className="font-mono">{r.day}</span><span className="break-words">{r.activity}</span>
                    {r.count > 1 && <span>· {r.count} places</span>}
                    {r.count === 0 && <span>· already says it</span>}
                  </div>
                  <div className="text-sm text-stone-800 dark:text-zinc-100 break-words mt-0.5">
                    <Marked text={r.before} part={from} tone="old" />
                    <span className="mx-1.5 text-stone-400">→</span>
                    <Marked text={r.after} part={to} tone="new" />
                  </div>
                </button>
              ))}
              {preview.more > 0 && <p className="px-4 py-2 text-xs text-stone-500 dark:text-zinc-400">and {n(preview.more)} more</p>}
            </div>
          )}
          {!blocked && <SheetPart p={preview} open={false} />}
        </div>
      )}

      {entry && <DetailPanel entry={entry} onClose={() => setEntry(null)} />}

      {preview && !blocked && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t border-stone-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={doApply} disabled={busy} className={primary}>{busy ? 'Replacing…' : `Confirm: replace in ${plural(preview.records, 'record')}`}</button>
            {fail && <p className="text-sm text-red-700 dark:text-red-300">{fail}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
