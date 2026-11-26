// Google Calendar sync (Design §15.9, agreed with Hyoje 26 Nov 2026). Server only.
//
// One way only: the app → Google. A record or plan with the tick (sync.export 'Y', in
// sync.calendar) has one Google event; the app keeps it in step and never reads Google back.
// Only events the app made or took over are ever touched: other family events are not.
//
// When: after each save (syncAfter, in the background), when Today / the Calendar load
// (syncSoon, at most every 30 s), and nightly (/api/cron/gcal) to catch anything missed.
// Each run looks at what changed since the last one (updatedAt, the trash), the events that
// failed before, and every plan that has an event (so plans a repeat removed lose theirs).
//
// How an event follows its record (gcal_events rows; the record's sync.eventId is a hint):
//   a plan that happens        its record takes over the plan's event (hint, or plan.recordId)
//   back to Coming up          the plan takes over the record's event (hint)
//   a repeat's plan made again the new plan takes over the old one's event (same day)
//   an old Apps Script event   a record or plan with its ID in sync.eventId takes it over
//                              the first time it is changed — never before
//   untick, delete             the event is removed (Undo puts a new one back)
// Nothing is touched for a calendar with no ID set (test.log).

import { createHash } from 'crypto';
import mongoose from 'mongoose';
import { after } from 'next/server';
import Log from '../../models/Log';
import LogPlan from '../../models/LogPlan';
import LogTrash from '../../models/LogTrash';
import TimezoneMaster from '../../models/TimezoneMaster';
import GcalEvent from '../../models/GcalEvent';
import GcalState from '../../models/GcalState';
import connectDB from '../mongodb';
import { eventOf, calendarOf, type GEvent, type ZoneInfo } from './event';
import { calendarIdOf, syncConfigured } from './config';

// The Google library only when a call is due (26 Nov, Vercel CPU: it was parsed on every cold
// start of every route that starts a sync).
let googleMod: Promise<any> | null = null;
const g = () => (googleMod ??= import('./google'));
const insertEvent = async (calendarId: string, ev: GEvent, docId: string): Promise<string> => (await g()).insertEvent(calendarId, ev, docId);
const patchEvent = async (calendarId: string, eventId: string, ev: GEvent, docId: string): Promise<void> => (await g()).patchEvent(calendarId, eventId, ev, docId);
const removeEvent = async (calendarId: string, eventId: string): Promise<void> => (await g()).removeEvent(calendarId, eventId);
const isGone = (e: any) => [404, 410].includes(Number(e?.code ?? e?.response?.status ?? 0));
const errorText = (e: any) => {
  const code = Number(e?.code ?? e?.response?.status ?? 0);
  const msg = e?.response?.data?.error?.message ?? e?.errors?.[0]?.message ?? e?.message ?? String(e);
  return `${code || ''} ${msg}`.trim().slice(0, 300);
};

const OID = (x: any) => new mongoose.Types.ObjectId(String(x));
const idOf = (x: any) => String(x);
const hashOf = (calendar: string, ev: GEvent) => createHash('sha1').update(JSON.stringify({ calendar, ev })).digest('hex');

/** Per run: Google calls and time, so a run inside a request never runs too long. The rest
 *  waits for the next run (nothing is lost: what changed is looked at again). */
const MAX_CALLS = 30;
const MAX_MS = 20_000;
const CHANGED_LIMIT = 2000;
const MAX_TRIES = 8;
const LOCK_MS = 120_000;

export interface SyncReport { inserted: number; updated: number; removed: number; unchanged: number; failed: string[]; more: boolean; skipped?: string }

async function zonesOf(userId: string): Promise<Map<string, ZoneInfo>> {
  const rows = await TimezoneMaster.find({ userId }).select('code offsetUTC ianaTimezone').lean() as any[];
  return new Map(rows.map(z => [String(z.code), { offset: Number(z.offsetUTC), iana: String(z.ianaTimezone) }]));
}

type Item = { id: string; kind: 'record' | 'plan'; doc: any | null; trash: boolean };

