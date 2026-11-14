// Rename and merge for the nine reference lists (#67.5, Hyoje 8 Nov 2026), with past
// records following, as for activities (rename.ts). rename.ts hands these lists over.
//
// Agreed with Hyoje (8 Nov):
//   - A used value is renamed by typing its new name; typing a value the list already
//     has merges it into that value (the old row is deleted, its records take the kept
//     value). Records are changed, never deleted. Preview first; one change-list entry
//     with Mark repeated; Undo until the next migration, a merge only before the tick.
//   - Values the site's code looks for are refused, both ways (IN_CODE).
//   - People method / type: the list also holds combinations for the sheet's dropdown
//     ('가족|친목', no records). Renaming 친목 renames every combination that has it as
//     one of its '|' parts; a combination that then equals another is merged into it.
//   - People cells in the sheet hold one value per group, joined by '|' (BB, BC). The
//     sheet step is a regular expression that matches the value only as a whole part.
//     A merge can leave two neighbouring groups with the same method and type
//     ('업무친구|업무친구'): the migration reads that as the same people, so no row
//     needs changing by hand.
//
// For Undo the change keeps, per record, exactly which fields it changed (extra.hits),
// because after a merge other fields may hold the kept value already.

import mongoose from 'mongoose';
import Log from '@/models/Log';
import MasterChange from '@/models/MasterChange';
import { getArchiveUntil } from '@/lib/archiveYear';
import { countsByTab, type TabCount } from '@/lib/yearTabs';
import { oneIfSame } from '@/lib/records/relationship';
import { colLetter } from '@/lib/records/sheetCells';
import { REFERENCE_LIST_NAMES, type ListDef, toRow } from './lists';

// ── Per list ─────────────────────────────────────────────────────────────────

/** The sheet column (0-based index, as in sheetCells.ts) and label of each record path. */
const COLUMN: Record<string, { i: number; label: string; formulaInEntry?: boolean }> = {
  'activity.crossActivity': { i: 5, label: 'Cross activity' },
  'activity.relationship': { i: 6, label: 'Relationship', formulaInEntry: true },
  'food.type': { i: 37, label: 'Meal type' },
  'food.carbs': { i: 38, label: 'Carbs' },
  'food.fat': { i: 39, label: 'Fat' },
  'food.spiciness': { i: 40, label: 'Spiciness' },
  'people.method': { i: 53, label: 'People method' },
  'people.category': { i: 54, label: 'People type' },
  'transport.purpose': { i: 58, label: 'Purpose' },
  'transport.method': { i: 59, label: 'Transport' },
  'transport.returnType': { i: 60, label: 'Return type' },
};

/** Values the site's code looks for by name, with what would break (8 Nov). */
const IN_CODE: Record<string, Record<string, string>> = {
  'activity.crossActivity': { '골프': 'Journeys (after dinner with friends leaves golf out)' },
  'activity.relationship': { '혼자': 'it is calculated from People; Diet and Drinking', '함께': 'it is calculated from People; Interactions', '타인': 'it is calculated from People' },
  'food.type': { '아침': 'Diet (the breakfast rule) and Drinking', '점심': 'Drinking', '저녁': 'Drinking' },
  'transport.purpose': { '출근': 'Journeys', '귀가': 'Journeys and the return-type rule' },
  'transport.method': { '도보': 'Journeys (speed check)', '기차': 'Journeys (speed check)', '비행기': 'Journeys (flights)' },
  'transport.returnType': {
    '근무 후 귀가': 'Journeys', '퇴근길 식사 후 귀가': 'Journeys', '퇴근길 볼일 후 귀가': 'Journeys',
    '업무회식 후 귀가': 'Journeys', '친목모임 후 귀가': 'Journeys',
  },
  'people.method': { '타인': 'the Relationship formula' },
};

export const isRefList = (def: ListDef) => def.slug.startsWith('ref-') && typeof def.filter?.listName === 'string';
const listNameOf = (def: ListDef) => String(def.filter!.listName);

export function refLockedNames(def: ListDef): Record<string, string> {
  return IN_CODE[listNameOf(def)] ?? {};
}

interface Shape {
  listName: string;
  /** scalar record paths, e.g. ['food.carbs', 'food.fat', 'food.spiciness'] */
  paths: string[];
  /** people lists: the field inside each person */
  peopleField: 'method' | 'category' | null;
  where: string;
}

