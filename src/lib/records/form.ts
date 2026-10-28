// The record form (#70 edit feature, later the entry app #71). Pure: no database.
//
// The form holds a record in its OWN shape — a list of foods, each with its item,
// amount, unit, note and ingredients; people as method / category / target — never
// the sheet's comma, '|' and '+' strings (Hyoje, 27 Oct). The sheet is only how a
// change is written down for him to repeat by hand (sheetCells.ts).
//
// buildRecord turns a form into the document the database stores, in exactly the
// shape the migration's rowToDocument gives (empty → null, empty lists absent), and
// works out what the sheet calculates: the category from the activity, weekdays,
// offsets, all-day and the duration. Empty lists are [] (the database's array default).

import { computeTotalSeconds, weekdayOf } from '../migration/transform';

// ── Shape ────────────────────────────────────────────────────────────────────

export interface FormPoint { date: string; hour: string; timezone: string }       // 'YYYY-MM-DD', 'H:mm' or ''
export interface FormItem { item: string; amount: string; unit: string }
export interface FormFood extends FormItem { note: string; ingredients: string[] }
export interface FormAlcohol extends FormItem { note: string }
export interface FormPerson { method: string; category: string; target: string }
export interface FormExercise { item: string; amount: number | null; unit: string; loadKg: number | null; setStyle: string }
type Num = number | null;

export interface RecordForm {
  activity: { name: string; title: string; additionalInfo: string; crossActivity: string; relationship: string };
  start: FormPoint;
  end: FormPoint;
  location: { activity: string; online: string; other: string };
  cost: { amountKRW: Num; amountForeign: Num; currency: string; categoryDetail: string; category: string };
  purchase: FormItem[];
  food: { type: string; carbs: string; fat: string; spiciness: string; drinks: FormFood[]; foods: FormFood[]; alcohols: FormAlcohol[] };
  people: FormPerson[];
  transport: { from: string; to: string; purpose: string; method: string; returnType: string };
  bowel: { amount: string; quality: string[]; characteristics: string[] };
  body: { weight: Num; muscleMass: Num; bodyFat: Num; bodyFatPercent: Num };
  sleep: { quality: string };
  exercise: FormExercise[];
  reading: { title: string };
  movie: { title: string };
  golf: { score: Num; approach: Num; putts: Num };
  income: { gross: Num; net: Num };
  travel: { city: string; theme: string };
  notes: string;
}

/** What buildRecord needs from the master lists. */
export interface FormContext {
  /** activity name → category (names are unique across categories) */
  activityCategory: Map<string, string>;
  /** zone code → the list's offset. Each code has one offset: GMT and BST are separate codes. */
  zones: Map<string, { offset: number }>;
  /** Until cutover the sheet is the truth, so text must survive its comma lists. */
  sheetIsTruth: boolean;
}

// ── Record → form ────────────────────────────────────────────────────────────

