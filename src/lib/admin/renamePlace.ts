// Rename and merge for place points, with past records following (26 Oct 2026).
//
// Agreed with Hyoje: the same behaviour as activities (rename.ts).
//   - Changing a name to a new one renames it (the point stays). Changing it to the
//     name of another row merges it into that row: that row's point and note win,
//     and the old row is deleted.
//   - Records follow where the name is written as it is: location.activity (sheet
//     column AA), transport.from (BE) and transport.to (BF). 집 / 회사 / 사이트 / 내차
//     are resolved at read time; the favourite-place periods that name this place
//     follow instead, so the labels keep resolving to a place that has a point.
//   - The name changes on its own: a change that also moves the point or edits the
//     note is refused (save one, then the other).
//   - Preview first; one transaction; Undo until the next migration (a merge only
//     before it is ticked), records matched by the IDs kept per field.

import mongoose from 'mongoose';
import Log from '@/models/Log';
import MasterChange from '@/models/MasterChange';
import FavoritePlace from '@/models/FavoritePlace';
import { type ListDef, toRow } from './lists';
import { parseCoordsText } from './write';

export const PLACE_SLUG = 'place-coord';

const FIELDS = [
  { key: 'activity', path: 'location.activity', col: 'AA', label: 'Place' },
  { key: 'from', path: 'transport.from', col: 'BE', label: 'From' },
  { key: 'to', path: 'transport.to', col: 'BF', label: 'To' },
] as const;
type FieldKey = (typeof FIELDS)[number]['key'];

export interface PlacePlan {
  mode: 'row';
  place: true;
  action: 'rename' | 'merge';
  rowId: string;
  targetId: string | null;
  from: { key: string };
  to: { key: string };
  /** The old row as it was, so Undo can put a merged row back. */
  fromDoc: { lat: number; lng: number; note: string; source: string };
}

export interface PlaceCounts {
  total: number; y2026: number; older: number; first: number | null; last: number | null;
  byField: Record<FieldKey, { y2026: number; older: number }>;
  favorites: number;
}

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, one: string, many = one + 's') => `${n(x)} ${x === 1 ? one : many}`;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// ── Plan and counts ──────────────────────────────────────────────────────────

async function makePlan(def: ListDef, userId: string, id: string, values: Record<string, unknown>): Promise<PlacePlan | Fail> {
  const model = def.model();
  const row = await model.findOne({ _id: id, userId }).lean() as any;
  if (!row) return fail(404, 'This row no longer exists. Reload the page.');
  const fromKey = String(row.name);
  const toKey = str(values.name);
  if (!toKey) return fail(400, 'Place is required.');
  if (toKey === fromKey) return fail(400, 'Nothing changed.');

  // The name changes on its own.
  const p = typeof values.coords === 'string' ? parseCoordsText(values.coords) : null;
  const pointMoved = !p || p.lat !== row.lat || p.lng !== row.lng;
  const noteChanged = str(values.note) !== str(row.note);
  if (pointMoved || noteChanged) {
    return fail(400, `Change the name on its own: put the ${pointMoved ? 'point' : 'note'} back, save the new name, then edit the ${pointMoved ? 'point' : 'note'}.`);
  }

  const target = await model.findOne({ userId, name: toKey, _id: { $ne: row._id } }).lean() as any;
  return {
    mode: 'row', place: true,
    action: target ? 'merge' : 'rename',
    rowId: String(row._id),
    targetId: target ? String(target._id) : null,
    from: { key: fromKey }, to: { key: toKey },
    fromDoc: { lat: row.lat, lng: row.lng, note: row.note ?? '', source: row.source ?? 'manual' },
  };
}

const anyField = (userId: string, name: string) => ({ userId, $or: FIELDS.map(f => ({ [f.path]: name })) });

