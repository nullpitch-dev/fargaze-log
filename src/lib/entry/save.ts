// New records and plans from the entry app (#71, Design §15.7). Server only.
//
// Agreed with Hyoje on 8 Nov 2026:
//   - one form for everything (the #70 form, form.ts); a start still to come makes a
//     PLAN (log_plan), anything else a RECORD (log). Insights only ever read records.
//   - a plan whose start has passed waits in To confirm until Hyoje acts:
//       Started / Done as planned → a record with the plan's times (a plan still under way
//                                    keeps its planned end; a meeting that runs over is edited)
//       Adjust → the form; a start still to come keeps it a plan, else it becomes a record
//       Delete → gone from every list, with Undo
//   - the phone makes each new record's ID, so an upload that is retried never makes a
//     record twice (the offline queue, step 3)
//   - new records make no change-list entry: until cutover the app writes only to the
//     test database (the trial run), and after cutover the sheet follows by the nightly
//     export (#72)
// The checks are the edit feature's: master lists, ingredients, the same record twice;
// plus the activity's required field groups (groups.ts).

import mongoose from 'mongoose';
import Log from '../../models/Log';
import LogTrash from '../../models/LogTrash';
import LogPlan from '../../models/LogPlan';
import ActivityMaster from '../../models/ActivityMaster';
import { loadMasterChecks, unknownValues } from '../migration/checkRecords';
import { recordKey, existingQuery, KEY_FIELDS } from '../migration/staging';
import { missingIngredients, describeMissing } from '../records/ingredients';
import { loadFormContext } from '../records/edit';
import { buildRecord, fromRecord, type RecordForm } from '../records/form';
import { isOpen, missingRequired } from './groups';
import { endAheadToPlanned, relaxOpen, tightenOnEnd } from './drafts';
import { instantOf } from './time';

type Fail = { ok: false; status: number; error: string; problems?: string[] };
const fail = (status: number, error: string, problems?: string[]): Fail => ({ ok: false, status, error, ...(problems ? { problems } : {}) });
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(d as any).toISOString() : '');

export type EntryKind = 'record' | 'plan';

/** A record still to come is a plan. A point without a time counts from the start of its day. */
export function kindOf(doc: any, now = Date.now()): EntryKind {
  const t = instantOf(doc?.start);
  return t != null && t > now ? 'plan' : 'record';
}

export { blankForm, mergeForm } from './forms';
import { mergeForm } from './forms';

// ── Check ────────────────────────────────────────────────────────────────────

export interface Checked { doc: any; kind: EntryKind; problems: string[]; warnings: string[] }

/**
 * Builds and checks a new entry. `base` is a plan being turned into a record or
 * adjusted (its unchanged times are kept exactly); `selfId` is left out of the
 * same-record check.
 */
export async function checkEntry(userId: string, form: RecordForm, opts: { base?: any; selfId?: string; now?: number } = {}): Promise<Checked> {
  const ctx = await loadFormContext(userId);
  const built = buildRecord(form, opts.base ?? null, ctx);
  const doc = { ...built.doc, userId };
  const problems = [...built.problems];
  const warnings = [...built.warnings];
  // An End still to come is the planned end (Hyoje, 10 Nov; drafts.ts).
  endAheadToPlanned(doc, warnings, opts.now);

  const checks = (await loadMasterChecks(userId)).filter(c => doc.activity?.category || c.def.slug !== 'activity');
  problems.push(...unknownValues(doc, checks));
  for (const m of missingIngredients(doc)) problems.push(`${describeMissing(m)} has no ingredients — choose at least one`);

  // The activity's required groups (대변 → Bowel): needed once the record has an end; an
  // open record may wait for them (Hyoje, 8 Nov), and End now refuses until they are there.
  if (doc.activity?.name) {
    const acts = await ActivityMaster.find({ userId }).select('name category groups').lean() as any[];
    for (const label of missingRequired(doc, acts)) problems.push(`${label} is required for ${doc.activity.name}`);
  }

  const kind = kindOf(doc, opts.now);
  // The same record twice (activity + title + start + end): among records, and among open plans.
  const model: any = kind === 'plan' ? LogPlan : Log;
  const q: any = { ...existingQuery(userId, [doc]) };
  if (kind === 'plan') q['plan.state'] = 'open';
  if (opts.selfId && mongoose.isValidObjectId(opts.selfId)) q._id = { $ne: new mongoose.Types.ObjectId(opts.selfId) };
  const others = await model.find(q).select(KEY_FIELDS).lean() as any[];
  if (others.some(o => recordKey(o) === recordKey(doc))) {
    problems.push(kind === 'plan' ? 'Another plan has the same activity, title, start and end' : 'Another record has the same activity, title, start and end');
  }
  // An open record may wait for what it lacks (drafts.ts); ending it needs everything.
  const tight = tightenOnEnd(opts.base, doc, [...new Set(problems)], warnings);
  const relaxed = relaxOpen(doc, tight.problems, tight.warnings);
  return { doc, kind, problems: relaxed.problems, warnings: relaxed.warnings };
}

