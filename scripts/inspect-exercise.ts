/**
 * scripts/inspect-exercise.ts
 *
 * Read-only reconnaissance of exercise[] data. Writes nothing to MongoDB.
 * Purpose: establish the exercise vocabulary (items, units, amount scales,
 * duration coverage) before designing the #58 widget.
 *
 * Run: npx tsx scripts/inspect-exercise.ts
 */

import path from 'path';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const USER_ID = 'hyoje';
const TOP_ITEMS = 40;
const TOP_PAIRS = 40;

type ExerciseItem = {
  item?: string | null;
  amount?: unknown;
  unit?: string | null;
};

type LogDoc = {
  start?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
    hour?: string | null;
  };
  duration?: { totalSeconds?: number | null };
  activity?: {
    category?: string | null;
    name?: string | null;
    title?: string | null;
  };
  exercise?: ExerciseItem[];
};

/* ---------- small helpers ---------- */

const pad2 = (n: number) => String(n).padStart(2, '0');

const dayKey = (d: LogDoc) =>
  `${d.start?.year ?? '????'}-${pad2(Number(d.start?.month ?? 0))}-${pad2(
    Number(d.start?.day ?? 0)
  )}`;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function numStats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    min: s.length ? s[0] : NaN,
    p25: percentile(s, 0.25),
    med: percentile(s, 0.5),
    avg: s.length ? sum / s.length : NaN,
    p75: percentile(s, 0.75),
    max: s.length ? s[s.length - 1] : NaN,
  };
}

const f = (v: number, dp = 1) => (Number.isFinite(v) ? v.toFixed(dp) : '—');

