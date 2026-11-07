'use client';

// /records/<id> — edit one record (#70 step 3, Design §15.6). Agreed with Hyoje, 5 Nov:
//   - English labels (the app is meant to be global; the data stays as written)
//   - checked as you type: each change is sent to the preview half a second after the
//     last key; problems block Save, warnings don't
//   - after Save or Delete, a result screen: the lines to repeat in the sheet, Mark
//     repeated and Undo
//   - items don't move; people are cards with name chips (free text, suggestions)
//   - one column with a sticky Save bar on narrow screens; the check beside the form
//     from 1024 px
// Later the same day: Relationship is not typed — it follows People like the sheet's
// formula in G; the time boxes use the device's time picker; each line of the Check
// card has an × that puts that part back as it was (a removed section comes back the
// same way); the result screen points to Record changes for later.
// The weekday is never typed: the system works it out from the date.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RecordForm, FormFood, FormAlcohol, FormItem, FormExercise } from '@/lib/records/form';
import type { FormOptions } from '@/lib/records/formOptions';
import { Field, ItemList, NoteBox, NumberBox, PickText, Row, Section, Select, TagInput, Text, ToggleChips, addBtn, inputCls } from './fields';
import { PeopleEditor } from './PeopleEditor';
import { ChangeTable, type Line, type Plain } from './ChangeTable';
import { relationshipOf } from '@/lib/records/relationship';

// ── Types ────────────────────────────────────────────────────────────────────

interface Loaded { id: string; form: RecordForm; updatedAt: string; category: string | null; tab: string | null; findRow: string }
interface Check { problems: string[]; warnings: string[]; tab: string; findRow: string; moveTo: string | null; lines: Line[]; changes: Plain[] }
interface Result {
  kind: 'saved' | 'deleted';
  changeId: string;
  tab: string; findRow: string; moveTo: string | null; lines: Line[]; changes: Plain[];
  sheetDone: boolean;
  /** After Undo. When the change had been repeated, the undo is its own entry, with its own tick. */
  undone: null | { sheetNeeded: boolean; changeId: string; sheetDone: boolean; tab: string; findRow: string; moveTo: string | null; lines: Line[]; changes: Plain[] };
}

type Optional = 'people' | 'transport' | 'cost' | 'purchase' | 'food' | 'exercise' | 'body' | 'sleep' | 'bowel' | 'golf' | 'reading' | 'movie' | 'travel' | 'income';
const OPTIONAL: { key: Optional; title: string }[] = [
  { key: 'people', title: 'People' },
  { key: 'transport', title: 'Journey' },   // 'Journey' on screen (Hyoje, 7 Nov); 'transport' in the data
  { key: 'cost', title: 'Cost' },
  { key: 'purchase', title: 'Purchases' },
  { key: 'food', title: 'Food & drink' },
  { key: 'exercise', title: 'Exercise' },
  { key: 'body', title: 'Body' },
  { key: 'sleep', title: 'Sleep' },
  { key: 'bowel', title: 'Bowel' },
  { key: 'golf', title: 'Golf' },
  { key: 'reading', title: 'Reading' },
  { key: 'movie', title: 'Movie' },
  { key: 'travel', title: 'Travel' },
  { key: 'income', title: 'Income' },
];

const filled = (o: Record<string, unknown>) => Object.values(o).some(v => (Array.isArray(v) ? v.length > 0 : v != null && v !== ''));

function hasData(f: RecordForm, k: Optional): boolean {
  switch (k) {
    case 'people': return f.people.length > 0;
    case 'transport': return filled(f.transport);
    case 'cost': return filled(f.cost);
    case 'purchase': return f.purchase.length > 0;
    case 'food': return filled(f.food);
    case 'exercise': return f.exercise.length > 0;
    case 'body': return filled(f.body);
    case 'sleep': return filled(f.sleep);
    case 'bowel': return filled(f.bowel);
    case 'golf': return filled(f.golf);
    case 'reading': return filled(f.reading);
    case 'movie': return filled(f.movie);
    case 'travel': return filled(f.travel);
    case 'income': return filled(f.income);
  }
}

