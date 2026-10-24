// Read-only (#67): every value that records use but a master list does not have,
// across all admin lists, with the years and (for small counts) the dates of the
// records, so each can be fixed in the right tab (2026 or ~2025).
// The admin pages show the same values in their amber box.
//
//   npx tsx --tsconfig tsconfig.json scripts/check-master-orphans.ts
//   → also written to myfiles/admin/orphans-YYYY-MM-DD.md

import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';
import { LISTS, toRow, rowKey, type ListDef, type UsageSpec } from '../src/lib/admin/lists';

const USER_ID = 'hyoje';
const SHOW_DATES = 10;   // list the dates when a value has this many records or fewer

interface Hit { values: Record<string, string>; field: string; years: Map<number, Set<string>>; dates: Set<string> }

const pad = (n: unknown) => String(n ?? '').padStart(2, '0');

async function orphansFor(def: ListDef): Promise<Hit[]> {
  const docs = await def.model().find({ userId: USER_ID, ...(def.filter ?? {}) }).lean();
  const rows = (docs as any[]).map(d => toRow(def, d));
  const hits = new Map<string, Hit>();

  for (const spec of def.usage ?? []) {
    const cols = Object.keys(spec.key);
    const paths = cols.map(c => spec.key[c]);
    const known = new Set(
      rows.filter(r => !spec.when || Object.entries(spec.when).every(([k, v]) => r.values[k] === v))
        .map(r => rowKey(r.values, cols)),
    );
    const pipeline: any[] = [{ $match: { userId: USER_ID, [paths[0]]: { $exists: true, $nin: [null, ''] } } }];
    for (const u of spec.unwind ?? []) pipeline.push({ $unwind: '$' + u });
    pipeline.push({ $match: Object.fromEntries(paths.map(p => [p, { $exists: true, $nin: [null, ''] }])) });
    pipeline.push({
      $group: {
        _id: { k: Object.fromEntries(cols.map((c, i) => [c, '$' + paths[i]])), id: '$_id' },
        y: { $first: '$start.year' }, m: { $first: '$start.month' }, d: { $first: '$start.day' },
      },
    });
    for (const g of await Log.aggregate(pipeline).allowDiskUse(true)) {
      const k = rowKey(g._id.k, cols);
      if (known.has(k)) continue;
      const values: Record<string, string> = { ...(spec.when ?? {}) };
      cols.forEach(c => { values[c] = String(g._id.k[c]); });
      const hk = JSON.stringify([values, paths]);
      const hit = hits.get(hk) ?? { values, field: paths.join(' + '), years: new Map(), dates: new Set() };
      const id = String(g._id.id);
      if (!hit.years.has(g.y)) hit.years.set(g.y, new Set());
      hit.years.get(g.y)!.add(id);
      hit.dates.add(`${g.y}-${pad(g.m)}-${pad(g.d)}`);
      hits.set(hk, hit);
    }
  }
  return [...hits.values()];
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  const out: string[] = [`# Values missing from master lists — ${new Date().toISOString().slice(0, 10)}`, ''];
  const say = (s = '') => { console.log(s); out.push(s); };
  let total = 0;

  for (const def of LISTS) {
    if (!def.usage?.length) continue;
    const hits = await orphansFor(def);
    if (!hits.length) continue;
    total += hits.length;
    say(`## ${def.title} (/admin/${def.slug}) — ${hits.length} value${hits.length === 1 ? '' : 's'}`);
    say();
    const order = def.columns.map(c => c.key);
    for (const h of hits.sort((a, b) => a.field.localeCompare(b.field))) {
      const keys = [...order.filter(k => k in h.values), ...Object.keys(h.values).filter(k => !order.includes(k))];
      const label = keys.map(k => h.values[k]).join(' › ');
      const n = [...h.years.values()].reduce((a, s) => a + s.size, 0);
      const years = [...h.years.entries()].sort((a, b) => a[0] - b[0]).map(([y, s]) => `${y}: ${s.size}`).join(', ');
      const tab = [...h.years.keys()].some(y => y >= 2026) ? ([...h.years.keys()].some(y => y < 2026) ? '2026 and ~2025' : '2026') : '~2025';
      say(`- **${label}** in \`${h.field}\` — ${n} record${n === 1 ? '' : 's'} (${years}) → tab ${tab}`);
      if (n <= SHOW_DATES) say(`  - dates: ${[...h.dates].sort().join(', ')}`);
    }
    say();
  }
  if (!total) say('None ✅ — every value used in records is in its list.');

  const dir = path.join(process.cwd(), 'myfiles', 'admin');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `orphans-${new Date().toISOString().slice(0, 10)}.md`);
  fs.writeFileSync(file, out.join('\n'));
  console.log(`\n→ ${path.relative(process.cwd(), file)}`);
}

main()
  .catch(e => { console.error('❌', e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
