// Counts how many records use each row of a master list, and finds values that
// records use but the list does not have (#67).
//
// Counts are records, not occurrences: a record that names the same ingredient
// twice, or the same zone at start and end, counts once for that row.
//
// Two ways to count (26 Oct: Atlas's free tier caps a $group at 100 MB and ignores
// allowDiskUse, and collecting record IDs per value broke on place points):
//   - by counting: lists whose specs open no arrays. One spec: records per value.
//     Several single-column specs (place points' Place / From / To, time zones'
//     start / end, the three nutrient levels): one pass that takes each record's
//     values from all of them as a set, so a record counts once per value.
//   - by record IDs: lists whose specs open arrays (ingredients, alcohol, bowel,
//     people). Their value counts are small, so this stays within the limit.
//
// viaFavorites (place points): a record that says 집 / 회사 / 사이트 / 내차 counts for
// the place that label meant at the record's moment (spec.at: start or end), the
// way Journeys resolves it (favoritePlace.ts, resolveFavoritePlace). A label at the
// head of "A - B" resolves too: "회사 - 회의실" → "<the real 회사> - 회의실".
//
// placeDetails (place points, #67.8): each record counts once under each point it
// uses — the longest name with a point (places/details.ts) — and "with details"
// counts the records that reached the point through a " - …" part.

import Log from '@/models/Log';
import FavoritePlace from '@/models/FavoritePlace';
import { type ListDef, type RowOut, type UsageSpec, rowKey } from './lists';
import { DETAIL_SEP, pointNameFor, splitHead } from '@/lib/places/details';

export interface Orphan { values: Record<string, string>; records: number }
export interface UsageResult {
  counted: boolean;
  used: Record<string, number>;
  /** Per row, records per labelled spec (Place · From · To); only lists whose specs have labels. */
  breakdown: Record<string, Record<string, number>>;
  orphans: Orphan[];
  /** placeDetails lists: per row, the records that reached it through " - …". */
  details?: Record<string, number>;
  /** placeDetails lists: per row, the names as logged under it ("A - B"), most used first. */
  detailNames?: Record<string, { name: string; records: number }[]>;
}

const filled = { $exists: true, $nin: [null, ''] };

type Resolve = ((spec: UsageSpec, path: string) => unknown) | null;

/** viaFavorites lists: an expression giving the field's value with 집 / 회사 … replaced
 *  by the place the label meant then; null when the list doesn't resolve labels. */
async function resolver(def: ListDef, userId: string): Promise<Resolve> {
  if (!def.viaFavorites) return null;
  const periods = await FavoritePlace.find({ userId }).select('label name from to').lean() as any[];
  if (!periods.length) return null;
  return (spec, path) => {
    const at = spec.at ?? 'start';
    // The label is the head of "A - B" (or the whole value); the detail is kept.
    const v = '$' + path;
    const isStr = { $eq: [{ $type: v }, 'string'] };
    const i = { $cond: [isStr, { $indexOfCP: [v, DETAIL_SEP] }, -1] };
    const head = { $cond: [{ $gte: [i, 0] }, { $substrCP: [v, 0, i] }, v] };
    const rest = { $cond: [{ $gte: [i, 0] }, { $substrCP: [v, i, { $strLenCP: v }] }, ''] };
    // True instant: the stored datetime is the naive local clock; the offset is in hours.
    // All-day records have no time: no moment, so their label stays as it is.
    const inst = { $cond: [
      { $eq: [{ $type: `$${at}.datetime` }, 'date'] },
      { $subtract: [`$${at}.datetime`, { $multiply: [{ $ifNull: [`$${at}.timezoneOffset`, 0] }, 3_600_000] }] },
      null,
    ] };
    return {
      $switch: {
        branches: periods.map(p => ({
          case: { $and: [
            { $eq: [head, p.label] },
            { $ne: [inst, null] },   // null sorts before every date, so check it first
            ...(p.from?.at ? [{ $gte: [inst, p.from.at] }] : []),
            ...(p.to?.at ? [{ $lte: [inst, p.to.at] }] : []),
          ] },
          then: { $concat: [p.name, rest] },
        })),
        default: '$' + path,
      },
    };
  };
}

