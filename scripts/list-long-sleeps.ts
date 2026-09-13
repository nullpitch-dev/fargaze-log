import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = require('mongoose');

function mins(s: any): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dateOf = (d: any) =>
  `${d.start.year}-${String(d.start.month).padStart(2, '0')}-${String(d.start.day).padStart(2, '0')}`;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db.collection('log');
  const docs = await col
    .find({ userId: 'hyoje', 'activity.category': '생리', 'activity.name': '수면' })
    .toArray();

  const long = docs
    .filter((d: any) => (d.duration?.totalSeconds ?? 0) > 15 * 3600)
    .sort((a: any, b: any) => dateOf(a).localeCompare(dateOf(b)));

  console.log(`\n${long.length} records over 15 hours\n`);
  console.log(`  date        bed     wake    stored   if bed +12h   verdict`);
  for (const d of long) {
    const b = mins(d.start?.hour);
    const w = mins(d.end?.hour);
    const stored = Math.round(d.duration.totalSeconds / 60);
    let hyp = '     —', verdict = 'check manually';
    if (b !== null && w !== null) {
      const shifted = stored - 12 * 60; // moving bedtime 12h later shortens by 12h
      hyp = `${String(Math.floor(shifted / 60))}h${String(shifted % 60).padStart(2, '0')}`;
      if (shifted >= 4 * 60 && shifted <= 12 * 60) {
        verdict = `am/pm — bed should be ${hhmm(b + 12 * 60)}`;
      } else if (shifted > 12 * 60) {
        verdict = 'still too long — date error?';
      } else {
        verdict = 'check manually';
      }
    }
    const sm = `${Math.floor(stored / 60)}h${String(stored % 60).padStart(2, '0')}`;
    console.log(
      `  ${dateOf(d)}  ${String(d.start?.hour ?? '—').padEnd(6)}  ${String(d.end?.hour ?? '—').padEnd(6)}  ` +
        `${sm.padStart(6)}   ${hyp.padStart(6)}      ${verdict}`,
    );
  }
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
