// Repeating plans (#71, Design §15.7; Hyoje 8 Nov 2026: before cutover). Server only.
//
// A rule (RepeatRule) makes its occurrences as plans up to HORIZON_DAYS ahead. The
// first fill starts today (a rule dated earlier doesn't flood To confirm). Changing a
// rule replaces only the occurrences still to come that nobody touched; one adjusted,
// confirmed or deleted by hand stays as it is (and keeps its date from being made
// again: log_plan holds one plan per occurrence, whatever its state). Stopping a rule
// removes its untouched occurrences still to come; one already started stays in To confirm.
// "Count as done" (mode 'auto') occurrences become records by themselves once their
// end has passed — when the app next opens (refresh(), called by the home screen).

import mongoose from 'mongoose';
import LogPlan from '../../models/LogPlan';
import RepeatRule from '../../models/RepeatRule';
import TimezoneMaster from '../../models/TimezoneMaster';
import { loadFormContext } from '../records/edit';
import { buildRecord, normaliseHour, type RecordForm } from '../records/form';
import { adjustPlan, deletePlan, mergeForm, settleOne } from './save';
import { isLunarDay, lunarOf } from './lunar';
import { addDays, addMinutes, daysBetween, instantOf, localNow, weekdayOfDate, zoneCodeFor, type ZoneRow } from './time';

export const HORIZON_DAYS = 60;
const REFILL_WHEN_LEFT = 45;   // refill once fewer days than this are made ahead
// Repeats two weeks or more apart — every 2+ weeks, monthly, yearly — are made about 13 months
// ahead (Hyoje, 25 Nov: 60 days held only two of a monthly one, and an every-4-weeks one looked
// as if it stopped; birthdays, 제사, 설, 추석), topped up monthly. Closer ones: 60 days.
const LONG_HORIZON_DAYS = 400;
const LONG_REFILL_WHEN_LEFT = 370;
const isLong = (rule: { freq: string; interval?: number | null }) => {
  const n = Math.max(1, rule.interval ?? 1);
  return rule.freq === 'yearly' || rule.freq === 'monthly' || (rule.freq === 'weekly' && n >= 2) || (rule.freq === 'daily' && n >= 14);
};
export const horizonFor = (rule: { freq: string; interval?: number | null }) => (isLong(rule) ? LONG_HORIZON_DAYS : HORIZON_DAYS);
const refillWhenLeft = (rule: { freq: string; interval?: number | null }) => (isLong(rule) ? LONG_REFILL_WHEN_LEFT : REFILL_WHEN_LEFT);

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface RuleInput {
  name: string; form: any; allDay?: boolean; startTime?: string | null; minutes?: number | null; iana: string;
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; weekdays?: number[] | null; monthDay?: number | null;
  monthWeek?: number | null; monthWeekday?: number | null;
  monthShift?: 'before' | 'after' | null;
  lunar?: boolean; lunarMonth?: number | null; lunarDay?: number | null;
  from: string; until?: string | null; count?: number | null; mode?: 'ask' | 'auto';
}

// ── Dates ────────────────────────────────────────────────────────────────────

type DatesOf = Pick<RuleInput, 'freq' | 'interval' | 'weekdays' | 'monthDay' | 'monthWeek' | 'monthWeekday' | 'monthShift' | 'lunar' | 'lunarMonth' | 'lunarDay' | 'from' | 'until' | 'count'>;

const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);

/** Monthly "on day N, or the Friday before / the Monday after when it's a weekend" (25 Nov:
 *  salary on the 21st, phone bill on the 21st). The date for month index `mi` (y*12 + m-1),
 *  or null when that month has no day N. */