// ── New ──────────────────────────────────────────────────────────────────────

export async function previewNew(userId: string, form: RecordForm) {
  if (!form || typeof form !== 'object') return fail(400, 'Send { form }.');
  const c = await checkEntry(userId, form);
  return { ok: true as const, kind: c.kind, problems: c.problems, warnings: c.warnings };
}

/** Saves a new record or plan under the phone's ID; the same ID again returns what is there. */
export async function createEntry(userId: string, id: string | null | undefined, form: RecordForm) {
  if (!form || typeof form !== 'object') return fail(400, 'Send { id, form }.');
  if (id != null && !mongoose.isValidObjectId(id)) return fail(400, 'id must be a 24-character hex ID.');
  const _id = id ? new mongoose.Types.ObjectId(id) : new mongoose.Types.ObjectId();

  const there = async () => {
    const r = await Log.findOne({ _id, userId }).select('_id').lean();
    if (r) return 'record' as const;
    const p = await LogPlan.findOne({ _id, userId }).select('_id').lean();
    return p ? ('plan' as const) : null;
  };
  const known = await there();
  if (known) return { ok: true as const, id: String(_id), kind: known, already: true };

  const c = await checkEntry(userId, form);
  if (c.problems.length) return fail(422, 'Not saved.', c.problems);
  const now = new Date();
  const doc = { ...c.doc, _id, origin: 'app', createdAt: now, updatedAt: now };
  try {
    if (c.kind === 'plan') await LogPlan.create([{ ...doc, plan: { state: 'open' } }]);
    else await Log.create([doc]);
  } catch (e: any) {
    if (e?.code === 11000) return { ok: true as const, id: String(_id), kind: (await there()) ?? c.kind, already: true };
    throw e;
  }
  return { ok: true as const, id: String(_id), kind: c.kind, already: false, warnings: c.warnings };
}

// ── Plans ────────────────────────────────────────────────────────────────────

async function loadPlan(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return null;
  return await LogPlan.findOne({ _id: id, userId }).lean() as any;
}

export async function getPlan(userId: string, id: string) {
  const p = await loadPlan(userId, id);
  if (!p) return fail(404, 'This plan no longer exists.');
  return {
    ok: true as const, id: String(p._id), form: fromRecord(p), updatedAt: iso(p.updatedAt),
    state: p.plan?.state ?? 'open', repeatId: p.plan?.repeatId ? String(p.plan.repeatId) : null,
    recordId: p.plan?.recordId ? String(p.plan.recordId) : null,
  };
}

/** A plan's record fields, ready for `log`. */
function asRecord(doc: any, recordId: mongoose.Types.ObjectId, now: Date) {
  const { plan: _p, _id: _i, __v: _v, ...rest } = doc;
  return { ...rest, _id: recordId, origin: 'app', createdAt: now, updatedAt: now };
}

/** Writes the record and marks the plan done, in one transaction. */
async function happen(userId: string, plan: any, doc: any, doneBy: 'confirmed' | 'auto', session?: mongoose.ClientSession) {
  const now = new Date();
  const recordId = new mongoose.Types.ObjectId();
  const run = async (s: mongoose.ClientSession) => {
    const res = await LogPlan.updateOne(
      { _id: plan._id, userId, 'plan.state': 'open', updatedAt: plan.updatedAt },
      { $set: { 'plan.state': 'done', 'plan.recordId': recordId, 'plan.doneBy': doneBy, 'plan.doneAt': now } },
      { session: s },
    );
    if (!res.matchedCount) throw Object.assign(new Error('changed'), { conflict: true });
    await Log.create([asRecord(doc, recordId, now)], { session: s });
  };
  if (session) await run(session);
  else {
    const s = await mongoose.startSession();
    try { await s.withTransaction(() => run(s)); } finally { await s.endSession(); }
  }
  return recordId;
}

