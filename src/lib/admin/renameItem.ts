// Rename and merge for ingredients, alcohol items and bowel values (#67.9, 25 Nov 2026),
// past records following — as for the reference lists (renameRef.ts) and activities
// (rename.ts), which hand these three lists over.
//
//   - A used row is renamed by typing its new name; a name the list has already merges it
//     into that row (the old row is deleted, its records take the kept name). Records are
//     changed, never deleted. Preview first; one change-list entry; Undo.
//   - The name only: change it on its own, then the other columns (a merge keeps the other
//     row's group, conversion or score).
//   - Ingredients: level2 in food.foods[].ingredients and food.drinks[].ingredients. A
//     merge can leave both names in one list: it then holds the kept one once.
//   - Alcohol: item + unit in food.alcohols[] (a row is one item in one unit).
//   - Bowel: the value in bowel.amount, bowel.quality[] or bowel.characteristics[] — the
//     row's field; the field itself can't change. 편하게 / 급하게 / 힘들게 are refused (the
//     Bowel insight looks for them). Quality values are ordered by name there: a new name
//     goes after 설사 until the code learns it (a warning).
//   - Open plans (log_plan) follow too, so they still save; done or deleted ones don't.
//   - No sheet steps: the sheet is frozen (14 Nov).
//
// For Undo the change keeps, per record, the exact fields before and after (extra.hits).

import mongoose from 'mongoose';
import Log from '@/models/Log';
import LogPlan from '@/models/LogPlan';
import EntryCache from '@/models/EntryCache';
import MasterChange from '@/models/MasterChange';
import { getArchiveUntil } from '@/lib/archiveYear';
import { countsByTab, type TabCount } from '@/lib/yearTabs';
import { toRow, type ListDef } from './lists';

const SLUGS = ['ingredient', 'alcohol', 'bowel'] as const;
type Slug = typeof SLUGS[number];
export const isItemList = (def: ListDef) => (SLUGS as readonly string[]).includes(def.slug);

/** Names the code looks for, shown locked on the page (bowel: only the value box). */
export function itemLockedNames(def: ListDef): Record<string, string> {
  return def.slug === 'bowel' ? { ...IN_CODE['bowel:characteristics'] } : {};
}

/** The columns that name the row (the rest must stay as they are in a rename). */
const KEY: Record<Slug, string[]> = { ingredient: ['level2'], alcohol: ['item', 'unit'], bowel: ['value'] };

/** Values the site's code looks for (refused both ways). */
const IN_CODE: Record<string, Record<string, string>> = {
  'bowel:characteristics': { '편하게': 'the Bowel insight (how it went)', '급하게': 'the Bowel insight (how it went)', '힘들게': 'the Bowel insight (how it went)' },
};
/** Values whose order the code knows (a warning, not refused). */
const ORDERED: Record<string, string[]> = {
  'bowel:quality': ['토끼똥', '딱딱함', '푸석함', '가늠', '좋음', '보통', '무름', '묽음', '설사'],
};

export interface ItemPlan {
  mode: 'item';
  slug: Slug;
  action: 'rename' | 'merge';
  rowId: string;
  targetId: string | null;
  field: string | null;                  // bowel: amount | quality | characteristics
  before: Record<string, unknown>;       // the row as it was (a merge re-creates it on Undo)
  from: Record<string, string>;          // the key columns
  to: Record<string, string>;
}

/** One record's (or open plan's) change: the exact fields, before and after. */
export interface ItemHit { id: string; plan: boolean; year: number | null; before: Record<string, unknown>; after: Record<string, unknown> }

export interface ItemCounts { total: number; byTab: TabCount[]; first: number | null; last: number | null; otherCat: 0; plans: number }

export interface ItemPreview {
  title: string;
  counts: ItemCounts;
  rows: number;
  warnings: string[];
  sheetSteps: string[];
  plan: ItemPlan;
}

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, one: string, many = one + 's') => `${n(x)} ${x === 1 ? one : many}`;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const label = (slug: Slug, k: Record<string, string>) => (slug === 'alcohol' ? `${k.item} (${k.unit})` : Object.values(k)[0]);

// ── Plan ─────────────────────────────────────────────────────────────────────