function shiftedDay(mi: number, day: number, shift: 'before' | 'after'): string | null {
  const y = Math.floor(mi / 12), m = (mi % 12) + 1;
  if (day > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  const d = ymd(y, m, day);
  const wd = weekdayOfDate(d);
  if (wd !== 0 && wd !== 6) return d;
  return shift === 'before' ? addDays(d, wd === 6 ? -1 : -2) : addDays(d, wd === 6 ? 2 : 1);
}

/** The rule's occurrence dates from its first date up to `upTo` (inclusive), within until / count. */
export function occurrences(rule: DatesOf, upTo: string): string[] {
  const out: string[] = [];
  const every = Math.max(1, rule.interval ?? 1);
  const last = rule.until && rule.until < upTo ? rule.until : upTo;
  const days = rule.freq === 'weekly' ? (rule.weekdays?.length ? rule.weekdays : [weekdayOfDate(rule.from)]) : [];
  const monthDay = rule.monthDay ?? Number(rule.from.slice(8, 10));
  const weekStart = addDays(rule.from, -weekdayOfDate(rule.from));
  const [fy, fm] = rule.from.split('-').map(Number);
  const fromMonth = fy * 12 + fm - 1;
  // Lunar yearly: the lunar month / day to keep (the first date's, unless stored).
  const lunar = rule.freq === 'yearly' && rule.lunar ? (() => {
    const l = lunarOf(rule.from);
    const month = rule.lunarMonth ?? l?.month, day = rule.lunarDay ?? l?.day;
    return month && day ? { month, day, fromYear: l?.year ?? fy } : null;
  })() : null;
  if (rule.freq === 'yearly' && rule.lunar && !lunar) return out;   // no lunar calendar here
  const shift = rule.freq === 'monthly' && rule.monthWeek == null && rule.monthShift ? rule.monthShift : null;
  for (let d = rule.from; d <= last; d = addDays(d, 1)) {
    let hit = false;
    if (rule.freq === 'daily') hit = daysBetween(rule.from, d) % every === 0;
    else if (rule.freq === 'weekly') hit = Math.floor(daysBetween(weekStart, d) / 7) % every === 0 && days.includes(weekdayOfDate(d));
    else if (rule.freq === 'yearly' && lunar) {
      // Every N lunar years on the lunar month / day (an ordinary month; 30 → 29 when short).
      if (isLunarDay(d, lunar.month, lunar.day, x => addDays(x, 1))) {
        const ly = lunarOf(d)?.year ?? 0;
        hit = (ly - lunar.fromYear) % every === 0;
      }
    } else if (rule.freq === 'yearly') {
      // Every N years on the first date's day and month (29 Feb: leap years only).
      const [y, , dd] = d.split('-').map(Number);
      hit = (y - fy) % every === 0 && d.slice(5) === rule.from.slice(5) && dd > 0;
    } else if (shift) {
      // The day may have moved into the month before or after its own.
      const [y, m] = d.split('-').map(Number);
      const mi = y * 12 + m - 1;
      for (const k of [mi - 1, mi, mi + 1]) {
        if (k < fromMonth || (k - fromMonth) % every !== 0) continue;
        if (shiftedDay(k, monthDay, shift) === d) { hit = true; break; }
      }
    } else {
      const [y, m, dd] = d.split('-').map(Number);
      const month = ((y * 12 + m) - (fy * 12 + fm)) % every === 0;
      if (rule.monthWeek != null && rule.monthWeekday != null) {
        // "the fourth Tuesday" / "the last Tuesday"
        const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        hit = month && weekdayOfDate(d) === rule.monthWeekday
          && (rule.monthWeek === -1 ? dd + 7 > last : Math.ceil(dd / 7) === rule.monthWeek);
      } else hit = month && dd === monthDay;
    }
    if (hit) {
      out.push(d);
      if (rule.count && out.length >= rule.count) break;
    }
  }
  return out;
}

/** The form for one occurrence: the rule's fields, its times on that date, the zone code of that day. */
export function occurrenceForm(rule: any, date: string, zones: ZoneRow[]): RecordForm {
  const f = mergeForm(rule.form);
  const hour = rule.allDay ? '' : (rule.startTime ?? '');
  f.start = { date, hour, timezone: zoneCodeFor(rule.iana, date, hour || '12:00', zones) ?? '' };
  // The length makes the planned end (Hyoje, 10 Nov); End stays empty until it happens.
  f.end = { date: '', hour: '', timezone: '' };
  f.plannedEnd = { date: '', hour: '', timezone: '' };
  if (rule.minutes != null && !rule.allDay && hour) {
    const e = addMinutes(date, hour, rule.minutes);
    f.plannedEnd = { date: e.date, hour: e.hour, timezone: zoneCodeFor(rule.iana, e.date, e.hour, zones) ?? '' };
  } else if (rule.allDay && rule.minutes != null) {
    const e = addDays(date, Math.max(0, Math.round(rule.minutes / 1440) - 1));
    f.plannedEnd = { date: e, hour: '', timezone: f.start.timezone };
  }
  return f;
}

// ── Fill and settle ──────────────────────────────────────────────────────────

async function zonesOf(userId: string): Promise<ZoneRow[]> {
  return await TimezoneMaster.find({ userId }).select('code offsetUTC ianaTimezone').lean() as any[];
}

/** Makes a rule's plans up to the horizon. Returns how many were made, and any problem. */
export async function fillRule(userId: string, rule: any, now = Date.now()): Promise<{ made: number; problem: string | null }> {
  if (rule.stoppedAt) return { made: 0, problem: null };
  const today = localNow(rule.iana, now).date;
  const horizon = addDays(today, horizonFor(rule));
  const startFrom = rule.filledUntil ? addDays(rule.filledUntil, 1) : (rule.from > today ? rule.from : today);
  const dates = occurrences(rule, horizon).filter(d => d >= startFrom);
  const [ctx, zones] = await Promise.all([loadFormContext(userId), zonesOf(userId)]);
  const docs: any[] = [];
  let problem: string | null = null;
  for (const date of dates) {
    const built = buildRecord(occurrenceForm(rule, date, zones), null, ctx);
    if (built.problems.length) { problem = built.problems[0]; continue; }
    const t = new Date(now);
    docs.push({ ...built.doc, userId, origin: 'app', createdAt: t, updatedAt: t, plan: { state: 'open', repeatId: rule._id, occurrence: date } });
  }
  let made = 0;
  if (docs.length) {
    try {
      const res = await LogPlan.insertMany(docs, { ordered: false });
      made = res.length;
    } catch (e: any) {
      if (e?.code !== 11000 && !e?.writeErrors) throw e;          // an occurrence made already
      made = e?.insertedDocs?.length ?? e?.result?.insertedCount ?? 0;
    }
  }
  const filledUntil = rule.until && rule.until < horizon ? rule.until : horizon;
  await RepeatRule.updateOne({ _id: rule._id, userId }, { $set: { filledUntil } });
  return { made, problem };
}

/** Called when the app opens: tops up every rule, then settles "count as done" plans whose end has passed. */
export async function refresh(userId: string, now = Date.now()): Promise<{ made: number; settled: number }> {
  const rules = await RepeatRule.find({ userId, stoppedAt: null }).lean() as any[];
  let made = 0;
  for (const r of rules) {
    const today = localNow(r.iana, now).date;
    if (!r.filledUntil || daysBetween(today, r.filledUntil) < refillWhenLeft(r)) made += (await fillRule(userId, r, now)).made;
  }
  const auto = rules.filter(r => r.mode === 'auto').map(r => r._id);
  let settled = 0;
  if (auto.length) {
    // Naive local times are within ±14 h of the true moment: fetch generously, decide exactly.
    const bound = new Date(now + 15 * 3_600_000);
    const due = await LogPlan.find({
      userId, 'plan.state': 'open', 'plan.repeatId': { $in: auto },
      $or: [{ 'start.datetime': { $lte: bound } }, { 'start.datetime': null }],
    }).lean() as any[];
    for (const p of due) {
      const until = p.plannedEnd?.year ? p.plannedEnd : p.end;   // a plan from before 10 Nov has it in end
      const endAt = instantOf(until) ?? instantOf(p.start);
      const over = until?.datetime || !until?.year ? endAt : (endAt ?? 0) + 86_400_000;   // an all-day end lasts the whole day
      if (over != null && over <= now && (await settleOne(userId, p, now))) settled++;
    }
  }
  return { made, settled };
}

// ── Rules ────────────────────────────────────────────────────────────────────

function validate(b: any): { ok: true; rule: RuleInput } | Fail {
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  if (!name) return fail(400, 'Name is required.');
  if (!b?.form?.activity?.name) return fail(400, 'Choose an activity.');
  const iana = typeof b?.iana === 'string' ? b.iana : '';
  try { new Intl.DateTimeFormat('en-GB', { timeZone: iana }); } catch { return fail(400, `Unknown time zone '${iana}'.`); }
  if (!iana) return fail(400, 'Time zone is required.');
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(b?.freq)) return fail(400, 'Repeat: daily, weekly, monthly or yearly.');
  if (typeof b?.from !== 'string' || !DATE.test(b.from)) return fail(400, 'First date is required (YYYY-MM-DD).');
  if (b?.until != null && b.until !== '' && (typeof b.until !== 'string' || !DATE.test(b.until) || b.until < b.from)) return fail(400, 'The last date must be on or after the first.');
  const allDay = !!b?.allDay;
  let startTime: string | null = null;
  if (!allDay) {
    startTime = normaliseHour(String(b?.startTime ?? ''));
    if (!startTime) return fail(400, 'Start time is required (or make it all day).');
  }
  const minutes = b?.minutes == null || b.minutes === '' ? null : Number(b.minutes);
  if (minutes != null && (!Number.isFinite(minutes) || minutes < 0)) return fail(400, 'Length must be minutes (0 or more).');
  const interval = b?.interval == null ? 1 : Number(b.interval);
  if (!Number.isInteger(interval) || interval < 1 || interval > 52) return fail(400, 'Every: a whole number from 1 to 52.');
  const weekdays = Array.isArray(b?.weekdays) ? [...new Set(b.weekdays.map(Number))].filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) as number[] : null;
  const monthDay = b?.monthDay == null || b.monthDay === '' ? null : Number(b.monthDay);
  if (monthDay != null && (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) return fail(400, 'Day of the month: 1 to 31.');
  const monthWeek = b?.monthWeek == null || b.monthWeek === '' ? null : Number(b.monthWeek);
  const monthWeekday = b?.monthWeekday == null || b.monthWeekday === '' ? null : Number(b.monthWeekday);
  if (monthWeek != null && ![1, 2, 3, 4, -1].includes(monthWeek)) return fail(400, 'Week of the month: 1 to 4, or -1 for the last.');
  if (monthWeek != null && (monthWeekday == null || !Number.isInteger(monthWeekday) || monthWeekday < 0 || monthWeekday > 6)) return fail(400, 'Weekday: 0 (Sunday) to 6.');
  const count = b?.count == null || b.count === '' ? null : Number(b.count);
  if (count != null && (!Number.isInteger(count) || count < 1)) return fail(400, 'Times: a whole number, 1 or more.');
  const monthShift = b?.monthShift === 'before' || b?.monthShift === 'after' ? b.monthShift : null;
  const lunar = b.freq === 'yearly' && !!b?.lunar;
  let lunarMonth: number | null = null, lunarDay: number | null = null;
  if (lunar) {
    const l = lunarOf(b.from);
    if (!l) return fail(400, 'The lunar calendar is not available on the server.');
    lunarMonth = b?.lunarMonth == null || b.lunarMonth === '' ? l.month : Number(b.lunarMonth);
    lunarDay = b?.lunarDay == null || b.lunarDay === '' ? l.day : Number(b.lunarDay);
    if (!Number.isInteger(lunarMonth) || lunarMonth < 1 || lunarMonth > 12) return fail(400, 'Lunar month: 1 to 12.');
    if (!Number.isInteger(lunarDay) || lunarDay < 1 || lunarDay > 30) return fail(400, 'Lunar day: 1 to 30.');
  }
  const { start: _s, end: _e, ...form } = b.form;
  return {
    ok: true,
    rule: {
      name, form, allDay, startTime, minutes, iana, freq: b.freq, interval,
      weekdays: b.freq === 'weekly' ? (weekdays?.length ? weekdays : null) : null,
      monthDay: b.freq === 'monthly' && monthWeek == null ? monthDay : null,
      monthWeek: b.freq === 'monthly' ? monthWeek : null,
      monthWeekday: b.freq === 'monthly' && monthWeek != null ? monthWeekday : null,
      monthShift: b.freq === 'monthly' && monthWeek == null ? monthShift : null,
      lunar, lunarMonth, lunarDay,
      from: b.from, until: b.until || null, count, mode: b?.mode === 'auto' ? 'auto' : 'ask',
    },
  };
}