const s = (v: unknown) => (v == null ? '' : String(v));
const n = (v: unknown): Num => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pad = (x: unknown) => String(x ?? '').padStart(2, '0');
const dateOf = (p: any) => (p?.year && p?.month && p?.day ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : '');
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function fromRecord(doc: any): RecordForm {
  const point = (p: any): FormPoint => ({ date: dateOf(p), hour: s(p?.hour), timezone: s(p?.timezone) });
  const food = (x: any): FormFood => ({ item: s(x?.item), amount: s(x?.amount), unit: s(x?.unit), note: s(x?.note), ingredients: arr(x?.ingredients).map(String) });
  return {
    activity: {
      name: s(doc?.activity?.name), title: s(doc?.activity?.title), additionalInfo: s(doc?.activity?.additionalInfo),
      crossActivity: s(doc?.activity?.crossActivity), relationship: s(doc?.activity?.relationship),
    },
    start: point(doc?.start),
    end: point(doc?.end),
    location: { activity: s(doc?.location?.activity), online: s(doc?.location?.online), other: s(doc?.location?.other) },
    cost: {
      amountKRW: n(doc?.cost?.amountKRW), amountForeign: n(doc?.cost?.amountForeign), currency: s(doc?.cost?.currency),
      categoryDetail: s(doc?.cost?.categoryDetail), category: s(doc?.cost?.category),
    },
    purchase: arr(doc?.purchase).map(x => ({ item: s(x?.item), amount: s(x?.amount), unit: s(x?.unit) })),
    food: {
      type: s(doc?.food?.type), carbs: s(doc?.food?.carbs), fat: s(doc?.food?.fat), spiciness: s(doc?.food?.spiciness),
      drinks: arr(doc?.food?.drinks).map(food),
      foods: arr(doc?.food?.foods).map(food),
      alcohols: arr(doc?.food?.alcohols).map(x => ({ item: s(x?.item), amount: s(x?.amount), unit: s(x?.unit), note: s(x?.note) })),
    },
    people: arr(doc?.people).map(x => ({ method: s(x?.method), category: s(x?.category), target: s(x?.target) })),
    transport: {
      from: s(doc?.transport?.from), to: s(doc?.transport?.to), purpose: s(doc?.transport?.purpose),
      method: s(doc?.transport?.method), returnType: s(doc?.transport?.returnType),
    },
    bowel: { amount: s(doc?.bowel?.amount), quality: arr(doc?.bowel?.quality).map(String), characteristics: arr(doc?.bowel?.characteristics).map(String) },
    body: { weight: n(doc?.body?.weight), muscleMass: n(doc?.body?.muscleMass), bodyFat: n(doc?.body?.bodyFat), bodyFatPercent: n(doc?.body?.bodyFatPercent) },
    sleep: { quality: s(doc?.sleep?.quality) },
    exercise: arr(doc?.exercise).map(x => ({ item: s(x?.item), amount: n(x?.amount), unit: s(x?.unit), loadKg: n(x?.loadKg), setStyle: s(x?.setStyle) })),
    reading: { title: s(doc?.reading?.title) },
    movie: { title: s(doc?.movie?.title) },
    golf: { score: n(doc?.golf?.score), approach: n(doc?.golf?.approach), putts: n(doc?.golf?.putts) },
    income: { gross: n(doc?.income?.gross), net: n(doc?.income?.net) },
    travel: { city: s(doc?.travel?.city), theme: s(doc?.travel?.theme) },
    notes: s(doc?.notes),
  };
}

// ── Time ─────────────────────────────────────────────────────────────────────

/** '9:00' from '09:00', '9:5' or '9'; null when it isn't a time. */
export function normaliseHour(h: string): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{1,2}))?\s*$/.exec(h ?? '');
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2] ?? 0);
  if (hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return null;
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

function parseDate(d: string): { y: number; m: number; d: number } | null {
  const x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((d ?? '').trim());
  if (!x) return null;
  const y = Number(x[1]), m = Number(x[2]), day = Number(x[3]);
  const t = new Date(Date.UTC(y, m - 1, day));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== day) return null;
  return { y, m, d: day };
}

// ── Form → record ────────────────────────────────────────────────────────────

export interface Built {
  doc: any;
  /** Refusals: the record is not saved while any is here. */
  problems: string[];
  /** Shown, not blocking. */
  warnings: string[];
}

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const str = (v: unknown): string | null => (t(v) === '' ? null : t(v));
const num = (v: unknown, label: string, problems: string[]): number | null => {
  if (v == null || t(v) === '') return null;
  const x = typeof v === 'number' ? v : Number(t(v).replace(/,/g, ''));
  if (!Number.isFinite(x)) { problems.push(`${label}: '${t(v)}' is not a number`); return null; }
  return x;
};

// What the sheet uses to split a cell, per column, as the migration reads it
// (transform.ts): every list column splits on ','; foods, drinks, alcohol and exercise
// items also on '+'; food and drink items hold their ingredients in '(…|…)'. Purchase
// items, notes, amounts and units split on ',' only, so '+' or '(' there is plain text
// ('올리브유+와인', '달리기(Treadmill)' and wine notes are fine).
const SEP_COMMA = /,/;
const SEP_PLUS = /[,+]/;
const SEP_FOOD = /[,+|()]/;

