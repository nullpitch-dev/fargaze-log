// Editing and deleting one record (#70, Design §15.6). Server only.
//
// Agreed with Hyoje on 26–27 Oct:
//   - the form edits the record's own shape (form.ts); the checks run on the record
//     itself: master lists, ingredients, the same record twice, the sheet's separators
//   - each save is ONE change-list entry (master_change, list 'records') with one line
//     per changed cell (sheetCells.ts) and one Mark repeated tick; while it is
//     unticked, the migrations stop, as they do for list changes
//   - a record whose start year moves to another tab: delete the row there, add it here
//   - a deleted record moves whole to log_trash; Undo puts it back
//   - test database first, then production (Design §15.2)
// Undo works until a migration rebuilds the record's year (its _id is then gone);
// after the tick, the undo is its own entry with the sheet steps to reverse it.

import mongoose from 'mongoose';
import Log from '../../models/Log';
import LogTrash from '../../models/LogTrash';
import MasterChange from '../../models/MasterChange';
import ActivityMaster from '../../models/ActivityMaster';
import TimezoneMaster from '../../models/TimezoneMaster';
import { loadMasterChecks, unknownValues } from '../migration/checkRecords';
import { recordKey, existingQuery, yearTabFor, KEY_FIELDS } from '../migration/staging';
import { missingIngredients, describeMissing } from './ingredients';
import { getArchiveUntil } from '../archiveYear';
import { buildRecord, fromRecord, type FormContext, type RecordForm } from './form';
import { sheetChange, deleteRowLines, addRowLines, findRowText, type ChangeLine } from './sheetCells';

export const RECORDS_LIST = 'records';

/** Until cutover (#74) the sheet is the truth: list values can't hold its separators. */
export const SHEET_IS_TRUTH = true;

type Fail = { ok: false; status: number; error: string; problems?: string[] };
const fail = (status: number, error: string, problems?: string[]): Fail => ({ ok: false, status, error, ...(problems ? { problems } : {}) });

export async function loadFormContext(userId: string): Promise<FormContext> {
  const [acts, zones] = await Promise.all([
    ActivityMaster.find({ userId }).select('name category').lean(),
    TimezoneMaster.find({ userId }).select('code offsetUTC').lean(),
  ]);
  return {
    activityCategory: new Map((acts as any[]).map(a => [a.name, a.category])),
    zones: new Map((zones as any[]).map(z => [z.code, { offset: z.offsetUTC }])),
    sheetIsTruth: SHEET_IS_TRUTH,
  };
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(d as any).toISOString() : '');
const toText = (tab: string, findRow: string, lines: ChangeLine[]) =>
  lines.map(l => `${tab} · ${findRow} · ${l.column}: ${l.what}${l.before || l.after ? ` (${l.before || '(empty)'} → ${l.after || '(empty)'})` : ''}`);

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getForEdit(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown record.');
  const doc = await Log.findOne({ _id: id, userId }).lean() as any;
  if (!doc) return fail(404, 'This record no longer exists (deleted, or rebuilt by a migration). Open it again from the Calendar or Search.');
  const archiveUntil = await getArchiveUntil(userId);
  return {
    ok: true as const,
    id: String(doc._id),
    form: fromRecord(doc),
    updatedAt: iso(doc.updatedAt),
    category: doc.activity?.category ?? null,
    tab: yearTabFor(doc, archiveUntil),
    findRow: findRowText(doc),
  };
}

// ── Check ────────────────────────────────────────────────────────────────────

interface Prepared {
  base: any;
  doc: any;
  problems: string[];
  warnings: string[];
  title: string;
  change: ReturnType<typeof sheetChange>;
}

async function prepare(userId: string, id: string, form: RecordForm): Promise<{ ok: true; p: Prepared } | Fail> {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown record.');
  if (!form || typeof form !== 'object') return fail(400, 'Send { form }.');
  const base = await Log.findOne({ _id: id, userId }).lean() as any;
  if (!base) return fail(404, 'This record no longer exists (deleted, or rebuilt by a migration).');

  const ctx = await loadFormContext(userId);
  const built = buildRecord(form, base, ctx);
  const doc = { ...built.doc, userId };
  const problems = [...built.problems];
  const warnings = [...built.warnings];

  // Master lists. An unknown activity is already reported, so its pair is not.
  const checks = (await loadMasterChecks(userId)).filter(c => doc.activity.category || c.def.slug !== 'activity');
  problems.push(...unknownValues(doc, checks));

  // Ingredients: a food or drink the edit adds or changes must name them; one left
  // as it was may stay (older records were filled by scripts, a few still say Not Defined).
  const untouched = (kind: string, item: string) => {
    const list = kind === 'food' ? base?.food?.foods : base?.food?.drinks;
    return (Array.isArray(list) ? list : []).some((x: any) => x?.item === item && missingIngredients({ food: { [kind === 'food' ? 'foods' : 'drinks']: [x] } }).length);
  };
  for (const m of missingIngredients(doc)) {
    if (untouched(m.kind, m.item)) warnings.push(`${describeMissing(m)} still has no ingredients (as before)`);
    else problems.push(`${describeMissing(m)} has no ingredients — choose at least one`);
  }

  // The same record twice: activity + title + start + end (the Staging rule).
  const others = await Log.find({ ...existingQuery(userId, [doc]), _id: { $ne: base._id } }).select(KEY_FIELDS).lean();
  if ((others as any[]).some(o => recordKey(o) === recordKey(doc))) {
    problems.push('Another record has the same activity, title, start and end');
  }

  const archiveUntil = await getArchiveUntil(userId);
  const change = sheetChange(base, doc, yearTabFor(base, archiveUntil), yearTabFor(doc, archiveUntil));
  if (!change.lines.length) problems.push('Nothing changed');
  return { ok: true, p: { base, doc, problems: [...new Set(problems)], warnings, title: `Edit: ${findRowText(base)}`, change } };
}

