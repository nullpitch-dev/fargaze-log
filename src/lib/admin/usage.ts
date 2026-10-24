// Counts how many records use each row of a master list, and finds values that
// records use but the list does not have (#67).
//
// Counts are records, not occurrences: a record that names the same ingredient
// twice, or the same zone at start and end, counts once for that row.

import Log from '@/models/Log';
import { type ListDef, type RowOut, type UsageSpec, rowKey } from './lists';

export interface Orphan { values: Record<string, string>; records: number }
export interface UsageResult { counted: boolean; used: Record<string, number>; orphans: Orphan[] }

async function idsByKey(userId: string, spec: UsageSpec): Promise<Map<string, Set<string>>> {
  const cols = Object.keys(spec.key);
  const paths = cols.map(c => spec.key[c]);
  const pipeline: any[] = [{ $match: { userId, [paths[0]]: { $exists: true, $nin: [null, ''] } } }];
  for (const u of spec.unwind ?? []) pipeline.push({ $unwind: '$' + u });
  pipeline.push({ $match: Object.fromEntries(paths.map(p => [p, { $exists: true, $nin: [null, ''] }])) });
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

export async function computeUsage(def: ListDef, userId: string, rows: RowOut[]): Promise<UsageResult> {
  if (!def.usage?.length) return { counted: false, used: {}, orphans: [] };

  const perRow = new Map<string, Set<string>>();
  const orphanMap = new Map<string, Orphan>();

  for (const spec of def.usage) {
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
    }

    for (const [k, ids] of found) {
      if (known.has(k)) continue;
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
  return { counted: true, used, orphans };
}