/** Removes a rule's untouched occurrences still to come (open, never adjusted, start not yet reached). */
async function dropUntouched(userId: string, ruleId: mongoose.Types.ObjectId, today: string, now = Date.now()) {
  const plans = await LogPlan.find({
    userId, 'plan.repeatId': ruleId, 'plan.state': 'open', 'plan.edited': { $ne: true }, 'plan.occurrence': { $gte: today },
  }).select('start').lean() as any[];
  const ids = plans.filter(p => (instantOf(p.start) ?? 0) > now).map(p => p._id);
  if (!ids.length) return 0;
  const res = await LogPlan.deleteMany({ userId, _id: { $in: ids } });
  return res.deletedCount ?? 0;
}

const view = (r: any) => ({ ...r, _id: String(r._id) });

export async function listRules(userId: string) {
  const rules = await RepeatRule.find({ userId }).sort({ stoppedAt: 1, name: 1 }).lean() as any[];
  const now = Date.now();
  const out = [];
  for (const r of rules) {
    const today = localNow(r.iana, now).date;
    const next = r.stoppedAt ? null : occurrences(r, addDays(today, 400)).find(d => d >= today) ?? null;
    out.push({ ...view(r), next });
  }
  return { ok: true as const, rules: out };
}

export async function getRule(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown repeat.');
  const r = await RepeatRule.findOne({ _id: id, userId }).lean() as any;
  return r ? { ok: true as const, rule: view(r) } : fail(404, 'This repeat no longer exists.');
}

