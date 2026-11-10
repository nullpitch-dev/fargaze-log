// Forms for the entry app (#71). Pure: the phone builds them too.

import type { RecordForm } from '../records/form';
import { addDays, addMinutes, daysBetween } from './time';

export type PresetTime = { kind: 'open' | 'moment' | 'length'; minutes: number | null };
export interface FormPointValue { date: string; hour: string; timezone: string }

/** An empty form; a partial one (preset, repeat) laid over it section by section. */
// The same as form.ts fromRecord({}), written out: form.ts reaches the database models
// (through the migration's transform), which must not end up on the phone.
export function blankForm(): RecordForm {
  const p = () => ({ date: '', hour: '', timezone: '' });
  return {
    activity: { name: '', title: '', additionalInfo: '', crossActivity: '', relationship: '' },
    start: p(), end: p(), plannedEnd: p(),
    location: { activity: '', online: '', other: '' },
    cost: { amountKRW: null, amountForeign: null, currency: '', categoryDetail: '', category: '' },
    purchase: [],
    food: { type: '', carbs: '', fat: '', spiciness: '', drinks: [], foods: [], alcohols: [] },
    people: [],
    transport: { from: '', to: '', purpose: '', method: '', returnType: '' },
    bowel: { amount: '', quality: [], characteristics: [] },
    body: { weight: null, muscleMass: null, bodyFat: null, bodyFatPercent: null },
    sleep: { quality: '' },
    exercise: [],
    reading: { title: '' }, movie: { title: '' },
    golf: { score: null, approach: null, putts: null },
    income: { gross: null, net: null },
    travel: { city: '', theme: '' },
    notes: '',
  };
}
export function mergeForm(partial: any): RecordForm {
  const f: any = blankForm();
  for (const [k, v] of Object.entries(partial ?? {})) {
    if (k === 'start' || k === 'end' || k === 'plannedEnd') continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && f[k] && typeof f[k] === 'object' && !Array.isArray(f[k])) f[k] = { ...f[k], ...v };
    else if (v !== undefined) f[k] = v;
  }
  return f;
}

/** The form a preset opens, at a local date and time in a zone code. */
export function presetForm(p: { form: any; time: PresetTime }, now: FormPointValue): RecordForm {
  const f = mergeForm(p.form);
  f.start = { ...now };
  f.end = { date: '', hour: '', timezone: '' };
  if (p.time.kind === 'moment') f.end = { ...now };
  else if (p.time.kind === 'length' && p.time.minutes != null) {
    const e = addMinutes(now.date, now.hour, p.time.minutes);
    f.plannedEnd = { ...e, timezone: now.timezone };   // a usual length is a planned end
  }
  return f;
}

/** Copy recent (Hyoje, 8–10 Nov): the record's fields, today at the source's time of day
 *  (Now on the form for something happening now; ESOL 수업 keeps its 9:30), still open (no
 *  end). Amounts are kept — Reset on a card clears them; a foreign amount is re-priced at
 *  the Exchange rates list's rate by the form. `zoneAt` gives the zone code for a time today.
 *  The planned end travels (Hyoje, 10 Nov): the source's, moved to today with the start —
 *  ESOL 수업 copies as 9:30, until 12:00; a commute that never had one copies without.
 *  `fromPlan`: a plan saved before planned ends existed has its plan in End. */
export function copyForm(src: RecordForm, now: FormPointValue, zoneAt?: (date: string, hour: string) => string | null, fromPlan = false): RecordForm {
  const f: RecordForm = JSON.parse(JSON.stringify(src));
  const hour = src.start.hour || '';
  f.start = { date: now.date, hour, timezone: (hour && zoneAt?.(now.date, hour)) || now.timezone };
  f.end = { date: '', hour: '', timezone: '' };
  f.plannedEnd = { date: '', hour: '', timezone: '' };
  const planned = src.plannedEnd?.date || src.plannedEnd?.hour ? src.plannedEnd : fromPlan ? src.end : null;
  if (planned && (planned.date || planned.hour) && src.start.date) {
    const date = addDays(now.date, daysBetween(src.start.date, planned.date || src.start.date));
    f.plannedEnd = { date, hour: planned.hour, timezone: (planned.hour && zoneAt?.(date, planned.hour)) || planned.timezone || f.start.timezone };
  }
  return f;
}

/** A new ObjectId-shaped ID made on the phone (seconds + random), so a retry never saves twice. */
export function newEntryId(): string {
  const secs = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return secs + [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Reset on a card of a copied record (Hyoje, 9 Nov): keeps what the record is (items,
 *  units, categories, names) and clears what was measured or paid that time. */
export type ResettableSection = 'cost' | 'purchase' | 'food' | 'exercise' | 'body' | 'sleep' | 'bowel' | 'golf' | 'income' | 'notes';
export const RESETTABLE: ResettableSection[] = ['cost', 'purchase', 'food', 'exercise', 'body', 'sleep', 'bowel', 'golf', 'income', 'notes'];

export function resetSection(f: RecordForm, k: ResettableSection): RecordForm {
  const blank = blankForm();
  const noAmount = <T extends { amount: any }>(xs: T[], empty: any) => xs.map(x => ({ ...x, amount: empty }));
  switch (k) {
    case 'cost': return { ...f, cost: { ...f.cost, amountKRW: null, amountForeign: null } };
    case 'purchase': return { ...f, purchase: noAmount(f.purchase, '') };
    case 'food': return { ...f, food: { ...f.food, drinks: noAmount(f.food.drinks, ''), foods: noAmount(f.food.foods, ''), alcohols: noAmount(f.food.alcohols, '') } };
    case 'exercise': return { ...f, exercise: noAmount(f.exercise, null).map(x => ({ ...x, loadKg: null })) };
    case 'notes': return { ...f, notes: '' };
    default: return { ...f, [k]: blank[k] };
  }
}
