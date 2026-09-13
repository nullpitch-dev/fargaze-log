// scripts/verify-sleep-rules.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mongoose = require('mongoose');

const USER_ID = 'hyoje';
const BED_CUTOFF = 8 * 60;        // bedtime before 08:00 -> previous day
const NAP_CUTOFF = 20 * 60;       // woke same day before 20:00 -> nap
const TZ_NIGHT_MIN = 5 * 3600;    // tz crossing: night if >= 5h
const LONG_CEILING = 15 * 3600;   // no bed/wake contribution above this

function mins(s: any): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const hhmm = (m: number) => {
  const t = Math.round(m);                    // round ONCE, or 22:59.7 prints "22:60"
  return `${pad(Math.floor(t / 60) % 24)}:${pad(((t % 60) + 60) % 60)}`;
};

// Whole days since epoch, for putting bed and wake on one continuous timeline
function dayIndex(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function shiftDay(y: number, m: number, d: number, delta: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

type Cls = { sleepDay: string; isNight: boolean; reason: string };

function classify(doc: any): Cls | null {
  const b = mins(doc.start?.hour);
  const sy = doc.start?.year, sm = doc.start?.month, sd = doc.start?.day;
  if (sy == null || sm == null || sd == null) return null;

  // Rule 1 — day assignment by bedtime
  const sleepDay = b !== null && b < BED_CUTOFF
    ? shiftDay(sy, sm, sd, -1)
    : ymd(sy, sm, sd);

	const dur = doc.duration?.totalSeconds ?? null;

  // Rule 2a — a sleep that began before 08:00 rolled back to the previous
  // evening and is ALWAYS a night sleep. No wake cutoff applies: whenever he
  // woke, it is still that night's sleep. The nap test further down runs ONLY
  // on sleeps that began after 08:00.
  if (b !== null && b < BED_CUTOFF) {
    return { sleepDay, isNight: true, reason: 'night (rolled back)' };
  }

  // Rule 3 — timezone crossing classifies by true duration
  const sTz = doc.start?.timezone, eTz = doc.end?.timezone;
  if (sTz && eTz && sTz !== eTz) {
    return { sleepDay, isNight: (dur ?? 0) >= TZ_NIGHT_MIN, reason: 'tz-crossing' };
  }

  // Rule 2b — began after 08:00: nap if woke the SAME calendar day before 20:00
  const w = mins(doc.end?.hour);
  const sameDay =
    doc.end?.year === sy && doc.end?.month === sm && doc.end?.day === sd;
  if (sameDay && w !== null && w < NAP_CUTOFF) {
    return { sleepDay, isNight: false, reason: 'nap' };
  }
  return { sleepDay, isNight: true, reason: 'night' };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db.collection('log');
  const docs = await col
    .find({ userId: USER_ID, 'activity.category': '생리', 'activity.name': '수면' })
    .toArray();

  console.log(`\n=== INPUT ===`);
  console.log(`  records                : ${docs.length}`);
  console.log(`  no duration            : ${docs.filter((d: any) => d.duration?.totalSeconds == null).length}`);
  console.log(`  duration <= 0          : ${docs.filter((d: any) => (d.duration?.totalSeconds ?? 1) <= 0).length}`);

  const days = new Map<string, {
    durSec: number; beds: number[]; wakes: number[];
    nights: number; naps: number; capped: number; tz: number;
  }>();

  let unclassified = 0, napCount = 0, nightCount = 0, cappedCount = 0, tzCount = 0;
  const cappedList: any[] = [];
  const napList: any[] = [];

  for (const d of docs) {
    const c = classify(d);
    if (!c) { unclassified++; continue; }
    const dur = d.duration?.totalSeconds ?? 0;
    if (dur <= 0) continue;

    const rec = days.get(c.sleepDay) ?? {
      durSec: 0, beds: [], wakes: [], nights: 0, naps: 0, capped: 0, tz: 0,
    };

    rec.durSec += dur;                                   // Rule 6 — sum all
    if (c.reason === 'tz-crossing') { rec.tz++; tzCount++; }
    if (c.isNight) { rec.nights++; nightCount++; } else { rec.naps++; napCount++; napList.push(d); }

		// Rules 4 + 7 — bed/wake only from nights under the ceiling.
    // Both ends are offsets in minutes from midnight of the SLEEP DAY, so a
    // sleep crossing midnight lands past 1440 and Math.min/Math.max compare
    // chronologically. Raw clock minutes would rank 03:00 (+1 day) below 21:15.
    if (c.isNight && dur <= LONG_CEILING) {
      const b = mins(d.start?.hour);
      const w = mins(d.end?.hour);
      const base = dayIndex(c.sleepDay);
      if (b !== null) {
        const bOff = (dayIndex(ymd(d.start.year, d.start.month, d.start.day)) - base) * 1440 + b;
        rec.beds.push(bOff);
        if (w !== null && d.end?.year != null) {
          let wOff = (dayIndex(ymd(d.end.year, d.end.month, d.end.day)) - base) * 1440 + w;
          // A timezone crossing can move the local clock backwards (the flight
          // woke at 13:30 on the same date it began at 23:30). Local clock is
          // the truth at each end, so wrap forward to keep the band positive.
          while (wOff <= bOff) wOff += 1440;
          rec.wakes.push(wOff);
        }
      }
    } else if (c.isNight && dur > LONG_CEILING) {
      rec.capped++; cappedCount++; cappedList.push(d);
    }
    days.set(c.sleepDay, rec);
  }

  console.log(`\n=== CLASSIFICATION ===`);
  console.log(`  night sleeps           : ${nightCount}`);
  console.log(`  naps                   : ${napCount}`);
  console.log(`  tz-crossing            : ${tzCount}`);
  console.log(`  hit 15h ceiling        : ${cappedCount}`);
  console.log(`  unclassified (no date) : ${unclassified}`);

  const all = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const withBand = all.filter(([, r]) => r.beds.length && r.wakes.length);
  const noBand = all.filter(([, r]) => !r.beds.length || !r.wakes.length);
  const multi = all.filter(([, r]) => r.nights + r.naps > 1);

  console.log(`\n=== DAYS ===`);
  console.log(`  distinct sleep days    : ${all.length}`);
  console.log(`  with a band            : ${withBand.length}`);
  console.log(`  duration but no band   : ${noBand.length}`);
  console.log(`  more than one sleep    : ${multi.length}`);

  console.log(`\n=== DAYS WITH NO BAND (duration only) ===`);
  noBand.slice(0, 25).forEach(([k, r]) =>
    console.log(`  ${k}  dur=${(r.durSec / 3600).toFixed(1)}h  nights=${r.nights} naps=${r.naps} capped=${r.capped}`));
  if (noBand.length > 25) console.log(`  ... and ${noBand.length - 25} more`);

  console.log(`\n=== MULTI-SLEEP DAYS (first 25) ===`);
  multi.slice(0, 25).forEach(([k, r]) =>
    console.log(`  ${k}  sleeps=${r.nights + r.naps} (night ${r.nights}, nap ${r.naps})  ` +
      `bed=${r.beds.length ? hhmm(Math.min(...r.beds)) : '—'}  ` +
      `wake=${r.wakes.length ? hhmm(Math.max(...r.wakes)) : '—'}  ` +
      `dur=${(r.durSec / 3600).toFixed(1)}h`));
  if (multi.length > 25) console.log(`  ... and ${multi.length - 25} more`);

  console.log(`\n=== ALL NAPS (${napCount}) ===`);
  napList.sort((a: any, b: any) => ymd(a.start.year, a.start.month, a.start.day)
    .localeCompare(ymd(b.start.year, b.start.month, b.start.day)));
  napList.forEach((d: any) =>
    console.log(`  ${ymd(d.start.year, d.start.month, d.start.day)}  ${String(d.start.hour).padEnd(6)}-> ${String(d.end?.hour).padEnd(6)}  ${(d.duration.totalSeconds / 3600).toFixed(1)}h`));

  console.log(`\n=== CAPPED AT 15h (${cappedCount}) ===`);
  cappedList.forEach((d: any) =>
    console.log(`  ${ymd(d.start.year, d.start.month, d.start.day)}  ${String(d.start.hour).padEnd(6)}-> ${String(d.end?.hour).padEnd(6)}  ${(d.duration.totalSeconds / 3600).toFixed(1)}h`));

  // Monthly averages — what the chart will actually plot
  console.log(`\n=== MONTHLY AVERAGES (band uses earliest bed / latest wake) ===`);
  const months = new Map<string, { beds: number[]; wakes: number[]; durs: number[] }>();
  for (const [day, r] of all) {
    const k = day.slice(0, 7);
    const m = months.get(k) ?? { beds: [], wakes: [], durs: [] };
    if (r.beds.length) m.beds.push(Math.min(...r.beds));
    if (r.wakes.length) m.wakes.push(Math.max(...r.wakes));
    m.durs.push(r.durSec / 3600);
    months.set(k, m);
  }
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  [...months.entries()].sort().forEach(([k, m]) =>
    console.log(`  ${k}  bed=${m.beds.length ? hhmm(avg(m.beds)) : '  —  '}  ` +
      `wake=${m.wakes.length ? hhmm(avg(m.wakes)) : '  —  '}  ` +
      `dur=${avg(m.durs).toFixed(2)}h  days=${String(m.durs.length).padStart(2)}`));

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