function bump(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function sortedEntries(map: Map<string, number>) {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function head(title: string) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

function table(rows: string[][], headers: string[]) {
  const all = [headers, ...rows];
  const widths = headers.map((_, c) =>
    Math.max(...all.map((r) => (r[c] ?? '').length))
  );
  const line = (r: string[]) =>
    r.map((cell, c) => (cell ?? '').padEnd(widths[c])).join('  ');
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  rows.forEach((r) => console.log(line(r)));
}

/* ---------- main ---------- */

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (checked .env.local)');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('mongoose.connection.db is undefined');

  const docs = (await db
    .collection('log')
    .find(
      { userId: USER_ID, 'exercise.0': { $exists: true } },
      {
        projection: {
          _id: 0,
          'start.year': 1,
          'start.month': 1,
          'start.day': 1,
          'start.hour': 1,
          'duration.totalSeconds': 1,
          'activity.category': 1,
          'activity.name': 1,
          'activity.title': 1,
          exercise: 1,
        },
      }
    )
    .toArray()) as LogDoc[];

  /* ----- accumulators ----- */
  const itemCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const unitsPerItem = new Map<string, Set<string>>();
  const amountsByUnit = new Map<string, number[]>();
  const amountTypeCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const activityNameCounts = new Map<string, number>();
  const perYear = new Map<string, number>();
  const docsPerDay = new Map<string, number>();
  const daysWithItem = new Map<string, Set<string>>();

  let entryTotal = 0;
  let entriesNamed = 0;
  let entriesNoAmount = 0;
  let entriesNoUnit = 0;
  let entriesWithPlus = 0;
  const plusSamples: string[] = [];

  let docsWithDuration = 0;
  const durationsSec: number[] = [];

  const entriesPerDoc: number[] = [];

  for (const d of docs) {
    const key = dayKey(d);
    bump(docsPerDay, key);
    bump(perYear, String(d.start?.year ?? '????'));
    bump(categoryCounts, d.activity?.category ?? '(null)');
    bump(activityNameCounts, d.activity?.name ?? '(null)');

    const secs = d.duration?.totalSeconds;
    if (typeof secs === 'number' && Number.isFinite(secs) && secs > 0) {
      docsWithDuration += 1;
      durationsSec.push(secs);
    }

    const list = Array.isArray(d.exercise) ? d.exercise : [];
    const named = list.filter(
      (e) => typeof e?.item === 'string' && e.item.trim() !== ''
    );
    entriesPerDoc.push(named.length);

    for (const e of list) {
      entryTotal += 1;
      const item = typeof e?.item === 'string' ? e.item.trim() : '';
      if (!item) continue;
      entriesNamed += 1;

      if (item.includes('+')) {
        entriesWithPlus += 1;
        if (plusSamples.length < 10) plusSamples.push(item);
      }

      const unit =
        typeof e?.unit === 'string' && e.unit.trim() !== ''
          ? e.unit.trim()
          : '(none)';
      if (unit === '(none)') entriesNoUnit += 1;

      bump(itemCounts, item);
      bump(unitCounts, unit);
      bump(pairCounts, `${item} \u00d7 ${unit}`);

      if (!unitsPerItem.has(item)) unitsPerItem.set(item, new Set());
      unitsPerItem.get(item)!.add(unit);

      if (!daysWithItem.has(item)) daysWithItem.set(item, new Set());
      daysWithItem.get(item)!.add(key);

      bump(amountTypeCounts, e?.amount === null ? 'null' : typeof e?.amount);
      const amt =
        typeof e?.amount === 'number'
          ? e.amount
          : typeof e?.amount === 'string'
            ? parseFloat(e.amount)
            : NaN;
      if (Number.isFinite(amt)) {
        if (!amountsByUnit.has(unit)) amountsByUnit.set(unit, []);
        amountsByUnit.get(unit)!.push(amt);
      } else {
        entriesNoAmount += 1;
      }
    }
  }

  /* ----- 1. coverage ----- */
  head('1. COVERAGE');
  const years = sortedEntries(perYear).sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`Documents with exercise[]      : ${docs.length}`);
  console.log(`Exercise entries (raw)         : ${entryTotal}`);
  console.log(`Exercise entries with an item  : ${entriesNamed}`);
  console.log(`Distinct exercise days         : ${docsPerDay.size}`);
  console.log(`Distinct item names            : ${itemCounts.size}`);
  console.log(`Distinct units                 : ${unitCounts.size}`);
  console.log('');
  table(
    years.map(([y, n]) => [y, String(n)]),
    ['year', 'docs']
  );

  /* ----- 2. items ----- */
  head(`2. ITEMS (top ${TOP_ITEMS} of ${itemCounts.size})`);
  const items = sortedEntries(itemCounts);
  table(
    items.slice(0, TOP_ITEMS).map(([item, n]) => [
      item,
      String(n),
      String(daysWithItem.get(item)?.size ?? 0),
      [...(unitsPerItem.get(item) ?? [])].join(', '),
    ]),
    ['item', 'entries', 'days', 'units seen']
  );
  const tail = items.slice(TOP_ITEMS);
  if (tail.length) {
    const tailEntries = tail.reduce((a, [, n]) => a + n, 0);
    const once = tail.filter(([, n]) => n === 1).length;
    console.log(
      `\n... and ${tail.length} more items covering ${tailEntries} entries ` +
        `(${once} of them appear exactly once)`
    );
  }

  /* ----- 3. units ----- */
  head('3. UNITS');
  table(
    sortedEntries(unitCounts).map(([u, n]) => [u, String(n)]),
    ['unit', 'entries']
  );

  /* ----- 4. item x unit ----- */
  head(`4. ITEM \u00d7 UNIT PAIRS (top ${TOP_PAIRS} of ${pairCounts.size})`);
  table(
    sortedEntries(pairCounts)
      .slice(0, TOP_PAIRS)
      .map(([p, n]) => [p, String(n)]),
    ['item \u00d7 unit', 'entries']
  );

  const multiUnit = [...unitsPerItem.entries()].filter(([, s]) => s.size > 1);
  console.log(
    `\nItems logged under more than one unit: ${multiUnit.length} of ${unitsPerItem.size}`
  );
  if (multiUnit.length) {
    table(
      multiUnit
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 20)
        .map(([item, s]) => [item, String(s.size), [...s].join(', ')]),
      ['item', '#units', 'units']
    );
  }

  /* ----- 5. amounts ----- */
  head('5. AMOUNT SCALE PER UNIT');
  console.log('Stored types:');
  table(
    sortedEntries(amountTypeCounts).map(([t, n]) => [t, String(n)]),
    ['typeof amount', 'entries']
  );
  console.log(`\nEntries with an unparseable/absent amount: ${entriesNoAmount}`);
  console.log(`Entries with no unit                    : ${entriesNoUnit}\n`);
  table(
    sortedEntries(unitCounts).map(([u]) => {
      const s = numStats(amountsByUnit.get(u) ?? []);
      return [
        u,
        String(s.n),
        f(s.min),
        f(s.p25),
        f(s.med),
        f(s.avg),
        f(s.p75),
        f(s.max),
      ];
    }),
    ['unit', 'n', 'min', 'p25', 'med', 'avg', 'p75', 'max']
  );

  /* ----- 6. duration coverage ----- */
  head('6. DURATION COVERAGE (the one cross-item comparable measure)');
  const dstat = numStats(durationsSec.map((s) => s / 60));
  console.log(
    `Docs with a usable duration.totalSeconds: ${docsWithDuration} / ${docs.length}` +
      ` (${f((docsWithDuration / Math.max(docs.length, 1)) * 100)}%)`
  );
  console.log(
    `Minutes  min ${f(dstat.min)} | p25 ${f(dstat.p25)} | med ${f(dstat.med)}` +
      ` | avg ${f(dstat.avg)} | p75 ${f(dstat.p75)} | max ${f(dstat.max)}`
  );

  /* ----- 7. shape per day ----- */
  head('7. RECORDS PER DAY / ENTRIES PER RECORD');
  const perDayDist = new Map<string, number>();
  for (const n of docsPerDay.values()) bump(perDayDist, String(n));
  table(
    [...perDayDist.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => [k, String(v)]),
    ['exercise docs in a day', 'days']
  );
  const perDocDist = new Map<string, number>();
  for (const n of entriesPerDoc) bump(perDocDist, String(n));
  console.log('');
  table(
    [...perDocDist.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => [k, String(v)]),
    ['items in a record', 'records']
  );

  /* ----- 8. how exercise records are classified ----- */
  head('8. ACTIVITY CLASSIFICATION OF EXERCISE-BEARING RECORDS');
  table(
    sortedEntries(categoryCounts).map(([k, n]) => [k, String(n)]),
    ['activity.category', 'docs']
  );
  console.log('');
  table(
    sortedEntries(activityNameCounts)
      .slice(0, 20)
      .map(([k, n]) => [k, String(n)]),
    ['activity.name', 'docs']
  );

  /* ----- 9. integrity flags + samples ----- */
  head('9. FLAGS & SAMPLES');
  console.log(
    `Item names still containing '+' (plus-split should have removed these): ${entriesWithPlus}`
  );
  if (plusSamples.length) console.log(`  e.g. ${plusSamples.join(' | ')}`);
  console.log('\nMost recent 10 exercise records:');
  const recent = [...docs]
    .sort((a, b) => dayKey(b).localeCompare(dayKey(a)))
    .slice(0, 10);
  for (const d of recent) {
    const mins = d.duration?.totalSeconds
      ? `${Math.round(d.duration.totalSeconds / 60)}m`
      : '—';
    const items = (d.exercise ?? [])
      .map((e) => `${e?.item ?? '?'} ${String(e?.amount ?? '')}${e?.unit ?? ''}`.trim())
      .join(' / ');
    console.log(
      `  ${dayKey(d)}  ${(d.start?.hour ?? '').padEnd(6)} ${mins.padStart(5)}  ` +
        `[${d.activity?.name ?? '-'}] ${items}`
    );
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