/** value key → records, for one spec without arrays. */
async function countByKey(userId: string, spec: UsageSpec, res: Resolve): Promise<Map<string, number>> {
  const cols = Object.keys(spec.key);
  const paths = cols.map(c => spec.key[c]);
  const rows = await Log.aggregate([
    { $match: { userId, ...Object.fromEntries(paths.map(p => [p, filled])) } },
    { $group: { _id: Object.fromEntries(cols.map((c, i) => [c, res ? res(spec, paths[i]) : '$' + paths[i]])), n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((g: any) => [rowKey(g._id, cols), g.n]));
}

/** value → distinct records, across several single-column specs that share one column. */
async function countAcross(userId: string, specs: UsageSpec[], col: string, res: Resolve): Promise<Map<string, number>> {
  const paths = specs.map(s => s.key[col]);
  const rows = await Log.aggregate([
    { $match: { userId, $or: paths.map(p => ({ [p]: filled })) } },
    { $project: { _id: 0, v: { $setUnion: specs.map((s, i) => [res ? res(s, paths[i]) : '$' + paths[i]]) } } },
    { $unwind: '$v' },
    { $match: { v: { $nin: [null, ''] } } },
    { $group: { _id: '$v', n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((g: any) => [rowKey({ [col]: g._id }, [col]), g.n]));
}

/** value key → record IDs, for a spec that opens arrays. */
async function idsByKey(userId: string, spec: UsageSpec): Promise<Map<string, Set<string>>> {
  const cols = Object.keys(spec.key);
  const paths = cols.map(c => spec.key[c]);
  const pipeline: any[] = [{ $match: { userId, [paths[0]]: filled } }];
  for (const u of spec.unwind ?? []) pipeline.push({ $unwind: '$' + u });
  pipeline.push({ $match: Object.fromEntries(paths.map(p => [p, filled])) });
  pipeline.push({
    $group: {
      _id: Object.fromEntries(cols.map((c, i) => [c, '$' + paths[i]])),
      ids: { $addToSet: '$_id' },
    },
  });
  const out = new Map<string, Set<string>>();
  for (const g of await Log.aggregate(pipeline).allowDiskUse(true)) {
    out.set(rowKey(g._id, cols), new Set(g.ids.map(String)));
  }
  return out;
}

const matchesWhen = (row: RowOut, when?: Record<string, string>) =>
  !when || Object.entries(when).every(([k, v]) => row.values[k] === v);

/** The column all specs use, when every spec is one column, the same one, with no `when`. */
function sharedColumn(specs: UsageSpec[]): string | null {
  const cols = specs.map(s => Object.keys(s.key));
  if (specs.some(s => s.when) || cols.some(c => c.length !== 1)) return null;
  return cols.every(c => c[0] === cols[0][0]) ? cols[0][0] : null;
}

export async function computeUsage(def: ListDef, userId: string, rows: RowOut[]): Promise<UsageResult> {
  const specs = def.usage ?? [];
  if (!specs.length) return { counted: false, used: {}, breakdown: {}, orphans: [] };

  if (def.placeDetails) return byPlaceDetails(def, userId, rows, specs);
  const noArrays = specs.every(s => !s.unwind?.length);
  const shared = sharedColumn(specs);
  if (noArrays && (specs.length === 1 || shared)) return byCounting(def, userId, rows, specs, shared);
  return byIds(def, userId, rows, specs);
}

// ── By counting ──────────────────────────────────────────────────────────────

async function byCounting(def: ListDef, userId: string, rows: RowOut[], specs: UsageSpec[], shared: string | null): Promise<UsageResult> {
  const res = await resolver(def, userId);
  const perSpec = await Promise.all(specs.map(s => countByKey(userId, s, res)));
  const total = specs.length === 1 ? perSpec[0] : await countAcross(userId, specs, shared!, res);
  const cols = specs.length === 1 ? Object.keys(specs[0].key) : [shared!];

  const used: Record<string, number> = {};
  const breakdown: Record<string, Record<string, number>> = {};
  const known = new Set<string>();
  for (const r of rows) {
    const k = rowKey(r.values, cols);
    known.add(k);
    used[r._id] = total.get(k) ?? 0;
    specs.forEach((s, i) => {
      if (!s.label) return;
      const x = perSpec[i].get(k) ?? 0;
      if (x) (breakdown[r._id] ??= {})[s.label] = x;
    });
  }

  const orphans: Orphan[] = [];
  if (def.refuseUnknown !== false) {
    for (const [k, n] of total) {
      if (known.has(k)) continue;
      const parts = k.split('\u0001');
      orphans.push({ values: Object.fromEntries(cols.map((c, i) => [c, parts[i]])), records: n });
    }
    orphans.sort((a, b) => b.records - a.records);
  }
  return { counted: true, used, breakdown, orphans };
}

// ── Place details (#67.8) ────────────────────────────────────────────────────

/** Every spec is one `name` column with no arrays. One pass groups the records by
 *  their (resolved) value in each spec; the longest-name rule then runs here, so a
 *  record counts once per point even when Place says "A - B" and To says "A". */
async function byPlaceDetails(def: ListDef, userId: string, rows: RowOut[], specs: UsageSpec[]): Promise<UsageResult> {
  const res = await resolver(def, userId);
  const paths = specs.map(s => Object.values(s.key)[0]);
  const combos = await Log.aggregate([
    { $match: { userId, $or: paths.map(p => ({ [p]: filled })) } },
    { $group: { _id: Object.fromEntries(specs.map((s, i) => ['s' + i, res ? res(s, paths[i]) : '$' + paths[i]])), n: { $sum: 1 } } },
  ]).allowDiskUse(true) as { _id: Record<string, unknown>; n: number }[];

  const idOf = new Map(rows.map(r => [String(r.values.name ?? ''), r._id]));
  const memo = new Map<string, string | null>();
  const pointOf = (v: string) => {
    if (!memo.has(v)) memo.set(v, pointNameFor(v, n => idOf.has(n)));
    return memo.get(v)!;
  };

  const used: Record<string, number> = {};
  const details: Record<string, number> = {};
  const names: Record<string, Map<string, number>> = {};
  const breakdown: Record<string, Record<string, number>> = {};
  for (const { _id, n } of combos) {
    const perPoint = new Map<string, { labels: Set<string>; detail: boolean; names: Set<string> }>();
    specs.forEach((s, i) => {
      const v = _id['s' + i];
      if (typeof v !== 'string' || !v) return;
      const p = pointOf(v);
      if (!p) return;
      const e = perPoint.get(p) ?? { labels: new Set<string>(), detail: false, names: new Set<string>() };
      if (s.label) e.labels.add(s.label);
      if (v !== p) { e.detail = true; e.names.add(v); }
      perPoint.set(p, e);
    });
    for (const [p, e] of perPoint) {
      const id = idOf.get(p)!;
      used[id] = (used[id] ?? 0) + n;
      if (e.detail) details[id] = (details[id] ?? 0) + n;
      for (const v of e.names) (names[id] ??= new Map()).set(v, (names[id].get(v) ?? 0) + n);
      for (const l of e.labels) (breakdown[id] ??= {})[l] = (breakdown[id]?.[l] ?? 0) + n;
    }
  }
  for (const r of rows) used[r._id] ??= 0;
  // Names without a point are normal here (refuseUnknown false): no orphans.
  const detailNames = Object.fromEntries(Object.entries(names).map(([id, m]) => [id,
    [...m].map(([name, records]) => ({ name, records })).sort((a, b) => b.records - a.records || a.name.localeCompare(b.name))]));
  return { counted: true, used, breakdown, orphans: [], details, detailNames };
}

// ── Missing place points (7 Nov 2026) ─────────────────────────────────────────

export interface MissingPoint {
  /** The name a point would go on: the part before the first " - " (listed under A). */
  name: string;
  /** Records using it, each once; by field (Place / From / To). */
  records: number;
  byField: Record<string, number>;
  /** Latest local start date, YYYY-MM-DD. */
  last: string;
  /** The names as logged with a detail ("A - B"), most used first. */
  details: { name: string; records: number }[];
  /** Records that say A itself (no detail). */
  exact: number;
}

/** Names in Place / From / To with no point (longest-name rule, labels resolved) in
 *  records starting on or after `fromYmd` (YYYYMMDD; null = all). Bare favourite
 *  labels (an all-day record, or no period covering it) are left out: they need a
 *  favourite period, not a point. Excluded names are split off by the route. */
export async function missingPoints(def: ListDef, userId: string, fromYmd: number | null): Promise<MissingPoint[]> {
  const specs = def.usage ?? [];
  const res = await resolver(def, userId);
  const paths = specs.map(s => Object.values(s.key)[0]);
  const ymd = { $add: [{ $multiply: ['$start.year', 10000] }, { $multiply: ['$start.month', 100] }, '$start.day'] };
  const [combos, points, labels] = await Promise.all([
    Log.aggregate([
      { $match: { userId, $or: paths.map(p => ({ [p]: filled })), ...(fromYmd ? { $expr: { $gte: [ymd, fromYmd] } } : {}) } },
      { $group: {
        _id: Object.fromEntries(specs.map((s, i) => ['s' + i, res ? res(s, paths[i]) : '$' + paths[i]])),
        n: { $sum: 1 }, last: { $max: ymd },
      } },
    ]).allowDiskUse(true) as Promise<{ _id: Record<string, unknown>; n: number; last: number }[]>,
    def.model().find({ userId }).select('name').lean() as Promise<any[]>,
    FavoritePlace.distinct('label', { userId }) as Promise<string[]>,
  ]);
  const has = new Set(points.map(p => String(p.name)));
  const isLabel = new Set(labels.map(String));

  const out = new Map<string, MissingPoint & { detailMap: Map<string, number>; lastN: number }>();
  for (const { _id, n, last } of combos) {
    const perHead = new Map<string, { fields: Set<string>; details: Set<string>; exact: boolean }>();
    specs.forEach((s, i) => {
      const v = _id['s' + i];
      if (typeof v !== 'string' || !v || isLabel.has(v)) return;
      if (pointNameFor(v, x => has.has(x))) return;
      const { head, rest } = splitHead(v);
      const e = perHead.get(head) ?? { fields: new Set<string>(), details: new Set<string>(), exact: false };
      e.fields.add(s.label ?? 'Place');
      if (rest) e.details.add(v); else e.exact = true;
      perHead.set(head, e);
    });
    for (const [head, e] of perHead) {
      const m = out.get(head) ?? { name: head, records: 0, byField: {} as Record<string, number>, last: '', details: [], exact: 0, detailMap: new Map<string, number>(), lastN: 0 };
      m.records += n;
      if (e.exact) m.exact += n;
      for (const f of e.fields) m.byField[f] = (m.byField[f] ?? 0) + n;
      for (const d of e.details) m.detailMap.set(d, (m.detailMap.get(d) ?? 0) + n);
      m.lastN = Math.max(m.lastN, last ?? 0);
      out.set(head, m);
    }
  }
  return [...out.values()]
    .map(({ detailMap, lastN, ...m }) => ({
      ...m,
      last: lastN ? `${String(lastN).slice(0, 4)}-${String(lastN).slice(4, 6)}-${String(lastN).slice(6, 8)}` : '',
      details: [...detailMap].map(([name, records]) => ({ name, records })).sort((a, b) => b.records - a.records || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.records - a.records || b.last.localeCompare(a.last) || a.name.localeCompare(b.name, 'ko'));
}

// ── By record IDs ────────────────────────────────────────────────────────────

async function byIds(def: ListDef, userId: string, rows: RowOut[], specs: UsageSpec[]): Promise<UsageResult> {
  const perRow = new Map<string, Set<string>>();
  const orphanMap = new Map<string, Orphan>();
  const breakdown: Record<string, Record<string, number>> = {};

  for (const spec of specs) {
    const cols = Object.keys(spec.key);
    const found = await idsByKey(userId, spec);
    const eligible = rows.filter(r => matchesWhen(r, spec.when));
    const known = new Set<string>();

    for (const r of eligible) {
      const k = rowKey(r.values, cols);
      known.add(k);
      const ids = found.get(k);
      if (!ids) continue;
      const set = perRow.get(r._id) ?? new Set<string>();
      ids.forEach(id => set.add(id));
      perRow.set(r._id, set);
      if (spec.label) (breakdown[r._id] ??= {})[spec.label] = ids.size;
    }

    for (const [k, ids] of found) {
      if (known.has(k) || def.refuseUnknown === false) continue;
      const parts = k.split('\u0001');
      const values: Record<string, string> = { ...(spec.when ?? {}) };
      cols.forEach((c, i) => { values[c] = parts[i]; });
      const ok = JSON.stringify(values);
      const prev = orphanMap.get(ok);
      orphanMap.set(ok, { values, records: (prev?.records ?? 0) + ids.size });
    }
  }

  const used: Record<string, number> = {};
  for (const r of rows) used[r._id] = perRow.get(r._id)?.size ?? 0;
  const orphans = [...orphanMap.values()].sort((a, b) => b.records - a.records);
  return { counted: true, used, breakdown, orphans };
}
