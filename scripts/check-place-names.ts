// scripts/check-place-names.ts
// Read-only survey of the From / To names in 이동 records, before geocoding.
// Run: npx tsx --tsconfig tsconfig.json scripts/check-place-names.ts > place-names.txt
//
// 집 / 회사 / 사이트 / 내차 are resolved to the real place at that moment (favorite_place),
// so "집" in 2019 and "집" in 2025 count as different places.
// "Home at the time" is the home that 집 meant when the leg happened; it shows whether
// a chain name (스타벅스, Tesco …) was used from more than one home.

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import mongoose from 'mongoose';
import { legsFromDocs, buildJourneys, HOME } from '../src/lib/insights/transport-journeys';
import { resolveFavoritePlace } from '../src/lib/migration/favoritePlace';

const USER = 'hyoje';
const THRESHOLDS = [1, 2, 3, 5, 10];
const LIST_MIN = 3;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const db = mongoose.connection.db!;

  const docs = await db.collection('log').find(
    { userId: USER, 'activity.category': '이동' },
    { projection: { start: 1, end: 1, activity: 1, location: 1, transport: 1, people: 1 } },
  ).toArray();
  const favRaw = await db.collection('favorite_place').find({ userId: USER }).toArray();
  const fav = favRaw.map((f: any) => ({
    label: f.label, name: f.name,
    from: f.from ? { ...f.from, at: new Date(f.from.at) } : null,
    to: f.to ? { ...f.to, at: new Date(f.to.at) } : null,
  }));
  const labels = new Set(fav.map(f => f.label));

  const legs = legsFromDocs(docs);
  const resolve = (label: string, at: number) =>
    labels.has(label) ? (resolveFavoritePlace(fav as any, label, new Date(at)) ?? `${label} (unresolved)`) : label;
  const homeAt = (at: number) => resolveFavoritePlace(fav as any, HOME, new Date(at)) ?? '(no home)';

  // ── Endpoints ──────────────────────────────────────────────────────────────
  type Info = { uses: number; tz: Map<string, number>; homes: Map<string, number>; places: Map<string, number>; flight: boolean };
  const names = new Map<string, Info>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let emptyEnds = 0;

  const legEnds = legs.map(l => {
    const ends: [string, string, number][] = [[l.from, l.startTz, l.startAt], [l.to, l.endTz, l.endAt]];
    return ends.map(([raw, tz, at]) => {
      if (!raw) { emptyEnds++; return ''; }
      const name = resolve(raw, at);
      const info = names.get(name) ?? { uses: 0, tz: new Map(), homes: new Map(), places: new Map(), flight: false };
      info.uses++;
      bump(info.tz, tz || '?');
      bump(info.homes, homeAt(at));
      if (l.place) bump(info.places, l.place);
      if (l.method === '비행기') info.flight = true;
      names.set(name, info);
      return name;
    });
  });

  console.log('=== TOTALS ===');
  console.log(`legs: ${legs.length}   endpoints: ${legs.length * 2}   empty endpoints: ${emptyEnds}`);
  console.log(`distinct names (favourite labels resolved): ${names.size}`);
  const unresolved = [...names].filter(([n]) => n.endsWith('(unresolved)'));
  if (unresolved.length) console.log(`unresolved favourite labels: ${unresolved.map(([n, i]) => `${n} ×${i.uses}`).join(', ')}`);

  // ── Coverage if every name used N+ times had coordinates ───────────────────
  const journeys = buildJourneys(legs.filter(l => l.method !== '비행기'));
  const legIndex = new Map(legs.map((l, i) => [l.id, i]));
  console.log('\n=== COVERAGE BY THRESHOLD ===');
  console.log('min uses | names to locate | legs with both ends | journeys with every leg');
  for (const t of THRESHOLDS) {
    const ok = new Set([...names].filter(([, i]) => i.uses >= t).map(([n]) => n));
    const legOk = legEnds.map(([a, b]) => ok.has(a) && ok.has(b));
    const legShare = legOk.filter(Boolean).length / legs.length;
    const jShare = journeys.filter(j => j.legs.every(l => legOk[legIndex.get(l.id)!])).length / journeys.length;
    console.log(`${String(t).padStart(8)} | ${String(ok.size).padStart(15)} | ${(legShare * 100).toFixed(1).padStart(18)}% | ${(jShare * 100).toFixed(1).padStart(22)}%`);
  }

  // ── Names to locate ────────────────────────────────────────────────────────
  const top = (m: Map<string, number>, n = 3) =>
    [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join(', ');
  const listed = [...names].filter(([, i]) => i.uses >= LIST_MIN).sort((a, b) => b[1].uses - a[1].uses);
  console.log(`\n=== NAMES USED ${LIST_MIN}+ TIMES (${listed.length}) ===`);
  console.log('uses | name | time zones | home at the time | Place values');
  for (const [n, i] of listed) {
    console.log(`${String(i.uses).padStart(4)} | ${n}${i.flight ? ' ✈' : ''} | ${top(i.tz)} | ${top(i.homes)} | ${top(i.places)}`);
  }

  // ── Possible chains: used from 2+ homes, at least twice from each ─────────
  const multi = listed.filter(([, i]) => [...i.homes.values()].filter(v => v >= 2).length >= 2);
  console.log(`\n=== USED FROM 2+ HOMES (${multi.length}) — may be different branches ===`);
  for (const [n, i] of multi) console.log(`${n}: ${top(i.homes, 6)}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