const ORD = (i: number) => {
  const k = i + 1;
  const suf = k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th';
  return `${k}${suf}`;
};

/**
 * Builds the database document from a form. `base` is the record as it is now (an
 * edit) or null (a new record); what the form doesn't hold — the calendar-sync
 * fields — is kept from it, and so is each offset whose moment did not change.
 */
export function buildRecord(form: RecordForm, base: any | null, ctx: FormContext): Built {
  const problems: string[] = [];
  const warnings: string[] = [];
  const f = form;

  // A rule an old record already breaks doesn't block an edit that leaves that part as
  // it was: it becomes a warning. New or changed parts must pass (Hyoje, 27 Oct).
  const flag = (msg: string, old: boolean) => (old ? warnings.push(`${msg} (as before)`) : problems.push(msg));
  const key = (o: Record<string, unknown>) => JSON.stringify(Object.values(o).map(v => (v == null ? '' : String(v).trim())));
  const oldItems = (path: string, fields: string[]) => {
    const list = path.split('.').reduce((a: any, k) => (a == null ? undefined : a[k]), base);
    return new Set((Array.isArray(list) ? list : []).map((x: any) => key(Object.fromEntries(fields.map(k => [k, x?.[k]])))));
  };
  const same = (a: unknown, b: unknown) => key(a as any ?? {}) === key(b as any ?? {});

  // Activity: the category comes from the list.
  const name = t(f?.activity?.name);
  if (!name) problems.push('Activity is required');
  const category = name ? ctx.activityCategory.get(name) ?? null : null;
  if (name && !category) problems.push(`Activity '${name}' is not in Activities (/admin/activity)`);

  // Start and end. A point the form left as it was is kept as stored — offset and
  // datetime included, even where the stored values are wrong (28 records have
  // broken times) — except its weekday, which the system always calculates from the
  // date (Hyoje, 27 Oct). Only a changed point is worked out again.
  const point = (p: FormPoint | undefined, which: 'start' | 'end', basePoint: any) => {
    const label = which === 'start' ? 'Start' : 'End';
    const date = t(p?.date);
    const hourIn = t(p?.hour);
    const zone = t(p?.timezone);
    const msgs: string[] = [];
    const unchanged = !!base && dateOf(basePoint) === date && s(basePoint?.hour) === hourIn && s(basePoint?.timezone) === zone;
    const done = (v: any) => {
      for (const m of msgs) flag(m, unchanged);
      if (unchanged) {
        const ms = basePoint?.datetime ? new Date(basePoint.datetime).getTime() : null;
        // The weekday is always the system's (Hyoje, 27 Oct), even on a kept point.
        return { ...(basePoint ?? {}), weekday: weekdayOf(basePoint?.year, basePoint?.month, basePoint?.day), _ms: ms, _unchanged: true };
      }
      return v;
    };
    if (!date) {
      if (which === 'start') msgs.push('Start date is required');
      else if (hourIn) msgs.push('End time without an end date');
      return done({ timezone: str(zone), datetime: null, year: null, month: null, day: null, weekday: null, hour: null, timezoneOffset: null, _ms: null as number | null });
    }
    const d = parseDate(date);
    if (!d) { msgs.push(`${label} date '${date}' is not a date (YYYY-MM-DD)`); return done(null); }
    let hour: string | null = null;
    if (hourIn) {
      hour = normaliseHour(hourIn);
      if (!hour) { msgs.push(`${label} time '${hourIn}' is not a time (H:mm)`); return done(null); }
      // The same time written differently ('09:00') keeps the stored text.
      if (typeof basePoint?.hour === 'string' && normaliseHour(basePoint.hour) === hour) hour = basePoint.hour;
    }
    if (!zone) msgs.push(`${label} time zone is required`);
    const [hh, mm] = hour ? normaliseHour(hour)!.split(':').map(Number) : [12, 0];
    const localMs = Date.UTC(d.y, d.m - 1, d.d, hh, mm);
    const datetime = hour ? new Date(localMs) : null;

    // The offset: the zone code's offset from the list, as the sheet's TimeDiff tab
    // gives it (each code has one offset: GMT 0, BST +1). Unchanged points keep theirs
    // (above): offsets are kept for good (§15.2).
    let offset: number | null = null;
    if (zone) {
      const z = ctx.zones.get(zone);
      if (!z) msgs.push(`${label} time zone '${zone}' is not in Time zones (/admin/timezone)`);
      else offset = z.offset;
    }

    return done({ timezone: str(zone), datetime, year: d.y, month: d.m, day: d.d, weekday: weekdayOf(d.y, d.m, d.d), hour, timezoneOffset: offset, _ms: localMs });
  };
  const start = point(f?.start, 'start', base?.start);
  const end = point(f?.end, 'end', base?.end);
  const timesOld = !!start?._unchanged && !!end?._unchanged;

  const allDay = !start?.hour && !end?.hour;
  let totalSeconds: number | null = null;
  if (timesOld) {
    totalSeconds = base?.duration?.totalSeconds ?? null;           // as stored
  } else if (start && end) {
    totalSeconds = computeTotalSeconds(allDay, start.datetime, end.datetime, start.timezoneOffset, end.timezoneOffset,
      start.year, start.month, start.day, end.year, end.month, end.day);
  }
  if (start && end) {
    if (end.year && start.year) {
      const sAt = (start._ms ?? 0) - (start.timezoneOffset ?? 0) * 3600e3;
      const eAt = (end._ms ?? 0) - (end.timezoneOffset ?? 0) * 3600e3;
      if (!allDay && start.datetime && end.datetime && eAt < sAt) flag('End is before start', timesOld);
      if (allDay && Date.UTC(end.year, end.month - 1, end.day) < Date.UTC(start.year, start.month - 1, start.day)) flag('End date is before start date', timesOld);
    }
    if (end.hour && !start.hour) flag('An end time needs a start time', timesOld);
    if (start.hour && !end.hour) warnings.push('No end time: saved as an open record, with no duration');
  }

  // Lists: item, amount and unit go together (Hyoje, 27 Oct); an entry with nothing in it is dropped.
  const listCheck = (label: string, i: number, item: string, rest: Record<string, string>, old: boolean, itemSep: RegExp) => {
    const others = Object.entries(rest).filter(([, v]) => v !== '');
    if (!item && !others.length) return false;
    const missing = [!item && 'item', rest.amount === '' && 'amount', rest.unit === '' && 'unit'].filter(Boolean);
    if (missing.length) flag(`${label}${item ? ` '${item}'` : `, ${ORD(i)} entry`}: ${missing.join(' and ')} missing — item, amount and unit go together`, old);
    if (!item) return false;
    if (ctx.sheetIsTruth) {
      const chars = (re: RegExp) => [',', '+', '|', '(', ')'].filter(c => re.test(c)).join(' ');
      if (itemSep.test(item)) flag(`${label} '${item}': the sheet splits this item on ${chars(itemSep)} — not allowed until cutover`, old);
      for (const [k, v] of others) if (SEP_COMMA.test(v)) flag(`${label} '${item}', ${k} '${v}': the sheet splits this cell on , — not allowed until cutover`, old);
    }
    return true;
  };

  const oldPurchase = oldItems('purchase', ['item', 'amount', 'unit']);
  const purchase = (f?.purchase ?? []).map((x, i) => ({ item: t(x?.item), amount: t(x?.amount), unit: t(x?.unit), i }))
    .filter(x => listCheck('Purchase', x.i, x.item, { amount: x.amount, unit: x.unit }, oldPurchase.has(key({ a: x.item, b: x.amount, c: x.unit })), SEP_COMMA))
    .map(x => ({ item: x.item, amount: x.amount, unit: x.unit }));

  const foodList = (label: string, path: string, list: FormFood[] | undefined) => {
    const old = oldItems(path, ['item', 'amount', 'unit']);
    return (list ?? [])
    .map((x, i) => ({ item: t(x?.item), amount: t(x?.amount), unit: t(x?.unit), note: t(x?.note), ingredients: (x?.ingredients ?? []).map(t).filter(Boolean), i }))
    .filter(x => listCheck(label, x.i, x.item, { amount: x.amount, unit: x.unit, note: x.note }, old.has(key({ a: x.item, b: x.amount, c: x.unit })), SEP_FOOD))
    .map(x => ({ item: x.item, amount: x.amount, unit: x.unit, note: x.note, ingredients: x.ingredients.length ? x.ingredients : ['Not Defined'] }));
  };
  const drinks = foodList('Drink', 'food.drinks', f?.food?.drinks);
  const foods = foodList('Food', 'food.foods', f?.food?.foods);
  const oldAlcohol = oldItems('food.alcohols', ['item', 'amount', 'unit']);
  const alcohols = (f?.food?.alcohols ?? []).map((x, i) => ({ item: t(x?.item), amount: t(x?.amount), unit: t(x?.unit), note: t(x?.note), i }))
    .filter(x => listCheck('Alcohol', x.i, x.item, { amount: x.amount, unit: x.unit, note: x.note }, oldAlcohol.has(key({ a: x.item, b: x.amount, c: x.unit })), SEP_PLUS))
    .map(x => ({ item: x.item, amount: x.amount, unit: x.unit, note: x.note }));

  const people = (f?.people ?? []).map((x, i) => ({ method: t(x?.method), category: t(x?.category), target: t(x?.target), i }))
    .filter(x => {
      if (!x.method && !x.category && !x.target) return false;
      if (ctx.sheetIsTruth) {
        for (const [k, v] of [['method', x.method], ['category', x.category], ['person', x.target]] as const) {
          if (/[,|]/.test(v)) problems.push(`People, ${ORD(x.i)} entry: the ${k} '${v}' can't hold , or | until cutover`);
        }
      }
      return true;
    })
    .map(x => ({ method: x.method, category: x.category, target: x.target }));

  const oldExercise = oldItems('exercise', ['item', 'amount', 'unit']);
  const exercise = (f?.exercise ?? []).map((x, i) => ({
    item: t(x?.item), amount: num(x?.amount, `Exercise ${ORD(i)} amount`, problems), unit: t(x?.unit),
    loadKg: num(x?.loadKg, `Exercise ${ORD(i)} load`, problems), setStyle: t(x?.setStyle), i,
  }))
    .filter(x => listCheck('Exercise', x.i, x.item, { amount: x.amount == null ? '' : String(x.amount), unit: x.unit, style: x.setStyle, load: x.loadKg == null ? '' : String(x.loadKg) },
      oldExercise.has(key({ a: x.item, b: x.amount, c: x.unit })), SEP_PLUS))
    .map(x => ({ item: x.item, amount: x.amount, unit: x.unit || null, loadKg: x.loadKg, setStyle: x.setStyle || null }));

  const plusList = (label: string, v: string[] | undefined) => {
    const items = (v ?? []).map(t).filter(Boolean);
    if (ctx.sheetIsTruth) for (const x of items) if (/[+,]/.test(x)) problems.push(`${label} '${x}' can't hold + or , until cutover`);
    return items.length ? items : undefined;
  };

  // Empty strings → null, as the migration stores them.
  const doc: any = {
    userId: base?.userId,
    allDay,
    sync: base?.sync ?? { status: null, eventId: null, export: null },
    activity: {
      category, name: str(name), title: str(f?.activity?.title), additionalInfo: str(f?.activity?.additionalInfo),
      crossActivity: str(f?.activity?.crossActivity), relationship: str(f?.activity?.relationship),
    },
    start: start ? strip(start) : base?.start ?? null,
    end: end ? strip(end) : base?.end ?? null,
    duration: { totalSeconds },
    location: { activity: str(f?.location?.activity), online: str(f?.location?.online), other: str(f?.location?.other) },
    cost: {
      amountKRW: num(f?.cost?.amountKRW, 'Cost (KRW)', problems), amountForeign: num(f?.cost?.amountForeign, 'Cost (foreign)', problems),
      currency: str(f?.cost?.currency), categoryDetail: str(f?.cost?.categoryDetail), category: str(f?.cost?.category),
    },
    purchase,
    food: {
      type: str(f?.food?.type), carbs: str(f?.food?.carbs), fat: str(f?.food?.fat), spiciness: str(f?.food?.spiciness),
      drinks, foods, alcohols,
    },
    people,
    transport: {
      from: str(f?.transport?.from), to: str(f?.transport?.to), purpose: str(f?.transport?.purpose),
      method: str(f?.transport?.method), returnType: str(f?.transport?.returnType),
    },
    bowel: { amount: str(f?.bowel?.amount), quality: plusList('Bowel quality', f?.bowel?.quality), characteristics: plusList('Bowel characteristic', f?.bowel?.characteristics) },
    body: {
      weight: num(f?.body?.weight, 'Weight', problems), muscleMass: num(f?.body?.muscleMass, 'Muscle', problems),
      bodyFat: num(f?.body?.bodyFat, 'Body fat', problems), bodyFatPercent: num(f?.body?.bodyFatPercent, 'Body fat %', problems),
    },
    sleep: { quality: str(f?.sleep?.quality) },
    exercise,
    reading: { title: str(f?.reading?.title) },
    movie: { title: str(f?.movie?.title) },
    golf: { score: num(f?.golf?.score, 'Golf score', problems), approach: num(f?.golf?.approach, 'Golf approach', problems), putts: num(f?.golf?.putts, 'Golf putts', problems) },
    income: { gross: num(f?.income?.gross, 'Income (gross)', problems), net: num(f?.income?.net, 'Income (net)', problems) },
    travel: { city: str(f?.travel?.city), theme: str(f?.travel?.theme) },
    notes: str(f?.notes),
  };
  // Cost: the KRW amount and both category layers go together; a foreign amount and its
  // currency go together (each record stores both amounts, §15.2).
  const c = doc.cost;
  if ([c.amountKRW, c.amountForeign, c.currency, c.category, c.categoryDetail].some(v => v != null)) {
    const oldCost = same(c, base?.cost && { amountKRW: base.cost.amountKRW, amountForeign: base.cost.amountForeign, currency: base.cost.currency, categoryDetail: base.cost.categoryDetail, category: base.cost.category });
    const missing = [c.amountKRW == null && 'the KRW amount', !c.category && 'the category', !c.categoryDetail && 'the second category layer'].filter(Boolean);
    if (missing.length) flag(`Cost: ${missing.join(', ')} missing — a cost needs its KRW amount and both category layers`, oldCost);
    if ((c.amountForeign == null) !== (c.currency == null)) flag(`Cost: ${c.currency ? `${c.currency} without a foreign amount` : 'a foreign amount without its currency'}`, oldCost);
  }

  // A trip home (purpose 귀가, to 집) records how it ended (Design §9: ReturnType sits on
  // the leg that arrives home).
  const tr = doc.transport;
  if (tr.purpose === '귀가' && tr.to === '집' && !tr.returnType) {
    flag('Return type is required on a 귀가 trip to 집', same(tr, base?.transport && { from: base.transport.from, to: base.transport.to, purpose: base.transport.purpose, method: base.transport.method, returnType: base.transport.returnType }));
  }
  return { doc, problems: [...new Set(problems)], warnings };
}

/**
 * The record rules for a NEW record that didn't come through the form — a Staging row
 * (#70, Hyoje 28 Oct: a 귀가 trip to 집 without a return type passed Staging). The same
 * rules as buildRecord with no base, so nothing counts as 'as before'. The full
 * migration doesn't use it: it rebuilds old records, and some of them break these rules.
 */
export function newRecordRules(doc: any, ctx: FormContext): { problems: string[]; warnings: string[] } {
  const b = buildRecord(fromRecord(doc), null, ctx);
  return { problems: b.problems, warnings: b.warnings };
}

function strip(p: any) {
  const { _ms, _unchanged, ...rest } = p;
  void _ms; void _unchanged;
  return rest;
}

export { ORD as ordinal };
