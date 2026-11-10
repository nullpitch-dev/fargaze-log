'use client';

// /entry/new — a new record or plan (#71 step 2, Design §15.7). The #70 form in 'new' mode.
//   ?preset=<id>  filled from a preset (its time: open / a moment / a usual length)
//   ?copy=<id>    filled from a record (Copy recent): its fields, starting now, same length
//   &from=plan    … from a plan in Coming up (a long press on its title: Copy to new entry)
//   ?stamp=<id>   from a stamp: its start (and end); its note shows above the form, and
//                 saving takes the stamp off Home's Stamps list
// Start = now in the phone's zone (the list's code for that zone and day: GMT or BST);
// Cross activity = 평시 unless the preset or the copied record says otherwise; Place starts
// empty unless the preset or the copied record has one (Hyoje, 9 Nov).

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RecordEditor } from '@/app/records/_components/RecordEditor';
import { blankForm, copyForm, newEntryId, presetForm } from '@/lib/entry/forms';
import { localNow, zoneCodeFor } from '@/lib/entry/time';
import type { RecordForm } from '@/lib/records/form';

const DEFAULT_CROSS = '평시';

function NewEntry() {
  const params = useSearchParams();
  const id = useMemo(() => newEntryId(), []);
  const [initial, setInitial] = useState<RecordForm | null>(null);
  const [error, setError] = useState('');
  const [stampNote, setStampNote] = useState<string | null>(null);
  const presetId = params.get('preset') ?? undefined;
  const stampId = params.get('stamp') ?? undefined;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const iana = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
        const copyId = params.get('copy');
        const [rules, presets, copy, stamp] = await Promise.all([
          fetch('/api/entry/rules').then(r => r.json()),
          presetId ? fetch('/api/entry/presets').then(r => r.json()) : Promise.resolve(null),
          stampId ? null : copyId ? fetch(params.get('from') === 'plan' ? `/api/entry/plans/${copyId}` : `/api/records/${copyId}`, { cache: 'no-store' }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`); return b; }) : Promise.resolve(null),
          stampId ? fetch(`/api/entry/stamps/${stampId}`, { cache: 'no-store' }).then(async r => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`); if (b.used) throw new Error('This stamp is a record already.'); return b.stamp; }) : Promise.resolve(null),
        ]);
        const l = localNow(iana);
        const now = { ...l, timezone: zoneCodeFor(iana, l.date, l.hour, rules.zones ?? []) ?? '' };
        const preset = presets?.presets?.find((p: any) => p.id === presetId);
        let f: RecordForm;
        if (stamp) { f = { ...blankForm(), start: stamp.start, end: stamp.end }; if (live) setStampNote(stamp.note ?? ''); }
        else if (preset) f = presetForm(preset, now);
        else if (copy?.form) f = copyForm(copy.form, now, (date, hour) => zoneCodeFor(iana, date, hour, rules.zones ?? []), params.get('from') === 'plan');
        else f = { ...blankForm(), start: now };
        if (!f.activity.crossActivity) f.activity = { ...f.activity, crossActivity: DEFAULT_CROSS };
        if (live) setInitial(f);
      } catch (e: any) {
        if (live) setError(String(e.message ?? e));
      }
    })();
    return () => { live = false; };
  }, [params, presetId, stampId]);

  if (error) return <div className="px-4 py-8 max-w-3xl mx-auto w-full text-sm text-red-700 dark:text-red-300">{error}</div>;
  if (!initial) return <div className="px-4 py-8 max-w-3xl mx-auto w-full text-sm text-stone-500 dark:text-zinc-400">Loading…</div>;
  return (
    <>
      {stampNote !== null && (
        <p className="px-4 pt-4 max-w-3xl mx-auto w-full text-sm text-stone-600 dark:text-zinc-300">
          From a stamp at {initial.start.hour}{initial.end.hour && initial.end.hour !== initial.start.hour ? `–${initial.end.hour}` : ''}{stampNote ? <> · <span className="font-medium text-stone-800 dark:text-zinc-100">{stampNote}</span></> : ''}
        </p>
      )}
      <RecordEditor id={id} mode="new" initial={initial} presetId={presetId} copied={!!params.get('copy')} stampId={stampId} />
    </>
  );
}

export default function NewEntryPage() {
  return <Suspense fallback={null}><NewEntry /></Suspense>;
}
