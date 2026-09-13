// src/lib/insights/sleep.ts
//
// One shared night-assignment pass (buildSleepDays) serves the Summary AND
// every trend bucket, so the 8am bedtime boundary, the 8pm nap cutoff, the
// timezone-crossing rule and the 15-hour ceiling cannot drift apart between
// the two screens. Same principle as the Diet accumulator and the Drinking
// rest scoring.
//
// NIGHT-ASSIGNMENT RULES (settled — see the design doc):
//   1. Bedtime before 08:00  -> the sleep belongs to the PREVIOUS day.
//      Otherwise it belongs to the day it started.
//   2. A sleep that began before 08:00 is ALWAYS a night sleep — no wake
//      cutoff applies. For a sleep that began at/after 08:00: nap if it woke
//      on the SAME calendar day before 20:00, night otherwise.
//   3. Timezone crossing (start.timezone !== end.timezone) breaks rule 2 —
//      the 2024-08-14 flight woke on the date it began. Classify by true
//      duration instead: night if >= 5 hours.
//   4. Over 15 hours: still counts toward the day's DURATION total, but
//      contributes NO bedtime and NO wake time. Guards against am/pm typos
//      and stops the one genuine 20-hour sleep (2019-11-16 — real data, do
//      not "correct" it) from dragging a month's average.
//   5. A nap-only day gets a duration and no band.
//   6. Several sleeps in one day: bedtime from the EARLIEST, wake time from
//      the LATEST, duration = SUM of all.
//   7. Records excluded from the band still count toward Quality.
//
// Bedtime and wake time are returned as MINUTES FROM MIDNIGHT OF THE SLEEP
// DAY, not clock minutes — so a 01:00 bedtime is 1500 and a 06:00 wake the
// next morning is 1800. That keeps min/max chronological across midnight and
// lets the Session band plot on a continuous clock axis without re-deriving
// which side of midnight each end falls on.

import { SLEEP_THRESHOLD_HOUR, hourStringToMinutes } from './dates';
import {
  TrendGrain,
  ymd,
  bucketStartFor,
  buildBucketStarts,
  bucketLabel,
  bucketDayCount,
} from './trend-window';
import Log from '@/models/Log';

// ── Rule constants ────────────────────────────────────────────────────────────

const MIN_SLEEP_SEC = 3600;            // below this a record is not a sleep at all
const BED_CUTOFF_MIN = 8 * 60;         // bedtime before 08:00 -> previous day
const NAP_WAKE_CUTOFF_MIN = 20 * 60;   // woke same day before 20:00 -> nap
const TZ_NIGHT_MIN_SEC = 5 * 3600;     // tz crossing: night if >= 5h
const LONG_CEILING_SEC = 15 * 3600;    // above this: duration only, no band

// ── Band thresholds (exact values fall in the MIDDLE band) ────────────────────

const DUR_BAD_BELOW_SEC = 5 * 3600;
const DUR_GOOD_ABOVE_SEC = 7 * 3600;
const BED_GOOD_BEFORE_MIN = 22 * 60 + 30;
const BED_BAD_AFTER_MIN = 23 * 60 + 30;
const WAKE_EARLY_BEFORE_MIN = 5 * 60;
const WAKE_LATE_AFTER_MIN = 7 * 60;

export type TriBand = 'good' | 'ok' | 'bad';
export type WakeBand = 'early' | 'mid' | 'late';

const QUALITY_SCORE: Record<string, number> = {
  '좋음': 1,
  '보통': 0,
  '나쁨': -1,
};

export function durationBand(sec: number): TriBand {
  if (sec < DUR_BAD_BELOW_SEC) return 'bad';
  if (sec > DUR_GOOD_ABOVE_SEC) return 'good';
  return 'ok';
}

/** bedMin is minutes from midnight of the sleep day; compare on the clock. */
export function bedtimeBand(bedMin: number): TriBand {
  const clock = ((bedMin % 1440) + 1440) % 1440;
  // A bedtime that rolled back (01:00 -> 1500) reads as 60 on the clock, which
  // is "after 23:30" the long way round. Treat anything before the 08:00
  // boundary as late, since that is what it is.
  if (clock < BED_CUTOFF_MIN) return 'bad';
  if (clock < BED_GOOD_BEFORE_MIN) return 'good';
  if (clock > BED_BAD_AFTER_MIN) return 'bad';
  return 'ok';
}