/** The repeat a record came from (25 Nov: its edit form shows it), or null. */
export async function ruleOfRecord(userId: string, recordId: string) {
  if (!mongoose.isValidObjectId(recordId)) return { ok: true as const, rule: null };
  const p = await LogPlan.findOne({ userId, 'plan.recordId': new mongoose.Types.ObjectId(recordId), 'plan.repeatId': { $ne: null } })
    .select('plan.repeatId').lean() as any;
  const r = p?.plan?.repeatId ? await RepeatRule.findOne({ _id: p.plan.repeatId, userId }).lean() as any : null;
  return { ok: true as const, rule: r ? view(r) : null };
}

/** Makes a plan the rule's occurrence on `date` (so the fill doesn't make it twice). */
async function adopt(userId: string, planId: string, ruleId: mongoose.Types.ObjectId, date: string) {
  await LogPlan.updateOne({ _id: planId, userId, 'plan.state': 'open' }, { $set: { 'plan.repeatId': ruleId, 'plan.occurrence': date } });
}

/**
 * A new repeat (24 Nov, the form's "Does not repeat ▾"). From the New form or a plan:
 *   doneAs { date, recordId } — the entry was saved as a record (started now or earlier):
 *     that date's occurrence counts as done by it, so it isn't asked again;
 *   adopt { planId, updatedAt, form } — a plan made to repeat: its edits are saved and it
 *     becomes the first occurrence.
 */