const CHANGED = 'This plan was changed since you opened it. Reload and try again.';

/**
 * A plan happens (Hyoje, 9 Nov):
 *   'now'    Start now — a record starting now, open (End now later); its planned end is
 *            kept on the plan, so In progress can show "planned until …"
 *   'onTime' Started on time — the same, starting at the planned start
 *   'done'   Done as planned — a record with the plan's own times
 *   'nowDone' Done now — starts and ends now, for things with no length (paying a bill;
 *            Hyoje, 10 Nov: a long press on Start now)
 */
export async function confirmPlan(userId: string, id: string, updatedAt: string, how: 'now' | 'onTime' | 'done' | 'nowDone' = 'done', now?: { date: string; hour: string; timezone: string }) {
  const p = await loadPlan(userId, id);
  if (!p) return fail(404, 'This plan no longer exists.');
  if (p.plan?.state !== 'open') return fail(409, p.plan?.state === 'done' ? 'This plan is already a record.' : 'This plan was deleted.');
  if (iso(p.updatedAt) !== updatedAt) return fail(409, CHANGED);
  const form = fromRecord(p);
  // A plan saved before planned ends existed (10 Nov) has its plan in End.
  if (!form.plannedEnd.date && !form.plannedEnd.hour && (form.end.date || form.end.hour)) form.plannedEnd = { ...form.end };
  const atNow = how === 'now' || how === 'nowDone';
  if (atNow) {
    if (!now?.date || !now?.hour) return fail(400, 'Send now: { date, hour, timezone }.');
    form.start = { date: now.date, hour: now.hour, timezone: now.timezone || form.start.timezone };
  }
  if (how === 'nowDone') form.end = { ...form.start };
  else if (how === 'done') form.end = { ...form.plannedEnd };   // Done as planned: it ended when planned
  else form.end = { date: '', hour: '', timezone: '' };            // started: the planned end stays on the record
  if (!atNow && kindOf(p) === 'plan') return fail(409, 'This plan has not started yet: use Start now.');
  // The lists may have changed since it was planned (a rename, a merge): check again.
  const c = await checkEntry(userId, form, { base: p, selfId: String(p._id), now: atNow ? Number.MAX_SAFE_INTEGER : undefined });
  if (c.problems.length) return fail(422, 'Not saved: adjust it first.', c.problems);
  try {
    const recordId = await happen(userId, p, c.doc, 'confirmed');
    return { ok: true as const, recordId: String(recordId) };
  } catch (e: any) {
    if (e?.conflict) return fail(409, CHANGED);
    throw e;
  }
}

/** Adjust: a start still to come keeps it a plan; otherwise it becomes a record. */
export async function adjustPlan(userId: string, id: string, form: RecordForm, updatedAt: string) {
  const p = await loadPlan(userId, id);
  if (!p) return fail(404, 'This plan no longer exists.');
  if (p.plan?.state !== 'open') return fail(409, p.plan?.state === 'done' ? 'This plan is already a record: edit the record instead.' : 'This plan was deleted.');
  if (iso(p.updatedAt) !== updatedAt) return fail(409, CHANGED);
  const c = await checkEntry(userId, form, { base: p, selfId: String(p._id) });
  if (c.problems.length) return fail(422, 'Not saved.', c.problems);
  if (c.kind === 'plan') {
    const now = new Date();
    const { _id: _i, createdAt: _c, ...fields } = c.doc;
    const res = await LogPlan.replaceOne(
      { _id: p._id, userId, updatedAt: p.updatedAt },
      { ...fields, _id: p._id, createdAt: p.createdAt, updatedAt: now, plan: { ...p.plan, edited: true } },
      { timestamps: false } as any,
    );
    if (!res.matchedCount) return fail(409, CHANGED);
    return { ok: true as const, kind: 'plan' as const, id: String(p._id), updatedAt: now.toISOString() };
  }
  try {
    const recordId = await happen(userId, p, c.doc, 'confirmed');
    return { ok: true as const, kind: 'record' as const, id: String(recordId) };
  } catch (e: any) {
    if (e?.conflict) return fail(409, CHANGED);
    throw e;
  }
}

