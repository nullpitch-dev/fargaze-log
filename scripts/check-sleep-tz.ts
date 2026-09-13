// scripts/check-sleep-tz.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = require('mongoose');

const USER_ID = 'hyoje';

function dateOf(d: any): string {
  return d.start?.year
    ? `${d.start.year}-${String(d.start.month).padStart(2, '0')}-${String(d.start.day).padStart(2, '0')}`
    : '????-??-??';
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db;

  // ── 1. Timezone master — the half-hour zones ────────────────────────────
  console.log(`\n=== TIMEZONE MASTER ===`);
  const tzs = await db.collection('timezone_masters').find({ userId: USER_ID }).toArray();
  if (!tzs.length) {
    const names = (await db.listCollections().toArray()).map((c: any) => c.name);
    console.log(`  empty — collections present: ${names.join(', ')}`);
  }
  tzs
    .sort((a: any, b: any) => (a.offsetUTC ?? 0) - (b.offsetUTC ?? 0))
    .forEach((t: any) =>
      console.log(
        `  ${String(t.code).padEnd(6)} offset=${String(t.offsetUTC).padStart(6)}  ${t.ianaTimezone ?? ''} ${t.city ?? ''}${
          t.offsetUTC != null && t.offsetUTC % 1 !== 0 ? '   <- fractional' : ''
        }`,
      ),
    );

  // ── 2. Sleep nights where the timezone changed ──────────────────────────
  const sleeps = await db
    .collection('log')
    .find({ userId: USER_ID, 'activity.category': '생리', 'activity.name': '수면' })
    .toArray();

  const crossed = sleeps.filter(
    (d: any) =>
      d.start?.timezone && d.end?.timezone && d.start.timezone !== d.end.timezone,
  );
  const offsetCrossed = sleeps.filter(
    (d: any) =>
      d.start?.timezoneOffset != null &&
      d.end?.timezoneOffset != null &&
      d.start.timezoneOffset !== d.end.timezoneOffset,
  );

  console.log(`\n=== TIMEZONE-CROSSING NIGHTS ===`);
  console.log(`  sleeps total            : ${sleeps.length}`);
  console.log(`  start.tz !== end.tz     : ${crossed.length}`);
  console.log(`  start.off !== end.off   : ${offsetCrossed.length}`);
  const union = new Set([...crossed, ...offsetCrossed].map((d: any) => String(d._id)));
  console.log(`  either                  : ${union.size}\n`);
  [...crossed, ...offsetCrossed]
    .filter((d: any, i: number, a: any[]) => a.findIndex((x: any) => String(x._id) === String(d._id)) === i)
    .sort((a: any, b: any) => dateOf(a).localeCompare(dateOf(b)))
    .forEach((d: any) =>
      console.log(
        `  ${dateOf(d)}  ${String(d.start.hour).padEnd(6)}[${d.start.timezone}/${d.start.timezoneOffset}] -> ${String(d.end?.hour).padEnd(6)}[${d.end?.timezone}/${d.end?.timezoneOffset}]  ${Math.round(d.duration.totalSeconds / 60)}m`,
      ),
    );

  // ── 3. The 2024-05 cluster and the flight, in full ──────────────────────
  console.log(`\n=== SUSPECT RECORDS IN FULL ===`);
  const want = ['2024-05-21', '2024-05-22', '2024-05-23', '2024-08-14'];
  sleeps
    .filter((d: any) => want.includes(dateOf(d)))
    .sort((a: any, b: any) => dateOf(a).localeCompare(dateOf(b)))
    .forEach((d: any) => {
      console.log(`\n  --- ${dateOf(d)} ---`);
      console.log(`  start: ${JSON.stringify(d.start)}`);
      console.log(`  end  : ${JSON.stringify(d.end)}`);
      console.log(`  dur  : ${JSON.stringify(d.duration)}`);
      if (d.travel) console.log(`  travel: ${JSON.stringify(d.travel)}`);
      if (d.location) console.log(`  location: ${JSON.stringify(d.location)}`);
    });

  // ── 4. Does datetime explain the stored duration? ───────────────────────
  console.log(`\n=== datetime vs stored duration ===`);
  let ok = 0, bad = 0, missing = 0;
  const worst: any[] = [];
  for (const d of sleeps) {
    if (!d.start?.datetime || !d.end?.datetime) { missing++; continue; }
    const derived = (new Date(d.end.datetime).getTime() - new Date(d.start.datetime).getTime()) / 1000;
    const diff = Math.round((derived - (d.duration?.totalSeconds ?? 0)) / 60);
    if (Math.abs(diff) <= 1) ok++; else { bad++; worst.push({ d, diff }); }
  }
  console.log(`  agree within 1 min : ${ok}`);
  console.log(`  disagree           : ${bad}`);
  console.log(`  missing datetime   : ${missing}`);
  worst
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 10)
    .forEach(({ d, diff }) => console.log(`    ${dateOf(d)} diff=${diff}m`));

  // ── 5. Duration spread, for the 3h-15h rule ─────────────────────────────
  console.log(`\n=== DURATION SPREAD (valid set) ===`);
  const valid = sleeps.filter((d: any) => d.duration?.totalSeconds >= 3600);
  const hist: Record<string, number> = {};
  for (const d of valid) {
    const h = Math.floor(d.duration.totalSeconds / 3600);
    const k = h >= 15 ? '15+' : String(h);
    hist[k] = (hist[k] ?? 0) + 1;
  }
  Object.keys(hist)
    .sort((a, b) => (a === '15+' ? 1 : b === '15+' ? -1 : Number(a) - Number(b)))
    .forEach(k => console.log(`  ${k.padStart(3)}h : ${hist[k]}`));
  console.log(`  under 3h : ${valid.filter((d: any) => d.duration.totalSeconds < 3 * 3600).length}`);
  console.log(`  over 15h : ${valid.filter((d: any) => d.duration.totalSeconds > 15 * 3600).length}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