export function wakeBand(wakeMin: number): WakeBand {
  const clock = ((wakeMin % 1440) + 1440) % 1440;
  if (clock < WAKE_EARLY_BEFORE_MIN) return 'early';
  if (clock > WAKE_LATE_AFTER_MIN) return 'late';
  return 'mid';
}

export function qualityBand(score: number): TriBand {
  if (score > 0) return 'good';
  if (score < 0) return 'bad';
  return 'ok';
}

/** Quality score (-1..+1) as a percentage: all-poor 0%, all-good 100%. */
export function qualityPercent(score: number): number {
  return Math.round(((score + 1) / 2) * 100);
}

// ── Small date/clock helpers ──────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Whole days since epoch for a YYYY-MM-DD string. */
function dayIndex(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function shiftDayStr(y: number, m: number, d: number, delta: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** Minutes from midnight, as a clock value, from an "H:MM" string. */
function clockMins(s: any): number | null {
  return hourStringToMinutes(s);
}

/** Minutes from midnight of the sleep day, wrapped forward past midnight. */
export function minsToClock(m: number | null): string | null {
  if (m === null || !Number.isFinite(m)) return null;
  const t = Math.round(m);                  // round ONCE — 22:59.7 must not print "22:60"
  const wrapped = ((t % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

// ── Night assignment ──────────────────────────────────────────────────────────

export interface SleepDay {
  date: string;              // YYYY-MM-DD — the day the sleep belongs to
  durationSec: number;       // SUM of every sleep assigned to the day
  bedMin: number | null;     // minutes from midnight of `date`, may exceed 1440
  wakeMin: number | null;    // minutes from midnight of `date`, may exceed 1440
  qualityScore: number | null;
  nights: number;
  naps: number;
  capped: number;            // sleeps over the 15h ceiling
}

interface Classified {
  sleepDay: string;
  isNight: boolean;
  crossesTz: boolean;
}

function classify(doc: any): Classified | null {
  const sy = doc.start?.year, sm = doc.start?.month, sd = doc.start?.day;
  if (sy == null || sm == null || sd == null) return null;

  const bed = clockMins(doc.start?.hour);

  // Rule 1 — day assignment by bedtime
  const sleepDay =
    bed !== null && bed < BED_CUTOFF_MIN
      ? shiftDayStr(sy, sm, sd, -1)
      : ymdStr(sy, sm, sd);

  const sTz = doc.start?.timezone;
  const eTz = doc.end?.timezone;
  const crossesTz = Boolean(sTz && eTz && sTz !== eTz);

  // Rule 2, first half — a sleep that began before 08:00 rolled back to the
  // previous evening and is ALWAYS a night sleep, whenever he woke.
  if (bed !== null && bed < BED_CUTOFF_MIN) {
    return { sleepDay, isNight: true, crossesTz };
  }

  // Rule 3 — a timezone crossing breaks the calendar-day test
  if (crossesTz) {
    const sec = doc.duration?.totalSeconds ?? 0;
    return { sleepDay, isNight: sec >= TZ_NIGHT_MIN_SEC, crossesTz };
  }

  // Rule 2, second half — began at/after 08:00: nap if it woke the SAME
  // calendar day before 20:00
  const wake = clockMins(doc.end?.hour);
  const sameDay =
    doc.end?.year === sy && doc.end?.month === sm && doc.end?.day === sd;
  if (sameDay && wake !== null && wake < NAP_WAKE_CUTOFF_MIN) {
    return { sleepDay, isNight: false, crossesTz };
  }
  return { sleepDay, isNight: true, crossesTz };
}

/**
 * Apply the rules to a set of raw 수면 documents and fold them into one entry
 * per sleep day. The single place the rules live.
 */
export function buildSleepDays(docs: any[]): Map<string, SleepDay> {
  const days = new Map<string, SleepDay>();
  const qualityByDay = new Map<string, number[]>();

  for (const doc of docs) {
    if (doc.activity?.category !== '생리' || doc.activity?.name !== '수면') continue;
    const sec = doc.duration?.totalSeconds;
    if (sec == null || sec < MIN_SLEEP_SEC) continue;

    const c = classify(doc);
    if (!c) continue;

    const day = days.get(c.sleepDay) ?? {
      date: c.sleepDay,
      durationSec: 0,
      bedMin: null,
      wakeMin: null,
      qualityScore: null,
      nights: 0,
      naps: 0,
      capped: 0,
    };

    day.durationSec += sec;                       // Rule 6 — sum everything
    if (c.isNight) day.nights++; else day.naps++;

    // Rule 7 — every record counts toward Quality, band or no band
    const q = doc.sleep?.quality;
    if (q && QUALITY_SCORE[q] !== undefined) {
      const list = qualityByDay.get(c.sleepDay) ?? [];
      list.push(QUALITY_SCORE[q]);
      qualityByDay.set(c.sleepDay, list);
    }

    // Rules 4 + 5 — band comes only from night sleeps under the ceiling
    if (c.isNight && sec <= LONG_CEILING_SEC) {
      const bed = clockMins(doc.start?.hour);
      const wake = clockMins(doc.end?.hour);
      if (bed !== null && doc.start?.year != null) {
        const base = dayIndex(c.sleepDay);
        const bedOff =
          (dayIndex(ymdStr(doc.start.year, doc.start.month, doc.start.day)) - base) * 1440 + bed;

        if (wake !== null && doc.end?.year != null) {
          let wakeOff =
            (dayIndex(ymdStr(doc.end.year, doc.end.month, doc.end.day)) - base) * 1440 + wake;
          // A timezone crossing can move the local clock BACKWARDS — the flight
          // woke 13:30 on the same date it began 23:30. Local clock is the truth
          // at each end, so wrap forward to keep the band positive.
          while (wakeOff <= bedOff) wakeOff += 1440;
          day.wakeMin = day.wakeMin === null ? wakeOff : Math.max(day.wakeMin, wakeOff);
        }
        day.bedMin = day.bedMin === null ? bedOff : Math.min(day.bedMin, bedOff);
      }
    } else if (c.isNight) {
      day.capped++;
    }

    days.set(c.sleepDay, day);
  }

  for (const [date, scores] of qualityByDay) {
    const day = days.get(date);
    if (day) day.qualityScore = mean(scores);
  }
  return days;
}

// ── Fetch bounds ──────────────────────────────────────────────────────────────

/**
 * A sleep starting 01:00 on the day AFTER the window rolls back into the
 * window under rule 1, so the fetch has to reach past the end. Padding both
 * sides by a day is the same guard diet's fetchBounds applies.
 *
 * start.datetime holds the naive local wall clock encoded as UTC, so a range
 * on it IS a local-date range — and it is the indexed field.
 */
function fetchBounds(start: Date, end: Date): { from: Date; to: Date } {
  const from = new Date(start);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(end);
  to.setUTCDate(to.getUTCDate() + 2);
  return { from, to };
}

async function fetchSleepDocs(
  userId: string,
  from: Date,
  to: Date,
  crossActivities: string[],
): Promise<any[]> {
  const filter: Record<string, any> = {
    userId,
    'activity.category': '생리',
    'activity.name': '수면',
    'start.datetime': { $gte: from, $lte: to },
  };
  if (crossActivities.length) {
    filter['activity.crossActivity'] = { $in: crossActivities };
  }
  return Log.find(filter).lean();
}

/** Keep only the sleep days that fall inside the requested window. */
function cutToWindow(days: Map<string, SleepDay>, start: string, end: string): SleepDay[] {
  return [...days.values()]
    .filter(d => d.date >= start && d.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Summary ───────────────────────────────────────────────────────────────────

export interface SleepSummaryDay {
  date: string;
  durationSec: number | null;
  bedMin: number | null;
  wakeMin: number | null;
  qualityScore: number | null;
  dBand: TriBand | null;
  bBand: TriBand | null;
  wBand: WakeBand | null;
  qBand: TriBand | null;
}

/**
 * Four metrics, each with an average figure, a three-way band count for the
 * pie, and one entry per day for the strip. Everything is DAY-based, not
 * record-based: the card answers "what does a typical day look like", and
 * 2,625 of 2,637 days hold exactly one sleep, so the distinction is a
 * rounding difference everywhere except the 13 multi-sleep days.
 */
export async function computeSleepSummary(
  userId: string,
  start: Date,
  end: Date,
  crossActivities: string[],
) {
  const { from, to } = fetchBounds(start, end);
  const docs = await fetchSleepDocs(userId, from, to, crossActivities);

  const startStr = ymd(start);
  const endStr = ymd(end);
  const days = cutToWindow(buildSleepDays(docs), startStr, endStr);

  if (!days.length) {
    return {
      count: 0,
      rangeStart: startStr,
      rangeEnd: endStr,
      duration: { avgSeconds: null, bands: { good: 0, ok: 0, bad: 0 } },
      bedtime: { avgMin: null, avgClock: null, bands: { good: 0, ok: 0, bad: 0 } },
      waketime: { avgMin: null, avgClock: null, bands: { early: 0, mid: 0, late: 0 } },
      quality: { avgScore: null, percent: null, bands: { good: 0, ok: 0, bad: 0 } },
      days: [] as SleepSummaryDay[],
    };
  }

  const durBands = { good: 0, ok: 0, bad: 0 };
  const bedBands = { good: 0, ok: 0, bad: 0 };
  const wakeBands = { early: 0, mid: 0, late: 0 };
  const qBands = { good: 0, ok: 0, bad: 0 };

  const durs: number[] = [];
  const beds: number[] = [];
  const wakes: number[] = [];
  const qs: number[] = [];

  const out: SleepSummaryDay[] = days.map(d => {
    const hasDur = d.durationSec > 0;
    const dBand = hasDur ? durationBand(d.durationSec) : null;
    const bBand = d.bedMin !== null ? bedtimeBand(d.bedMin) : null;
    const wBand = d.wakeMin !== null ? wakeBand(d.wakeMin) : null;
    const qBand = d.qualityScore !== null ? qualityBand(d.qualityScore) : null;

    if (dBand) { durBands[dBand]++; durs.push(d.durationSec); }
    if (bBand) { bedBands[bBand]++; beds.push(d.bedMin as number); }
    if (wBand) { wakeBands[wBand]++; wakes.push(d.wakeMin as number); }
    if (qBand) { qBands[qBand]++; qs.push(d.qualityScore as number); }

    return {
      date: d.date,
      durationSec: hasDur ? d.durationSec : null,
      bedMin: d.bedMin,
      wakeMin: d.wakeMin,
      qualityScore: d.qualityScore,
      dBand, bBand, wBand, qBand,
    };
  });

  const avgBed = mean(beds);
  const avgWake = mean(wakes);
  const avgQ = mean(qs);

  return {
    count: days.length,
    rangeStart: startStr,
    rangeEnd: endStr,
    duration: {
      avgSeconds: durs.length ? Math.round(mean(durs) as number) : null,
      bands: durBands,
    },
    bedtime: {
      avgMin: avgBed === null ? null : Math.round(avgBed),
      avgClock: minsToClock(avgBed),
      bands: bedBands,
    },
    waketime: {
      avgMin: avgWake === null ? null : Math.round(avgWake),
      avgClock: minsToClock(avgWake),
      bands: wakeBands,
    },
    quality: {
      avgScore: avgQ === null ? null : Math.round(avgQ * 100) / 100,
      percent: avgQ === null ? null : qualityPercent(avgQ),
      bands: qBands,
    },
    days: out,
  };
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export interface SleepTrendBucket {
  label: string;
  start: string;
  daysInBucket: number;
  sleepDays: number;
  avgDurationSec: number | null;
  avgBedMin: number | null;
  avgWakeMin: number | null;
  avgBedClock: string | null;
  avgWakeClock: string | null;
  qualityScore: number | null;
  qualityPercent: number | null;
  quality: { good: number; ok: number; bad: number };
}

/**
 * ONE bounded query for the whole window, night-assigned once, bucketed in
 * memory — the Drinking/Diet shape. `grain` is echoed at the TOP level, not
 * per bucket, so the view formats labels from the payload rather than from
 * the control (the one-frame label-grain mismatch fix).
 *
 * A bucket with no sleep days reports nulls and draws as a gap, not a zero.
 */
export async function computeSleepTrend(
  userId: string,
  grain: TrendGrain,
  windowStart: Date,
  windowEnd: Date,
  crossActivities: string[],
) {
  const { from, to } = fetchBounds(windowStart, windowEnd);
  const docs = await fetchSleepDocs(userId, from, to, crossActivities);

  const startStr = ymd(windowStart);
  const endStr = ymd(windowEnd);
  const days = cutToWindow(buildSleepDays(docs), startStr, endStr);

  const byBucket = new Map<string, SleepDay[]>();
  for (const d of days) {
    const [y, m, dd] = d.date.split('-').map(Number);
    const key = ymd(bucketStartFor(grain, y, m, dd));
    const list = byBucket.get(key) ?? [];
    list.push(d);
    byBucket.set(key, list);
  }

  const buckets: SleepTrendBucket[] = buildBucketStarts(grain, windowStart, windowEnd).map(bs => {
    const key = ymd(bs);
    const list = byBucket.get(key) ?? [];

    const durs = list.filter(d => d.durationSec > 0).map(d => d.durationSec);
    const beds = list.filter(d => d.bedMin !== null).map(d => d.bedMin as number);
    const wakes = list.filter(d => d.wakeMin !== null).map(d => d.wakeMin as number);
    const qs = list.filter(d => d.qualityScore !== null).map(d => d.qualityScore as number);

    const quality = { good: 0, ok: 0, bad: 0 };
    for (const s of qs) quality[qualityBand(s)]++;

    const avgBed = mean(beds);
    const avgWake = mean(wakes);
    const avgQ = mean(qs);
    const avgDur = mean(durs);

    return {
      label: bucketLabel(grain, bs),
      start: key,
      daysInBucket: bucketDayCount(grain, bs, windowStart, windowEnd),
      sleepDays: list.length,
      avgDurationSec: avgDur === null ? null : Math.round(avgDur),
      avgBedMin: avgBed === null ? null : Math.round(avgBed),
      avgWakeMin: avgWake === null ? null : Math.round(avgWake),
      avgBedClock: minsToClock(avgBed),
      avgWakeClock: minsToClock(avgWake),
      qualityScore: avgQ === null ? null : Math.round(avgQ * 100) / 100,
      qualityPercent: avgQ === null ? null : qualityPercent(avgQ),
      quality,
    };
  });

	// Drop leading buckets from before the log begins. At Month × 120 the window
  // reaches back to 2016 and the first three years are empty columns carrying
  // no information at all.
  //
  // Only the LEADING run goes. An interior gap means something — a month with
  // nothing recorded is a fact about that month. A trailing gap means something
  // too, and is the whole point of anchoring the window to today rather than to
  // the last record: a fortnight with no entries should show as empty recent
  // buckets, not slide a stale value to the right edge.
  const firstWithData = buckets.findIndex(b => b.sleepDays > 0);
  const trimmed = firstWithData <= 0 ? buckets : buckets.slice(firstWithData);

  return {
    grain,
    windowStart: trimmed.length ? trimmed[0].start : startStr,
    windowEnd: endStr,
    buckets: trimmed,
  };
}

// ── Legacy ────────────────────────────────────────────────────────────────────

/**
 * The pre-rules summary: raw records, no night assignment, naps and the
 * 20-hour record folded into the averages. Serves the old
 * `sleep.all&mode=trend` path only. Retires with it, alongside
 * computeDrinkingTrendBucket / computeDailyScoresLegacy /
 * computeDietTrendBucket — delete together, and grep the call sites first.
 */
export function computeSleepSummaryLegacy(docs: any[]) {
  const valid = docs.filter(
    d =>
      d.activity?.category === '생리' &&
      d.activity?.name === '수면' &&
      d.duration?.totalSeconds != null &&
      d.duration.totalSeconds >= 3600,
  );
  if (!valid.length) return null;

  const totalSec = valid.reduce((s, d) => s + d.duration.totalSeconds, 0);
  const avgSec = totalSec / valid.length;
  const bedtimes = valid
    .map(d => hourStringToMinutes(d.start?.hour))
    .filter((v): v is number => v !== null);
  const waketimes = valid
    .map(d => hourStringToMinutes(d.end?.hour))
    .filter((v): v is number => v !== null);

  const adjustedBedtimes = bedtimes.map(m => (m < SLEEP_THRESHOLD_HOUR * 60 ? m + 1440 : m));
  const avgBedtimeMins = adjustedBedtimes.length
    ? adjustedBedtimes.reduce((s, v) => s + v, 0) / adjustedBedtimes.length
    : null;
  const avgWaketimeMins = waketimes.length
    ? waketimes.reduce((s, v) => s + v, 0) / waketimes.length
    : null;

  const qualityCounts: Record<string, number> = {};
  let qualitySum = 0, qualityN = 0;
  for (const d of valid) {
    const q = d.sleep?.quality;
    if (q) {
      qualityCounts[q] = (qualityCounts[q] ?? 0) + 1;
      const score = QUALITY_SCORE[q];
      if (score !== undefined) { qualitySum += score; qualityN++; }
    }
  }

  return {
    count: valid.length,
    duration: { avgSeconds: Math.round(avgSec) },
    bedtime: { avgClock: minsToClock(avgBedtimeMins) },
    waketime: { avgClock: minsToClock(avgWaketimeMins) },
    quality: {
      counts: qualityCounts,
      avgScore: qualityN ? Math.round((qualitySum / qualityN) * 100) / 100 : null,
    },
  };
}