function shapeOf(def: ListDef): Shape {
  const listName = listNameOf(def);
  const ref = REFERENCE_LIST_NAMES.find(r => r.listName === listName)!;
  const paths: string[] = [];
  let peopleField: Shape['peopleField'] = null;
  for (const u of ref.usage) {
    const p = String(u.key.value);
    if (u.unwind?.includes('people')) peopleField = p.split('.')[1] as 'method' | 'category';
    else paths.push(p);
  }
  return { listName, paths, peopleField, where: `Activity tab, column ${ref.column}` };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface ComboChange { id: string; from: string; to: string; order: number; mergeInto: string | null }

export interface RefPlan {
  mode: 'ref';
  listName: string;
  action: 'rename' | 'merge';
  rowId: string;
  order: number;
  targetId: string | null;
  from: string;
  to: string;
  combos: ComboChange[];
}

/** One record's changed fields: scalar paths, and people indexes. */
export interface RefHit { id: string; year: number | null; paths: string[]; idx: number[] }

/** Per sheet column: occurrences to expect, by tab, on the first and the second run. */
export interface ColumnCount { path: string; first: TabCount[]; second: TabCount[] }

export interface RefCounts { total: number; byTab: TabCount[]; first: number | null; last: number | null; otherCat: 0; columns: ColumnCount[] }

export interface RefPreview {
  title: string;
  counts: RefCounts;
  rows: number;
  warnings: string[];
  sheetSteps: string[];
  plan: RefPlan;
}

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, one: string, many = one + 's') => `${n(x)} ${x === 1 ? one : many}`;
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** '가족|친목' with 친목 → 친구 gives '가족|친구'; null when 친목 is not one of its parts. */
export function comboRenamed(combo: string, from: string, to: string): string | null {
  const parts = combo.split('|');
  if (parts.length < 2 || !parts.includes(from)) return null;
  return parts.map(p => (p === from ? to : p)).join('|');
}

async function makePlan(def: ListDef, sh: Shape, userId: string, id: string, values: Record<string, unknown>): Promise<RefPlan | Fail> {
  const model = def.model();
  const scope = { userId, listName: sh.listName };
  const row = await model.findOne({ _id: id, ...scope }).lean() as any;
  if (!row) return fail(404, 'This row no longer exists. Reload the page.');
  const from = String(row.value);
  const to = typeof values.value === 'string' ? values.value.trim() : '';
  if (!to) return fail(400, 'Value is required.');
  if (to === from) return fail(400, 'Nothing changed.');

  const code = IN_CODE[sh.listName] ?? {};
  if (code[from]) return fail(409, `${from} can't be renamed or merged here: the site's code looks for it by name (${code[from]}). The code has to change first.`);
  if (code[to]) return fail(409, `Can't merge into ${to} here: the site's code looks for it by name (${code[to]}), and its records would change meaning. Ask Claude.`);
  const isCombo = from.includes('|');
  if (to.includes('|') && !(sh.peopleField && isCombo)) {
    return fail(400, sh.peopleField
      ? `| separates people groups in the sheet, so ${from} can't take it. Combinations like 가족|친구 are rows of their own.`
      : 'A value can’t contain |.');
  }
  if (isCombo && !to.includes('|')) return fail(400, `${from} is a combination for the sheet's dropdown; its new name must keep the | parts.`);

  const target = await model.findOne({ ...scope, value: to, _id: { $ne: row._id } }).lean() as any;
  const combos: ComboChange[] = [];
  if (sh.peopleField && !isCombo) {
    const all = await model.find({ ...scope, value: /\|/ }).lean() as any[];
    for (const c of all) {
      const nv = comboRenamed(String(c.value), from, to);
      if (!nv) continue;
      const into = all.find(o => String(o.value) === nv && String(o._id) !== String(c._id));
      combos.push({ id: String(c._id), from: String(c.value), to: nv, order: Number(c.order), mergeInto: into ? String(into._id) : null });
    }
  }
  return {
    mode: 'ref', listName: sh.listName, action: target ? 'merge' : 'rename',
    rowId: String(row._id), order: Number(row.order), targetId: target ? String(target._id) : null,
    from, to, combos,
  };
}

// ── Records ──────────────────────────────────────────────────────────────────

function recordFilter(sh: Shape, userId: string, value: string): Record<string, unknown> {
  const or: Record<string, unknown>[] = sh.paths.map(p => ({ [p]: value }));
  if (sh.peopleField) or.push({ ['people.' + sh.peopleField]: value });
  return { userId, $or: or };
}

