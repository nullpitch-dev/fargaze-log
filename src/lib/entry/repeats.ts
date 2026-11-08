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
import { mergeForm, settleOne } from './save';
import { addDays, addMinutes, daysBetween, instantOf, localNow, weekdayOfDate, zoneCodeFor, type ZoneRow } from './time';

export const HORIZON_DAYS = 60;
const REFILL_WHEN_LEFT = 45;   // refill once fewer days than this are made ahead

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface RuleInput {
  name: string; form: any; allDay?: boolean; startTime?: string | null; minutes?: number | null; iana: string;
  freq: 'daily' | 'weekly' | 'monthly'; interval?: number; weekdays?: number[] | null; monthDay?: number | null;
  from: string; until?: string | null; count?: number | null; mode?: 'ask' | 'auto';
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** The rule's occurrence dates from its first date up to `upTo` (inclusive), within until / count. */
export function occurrences(rule: Pick<RuleInput, 'freq' | 'interval' | 'weekdays' | 'monthDay' | 'from' | 'until' | 'count'>, upTo: string): string[] {
  const out: string[] = [];
  const every = Math.max(1, rule.interval ?? 1);
  const last = rule.until && rule.until < upTo ? rule.until : upTo;
  const days = rule.freq === 'weekly' ? (rule.weekdays?.length ? rule.weekdays : [weekdayOfDate(rule.from)]) : [];
  const monthDay = rule.monthDay ?? Number(rule.from.slice(8, 10));
  const weekStart = addDays(rule.from, -weekdayOfDate(rule.from));
  const [fy, fm] = rule.from.split('-').map(Number);
  for (let d = rule.from; d <= last; d = addDays(d, 1)) {
    let hit = false;
    if (rule.freq === 'daily') hit = daysBetween(rule.from, d) % every === 0;
    else if (rule.freq === 'weekly') hit = Math.floor(daysBetween(weekStart, d) / 7) % every === 0 && days.includes(weekdayOfDate(d));
    else {
      const [y, m, dd] = d.split('-').map(Number);
      hit = ((y * 12 + m) - (fy * 12 + fm)) % every === 0 && dd === monthDay;
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
  if (rule.minutes != null && !rule.allDay && hour) {
    const e = addMinutes(date, hour, rule.minutes);
    f.end = { date: e.date, hour: e.hour, timezone: zoneCodeFor(rule.iana, e.date, e.hour, zones) ?? '' };
  } else if (rule.allDay && rule.minutes != null) {
    const e = addDays(date, Math.max(0, Math.round(rule.minutes / 1440) - 1));
    f.end = { date: e, hour: '', timezone: f.start.timezone };
  } else {
    f.end = { date: '', hour: '', timezone: '' };
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
  const horizon = addDays(today, HORIZON_DAYS);
  const startFrom = rule.filledUntil ? addDays(rule.filledUntil, 1) : (rule.from > today ? rule.from : today);
  const dates = occurrences(rule, horizon).filter(d => d >= startFrom);
  const [ctx, zones] = await Promise.all([loadFormContext(userId), zonesOf(userId)]);
  const docs: any[] = [];
  let problem: string | null = null;
  for (const date of dates) {
    const built = buildRecord(occurrenceForm(rule, date, zones), null, ctx);
    if (built.problems.length) { problem = built.problems[0]; continue; }
    const t = new Date(now);
    docs.push({ ...built.doc, userId, createdAt: t, updatedAt: t, plan: { state: 'open', repeatId: rule._id, occurrence: date } });
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
    if (!r.filledUntil || daysBetween(today, r.filledUntil) < REFILL_WHEN_LEFT) made += (await fillRule(userId, r, now)).made;
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
      const endAt = instantOf(p.end) ?? instantOf(p.start);
      const over = p.end?.datetime || !p.end?.year ? endAt : (endAt ?? 0) + 86_400_000;   // an all-day end lasts the whole day
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
  if (!['daily', 'weekly', 'monthly'].includes(b?.freq)) return fail(400, 'Repeat: daily, weekly or monthly.');
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
  const count = b?.count == null || b.count === '' ? null : Number(b.count);
  if (count != null && (!Number.isInteger(count) || count < 1)) return fail(400, 'Times: a whole number, 1 or more.');
  const { start: _s, end: _e, ...form } = b.form;
  return {
    ok: true,
    rule: {
      name, form, allDay, startTime, minutes, iana, freq: b.freq, interval,
      weekdays: b.freq === 'weekly' ? (weekdays?.length ? weekdays : null) : null,
      monthDay: b.freq === 'monthly' ? monthDay : null,
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

export async function createRule(userId: string, body: any) {
  const v = validate(body);
  if (!v.ok) return v;
  const [r] = await RepeatRule.create([{ userId, ...v.rule }]);
  const filled = await fillRule(userId, (r as any).toObject());
  return { ok: true as const, rule: view((r as any).toObject()), made: filled.made, problem: filled.problem };
}

export async function updateRule(userId: string, id: string, body: any) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown repeat.');
  const old = await RepeatRule.findOne({ _id: id, userId }).lean() as any;
  if (!old) return fail(404, 'This repeat no longer exists.');
  if (old.stoppedAt) return fail(409, 'This repeat was stopped.');
  const v = validate(body);
  if (!v.ok) return v;
  const today = localNow(v.rule.iana).date;
  const removed = await dropUntouched(userId, old._id, today);
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
