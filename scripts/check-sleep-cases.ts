// scripts/check-sleep-cases.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = require('mongoose');

const USER_ID = 'hyoje';
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hhmmToMins(s: any): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function dateOf(d: any): string {
  return d.start?.year
    ? `${d.start.year}-${String(d.start.month).padStart(2, '0')}-${String(d.start.day).padStart(2, '0')}`
    : '????-??-??';
}

function dowOf(d: any): string {
  if (!d.start?.year) return '   ';
  return DOW[new Date(Date.UTC(d.start.year, d.start.month - 1, d.start.day)).getUTCDay()];
}

// UK clock change: last Sunday of March / October. A sleep starting the
// evening before crosses it.
function lastSunday(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month, 0)); // last day of month
  return d.getUTCDate() - d.getUTCDay();
}
function isClockChangeNight(d: any): boolean {
  if (!d.start?.year) return false;
  const { year, month, day } = d.start;
  if (month === 3 && day === lastSunday(year, 3) - 1) return true;
  if (month === 10 && day === lastSunday(year, 10) - 1) return true;
  if (month === 3 && day === lastSunday(year, 3)) return true;
  if (month === 10 && day === lastSunday(year, 10)) return true;
  return false;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db.collection('log');

  const docs = await col
    .find({ userId: USER_ID, 'activity.category': '생리', 'activity.name': '수면' })
    .toArray();

  const valid = docs.filter(
    (d: any) => d.duration?.totalSeconds != null && d.duration.totalSeconds >= 3600,
  );

  console.log(`\ntotal ${docs.length}, valid ${valid.length}`);

  // ── 1. Does any timezone information exist at all? ──────────────────────
  console.log(`\n=== TIMEZONE FIELDS ===`);
  const keys = new Set<string>();
  function walk(o: any, prefix = '') {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    for (const k of Object.keys(o)) {
      keys.add(prefix + k);
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) walk(o[k], `${prefix}${k}.`);
    }
  }
  valid.slice(0, 400).forEach((d: any) => walk(d));
  const tzish = [...keys].filter(k => /tz|zone|utc|offset|country|city|location|place/i.test(k));
  console.log(`  candidate fields: ${tzish.length ? tzish.join(', ') : 'NONE FOUND'}`);
  console.log(`  start.* fields  : ${[...keys].filter(k => k.startsWith('start.')).join(', ')}`);
  console.log(`  end.* fields    : ${[...keys].filter(k => k.startsWith('end.')).join(', ')}`);

  // ── 2. All daytime-start sleeps ─────────────────────────────────────────
  console.log(`\n=== DAYTIME SLEEPS (start 09:00-18:59) ===`);
  const daytime = valid
    .filter((d: any) => {
      const s = hhmmToMins(d.start?.hour);
      return s !== null && s >= 9 * 60 && s < 19 * 60;
    })
    .sort((a: any, b: any) => dateOf(a).localeCompare(dateOf(b)));

  console.log(`  count: ${daytime.length}\n`);
  console.log(`  date        dow   start   end      dur     quality`);
  for (const d of daytime) {
    const mins = Math.round(d.duration.totalSeconds / 60);
    const hrs = `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`;
    console.log(
      `  ${dateOf(d)}  ${dowOf(d)}   ${String(d.start?.hour ?? '—').padEnd(6)}  ${String(d.end?.hour ?? '—').padEnd(6)}  ${hrs.padStart(6)}  ${d.sleep?.quality ?? '—'}`,
    );
  }

  // ── 3. Every duration mismatch, clock-change flagged ────────────────────
  console.log(`\n=== DURATION MISMATCH > 5 MIN ===`);
  const rows: any[] = [];
  for (const d of valid) {
    const s = hhmmToMins(d.start?.hour);
    let e = hhmmToMins(d.end?.hour);
    if (s === null || e === null) continue;
    if (e <= s) e += 1440;
    const diffMin = Math.round(((e - s) * 60 - d.duration.totalSeconds) / 60);
    if (Math.abs(diffMin) > 5) rows.push({ d, diffMin, derived: e - s });
  }
  rows.sort((a, b) => dateOf(a.d).localeCompare(dateOf(b.d)));
  console.log(`  count: ${rows.length}\n`);
  console.log(`  date        dow   start   end      derived  stored   diff    clock-change?`);
  for (const { d, diffMin, derived } of rows) {
    const stored = Math.round(d.duration.totalSeconds / 60);
    console.log(
      `  ${dateOf(d)}  ${dowOf(d)}   ${String(d.start.hour).padEnd(6)}  ${String(d.end.hour).padEnd(6)}  ${String(derived).padStart(6)}m  ${String(stored).padStart(5)}m  ${String(diffMin).padStart(6)}m  ${isClockChangeNight(d) ? 'YES' : '— suspect travel'}`,
    );
  }

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