const get = (doc: any, path: string) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);

/** The sheet's people cell for one field: one value per group, a value every group shares written once. */
export function peopleCell(people: any[], field: 'method' | 'category'): string {
  const groups: { m: string; c: string }[] = [];
  for (const p of people ?? []) {
    const m = String(p?.method ?? '').trim(), c = String(p?.category ?? '').trim();
    const last = groups[groups.length - 1];
    if (!last || last.m !== m || last.c !== c) groups.push({ m, c });
  }
  return oneIfSame(groups.map(g => (field === 'method' ? g.m : g.c))).join('|');
}

/** The regular expression the sheet step uses: the value as one whole '|' part. */
export function partRegex(from: string): { find: string; re: RegExp; replace: (to: string) => string } {
  const find = `(^|\\|)${reEscape(from)}(\\||$)`;
  return { find, re: new RegExp(find, 'g'), replace: to => `$1${to.replace(/\$/g, '$$$$')}$2` };
}

/** One run of the regular expression over a cell, as Sheets does it: how many it replaced, and the result. */
export function runOnce(cell: string, from: string, to: string): { count: number; out: string } {
  let count = 0;
  const out = cell.replace(partRegex(from).re, (_m, a: string, b: string) => { count++; return a + to + b; });
  return { count, out };
}

interface Loaded { hits: RefHit[]; columns: ColumnCount[]; joins: number }

async function loadHits(sh: Shape, userId: string, from: string, to: string, archiveUntil: number, session?: mongoose.ClientSession): Promise<Loaded> {
  const select = ['start.year', ...sh.paths, ...(sh.peopleField ? ['people'] : [])].join(' ');
  const docs = await Log.find(recordFilter(sh, userId, from)).select(select).session(session ?? null).lean() as any[];
  const thisYear = new Date().getFullYear();
  const hits: RefHit[] = [];
  const perPath = new Map<string, { first: Map<number | null, number>; second: Map<number | null, number> }>();
  const add = (path: string, which: 'first' | 'second', year: number | null, x: number) => {
    if (!x) return;
    if (!perPath.has(path)) perPath.set(path, { first: new Map(), second: new Map() });
    const m = perPath.get(path)![which];
    m.set(year, (m.get(year) ?? 0) + x);
  };
  let joins = 0;
  for (const d of docs) {
    const year = typeof d?.start?.year === 'number' ? d.start.year : null;
    const paths = sh.paths.filter(p => get(d, p) === from);
    const idx: number[] = [];
    if (sh.peopleField) {
      (Array.isArray(d.people) ? d.people : []).forEach((p: any, i: number) => { if (p?.[sh.peopleField!] === from) idx.push(i); });
    }
    if (!paths.length && !idx.length) continue;
    hits.push({ id: String(d._id), year, paths, idx });
    for (const p of paths) add(p, 'first', year, 1);
    if (idx.length && sh.peopleField) {
      const col = 'people.' + sh.peopleField;
      const cell = peopleCell(d.people, sh.peopleField);
      const one = runOnce(cell, from, to);
      const two = runOnce(one.out, from, to);
      add(col, 'first', year, one.count);
      add(col, 'second', year, two.count);
      // Neighbouring groups that end up the same: the sheet keeps them apart, harmlessly.
      const after = (d.people as any[]).map((p, i) => (idx.includes(i) ? { ...p, [sh.peopleField!]: to } : p));
      if (groupCount(after) < groupCount(d.people)) joins++;
    }
  }
  const tabsOf = (m: Map<number | null, number>) => countsByTab([...m.entries()].map(([year, x]) => ({ year, n: x })), archiveUntil, thisYear);
  const allPaths = [...sh.paths, ...(sh.peopleField ? ['people.' + sh.peopleField] : [])];
  const columns = allPaths.map(path => {
    const c = perPath.get(path);
    return { path, first: tabsOf(c?.first ?? new Map()), second: tabsOf(c?.second ?? new Map()) };
  });
  return { hits, columns, joins };
}

function groupCount(people: any[]): number {
  let k = 0, last = '';
  for (const p of people ?? []) {
    const key = `${p?.method ?? ''}\u0001${p?.category ?? ''}`;
    if (key !== last) { k++; last = key; }
  }
  return k;
}