export async function syncCalendar(userId: string, opts: { since?: Date; ids?: string[]; all?: boolean } = {}): Promise<SyncReport> {
  const empty: SyncReport = { inserted: 0, updated: 0, removed: 0, unchanged: 0, failed: [], more: false };
  if (!syncConfigured()) return { ...empty, skipped: 'not set up (no key or calendar ID)' };
  await connectDB();

  // The lock: one run at a time; a second asks the running one to go round again.
  await GcalState.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true });
  const ids = (opts.ids ?? []).filter(x => mongoose.isValidObjectId(x)).map(String);
  const now0 = new Date();
  const got = await GcalState.findOneAndUpdate(
    { userId, $or: [{ lockUntil: null }, { lockUntil: { $lt: now0 } }] },
    { $set: { lockUntil: new Date(Date.now() + LOCK_MS), again: false } },
    { returnDocument: 'before' },
  ).lean() as any;
  if (!got) {
    await GcalState.updateOne({ userId }, { $set: { again: true }, $addToSet: { pendingIds: { $each: ids } } });
    return { ...empty, skipped: 'another sync is running' };
  }
  const report = { ...empty };
  try {
    let state = got;
    let since = opts.since ?? null;
    let extra = [...ids, ...(state.pendingIds ?? [])];
    for (let round = 0; round < 3; round++) {
      await GcalState.updateOne({ userId }, { $set: { pendingIds: [] } });
      const r = await pass(userId, since ?? (state.cursor ? new Date(new Date(state.cursor).getTime() - 120_000) : new Date(Date.now() - 600_000)), extra, !!opts.all, report);
      await GcalState.updateOne({ userId }, { $set: { ...(r.cursor ? { cursor: r.cursor } : {}), lastRunAt: new Date() } });
      if (report.more) break;
      state = await GcalState.findOne({ userId }).lean() as any;
      if (!state?.again) break;
      await GcalState.updateOne({ userId }, { $set: { again: false } });
      since = null; extra = state.pendingIds ?? [];
    }
  } finally {
    const text = `+${report.inserted} ~${report.updated} -${report.removed} =${report.unchanged}${report.failed.length ? ` failed ${report.failed.length}: ${report.failed[0]}` : ''}${report.more ? ' (more to do)' : ''}`;
    await GcalState.updateOne({ userId }, { $set: { lockUntil: null, lastReport: text } });
  }
  return report;
}

