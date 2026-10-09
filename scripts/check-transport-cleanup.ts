// scripts/check-transport-cleanup.ts
// Read-only. Lists transport rows to fix in the sheet, spelling-variant
// candidates to standardise, and previews journeys and companions.
// Run: npx tsx scripts/check-transport-cleanup.ts > transport-cleanup.txt

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { buildJourneys, legsFromDocs, Leg, HOME } from '../src/lib/insights/transport-journeys';

dotenv.config({ path: '.env.local' });

type Rec = {
  _id: { toString(): string };
  activity?: { category?: string; name?: string; crossActivity?: string };
  start?: { datetime?: Date; timezoneOffset?: number; timezone?: string };
  end?: { datetime?: Date; timezoneOffset?: number; timezone?: string };
  duration?: { totalSeconds?: number };
  location?: { activity?: string };
  transport?: { from?: string; to?: string; purpose?: string; method?: string; returnType?: string };
  people?: { method?: string; category?: string; target?: string }[];
};

const s = (v: unknown) => (v ?? '').toString().trim();
const at = (dt?: Date, off?: number) => (dt ? dt.getTime() - (off ?? 0) * 3600_000 : NaN);
const local = (dt?: Date) => (dt ? dt.toISOString().slice(0, 16).replace('T', ' ') : '????-??-?? ??:??');
const line = (r: Rec, extra = '') =>
  `  ${local(r.start?.datetime)} ${s(r.start?.timezone).padEnd(3)} | ${s(r.transport?.from)} → ${s(r.transport?.to)}`
  + ` | 목적 ${s(r.transport?.purpose) || '∅'} | 방법 ${s(r.transport?.method) || '∅'} | ${s(r.location?.activity) || '∅'}${extra}`;

function section(title: string, rows: string[]) {
  console.log(`\n── ${title}  (${rows.length})`);
  rows.forEach(r => console.log(r));
}

