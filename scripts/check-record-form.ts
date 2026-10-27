// Read-only check for the edit form (#70): does every record come back unchanged
// when it is opened in the form and saved without touching anything?
//
//   npx tsx --tsconfig tsconfig.json scripts/check-record-form.ts          5 examples per group
//   npx tsx --tsconfig tsconfig.json scripts/check-record-form.ts --all    every record
//
// For each record: fromRecord → buildRecord with the record as its base. Reports
// (1) records the form would refuse as they are, grouped by reason, (2) fields that
// would change although nothing was edited, grouped by field — both should be empty,
// or each explained, before the edit feature is used — and (3) old records that
// already break a rule (shown as a warning when edited, not a refusal). Writes nothing.

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import Log from '../src/models/Log';
import { fromRecord, buildRecord } from '../src/lib/records/form';
import { changeLines } from '../src/lib/records/sheetCells';
import { loadFormContext } from '../src/lib/records/edit';

const USER_ID = 'hyoje';
const SHOW = process.argv.includes('--all') ? Infinity : 5;
const SKIP = new Set(['_id', 'userId', 'createdAt', 'updatedAt', '__v']);
// The system calculates weekdays from the date (v4.24); counted on their own below.
const WEEKDAY = new Set(['start.weekday', 'end.weekday']);

const norm = (v: any): any => {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === 'object' && typeof v.toHexString === 'function') return v.toHexString();
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, norm(x)]));
  return v;
};

/** Leaf paths whose values differ; array indexes shown as []. An array entry's own
 *  _id (mongoose gives every list entry one) is left out: it carries no data. */
function diff(a: any, b: any, at = '', out: { path: string; a: unknown; b: unknown }[] = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const obj = (x: any) => x && typeof x === 'object';
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    a.forEach((x, i) => diff(x, b[i], `${at}[]`, out));
  } else if (obj(a) && obj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!at && SKIP.has(k)) continue;
      if (at.endsWith('[]') && k === '_id') continue;
      diff(a[k], b[k], at ? `${at}.${k}` : k, out);
    }
  } else {
    out.push({ path: at, a, b });
  }
  return out;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { autoIndex: false });
  console.log(`✅ Connected to MongoDB: ${mongoose.connection.db!.databaseName} — reading only\n`);
  const ctx = await loadFormContext(USER_ID);

  const refused = new Map<string, string[]>();
  const changed = new Map<string, string[]>();
  const warned = new Map<string, string[]>();
  const group = (m: string) => m.replace(/'[^']*'/g, "'…'");
  let n = 0, clean = 0, withLines = 0, weekdays = 0;
  const label = (d: any) => `${d.start?.year}-${String(d.start?.month).padStart(2, '0')}-${String(d.start?.day).padStart(2, '0')} ${d.start?.hour ?? 'all day'} · ${d.activity?.name ?? ''} · ${d._id}`;

  for await (const base of Log.find({ userId: USER_ID }).lean().cursor() as any) {
    n++;
    const b = buildRecord(fromRecord(base), base, ctx);
    for (const p of b.problems) refused.set(group(p), [...(refused.get(group(p)) ?? []), `${label(base)} — ${p}`]);
    for (const w of b.warnings) warned.set(group(w), [...(warned.get(group(w)) ?? []), `${label(base)} — ${w}`]);
    const all = diff(norm(base), norm(b.doc));
    const d = all.filter(x => !WEEKDAY.has(x.path));
    if (all.length > d.length) weekdays++;
    for (const x of d) changed.set(x.path, [...(changed.get(x.path) ?? []), `${label(base)}: ${JSON.stringify(x.a)} → ${JSON.stringify(x.b)}`]);
    if (changeLines(base, b.doc).length) withLines++;
    if (!b.problems.length && !d.length) clean++;
    if (n % 5000 === 0) console.log(`  … ${n} records`);
  }

  console.log(`\n${n} records: ${clean} come back exactly as they are.`);
  console.log(`${withLines} would show change lines although nothing was edited.`);
  console.log(`${weekdays} stored weekday${weekdays === 1 ? '' : 's'} differ from the date; the system recalculates them (0 after a full migration).\n`);
  const report = (title: string, m: Map<string, string[]>) => {
    if (!m.size) { console.log(`${title}: none ✅\n`); return; }
    console.log(`${title}:`);
    for (const [k, v] of [...m.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ✗ ${k} — ${v.length} record${v.length === 1 ? '' : 's'}`);
      v.slice(0, SHOW).forEach(x => console.log(`      ${x}`));
      if (v.length > SHOW) console.log(`      … and ${v.length - SHOW} more`);
    }
    console.log('');
  };
  report('Refused by the form as they are', refused);
  report('Fields that would change without an edit', changed);
  report('Old records that already break a rule (a warning when edited, not a refusal)', warned);
}

main()
  .catch(e => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