export async function createRule(userId: string, body: any) {
  const v = validate(body);
  if (!v.ok) return v;
  if (body?.adopt?.planId) {
    const a = await adjustPlan(userId, String(body.adopt.planId), body.adopt.planForm ?? body.adopt.form, String(body.adopt.updatedAt ?? ''));
    if (!a.ok) return a;
  }
  const [r] = await RepeatRule.create([{ userId, ...v.rule }]);
  const rule = (r as any).toObject();
  if (body?.adopt?.planId) await adopt(userId, String(body.adopt.planId), rule._id, v.rule.from);
  const filled = await fillRule(userId, rule);
  if (body?.doneAs?.date && mongoose.isValidObjectId(body?.doneAs?.recordId)) {
    const now = new Date();
    await LogPlan.updateOne(
      { userId, 'plan.repeatId': rule._id, 'plan.occurrence': body.doneAs.date, 'plan.state': 'open' },
      { $set: { 'plan.state': 'done', 'plan.recordId': new mongoose.Types.ObjectId(String(body.doneAs.recordId)), 'plan.doneBy': 'confirmed', 'plan.doneAt': now, updatedAt: now } },
      { timestamps: false } as any,
    );
  }
  return { ok: true as const, rule: view(rule), made: filled.made, problem: filled.problem };
}

