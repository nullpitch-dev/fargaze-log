// scripts/check-sleep-data.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = require('mongoose');

const USER_ID = 'hyoje';

function hhmmToMins(s: any): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function pct(n: number, total: number): string {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '—';
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db.collection('log');

  const docs = await col
    .find({ userId: USER_ID, 'activity.category': '생리', 'activity.name': '수면' })
    .toArray();

  console.log(`\n=== ALL 수면 RECORDS: ${docs.length} ===`);

  // 1. What the >= 3600 filter removes
  const noDur = docs.filter((d: any) => d.duration?.totalSeconds == null);
  const shortDur = docs.filter(
    (d: any) => d.duration?.totalSeconds != null && d.duration.totalSeconds < 3600,
  );
  console.log(`  no duration stored : ${noDur.length}`);
  console.log(`  duration < 1h      : ${shortDur.length}`);

  const valid = docs.filter(
    (d: any) => d.duration?.totalSeconds != null && d.duration.totalSeconds >= 3600,
  );
  console.log(`  VALID (widget set) : ${valid.length}`);

  // 2. Date range
  const dateOf = (d: any) =>
    d.start?.year
      ? `${d.start.year}-${String(d.start.month).padStart(2, '0')}-${String(d.start.day).padStart(2, '0')}`
      : null;
  const dates = valid.map(dateOf).filter(Boolean).sort();
  console.log(`  date range         : ${dates[0]} .. ${dates[dates.length - 1]}`);

  // 3. Missing ends — the drift question
  const noStart = valid.filter((d: any) => hhmmToMins(d.start?.hour) === null);
  const noEnd = valid.filter((d: any) => hhmmToMins(d.end?.hour) === null);
  const noBoth = valid.filter(
    (d: any) => hhmmToMins(d.start?.hour) === null && hhmmToMins(d.end?.hour) === null,
  );
  console.log(`\n=== MISSING ENDS ===`);
  console.log(`  missing bedtime    : ${noStart.length} (${pct(noStart.length, valid.length)})`);
  console.log(`  missing waketime   : ${noEnd.length} (${pct(noEnd.length, valid.length)})`);
  console.log(`  missing both       : ${noBoth.length}`);
  console.log(`  exactly one end    : ${noStart.length + noEnd.length - 2 * noBoth.length}`);
  for (const d of [...noStart, ...noEnd].slice(0, 5)) {
    console.log(`    e.g. ${dateOf(d)} start=${d.start?.hour} end=${d.end?.hour} dur=${d.duration?.totalSeconds}`);
  }

  // 4. Stored duration vs (end - start)
  console.log(`\n=== STORED DURATION vs ENDS ===`);
  const both = valid.filter(
    (d: any) => hhmmToMins(d.start?.hour) !== null && hhmmToMins(d.end?.hour) !== null,
  );
  let mismatch: any[] = [];
  let diffSum = 0;
  for (const d of both) {
    const s = hhmmToMins(d.start.hour)!;
    let e = hhmmToMins(d.end.hour)!;
    if (e <= s) e += 1440; // normal overnight wrap
    const derivedSec = (e - s) * 60;
    const diffMin = Math.round((derivedSec - d.duration.totalSeconds) / 60);
    diffSum += Math.abs(diffMin);
    if (Math.abs(diffMin) > 5) mismatch.push({ d, diffMin, derivedSec });
  }
  console.log(`  comparable records : ${both.length}`);
  console.log(`  differ by > 5 min  : ${mismatch.length} (${pct(mismatch.length, both.length)})`);
  console.log(`  mean abs diff      : ${both.length ? (diffSum / both.length).toFixed(1) : '—'} min`);
  mismatch
    .sort((a, b) => Math.abs(b.diffMin) - Math.abs(a.diffMin))
    .slice(0, 8)
    .forEach(({ d, diffMin, derivedSec }) =>
      console.log(
        `    ${dateOf(d)} ${d.start.hour}→${d.end.hour} derived=${Math.round(derivedSec / 60)}m stored=${Math.round(d.duration.totalSeconds / 60)}m diff=${diffMin}m`,
      ),
    );

  // 5. Daytime sleeps — the band-axis question
  console.log(`\n=== BEDTIME / WAKETIME SPREAD (hour of day) ===`);
  const bedHist = new Array(24).fill(0);
  const wakeHist = new Array(24).fill(0);
  for (const d of valid) {
    const s = hhmmToMins(d.start?.hour);
    const e = hhmmToMins(d.end?.hour);
    if (s !== null) bedHist[Math.floor(s / 60)]++;
    if (e !== null) wakeHist[Math.floor(e / 60)]++;
  }
  for (let h = 0; h < 24; h++) {
    if (bedHist[h] || wakeHist[h]) {
      console.log(
        `  ${String(h).padStart(2, '0')}:00  bed ${String(bedHist[h]).padStart(5)}   wake ${String(wakeHist[h]).padStart(5)}`,
      );
    }
  }

  const daytime = valid.filter((d: any) => {
    const s = hhmmToMins(d.start?.hour);
    return s !== null && s >= 9 * 60 && s < 19 * 60;
  });
  console.log(`\n  sleeps starting 09:00-19:00 : ${daytime.length}`);
  daytime.slice(0, 10).forEach((d: any) =>
    console.log(`    ${dateOf(d)} ${d.start.hour}→${d.end?.hour} dur=${Math.round(d.duration.totalSeconds / 60)}m`),
  );

  // 6. Quality coverage by year — the spiciness trap
  console.log(`\n=== QUALITY COVERAGE BY YEAR ===`);
  const byYear: Record<string, { total: number; withQ: number; vals: Record<string, number> }> = {};
  for (const d of valid) {
    const y = String(d.start?.year ?? '?');
    byYear[y] ??= { total: 0, withQ: 0, vals: {} };
    byYear[y].total++;
    const q = d.sleep?.quality;
    if (q) {
      byYear[y].withQ++;
      byYear[y].vals[q] = (byYear[y].vals[q] ?? 0) + 1;
    }
  }
  Object.keys(byYear)
    .sort()
    .forEach(y => {
      const r = byYear[y];
      console.log(`  ${y}: ${String(r.withQ).padStart(4)}/${String(r.total).padStart(4)} (${pct(r.withQ, r.total)})  ${JSON.stringify(r.vals)}`);
    });

  const allQ = new Set(valid.map((d: any) => d.sleep?.quality).filter(Boolean));
  console.log(`\n  distinct quality values: ${JSON.stringify([...allQ])}`);

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
