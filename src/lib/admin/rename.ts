// Rename, move and merge for the lists whose records follow (#67 step 3):
// activities and cost categories. Place points (26 Oct) have their own rules in
// renamePlace.ts; the three entry points below hand them over.
//
// Agreed with Hyoje (23–24 Oct 2026):
//   - A row's name or category is changed here, never by adding a row and deleting
//     the old one. Changing the name renames; changing the category moves; a name
//     that another row already has merges into that row (its values win, then the
//     old row is deleted). A whole category can be renamed, or merged into another.
//   - Every change is previewed first: how many records, which years, and the exact
//     steps to repeat in the sheet. Confirming changes the list and the records in
//     one operation (a transaction).
//   - Records follow by the row's unique column (activity name, cost detail), as a
//     whole-cell Find & Replace does in the sheet, so the two stay the same.
//   - The record IDs are kept in master_change for Undo. A migration makes new IDs
//     for 2026, so Undo works only until then. A merge can be undone only before it
//     is repeated in the sheet (afterwards the sheet can't tell the rows apart).
//   - Names the site's code looks for are refused (renaming them would quietly
//     empty Sleep, Bowel, Exercise …); the code changes first.
//   - The Calendar's settings (colours, hidden categories and names) follow too.

import mongoose from 'mongoose';
import Log from '@/models/Log';
import MasterChange from '@/models/MasterChange';
import CalendarSettings from '@/models/CalendarSettings';
import { colorKeyFor } from '@/app/calendar/_lib/calendar-colors';
import { getArchiveUntil } from '@/lib/archiveYear';
import { countsByTab, savedByTab, type TabCount } from '@/lib/yearTabs';
import { type ListDef, toRow } from './lists';
import { PLACE_SLUG, previewPlaceRename, applyPlaceRename, undoPlaceChange, type PlacePreview } from './renamePlace';

// ── What follows, per list ───────────────────────────────────────────────────

interface Follow {
  keyCol: string;                 // the row's unique column
  noun: string;                   // what a row is called in messages
  rec: { key: string; cat: string };
  /** The master tab and the record columns in the sheet. Master tabs: name in A, category in B. */
  sheet: { tab: string; keyLetter: string; catLetter: string; catIsFormulaInEntry: boolean };
  /** Values the site's code looks for by name, with the pages that would break. */
  inCode: { key: Record<string, string>; cat: Record<string, string> };
  calendar: boolean;
}

const FOLLOW: Record<string, Follow> = {
  activity: {
    keyCol: 'name',
    noun: 'activity',
    rec: { key: 'activity.name', cat: 'activity.category' },
    sheet: { tab: 'Activity', keyLetter: 'B', catLetter: 'A', catIsFormulaInEntry: true },
    inCode: {
      // src/lib/insights/sleep.ts, bowel.ts, api/insights/stats, calendar/_lib/month-layout.ts
      key: { '수면': 'Sleep and Insights stats', '대변': 'Bowel', '독서(기간)': 'the Calendar’s reading row', '공부(기간)': 'the Calendar’s reading row' },
      // sleep.ts, bowel.ts, api/insights/correlate, transport*.ts, exercise*.ts
      cat: { '생리': 'Sleep, Bowel and Insights stats', '이동': 'Transport and Journeys', '운동': 'Exercise' },
    },
    calendar: true,
  },
  cost: {
    keyCol: 'categoryDetail',
    noun: 'detail',
    rec: { key: 'cost.categoryDetail', cat: 'cost.category' },
    sheet: { tab: 'Cost', keyLetter: 'AG', catLetter: 'AH', catIsFormulaInEntry: false },
    inCode: { key: {}, cat: {} },
    calendar: false,
  },
};

export const followFor = (def: ListDef): Follow | null => (def.recordsFollow ? FOLLOW[def.slug] ?? null : null);

/** Names and categories the page shows as locked, with the pages that need them. */
export function lockedNames(def: ListDef): { key: Record<string, string>; cat: Record<string, string> } {
  const f = followFor(def);
  return { key: f?.inCode.key ?? {}, cat: f?.inCode.cat ?? {} };
}

