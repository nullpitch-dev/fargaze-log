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
//
// #71 (8 Nov): the same form makes new records and adjusts plans (mode 'new' / 'plan',
// Design §15.7). Those modes check through /api/entry/check, open the activity's field
// groups (groups.ts rulesFor), offer a Place picker with a Detail box ("회사 - 회의실 1"),
// save without a change-list entry and go back to the entry home with a toast.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { RecordForm, FormFood, FormAlcohol, FormItem, FormExercise } from '@/lib/records/form';
import type { FormOptions } from '@/lib/records/formOptions';
import { Choice, Field, ItemList, NoteBox, NumberBox, PickText, Row, Section, Select, TagInput, Text, ToggleChips, OnePills, addBtn, inputCls } from './fields';
import { PeopleEditor } from './PeopleEditor';
import { ChangeTable, type Line, type Plain } from './ChangeTable';
import { relationshipOf } from '@/lib/records/relationship';
import { rulesFor, type EntryGroup } from '@/lib/entry/groups';
import { addMinutes, localNow, zoneCodeFor, type ZoneRow } from '@/lib/entry/time';
import { RESETTABLE, resetSection, HOME_CURRENCY, type ResettableSection } from '@/lib/entry/forms';
import { dropOutbox, fetchWithin, isNoSignal, outboxOn, putOutbox } from '@/lib/offline/outbox';

// ── Types ────────────────────────────────────────────────────────────────────

interface Loaded { id: string; form: RecordForm; updatedAt: string; category: string | null; tab: string | null; findRow: string; noSheet?: boolean }
interface Check { problems: string[]; warnings: string[]; tab: string; findRow: string; moveTo: string | null; lines: Line[]; changes: Plain[]; kind?: 'record' | 'plan' }
export type EditorMode = 'edit' | 'new' | 'plan';
interface EntryOptions { groups: EntryGroup[]; activities: { name: string; category: string; groups?: { required?: string[]; shown?: string[] } }[]; labels: string[]; zones: ZoneRow[] }

/** Presets are deferred (Hyoje, 10 Nov): Copy recent covers the need for now. */
const PRESETS_ON = false;
/** Bowel values kept out of sight until asked for (Hyoje, 9 Nov). */
const BOWEL_FOLDED = ['길에서', '바지에'];
/** Minutes between two form points, or null. */
function minutesBetween(a: RecordForm['start'], b: RecordForm['start']): number | null {
  if (!a.date || !a.hour || !b.date || !b.hour) return null;
  const t = (p: RecordForm['start']) => { const [y, m, d] = p.date.split('-').map(Number); const [h, mi] = p.hour.split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi); };
  return Math.round((t(b) - t(a)) / 60000);
}

/** An entry group (groups.ts) → the editor's section. */
const GROUP_SECTION: Record<string, Optional | 'place' | 'notes' | null> = {
  place: 'place', notes: 'notes', cost: 'cost', purchase: 'purchase', meal: 'food', foods: 'food', drinks: 'food', alcohols: 'food',
  people: 'people', transport: 'transport', bowel: 'bowel', body: 'body', sleep: 'sleep', exercise: 'exercise',
  reading: 'reading', movie: 'movie', golf: 'golf', income: 'income', travel: 'travel',
};
/** "회사 - 회의실 1" → ["회사", "회의실 1"]: the place and its detail (67.8). */
const splitPlace = (v: string): [string, string] => { const i = v.indexOf(' - '); return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 3)]; };
const joinPlace = (a: string, b: string) => (b.trim() ? `${a.trim()} - ${b.trim()}` : a.trim());
interface Result {
  kind: 'saved' | 'deleted';
  /** Made in the entry app (#71): not in the sheet, nothing to repeat there. */
  noSheet?: boolean;
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

/** Ticking Whole meal: portions from the foods' own amounts (equal when those can't tell),
 *  the whole = their sum. `safe` = nothing typed would be lost (one unit, amounts that add up). */
function wholeFrom(foods: FormFood[]): { foods: Portioned[]; whole: { amount: number | null; unit: string }; safe: boolean } {
  const shares = portionsFromAmounts(foods);
  const out: Portioned[] = foods.map((x, i) => ({ ...x, portion: shares[i] ?? round1(100 / foods.length) }));
  const units = [...new Set(out.map(x => x.unit.trim()).filter(Boolean))];
  const nums = out.map(x => Number(String(x.amount).replace(/,/g, '')));
  const sum = out.length && nums.every(n => Number.isFinite(n) && String(out[0].amount).trim() !== '') ? nums.reduce((a, b) => a + b, 0) : null;
  // Unit: the foods' own one; none yet → 인분 (Hyoje, 12 Nov; can be changed); mixed → empty.
  return { foods: out, whole: { amount: sum != null ? round3(sum) : null, unit: units.length === 1 ? units[0] : units.length ? '' : '인분' }, safe: !out.length || (sum != null && units.length <= 1) };
}

function shareWhole(foods: Portioned[], w: { amount: any; unit: string }): Portioned[] {
  const n = foods.length;
  // Only a food without a portion yet gets an equal share; an emptied box stays empty while
  // it is typed into (Hyoje, 11 Nov: the last digit couldn't be deleted).
  const withP = foods.map(x => (x.portion === undefined ? { ...x, portion: n ? round1(100 / n) : null } : x));
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

/** A heading inside a section — Foods, Drinks, Alcohol … (Hyoje, 12 Nov: stand out more). */
const subhead = 'text-xs font-semibold text-stone-700 dark:text-zinc-200';

export function RecordEditor({ id, mode = 'edit', initial, presetId, copied, stampId, refusal }: { id: string; mode?: EditorMode; initial?: RecordForm; presetId?: string; copied?: boolean; stampId?: string;
  /** Opened from the outbox after the server refused it (offline, #71 step 3): why. */
  refusal?: { error?: string; problems?: string[] } }) {
  const router = useRouter();
  const entryMode = mode !== 'edit';
  // No signal while checking a new entry (#71 step 3): it may be saved on the phone after the
  // phone's own checks; the server checks it again when it is sent.
  const [checkOffline, setCheckOffline] = useState(false);
  const [entryOpts, setEntryOpts] = useState<EntryOptions | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  // Planned end (Hyoje, 10 Nov): shown read-only ("Planned until 12:00 ✎ ×") until ✎.
  const [plannedOpen, setPlannedOpen] = useState(false);
  // What it was when ✎ opened it: ↶ puts it back and closes (Hyoje, 10 Nov).
  const [plannedSnap, setPlannedSnap] = useState<RecordForm['plannedEnd'] | null>(null);
  const [bowelMore, setBowelMore] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const ingredientCache = useRef(new Map<string, string[]>());
  const allIngredients = useRef<Record<string, Record<string, string[]>> | null>(null);
  const repriced = useRef(false);
  const [presetBox, setPresetBox] = useState<null | { name: string; kind: 'open' | 'moment' | 'length'; minutes: string; error: string; saved: boolean }>(null);
  const [rec, setRec] = useState<Loaded | null>(null);
  const [opts, setOpts] = useState<FormOptions | null>(null);
  const [form, setForm] = useState<RecordForm | null>(null);
  const [added, setAdded] = useState<Set<Optional>>(new Set());
  // Removed by hand (13 Nov): a section the activity shows by default (its 'shown' groups) stays
  // hidden after Remove until it is added again.
  const [removed, setRemoved] = useState<Set<Optional>>(new Set());
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
  /** The entry app's cost starts in HOME_CURRENCY until KRW is picked (Hyoje, 11 Nov). */
  const [krwPicked, setKrwPicked] = useState(false);
  /** A rate typed for this record (undefined = the starting rate). */
  const [rateOverride, setRateOverride] = useState<number | string | null | undefined>(undefined);

  // Load the record and the pickers' values.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [r, o, e] = await Promise.all([
          mode === 'new' ? Promise.resolve(null) : fetch(mode === 'plan' ? `/api/entry/plans/${id}` : `/api/records/${id}`, { cache: 'no-store' }),
          opts ? Promise.resolve(null) : fetch('/api/records/options'),
          !entryOpts ? fetch('/api/entry/rules') : Promise.resolve(null),
        ]);
        let rb: any = mode === 'new' ? { id, form: initial, updatedAt: '', category: null, tab: null, findRow: '' } : await r!.json().catch(() => ({}));
        if (r && !r.ok) throw new Error(rb.error ?? `HTTP ${r.status}`);
        if (mode === 'plan') {
          if (rb.state !== 'open') throw new Error(rb.state === 'done' ? 'This plan is a record now: open it from Today or the Calendar.' : 'This plan was deleted.');
          rb = { ...rb, category: null, tab: null, findRow: '' };
        }
        if (e) {
          const eb = await e.json().catch(() => ({}));
          if (!e.ok) throw new Error(eb.error ?? `HTTP ${e.status}`);
          if (live) setEntryOpts(eb);
        }
        if (o) {
          const ob = await o.json().catch(() => ({}));
          if (!o.ok) throw new Error(ob.error ?? `HTTP ${o.status}`);
          if (live) setOpts(ob);
        }
        if (!live) return;
        // Whole meal starts ticked in the entry app (Hyoje, 11 Nov) when nothing typed would be
        // lost; an existing record opens with it off. The record's own form stays the
        // baseline (portions are page-only).
        let form0 = rb.form, whole0: { amount: any; unit: string } | null = null;
        if (mode !== 'edit' && rb.form?.food) {
          const w = wholeFrom(rb.form.food.foods ?? []);
          if (w.safe) { whole0 = w.whole; form0 = { ...rb.form, food: { ...rb.form.food, foods: shareWhole(w.foods, w.whole) } }; }
        }
        setRec(rb); setForm(form0); setAdded(new Set()); setRemoved(new Set()); setRateOverride(undefined); setWhole(whole0); setCheck(null); setSaveError(null); setLoadError(''); setKrwPicked(false);
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
  const changed = !!form && !result && formKey !== origKey;
  // A new entry or a plan is checked (and can be saved) as it is: confirming a plan unchanged is fine.
  const dirty = entryMode ? !!form && !result : changed;