async function countRecords(userId: string, name: string): Promise<PlaceCounts> {
  const byYear = await Log.aggregate([
    { $match: anyField(userId, name) },
    { $group: { _id: '$start.year', n: { $sum: 1 } } },
  ]) as { _id: number | null; n: number }[];
  const years = byYear.map(y => y._id).filter((y): y is number => typeof y === 'number');
  const sum = (pred: (y: number | null) => boolean) => byYear.filter(y => pred(y._id)).reduce((a, y) => a + y.n, 0);

  const byField = {} as PlaceCounts['byField'];
  for (const f of FIELDS) {
    const g = await Log.aggregate([
      { $match: { userId, [f.path]: name } },
      { $group: { _id: { $eq: ['$start.year', 2026] }, n: { $sum: 1 } } },
    ]) as { _id: boolean; n: number }[];
    byField[f.key] = { y2026: g.find(x => x._id)?.n ?? 0, older: g.find(x => !x._id)?.n ?? 0 };
  }
  return {
    total: sum(() => true), y2026: sum(y => y === 2026), older: sum(y => y !== 2026),
    first: years.length ? Math.min(...years) : null, last: years.length ? Math.max(...years) : null,
    byField,
    favorites: await FavoritePlace.countDocuments({ userId, name }),
  };
}

// ── Words ────────────────────────────────────────────────────────────────────

const titleOf = (p: PlacePlan) =>
  p.action === 'rename' ? `Rename the place ${p.from.key} → ${p.to.key}` : `Merge the place ${p.from.key} into ${p.to.key}`;

const range = (tab: string, col: string, row: number) => `'${tab}'!${col}${row}:${col}`;
const expect = (x: number) => (x === 0 ? 'expect none' : `expect ${n(x)}`);

/** Sheet steps for a rename or merge (the reverse of a rename is a rename with the sides swapped). */
export function placeSteps(p: Pick<PlacePlan, 'action' | 'from' | 'to'>, c: PlaceCounts): string[] {
  const { from, to } = p;
  const steps: string[] = [];
  steps.push(p.action === 'merge'
    ? `PlaceCoord tab: delete the row ${from.key} (${to.key} stays).`
    : `PlaceCoord tab: change the name in column A from ${from.key} to ${to.key}.`);
  if (c.favorites) {
    steps.push(`FavoritePlace tab: find and replace ${from.key} → ${to.key} in column B (range ${range('FavoritePlace', 'B', 2)}, “Match case” and “Match entire cell contents”; ${expect(c.favorites)}).`);
  }
  steps.push(`Find and replace ${from.key} → ${to.key} in columns AA (place), BE (from) and BF (to), one range at a time. Tick “Match case” and “Match entire cell contents”, leave “Also search within formulas” off and choose “Specific range”. Sheets says how many it replaced; the 2026 tab can show more if rows were added since the last migration.`);
  for (const [tab, key] of [['2026', 'y2026'], ['~2025', 'older']] as const) {
    steps.push(`   Archive file, tab ${tab}: ${FIELDS.map(f => `${range(tab, f.col, 4)} (${expect(c.byField[f.key][key])})`).join(', ')}.`);
  }
  steps.push(`   Active file, tabs Active, History and Future: columns AA, BE and BF from row 3 in each, e.g. ${FIELDS.map(f => range('Active', f.col, 3)).join(', ')} (any number, including none).`);
  return steps;
}

// ── Preview ──────────────────────────────────────────────────────────────────

export interface PlacePreview {
  title: string; counts: PlaceCounts; rows: number; warnings: string[]; sheetSteps: string[]; plan: PlacePlan;
}