// Same starting list as src/app/api/calendar/settings/route.ts (used while the field is absent).
const DEFAULT_HIDDEN_NAMES = ['정식 운동', '약식 운동'];

// ── Plans ────────────────────────────────────────────────────────────────────

type RowAction = 'rename' | 'move' | 'rename-move' | 'merge';

export type Plan =
  | {
      mode: 'row'; action: RowAction; rowId: string; targetId: string | null;
      from: { key: string; cat: string }; to: { key: string; cat: string }; newCategory: boolean;
    }
  | { mode: 'category'; action: 'rename' | 'merge'; from: string; to: string; rowIds: string[] };

/** byTab: records per Archive-file tab, newest year tab first, the archive last (#73).
 *  Counts saved before #73 have y2026 / older instead (savedByTab reads both). */
export interface Counts { total: number; byTab: TabCount[]; first: number | null; last: number | null; otherCat: number }

export interface Preview {
  title: string;
  counts: Counts;
  rows: number;
  warnings: string[];
  sheetSteps: string[];
  plan: Plan;
}

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, one: string, many = one + 's') => `${n(x)} ${x === 1 ? one : many}`;

export type RenameRequest =
  | { mode: 'row'; id: string; values: Record<string, unknown> }
  | { mode: 'category'; from: string; to: string };

/** Works out what a change means (rename, move, merge …) and checks it. Reads only. */
async function makePlan(def: ListDef, f: Follow, userId: string, req: RenameRequest): Promise<Plan | Fail> {
  const model = def.model();
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  if (req.mode === 'category') {
    const from = str(req.from), to = str(req.to);
    if (!from || !to) return fail(400, 'Choose a category and type its new name.');
    if (from === to) return fail(400, 'Nothing changed.');
    if (f.inCode.cat[from]) return fail(409, `${from} can't be renamed here: the site's code looks for it by name (${f.inCode.cat[from]}). The code has to change first.`);
    const rows = await model.find({ userId, category: from }).select('_id').lean() as any[];
    if (!rows.length) return fail(404, `There is no category ${from}. Reload the page.`);
    const exists = await model.exists({ userId, category: to });
    return { mode: 'category', action: exists ? 'merge' : 'rename', from, to, rowIds: rows.map(r => String(r._id)) };
  }

  const row = await model.findOne({ _id: req.id, userId }).lean() as any;
  if (!row) return fail(404, 'This row no longer exists. Reload the page.');
  const fromKey = String(row[f.keyCol]), fromCat = String(row.category);
  let toKey = str(req.values[f.keyCol]), toCat = str(req.values.category);
  if (!toKey || !toCat) return fail(400, 'Both columns are required.');
  if (toKey === fromKey && toCat === fromCat) return fail(400, 'Nothing changed.');
  if (f.inCode.key[fromKey]) return fail(409, `${fromKey} can't be renamed or moved here: the site's code looks for it by name (${f.inCode.key[fromKey]}). The code has to change first.`);

  let action: RowAction;
  let targetId: string | null = null;
  if (toKey !== fromKey) {
    const target = await model.findOne({ userId, [f.keyCol]: toKey, _id: { $ne: row._id } }).lean() as any;
    if (target) {
      // A merge takes the other row's values, whatever category was typed.
      action = 'merge';
      targetId = String(target._id);
      toCat = String(target.category);
    } else {
      action = toCat === fromCat ? 'rename' : 'rename-move';
    }
  } else {
    action = 'move';
  }
  const newCategory = action !== 'merge' && toCat !== fromCat && !(await model.exists({ userId, category: toCat }));
  return { mode: 'row', action, rowId: String(row._id), targetId, from: { key: fromKey, cat: fromCat }, to: { key: toKey, cat: toCat }, newCategory };
}

/** What a row change writes into its records: only the fields that change, as in the
 *  sheet (a name's Find & Replace leaves column A alone; a move fills it). */
function recordSet(f: Follow, from: { key: string; cat: string }, to: { key: string; cat: string }) {
  const set: Record<string, string> = {};
  if (from.key !== to.key) set[f.rec.key] = to.key;
  if (from.cat !== to.cat) set[f.rec.cat] = to.cat;
  return set;
}