export async function previewEdit(userId: string, id: string, form: RecordForm) {
  const r = await prepare(userId, id, form);
  if (!r.ok) return r;
  const { problems, warnings, title, change } = r.p;
  return { ok: true as const, problems, warnings, title, ...change };
}

// ── Save ─────────────────────────────────────────────────────────────────────

export async function saveEdit(userId: string, id: string, form: RecordForm, updatedAt: string) {
  const r = await prepare(userId, id, form);
  if (!r.ok) return r;
  const { base, doc, problems, title, change } = r.p;
  if (!updatedAt || iso(base.updatedAt) !== updatedAt) {
    return fail(409, 'This record was changed since you opened it. Reload it and make the change again.');
  }
  if (problems.length) return fail(422, 'The record was not saved.', problems);

  const now = new Date();
  const saved = { ...doc, _id: base._id, createdAt: base.createdAt, updatedAt: now };
  const session = await mongoose.startSession();
  let changeId = '';
  try {
    await session.withTransaction(async () => {
      const res = await Log.replaceOne({ _id: base._id, userId, updatedAt: base.updatedAt }, saved, { session, timestamps: false } as any);
      if (!res.matchedCount) throw Object.assign(new Error('changed'), { conflict: true });
      const [ch] = await MasterChange.create([{
        userId, list: RECORDS_LIST, kind: 'edit', rowId: String(base._id),
        before: base, after: saved, recordsChanged: 1, recordIds: [base._id],
        sheetSteps: toText(change.tab, change.findRow, change.lines),
        extra: { title, ...change, afterUpdatedAt: now },
      }], { session });
      changeId = String(ch._id);
    });
  } catch (e: any) {
    if (e?.conflict) return fail(409, 'This record was changed since you opened it. Reload it and make the change again.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true as const, changeId, updatedAt: now.toISOString(), ...change };
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRecord(userId: string, id: string, updatedAt: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown record.');
  const base = await Log.findOne({ _id: id, userId }).lean() as any;
  if (!base) return fail(404, 'This record no longer exists.');
  if (!updatedAt || iso(base.updatedAt) !== updatedAt) {
    return fail(409, 'This record was changed since you opened it. Reload it first.');
  }
  const archiveUntil = await getArchiveUntil(userId);
  const tab = yearTabFor(base, archiveUntil) ?? '(no tab)';
  const lines = deleteRowLines(base, tab);
  const findRow = findRowText(base);
  const now = new Date();

  const session = await mongoose.startSession();
  let changeId = '';
  try {
    await session.withTransaction(async () => {
      const res = await Log.deleteOne({ _id: base._id, userId, updatedAt: base.updatedAt }, { session });
      if (!res.deletedCount) throw Object.assign(new Error('changed'), { conflict: true });
      const [ch] = await MasterChange.create([{
        userId, list: RECORDS_LIST, kind: 'delete', rowId: String(base._id),
        before: base, after: null, recordsChanged: 1, recordIds: [base._id],
        sheetSteps: toText(tab, findRow, lines),
        extra: { title: `Delete: ${findRow}`, tab, findRow, moveTo: null, lines },
      }], { session });
      changeId = String(ch._id);
      await LogTrash.create([{ userId, record: base, deletedAt: now, changeId: ch._id }], { session });
    });
  } catch (e: any) {
    if (e?.conflict) return fail(409, 'This record was changed since you opened it. Reload it first.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true as const, changeId, tab, findRow, lines };
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/** Why a record change can't be undone, judged from the entry alone; null if it may be. */
export function recordUndoBlocked(ch: any): string | null {
  if (ch.undoneAt) return 'Already undone.';
  if (ch.undoOf) return 'This is an undo; make the change again instead.';
  if (ch.kind !== 'edit' && ch.kind !== 'delete') return 'This change can’t be undone.';
  return null;
}

export async function undoRecordChange(userId: string, ch: any) {
  const blocked = recordUndoBlocked(ch);
  if (blocked) return fail(409, blocked);
  const archiveUntil = await getArchiveUntil(userId);
  const sheetNeeded = !!ch.sheetDone;
  const now = new Date();
  const nothing = ['Nothing to do in the sheet: this was undone before it was repeated there.'];

  let restore: any;
  let lines: ChangeLine[] = [];
  let tab = '', findRow = '', moveTo: string | null = null;
  let kind: 'edit' | 'add';
  let current: any = null;

  if (ch.kind === 'edit') {
    current = await Log.findOne({ _id: ch.rowId, userId }).lean() as any;
    if (!current) return fail(409, 'Undo is no longer possible: the record was deleted or rebuilt by a migration since. Edit it again instead.');
    if (iso(current.updatedAt) !== iso(ch.extra?.afterUpdatedAt)) return fail(409, 'Undo is no longer possible: the record was changed again since. Edit it again instead.');
    restore = { ...ch.before, updatedAt: now };
    const c = sheetChange(current, ch.before, yearTabFor(current, archiveUntil), yearTabFor(ch.before, archiveUntil));
    ({ tab, findRow, moveTo, lines } = c);
    kind = 'edit';
  } else {
    const trash = await LogTrash.findOne({ userId, 'record._id': ch.recordIds?.[0] ?? ch.rowId }).lean() as any;
    if (!trash) return fail(409, 'Undo is no longer possible: the deleted record is no longer in the trash.');
    restore = trash.record;
    if (await Log.exists({ _id: restore._id })) return fail(409, 'Undo is no longer possible: the record is back already.');
    // A migration that rebuilt the record's year since the delete has re-created every
    // record of that year; putting this one back could then double it.
    const oldest = await Log.findOne({ userId, 'start.year': restore?.start?.year }).sort({ createdAt: 1 }).select('createdAt').lean() as any;
    if (oldest && new Date(oldest.createdAt) > new Date(ch.createdAt)) {
      return fail(409, `Undo is no longer possible: a migration has rebuilt ${restore?.start?.year} since the delete. If the row is still in the sheet, the record is back already.`);
    }
    const twins = await Log.find(existingQuery(userId, [restore])).select(KEY_FIELDS).lean();
    if ((twins as any[]).some(o => recordKey(o) === recordKey(restore))) return fail(409, 'Undo is no longer possible: another record has the same activity, title, start and end.');
    tab = yearTabFor(restore, archiveUntil) ?? '(no tab)';
    findRow = findRowText(restore);
    lines = addRowLines(restore, tab);
    kind = 'add';
  }

  const steps = sheetNeeded ? toText(tab, findRow, lines) : nothing;
  const session = await mongoose.startSession();
  let newId = '';
  try {
    await session.withTransaction(async () => {
      if (kind === 'edit') {
        const res = await Log.replaceOne({ _id: current._id, userId, updatedAt: current.updatedAt }, restore, { session, timestamps: false } as any);
        if (!res.matchedCount) throw Object.assign(new Error('changed'), { conflict: true });
      } else {
        await Log.create([restore], { session, timestamps: false } as any);
        await LogTrash.deleteOne({ userId, 'record._id': restore._id }, { session });
      }
      await MasterChange.updateOne({ _id: ch._id }, {
        $set: { undoneAt: now, ...(sheetNeeded ? {} : { sheetDone: true, sheetDoneAt: now }) },
      }, { session });
      const [u] = await MasterChange.create([{
        userId, list: RECORDS_LIST, kind, rowId: ch.rowId,
        before: kind === 'edit' ? current : null, after: restore,
        recordsChanged: 1, recordIds: ch.recordIds,
        sheetSteps: steps, sheetDone: !sheetNeeded, sheetDoneAt: sheetNeeded ? null : now,
        undoOf: ch._id,
        extra: { title: `Undo: ${ch.extra?.title ?? ''}`, tab, findRow, moveTo, lines: sheetNeeded ? lines : [], afterUpdatedAt: kind === 'edit' ? now : null },
      }], { session });
      newId = String(u._id);
    });
  } catch (e: any) {
    if (e?.conflict) return fail(409, 'Undo is no longer possible: the record was changed again since.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true as const, changeId: newId, recordsChanged: 1, sheetNeeded };
}

// ── The Record changes page ──────────────────────────────────────────────────

export async function listRecordChanges(userId: string, opts: { since?: Date | null; limit?: number }) {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  // Every unticked change, however old, plus the ticked ones since the date asked.
  const or: any[] = [{ sheetDone: false }];
  if (opts.since) or.push({ createdAt: { $gte: opts.since } });
  const rows = await MasterChange.find({ userId, list: RECORDS_LIST, $or: or })
    .sort({ createdAt: -1 }).limit(limit)
    .select('kind rowId sheetDone sheetDoneAt undoneAt undoOf createdAt extra').lean() as any[];
  return rows.map(r => ({
    id: String(r._id),
    kind: r.kind,
    recordId: r.rowId,
    title: r.extra?.title ?? '',
    tab: r.extra?.tab ?? '',
    findRow: r.extra?.findRow ?? '',
    moveTo: r.extra?.moveTo ?? null,
    lines: (r.extra?.lines ?? []) as ChangeLine[],
    createdAt: r.createdAt,
    sheetDone: !!r.sheetDone,
    sheetDoneAt: r.sheetDoneAt ?? null,
    undoneAt: r.undoneAt ?? null,
    undoOf: r.undoOf ? String(r.undoOf) : null,
    undoBlocked: recordUndoBlocked(r),
  }));
}
