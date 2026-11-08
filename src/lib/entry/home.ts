// The entry app's home screen (#71, Design §15.7). Server only.
//   To confirm — plans whose start has passed, oldest first; 'running' while their end is
//                still to come (Started as planned), 'over' after it (Done as planned)
//   Open       — records with a start and no end (수면 tonight, a book for weeks), newest first
//   Today      — today's records in Hyoje's zone, by start
//   Coming up  — plans in the next 7 days
//   Presets    — in his order
//   Recent     — for Copy recent: the latest record of each activity + title among the
//                last 300 records (about two weeks); typing searches all years (searchRecent)
// Opening it first tops up the repeats and settles "count as done" plans (repeats.ts).

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

export async function home(userId: string, iana = 'Europe/London', now = Date.now()) {
  const refreshed = await refresh(userId, now);
  const today = localNow(iana, now).date;
  const [y, m, d] = today.split('-').map(Number);

  // Plans: every open one that has started, and the next 7 days.
  const plans = await LogPlan.find({
    userId, 'plan.state': 'open',
    // naive local times: the end of the 8th day covers every zone
    $or: [{ 'start.datetime': { $lte: new Date(Date.parse(addDays(today, COMING_DAYS + 1) + 'T23:59:59Z')) } }, { 'start.datetime': null }],
  }).sort({ 'start.datetime': 1 }).lean() as any[];
  const toConfirm: any[] = [];
  const comingUp: any[] = [];
  for (const p of plans) {
    const s = instantOf(p.start);
    if (s == null) continue;
    const extra = { repeat: !!p.plan?.repeatId, edited: !!p.plan?.edited };
    if (s <= now) {
      const e = instantOf(p.end);
      toConfirm.push(item(p, { ...extra, status: e != null && e > now ? 'running' : 'over' }));
    } else if (dateOf(p.start) <= addDays(today, COMING_DAYS)) comingUp.push(item(p, extra));
  }

  const [open, todays, latest] = await Promise.all([
    // Open: no end at all, or a start time without an end time (as the form says).
    Log.find({ userId, 'start.year': { $ne: null }, $or: [{ 'end.year': null }, { 'start.hour': { $nin: [null, ''] }, 'end.hour': { $in: [null, ''] } }] })
      .sort({ 'start.datetime': -1 }).limit(100).lean(),
    Log.find({ userId, 'start.year': y, 'start.month': m, 'start.day': d }).sort({ 'start.datetime': 1 }).lean(),
    Log.find({ userId, 'start.datetime': { $ne: null } }).sort({ 'start.datetime': -1 }).limit(300)
      .select('activity start end location updatedAt').lean(),
  ]);
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
    toConfirm,
    open: (open as any[]).map(r => item(r)),
    todayRecords: (todays as any[]).map(r => item(r)),
    comingUp,
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