function countsOf(hits: RefHit[], columns: ColumnCount[], archiveUntil: number): RefCounts {
  const byYear = new Map<number | null, number>();
  for (const h of hits) byYear.set(h.year, (byYear.get(h.year) ?? 0) + 1);
  const years = hits.map(h => h.year).filter((y): y is number => typeof y === 'number');
  return {
    total: hits.length,
    byTab: countsByTab([...byYear.entries()].map(([year, x]) => ({ year, n: x })), archiveUntil, new Date().getFullYear()),
    first: years.length ? Math.min(...years) : null,
    last: years.length ? Math.max(...years) : null,
    otherCat: 0,
    columns,
  };
}

// ── Words ────────────────────────────────────────────────────────────────────

function titleOf(p: RefPlan, listTitle: string): string {
  return p.action === 'merge'
    ? `Merge ${p.from} into ${p.to} (${listTitle})`
    : `Rename ${p.from} → ${p.to} (${listTitle})`;
}

const ENTRY_TABS = ['Active', 'History', 'Future'];
const range = (tab: string, col: string, row: number) => `'${tab}'!${col}${row}:${col}`;
const expect = (x: number) => (x === 0 ? 'expect none' : `expect ${n(x)}`);
const HOW = 'Choose “Specific range” and do each range in turn; leave “Also search within formulas” off. Sheets says how many it replaced; the newest year tab can show more if rows were added since the last migration.';