// ── Spelling variants ──────────────────────────────────────────────────────
// Same key after removing spaces/brackets/punctuation and lower-casing → certain.
// One character apart (names of 3+ chars) → probable. Reviewed by hand.
const norm = (v: string) => v.toLowerCase().replace(/[\s()\[\]\-.,·_/]/g, '');

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function variantGroups(counts: Map<string, number>): string[] {
  const names = [...counts.keys()];
  const parent = new Map(names.map(n => [n, n]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const join = (a: string, b: string) => parent.set(find(a), find(b));

  const byKey = new Map<string, string[]>();
  for (const n of names) byKey.set(norm(n), [...(byKey.get(norm(n)) ?? []), n]);
  for (const list of byKey.values()) list.slice(1).forEach(n => join(list[0], n));

  const keys = [...byKey.keys()].filter(k => k.length >= 3);
  for (let x = 0; x < keys.length; x++)
    for (let y = x + 1; y < keys.length; y++)
      if (lev1(keys[x], keys[y])) join(byKey.get(keys[x])![0], byKey.get(keys[y])![0]);

  const groups = new Map<string, string[]>();
  for (const n of names) groups.set(find(n), [...(groups.get(find(n)) ?? []), n]);
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => g.sort((a, b) => counts.get(b)! - counts.get(a)!))
    .sort((a, b) => counts.get(b[0])! - counts.get(a[0])!)
    .map(g => '  ' + g.map(n => `${n} (${counts.get(n)})`).join('  ·  '));
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const col = mongoose.connection.db!.collection('log');
  const userId = 'hyoje';

  const recs = (await col.find({ userId, 'activity.category': '이동' },
    { projection: { activity: 1, start: 1, end: 1, duration: 1, location: 1, transport: 1, people: 1 } })
    .toArray()) as unknown as Rec[];
  recs.sort((a, b) => at(a.start?.datetime, a.start?.timezoneOffset) - at(b.start?.datetime, b.start?.timezoneOffset));
  console.log(`이동 records: ${recs.length}`);
  console.log('Times are local clock times as written in the sheet.');

  // ════ PART A — rows to fix ═════════════════════════════════════════════════
  console.log('\n════════ PART A — rows to fix ════════');

  section('A1. No purpose', recs.filter(r => !s(r.transport?.purpose)).map(r => line(r)));
  section('A2. No method', recs.filter(r => !s(r.transport?.method)).map(r => line(r)));
  section('A3. No From or no To',
    recs.filter(r => !s(r.transport?.from) || !s(r.transport?.to)).map(r => line(r)));
  section('A4. Duration missing, zero or negative',
    recs.filter(r => (r.duration?.totalSeconds ?? 0) <= 0)
      .map(r => line(r, ` | ${local(r.end?.datetime)} ${s(r.end?.timezone)} end`)));
  section('A5. Over 6 hours, not a flight (check the end time)',
    recs.filter(r => (r.duration?.totalSeconds ?? 0) > 6 * 3600 && s(r.transport?.method) !== '비행기')
      .map(r => line(r, ` | ${Math.round(r.duration!.totalSeconds! / 60)} min`)));

  const overlaps: string[] = [];
  for (let i = 1; i < recs.length; i++) {
    const a = recs[i - 1], b = recs[i];
    const gap = (at(b.start?.datetime, b.start?.timezoneOffset) - at(a.end?.datetime, a.end?.timezoneOffset)) / 60000;
    if (gap < 0) overlaps.push(line(a, ` | ends ${local(a.end?.datetime)}`) + '\n' + line(b, `   ← starts ${Math.round(-gap)} min before the row above ends`) + '\n');
  }
  section('A6. Overlapping rows (next row starts before the previous one ends)', overlaps);

  section('A7. ReturnType on a row whose purpose is not 귀가',
    recs.filter(r => s(r.transport?.returnType) && s(r.transport?.purpose) !== '귀가')
      .map(r => line(r, ` | ${s(r.transport?.returnType)}`)));
  section('A8. ReturnType on a row that does not arrive at 집',
    recs.filter(r => s(r.transport?.returnType) && s(r.transport?.to) !== HOME)
      .map(r => line(r, ` | ${s(r.transport?.returnType)}`)));
  section('A9. 귀가 row arriving at 집 without ReturnType',
    recs.filter(r => s(r.transport?.purpose) === '귀가' && s(r.transport?.to) === HOME && !s(r.transport?.returnType))
      .map(r => line(r, ` | cross ${s(r.activity?.crossActivity) || '∅'}`)));

  section('A10. Method and Place disagree (e.g. 도보 × 자전거, 운전 × someone\'s car)',
    recs.filter(r => {
      const m = s(r.transport?.method), p = s(r.location?.activity);
      return (m === '도보' && p !== '도보' && p !== '')
        || (m === '운전' && /차$/.test(p.replace(/\s/g, '')) && !['내차', '민아차', '대차', '렌트카', '렌터카', '렌탈카'].includes(p.replace(/\s/g, '')));
    }).map(r => line(r)));

  // Rows outside 이동 that carry transport fields
  const outside = (await col.find({
    userId, 'activity.category': { $ne: '이동' },
    $or: ['from', 'to', 'purpose', 'method', 'returnType'].map(f => ({ [`transport.${f}`]: { $nin: [null, ''] } })),
  }, { projection: { activity: 1, start: 1, transport: 1, location: 1 } }).toArray()) as unknown as Rec[];
  section('A11. Rows outside 이동 with transport fields (fill or clear)',
    outside.map(r => line(r, ` | ${s(r.activity?.category)} / ${s(r.activity?.name)}`)));

  // ════ PART B — spelling variants ═══════════════════════════════════════════
  console.log('\n════════ PART B — spelling-variant candidates (most-used first; not all are real variants) ════════');
  const placeCounts = new Map<string, number>();
  for (const r of recs) for (const n of [s(r.transport?.from), s(r.transport?.to)])
    if (n) placeCounts.set(n, (placeCounts.get(n) ?? 0) + 1);
  section('B1. From / To names', variantGroups(placeCounts));

  const placeFieldCounts = new Map<string, number>();
  for (const r of recs) { const p = s(r.location?.activity); if (p) placeFieldCounts.set(p, (placeFieldCounts.get(p) ?? 0) + 1); }
  section('B2. Place (location.activity)', variantGroups(placeFieldCounts));

  // ════ PART C — journeys preview ════════════════════════════════════════════
  console.log('\n════════ PART C — journeys preview (30-min rule) ════════');
  const legs: Leg[] = legsFromDocs(recs);
  const journeys = buildJourneys(legs);
  const multi = journeys.filter(j => j.legs.length > 1);
  console.log(`  ${legs.length} legs → ${journeys.length} journeys (${multi.length} with 2+ legs; longest ${Math.max(...journeys.map(j => j.legs.length))} legs)`);
  const legHist = new Map<number, number>();
  for (const j of journeys) legHist.set(j.legs.length, (legHist.get(j.legs.length) ?? 0) + 1);
  console.log('  legs per journey: ' + [...legHist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join('  '));

  const home = journeys.filter(j => j.purpose === '귀가' && j.to === HOME);
  console.log(`  귀가 journeys ending at 집: ${home.length}, of which without ReturnType: ${home.filter(j => !j.returnType).length}`);
  const ends = new Map<string, number>();
  for (const j of journeys.filter(j => j.purpose === '귀가' && j.to !== HOME)) ends.set(j.to, (ends.get(j.to) ?? 0) + 1);
  console.log(`  귀가 journeys NOT ending at 집: ${[...ends.values()].reduce((a, b) => a + b, 0)} — top ends: `
    + [...ends].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '));

  console.log('\n  Sample multi-leg journeys:');
  for (const j of multi.filter((_, i) => i % Math.max(1, Math.floor(multi.length / 25)) === 0).slice(0, 25)) {
    console.log(`  ${local(j.startLocal)} ${j.durationMin}m ${j.purpose}${j.returnType ? '/' + j.returnType : ''} | `
      + j.legs.map(l => `${l.from}→${l.to}[${l.method}]`).join(' ⇒ ').replace(/\]⇒/g, '] ⇒'));
  }

  // ════ PART D — with whom ═══════════════════════════════════════════════════
  console.log('\n════════ PART D — with whom ════════');
  const withPeople = recs.filter(r => (r.people ?? []).length > 0);
  console.log(`  이동 rows with people: ${withPeople.length} of ${recs.length}`);
  const tally = (vals: string[]) => {
    const m = new Map<string, number>(); vals.forEach(v => m.set(v, (m.get(v) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  console.log('  people.method: ' + tally(withPeople.flatMap(r => r.people!.map(p => s(p.method) || '∅'))).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('  people.category: ' + tally(withPeople.flatMap(r => r.people!.map(p => s(p.category) || '∅'))).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('  top 30 people: ' + tally(withPeople.flatMap(r => r.people!.map(p => s(p.target)).filter(t => t && t !== '등'))).slice(0, 30).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('\n  Rows with people, by year:');
  const years = tally(withPeople.map(r => String(r.start?.datetime?.getUTCFullYear()))).sort();
  const totals = tally(recs.map(r => String(r.start?.datetime?.getUTCFullYear())));
  for (const [y, n] of years) console.log(`    ${y}: ${n} of ${totals.find(t => t[0] === y)?.[1]}`);
  console.log('\n  타인차량 rows without people (driver only in Place): '
    + recs.filter(r => s(r.transport?.method) === '타인차량' && !(r.people ?? []).length).length);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