async function makePlan(def: ListDef, userId: string, id: string, values: Record<string, unknown>): Promise<ItemPlan | Fail> {
  const slug = def.slug as Slug;
  if (!mongoose.isValidObjectId(id)) return fail(404, 'This row no longer exists. Reload the page.');
  const model = def.model();
  const row = await model.findOne({ _id: id, userId }).lean() as any;
  if (!row) return fail(404, 'This row no longer exists. Reload the page.');
  const before = toRow(def, row).values as Record<string, unknown>;
  const keys = KEY[slug];
  const from: Record<string, string> = {}, to: Record<string, string> = {};
  for (const k of keys) { from[k] = str(before[k]); to[k] = str(values[k]); }
  for (const k of keys) if (!to[k]) return fail(400, `${def.columns.find(c => c.key === k)?.label ?? k} is needed.`);
  // The other columns first (25 Nov: a changed Field alone said "Nothing changed").
  const others = def.columns.map(c => c.key).filter(k => !keys.includes(k));
  const moved = others.filter(k => !same(str(before[k]), str(values[k])));
  if (slug === 'bowel' && moved.includes('field')) return fail(409, 'The field can’t change: add the value under the other field instead.');
  if (same(from, to)) return fail(400, 'Nothing changed.');
  if (moved.length) return fail(409, 'Change the name on its own, then the other columns.');
  const field = slug === 'bowel' ? str(before.field) : null;
  const inCode = field ? IN_CODE[`bowel:${field}`] : undefined;
  for (const v of [from.value, to.value]) {
    if (inCode && v && inCode[v]) return fail(409, `Locked: the site’s code looks for ${v} by name (${inCode[v]}). The code has to change first.`);
  }
  // A name the list has already: a merge into that row.
  const match: Record<string, unknown> = { userId, ...(field ? { field } : {}) };
  for (const k of keys) match[k] = to[k];
  const target = await model.findOne(match).lean() as any;
  if (target && String(target._id) === String(row._id)) return fail(400, 'Nothing changed.');
  return { mode: 'item', slug, action: target ? 'merge' : 'rename', rowId: String(row._id), targetId: target ? String(target._id) : null, field, before, from, to };
}

// ── Records ──────────────────────────────────────────────────────────────────

const replaceIn = (arr: unknown, from: string, to: string): string[] | null => {
  if (!Array.isArray(arr) || !arr.includes(from)) return null;
  const out: string[] = [];
  for (const x of arr.map(v => (v === from ? to : v))) if (!out.includes(x)) out.push(x);
  return out;
};

/** The records' query and the fields to read, for a plan. */
function scopeOf(p: ItemPlan): { filter: Record<string, unknown>; select: string } {
  if (p.slug === 'ingredient') {
    const v = p.from.level2;
    return { filter: { $or: [{ 'food.foods.ingredients': v }, { 'food.drinks.ingredients': v }] }, select: 'food.foods food.drinks start.year' };
  }
  if (p.slug === 'alcohol') {
    return { filter: { 'food.alcohols': { $elemMatch: { item: p.from.item, unit: p.from.unit } } }, select: 'food.alcohols start.year' };
  }
  return { filter: { [`bowel.${p.field}`]: p.from.value }, select: `bowel.${p.field} start.year` };
}

/** What changes in one document: { before, after } of exact paths, or null. */
function changeOf(p: ItemPlan, d: any): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  if (p.slug === 'ingredient') {
    for (const list of ['foods', 'drinks'] as const) {
      (d.food?.[list] ?? []).forEach((it: any, i: number) => {
        const out = replaceIn(it?.ingredients, p.from.level2, p.to.level2);
        if (out) { before[`food.${list}.${i}.ingredients`] = it.ingredients; after[`food.${list}.${i}.ingredients`] = out; }
      });
    }
  } else if (p.slug === 'alcohol') {
    (d.food?.alcohols ?? []).forEach((it: any, i: number) => {
      if (it?.item === p.from.item && it?.unit === p.from.unit) {
        before[`food.alcohols.${i}.item`] = it.item; after[`food.alcohols.${i}.item`] = p.to.item;
        before[`food.alcohols.${i}.unit`] = it.unit; after[`food.alcohols.${i}.unit`] = p.to.unit;
      }
    });
  } else {
    const path = `bowel.${p.field}`;
    const cur = d.bowel?.[p.field!];
    if (Array.isArray(cur)) {
      const out = replaceIn(cur, p.from.value, p.to.value);
      if (out) { before[path] = cur; after[path] = out; }
    } else if (cur === p.from.value) { before[path] = cur; after[path] = p.to.value; }
  }
  return Object.keys(after).length ? { before, after } : null;
}

async function loadHits(p: ItemPlan, userId: string, session?: mongoose.ClientSession): Promise<ItemHit[]> {
  const { filter, select } = scopeOf(p);
  const [recs, plans] = await Promise.all([
    Log.find({ userId, ...filter }).select(select).session(session ?? null).lean() as Promise<any[]>,
    LogPlan.find({ userId, 'plan.state': 'open', ...filter }).select(select).session(session ?? null).lean() as Promise<any[]>,
  ]);
  const out: ItemHit[] = [];
  for (const [docs, plan] of [[recs, false], [plans, true]] as const) {
    for (const d of docs) {
      const c = changeOf(p, d);
      if (c) out.push({ id: String(d._id), plan, year: typeof d.start?.year === 'number' ? d.start.year : null, ...c });
    }
  }
  return out;
}