/** The steps for a plan; `columns` says what to expect (an undo passes the change's own counts). */
export function refSteps(sh: Shape, p: RefPlan, columns: ColumnCount[]): string[] {
  const steps: string[] = [];
  // 1. The Activity tab's column (the dropdowns read it).
  if (p.action === 'merge') steps.push(`${sh.where}: remove ${p.from} and move the values below it up (${p.to} stays).`);
  else steps.push(`${sh.where}: change ${p.from} to ${p.to}.`);
  for (const c of p.combos) {
    steps.push(c.mergeInto
      ? `${sh.where}: remove ${c.from} and move the values below it up (${c.to} is there already).`
      : `${sh.where}: change ${c.from} to ${c.to}.`);
  }
  // 2. The records, column by column.
  for (const col of columns) {
    const info = COLUMN[col.path];
    const letter = colLetter(info.i);
    const tabs = (t: TabCount[]) => t.map(x => `${range(x.tab, letter, 4)} (${expect(x.n)})`).join(', ');
    const entry = info.formulaInEntry
      ? `   Active file: nothing to do in column ${letter} (a formula fills it).`
      : `   Active file: ${ENTRY_TABS.map(t => range(t, letter, 3)).join(', ')} (any number, including none).`;
    if (col.path.startsWith('people.')) {
      const re = partRegex(p.from);
      steps.push(
        `Find and replace in column ${letter} (${info.label}), with “Search using regular expressions” ticked and “Match case” ticked. Find: ${re.find}   Replace with: ${re.replace(p.to)}   — this matches ${p.from} only as a whole part, between | separators. ${HOW}`,
        `   Archive file: ${tabs(col.first)}.`,
        entry,
      );
      const again = col.second.reduce((a, x) => a + x.n, 0);
      steps.push(again
        ? `Then run the same step again: a cell with ${p.from} twice in a row (${p.from}|${p.from}) is replaced one part per run. Archive file: ${tabs(col.second.filter(x => x.n))}; Active file: any number. Run it once more if Sheets still replaces any.`
        : `Then run the same step once more: it should replace none (a cell with ${p.from}|${p.from} is replaced one part per run).`);
    } else {
      steps.push(
        `Find and replace ${p.from} → ${p.to} in column ${letter} (${info.label}), with “Match case” and “Match entire cell contents” ticked. ${HOW}`,
        `   Archive file: ${tabs(col.first)}.`,
        entry,
      );
    }
  }
  return steps;
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewRefRename(def: ListDef, userId: string, id: string, values: Record<string, unknown>):
  Promise<{ ok: true; preview: RefPreview; hits: RefHit[] } | Fail> {
  const sh = shapeOf(def);
  const p = await makePlan(def, sh, userId, id, values);
  if ('ok' in p) return p;
  const archiveUntil = await getArchiveUntil(userId);
  const { hits, columns, joins } = await loadHits(sh, userId, p.from, p.to, archiveUntil);
  const counts = countsOf(hits, columns, archiveUntil);

  const warnings: string[] = [];
  if (p.action === 'merge') warnings.push(`${p.from} is deleted from the list; its records take ${p.to}. Records are changed, not deleted.`);
  for (const c of p.combos) {
    warnings.push(c.mergeInto
      ? `The combination ${c.from} becomes ${c.to}, which the list has already: ${c.from} is deleted from the list.`
      : `The combination ${c.from} becomes ${c.to}.`);
  }
  if (joins) {
    warnings.push(`In ${plural(joins, 'record')}, two groups side by side become the same (e.g. ${p.to}|${p.to}). The sheet can keep them that way: the migration reads them as the same people.`);
  }
  return {
    ok: true,
    hits,
    preview: { title: titleOf(p, def.title), counts, rows: 1 + p.combos.length, warnings, sheetSteps: refSteps(sh, p, columns), plan: p },
  };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export async function applyRefRename(def: ListDef, userId: string, id: string, values: Record<string, unknown>, expectRecords: number):
  Promise<{ ok: true; changeId: string; recordsChanged: number } | Fail> {
  const pv = await previewRefRename(def, userId, id, values);
  if (!pv.ok) return pv;
  const { plan: p, counts } = pv.preview;
  if (counts.total !== expectRecords) {
    return fail(409, `The records changed since the preview (${n(expectRecords)} then, ${n(counts.total)} now). Preview again.`);
  }
  const sh = shapeOf(def);
  const model = def.model();
  const scope = { userId, listName: sh.listName };
  const kind = p.action === 'merge' || p.combos.some(c => c.mergeInto) ? 'merge' : 'rename';

  const session = await mongoose.startSession();
  let changeId = '';
  try {
    await session.withTransaction(async () => {
      const archiveUntil = await getArchiveUntil(userId);
      const again = await loadHits(sh, userId, p.from, p.to, archiveUntil, session);
      if (again.hits.length !== expectRecords) throw new Error(`STALE:${again.hits.length}`);
      const ids = again.hits.map(h => new mongoose.Types.ObjectId(h.id));

      // The list
      const self = await model.findOne({ _id: p.rowId, ...scope }).session(session).lean() as any;
      if (!self || self.value !== p.from) throw new Error('GONE');
      const before = toRow(def, self).values;
      if (p.action === 'merge') await model.deleteOne({ _id: self._id }, { session });
      else await model.updateOne({ _id: self._id }, { $set: { value: p.to } }, { session });
      for (const c of p.combos) {
        if (c.mergeInto) await model.deleteOne({ _id: c.id, ...scope, value: c.from }, { session });
        else await model.updateOne({ _id: c.id, ...scope, value: c.from }, { $set: { value: c.to } }, { session });
      }

      // The records
      for (const path of sh.paths) {
        await Log.updateMany({ _id: { $in: ids }, [path]: p.from }, { $set: { [path]: p.to } }, { session });
      }
      if (sh.peopleField) {
        const f = sh.peopleField;
        await Log.updateMany(
          { _id: { $in: ids }, ['people.' + f]: p.from },
          { $set: { [`people.$[p].${f}`]: p.to } },
          { session, arrayFilters: [{ [`p.${f}`]: p.from }] } as any,
        );
      }

      const [ch] = await MasterChange.create([{
        userId, list: def.slug, kind, rowId: p.rowId, before, after: { value: p.to },
        recordsChanged: ids.length, recordIds: ids,
        sheetSteps: pv.preview.sheetSteps,
        extra: { title: pv.preview.title, plan: p, counts: countsOf(again.hits, again.columns, archiveUntil), hits: again.hits },
      }], { session });
      changeId = String(ch._id);
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.startsWith('STALE:')) return fail(409, 'The records changed since the preview. Preview again.');
    if (msg === 'GONE') return fail(404, 'This row has changed or no longer exists. Reload the page.');
    if (e?.code === 11000) return fail(409, 'Another row already has that value. Reload the page and try again.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true, changeId, recordsChanged: expectRecords };
}

// ── Undo ─────────────────────────────────────────────────────────────────────

const swapped = (p: RefPlan): RefPlan => ({
  ...p, from: p.to, to: p.from,
  combos: p.combos.map(c => ({ ...c, from: c.to, to: c.from })),
});

/** rename.ts has checked undoBlocked already (a merge only before the tick). */
export async function undoRefChange(def: ListDef, userId: string, ch: any):
  Promise<{ ok: true; changeId: string; recordsChanged: number; sheetNeeded: boolean } | Fail> {
  const sh = shapeOf(def);
  const model = def.model();
  const scope = { userId, listName: sh.listName };
  const p = ch.extra.plan as RefPlan;
  const hits = (ch.extra.hits ?? []) as RefHit[];

  // The records must still hold what the change gave them.
  const docs = await Log.find({ _id: { $in: hits.map(h => h.id) }, userId })
    .select([...sh.paths, ...(sh.peopleField ? ['people'] : [])].join(' ')).lean() as any[];
  const byId = new Map(docs.map(d => [String(d._id), d]));
  const changed = hits.filter(h => {
    const d = byId.get(h.id);
    if (!d) return true;
    if (h.paths.some(path => get(d, path) !== p.to)) return true;
    return h.idx.some(i => d.people?.[i]?.[sh.peopleField!] !== p.to);
  }).length;
  if (changed) {
    return fail(409, `Undo is no longer possible: ${n(changed)} of the ${plural(hits.length, 'record')} have been reloaded by a migration or changed since. Make the opposite change instead.`);
  }

  // The list must still look as the change left it.
  if (await model.exists({ ...scope, value: p.from })) return fail(409, `Undo is no longer possible: ${p.from} is in the list again.`);
  if (p.action === 'merge') {
    if (!(await model.exists({ _id: p.targetId, ...scope, value: p.to }))) return fail(409, `Undo is no longer possible: ${p.to} has changed since.`);
  } else if (!(await model.exists({ _id: p.rowId, ...scope, value: p.to }))) {
    return fail(409, `Undo is no longer possible: the row ${p.to} has changed since. Make the opposite change instead.`);
  }
  for (const c of p.combos) {
    if (await model.exists({ ...scope, value: c.from })) return fail(409, `Undo is no longer possible: ${c.from} is in the list again.`);
    if (!c.mergeInto && !(await model.exists({ _id: c.id, ...scope, value: c.to }))) return fail(409, `Undo is no longer possible: the combination ${c.to} has changed since.`);
  }

  const sheetNeeded: boolean = false; // the sheet is frozen (14 Nov 2026): an undo has nothing to repeat there
  const counts = ch.extra.counts as RefCounts;
  const sheetSteps = sheetNeeded
    ? refSteps(sh, swapped(p), counts.columns)
    : ['Nothing to do in the sheet: this was undone before it was repeated there.'];

  const session = await mongoose.startSession();
  let newId = '';
  try {
    await session.withTransaction(async () => {
      if (p.action === 'merge') {
        await model.create([{ _id: p.rowId, userId, listName: sh.listName, value: p.from, order: p.order }], { session });
      } else {
        await model.updateOne({ _id: p.rowId, ...scope }, { $set: { value: p.from } }, { session });
      }
      for (const c of p.combos) {
        if (c.mergeInto) await model.create([{ _id: c.id, userId, listName: sh.listName, value: c.from, order: c.order }], { session });
        else await model.updateOne({ _id: c.id, ...scope }, { $set: { value: c.from } }, { session });
      }
      if (hits.length) {
        await Log.bulkWrite(hits.map(h => {
          const set: Record<string, string> = {};
          for (const path of h.paths) set[path] = p.from;
          for (const i of h.idx) set[`people.${i}.${sh.peopleField}`] = p.from;
          return { updateOne: { filter: { _id: new mongoose.Types.ObjectId(h.id), userId }, update: { $set: set } } };
        }), { session });
      }

      const now = new Date();
      await MasterChange.updateOne({ _id: ch._id }, {
        $set: { undoneAt: now, ...(sheetNeeded ? {} : { sheetDone: true, sheetDoneAt: now }) },
      }, { session });
      const [u] = await MasterChange.create([{
        userId, list: ch.list, kind: ch.kind, rowId: ch.rowId,
        before: ch.after, after: ch.before,
        recordsChanged: hits.length, recordIds: ch.recordIds,
        sheetSteps, sheetDone: !sheetNeeded, sheetDoneAt: sheetNeeded ? null : now,
        undoOf: ch._id,
        extra: { title: `Undo: ${ch.extra.title}` },
      }], { session });
      newId = String(u._id);
    });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, `Undo is no longer possible: ${p.from} is in the list again.`);
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true, changeId: newId, recordsChanged: hits.length, sheetNeeded };
}
