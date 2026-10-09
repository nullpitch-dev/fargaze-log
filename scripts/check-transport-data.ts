// scripts/check-transport-data.ts
// Read-only survey of transport (이동) records, before designing the Transport widget.
// Run: npx tsx scripts/check-transport-data.ts > transport-check.txt

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

type Rec = {
  _id: unknown;
  activity?: { category?: string; name?: string; crossActivity?: string };
  start?: { datetime?: Date; timezoneOffset?: number; timezone?: string; year?: number; hour?: string };
  end?: { datetime?: Date; timezoneOffset?: number; timezone?: string; hour?: string };
  duration?: { totalSeconds?: number };
  location?: { activity?: string };
  transport?: { from?: string; to?: string; purpose?: string; method?: string; returnType?: string };
};

// The lists Hyoje gave — anything else found in the data is flagged.
const KNOWN = {
  purpose: ['식음', '출근', '귀가', '미팅', '픽드랍', '구매', '놀러', '여행', '숙박', '출장', '기타'],
  method: ['운전', '통근버스', '도보', '택시/카풀', '대중교통', '통근버스/대중교통', '기차', '비행기', '타인차량', '대리'],
  returnType: ['근무 후 귀가', '업무회식 후 귀가', '친목모임 후 귀가', '퇴근길 식사 후 귀가', '퇴근길 볼일 후 귀가',
               '가족외출 후 귀가', '평시외출 후 귀가', '픽드랍 후 귀가', '경조사 후 귀가'],
};

const s = (v: unknown) => (v ?? '').toString().trim();
// True instant: stored datetime is the naive local wall clock; offset is in hours.
const instant = (dt?: Date, off?: number) => (dt ? dt.getTime() - (off ?? 0) * 3600_000 : null);
const fmtLocal = (dt?: Date) => (dt ? dt.toISOString().slice(0, 16).replace('T', ' ') : '?');

