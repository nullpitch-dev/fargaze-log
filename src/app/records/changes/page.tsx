'use client';

// /records/changes — Record changes (#70; brought into step 3 on 5 Nov). Every saved
// edit, delete or Find & replace that is still waiting for the sheet, however old, with
// its lines, Mark repeated and Undo; below, the ones repeated in the last 30 days.
// Opened from the gear menu (with a count) and from the edit page's result screen.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChangeTable, type Line, type Plain } from '../_components/ChangeTable';
import { StepList } from '@/app/_components/SheetSteps';

interface Change {
  id: string;
  kind: 'edit' | 'delete' | 'add' | 'replace';
  recordId: string | null;
  title: string;
  tab: string; findRow: string; moveTo: string | null;
  lines: (Line & { tab?: string; findRow?: string })[];
  changes: Plain[];
  steps: string[];
  records: number;
  createdAt: string;
  sheetDone: boolean;
  undoneAt: string | null;
  undoOf: string | null;
  undoBlocked: string | null;
}

const KIND: Record<Change['kind'], string> = { edit: 'Edit', delete: 'Delete', add: 'Put back', replace: 'Find & replace' };
const btn = 'px-3 py-1.5 rounded text-sm border disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = `${btn} border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const tickBtn = `${btn} border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900`;

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** A filtered Find & replace keeps a tab and row on each line: one table per record. */
function byRecord(lines: Change['lines']) {
  const out: { tab: string; findRow: string; lines: Line[] }[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && last.tab === (l.tab ?? '') && last.findRow === (l.findRow ?? '')) last.lines.push(l);
    else out.push({ tab: l.tab ?? '', findRow: l.findRow ?? '', lines: [l] });
  }
  return out;
}

function ChangeCard({ c, busy, onTick, onUndo }: { c: Change; busy: boolean; onTick: (done: boolean) => void; onUndo: () => void }) {
  const perRecord = c.kind === 'replace' && c.lines.some(l => l.findRow);
  return (
    <li className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg p-4 shadow-sm flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400">{c.undoOf ? `Undo · ${KIND[c.kind]}` : KIND[c.kind]}</span>
        <span className="text-sm text-stone-800 dark:text-zinc-100 break-words">{c.title}</span>
        <span className="text-xs text-stone-400 dark:text-zinc-500">{when(c.createdAt)}{c.kind === 'replace' ? ` · ${c.records} record${c.records === 1 ? '' : 's'}` : ''}</span>
        {c.undoneAt && <span className="text-xs text-stone-500 dark:text-zinc-400">· undone</span>}
      </div>

      {c.steps.length > 0 && (
        <StepList steps={c.steps} className="text-sm text-stone-700 dark:text-zinc-200 space-y-1" />
      )}
      {perRecord
        ? byRecord(c.lines).map((r, i) => <ChangeTable key={i} tab={r.tab} findRow={r.findRow} lines={r.lines} />)
        : c.lines.length > 0 && <ChangeTable tab={c.tab} findRow={c.findRow} moveTo={c.moveTo} lines={c.lines} changes={c.changes} />}

      <div className="flex flex-wrap items-center gap-2">
        {c.sheetDone ? (
          <span className="text-sm text-stone-600 dark:text-zinc-300">
            ✓ Repeated in the sheet{' '}
            <button onClick={() => onTick(false)} disabled={busy} className="text-xs underline text-stone-400 hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-200">untick</button>
          </span>
        ) : (
          <button onClick={() => onTick(true)} disabled={busy} className={tickBtn}>Mark repeated</button>
        )}
        {!c.undoBlocked && <button onClick={onUndo} disabled={busy} className={secondary}>Undo</button>}
        {c.recordId && c.kind !== 'delete' && c.kind !== 'replace' && !c.undoneAt && (
          <Link href={`/records/${c.recordId}`} className={secondary}>Open the record</Link>
        )}
      </div>
    </li>
  );
}

export default function RecordChangesPage() {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Read again after each tick or undo (`reloads` counts them).
  const [reloads, setReloads] = useState(0);
  const load = useCallback(() => setReloads(n => n + 1), []);
  useEffect(() => {
    let live = true;
    fetch(`/api/records/changes?since=${daysAgo(30)}&limit=200`, { cache: 'no-store' })
      .then(async r => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
        if (live) { setChanges(b.changes); setError(''); }
      })
      .catch((e: any) => { if (live) setError(String(e.message ?? e)); });
    return () => { live = false; };
  }, [reloads]);

  async function tick(c: Change, sheetDone: boolean) {
    setBusy(c.id); setNote('');
    try {
      const r = await fetch(`/api/admin/changes/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheetDone }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setNote(b.error ?? `HTTP ${r.status}`);
      load();
    } finally { setBusy(null); }
  }

  async function undo(c: Change) {
    const ask = c.kind === 'delete' ? 'Undo the delete? The record comes back.'
      : c.kind === 'replace' ? `Undo this Find & replace? ${c.records} record${c.records === 1 ? '' : 's'} go back.`
      : 'Undo this edit? The record goes back to how it was.';
    if (!window.confirm(ask)) return;
    setBusy(c.id); setNote('');
    try {
      const r = await fetch(`/api/admin/changes/${c.id}/undo`, { method: 'POST' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setNote(b.error ?? `HTTP ${r.status}`);
      else setNote(b.sheetNeeded
        ? 'Undone. You had repeated it in the sheet, so the undo is now waiting at the top: repeat it there too.'
        : 'Undone. Nothing to do in the sheet: it had not been repeated there.');
      load();
    } finally { setBusy(null); }
  }

  const waiting = changes?.filter(c => !c.sheetDone) ?? [];
  const recent = changes?.filter(c => c.sheetDone) ?? [];

  return (
    <div className="flex flex-col flex-1 px-4 py-6 max-w-3xl mx-auto w-full gap-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">Record changes</h1>
        <p className="text-sm text-stone-600 dark:text-zinc-300 mt-1">
          Changes saved in the app that the sheet doesn’t have yet. Repeat each one in the sheet, then press Mark repeated. While any is waiting, the migrations wait too.
        </p>
      </div>
      {note && <p className="text-sm text-stone-700 dark:text-zinc-200 rounded border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 px-3 py-2">{note}</p>}
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!changes && !error && <p className="text-sm text-stone-500 dark:text-zinc-400">Loading…</p>}

      {changes && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400">Waiting for the sheet ({waiting.length})</h2>
          {waiting.length === 0
            ? <p className="text-sm text-stone-500 dark:text-zinc-400">Nothing waiting. ✓</p>
            : <ul className="flex flex-col gap-3">{waiting.map(c => <ChangeCard key={c.id} c={c} busy={busy === c.id} onTick={d => tick(c, d)} onUndo={() => undo(c)} />)}</ul>}

          {recent.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400">Repeated in the last 30 days ({recent.length})</summary>
              <ul className="flex flex-col gap-3 mt-3">{recent.map(c => <ChangeCard key={c.id} c={c} busy={busy === c.id} onTick={d => tick(c, d)} onUndo={() => undo(c)} />)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