function countsOf(hits: ItemHit[], archiveUntil: number): ItemCounts {
  const recs = hits.filter(h => !h.plan);
  const byYear = new Map<number | null, number>();
  for (const h of recs) byYear.set(h.year, (byYear.get(h.year) ?? 0) + 1);
  const years = recs.map(h => h.year).filter((y): y is number => typeof y === 'number');
  return {
    total: recs.length,
    byTab: countsByTab([...byYear.entries()].map(([year, x]) => ({ year, n: x })), archiveUntil, new Date().getFullYear()),
    first: years.length ? Math.min(...years) : null,
    last: years.length ? Math.max(...years) : null,
    otherCat: 0,
    plans: hits.length - recs.length,
  };
}

function titleOf(p: ItemPlan, listTitle: string): string {
  const where = p.field ? `${listTitle}, ${p.field}` : listTitle;
  return p.action === 'merge'
    ? `Merge ${label(p.slug, p.from)} into ${label(p.slug, p.to)} (${where})`
    : `Rename ${label(p.slug, p.from)} → ${label(p.slug, p.to)} (${where})`;
}

const NO_SHEET = ['Nothing to do in the sheet: it is frozen (14 Nov 2026).'];

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewItemRename(def: ListDef, userId: string, id: string, values: Record<string, unknown>):
  Promise<{ ok: true; preview: ItemPreview; hits: ItemHit[] } | Fail> {
  const p = await makePlan(def, userId, id, values);
  if ('ok' in p) return p;
  const archiveUntil = await getArchiveUntil(userId);
  const hits = await loadHits(p, userId);
  const counts = countsOf(hits, archiveUntil);
  const warnings: string[] = [];
  if (p.action === 'merge') {
    warnings.push(`${label(p.slug, p.from)} is deleted from the list; its records take ${label(p.slug, p.to)}${p.slug === 'alcohol' ? ' and its conversion' : p.slug === 'bowel' ? ' and its score' : ' and its group'}. Records are changed, not deleted.`);
    const both = hits.filter(h => Object.keys(h.after).some(k => Array.isArray(h.after[k]) && (h.after[k] as unknown[]).length < (h.before[k] as unknown[]).length)).length;
    if (both) warnings.push(`${plural(both, 'record')} had both names: ${label(p.slug, p.to)} is kept once.`);
  }
  if (p.slug === 'bowel' && p.field && ORDERED[`bowel:${p.field}`]) {
    const order = ORDERED[`bowel:${p.field}`];
    if (order.includes(p.from.value) && !order.includes(p.to.value)) {
      warnings.push(`The Bowel insight orders quality values by name: ${p.to.value} goes after 설사 until the code learns it. Tell Claude to add it.`);
    }
  }
  if (counts.plans) warnings.push(`${plural(counts.plans, 'open plan')} change${counts.plans === 1 ? 's' : ''} too.`);
  return { ok: true, hits, preview: { title: titleOf(p, def.title), counts, rows: 1, warnings, sheetSteps: NO_SHEET, plan: p } };
}

// ── Apply ────────────────────────────────────────────────────────────────────

const writes = (hits: ItemHit[], side: 'before' | 'after', userId: string) => hits.map(h => ({
  updateOne: { filter: { _id: new mongoose.Types.ObjectId(h.id), userId }, update: { $set: h[side] } },
}));

export async function applyItemRename(def: ListDef, userId: string, id: string, values: Record<string, unknown>, expectRecords: number):
  Promise<{ ok: true; changeId: string; recordsChanged: number } | Fail> {
  const pv = await previewItemRename(def, userId, id, values);
  if (!pv.ok) return pv;
  const { plan: p, counts } = pv.preview;
  if (counts.total !== expectRecords) {
    return fail(409, `The records changed since the preview (${n(expectRecords)} then, ${n(counts.total)} now). Preview again.`);
  }
  const model = def.model();
  const session = await mongoose.startSession();
  let changeId = '';
  try {
    await session.withTransaction(async () => {
      const hits = await loadHits(p, userId, session);
      if (hits.filter(h => !h.plan).length !== expectRecords) throw new Error('STALE');
      const self = await model.findOne({ _id: p.rowId, userId }).session(session).lean() as any;
      if (!self || !same(Object.fromEntries(KEY[p.slug].map(k => [k, str(self[k])])), p.from)) throw new Error('GONE');
      if (p.action === 'merge') await model.deleteOne({ _id: self._id }, { session });
      else await model.updateOne({ _id: self._id }, { $set: p.to }, { session });
      const recs = hits.filter(h => !h.plan), plans = hits.filter(h => h.plan);
      if (recs.length) await Log.bulkWrite(writes(recs, 'after', userId), { session });
      if (plans.length) await LogPlan.bulkWrite(writes(plans, 'after', userId), { session });
      const [ch] = await MasterChange.create([{
        userId, list: def.slug, kind: p.action, rowId: p.rowId, before: p.before, after: { ...p.before, ...p.to },
        recordsChanged: recs.length, recordIds: recs.map(h => new mongoose.Types.ObjectId(h.id)),
        sheetSteps: NO_SHEET, sheetDone: true, sheetDoneAt: new Date(),
        extra: { title: pv.preview.title, plan: p, counts: countsOf(hits, await getArchiveUntil(userId)), hits },
      }], { session });
      changeId = String(ch._id);
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === 'STALE') return fail(409, 'The records changed since the preview. Preview again.');
    if (msg === 'GONE') return fail(404, 'This row has changed or no longer exists. Reload the page.');
    if (e?.code === 11000) return fail(409, 'Another row already has that name. Reload the page and try again.');
    throw e;
  } finally {
    await session.endSession();
  }
  // The form's suggestions kept on the server (formOptions.ts) still hold the old name.
  await EntryCache.deleteMany({ userId, key: 'formUsed' }).catch(() => {});
  return { ok: true, changeId, recordsChanged: expectRecords };
}

// ── Undo ─────────────────────────────────────────────────────────────────────

const getPath = (d: any, path: string) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), d);