function tally(values: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

function printTally(title: string, values: string[], known?: string[], limit = 1000) {
  const t = tally(values);
  console.log(`\n── ${title}  (${t.length} distinct)`);
  for (const [v, n] of t.slice(0, limit)) {
    const flag = known && v !== '(empty)' && !known.includes(v) ? '   ⚠ not in your list' : '';
    console.log(`  ${String(n).padStart(6)}  ${v}${flag}`);
  }
  if (t.length > limit) console.log(`  … ${t.length - limit} more`);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection('log');
  const userId = 'hyoje';
  const proj = { activity: 1, start: 1, end: 1, duration: 1, location: 1, transport: 1 };

  const recs = (await col.find({ userId, 'activity.category': '이동' }, { projection: proj })
    .sort({ 'start.datetime': 1 }).toArray()) as unknown as Rec[];
  recs.sort((a, b) => (instant(a.start?.datetime, a.start?.timezoneOffset) ?? 0)
                    - (instant(b.start?.datetime, b.start?.timezoneOffset) ?? 0));

  console.log(`이동 records: ${recs.length}`);

  // ── 1. Transport fields used outside 이동
  const outside = (await col.find({
    userId, 'activity.category': { $ne: '이동' },
    $or: ['from', 'to', 'purpose', 'method', 'returnType'].map(f => ({ [`transport.${f}`]: { $nin: [null, ''] } })),
  }, { projection: { activity: 1 } }).toArray()) as unknown as Rec[];
  printTally('1. Records OUTSIDE 이동 that have transport fields (by category / name)',
    outside.map(r => `${s(r.activity?.category)} / ${s(r.activity?.name)}`));

  // ── 2. Activity names within 이동
  printTally('2. activity.name within 이동', recs.map(r => s(r.activity?.name) || '(empty)'));

  // ── 3. Fill rate per year
  console.log('\n── 3. Fill rate per year (% of 이동 records with the field filled)');
  console.log('  year     n   from    to  purp  meth  retT  place  end  dur');
  const years = [...new Set(recs.map(r => r.start?.year ?? 0))].sort();
  const pct = (list: Rec[], f: (r: Rec) => unknown) =>
    String(Math.round(100 * list.filter(r => s(f(r)) !== '' && s(f(r)) !== '0').length / (list.length || 1))).padStart(5);
  for (const y of years) {
    const l = recs.filter(r => (r.start?.year ?? 0) === y);
    console.log(`  ${y} ${String(l.length).padStart(5)} ${pct(l, r => r.transport?.from)} ${pct(l, r => r.transport?.to)}`
      + ` ${pct(l, r => r.transport?.purpose)} ${pct(l, r => r.transport?.method)} ${pct(l, r => r.transport?.returnType)}`
      + ` ${pct(l, r => r.location?.activity)}  ${pct(l, r => r.end?.datetime)} ${pct(l, r => r.duration?.totalSeconds)}`);
  }

  // ── 4–6. Value lists
  printTally('4. Purpose', recs.map(r => s(r.transport?.purpose) || '(empty)'), KNOWN.purpose);
  printTally('5. Method', recs.map(r => s(r.transport?.method) || '(empty)'), KNOWN.method);
  printTally('6. ReturnType', recs.map(r => s(r.transport?.returnType) || '(empty)'), KNOWN.returnType);
  printTally('6b. Purpose × ReturnType (pairs)',
    recs.filter(r => s(r.transport?.returnType)).map(r => `${s(r.transport?.purpose) || '(empty)'} × ${s(r.transport?.returnType)}`));

  // ── 7. Place (location.activity) — carries method hints such as 내차, 지하철, 통근버스
  printTally('7. location.activity (top 60)', recs.map(r => s(r.location?.activity) || '(empty)'), undefined, 60);
  printTally('7b. Method × location.activity (top 60)',
    recs.map(r => `${s(r.transport?.method) || '(empty)'} × ${s(r.location?.activity) || '(empty)'}`), undefined, 60);

  // ── 8. From / To names — what geocoding would need
  const fromTo = recs.flatMap(r => [s(r.transport?.from), s(r.transport?.to)]).filter(Boolean);
  printTally('8. From + To names combined (top 80)', fromTo, undefined, 80);
  printTally('8b. Routes From → To (top 40)',
    recs.filter(r => s(r.transport?.from) && s(r.transport?.to)).map(r => `${s(r.transport?.from)} → ${s(r.transport?.to)}`),
    undefined, 40);

  // ── 9. crossActivity on 귀가 records, by return type
  printTally('9. 귀가 records: ReturnType × crossActivity',
    recs.filter(r => s(r.transport?.purpose) === '귀가')
      .map(r => `${s(r.transport?.returnType) || '(empty)'} × ${s(r.activity?.crossActivity) || '(none)'}`));

  // ── 10. Durations
  const secs = recs.map(r => r.duration?.totalSeconds ?? null);
  const bad = recs.filter(r => (r.duration?.totalSeconds ?? 0) <= 0);
  const long = recs.filter(r => (r.duration?.totalSeconds ?? 0) > 6 * 3600);
  console.log(`\n── 10. Durations: missing/zero/negative ${bad.length}, over 6 h ${long.length}, `
    + `median ${Math.round(median(secs.filter((v): v is number => v !== null && v > 0)) / 60)} min`);
  for (const r of long.slice(0, 25)) {
    console.log(`  ${fmtLocal(r.start?.datetime)} ${s(r.start?.timezone)}  ${Math.round((r.duration!.totalSeconds!) / 60)} min  `
      + `${s(r.transport?.method)} | ${s(r.location?.activity)} | ${s(r.transport?.from)} → ${s(r.transport?.to)}`);
  }

  // ── 11. Consecutive legs — how to chain rows into journeys
  console.log('\n── 11. Gap between one 이동 record\'s end and the next 이동 record\'s start (only next records within 3 h)');
  const buckets = [[0, 0, '0 min (touching)'], [1, 5, '1–5 min'], [6, 15, '6–15 min'], [16, 30, '16–30 min'],
                   [31, 60, '31–60 min'], [61, 180, '61–180 min']] as const;
  const counts = buckets.map(() => ({ n: 0, match: 0, sameRet: 0 }));
  let overlaps = 0;
  const samples: string[] = [];
  for (let i = 1; i < recs.length; i++) {
    const a = recs[i - 1], b = recs[i];
    const aEnd = instant(a.end?.datetime, a.end?.timezoneOffset);
    const bStart = instant(b.start?.datetime, b.start?.timezoneOffset);
    if (aEnd === null || bStart === null) continue;
    const gap = Math.round((bStart - aEnd) / 60000);
    if (gap < 0) { overlaps++; continue; }
    const k = buckets.findIndex(([lo, hi]) => gap >= lo && gap <= hi);
    if (k < 0) continue;
    counts[k].n++;
    const linked = s(a.transport?.to) !== '' && s(a.transport?.to) === s(b.transport?.from);
    if (linked) counts[k].match++;
    if (s(a.transport?.purpose) === s(b.transport?.purpose)) counts[k].sameRet++;
    if (gap <= 15 && samples.length < 30) {
      samples.push(`  ${fmtLocal(a.start?.datetime)} gap ${String(gap).padStart(2)}m | `
        + `${s(a.transport?.from)}→${s(a.transport?.to)} [${s(a.transport?.method)}/${s(a.location?.activity)}] ${s(a.transport?.purpose)}`
        + `  ⇒  ${s(b.transport?.from)}→${s(b.transport?.to)} [${s(b.transport?.method)}/${s(b.location?.activity)}] ${s(b.transport?.purpose)}`);
    }
  }
  console.log('  gap            pairs   to=next.from   same purpose');
  buckets.forEach(([, , label], k) =>
    console.log(`  ${label.padEnd(16)} ${String(counts[k].n).padStart(5)}   ${String(counts[k].match).padStart(12)}   ${String(counts[k].sameRet).padStart(12)}`));
  console.log(`  overlapping (next starts before previous ends): ${overlaps}`);
  console.log('\n  Samples (gap ≤ 15 min):');
  samples.forEach(l => console.log(l));

  // ── 12. Multi-mode rows written in one record
  printTally('12. location.activity values containing "+" (one row, several modes)',
    recs.map(r => s(r.location?.activity)).filter(v => v.includes('+')), undefined, 40);

  await mongoose.disconnect();
}

function median(v: number[]): number {
  if (v.length === 0) return 0;
  const a = [...v].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