/** Removes a rule's open plans from `date` on whose start is still to come — touched ones too
 *  (Google's "this and following" / "all events"); `keep` is spared. */
async function dropFrom(userId: string, ruleId: mongoose.Types.ObjectId, date: string, keep: string | null, now = Date.now()) {
  const plans = await LogPlan.find({ userId, 'plan.repeatId': ruleId, 'plan.state': 'open', 'plan.occurrence': { $gte: date } }).select('start').lean() as any[];
  const ids = plans.filter(p => String(p._id) !== keep && (instantOf(p.start) ?? 0) > now).map(p => p._id);
  if (!ids.length) return 0;
  return (await LogPlan.deleteMany({ userId, _id: { $in: ids } })).deletedCount ?? 0;
}

/** Ends a rule the day before `date` (no more occurrences from then; stopped if none are left). */
async function endBefore(userId: string, rule: any, date: string) {
  const until = addDays(date, -1);
  if (until < rule.from) await RepeatRule.updateOne({ _id: rule._id, userId }, { $set: { stoppedAt: new Date() } });
  else await RepeatRule.updateOne({ _id: rule._id, userId }, { $set: { until, count: null } });
}

/**
 * "This and following events" (24 Nov): the plan being edited and every occurrence after it
 * follow the new settings — the old repeat ends the day before; a new one starts on the
 * plan's date with the plan as its first occurrence. Body: the rule (from = that date) +
 * planId, updatedAt, planForm (the plan's own edits).
 */
export async function splitRule(userId: string, id: string, body: any) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown repeat.');
  const old = await RepeatRule.findOne({ _id: id, userId }).lean() as any;
  if (!old) return fail(404, 'This repeat no longer exists.');
  const v = validate(body);
  if (!v.ok) return v;
  // "After N times" left as it was: the new part makes only the ones still owed (as Google).
  if (v.rule.count && old.count === v.rule.count) {
    const before = occurrences(old, addDays(v.rule.from, -1)).length;
    v.rule.count = Math.max(1, old.count - before);
  }
  const planId = String(body?.planId ?? '');
  const a = await adjustPlan(userId, planId, body.planForm, String(body?.updatedAt ?? ''));
  if (!a.ok) return a;
  await dropFrom(userId, old._id, v.rule.from, planId);
  await endBefore(userId, old, v.rule.from);
  const [r] = await RepeatRule.create([{ userId, ...v.rule }]);
  const rule = (r as any).toObject();
  if (a.kind === 'plan') await adopt(userId, planId, rule._id, v.rule.from);
  const filled = await fillRule(userId, rule);
  return { ok: true as const, rule: view(rule), made: filled.made, problem: filled.problem, kind: a.kind, id: a.id };
}

/** "All events" (24 Nov): this plan's edits, then the rule — its untouched plans still to
 *  come are made again; plans already records stay as they are. */