/** The records a plan changes. */
function recordFilter(f: Follow, userId: string, p: Plan): Record<string, unknown> {
  return p.mode === 'category' ? { userId, [f.rec.cat]: p.from } : { userId, [f.rec.key]: p.from.key };
}

async function countRecords(f: Follow, userId: string, p: Plan): Promise<Counts> {
  const byYear = await Log.aggregate([
    { $match: recordFilter(f, userId, p) },
    { $group: { _id: '$start.year', n: { $sum: 1 }, other: { $sum: p.mode === 'row' ? { $cond: [{ $ne: ['$' + f.rec.cat, p.from.cat] }, 1, 0] } : 0 } } },
  ]) as { _id: number | null; n: number; other: number }[];
  const years = byYear.map(y => y._id).filter((y): y is number => typeof y === 'number');
  const sum = (pred: (y: number | null) => boolean) => byYear.filter(y => pred(y._id)).reduce((a, y) => a + y.n, 0);
  const archiveUntil = await getArchiveUntil(userId);
  return {
    total: sum(() => true),
    byTab: countsByTab(byYear.map(y => ({ year: typeof y._id === 'number' ? y._id : null, n: y.n })), archiveUntil, new Date().getFullYear()),
    first: years.length ? Math.min(...years) : null,
    last: years.length ? Math.max(...years) : null,
    otherCat: byYear.reduce((a, y) => a + y.other, 0),
  };
}

// ── Words: title and sheet steps ─────────────────────────────────────────────

function titleOf(f: Follow, p: Plan): string {
  if (p.mode === 'category') {
    return p.action === 'rename' ? `Rename the category ${p.from} → ${p.to}` : `Merge the category ${p.from} into ${p.to}`;
  }
  switch (p.action) {
    case 'rename': return `Rename ${p.from.key} → ${p.to.key} (in ${p.from.cat})`;
    case 'move': return `Move ${p.from.key} from ${p.from.cat} to ${p.to.cat}`;
    case 'rename-move': return `Rename ${p.from.key} → ${p.to.key} and move it from ${p.from.cat} to ${p.to.cat}`;
    case 'merge': return `Merge ${p.from.key} (${p.from.cat}) into ${p.to.key} (${p.to.cat})`;
  }
}

const ENTRY_TABS = ['Active', 'History', 'Future'];   // records from row 3
const range = (tab: string, col: string, row: number) => `'${tab}'!${col}${row}:${col}`;
const expect = (x: number) => (x === 0 ? 'expect none' : `expect ${n(x)}`);
const rowsOf = (x: number) => (x === 0 ? 'expect none' : `expect ${plural(x, 'row')}`);

/** One Find & Replace over the record column in every tab that holds records. */
function replaceInRecords(col: string, from: string, to: string, c: Counts, entryTabs: boolean): string[] {
  const tabs = savedByTab(c);
  const out = [
    `Find and replace ${from} → ${to} in column ${col}. Tick “Match case” and “Match entire cell contents”, leave “Also search within formulas” off, choose “Specific range” and do each range in turn. Sheets says how many it replaced; the ${tabs[0].tab} tab can show more if rows were added since the last migration.`,
    `   Archive file: ${tabs.map(t => `${range(t.tab, col, 4)} (${expect(t.n)})`).join(', ')}.`,
  ];
  if (entryTabs) out.push(`   Active file: ${ENTRY_TABS.map(t => range(t, col, 3)).join(', ')} (any number, including none).`);
  return out;
}

/** Sets the category of one name's rows: Find & Replace can't, so a filter does it. */
function fillCategory(f: Follow, key: string, cat: string, c: Counts): string[] {
  const { keyLetter: k, catLetter: a } = f.sheet;
  const how = `filter column ${k} to ${key}, select column ${a} in the rows it shows, type ${cat} and press Ctrl+Enter, then remove the filter`;
  const [first, ...rest] = savedByTab(c);
  const out = [
    `Archive file, tab ${first.tab}: ${how} (${rowsOf(first.n)}).${rest.map(t => ` Tab ${t.tab}: the same (${rowsOf(t.n)}).`).join('')}`,
  ];
  out.push(f.sheet.catIsFormulaInEntry
    ? `Active, History and Future: nothing to do in column ${a} (a formula reads the ${f.sheet.tab} tab).`
    : `Active file, tabs Active, History and Future: the same in each (any number of rows, including none).`);
  out.push(`Check in each tab you filled: filter column ${a} to ${cat}; the filter list of column ${k} should show ${key} and ${cat}'s own ${f.noun === 'activity' ? 'activities' : 'details'} only. Anything else means hidden rows were filled too: undo in the sheet (Ctrl+Z) and ask Claude.`);
  return out;
}