/** rename.ts has checked undoBlocked already. */
export async function undoItemChange(def: ListDef, userId: string, ch: any):
  Promise<{ ok: true; changeId: string; recordsChanged: number; sheetNeeded: boolean } | Fail> {
  const model = def.model();
  const p = ch.extra.plan as ItemPlan;
  const hits = (ch.extra.hits ?? []) as ItemHit[];

  // Records and plans must still hold what the change gave them.
  const check = async (coll: typeof Log | typeof LogPlan, list: ItemHit[]) => {
    if (!list.length) return 0;
    const docs = await (coll as any).find({ _id: { $in: list.map(h => h.id) }, userId }).lean() as any[];
    const byId = new Map(docs.map(d => [String(d._id), d]));
    return list.filter(h => { const d = byId.get(h.id); return !d || Object.entries(h.after).some(([k, v]) => !same(getPath(d, k), v)); }).length;
  };
  const recs = hits.filter(h => !h.plan), plans = hits.filter(h => h.plan);
  const changed = await check(Log, recs);
  if (changed) return fail(409, `Undo is no longer possible: ${n(changed)} of the ${plural(recs.length, 'record')} have changed since. Make the opposite change instead.`);
  // Plans that have since become records or changed are left as they are.
  const planGone = await check(LogPlan, plans);

  // The list must still look as the change left it.
  const fromMatch: Record<string, unknown> = { userId, ...(p.field ? { field: p.field } : {}), ...p.from };
  if (await model.exists(fromMatch)) return fail(409, `Undo is no longer possible: ${label(p.slug, p.from)} is in the list again.`);
  const toMatch: Record<string, unknown> = { userId, ...(p.field ? { field: p.field } : {}), ...p.to };
  if (!(await model.exists({ _id: p.action === 'merge' ? p.targetId : p.rowId, ...toMatch }))) {
    return fail(409, `Undo is no longer possible: ${label(p.slug, p.to)} has changed since. Make the opposite change instead.`);
  }

  const session = await mongoose.startSession();
  let newId = '';
  try {
    await session.withTransaction(async () => {
      if (p.action === 'merge') {
        // The row as it was, under its old id.
        await model.create([{ _id: p.rowId, userId, ...p.before }], { session });
      } else {
        await model.updateOne({ _id: p.rowId, userId }, { $set: p.from }, { session });
      }
      if (recs.length) await Log.bulkWrite(writes(recs, 'before', userId), { session });
      const keepPlans = planGone ? [] : plans;
      if (keepPlans.length) await LogPlan.bulkWrite(writes(keepPlans, 'before', userId), { session });
      const now = new Date();
      await MasterChange.updateOne({ _id: ch._id }, { $set: { undoneAt: now } }, { session });
      const [u] = await MasterChange.create([{
        userId, list: ch.list, kind: ch.kind, rowId: ch.rowId,
        before: ch.after, after: ch.before,
        recordsChanged: recs.length, recordIds: ch.recordIds,
        sheetSteps: NO_SHEET, sheetDone: true, sheetDoneAt: now,
        undoOf: ch._id,
        extra: { title: `Undo: ${ch.extra.title}` },
      }], { session });
      newId = String(u._id);
    });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, `Undo is no longer possible: ${label(p.slug, p.from)} is in the list again.`);
    throw e;
  } finally {
    await session.endSession();
  }
  await EntryCache.deleteMany({ userId, key: 'formUsed' }).catch(() => {});
  return { ok: true, changeId: newId, recordsChanged: recs.length, sheetNeeded: false };
}