export async function updateAll(userId: string, id: string, body: any) {
  let a: Awaited<ReturnType<typeof adjustPlan>> | null = null;
  if (body?.planId) {
    a = await adjustPlan(userId, String(body.planId), body.planForm, String(body?.updatedAt ?? ''));
    if (!a.ok) return a;
  }
  const u = await updateRule(userId, id, body);
  if (!u.ok) return u;
  return { ...u, kind: a?.ok ? a.kind : 'plan', id: a?.ok ? a.id : null };
}

/**
 * Deleting a repeating plan (24 Nov, as Google): scope 'one' — this plan; 'following' — this
 * and every later occurrence (the repeat ends the day before); 'all' — the repeat stops and
 * its plans still to come go. Records already made stay.
 */
export async function deleteScoped(userId: string, id: string, body: any) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown repeat.');
  const r = await RepeatRule.findOne({ _id: id, userId }).lean() as any;
  if (!r) return fail(404, 'This repeat no longer exists.');
  const scope = body?.scope;
  if (!['one', 'following', 'all'].includes(scope)) return fail(400, "scope: 'one', 'following' or 'all'.");
  const planId = body?.planId ? String(body.planId) : null;
  if (planId) {
    const d = await deletePlan(userId, planId, String(body?.updatedAt ?? ''));
    if (!d.ok) return d;
  }
  if (scope === 'one') return { ok: true as const, removed: planId ? 1 : 0 };
  const at = scope === 'all' ? '0000-01-01' : String(body?.at ?? '');
  if (scope === 'following' && !DATE.test(at)) return fail(400, 'at: the date to delete from (YYYY-MM-DD).');
  // keepId: a repeating plan set to "Does not repeat" — it stays, as a single plan.
  const keep = body?.keepId && mongoose.isValidObjectId(body.keepId) ? String(body.keepId) : null;
  if (keep) await LogPlan.updateOne({ _id: keep, userId }, { $set: { 'plan.repeatId': null, 'plan.occurrence': null } });
  const removed = await dropFrom(userId, r._id, at, keep);
  if (scope === 'all') await RepeatRule.updateOne({ _id: r._id, userId }, { $set: { stoppedAt: new Date() } });
  else await endBefore(userId, r, at);
  return { ok: true as const, removed: removed + (planId ? 1 : 0) };
}

export async function updateRule(userId: string, id: string, body: any) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown repeat.');
  const old = await RepeatRule.findOne({ _id: id, userId }).lean() as any;
  if (!old) return fail(404, 'This repeat no longer exists.');
  if (old.stoppedAt) return fail(409, 'This repeat was stopped.');
  const v = validate(body);
  if (!v.ok) return v;
  const today = localNow(v.rule.iana).date;
  let removed = await dropUntouched(userId, old._id, today);
  // An end date: nothing after it stays, touched or not (24 Nov: "Ends on 29 Nov" left
  // plans after it).
  if (v.rule.until) removed += await dropFrom(userId, old._id, addDays(v.rule.until, 1), null);
  await RepeatRule.updateOne({ _id: old._id, userId }, { $set: { ...v.rule, filledUntil: null } });
  const rule = await RepeatRule.findOne({ _id: old._id, userId }).lean() as any;
  const filled = await fillRule(userId, rule);
  return { ok: true as const, rule: view(rule), removed, made: filled.made, problem: filled.problem };
}

/** Stop: no more occurrences; untouched ones still to come are removed. */
export async function stopRule(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown repeat.');
  const r = await RepeatRule.findOne({ _id: id, userId }).lean() as any;
  if (!r) return fail(404, 'This repeat no longer exists.');
  if (r.stoppedAt) return { ok: true as const, removed: 0 };
  const removed = await dropUntouched(userId, r._id, localNow(r.iana).date);
  await RepeatRule.updateOne({ _id: r._id, userId }, { $set: { stoppedAt: new Date() } });
  return { ok: true as const, removed };
}