/** One pass. Returns the cursor to keep (null = keep the old one: not finished). */
async function pass(userId: string, since: Date, extraIds: string[], all: boolean, rep: SyncReport): Promise<{ cursor: Date | null }> {
  const started = Date.now();
  const runStart = new Date();
  let calls = 0;
  const budget = () => calls < MAX_CALLS && Date.now() - started < MAX_MS;

  // What to look at.
  const [logCh, planCh, trashCh, retry, planRows, allRows] = await Promise.all([
    Log.find({ userId, updatedAt: { $gt: since } }).select('_id updatedAt').sort({ updatedAt: 1 }).limit(CHANGED_LIMIT).lean() as Promise<any[]>,
    LogPlan.find({ userId, updatedAt: { $gt: since } }).select('_id updatedAt').sort({ updatedAt: 1 }).limit(CHANGED_LIMIT).lean() as Promise<any[]>,
    LogTrash.find({ userId, deletedAt: { $gt: since } }).select('record._id').lean() as Promise<any[]>,
    GcalEvent.find({ userId, error: { $ne: null }, tries: { $lt: MAX_TRIES } }).select('docId').lean() as Promise<any[]>,
    GcalEvent.find({ userId, kind: 'plan' }).select('docId').lean() as Promise<any[]>,
    all ? GcalEvent.find({ userId }).select('docId').lean() as Promise<any[]> : Promise.resolve([] as any[]),
  ]);
  // A bulk change (a rename) can touch more than one run takes: go as far as the last one read.
  let cursor: Date | null = runStart;
  for (const list of [logCh, planCh]) {
    if (list.length === CHANGED_LIMIT) {
      const last = new Date(list[list.length - 1].updatedAt);
      if (!cursor || last < cursor) cursor = last;
    }
  }
  const cand = new Set<string>([
    ...logCh.map(d => idOf(d._id)), ...planCh.map(d => idOf(d._id)),
    ...trashCh.map(t => idOf(t.record?._id)).filter(x => x !== 'undefined'),
    ...retry.map(r => idOf(r.docId)), ...planRows.map(r => idOf(r.docId)), ...allRows.map(r => idOf(r.docId)),
    ...extraIds,
  ]);
  if (!cand.size) return { cursor };
  const candIds = [...cand].filter(x => mongoose.isValidObjectId(x)).map(OID);

  // Rows of these, then the documents that matter: ticked, holding an old event, or with a row.
  const rows = await GcalEvent.find({ userId, docId: { $in: candIds } }).lean() as any[];
  const rowIds = rows.map(r => r.docId);
  const relevant = { $or: [{ 'sync.export': 'Y' }, { 'sync.export': 'y' }, { 'sync.eventId': { $type: 'string' } }, { _id: { $in: rowIds } }] };
  const [logs, plans, trash] = await Promise.all([
    Log.find({ userId, _id: { $in: candIds }, ...relevant }).lean() as Promise<any[]>,
    LogPlan.find({ userId, _id: { $in: candIds }, ...relevant }).lean() as Promise<any[]>,
    LogTrash.find({ userId, 'record._id': { $in: candIds } }).lean() as Promise<any[]>,
  ]);
  // Ids that exist but don't matter (unticked, never synced) drop out here.
  const live = new Set<string>([
    ...(await Log.find({ userId, _id: { $in: candIds } }).select('_id').lean() as any[]).map(d => idOf(d._id)),
    ...(await LogPlan.find({ userId, _id: { $in: candIds } }).select('_id').lean() as any[]).map(d => idOf(d._id)),
  ]);
  const items = new Map<string, Item>();
  for (const d of plans) items.set(idOf(d._id), { id: idOf(d._id), kind: 'plan', doc: d, trash: false });
  for (const d of logs) items.set(idOf(d._id), { id: idOf(d._id), kind: 'record', doc: d, trash: false });   // a record wins over a plan of the same id
  for (const t of trash) {
    const id = idOf(t.record?._id);
    if (!items.has(id) && !live.has(id)) items.set(id, { id, kind: 'record', doc: t.record, trash: true });
  }
  for (const r of rows) {
    const id = idOf(r.docId);
    if (!items.has(id) && !live.has(id)) items.set(id, { id, kind: r.kind, doc: null, trash: false });   // gone for good
  }
  // A row whose record exists but no longer matters (unticked, hint gone): it must go too.
  for (const r of rows) {
    const id = idOf(r.docId);
    if (!items.has(id)) {
      const d = await Log.findOne({ userId, _id: r.docId }).lean() ?? await LogPlan.findOne({ userId, _id: r.docId }).lean();
      items.set(id, { id, kind: (d as any)?.plan ? 'plan' : 'record', doc: d, trash: false });
    }
  }
  if (!items.size) return { cursor };

  const zones = await zonesOf(userId);
  const rowByDoc = new Map<string, any>(rows.map(r => [idOf(r.docId), r]));
  const hints = [...items.values()].map(i => i.doc?.sync?.eventId).filter((x: any) => typeof x === 'string' && x);
  const hintRows = hints.length ? await GcalEvent.find({ userId, eventId: { $in: hints } }).lean() as any[] : [];
  const rowByEvent = new Map<string, any>();
  for (const r of [...rows, ...hintRows]) if (r.eventId) rowByEvent.set(r.eventId, r);

  const wanted = (it: Item) => !!it.doc && !it.trash && (it.kind === 'record' || it.doc?.plan?.state === 'open') && !!calendarOf(it.doc);
  const want = [...items.values()].filter(wanted);
  const wantIds = new Set(want.map(w => w.id));
  const taken = new Set<string>();          // row _ids moved to another document this pass

  /** Someone else (a live record, an open plan, a row) holds this Google event. */
  const heldElsewhere = async (eventId: string, id: string) => {
    const r = rowByEvent.get(eventId);
    if (r && idOf(r.docId) !== id && (wantIds.has(idOf(r.docId)) || !items.has(idOf(r.docId)))) return true;
    const oid = OID(id);
    return !!(await Log.exists({ userId, 'sync.eventId': eventId, _id: { $ne: oid } }))
      || !!(await LogPlan.exists({ userId, 'sync.eventId': eventId, _id: { $ne: oid }, 'plan.state': 'open' }));
  };
  /** Whether a row's own document still wants its event (looked up if not in this pass). */
  const rowStillWanted = async (r: any) => {
    const id = idOf(r.docId);
    if (items.has(id)) return wantIds.has(id);
    const d = (await Log.findOne({ userId, _id: r.docId }).lean() as any) ?? (await LogPlan.findOne({ userId, _id: r.docId }).lean() as any);
    return !!d && (!d.plan || d.plan.state === 'open') && !!calendarOf(d);
  };
  const hintTo = async (it: Item, eventId: string | null) => {
    if (it.trash) { await LogTrash.updateOne({ userId, 'record._id': OID(it.id) }, { $set: { 'record.sync.eventId': eventId } }); return; }
    const M: any = it.kind === 'plan' ? LogPlan : Log;
    await M.updateOne({ userId, _id: OID(it.id) }, { $set: { 'sync.eventId': eventId, 'sync.status': eventId ? 'Synced' : null } }, { timestamps: false });
  };

  // 1. Wanted: make, take over or update its event. Done first, so an event about to be left
  //    by one document (a plan that happened) is taken over rather than removed.
  /** false = out of budget: stop here, the next run goes on. */
  const doWanted = async (it: Item): Promise<boolean> => {
    const cal = calendarOf(it.doc)!;
    const calendarId = calendarIdOf(cal);
    if (!calendarId) return true;                  // this calendar isn't set up here
    const built = eventOf(it.doc, zones);
    if (!built.ok) {
      const old = rowByDoc.get(it.id);
      if (old?.error !== `not sent: ${built.why}`) { rep.failed.push(`${it.id}: ${built.why}`); await saveRow(userId, it, cal, old?.eventId ?? null, null, null, `not sent: ${built.why}`, old); }
      return true;
    }
    const hash = hashOf(cal, built.event);

    let row = rowByDoc.get(it.id) ?? null;
    if (!row) {
      const hint: string | null = typeof it.doc?.sync?.eventId === 'string' ? it.doc.sync.eventId : null;
      let take: any = hint ? rowByEvent.get(hint) ?? null : null;
      // A plan that happened: the record takes the plan's event even without the hint.
      if (!take && it.kind === 'record') {
        const from = await LogPlan.findOne({ userId, 'plan.recordId': OID(it.id) }).select('_id').lean() as any;
        if (from) take = await GcalEvent.findOne({ userId, docId: from._id }).lean();
      }
      // A repeat's plan made again for the same day: the old plan's event.
      if (!take && it.kind === 'plan' && it.doc?.plan?.repeatId && it.doc?.plan?.occurrence) {
        take = await GcalEvent.findOne({ userId, kind: 'plan', repeatId: it.doc.plan.repeatId, occurrence: it.doc.plan.occurrence, docId: { $ne: OID(it.id) } }).lean();
      }
      if (take && (taken.has(idOf(take._id)) || (idOf(take.docId) !== it.id && await rowStillWanted(take)))) take = null;
      if (take) { taken.add(idOf(take._id)); row = { ...take, moved: true }; }
      else if (hint && !(await heldElsewhere(hint, it.id))) row = { eventId: hint, calendar: cal, hash: null, adopted: true };   // an old Apps Script event
    }
    if (row?.eventId && row.hash === hash && row.calendar === cal && !row.moved && !row.error) { rep.unchanged++; return true; }
    if (!budget()) return false;

    try {
      let eventId: string;
      if (row?.eventId && row.calendar === cal) {
        try { calls++; await patchEvent(calendarId, row.eventId, built.event, it.id); eventId = row.eventId; rep.updated++; }
        catch (e) { if (!isGone(e)) throw e; calls++; eventId = await insertEvent(calendarId, built.event, it.id); rep.inserted++; }
      } else {
        if (row?.eventId && row.calendar !== cal) { const old = calendarIdOf(row.calendar); if (old) { calls++; await removeEvent(old, row.eventId); } }
        calls++; eventId = await insertEvent(calendarId, built.event, it.id); rep.inserted++;
      }
      await saveRow(userId, it, cal, eventId, hash, new Date(), null, row);
      if (it.doc?.sync?.eventId !== eventId) await hintTo(it, eventId);
    } catch (e) {
      rep.failed.push(`${it.id}: ${errorText(e)}`);
      await saveRow(userId, it, cal, row?.eventId ?? null, null, null, errorText(e), row);
    }
    return true;
  };
  for (const it of want) {
    if (!(await doWanted(it))) { rep.more = true; return { cursor: null } }
  }

  // 2. Not wanted (unticked, deleted, a plan that is done or gone): remove its event.
  for (const it of items.values()) {
    if (wantIds.has(it.id)) continue;
    const row = rowByDoc.get(it.id);
    if (row && taken.has(idOf(row._id))) continue;          // moved to another document above
    // A plan that happened, whose record wasn't in this run: the record takes the event now.
    if (row && it.kind === 'plan' && it.doc?.plan?.state === 'done' && it.doc?.plan?.recordId) {
      const rec = await Log.findOne({ userId, _id: it.doc.plan.recordId }).lean() as any;
      if (rec && calendarOf(rec)) {
        const ri: Item = { id: idOf(rec._id), kind: 'record', doc: rec, trash: false };
        items.set(ri.id, ri); wantIds.add(ri.id);
        if (!(await doWanted(ri))) { rep.more = true; return { cursor: null }; }
        continue;
      }
    }
    const eventId: string | null = row?.eventId ?? (typeof it.doc?.sync?.eventId === 'string' ? it.doc.sync.eventId : null);
    if (!eventId && row) { await GcalEvent.deleteOne({ _id: row._id }); continue; }
    if (!eventId) continue;
    // A done plan whose record now holds the event, a copy … : not ours to remove.
    if (!row && await heldElsewhere(eventId, it.id)) continue;
    const cal = row?.calendar ?? calendarOf({ sync: { ...(it.doc?.sync ?? {}), export: 'Y' } })!;
    const calendarId = calendarIdOf(cal);
    if (!calendarId) continue;
    if (!budget()) { rep.more = true; return { cursor: null }; }
    try {
      calls++; await removeEvent(calendarId, eventId); rep.removed++;
      if (row) await GcalEvent.deleteOne({ _id: row._id });
      if (it.doc && (it.trash || live.has(it.id))) await hintTo(it, null);
    } catch (e) {
      rep.failed.push(`${it.id}: ${errorText(e)}`);
      if (row) await GcalEvent.updateOne({ _id: row._id }, { $set: { error: errorText(e) }, $inc: { tries: 1 } });
    }
  }
  return { cursor };
}