  // Check as you type: half a second after the last change.
  const seq = useRef(0);
  useEffect(() => {
    if (!dirty || !form) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetchWithin(entryMode ? '/api/entry/check' : `/api/records/${id}/preview`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: formJson({ form }),
        }, 8000);
        const b = await r.json().catch(() => ({}));
        if (n !== seq.current) return;
        if (!r.ok) { setCheckError(b.error ?? `HTTP ${r.status}`); return; }
        setCheckError(''); setCheckOffline(false);
        setCheck({ for: formJson(form), data: entryMode ? { problems: b.problems ?? [], warnings: b.warnings ?? [], tab: '', findRow: '', moveTo: null, lines: [], changes: [], kind: b.kind } : b });
      } catch (e: any) {
        if (n !== seq.current) return;
        if (mode === 'new' && outboxOn() && isNoSignal(e)) { setCheckOffline(true); setCheckError(''); return; }
        setCheckError(String(e.message ?? e));
      }
    }, 500);
    return () => clearTimeout(t);
  }, [dirty, form, id, entryMode, mode]);

  const current = check && check.for === formKey ? check.data : null;

  // A start still to come makes a plan (in the entry app): a plan has no End, only a
  // planned end. Worked out here from the phone's clock, so the form changes at once.
  const planning = (() => {
    if (!entryMode || !form?.start.date) return false;
    const l = localNow(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London');
    const k = (d: string, h: string) => `${d} ${(h || '').padStart(5, '0')}`;
    return form.start.hour ? k(form.start.date, form.start.hour) > k(l.date, l.hour) : form.start.date > l.date;
  })();
  // An End typed before the start moved ahead becomes the planned end.
  useEffect(() => {
    if (!planning || !form || (!form.end.date && !form.end.hour)) return;
    setForm({ ...form, plannedEnd: form.plannedEnd.date || form.plannedEnd.hour ? form.plannedEnd : form.end, end: { date: '', hour: '', timezone: '' } });
  }, [planning, form]);
  const checking = dirty && !current && !checkError && !checkOffline;
  // Offline (#71 step 3): the phone's own checks — an activity from the list and a start date.
  // Everything else is checked by the server when the entry is sent.
  const offlineProblems = useMemo(() => {
    if (!checkOffline || !form) return [];
    const out: string[] = [];
    const a = form.activity.name.trim();
    if (!a) out.push('Activity is needed');
    else if (entryOpts && !entryOpts.activities.some(x => x.name === a)) out.push(`${a} isn’t in Activities`);
    if (!form.start.date) out.push('Start date is needed');
    return out;
  }, [checkOffline, form, entryOpts]);
  const offlineReady = checkOffline && !current && offlineProblems.length === 0;
  const canSave = dirty && !saving && (current ? current.problems.length === 0 : offlineReady);

  // Unsaved changes: ask before leaving (closing the tab, or a link in the app) — not when
  // leaving because it was just saved: with no signal the move to Home is a full page load,
  // which asked "Leave site?" (Hyoje, 12 Nov).
  const leaving = useRef(false);
  /** After a save: Home replaces the form in history, so Back doesn't reopen it (12 Nov). */
  const leaveTo = (href: string) => { leaving.current = true; router.replace(href); };
  /** Opened from the Calendar (13 Nov): ?back=/calendar?… — saving returns there instead of Today. */
  const backTo = (): string | null => {
    if (typeof window === 'undefined') return null;
    const b = new URLSearchParams(window.location.search).get('back');
    return b && b.startsWith('/') && !b.startsWith('//') ? b : null;
  };
  useEffect(() => {
    if (!changed) return;
    const onUnload = (e: BeforeUnloadEvent) => { if (leaving.current) return; e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.getAttribute('href')?.startsWith('#')) return;
      if (!window.confirm('Leave without saving? Your changes will be lost.')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', onUnload); document.removeEventListener('click', onClick, true); };
  }, [changed]);

  // Copy recent: a foreign amount is priced at the Exchange rates list's rate (Hyoje, 8 Nov).
  useEffect(() => {
    if (repriced.current || mode !== 'new' || !copied || !form || !opts) return;
    repriced.current = true;
    const c = form.cost;
    const r = opts.rates.find(x => x.currency === c.currency)?.rateKRW;
    if (c.currency && typeof c.amountForeign === 'number' && typeof r === 'number') {
      setForm({ ...form, cost: { ...c, amountKRW: Math.round(c.amountForeign * r) } });
    }
  }, [mode, copied, form, opts]);

  // A food or drink typed in full: its ingredients from the latest record with it, while empty (Hyoje, 10 Nov).
  const foodNames = form ? JSON.stringify([form.food.foods.map(x => [x.item, x.ingredients.length]), form.food.drinks.map(x => [x.item, x.ingredients.length])]) : '';
  useEffect(() => {
    if (!form || !opts) return;
    const known = { foods: new Set(opts.used.foodItems), drinks: new Set(opts.used.drinkItems) };
    const wanted: { kind: 'foods' | 'drinks'; i: number; item: string }[] = [];
    for (const kind of ['foods', 'drinks'] as const) {
      form.food[kind].forEach((x, i) => { const it = x.item.trim(); if (it && !x.ingredients.length && known[kind].has(it)) wanted.push({ kind, i, item: it }); });
    }
    if (!wanted.length) return;
    let live = true;
    const t = setTimeout(async () => {
      const found: { kind: 'foods' | 'drinks'; i: number; item: string; ingredients: string[] }[] = [];
      for (const w of wanted) {
        const key = `${w.kind}\u0001${w.item}`;
        let ing = ingredientCache.current.get(key);
        if (!ing) {
          try {
            const r = await fetch(`/api/entry/ingredients?${new URLSearchParams({ kind: w.kind, item: w.item })}`);
            const b = await r.json().catch(() => ({}));
            ing = Array.isArray(b.ingredients) ? b.ingredients : [];
          } catch {
            // No signal (#71 step 3): the whole list the phone keeps (saved by Home).
            if (!allIngredients.current) {
              allIngredients.current = await fetch('/api/entry/ingredients?all=1').then(r => r.json()).catch(() => ({}));
            }
            ing = allIngredients.current?.[w.kind]?.[w.item] ?? [];
          }
          ingredientCache.current.set(key, ing!);
        }
        if (ing!.length) found.push({ ...w, ingredients: ing! });
      }
      if (!live || !found.length) return;
      setForm(cur => {
        if (!cur) return cur;
        const food = { ...cur.food, foods: [...cur.food.foods], drinks: [...cur.food.drinks] };
        for (const x of found) {
          const row = food[x.kind][x.i];
          if (row && row.item.trim() === x.item && !row.ingredients.length) food[x.kind][x.i] = { ...row, ingredients: x.ingredients };
        }
        return { ...cur, food };
      });
    }, 500);
    return () => { live = false; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foodNames, opts]);

  const goBack = useCallback(() => {
    if (changed && !window.confirm('Leave without saving? Your changes will be lost.')) return;
    // Opened from the Calendar: Cancel goes back there too (13 Nov).
    if (entryMode) { const b = backTo(); if (b) { leaving.current = true; router.replace(b); } else router.push('/entry'); return; }
    if (window.history.length > 1) router.back(); else router.push('/calendar');
  }, [changed, router, entryMode]);

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

  async function save(override?: RecordForm) {
    const fm = override ?? form;
    if (!rec || !fm || (!override && !canSave) || saving) return;
    setSaving(true); setSaveError(null);
    if (entryMode) {
      // No signal (#71 step 3): a new entry waits in the outbox on the phone and is sent,
      // under the same ID, once there is one.
      const queue = () => {
        putOutbox({
          id, kind: 'entry', url: '/api/entry/records', method: 'POST',
          body: JSON.parse(formJson({ id, form: fm, presetId, stampId })),
          label: [fm.activity.name.trim(), fm.activity.title.trim()].filter(Boolean).join(' · ') || 'New entry',
          when: `${fm.start.date} ${fm.start.hour}`.trim(),
        });
        leaveTo(backTo() ?? `/entry?queued=${id}`);
      };
      if (mode === 'new' && outboxOn() && navigator.onLine === false) { setSaving(false); queue(); return; }
      try {
        const r = mode === 'new'
          ? await (outboxOn() ? fetchWithin('/api/entry/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: formJson({ id, form: fm, presetId, stampId }) }, 12000)
            : fetch('/api/entry/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: formJson({ id, form: fm, presetId, stampId }) }))
          : await fetch(`/api/entry/plans/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: formJson({ form: fm, updatedAt: rec.updatedAt }) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, problems: b.problems, conflict: r.status === 409 }); return; }
        if (mode === 'new') dropOutbox(id);   // reopened from the outbox and saved with a signal
        const saved = new URLSearchParams({ saved: b.kind, id: b.id ?? id });
        if (mode === 'plan') saved.set('from', 'plan');
        leaveTo(backTo() ?? `/entry?${saved}`);
      } catch (e: any) {
        if (mode === 'new' && outboxOn() && isNoSignal(e)) { queue(); return; }
        setSaveError({ text: String(e.message ?? e) });
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const r = await fetch(`/api/records/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: formJson({ form: fm, updatedAt: rec.updatedAt }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, problems: b.problems, conflict: r.status === 409 }); return; }
      setResult({ kind: 'saved', noSheet: !!b.noSheet, changeId: b.changeId, tab: b.tab, findRow: b.findRow, moveTo: b.moveTo, lines: b.lines, changes: b.changes ?? [], sheetDone: !!b.noSheet, undone: null });
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setSaveError({ text: String(e.message ?? e) });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!rec) return;
    if (mode === 'plan') {
      setSaving(true); setSaveError(null);
      try {
        const r = await fetch(`/api/entry/plans/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt: rec.updatedAt }) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, conflict: r.status === 409 }); return; }
        leaveTo(backTo() ?? `/entry?deleted=${id}`);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!window.confirm('Delete this record?\n\nIt goes to the trash; Undo on the next screen puts it back.')) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch(`/api/records/${id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt: rec.updatedAt }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, conflict: r.status === 409 }); return; }
      setResult({ kind: 'deleted', noSheet: !!b.noSheet, changeId: b.changeId, tab: b.tab, findRow: b.findRow, moveTo: null, lines: b.lines, changes: [], sheetDone: !!b.noSheet, undone: null });
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
      if (result.noSheet) { setResult({ ...result, undone: { sheetNeeded: false, changeId: b.changeId, sheetDone: true, tab: '', findRow: '', moveTo: null, lines: [], changes: [] } }); return; }
      setResult({ ...result, undone: { sheetNeeded: !!b.sheetNeeded, changeId: b.changeId, sheetDone: false, tab: b.tab, findRow: b.findRow, moveTo: b.moveTo ?? null, lines: b.lines ?? [], changes: b.changes ?? [] } });
    } finally {
      setBusy(false);
    }
  }

  // ── Result screen ───────────────────────────────────────────────────────────

  if (result) {
    const gone = result.kind === 'deleted' && !result.undone;
    const u = result.undone;
    const showSheet = !result.noSheet && (!u || u.sheetNeeded);
    const done = u ? u.sheetDone : result.sheetDone;
    return (
      <div className="flex flex-col flex-1 px-4 py-6 max-w-3xl mx-auto w-full gap-4">
        <div>
          <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">
            {result.undone ? (result.kind === 'saved' ? 'Edit undone' : 'Delete undone') : result.kind === 'saved' ? 'Saved' : 'Deleted'}
          </h1>
          <p className="text-sm text-stone-600 dark:text-zinc-300 mt-1">
            {result.noSheet
              ? u ? 'Undone. Nothing to do in the sheet.'
                : `${result.kind === 'saved' ? 'Saved' : 'In the trash'}. Nothing to do in the sheet.`
              : u
              ? u.sheetNeeded
                ? result.kind === 'saved'
                  ? 'The record is back as it was. You had repeated the edit in the sheet, so undo it there too: make the changes below there, then press Mark repeated.'
                  : 'The record is back. You had deleted the row in the sheet, so add it back there as below, then press Mark repeated.'
                : 'The record is back as it was. Nothing to do in the sheet: the change had not been repeated there.'
              : result.kind === 'saved'
                ? 'Repeat these changes in the sheet, then press Mark repeated. Until then, the migrations wait.'
                : 'The record is in the trash. Delete the row in the sheet, then press Mark repeated. Until then, the migrations wait.'}
          </p>
          {!done && !result.noSheet && (
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
        {result.noSheet && !u && (
          <div><button onClick={undo} disabled={busy} className={secondary}>{result.kind === 'saved' ? 'Undo this edit' : 'Undo the delete'}</button></div>
        )}
        {resultError && <p className="text-sm text-red-700 dark:text-red-300">{resultError}</p>}

        <div className="flex flex-wrap gap-2">
          {!gone && <button onClick={() => { setResult(null); setReload(n => n + 1); }} className={secondary}>Open the record</button>}
          <Link href="/entry" className={secondary}>Today</Link>
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
  const rules = entryMode && entryOpts ? rulesFor(f.activity.name.trim(), entryOpts.activities) : null;
  const ruleSections = new Set((rules?.shown ?? []).map(k => GROUP_SECTION[k]).filter(Boolean));
  const requiredSections = new Set((rules?.required ?? []).map(k => GROUP_SECTION[k]).filter(Boolean));
  const req = (k: string) => (requiredSections.has(k as any) ? ' · required' : '');
  const shown = (k: Optional) => added.has(k) || hasData(f, k) || (k === 'transport' && journeyNeeded) || (ruleSections.has(k) && !removed.has(k));
  const hide = (k: Optional) => {
    setForm(prev => (prev ? cleared(prev, k) : prev));
    setAdded(s => { const n = new Set(s); n.delete(k); return n; });
    setRemoved(s => new Set(s).add(k));
  };
  const ref = (name: string) => opts.ref[name] ?? [];
  const category = lookups.actCat.get(f.activity.name.trim());
  const used = opts.used;
  const placeSuggest = entryMode && entryOpts ? [...entryOpts.labels, ...used.places.filter(x => !entryOpts.labels.includes(x))] : used.places;
  const removeBtn = (k: Optional) => (requiredSections.has(k) ? undefined : () => hide(k));
  // Reset on each card of a copied record (Hyoje, 9 Nov): clears that card's amounts / scores.
  const resetBtn = (k: ResettableSection) => (mode === 'new' && copied && RESETTABLE.includes(k) ? () => setForm(resetSection(f, k)) : undefined);

  // Whole meal: one amount for all the foods, shared evenly — as the sheet's 'A+B' with one
  // amount, which the migration divides (Hyoje, 7 Nov). Off when a record opens.
  const setWholeMeal = (w: { amount: any; unit: string }, foods: Portioned[] = f.food.foods) => {
    setWhole(w);
    patch('food', { foods: shareWhole(foods, w) });
  };
  const toggleWhole = (on: boolean) => {
    if (!on) { setWhole(null); patch('food', { foods: f.food.foods.map((x: Portioned) => { const y = { ...x }; delete y.portion; return y; }) }); return; }
    const w = wholeFrom(f.food.foods);
    setWholeMeal(w.whole, w.foods);
  };
  const fatKg = (weight: unknown, pct: unknown) =>
    typeof weight === 'number' && typeof pct === 'number' ? Math.round(weight * pct / 10) / 10 : null;

  // Cost: the rate for a foreign amount.
  const latestRate = (cur: string) => opts.rates.find(r => r.currency === cur)?.rateKRW ?? null;
  const saved = rec.form.cost;
  const impliedRate = !entryMode && saved.currency && Number(saved.amountForeign) > 0 && Number(saved.amountKRW) > 0
    ? Math.round((Number(saved.amountKRW) / Number(saved.amountForeign)) * 100) / 100 : null;
  // The currency shown: the form's, or in the entry app HOME_CURRENCY while no amount is
  // typed and KRW wasn't picked. It goes into the form with the first amount typed.
  const cur = f.cost.currency || (entryMode && !krwPicked && f.cost.amountKRW == null && f.cost.amountForeign == null
    && opts.currencies.includes(HOME_CURRENCY) ? HOME_CURRENCY : '');
  const rate: any = rateOverride !== undefined ? rateOverride
    : (cur === saved.currency && impliedRate != null ? impliedRate : latestRate(cur));
  const krw = (foreign: unknown, r: unknown) =>
    typeof foreign === 'number' && typeof r === 'number' && Number.isFinite(foreign * r) ? Math.round(foreign * r) : null;
  const setCurrency = (cur: string) => {
    if (!cur) { setRateOverride(undefined); setKrwPicked(true); patch('cost', { currency: '', amountForeign: null }); return; }
    const r = latestRate(cur);
    setRateOverride(r);
    patch('cost', { currency: cur, amountKRW: krw(f.cost.amountForeign, r) });
  };

  // Now / Later / End now (Hyoje, 9 Nov): the phone's time, in the list's zone code for it.
  const nowPoint = (plusMinutes = 0): RecordForm['start'] => {
    const iana = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
    const l = localNow(iana, Date.now() + plusMinutes * 60_000);
    return { ...l, timezone: (entryOpts && zoneCodeFor(iana, l.date, l.hour, entryOpts.zones)) || f.start.timezone || '' };
  };
  const setStart = (p: RecordForm['start']) => {
    // Moving the start keeps the length when there is an end, and the planned length.
    const keep = (to: RecordForm['end']) => {
      const len = minutesBetween(f.start, to);
      return len != null && len >= 0 ? { ...addMinutes(p.date, p.hour, len), timezone: to.timezone || p.timezone } : to;
    };
    setForm({ ...f, start: p, end: keep(f.end), plannedEnd: keep(f.plannedEnd) });
    setLaterOpen(false);
  };
  const endNowAndSave = () => {
    const next = { ...f, end: nowPoint() };
    setForm(next);
    save(next);
  };
  const planHappened = async (how: 'onTime' | 'done') => {
    if (!rec) return;
    setSaving(true); setSaveError(null);
    try {
      const r = await fetch(`/api/entry/plans/${id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt: rec.updatedAt, how }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setSaveError({ text: b.error ?? `HTTP ${r.status}`, problems: b.problems, conflict: r.status === 409 }); return; }
      leaveTo(backTo() ?? `/entry?${new URLSearchParams({ saved: 'record', id: b.recordId, from: 'plan' })}`);
    } finally {
      setSaving(false);
    }
  };

  // An end typed without a zone takes the start's zone (Hyoje, 8 Nov); it can still be changed.
  const setPoint = (which: 'start' | 'end' | 'plannedEnd', p: Partial<RecordForm['start']>) =>
    patch(which, which !== 'start' && !f[which].timezone && f.start.timezone && (p.date || p.hour) ? { ...p, timezone: f.start.timezone } : p);
  const clearPlanned = () => { patch('plannedEnd', { date: '', hour: '', timezone: '' }); setPlannedOpen(false); };
  const openPlanned = () => { setPlannedSnap({ ...f.plannedEnd }); setPlannedOpen(true); };
  const cancelPlanned = () => { if (plannedSnap) patch('plannedEnd', plannedSnap); setPlannedOpen(false); };
  const point = (which: 'start' | 'end' | 'plannedEnd') => {
    const p = f[which];
    const wd = weekdayText(p.date);
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500 dark:text-zinc-400">{which === 'start' ? 'Start' : which === 'end' ? 'End' : 'Planned end'}{wd ? ` · ${wd.slice(0, 3)}` : ''}</span>
          <span className="flex-1" />
          {which === 'plannedEnd' ? (
            <span className="flex items-center gap-1.5">
              {!planning && plannedOpen && <>
                <button type="button" className={addBtn} onClick={() => setPlannedOpen(false)} aria-label="Done: keep the planned end" title="Done">✓</button>
                <button type="button" className={addBtn} onClick={cancelPlanned} aria-label="Cancel: put the planned end back" title="Cancel">↶</button>
              </>}
              {(p.date || p.hour) && <button type="button" className={addBtn} onClick={clearPlanned} aria-label="Remove the planned end" title="Remove">×</button>}
            </span>
          ) : nowLater(which)}
        </div>
        {/* date and time get the room; the zone box shows its code (GMT) on a narrow phone */}
        <div className="grid grid-cols-[minmax(0,125fr)_minmax(0,88fr)_minmax(0,60fr)] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
          <input type="date" value={p.date} onChange={e => setPoint(which, { date: e.target.value })} aria-label={`${which} date`} className={`${inputCls} min-w-0 px-1 text-[13px] sm:text-sm`} />
          {pickerTime(p.hour) != null
            ? <input type="time" value={pickerTime(p.hour)!} onChange={e => setPoint(which, { hour: e.target.value })} aria-label={`${which} time`} className={`${inputCls} font-mono min-w-0 px-1 text-[13px] sm:text-sm`} />
            : <input value={p.hour} onChange={e => setPoint(which, { hour: e.target.value })} placeholder="H:mm" aria-label={`${which} time`} className={`${inputCls} font-mono min-w-0 px-1 text-[13px] sm:text-sm`} />}
          <Select value={p.timezone} onChange={v => patch(which, { timezone: v })} options={lookups.zones} empty="Zone"
            className="min-w-0 max-sm:appearance-none max-sm:px-1 max-sm:text-center max-sm:text-[13px]" />
        </div>
      </div>
    );
  };
  const nowLater = (which: 'start' | 'end') => (
    <span className="flex items-center gap-1.5">
      {/* = Start (13 Nov): no duration, for a moment's activity recorded afterwards */}
      {which === 'end' && (
        <button type="button" className={addBtn} disabled={!f.start.date}
          onClick={() => patch('end', { date: f.start.date, hour: f.start.hour, timezone: f.start.timezone })}
          aria-label="End at the start time (no duration)" title="End at the start time (no duration)">= Start</button>
      )}
      <button type="button" className={addBtn} onClick={() => (which === 'start' ? setStart(nowPoint()) : setPoint('end', nowPoint()))}>Now</button>
      {which === 'start' && (
        <span className="relative">
          <button type="button" className={addBtn} aria-expanded={laterOpen} onClick={() => setLaterOpen(v => !v)}>Later ▾</button>
          {laterOpen && (
            <span className="absolute right-0 top-full mt-1 z-30 flex gap-1 rounded border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 shadow">
              {[10, 30, 60].map(m => (
                <button key={m} type="button" className="px-2 py-1 rounded text-xs whitespace-nowrap text-stone-700 dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-zinc-800" onClick={() => setStart(nowPoint(m))}>
                  {m < 60 ? `${m} min` : '1 hour'}
                </button>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );

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
      {entryMode && current && (
        <p className="text-sm text-stone-700 dark:text-zinc-200">{current.kind === 'plan'
          ? 'Starts later: it will be saved as a plan, and wait in To confirm once its start has passed.'
          : 'Will be saved as a record.'}</p>
      )}
      {checking && <p className="text-sm text-stone-500 dark:text-zinc-400">Checking…</p>}
      {refusal && (
        <div className="text-sm rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 px-3 py-2">
          <p>Saved on the phone with no signal, but not saved when it was sent. Fix it and save again.</p>
          {refusal.problems?.length ? <ul className="list-disc ml-5 mt-1">{refusal.problems.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
        </div>
      )}
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
          {current.lines.length > 0 && !rec.noSheet && (
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
    : checkOffline && !current ? (offlineProblems.length
      ? <span className="text-red-700 dark:text-red-300">No signal · {offlineProblems[0]}</span>
      : <span className="text-amber-700 dark:text-amber-300">No signal · saves on the phone, checked when sent</span>)
    : checking ? <span className="text-stone-500 dark:text-zinc-400">Checking…</span>
    : problems.length ? <a href="#check" className="text-red-700 dark:text-red-300 underline">{plural(problems.length, 'problem')}: can’t save yet</a>
    : entryMode ? <span className="text-stone-700 dark:text-zinc-200">Ready{current!.kind === 'plan' ? ' · a plan' : ''}{warnings.length ? <a href="#check" className="text-amber-700 dark:text-amber-300 underline"> · {plural(warnings.length, 'note')}</a> : null}</span>
    : <span className="text-stone-700 dark:text-zinc-200">Ready · <a href="#check" className="underline">{plural((current!.changes?.length || current!.lines.length), 'change')}</a>{warnings.length ? <a href="#check" className="text-amber-700 dark:text-amber-300 underline"> · {plural(warnings.length, 'note')}</a> : null}</span>;

  return (
    <div className="flex flex-col flex-1 w-full pb-24">
      <div className="px-4 pt-6 max-w-6xl mx-auto w-full">
        <button onClick={goBack} className="text-xs text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-100">← Back</button>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold text-stone-800 dark:text-zinc-100">{mode === 'new' ? 'New' : mode === 'plan' ? 'Plan' : 'Edit record'}</h1>
          {mode === 'edit' && <span className="text-xs text-stone-500 dark:text-zinc-400">Tab {rec.tab ?? '(none)'} · <span className="font-mono break-all">{rec.findRow}</span></span>}
          {mode === 'plan' && <span className="text-xs text-stone-500 dark:text-zinc-400">Change anything; a start that has passed makes it a record.</span>}
          {mode === 'plan' && (
            <span className="flex flex-wrap gap-2 mt-1">
              <button onClick={() => planHappened('done')} disabled={saving} className={secondary}>Done as planned</button>
              <button onClick={() => planHappened('onTime')} disabled={saving} className={secondary}>Started as planned</button>
            </span>
          )}
        </div>
      </div>

      <div className="px-3 sm:px-4 py-3 sm:py-4 max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-3 sm:gap-4 items-start">
        <div className="flex flex-col gap-3 sm:gap-4 min-w-0">
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
            {/* Denser on the Fold 6 outer screen (Hyoje, 9 Nov): pairs share a row everywhere. */}
            {/* relative: the activity suggestions use the whole row, Title included (Hyoje, 10 Nov). */}
            <div className="relative grid grid-cols-[minmax(0,3fr)_minmax(0,7fr)] gap-3">
              <Field label="Activity" note={f.activity.name.trim() ? (category ? category : 'Not in Activities') : undefined}>
                <Text value={f.activity.name} onChange={v => patch('activity', { name: v })} suggest={lookups.activityNames} describe={v => lookups.actCat.get(v)} wideList />
              </Field>
              <Field label="Title"><Text value={f.activity.title} onChange={v => patch('activity', { title: v })} /></Field>
            </div>
            {infoOpen || f.activity.additionalInfo.trim()
              ? <Field label="Additional info"><Text value={f.activity.additionalInfo} onChange={v => patch('activity', { additionalInfo: v })} /></Field>
              : <div><button type="button" className={addBtn} onClick={() => setInfoOpen(true)}>+ Additional info</button></div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cross activity" group><Choice value={f.activity.crossActivity} onChange={v => patch('activity', { crossActivity: v })} options={ref('activity.crossActivity')} cols={2} /></Field>
              <Field label="Relationship">
                <div aria-readonly data-testid="relationship" className="rounded border border-stone-200 dark:border-zinc-700 bg-stone-100 dark:bg-zinc-800 px-2 py-1.5 text-sm text-stone-600 dark:text-zinc-300">{relationshipOf(f.people)}</div>
              </Field>
            </div>
          </Section>

          <Section title="Time">
            {point('start')}
            {planning ? point('plannedEnd') : point('end')}
            {!planning && (plannedOpen ? point('plannedEnd') : f.plannedEnd.date || f.plannedEnd.hour ? (
              <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-zinc-300">
                <span>Planned until {f.plannedEnd.date && f.plannedEnd.date !== f.start.date ? `${weekdayText(f.plannedEnd.date)?.slice(0, 3) ?? ''} ${f.plannedEnd.date.slice(8).replace(/^0/, '')} ` : ''}{f.plannedEnd.hour}</span>
                <button type="button" className={addBtn} onClick={openPlanned} aria-label="Change the planned end">✎</button>
                <button type="button" className={addBtn} onClick={clearPlanned} aria-label="Remove the planned end">×</button>
              </div>
            ) : !f.end.hour && (entryMode || !f.end.date || !!f.start.hour) && (
              <div><button type="button" className={addBtn} onClick={openPlanned}>+ Planned end</button></div>
            ))}
            <p className="text-xs text-stone-400 dark:text-zinc-500">{planning
              ? 'A plan: the planned end is when it should end. End is set when it happens.'
              : 'No times = all day. A start time without an end time = still going (an open record).'}</p>
          </Section>

          <Section title={`Place${req('place')}`}>
            {entryMode ? (
              <div className="grid grid-cols-[minmax(0,6fr)_minmax(0,4fr)] gap-3">
                <Field label="Place">
                  <Text value={splitPlace(f.location.activity)[0]} onChange={v => patch('location', { activity: joinPlace(v, splitPlace(f.location.activity)[1]) })}
                    suggest={[...(entryOpts?.labels ?? []), ...used.places.filter(x => !(entryOpts?.labels ?? []).includes(x))]} />
                </Field>
                <Field label="Detail">
                  <Text value={splitPlace(f.location.activity)[1]} onChange={v => patch('location', { activity: joinPlace(splitPlace(f.location.activity)[0], v) })} />
                </Field>
              </div>
            ) : (
              <Field label="Place"><Text value={f.location.activity} onChange={v => patch('location', { activity: v })} suggest={used.places} /></Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Online"><Text value={f.location.online} onChange={v => patch('location', { online: v })} suggest={used.online} /></Field>
              <Field label="Someone else’s place"><Text value={f.location.other} onChange={v => patch('location', { other: v })} suggest={used.places} /></Field>
            </div>
          </Section>

          {shown('people') && (
            <Section title={`People${req('people')}`} onRemove={removeBtn('people')}>
              <PeopleEditor people={f.people} onChange={v => set('people', v)} methods={ref('people.method')} categories={ref('people.category')} names={used.people} />
            </Section>
          )}

          {shown('transport') && (
            <Section title={`Journey${req('transport')}`} onRemove={journeyNeeded ? undefined : removeBtn('transport')}>
              {/* One row each on the phone too (Hyoje, 12 Nov). Return type only for 귀가 to 집
                  (the one case that needs it), or when the record has one already. */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <Field label="From"><Text value={f.transport.from} onChange={v => patch('transport', { from: v })} suggest={placeSuggest} /></Field>
                <Field label="To"><Text value={f.transport.to} onChange={v => patch('transport', { to: v })} suggest={placeSuggest} /></Field>
              </div>
              {(() => {
                const home = f.transport.to.trim() === '집' || f.transport.to.trim().startsWith('집 - ');
                const needReturn = (home && f.transport.purpose === '귀가') || !!f.transport.returnType;
                return (
                  <div className={`grid gap-2.5 sm:gap-3 ${needReturn ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <Field label="Purpose" group><Choice value={f.transport.purpose} onChange={v => patch('transport', { purpose: v })} options={ref('transport.purpose')} cols={2} /></Field>
                    <Field label="Method" group><Choice value={f.transport.method} onChange={v => patch('transport', { method: v })} options={ref('transport.method')} cols={2} /></Field>
                    {needReturn && <Field label="Return type" group><Choice value={f.transport.returnType} onChange={v => patch('transport', { returnType: v })} options={ref('transport.returnType')} cols={1} maxLen={8} /></Field>}
                  </div>
                );
              })()}
            </Section>
          )}

          {shown('cost') && (
            <Section title={`Cost${req('cost')}`} onRemove={removeBtn('cost')} onReset={resetBtn('cost')}>
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
                <Field label="Currency"><Select value={cur} onChange={setCurrency} options={opts.currencies} empty="— (KRW)" /></Field>
                {cur ? (
                  <>
                    <Field label={`Amount (${cur})`}><NumberBox value={f.cost.amountForeign} onChange={v => patch('cost', { currency: cur, amountForeign: v, amountKRW: krw(v, rate) })} /></Field>
                    <Field label={`Rate (₩ per 1 ${cur})`}><NumberBox value={rate} onChange={v => { setRateOverride(v); patch('cost', { amountKRW: krw(f.cost.amountForeign, v) }); }} /></Field>
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
            <Section title={`Purchases${req('purchase')}`} onRemove={removeBtn('purchase')} onReset={resetBtn('purchase')}>
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
            <Section title={`Food & drink${req('food')}`} onRemove={removeBtn('food')} onReset={resetBtn('food')}>
              {/* Pills in one row (Hyoje, 12 Nov): Type across two columns, the levels one each. */}
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2 flex flex-col gap-1"><span className={subhead}>Type</span>
                  <OnePills value={f.food.type} options={ref('food.type')} onChange={v => patch('food', { type: v })} cols={3} /></div>
                {(['carbs', 'fat', 'spiciness'] as const).map(k => (
                  <div key={k} className="flex flex-col gap-1"><span className={subhead}>{k === 'carbs' ? 'Carbs' : k === 'fat' ? 'Fat' : 'Spicy'}</span>
                    <OnePills value={f.food[k]} options={ref('nutrient_level')} onChange={v => patch('food', { [k]: v })} /></div>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={subhead}>Foods</span>
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
              <div className="flex flex-col gap-1"><span className={subhead}>Drinks</span>{foodRows('drinks')}</div>
              <div className="flex flex-col gap-1">
                <span className={subhead}>Alcohol</span>
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
            <Section title={`Exercise${req('exercise')}`} onRemove={removeBtn('exercise')} onReset={resetBtn('exercise')}>
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
            <Section title={`Body${req('body')}`} onRemove={removeBtn('body')} onReset={resetBtn('body')}>
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
            <Section title={`Sleep${req('sleep')}`} onRemove={removeBtn('sleep')} onReset={resetBtn('sleep')}>
              <Field label="Quality"><Text value={f.sleep.quality} onChange={v => patch('sleep', { quality: v })} suggest={used.sleep} /></Field>
            </Section>
          )}

          {shown('bowel') && (
            <Section title={`Bowel${req('bowel')}`} onRemove={removeBtn('bowel')} onReset={resetBtn('bowel')}>
              <div className="flex flex-col gap-1"><span className={subhead}>Amount</span>
                {/* pills like Quality, but one choice (a tap on the chosen one clears it) */}
                <ToggleChips values={f.bowel.amount ? [f.bowel.amount] : []} options={opts.bowel.amount}
                  onChange={v => patch('bowel', { amount: v.filter(x => x !== f.bowel.amount)[0] ?? '' })} /></div>
              <div className="flex flex-col gap-1"><span className={subhead}>Quality</span>
                <ToggleChips values={f.bowel.quality} onChange={v => patch('bowel', { quality: v })}
                  options={bowelMore ? opts.bowel.quality : opts.bowel.quality.filter(o => !BOWEL_FOLDED.includes(o) || f.bowel.quality.includes(o))} /></div>
              <div className="flex flex-col gap-1"><span className={subhead}>Characteristics</span>
                <ToggleChips values={f.bowel.characteristics} onChange={v => patch('bowel', { characteristics: v })}
                  options={bowelMore ? opts.bowel.characteristics : opts.bowel.characteristics.filter(o => !BOWEL_FOLDED.includes(o) || f.bowel.characteristics.includes(o))} /></div>
              {!bowelMore && [...opts.bowel.quality, ...opts.bowel.characteristics].some(o => BOWEL_FOLDED.includes(o) && !f.bowel.characteristics.includes(o) && !f.bowel.quality.includes(o)) && (
                <div><button type="button" className="text-xs text-stone-500 dark:text-zinc-400 underline" onClick={() => setBowelMore(true)}>More</button></div>
              )}
            </Section>
          )}

          {shown('golf') && (
            <Section title={`Golf${req('golf')}`} onRemove={removeBtn('golf')} onReset={resetBtn('golf')}>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Score"><NumberBox value={f.golf.score} onChange={v => patch('golf', { score: v })} /></Field>
                <Field label="Approach"><NumberBox value={f.golf.approach} onChange={v => patch('golf', { approach: v })} /></Field>
                <Field label="Putts"><NumberBox value={f.golf.putts} onChange={v => patch('golf', { putts: v })} /></Field>
              </div>
            </Section>
          )}

          {shown('reading') && (
            <Section title={`Reading${req('reading')}`} onRemove={removeBtn('reading')}>
              <Field label="Book title"><Text value={f.reading.title} onChange={v => patch('reading', { title: v })} /></Field>
            </Section>
          )}

          {shown('movie') && (
            <Section title={`Movie${req('movie')}`} onRemove={removeBtn('movie')}>
              <Field label="Movie title"><Text value={f.movie.title} onChange={v => patch('movie', { title: v })} /></Field>
            </Section>
          )}

          {shown('travel') && (
            <Section title={`Travel${req('travel')}`} onRemove={removeBtn('travel')}>
              <Row>
                <Field label="City"><Text value={f.travel.city} onChange={v => patch('travel', { city: v })} suggest={used.cities} /></Field>
                <Field label="Theme"><Text value={f.travel.theme} onChange={v => patch('travel', { theme: v })} suggest={used.themes} /></Field>
              </Row>
            </Section>
          )}

          {shown('income') && (
            <Section title={`Income${req('income')}`} onRemove={removeBtn('income')} onReset={resetBtn('income')}>
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
                <button key={o.key} type="button" onClick={() => { setAdded(s => new Set(s).add(o.key)); setRemoved(s => { const n = new Set(s); n.delete(o.key); return n; }); }} className={addBtn}>+ {o.title}</button>
              ))}
            </div>
          )}

          <Section title="Notes" onReset={resetBtn('notes')}>
            <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={3} className={`${inputCls} resize-y`} />
          </Section>

          {mode === 'new' && PRESETS_ON && (
            <div className="flex flex-col gap-2">
              {!presetBox ? (
                <div><button type="button" className={addBtn} onClick={() => setPresetBox({ name: f.activity.title.trim() || f.activity.name.trim(), kind: f.end.date ? 'length' : 'open', minutes: '', error: '', saved: false })}>Save as preset…</button></div>
              ) : presetBox.saved ? (
                <p className="text-sm text-stone-600 dark:text-zinc-300">Preset “{presetBox.name}” saved: it is on the home screen now. (This entry is not saved yet.)</p>
              ) : (
                <Section title="Save as preset">
                  <p className="text-xs text-stone-500 dark:text-zinc-400">Keeps the activity and everything filled in here, but not the times. A tap on the home screen opens this form filled in.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Name"><Text value={presetBox.name} onChange={v => setPresetBox({ ...presetBox, name: v, error: '' })} /></Field>
                    <Field label="Time">
                      <Select value={presetBox.kind} onChange={v => setPresetBox({ ...presetBox, kind: (v || 'length') as any, error: '' })}
                        options={[{ value: 'open', label: 'Starts now, stays open' }, { value: 'moment', label: 'A moment (start = end)' }, { value: 'length', label: 'Now, for a usual length' }]} />
                    </Field>
                    {presetBox.kind === 'length' && <Field label="Usual length"><Text value={presetBox.minutes} onChange={v => setPresetBox({ ...presetBox, minutes: v, error: '' })} placeholder="minutes" /></Field>}
                  </div>
                  {presetBox.error && <p className="text-sm text-red-700 dark:text-red-300">{presetBox.error}</p>}
                  <div className="flex gap-2">
                    <button type="button" className={primary} onClick={async () => {
                      const r = await fetch('/api/entry/presets', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: formJson({ name: presetBox.name, form: f, time: { kind: presetBox.kind, minutes: presetBox.minutes } }) });
                      const b = await r.json().catch(() => ({}));
                      setPresetBox(r.ok ? { ...presetBox, saved: true } : { ...presetBox, error: b.error ?? `HTTP ${r.status}` });
                    }}>Save preset</button>
                    <button type="button" className={secondary} onClick={() => setPresetBox(null)}>Cancel</button>
                  </div>
                </Section>
              )}
            </div>
          )}

          {mode !== 'new' && (
            <div className="flex justify-end">
              <button onClick={remove} disabled={saving} className={danger}>{mode === 'plan' ? 'Delete this plan' : 'Delete this record'}</button>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4">{checkPanel}</div>
      </div>

      {/* Save bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-stone-200 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* the status gets a line of its own on a narrow phone, above the three buttons */}
          <div className="basis-full sm:basis-auto sm:flex-1 min-w-0 text-sm truncate">{status}</div>
          <span className="flex-1 sm:hidden" />
          <button onClick={goBack} className={secondary}>Cancel</button>
          <button onClick={endNowAndSave} disabled={saving} className={secondary} title="Set the end to now and save">End now</button>
          <button onClick={() => save()} disabled={!canSave} className={primary}>{saving ? 'Saving…' : entryMode && current?.kind === 'plan' ? 'Save plan' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