export function stepsFor(f: Follow, p: Plan, c: Counts, masterRows: number): string[] {
  const t = f.sheet.tab;
  if (p.mode === 'category') {
    const steps = [`${t} tab: find and replace ${p.from} → ${p.to} in column B (range ${range(t, 'B', 2)}, “Match case” and “Match entire cell contents”; ${expect(masterRows)}).`];
    steps.push(...replaceInRecords(f.sheet.catLetter, p.from, p.to, c, !f.sheet.catIsFormulaInEntry));
    if (f.sheet.catIsFormulaInEntry) steps.push(`Active, History and Future: nothing to do in column ${f.sheet.catLetter} (a formula reads the ${t} tab). Check that a row there with one of these activities now shows ${p.to}.`);
    return steps;
  }
  const { from, to } = p;
  const steps: string[] = [];
  if (p.action === 'merge') steps.push(`${t} tab: delete the row ${from.key} | ${from.cat} (${to.key} | ${to.cat} stays).`);
  else steps.push(`${t} tab: change the row ${from.key} | ${from.cat} to ${to.key} | ${to.cat}.`);
  // Categories first, while the old name still tells the rows apart.
  if (from.cat !== to.cat) steps.push(...fillCategory(f, from.key, to.cat, c));
  if (from.key !== to.key) steps.push(...replaceInRecords(f.sheet.keyLetter, from.key, to.key, c, true));
  return steps;
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewRename(def: ListDef, userId: string, req: RenameRequest): Promise<{ ok: true; preview: Preview | PlacePreview } | Fail> {
  if (def.slug === PLACE_SLUG) {
    return req.mode === 'row' ? previewPlaceRename(def, userId, req.id, req.values) : fail(400, 'Place points have no categories.');
  }
  return previewListRename(def, userId, req);
}

async function previewListRename(def: ListDef, userId: string, req: RenameRequest): Promise<{ ok: true; preview: Preview } | Fail> {
  const f = followFor(def);
  if (!f) return fail(400, 'Renaming is not available for this list yet.');
  const p = await makePlan(def, f, userId, req);
  if ('ok' in p) return p;

  const counts = await countRecords(f, userId, p);
  const rows = p.mode === 'category' ? p.rowIds.length : 1;
  const warnings: string[] = [];
  if (p.mode === 'row') {
    if (p.newCategory) warnings.push(`${p.to.cat} is a new category.`);
    if (p.action === 'merge') warnings.push(`${p.from.key} is deleted from the list; its records take ${p.to.key} › ${p.to.cat}.`);
    if (counts.otherCat) {
      const one = counts.otherCat === 1;
      warnings.push(p.from.cat === p.to.cat
        ? `${plural(counts.otherCat, 'record')} with ${p.from.key} ${one ? 'is' : 'are'} under another category; ${one ? 'it keeps its' : 'they keep their'} category, as in the sheet.`
        : `${plural(counts.otherCat, 'record')} with ${p.from.key} ${one ? 'is' : 'are'} under another category; ${one ? 'it moves' : 'they move'} to ${p.to.cat} too, as in the sheet.`);
    }
  } else {
    if (p.action === 'merge') warnings.push(`${p.to} already exists: the ${plural(rows, f.noun, f.noun === 'activity' ? 'activities' : 'details')} of ${p.from} join it.`);
  }
  if (f.calendar) {
    const cal = await calendarChange(userId, p, false);
    if (cal) warnings.push(cal);
  }
  return { ok: true, preview: { title: titleOf(f, p), counts, rows, warnings, sheetSteps: stepsFor(f, p, counts, rows), plan: p } };
}

// ── Calendar settings ────────────────────────────────────────────────────────

type CalFields = { hiddenCategories?: string[]; colors?: Record<string, string>; hiddenNames?: string[] };

/** The Calendar settings a change carries over. Writes only when `write` is set (inside the transaction). */
async function calendarChange(userId: string, p: Plan, write: boolean, session?: mongoose.ClientSession): Promise<string | null> {
  const doc = await CalendarSettings.findOne({ userId }).session(session ?? null).lean() as any;
  const set: CalFields = {};
  const said: string[] = [];

  if (p.mode === 'category') {
    const colors = { ...(doc?.colors ?? {}) } as Record<string, string>;
    const hidden = [...(doc?.hiddenCategories ?? [])] as string[];
    const keyFrom = colorKeyFor(p.from, colors);
    if (p.action === 'rename' && keyFrom !== colorKeyFor(p.to, {})) { colors[p.to] = keyFrom; said.push('colour'); }
    if (p.from in colors) { delete colors[p.from]; if (!said.length) said.push('colour'); }
    if (JSON.stringify(colors) !== JSON.stringify(doc?.colors ?? {})) set.colors = colors;
    if (hidden.includes(p.from)) {
      set.hiddenCategories = hidden.filter(c => c !== p.from);
      if (p.action === 'rename' && !set.hiddenCategories.includes(p.to)) set.hiddenCategories.push(p.to);
      said.push('hidden tick');
    }
    if (!said.length) return null;
    if (write) await CalendarSettings.updateOne({ userId }, { $set: set }, { upsert: true, session });
    return `The Calendar's ${said.join(' and ')} for ${p.from} ${p.action === 'rename' ? `moves to ${p.to}` : `is dropped (${p.to} keeps its own)`}.`;
  }

  if (p.from.key === p.to.key) return null;
  const names = [...(doc?.hiddenNames ?? DEFAULT_HIDDEN_NAMES)] as string[];
  if (!names.includes(p.from.key)) return null;
  set.hiddenNames = names.filter(x => x !== p.from.key);
  if (p.action !== 'merge' && !set.hiddenNames.includes(p.to.key)) set.hiddenNames.push(p.to.key);
  if (write) await CalendarSettings.updateOne({ userId }, { $set: set }, { upsert: true, session });
  return p.action === 'merge'
    ? `${p.from.key} was hidden in the Calendar; ${p.to.key} keeps its own setting.`
    : `${p.from.key} is hidden in the Calendar; ${p.to.key} will be hidden instead.`;
}

// ── Apply ────────────────────────────────────────────────────────────────────

export async function applyRename(def: ListDef, userId: string, req: RenameRequest, expectRecords: number):
  Promise<{ ok: true; changeId: string; recordsChanged: number } | Fail> {
  if (def.slug === PLACE_SLUG) {
    return req.mode === 'row' ? applyPlaceRename(def, userId, req.id, req.values, expectRecords) : fail(400, 'Place points have no categories.');
  }
  const pv = await previewListRename(def, userId, req);
  if (!pv.ok) return pv;
  const { plan: p, counts } = pv.preview;
  if (counts.total !== expectRecords) {
    return fail(409, `The records changed since the preview (${n(expectRecords)} then, ${n(counts.total)} now). Preview again.`);
  }
  const f = followFor(def)!;
  const model = def.model();
  const kind = p.mode === 'row' && p.action === 'merge' || p.mode === 'category' && p.action === 'merge' ? 'merge' : 'rename';

  const session = await mongoose.startSession();
  let changeId = '';
  let changed = 0;
  try {
    await session.withTransaction(async () => {
      const filter = recordFilter(f, userId, p);
      const ids = (await Log.find(filter).select('_id').session(session).lean() as any[]).map(d => d._id);
      if (ids.length !== expectRecords) throw new Error(`STALE:${ids.length}`);

      let before: Record<string, unknown>, after: Record<string, unknown>;
      let rowId: string | null = null;
      if (p.mode === 'category') {
        await model.updateMany({ userId, category: p.from }, { $set: { category: p.to } }, { session });
        await Log.updateMany({ _id: { $in: ids } }, { $set: { [f.rec.cat]: p.to } }, { session });
        before = { category: p.from };
        after = { category: p.to };
      } else {
        const self = await model.findOne({ _id: p.rowId, userId }).session(session).lean() as any;
        if (!self) throw new Error('GONE');
        before = toRow(def, self).values;
        rowId = p.rowId;
        if (p.action === 'merge') {
          await model.deleteOne({ _id: self._id }, { session });
        } else {
          await model.updateOne({ _id: self._id }, { $set: { [f.keyCol]: p.to.key, category: p.to.cat } }, { session });
        }
        await Log.updateMany({ _id: { $in: ids } }, { $set: recordSet(f, p.from, p.to) }, { session });
        after = { [f.keyCol]: p.to.key, category: p.to.cat };
      }
      if (f.calendar) await calendarChange(userId, p, true, session);

      const [ch] = await MasterChange.create([{
        userId, list: def.slug, kind, rowId, before, after,
        recordsChanged: ids.length, recordIds: ids,
        sheetSteps: pv.preview.sheetSteps,
        extra: { title: pv.preview.title, plan: p, counts },
      }], { session });
      changeId = String(ch._id);
      changed = ids.length;
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.startsWith('STALE:')) return fail(409, `The records changed since the preview. Preview again.`);
    if (msg === 'GONE') return fail(404, 'This row no longer exists. Reload the page.');
    if (e?.code === 11000) return fail(409, 'Another row already has that name. Reload the page and try again.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true, changeId, recordsChanged: changed };
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/** Why a rename / merge can't be undone, or null if it can (checked without the records). */
export function undoBlocked(ch: any): string | null {
  if (ch.kind !== 'rename' && ch.kind !== 'merge') return 'Only renames and merges can be undone.';
  if (ch.undoneAt) return 'Already undone.';
  if (ch.undoOf) return 'This is an undo; make the change again instead.';
  if (!ch.extra?.plan) return 'This change has no plan to undo.';
  if (ch.kind === 'merge' && ch.sheetDone) return 'A merge can be undone only before it is repeated in the sheet: after that, the sheet can’t tell its rows apart.';
  return null;
}

export async function undoChange(userId: string, changeId: string, defOf: (slug: string) => ListDef | undefined):
  Promise<{ ok: true; changeId: string; recordsChanged: number; sheetNeeded: boolean } | Fail> {
  const ch = await MasterChange.findOne({ _id: changeId, userId }).lean() as any;
  if (!ch) return fail(404, 'Unknown change.');
  const blocked = undoBlocked(ch);
  if (blocked) return fail(409, blocked);
  const def = defOf(ch.list);
  if (def?.slug === PLACE_SLUG) return undoPlaceChange(def, userId, ch);
  const f = def && followFor(def);
  if (!def || !f) return fail(400, 'Unknown list.');
  const model = def.model();
  const p = ch.extra.plan as Plan;
  const ids = ch.recordIds as mongoose.Types.ObjectId[];

  // The records must still be there, with the values the change gave them.
  const nowMatch: Record<string, unknown> = { _id: { $in: ids }, userId };
  if (p.mode === 'category') nowMatch[f.rec.cat] = p.to;
  else Object.assign(nowMatch, recordSet(f, p.from, p.to));
  const still = await Log.countDocuments(nowMatch);
  if (still !== ids.length) {
    return fail(409, `Undo is no longer possible: ${n(ids.length - still)} of the ${plural(ids.length, 'record')} have been reloaded by a migration or changed since. Make the opposite change instead.`);
  }

  // The list must still look as the change left it.
  if (p.mode === 'category') {
    const rows = await model.countDocuments({ _id: { $in: p.rowIds }, userId, category: p.to });
    if (rows !== p.rowIds.length) return fail(409, `Undo is no longer possible: some rows of ${p.to} have changed since. Make the opposite change instead.`);
  } else {
    const clash = await model.exists({ userId, [f.keyCol]: p.from.key });
    if (clash && p.action === 'merge') return fail(409, `Undo is no longer possible: ${p.from.key} is in the list again.`);
    if (p.action !== 'merge') {
      const self = await model.findOne({ _id: p.rowId, userId }).lean() as any;
      if (!self || self[f.keyCol] !== p.to.key || self.category !== p.to.cat) return fail(409, `Undo is no longer possible: the row ${p.to.key} has changed since. Make the opposite change instead.`);
      if (p.from.key !== p.to.key && clash) return fail(409, `Undo is no longer possible: ${p.from.key} is in the list again.`);
    } else if (!(await model.exists({ _id: p.targetId, userId }))) {
      return fail(409, `Undo is no longer possible: ${p.to.key} is no longer in the list.`);
    }
  }

  const reverse: Plan = p.mode === 'category'
    ? { ...p, from: p.to, to: p.from }
    : { ...p, from: p.to, to: p.from };
  const sheetNeeded = !!ch.sheetDone;
  const counts = ch.extra.counts as Counts;
  const masterRows = p.mode === 'category' ? p.rowIds.length : 1;
  // Only renames and moves reach here once repeated in the sheet (undoBlocked), so
  // the reverse is the same kind of change with the two sides swapped.
  const sheetSteps = sheetNeeded
    ? stepsFor(f, reverse, counts, masterRows)
    : ['Nothing to do in the sheet: this was undone before it was repeated there.'];

  const session = await mongoose.startSession();
  let newId = '';
  try {
    await session.withTransaction(async () => {
      if (p.mode === 'category') {
        await model.updateMany({ _id: { $in: p.rowIds }, userId }, { $set: { category: p.from } }, { session });
        await Log.updateMany({ _id: { $in: ids } }, { $set: { [f.rec.cat]: p.from } }, { session });
      } else {
        if (p.action === 'merge') {
          await model.create([{ _id: p.rowId, userId, [f.keyCol]: p.from.key, category: p.from.cat }], { session });
        } else {
          await model.updateOne({ _id: p.rowId, userId }, { $set: { [f.keyCol]: p.from.key, category: p.from.cat } }, { session });
        }
        await Log.updateMany({ _id: { $in: ids } }, { $set: recordSet(f, p.to, p.from) }, { session });
      }
      if (f.calendar) await calendarUndo(userId, p, session);

      const now = new Date();
      await MasterChange.updateOne({ _id: ch._id }, {
        $set: { undoneAt: now, ...(sheetNeeded ? {} : { sheetDone: true, sheetDoneAt: now }) },
      }, { session });
      const [u] = await MasterChange.create([{
        userId, list: ch.list, kind: ch.kind, rowId: ch.rowId,
        before: ch.after, after: ch.before,
        recordsChanged: ids.length, recordIds: ids,
        sheetSteps, sheetDone: !sheetNeeded, sheetDoneAt: sheetNeeded ? null : now,
        undoOf: ch._id,
        extra: { title: `Undo: ${ch.extra.title}` },
      }], { session });
      newId = String(u._id);
    });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, `Undo is no longer possible: ${p.mode === 'row' ? p.from.key : p.from} is in the list again.`);
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true, changeId: newId, recordsChanged: ids.length, sheetNeeded };
}

/** Puts back only the Calendar settings the change touched. */
async function calendarUndo(userId: string, p: Plan, session: mongoose.ClientSession) {
  const doc = await CalendarSettings.findOne({ userId }).session(session).lean() as any;
  if (!doc) return;
  const set: CalFields = {};
  if (p.mode === 'category') {
    const colors = { ...(doc.colors ?? {}) } as Record<string, string>;
    if (p.action === 'rename' && p.to in colors) { colors[p.from] = colors[p.to]; delete colors[p.to]; }
    if (JSON.stringify(colors) !== JSON.stringify(doc.colors ?? {})) set.colors = colors;
    const hidden = (doc.hiddenCategories ?? []) as string[];
    if (p.action === 'rename' && hidden.includes(p.to)) set.hiddenCategories = [...hidden.filter(c => c !== p.to), p.from];
  } else if (p.from.key !== p.to.key && p.action !== 'merge') {
    const names = (doc.hiddenNames ?? []) as string[];
    if (names.includes(p.to.key)) set.hiddenNames = [...names.filter(x => x !== p.to.key), p.from.key];
  }
  if (Object.keys(set).length) await CalendarSettings.updateOne({ userId }, { $set: set }, { session });
}