function cleared(f: RecordForm, k: Optional): RecordForm {
  switch (k) {
    case 'people': return { ...f, people: [] };
    case 'transport': return { ...f, transport: { from: '', to: '', purpose: '', method: '', returnType: '' } };
    case 'cost': return { ...f, cost: { amountKRW: null, amountForeign: null, currency: '', categoryDetail: '', category: '' } };
    case 'purchase': return { ...f, purchase: [] };
    case 'food': return { ...f, food: { type: '', carbs: '', fat: '', spiciness: '', drinks: [], foods: [], alcohols: [] } };
    case 'exercise': return { ...f, exercise: [] };
    case 'body': return { ...f, body: { weight: null, muscleMass: null, bodyFat: null, bodyFatPercent: null } };
    case 'sleep': return { ...f, sleep: { quality: '' } };
    case 'bowel': return { ...f, bowel: { amount: '', quality: [], characteristics: [] } };
    case 'golf': return { ...f, golf: { score: null, approach: null, putts: null } };
    case 'reading': return { ...f, reading: { title: '' } };
    case 'movie': return { ...f, movie: { title: '' } };
    case 'travel': return { ...f, travel: { city: '', theme: '' } };
    case 'income': return { ...f, income: { gross: null, net: null } };
  }
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function weekdayText(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return '';
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(t.getTime()) ? '' : WEEKDAYS[t.getUTCDay()];
}

/** '9:05' → '09:05' for the time picker; '' when the stored text isn't a time. */
function pickerTime(hour: string): string | null {
  if (!hour) return '';
  const m = /^(\d{1,2}):(\d{2})$/.exec(hour.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

/** Put one part of the form back as it was ('activity.title', 'start', 'food.foods' …). */
function putBack(form: RecordForm, orig: RecordForm, part: string): RecordForm {
  const next: any = structuredClone(form);
  const parts = part === 'cost.category' || part === 'cost.categoryDetail' ? ['cost.category', 'cost.categoryDetail']
    : part === 'cost.amounts' ? ['cost.amountKRW', 'cost.amountForeign', 'cost.currency'] : [part];
  for (const p of parts) {
    const keys = p.split('.');
    let from: any = orig, to: any = next;
    for (const k of keys.slice(0, -1)) { from = from?.[k]; to = to?.[k]; }
    const last = keys[keys.length - 1];
    if (to && from && last in from) to[last] = structuredClone(from[last]);
  }
  return next;
}

// Whole meal portions (Hyoje, 7 Nov): each food carries a `portion` (%) on the page only —
// never saved, and left out of the change check. Amount = whole × portion ÷ all portions.
type Portioned = FormFood & { portion?: number | string | null };
const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
/** JSON without the page-only portions. */
export const formJson = (v: unknown) => JSON.stringify(v, (k, x) => (k === 'portion' ? undefined : x));

function shareWhole(foods: Portioned[], w: { amount: any; unit: string }): Portioned[] {
  const n = foods.length;
  const withP = foods.map(x => (typeof x.portion === 'number' ? x : { ...x, portion: n ? round1(100 / n) : null }));
  const sum = withP.reduce((a, x) => a + (typeof x.portion === 'number' ? x.portion : 0), 0);
  return withP.map(x => ({
    ...x,
    amount: typeof w.amount === 'number' && sum > 0 && typeof x.portion === 'number' ? String(round3(w.amount * x.portion / sum)) : '',
    unit: w.unit,
  }));
}

/** Each food's share of the meal from its own amount (the tick off): 0–100, or null. */
function portionsFromAmounts(foods: FormFood[]): (number | null)[] {
  const nums = foods.map(x => (String(x.amount).trim() === '' ? NaN : Number(String(x.amount).replace(/,/g, ''))));
  const sum = nums.reduce((a, b) => a + b, 0);
  return nums.map(v => (foods.length > 1 && Number.isFinite(sum) && sum > 0 ? round1((v / sum) * 100) : null));
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const blankItem = (): FormItem => ({ item: '', amount: '', unit: '' });
const blankFood = (): FormFood => ({ item: '', amount: '', unit: '', note: '', ingredients: [] });
const blankAlcohol = (): FormAlcohol => ({ item: '', amount: '', unit: '', note: '' });
const blankExercise = (): FormExercise => ({ item: '', amount: null, unit: '', loadKg: null, setStyle: '' });

const btn = 'px-3 py-1.5 rounded text-sm border disabled:opacity-40 disabled:cursor-not-allowed';
const primary = `${btn} border-stone-800 bg-stone-800 text-white hover:bg-stone-700 dark:border-zinc-200 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white`;
const secondary = `${btn} border-stone-300 text-stone-700 hover:bg-stone-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800`;
const danger = `${btn} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950`;

// ── Page ─────────────────────────────────────────────────────────────────────

export function RecordEditor({ id }: { id: string }) {
  const router = useRouter();
  const [rec, setRec] = useState<Loaded | null>(null);
  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [form, setForm] = useState<RecordForm | null>(null);
  const [added, setAdded] = useState<Set<Optional>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [check, setCheck] = useState<{ for: string; data: Check } | null>(null);
  const [checkError, setCheckError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ text: string; problems?: string[]; conflict?: boolean } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultError, setResultError] = useState('');
  /** The whole-meal amount, when that box is ticked. */
  const [whole, setWhole] = useState<{ amount: any; unit: string } | null>(null);
  /** A rate typed for this record (undefined = the starting rate). */
  const [rateOverride, setRateOverride] = useState<number | string | null | undefined>(undefined);

  // Load the record and the pickers' values.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [r, o] = await Promise.all([
          fetch(`/api/records/${id}`, { cache: 'no-store' }),
          opts ? Promise.resolve(null) : fetch('/api/records/options'),
        ]);
        const rb = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(rb.error ?? `HTTP ${r.status}`);
        if (o) {
          const ob = await o.json().catch(() => ({}));
          if (!o.ok) throw new Error(ob.error ?? `HTTP ${o.status}`);
          if (live) setOpts(ob);
        }
        if (!live) return;
        setRec(rb); setForm(rb.form); setAdded(new Set()); setRateOverride(undefined); setWhole(null); setCheck(null); setSaveError(null); setLoadError('');
      } catch (e: any) {
        if (live) setLoadError(String(e.message ?? e));
      }
    })();
    return () => { live = false; };
    // opts: loaded once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reload]);

  const formKey = useMemo(() => (form ? formJson(form) : ''), [form]);
  const origKey = useMemo(() => (rec ? JSON.stringify(rec.form) : ''), [rec]);
  const dirty = !!form && !result && formKey !== origKey;

  // Check as you type: half a second after the last change.
  const seq = useRef(0);
  useEffect(() => {
    if (!dirty || !form) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/records/${id}/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: formJson({ form }),
        });
        const b = await r.json().catch(() => ({}));
        if (n !== seq.current) return;
        if (!r.ok) { setCheckError(b.error ?? `HTTP ${r.status}`); return; }
        setCheckError('');
        setCheck({ for: formJson(form), data: b });
      } catch (e: any) {
        if (n === seq.current) setCheckError(String(e.message ?? e));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [dirty, form, id]);

  const current = check && check.for === formKey ? check.data : null;
  const checking = dirty && !current && !checkError;
  const canSave = dirty && !!current && current.problems.length === 0 && !saving;

  // Unsaved changes: ask before leaving (closing the tab, or a link in the app).
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('Leave without saving? Your changes will be lost.')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true); };
  }, [dirty]);

  const goBack = useCallback(() => {
    if (dirty && !window.confirm('Leave without saving? Your changes will be lost.')) return;
    if (window.history.length > 1) router.back(); else router.push('/calendar');
  }, [dirty, router]);

  const lookups = useMemo(() => {
    if (!opts) return null;
    const actCat = new Map(opts.activities.map(a => [a.name, a.category]));
    const lvl1 = new Map(opts.ingredients.map(i => [i.level2, i.level1]));
    return {
      actCat,
      activityNames: opts.activities.map(a => a.name),
      zones: opts.zones.map(z => ({ value: z.code, label: `${z.code} (UTC${z.offset >= 0 ? '+' : ''}${z.offset}) ${z.city}` })),
      costs: opts.costs.map(c => ({ value: `${c.category}\u0000${c.categoryDetail}`, label: `${c.category} › ${c.categoryDetail}` })),
      lvl1,
      ingredientNames: opts.ingredients.map(i => i.level2),
      ingredientSet: new Set(opts.ingredients.map(i => i.level2)),
      alcoholItems: [...new Set(opts.alcohols.map(a => a.item))],
      alcoholUnits: (item: string) => opts.alcohols.filter(a => a.item === item).map(a => a.unit),
    };
  }, [opts]);

  // ── Save / delete / undo / tick ─────────────────────────────────────────────

  async function save() {
    if (!rec || !form || !canSave) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch(`/api/records/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: formJson({ form, updatedAt: rec.updatedAt }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, problems: b.problems, conflict: r.status === 409 }); return; }
      setResult({ kind: 'saved', changeId: b.changeId, tab: b.tab, findRow: b.findRow, moveTo: b.moveTo, lines: b.lines, changes: b.changes ?? [], sheetDone: false, undone: null });
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setSaveError({ text: String(e.message ?? e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!rec) return;
    if (!window.confirm('Delete this record?\n\nIt goes to the trash; Undo on the next screen puts it back.')) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch(`/api/records/${id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt: rec.updatedAt }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, conflict: r.status === 409 }); return; }
      setResult({ kind: 'deleted', changeId: b.changeId, tab: b.tab, findRow: b.findRow, moveTo: null, lines: b.lines, changes: [], sheetDone: false, undone: null });
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setSaveError({ text: String(e.message ?? e) });
    } finally {
      setSaving(false);
    }
  }

  async function tick(sheetDone: boolean) {
    if (!result) return;
    const changeId = result.undone ? result.undone.changeId : result.changeId;
    setBusy(true); setResultError('');
    try {
      const r = await fetch(`/api/admin/changes/${changeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheetDone }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setResultError(b.error ?? `HTTP ${r.status}`); return; }
      setResult(result.undone ? { ...result, undone: { ...result.undone, sheetDone } } : { ...result, sheetDone });
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result) return;
    if (!window.confirm(result.kind === 'saved' ? 'Undo this edit? The record goes back to how it was.' : 'Undo the delete? The record comes back.')) return;
    setBusy(true); setResultError('');
    try {
      const r = await fetch(`/api/admin/changes/${result.changeId}/undo`, { method: 'POST' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setResultError(b.error ?? `HTTP ${r.status}`); return; }
      setResult({ ...result, undone: { sheetNeeded: !!b.sheetNeeded, changeId: b.changeId, sheetDone: false, tab: b.tab, findRow: b.findRow, moveTo: b.moveTo ?? null, lines: b.lines ?? [], changes: b.changes ?? [] } });
    } finally {
      setBusy(false);
    }
  }

  // ── Result screen ───────────────────────────────────────────────────────────

  if (result) {
    const gone = result.kind === 'deleted' && !result.undone;
    const u = result.undone;
    const showSheet = !u || u.sheetNeeded;
    const done = u ? u.sheetDone : result.sheetDone;
    return (
      <div className="flex flex-col flex-1 px-4 py-6 max-w-3xl mx-auto w-full gap-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">
            {result.undone ? (result.kind === 'saved' ? 'Edit undone' : 'Delete undone') : result.kind === 'saved' ? 'Saved' : 'Deleted'}
          </h1>
          <p className="text-sm text-stone-600 dark:text-zinc-300 mt-1">
            {u
              ? u.sheetNeeded
                ? result.kind === 'saved'
                  ? 'The record is back as it was. You had repeated the edit in the sheet, so undo it there too: make the changes below there, then press Mark repeated.'
                  : 'The record is back. You had deleted the row in the sheet, so add it back there as below, then press Mark repeated.'
                : 'The record is back as it was. Nothing to do in the sheet: the change had not been repeated there.'
              : result.kind === 'saved'
                ? 'Repeat these changes in the sheet, then press Mark repeated. Until then, the migrations wait.'
                : 'The record is in the trash. Delete the row in the sheet, then press Mark repeated. Until then, the migrations wait.'}
          </p>
          {!done && (
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
              No time now? It waits on <Link href="/records/changes" className="underline">Record changes</Link> (gear menu ⚙), with Mark repeated and Undo.
            </p>
          )}
        </div>

        {showSheet && (
          <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg p-4 shadow-sm flex flex-col gap-3">
            {u ? <ChangeTable tab={u.tab} findRow={u.findRow} moveTo={u.moveTo} lines={u.lines} changes={u.changes} /> : <ChangeTable tab={result.tab} findRow={result.findRow} moveTo={result.moveTo} lines={result.lines} changes={result.changes} />}
            <div className="flex flex-wrap items-center gap-2">
              {done ? (
                <span className="text-sm text-stone-600 dark:text-zinc-300">
                  ✓ Repeated in the sheet{' '}
                  <button onClick={() => tick(false)} disabled={busy} className="text-xs underline text-stone-400 hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-200">untick</button>
                </span>
              ) : (
                <button onClick={() => tick(true)} disabled={busy}
                  className={`${btn} border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900`}>Mark repeated</button>
              )}
              {!u && <button onClick={undo} disabled={busy} className={secondary}>{result.kind === 'saved' ? 'Undo this edit' : 'Undo the delete'}</button>}
            </div>
          </div>
        )}
        {resultError && <p className="text-sm text-red-700 dark:text-red-300">{resultError}</p>}

        <div className="flex flex-wrap gap-2">
          {!gone && <button onClick={() => { setResult(null); setReload(n => n + 1); }} className={secondary}>Open the record</button>}
          <Link href="/calendar" className={secondary}>Calendar</Link>
          <Link href="/search" className={secondary}>Search</Link>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="px-4 py-8 max-w-3xl mx-auto w-full">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
        <button onClick={() => setReload(n => n + 1)} className={`${secondary} mt-3`}>Try again</button>
      </div>
    );
  }
  if (!rec || !form || !opts || !lookups) {
    return <div className="px-4 py-8 max-w-3xl mx-auto w-full text-sm text-stone-500 dark:text-zinc-400">Loading…</div>;
  }

  const f = form;
  const set = <K extends keyof RecordForm>(k: K, v: RecordForm[K]) => setForm(prev => (prev ? { ...prev, [k]: v } : prev));
  const patch = <K extends keyof RecordForm>(k: K, p: Partial<RecordForm[K]>) => setForm(prev => (prev ? { ...prev, [k]: { ...(prev[k] as object), ...p } } : prev));
  // A 이동 record always has its journey: shown, and no Remove (Hyoje, 7 Nov).
  const journeyNeeded = lookups.actCat.get(f.activity.name.trim()) === '이동';
  const shown = (k: Optional) => added.has(k) || hasData(f, k) || (k === 'transport' && journeyNeeded);
  const hide = (k: Optional) => { setForm(prev => (prev ? cleared(prev, k) : prev)); setAdded(s => { const n = new Set(s); n.delete(k); return n; }); };
  const ref = (name: string) => opts.ref[name] ?? [];
  const category = lookups.actCat.get(f.activity.name.trim());
  const used = opts.used;
  const removeBtn = (k: Optional) => () => hide(k);

  // Whole meal: one amount for all the foods, shared evenly — as the sheet's 'A+B' with one
  // amount, which the migration divides (Hyoje, 7 Nov). Off when a record opens.
  const setWholeMeal = (w: { amount: any; unit: string }, foods: Portioned[] = f.food.foods) => {
    setWhole(w);
    patch('food', { foods: shareWhole(foods, w) });
  };
  const toggleWhole = (on: boolean) => {
    if (!on) { setWhole(null); patch('food', { foods: f.food.foods.map((x: Portioned) => { const y = { ...x }; delete y.portion; return y; }) }); return; }
    // Portions start from the foods' own amounts (equal when those can't tell).
    const shares = portionsFromAmounts(f.food.foods);
    const foods: Portioned[] = f.food.foods.map((x, i) => ({ ...x, portion: shares[i] ?? round1(100 / f.food.foods.length) }));
    const units = [...new Set(foods.map(x => x.unit.trim()).filter(Boolean))];
    const nums = foods.map(x => Number(String(x.amount).replace(/,/g, '')));
    const sum = foods.length && nums.every(n => Number.isFinite(n) && String(foods[0].amount).trim() !== '') ? nums.reduce((a, b) => a + b, 0) : null;
    setWholeMeal({ amount: sum != null ? round3(sum) : null, unit: units.length === 1 ? units[0] : '' }, foods);
  };
  const fatKg = (weight: unknown, pct: unknown) =>
    typeof weight === 'number' && typeof pct === 'number' ? Math.round(weight * pct / 10) / 10 : null;

  // Cost: the rate for a foreign amount.
  const latestRate = (cur: string) => opts.rates.find(r => r.currency === cur)?.rateKRW ?? null;
  const saved = rec.form.cost;
  const impliedRate = saved.currency && Number(saved.amountForeign) > 0 && Number(saved.amountKRW) > 0
    ? Math.round((Number(saved.amountKRW) / Number(saved.amountForeign)) * 100) / 100 : null;
  const rate: any = rateOverride !== undefined ? rateOverride
    : (f.cost.currency === saved.currency && impliedRate != null ? impliedRate : latestRate(f.cost.currency));
  const krw = (foreign: unknown, r: unknown) =>
    typeof foreign === 'number' && typeof r === 'number' && Number.isFinite(foreign * r) ? Math.round(foreign * r) : null;
  const setCurrency = (cur: string) => {
    if (!cur) { setRateOverride(undefined); patch('cost', { currency: '', amountForeign: null }); return; }
    const r = latestRate(cur);
    setRateOverride(r);
    patch('cost', { currency: cur, amountKRW: krw(f.cost.amountForeign, r) });
  };

  const point = (which: 'start' | 'end') => {
    const p = f[which];
    const wd = weekdayText(p.date);
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-stone-500 dark:text-zinc-400">{which === 'start' ? 'Start' : 'End'}</span>
        <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-2">
          <input type="date" value={p.date} onChange={e => patch(which, { date: e.target.value })} aria-label={`${which} date`} className={`${inputCls} col-span-2 sm:col-span-1`} />
          {pickerTime(p.hour) != null
            ? <input type="time" value={pickerTime(p.hour)!} onChange={e => patch(which, { hour: e.target.value })} aria-label={`${which} time`} className={`${inputCls} font-mono`} />
            : <input value={p.hour} onChange={e => patch(which, { hour: e.target.value })} placeholder="H:mm" aria-label={`${which} time`} className={`${inputCls} font-mono`} />}
          <Select value={p.timezone} onChange={v => patch(which, { timezone: v })} options={lookups.zones} empty="Zone" />
        </div>
        <span className="text-xs text-stone-400 dark:text-zinc-500">{wd ? `${wd} (worked out from the date)` : ' '}</span>
      </div>
    );
  };

  const wholeOn = whole != null;
  const foodShares = portionsFromAmounts(f.food.foods);
  const portionSum = f.food.foods.reduce((a, x) => a + (typeof (x as Portioned).portion === 'number' ? Number((x as Portioned).portion) : 0), 0);
  const foodRows = (kind: 'drinks' | 'foods') => (
    <ItemList<FormFood>
      items={f.food[kind]}
      onChange={v => patch('food', { [kind]: kind === 'foods' && whole ? shareWhole(v, whole) : v } as any)}
      blank={blankFood}
      addLabel={kind === 'drinks' ? '+ Add a drink' : '+ Add a food'}
      render={(x, setX, i) => (
        <div className="flex flex-col gap-2">
          <div className={kind === 'foods'
            ? 'grid grid-cols-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-2'
            : 'grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2'}>
            <Text value={x.item} onChange={v => setX({ item: v })} suggest={kind === 'drinks' ? used.drinkItems : used.foodItems} placeholder={kind === 'drinks' ? 'Drink' : 'Food'} className={kind === 'foods' ? 'col-span-3 sm:col-span-1' : 'col-span-2 sm:col-span-1'} />
            <Text value={x.amount} onChange={v => setX({ amount: v })} placeholder="Amount" disabled={kind === 'foods' && wholeOn} />
            <Text value={x.unit} onChange={v => setX({ unit: v })} suggest={used.foodUnits} placeholder="Unit" disabled={kind === 'foods' && wholeOn} />
            {kind === 'foods' && (wholeOn
              ? <NumberBox value={(x as Portioned).portion ?? null} onChange={v => setX({ portion: v } as any)} placeholder="Portion" suffix="%" />
              : <div title="Portion: this food's share of the meal" className="rounded border border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 px-2 py-1.5 text-sm text-right font-mono text-stone-500 dark:text-zinc-400">
                  {foodShares[i] != null ? `${foodShares[i]}%` : '—'}
                </div>)}
          </div>
          <NoteBox value={x.note} onChange={v => setX({ note: v })} />
          <div className="flex flex-col gap-1">
            <span className="text-xs text-stone-500 dark:text-zinc-400">Ingredients</span>
            <TagInput values={x.ingredients} onChange={v => setX({ ingredients: v })} suggest={lookups.ingredientNames}
              describe={v => lookups.lvl1.get(v)} known={lookups.ingredientSet} placeholder="Add an ingredient…" />
          </div>
        </div>
      )}
    />
  );

  const problems = current?.problems ?? [];
  const warnings = current?.warnings ?? [];
  const hidden = OPTIONAL.filter(o => !shown(o.key));

  const checkPanel = (
    <div id="check" className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-lg p-4 shadow-sm flex flex-col gap-3 min-w-0">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500 dark:text-zinc-400">Check</h2>
      {!dirty && <p className="text-sm text-stone-500 dark:text-zinc-400">No changes yet. Each change is checked as you type.</p>}
      {checking && <p className="text-sm text-stone-500 dark:text-zinc-400">Checking…</p>}
      {checkError && <p className="text-sm text-red-700 dark:text-red-300">The check failed: {checkError}</p>}
      {current && (
        <>
          {problems.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">{problems.length === 1 ? 'Fix this to save' : `Fix these ${problems.length} to save`}</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-0.5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">To know (saving is still fine)</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300 space-y-0.5">{warnings.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </div>
          )}
          {current.lines.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-stone-700 dark:text-zinc-200">For the sheet, after saving</p>
              <ChangeTable tab={current.tab} findRow={current.findRow} moveTo={current.moveTo} lines={current.lines} changes={current.changes} cellsOpen={false}
                onPutBack={part => { if (part === 'cost.amounts') setRateOverride(undefined); if (part === 'food.foods') setWhole(null); setForm(prev => (prev ? putBack(prev, rec.form, part) : prev)); }} />
              <p className="text-xs text-stone-400 dark:text-zinc-500">× puts that part back as it was.</p>
            </div>
          )}
        </>
      )}
    </div>
  );

  const status = !dirty ? <span className="text-stone-500 dark:text-zinc-400">No changes yet</span>
    : checkError ? <span className="text-red-700 dark:text-red-300">The check failed</span>
    : checking ? <span className="text-stone-500 dark:text-zinc-400">Checking…</span>
    : problems.length ? <a href="#check" className="text-red-700 dark:text-red-300 underline">{plural(problems.length, 'problem')}: can’t save yet</a>
    : <span className="text-stone-700 dark:text-zinc-200">Ready · <a href="#check" className="underline">{plural((current!.changes?.length || current!.lines.length), 'change')}</a>{warnings.length ? <a href="#check" className="text-amber-700 dark:text-amber-300 underline"> · {plural(warnings.length, 'note')}</a> : null}</span>;

  return (
    <div className="flex flex-col flex-1 w-full pb-24">
      <div className="px-4 pt-6 max-w-6xl mx-auto w-full">
        <button onClick={goBack} className="text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100">← Back</button>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">Edit record</h1>
          <span className="text-xs text-stone-500 dark:text-zinc-400">Tab {rec.tab ?? '(none)'} · <span className="font-mono break-all">{rec.findRow}</span></span>
        </div>
      </div>

      <div className="px-4 py-4 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {saveError && (
            <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-800 dark:text-red-200">
              <p>{saveError.text}</p>
              {saveError.problems && <ul className="mt-1 list-disc pl-5">{saveError.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
              {saveError.conflict && (
                <button onClick={() => { if (window.confirm('Reload the record? Your changes here will be lost.')) setReload(n => n + 1); }} className={`${secondary} mt-2 bg-white dark:bg-zinc-900`}>Reload the record</button>
              )}
            </div>
          )}

          <Section title="Activity">
            <Row>
              <Field label="Activity" note={f.activity.name.trim() ? (category ? `Category: ${category}` : 'Not in Activities') : undefined}>
                <Text value={f.activity.name} onChange={v => patch('activity', { name: v })} suggest={lookups.activityNames} describe={v => lookups.actCat.get(v)} />
              </Field>
              <Field label="Title"><Text value={f.activity.title} onChange={v => patch('activity', { title: v })} /></Field>
            </Row>
            <Field label="Additional info"><Text value={f.activity.additionalInfo} onChange={v => patch('activity', { additionalInfo: v })} /></Field>
            <Row>
              <Field label="Cross activity"><Select value={f.activity.crossActivity} onChange={v => patch('activity', { crossActivity: v })} options={ref('activity.crossActivity')} /></Field>
              <Field label="Relationship" note="Follows People">
                <div aria-readonly data-testid="relationship" className="rounded border border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 px-2 py-1.5 text-sm text-stone-600 dark:text-zinc-300">{relationshipOf(f.people)}</div>
              </Field>
            </Row>
          </Section>

          <Section title="Time">
            {point('start')}
            {point('end')}
            <p className="text-xs text-stone-400 dark:text-zinc-500">No times = all day. A start time without an end time = still going (an open record).</p>
          </Section>

          <Section title="Place">
            <Field label="Place"><Text value={f.location.activity} onChange={v => patch('location', { activity: v })} suggest={used.places} /></Field>
            <Row>
              <Field label="Online"><Text value={f.location.online} onChange={v => patch('location', { online: v })} suggest={used.online} /></Field>
              <Field label="Someone else’s place"><Text value={f.location.other} onChange={v => patch('location', { other: v })} suggest={used.places} /></Field>
            </Row>
          </Section>

          {shown('people') && (
            <Section title="People" onRemove={removeBtn('people')}>
              <PeopleEditor people={f.people} onChange={v => set('people', v)} methods={ref('people.method')} categories={ref('people.category')} names={used.people} />
            </Section>
          )}

          {shown('transport') && (
            <Section title="Journey" onRemove={journeyNeeded ? undefined : removeBtn('transport')}>
              <Row>
                <Field label="From"><Text value={f.transport.from} onChange={v => patch('transport', { from: v })} suggest={used.places} /></Field>
                <Field label="To"><Text value={f.transport.to} onChange={v => patch('transport', { to: v })} suggest={used.places} /></Field>
              </Row>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Purpose"><Select value={f.transport.purpose} onChange={v => patch('transport', { purpose: v })} options={ref('transport.purpose')} /></Field>
                <Field label="Method"><Select value={f.transport.method} onChange={v => patch('transport', { method: v })} options={ref('transport.method')} /></Field>
                <Field label="Return type"><Select value={f.transport.returnType} onChange={v => patch('transport', { returnType: v })} options={ref('transport.returnType')} /></Field>
              </div>
            </Section>
          )}

          {shown('cost') && (
            <Section title="Cost" onRemove={removeBtn('cost')}>
              <Field label="Category">
                <PickText value={f.cost.category || f.cost.categoryDetail ? `${f.cost.category}\u0000${f.cost.categoryDetail}` : ''}
                  onChange={v => { const [category = '', categoryDetail = ''] = v ? v.split('\u0000') : []; patch('cost', { category, categoryDetail }); }}
                  options={lookups.costs} placeholder="Type to search, e.g. 외식" />
              </Field>
              {/* The currency decides which amount is typed (Hyoje, 5 Nov): none → KRW;
                  a currency → the foreign amount, and KRW = foreign × rate. The rate starts
                  from the Exchange rates list (or, for a saved cost, from its own amounts) and
                  may be changed for this record; it is not saved. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Currency"><Select value={f.cost.currency} onChange={setCurrency} options={opts.currencies} empty="— (KRW)" /></Field>
                {f.cost.currency ? (
                  <>
                    <Field label={`Amount (${f.cost.currency})`}><NumberBox value={f.cost.amountForeign} onChange={v => patch('cost', { amountForeign: v, amountKRW: krw(v, rate) })} /></Field>
                    <Field label={`Rate (₩ per 1 ${f.cost.currency})`}><NumberBox value={rate} onChange={v => { setRateOverride(v); patch('cost', { amountKRW: krw(f.cost.amountForeign, v) }); }} /></Field>
                    <Field label="Amount (KRW)" note="Calculated">
                      <div className="rounded border border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 px-2 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-zinc-300">
                        {f.cost.amountKRW != null && f.cost.amountKRW !== ('' as any) ? `₩${Number(f.cost.amountKRW).toLocaleString('en-GB')}` : '—'}
                      </div>
                    </Field>
                  </>
                ) : (
                  <Field label="Amount (KRW)"><NumberBox value={f.cost.amountKRW} onChange={v => patch('cost', { amountKRW: v })} suffix="₩" /></Field>
                )}
              </div>
            </Section>
          )}

          {shown('purchase') && (
            <Section title="Purchases" onRemove={removeBtn('purchase')}>
              <ItemList<FormItem> items={f.purchase} onChange={v => set('purchase', v)} blank={blankItem} addLabel="+ Add an item"
                render={(x, setX) => (
                  <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                    <Text value={x.item} onChange={v => setX({ item: v })} suggest={used.purchaseItems} placeholder="Item" className="col-span-2 sm:col-span-1" />
                    <Text value={x.amount} onChange={v => setX({ amount: v })} placeholder="Amount" />
                    <Text value={x.unit} onChange={v => setX({ unit: v })} suggest={used.purchaseUnits} placeholder="Unit" />
                  </div>
                )} />
            </Section>
          )}

          {shown('food') && (
            <Section title="Food & drink" onRemove={removeBtn('food')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Type"><Select value={f.food.type} onChange={v => patch('food', { type: v })} options={ref('food.type')} /></Field>
                <Field label="Carbs"><Select value={f.food.carbs} onChange={v => patch('food', { carbs: v })} options={ref('nutrient_level')} /></Field>
                <Field label="Fat"><Select value={f.food.fat} onChange={v => patch('food', { fat: v })} options={ref('nutrient_level')} /></Field>
                <Field label="Spiciness"><Select value={f.food.spiciness} onChange={v => patch('food', { spiciness: v })} options={ref('nutrient_level')} /></Field>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-stone-500 dark:text-zinc-400">Foods</span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-zinc-300 cursor-pointer">
                    <input type="checkbox" checked={wholeOn} onChange={e => toggleWhole(e.target.checked)} className="accent-stone-700 dark:accent-zinc-300" />
                    Whole meal amount
                  </label>
                </div>
                {whole && (
                  <div className="grid grid-cols-2 gap-2 rounded border border-stone-200 dark:border-zinc-700 p-2">
                    <Field label="Whole meal" note={f.food.foods.length > 1
                      ? Math.abs(portionSum - 100) < 0.05 ? 'Shared by the portions below' : `Portions add up to ${round1(portionSum)}%: each food gets its share of that`
                      : undefined}>
                      <NumberBox value={whole.amount} onChange={v => setWholeMeal({ ...whole, amount: v })} placeholder="Amount" />
                    </Field>
                    <Field label="Unit"><Text value={whole.unit} onChange={v => setWholeMeal({ ...whole, unit: v })} suggest={used.foodUnits} placeholder="Unit" /></Field>
                  </div>
                )}
                {foodRows('foods')}
              </div>
              <div className="flex flex-col gap-1"><span className="text-xs text-stone-500 dark:text-zinc-400">Drinks</span>{foodRows('drinks')}</div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-stone-500 dark:text-zinc-400">Alcohol</span>
                <ItemList<FormAlcohol> items={f.food.alcohols} onChange={v => patch('food', { alcohols: v })} blank={blankAlcohol} addLabel="+ Add alcohol"
                  render={(x, setX) => (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                        <div className="col-span-2 sm:col-span-1"><PickText value={x.item} onChange={v => setX({ item: v, unit: lookups.alcoholUnits(v).includes(x.unit) ? x.unit : '' })} options={lookups.alcoholItems.map(a => ({ value: a }))} placeholder="Alcohol" /></div>
                        <Text value={x.amount} onChange={v => setX({ amount: v })} placeholder="Amount" />
                        <Select value={x.unit} onChange={v => setX({ unit: v })} options={lookups.alcoholUnits(x.item)} empty="Unit" />
                      </div>
                      <NoteBox value={x.note} onChange={v => setX({ note: v })} />
                    </div>
                  )} />
              </div>
            </Section>
          )}

          {shown('exercise') && (
            <Section title="Exercise" onRemove={removeBtn('exercise')}>
              <ItemList<FormExercise> items={f.exercise} onChange={v => set('exercise', v)} blank={blankExercise} addLabel="+ Add an exercise"
                render={(x, setX) => (
                  <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                    <Text value={x.item} onChange={v => setX({ item: v })} suggest={used.exerciseItems} placeholder="Exercise" className="col-span-2 sm:col-span-1" />
                    <NumberBox value={x.amount} onChange={v => setX({ amount: v })} placeholder="Amount" />
                    <Text value={x.unit} onChange={v => setX({ unit: v })} suggest={used.exerciseUnits} placeholder="Unit" />
                    <NumberBox value={x.loadKg} onChange={v => setX({ loadKg: v })} placeholder="Load" suffix="kg" />
                    <Text value={x.setStyle} onChange={v => setX({ setStyle: v })} suggest={used.setStyles} placeholder="Set style" className="sm:col-span-2" />
                  </div>
                )} />
            </Section>
          )}

          {shown('body') && (
            <Section title="Body" onRemove={removeBtn('body')}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* The scale gives weight, muscle mass and body fat %; body fat (kg) is
                    weight × % (Hyoje, 7 Nov). A saved value stays until weight or % change. */}
                <Field label="Weight"><NumberBox value={f.body.weight} onChange={v => patch('body', { weight: v, bodyFat: fatKg(v, f.body.bodyFatPercent) })} suffix="kg" /></Field>
                <Field label="Muscle mass"><NumberBox value={f.body.muscleMass} onChange={v => patch('body', { muscleMass: v })} suffix="kg" /></Field>
                <Field label="Body fat"><NumberBox value={f.body.bodyFatPercent} onChange={v => patch('body', { bodyFatPercent: v, bodyFat: fatKg(f.body.weight, v) })} suffix="%" /></Field>
                <Field label="Body fat" note="Calculated">
                  <div className="rounded border border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 px-2 py-1.5 text-sm text-right font-mono text-stone-600 dark:text-zinc-300">
                    {f.body.bodyFat != null && (f.body.bodyFat as any) !== '' ? `${f.body.bodyFat} kg` : '—'}
                  </div>
                </Field>
              </div>
            </Section>
          )}

          {shown('sleep') && (
            <Section title="Sleep" onRemove={removeBtn('sleep')}>
              <Field label="Quality"><Text value={f.sleep.quality} onChange={v => patch('sleep', { quality: v })} suggest={used.sleep} /></Field>
            </Section>
          )}

          {shown('bowel') && (
            <Section title="Bowel" onRemove={removeBtn('bowel')}>
              <div className="sm:w-1/2"><Field label="Amount"><Select value={f.bowel.amount} onChange={v => patch('bowel', { amount: v })} options={opts.bowel.amount} /></Field></div>
              <div className="flex flex-col gap-1"><span className="text-xs text-stone-500 dark:text-zinc-400">Quality</span>
                <ToggleChips values={f.bowel.quality} options={opts.bowel.quality} onChange={v => patch('bowel', { quality: v })} /></div>
              <div className="flex flex-col gap-1"><span className="text-xs text-stone-500 dark:text-zinc-400">Characteristics</span>
                <ToggleChips values={f.bowel.characteristics} options={opts.bowel.characteristics} onChange={v => patch('bowel', { characteristics: v })} /></div>
            </Section>
          )}

          {shown('golf') && (
            <Section title="Golf" onRemove={removeBtn('golf')}>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Score"><NumberBox value={f.golf.score} onChange={v => patch('golf', { score: v })} /></Field>
                <Field label="Approach"><NumberBox value={f.golf.approach} onChange={v => patch('golf', { approach: v })} /></Field>
                <Field label="Putts"><NumberBox value={f.golf.putts} onChange={v => patch('golf', { putts: v })} /></Field>
              </div>
            </Section>
          )}

          {shown('reading') && (
            <Section title="Reading" onRemove={removeBtn('reading')}>
              <Field label="Book title"><Text value={f.reading.title} onChange={v => patch('reading', { title: v })} /></Field>
            </Section>
          )}

          {shown('movie') && (
            <Section title="Movie" onRemove={removeBtn('movie')}>
              <Field label="Movie title"><Text value={f.movie.title} onChange={v => patch('movie', { title: v })} /></Field>
            </Section>
          )}

          {shown('travel') && (
            <Section title="Travel" onRemove={removeBtn('travel')}>
              <Row>
                <Field label="City"><Text value={f.travel.city} onChange={v => patch('travel', { city: v })} suggest={used.cities} /></Field>
                <Field label="Theme"><Text value={f.travel.theme} onChange={v => patch('travel', { theme: v })} suggest={used.themes} /></Field>
              </Row>
            </Section>
          )}

          {shown('income') && (
            <Section title="Income" onRemove={removeBtn('income')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Before tax"><NumberBox value={f.income.gross} onChange={v => patch('income', { gross: v })} suffix="₩" /></Field>
                <Field label="After tax"><NumberBox value={f.income.net} onChange={v => patch('income', { net: v })} suffix="₩" /></Field>
              </div>
            </Section>
          )}

          {hidden.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-stone-500 dark:text-zinc-400 mr-1">Add a section:</span>
              {hidden.map(o => (
                <button key={o.key} type="button" onClick={() => setAdded(s => new Set(s).add(o.key))} className={addBtn}>+ {o.title}</button>
              ))}
            </div>
          )}

          <Section title="Notes">
            <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputCls} resize-y`} />
          </Section>

          <div className="flex justify-end">
            <button onClick={remove} disabled={saving} className={danger}>Delete this record</button>
          </div>
        </div>

        <div className="lg:sticky lg:top-4">{checkPanel}</div>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-stone-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-sm truncate">{status}</div>
          <button onClick={goBack} className={secondary}>Cancel</button>
          <button onClick={save} disabled={!canSave} className={primary}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
