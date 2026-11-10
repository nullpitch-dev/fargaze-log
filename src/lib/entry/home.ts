// The entry app's home screen (#71, Design §15.7; layout by Hyoje, 9 Nov 2026). Server only.
//   Coming up   plans starting today, or on an earlier day, not started yet — they stay
//               until Start now (or Done as planned / Delete on the plan's page)
//   In progress open records started today, and last night's 수면; past their planned end
//               they stay until End now (one made from a plan shows its planned end)
//   Done        records that ended today, whenever they started
//   Ongoing     open records started before today (books, trips …) — folded on the phone
//   Presets, Recent (Copy recent: the latest record of each activity + title among the
//               last 300 records, about two weeks; typing searches all years — searchRecent)
// Opening it first tops up the repeats and settles "count as done" plans (repeats.ts).
// Tomorrow onwards: the Calendar (Hyoje, 9 Nov).

import Log from '../../models/Log';
import LogPlan from '../../models/LogPlan';
import { refresh } from './repeats';
import { listPresets } from './presets';
import { addDays, instantOf, localNow } from './time';

const COMING_DAYS = 7;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(d as any).toISOString() : '');

/** The short form the lists show; the full entry opens on a tap. */
function item(d: any, extra: Record<string, unknown> = {}) {
  return {
    id: String(d._id),
    activity: d.activity?.name ?? '',
    category: d.activity?.category ?? '',
    title: d.activity?.title ?? '',
    start: { date: dateOf(d.start), hour: d.start?.hour ?? '', timezone: d.start?.timezone ?? '' },
    end: { date: dateOf(d.end), hour: d.end?.hour ?? '', timezone: d.end?.timezone ?? '' },
    place: d.location?.activity ?? '',
    updatedAt: iso(d.updatedAt),
    ...extra,
  };
}
const pad = (x: unknown) => String(x ?? '').padStart(2, '0');
const dateOf = (p: any) => (p?.year && p?.month && p?.day ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : '');

const SLEEP = '수면';
/** 'YYYY-MM-DD HH:mm' for ordering; an all-day point sorts at the start of its day. */
const key = (p: { date: string; hour: string }) => `${p.date} ${(p.hour || '0:00').padStart(5, '0')}`;
const isOpenRec = (r: any) => !r?.end?.year || (!!r?.start?.hour && !r?.end?.hour);

export async function home(userId: string, iana = 'Europe/London', now = Date.now()) {
  const refreshed = await refresh(userId, now);
  const today = localNow(iana, now).date;
  const yesterday = addDays(today, -1);
  const [y, m, d] = today.split('-').map(Number);

  // Coming up: open plans whose start day is today or earlier.
  const plans = await LogPlan.find({
    userId, 'plan.state': 'open',
    // naive local times: the end of tomorrow covers every zone's today
    $or: [{ 'start.datetime': { $lte: new Date(Date.parse(addDays(today, 1) + 'T23:59:59Z')) } }, { 'start.datetime': null }],
  }).sort({ 'start.datetime': 1 }).lean() as any[];
  const comingUp = plans
    .filter(p => dateOf(p.start) && dateOf(p.start) <= today)
    .map(p => item(p, { repeat: !!p.plan?.repeatId, started: (instantOf(p.start) ?? 0) <= now }))
    .sort((a, b) => key(b.start).localeCompare(key(a.start)));

  const [open, ended, latest] = await Promise.all([
    // Open: no end at all, or a start time without an end time (as the form says).
    Log.find({ userId, 'start.year': { $ne: null }, $or: [{ 'end.year': null }, { 'start.hour': { $nin: [null, ''] }, 'end.hour': { $in: [null, ''] } }] })
      .sort({ 'start.datetime': -1 }).limit(200).lean(),
    Log.find({ userId, 'end.year': y, 'end.month': m, 'end.day': d }).sort({ 'end.datetime': 1 }).lean(),
    Log.find({ userId, 'start.datetime': { $ne: null } }).sort({ 'start.datetime': -1 }).limit(300)
      .select('activity start end location updatedAt').lean(),
  ]);

  // Planned ends of records started from a plan.
  const openIds = (open as any[]).map(r => r._id);
  const fromPlans = openIds.length
    ? await LogPlan.find({ userId, 'plan.recordId': { $in: openIds } }).select('end plan.recordId').lean() as any[]
    : [];
  const plannedEnd = new Map(fromPlans.map(p => [String(p.plan.recordId), p.end?.hour ? { date: dateOf(p.end), hour: p.end.hour } : null]));

  const inProgress: any[] = [], ongoing: any[] = [];
  for (const r of open as any[]) {
    const day = dateOf(r.start);
    const it = item(r, { plannedEnd: plannedEnd.get(String(r._id)) ?? null });
    if (day === today || (day === yesterday && r.activity?.name === SLEEP)) inProgress.push(it);
    else if (day < today) ongoing.push(it);
    else inProgress.push(it);           // started later today (a time set ahead by hand)
  }
  // Newest first in every list (Hyoje, 9 Nov): the older, the lower.
  inProgress.sort((a, b) => key(b.start).localeCompare(key(a.start)));
  ongoing.sort((a, b) => key(b.start).localeCompare(key(a.start)));

  // Done: ended today, whenever they started.
  const done = (ended as any[]).filter(r => !isOpenRec(r)).map(r => item(r))
    .sort((a, b) => key(b.end).localeCompare(key(a.end)));

  // A new entry starts at the place of the latest thing today (ended, or started and still going).
  const latestToday = [...done.map(d => ({ at: key(d.end), place: d.place })), ...inProgress.filter(i => i.start.date === today).map(i => ({ at: key(i.start), place: i.place }))]
    .filter(x => x.place).sort((a, b) => b.at.localeCompare(a.at))[0];
  const lastPlace = latestToday?.place ?? '';

  // Copy recent: the latest record of each activity + title, newest first.
  const seen = new Set<string>();
  const recent = (latest as any[]).filter(r => {
    const k = `${r.activity?.name}\u0001${r.activity?.title ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 40).map(r => item(r));

  return {
    ok: true as const,
    now: new Date(now).toISOString(),
    today,
    comingUp,
    inProgress,
    done,
    ongoing,
    lastPlace,
    recent,
    presets: await listPresets(userId),
    refreshed,
  };
}

/** Copy recent with a search: every record whose activity or title has the text, the
 *  latest of each activity + title, newest first (all years). */
export async function searchRecent(userId: string, q: string) {
  const text = q.trim();
  if (!text) return { ok: true as const, recent: [] };
  const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const rows = await Log.find({ userId, $or: [{ 'activity.name': re }, { 'activity.title': re }] })
    .sort({ 'start.datetime': -1 }).limit(500).select('activity start end location updatedAt').lean() as any[];
  const seen = new Set<string>();
  const recent = rows.filter(r => {
    const k = `${r.activity?.name}\u0001${r.activity?.title ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 40).map(r => item(r));
  return { ok: true as const, recent };
}