export async function previewPlaceRename(def: ListDef, userId: string, id: string, values: Record<string, unknown>):
  Promise<{ ok: true; preview: PlacePreview } | Fail> {
  const p = await makePlan(def, userId, id, values);
  if ('ok' in p) return p;
  const counts = await countRecords(userId, p.from.key);

  const warnings: string[] = [];
  const parts = FIELDS.map(f => [f.label, counts.byField[f.key].y2026 + counts.byField[f.key].older] as const).filter(([, x]) => x);
  if (parts.length > 1) warnings.push(`Where it is written: ${parts.map(([l, x]) => `${l} ${n(x)}`).join(' · ')} (a record can have it in more than one place).`);
  if (p.action === 'merge') {
    const target = await def.model().findOne({ _id: p.targetId, userId }).lean() as any;
    const d = target ? km(p.fromDoc, target) : 0;
    warnings.push(`${p.from.key} is deleted from the list; its records take ${p.to.key}, and ${p.to.key}’s point stays${d >= 0.05 ? ` (the two points are ${d < 10 ? d.toFixed(1) : Math.round(d)} km apart)` : ''}.`);
  }
  if (counts.favorites) {
    const fav = await FavoritePlace.find({ userId, name: p.from.key }).select('label').lean() as any[];
    const labels = [...new Set(fav.map(x => x.label))].join(', ');
    warnings.push(`${p.from.key} is the place for ${labels} in ${plural(counts.favorites, 'favourite-place period')}; ${counts.favorites === 1 ? 'it takes' : 'they take'} ${p.to.key} too. Records that say ${labels} keep saying it and follow with the period${counts.favorites === 1 ? '' : 's'} (they are not in the count above).`);
  }
  return { ok: true, preview: { title: titleOf(p), counts, rows: 1, warnings, sheetSteps: placeSteps(p, counts), plan: p } };
}

// ── Apply ────────────────────────────────────────────────────────────────────

