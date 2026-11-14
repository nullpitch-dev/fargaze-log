'use client';

// /records/changes — Record changes (#70): the record edits, deletes and Find & replace of
// the last 30 days, newest first, with what changed and Undo. Opened from the gear menu.
// (Until the freeze, 14 Nov 2026, it also listed what waited to be repeated in the sheet,
// with Mark repeated.)

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
  undoneAt: string | null;
  undoOf: string | null;
  undoBlocked: string | null;
}

const KIND: Record<Change['kind'], string> = { edit: 'Edit', delete: 'Delete', add: 'Put back', replace: 'Find & replace' };
const btn = 'px-3 py-1.5 rounded text-sm border disabled:opacity-40 disabled:cursor-not-allowed';
const secondary = `${btn} border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;

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

function ChangeCard({ c, busy, onUndo }: { c: Change; busy: boolean; onUndo: () => void }) {
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
        : (c.lines.length > 0 || c.changes.length > 0) && <ChangeTable tab={c.tab} findRow={c.findRow} moveTo={c.moveTo} lines={c.changes.length ? [] : c.lines} changes={c.changes} cellsOpen={false} />}

      <div className="flex flex-wrap items-center gap-2">
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
      else setNote('Undone.');
      load();
    } finally { setBusy(null); }
  }


  return (
    <div className="flex flex-col flex-1 px-4 py-6 max-w-3xl mx-auto w-full gap-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">Record changes</h1>
        <p className="text-sm text-stone-600 dark:text-zinc-300 mt-1">
          Record edits, deletes and Find &amp; replace from the last 30 days, newest first. Undo puts a change back.
        </p>
      </div>
      {note && <p className="text-sm text-stone-700 dark:text-zinc-200 rounded border border-stone-200 dark:border-zinc-700 bg-stone-50 dark:bg-zinc-800 px-3 py-2">{note}</p>}
      {error && <p className="text-sm text-red-700 dark:text-red-300">{error}</p>}
      {!changes && !error && <p className="text-sm text-stone-500 dark:text-zinc-400">Loading…</p>}

      {changes && (changes.length === 0
        ? <p className="text-sm text-stone-500 dark:text-zinc-400">No changes in the last 30 days.</p>
        : <ul className="flex flex-col gap-3">{changes.map(c => <ChangeCard key={c.id} c={c} busy={busy === c.id} onUndo={() => undo(c)} />)}</ul>
      )}
    </div>
  );
}