/** Writes the row for a document (moving a taken-over row to it). */
async function saveRow(userId: string, it: Item, calendar: string, eventId: string | null, hash: string | null, syncedAt: Date | null, error: string | null, row: any) {
  const fields = {
    kind: it.kind, calendar, eventId, hash, syncedAt, error,
    repeatId: it.kind === 'plan' ? it.doc?.plan?.repeatId ?? null : null,
    occurrence: it.kind === 'plan' ? it.doc?.plan?.occurrence ?? null : null,
  };
  const inc = error ? { $inc: { tries: 1 } } : {};
  const set = error ? fields : { ...fields, tries: 0 };
  if (row?._id && idOf(row.docId) !== it.id) {
    // Taken over: the old row becomes this document's (its own row, if any, goes first).
    await GcalEvent.deleteOne({ userId, docId: OID(it.id), _id: { $ne: row._id } });
    await GcalEvent.updateOne({ _id: row._id }, { $set: { ...set, docId: OID(it.id) }, ...inc });
  } else {
    await GcalEvent.updateOne({ userId, docId: OID(it.id) }, { $set: set, ...inc, $setOnInsert: { userId, docId: OID(it.id) } }, { upsert: true });
  }
}

// ── Starting a run ───────────────────────────────────────────────────────────

function start(job: () => Promise<unknown>) {
  const run = () => job().catch(e => console.error('[gcal] sync failed:', e?.message ?? e));
  try { after(run); } catch { void run(); }   // outside a request (a script): just start it
}

/** After a save: a run in the background once the answer has gone. `ids`: documents removed
 *  for good (a plan undone at once), which the run can't find by itself. */
export function syncAfter(userId: string, ids: string[] = []) {
  if (!syncConfigured()) return;
  start(() => syncCalendar(userId, { ids }));
}

const lastSoon = new Map<string, number>();
/** When Today or the Calendar loads: a catch-up run, at most every 2 minutes per server. */
export function syncSoon(userId: string) {
  if (!syncConfigured()) return;
  const t = lastSoon.get(userId) ?? 0;
  if (Date.now() - t < 120_000) return;   // 30 s until 26 Nov (Vercel CPU)
  lastSoon.set(userId, Date.now());
  start(() => syncCalendar(userId));
}