export async function applyPlaceRename(def: ListDef, userId: string, id: string, values: Record<string, unknown>, expectRecords: number):
  Promise<{ ok: true; changeId: string; recordsChanged: number } | Fail> {
  const pv = await previewPlaceRename(def, userId, id, values);
  if (!pv.ok) return pv;
  const { plan: p, counts } = pv.preview;
  if (counts.total !== expectRecords) {
    return fail(409, `The records changed since the preview (${n(expectRecords)} then, ${n(counts.total)} now). Preview again.`);
  }
  const model = def.model();
  const session = await mongoose.startSession();
  let changeId = '';
  let changed = 0;
  try {
    await session.withTransaction(async () => {
      const all = (await Log.find(anyField(userId, p.from.key)).select('_id').session(session).lean() as any[]).map(d => d._id);
      if (all.length !== expectRecords) throw new Error('STALE');
      const fieldIds = {} as Record<FieldKey, mongoose.Types.ObjectId[]>;
      for (const f of FIELDS) {
        fieldIds[f.key] = (await Log.find({ userId, [f.path]: p.from.key }).select('_id').session(session).lean() as any[]).map(d => d._id);
      }
      const favIds = (await FavoritePlace.find({ userId, name: p.from.key }).select('_id').session(session).lean() as any[]).map(d => d._id);

      const self = await model.findOne({ _id: p.rowId, userId }).session(session).lean() as any;
      if (!self) throw new Error('GONE');
      const before = toRow(def, self).values;
      if (p.action === 'merge') await model.deleteOne({ _id: self._id }, { session });
      else await model.updateOne({ _id: self._id }, { $set: { name: p.to.key } }, { session });

      for (const f of FIELDS) {
        if (fieldIds[f.key].length) await Log.updateMany({ _id: { $in: fieldIds[f.key] } }, { $set: { [f.path]: p.to.key } }, { session });
      }
      if (favIds.length) await FavoritePlace.updateMany({ _id: { $in: favIds } }, { $set: { name: p.to.key } }, { session });

      const [ch] = await MasterChange.create([{
        userId, list: def.slug, kind: p.action === 'merge' ? 'merge' : 'rename', rowId: p.rowId,
        before, after: { ...before, name: p.to.key },
        recordsChanged: all.length, recordIds: all,
        sheetSteps: pv.preview.sheetSteps,
        extra: { title: pv.preview.title, plan: p, counts, fieldIds, favIds },
      }], { session });
      changeId = String(ch._id);
      changed = all.length;
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === 'STALE') return fail(409, 'The records changed since the preview. Preview again.');
    if (msg === 'GONE') return fail(404, 'This row no longer exists. Reload the page.');
    if (e?.code === 11000) return fail(409, 'Another row already has that name. Reload the page and try again.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true, changeId, recordsChanged: changed };
}

// ── Undo ─────────────────────────────────────────────────────────────────────

/** Undoes a place rename or merge. undoBlocked (rename.ts) has already been checked. */
export async function undoPlaceChange(def: ListDef, userId: string, ch: any):
  Promise<{ ok: true; changeId: string; recordsChanged: number; sheetNeeded: boolean } | Fail> {
  const model = def.model();
  const p = ch.extra.plan as PlacePlan;
  const fieldIds = (ch.extra.fieldIds ?? {}) as Record<FieldKey, mongoose.Types.ObjectId[]>;
  const favIds = (ch.extra.favIds ?? []) as mongoose.Types.ObjectId[];
  const all = ch.recordIds as mongoose.Types.ObjectId[];

  // The records must still hold the new name where the change put it.
  for (const f of FIELDS) {
    const ids = fieldIds[f.key] ?? [];
    if (!ids.length) continue;
    const still = await Log.countDocuments({ _id: { $in: ids }, userId, [f.path]: p.to.key });
    if (still !== ids.length) {
      const gone = ids.length - still;
      return fail(409, `Undo is no longer possible: ${plural(gone, 'record')} ${gone === 1 ? 'has' : 'have'} been reloaded by a migration or changed since. Make the opposite change instead.`);
    }
  }
  if (favIds.length && await FavoritePlace.countDocuments({ _id: { $in: favIds }, userId, name: p.to.key }) !== favIds.length) {
    return fail(409, 'Undo is no longer possible: a favourite-place period has changed since. Make the opposite change instead.');
  }
  // The list must still look as the change left it.
  if (await model.exists({ userId, name: p.from.key })) return fail(409, `Undo is no longer possible: ${p.from.key} is in the list again.`);
  if (p.action === 'merge') {
    if (!(await model.exists({ _id: p.targetId, userId }))) return fail(409, `Undo is no longer possible: ${p.to.key} is no longer in the list.`);
  } else {
    const self = await model.findOne({ _id: p.rowId, userId }).lean() as any;
    if (!self || self.name !== p.to.key) return fail(409, `Undo is no longer possible: the row ${p.to.key} has changed since. Make the opposite change instead.`);
  }

  const sheetNeeded = !!ch.sheetDone;
  // Only a rename reaches here once ticked (undoBlocked), so its reverse is a rename.
  const sheetSteps = sheetNeeded
    ? placeSteps({ action: 'rename', from: p.to, to: p.from }, ch.extra.counts as PlaceCounts)
    : ['Nothing to do in the sheet: this was undone before it was repeated there.'];

  const session = await mongoose.startSession();
  let newId = '';
  try {
    await session.withTransaction(async () => {
      if (p.action === 'merge') {
        await model.create([{ _id: p.rowId, userId, name: p.from.key, ...p.fromDoc }], { session });
      } else {
        await model.updateOne({ _id: p.rowId, userId }, { $set: { name: p.from.key } }, { session });
      }
      for (const f of FIELDS) {
        const ids = fieldIds[f.key] ?? [];
        if (ids.length) await Log.updateMany({ _id: { $in: ids } }, { $set: { [f.path]: p.from.key } }, { session });
      }
      if (favIds.length) await FavoritePlace.updateMany({ _id: { $in: favIds } }, { $set: { name: p.from.key } }, { session });

      const now = new Date();
      await MasterChange.updateOne({ _id: ch._id }, {
        $set: { undoneAt: now, ...(sheetNeeded ? {} : { sheetDone: true, sheetDoneAt: now }) },
      }, { session });
      const [u] = await MasterChange.create([{
        userId, list: ch.list, kind: ch.kind, rowId: ch.rowId,
        before: ch.after, after: ch.before,
        recordsChanged: all.length, recordIds: all,
        sheetSteps, sheetDone: !sheetNeeded, sheetDoneAt: sheetNeeded ? null : now,
        undoOf: ch._id,
        extra: { title: `Undo: ${ch.extra.title}` },
      }], { session });
      newId = String(u._id);
    });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, `Undo is no longer possible: ${p.from.key} is in the list again.`);
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true, changeId: newId, recordsChanged: all.length, sheetNeeded };
}