export async function deletePlan(userId: string, id: string, updatedAt: string) {
  const p = await loadPlan(userId, id);
  if (!p) return fail(404, 'This plan no longer exists.');
  if (p.plan?.state !== 'open') return fail(409, p.plan?.state === 'done' ? 'This plan is already a record: delete the record instead.' : 'This plan was deleted already.');
  if (iso(p.updatedAt) !== updatedAt) return fail(409, CHANGED);
  const now = new Date();
  const res = await LogPlan.updateOne({ _id: p._id, userId, updatedAt: p.updatedAt }, { $set: { 'plan.state': 'deleted', 'plan.deletedAt': now, updatedAt: now } }, { timestamps: false } as any);
  if (!res.matchedCount) return fail(409, CHANGED);
  return { ok: true as const, updatedAt: now.toISOString() };
}

/** Undo of Delete. */
export async function restorePlan(userId: string, id: string) {
  const p = await loadPlan(userId, id);
  if (!p) return fail(404, 'This plan no longer exists.');
  if (p.plan?.state !== 'deleted') return fail(409, 'This plan is not deleted.');
  const now = new Date();
  await LogPlan.updateOne({ _id: p._id, userId }, { $set: { 'plan.state': 'open', 'plan.deletedAt': null, updatedAt: now } }, { timestamps: false } as any);
  return { ok: true as const, updatedAt: now.toISOString() };
}

/** For repeats.ts: a "count as done" occurrence whose end has passed. */
export async function settleOne(userId: string, plan: any, now = Date.now()): Promise<boolean> {
  const form = fromRecord(plan);
  if (form.plannedEnd.date || form.plannedEnd.hour) form.end = { ...form.plannedEnd };   // it ended as planned
  const c = await checkEntry(userId, form, { base: plan, selfId: String(plan._id), now });
  if (c.problems.length) return false;         // left in To confirm, where Hyoje sees why
  try { await happen(userId, plan, c.doc, 'auto'); return true; } catch (e: any) { if (e?.conflict) return false; throw e; }
}

// ── Records made here ────────────────────────────────────────────────────────

/** End now (Open on the home screen): sets the end of a record with none. */
export async function endRecord(userId: string, id: string, end: { date: string; hour: string; timezone: string }, updatedAt: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown record.');
  const base = await Log.findOne({ _id: id, userId }).lean() as any;
  if (!base) return fail(404, 'This record no longer exists.');
  if (iso(base.updatedAt) !== updatedAt) return fail(409, 'This record was changed since. Reload and try again.');
  if (!isOpen(base) && base.end?.year) return fail(409, 'This record has an end already.');
  const form = fromRecord(base);
  form.end = { date: end?.date ?? '', hour: end?.hour ?? '', timezone: end?.timezone ?? '' };
  const c = await checkEntry(userId, form, { base, selfId: String(base._id), now: Number.MAX_SAFE_INTEGER });
  if (c.problems.length) return fail(422, 'Can’t end it yet: open the record and fill this in.', c.problems);
  const now = new Date();
  // Keep origin (Hyoje, 10 Nov: an ended app record asked for sheet steps on its next edit).
  const { _id: _i, createdAt: _c, ...fields } = c.doc;
  const res = await Log.replaceOne({ _id: base._id, userId, updatedAt: base.updatedAt }, { ...fields, _id: base._id, ...(base.origin ? { origin: base.origin } : {}), createdAt: base.createdAt, updatedAt: now }, { timestamps: false } as any);
  if (!res.matchedCount) return fail(409, 'This record was changed since. Reload and try again.');
  return { ok: true as const, updatedAt: now.toISOString() };
}

const UNDO_MINUTES = 15;

/** Undo on the toast after saving: a record or plan made here in the last few minutes. */
export async function discardNew(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown entry.');
  const since = new Date(Date.now() - UNDO_MINUTES * 60_000);
  const plan = await LogPlan.findOne({ _id: id, userId }).lean() as any;
  if (plan) {
    if (plan.plan?.state !== 'open' || plan.plan?.repeatId || new Date(plan.createdAt) < since) return fail(409, 'Too late to undo here: delete the plan instead.');
    await LogPlan.deleteOne({ _id: plan._id, userId });
    return { ok: true as const, kind: 'plan' as const };
  }
  const rec = await Log.findOne({ _id: id, userId }).lean() as any;
  if (!rec) return fail(404, 'Already gone.');
  if (new Date(rec.createdAt) < since || iso(rec.updatedAt) !== iso(rec.createdAt)) return fail(409, 'Too late to undo here: open the record and delete it.');
  await LogTrash.create([{ userId, record: rec, deletedAt: new Date(), changeId: null }]);
  await Log.deleteOne({ _id: rec._id, userId });
  return { ok: true as const, kind: 'record' as const };
}
