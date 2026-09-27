// src/lib/insights/bowel.ts
// Bowel Movement Summary (WBS #62).
//
// Scope: activity.category === '생리', activity.name === '대변'. One record = one movement.
// A movement belongs to its calendar day (start.year/month/day) — no early-morning shift.
//
// The period runs from its start to min(period end, YESTERDAY). Today is never
// included: an unfinished day would read as a gap day.
//
// ONE unbounded fetch (~3.5k records), period cut in memory — the same trade as
// exercise.ts. Two figures need history before the period start:
//   • a gap that began before the period (day score and Gap histogram)
//   • the first movement day in the period looks back past the period start
//
// crossActivities is deliberately NOT applied. Filtering movements by travel /
// work context would turn the removed days into gap days and corrupt the score.
//
// ── Movement score ──────────────────────────────────────────────────────────
// amount score + sum(quality scores) + sum(characteristics scores).
// Scores live in bowel_score (Active > Bowel sheet, `npm run migrate-bowel`).
// Movements before DAY_SCORE_START carry no score: characteristics were only
// recorded from that day, so an empty value then does not mean 편하게.
//
// ── Day score ───────────────────────────────────────────────────────────────
// Movement day: mean of the day's movement scores + frequency penalty
//   (0 for 1–2 movements, −2 for the 3rd, −3 for each one after).
// Day with none: the Nth consecutive empty day scores −1, −3, −5, −7, then −10.
// Bad day: day score below −3.

import Log from '@/models/Log';
import BowelScore from '@/models/BowelScore';
import {
  type TrendGrain, ymd, fromYMD, buildBucketStarts, bucketDayCount, bucketLabel,
} from './trend-window';

export const DAY_SCORE_START = '2019-09-19';
export const BAD_DAY_BELOW = -3;

// The three mutually exclusive "how it went" values. Every other characteristic
// is an "other sign" — not exclusive, so it is listed, never put in a pie.
export const HOW_IT_WENT = ['편하게', '급하게', '힘들게'] as const;
export const HOW_NOT_RECORDED = 'Not recorded';

const GAP_SCORES = [-1, -3, -5, -7];          // 1st..4th empty day
const GAP_SCORE_MAX = -10;                    // 5th empty day onwards

function frequencyPenalty(n: number): number {
  return n <= 2 ? 0 : -2 - 3 * (n - 3);
}

function gapScore(nthEmptyDay: number): number {
  return GAP_SCORES[nthEmptyDay - 1] ?? GAP_SCORE_MAX;
}

// Time-of-day groups. Start minute inclusive; the last group wraps past midnight.
export const TIME_GROUPS = [
  { key: 'earlyMorning', label: 'Early morning', range: '05:00–06:59', from: 5 * 60 },
  { key: 'morning',      label: 'Morning',       range: '07:00–08:59', from: 7 * 60 },
  { key: 'lateMorning',  label: 'Late morning',  range: '09:00–11:29', from: 9 * 60 },
  { key: 'lunchtime',    label: 'Lunchtime',     range: '11:30–13:29', from: 11 * 60 + 30 },
  { key: 'afternoon',    label: 'Afternoon',     range: '13:30–16:59', from: 13 * 60 + 30 },
  { key: 'evening',      label: 'Evening',       range: '17:00–21:59', from: 17 * 60 },
  { key: 'night',        label: 'Night',         range: '22:00–04:59', from: 22 * 60 },
] as const;

const PER_DAY_LABELS = ['0×', '1×', '2×', '3×', '4×', '5×', '6×+'];
const GAP_LABELS = ['0d', '1d', '2d', '3d', '4d', '5d+'];
const DURATION_BUCKETS = [
  { label: '0–1',  max: 1 },
  { label: '2–3',  max: 3 },
  { label: '4–5',  max: 5 },
  { label: '6–10', max: 10 },
  { label: '11–20', max: 20 },
  { label: '21+',  max: Infinity },
];

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, '0');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HistBucket { label: string; count: number }

export interface BowelMovement {
  hour:            string | null;      // 'H:MM', local wall clock
  amount:          string | null;
  quality:         string[];
  characteristics: string[];
  minutes:         number | null;
  score:           number | null;      // null before DAY_SCORE_START or when nothing recorded
}

export interface BowelDay {
  date:      string;
  score:     number | null;            // null before DAY_SCORE_START
  movements: BowelMovement[];          // chronological
  penalty:   number;                   // frequency penalty applied (0 when none)
  emptyDay:  number | null;            // Nth consecutive day without a movement; null on movement days
}

export interface ShareRow { value: string; count: number; share: number }        // share 0–100 of the pie
export interface SignRow  { value: string; count: number; pctOfMovements: number }

export interface BowelSummary {
  dates:        string[];               // every day in the period, ascending, up to yesterday
  periodDays:   number;
  movementDays: number;
  movements:    number;
  daysPerWeek:  number;
  lastMovement: { date: string; daysAgo: number } | null;   // as of today, all-time

  days:         BowelDay[];             // aligned to dates
  dayScore: {
    average:    number | null;          // over scored days
    scoredDays: number;
    badDays:    number;                 // score < BAD_DAY_BELOW
  };

  perDay:   { average: number; histogram: HistBucket[] };
  gap:      { average: number | null; histogram: HistBucket[]; currentGap: number };
  duration: { average: number | null; histogram: HistBucket[]; counted: number };

  quality:     ShareRow[];              // split ½ / ⅓ across multi-value movements; count rounded
  howItWent:   ShareRow[];              // movements from DAY_SCORE_START only
  otherSigns:  { rows: SignRow[]; movements: number };   // denominator = movements from DAY_SCORE_START
  timeOfDay:   { groups: (HistBucket & { key: string; range: string })[]; peak: string | null };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function utcDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return utcDateStr(t);
}

function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}-${pad2(n.getDate())}`;
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function clockMinutes(hour: string | null): number | null {
  if (!hour) return null;
  const [h, m] = hour.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function timeGroupOf(mins: number): (typeof TIME_GROUPS)[number] {
  if (mins < TIME_GROUPS[0].from) return TIME_GROUPS[TIME_GROUPS.length - 1];   // 00:00–04:59 = Night
  let g: (typeof TIME_GROUPS)[number] = TIME_GROUPS[0];
  for (const t of TIME_GROUPS) if (mins >= t.from) g = t;
  return g;
}

// ── Scores ────────────────────────────────────────────────────────────────────

export type ScoreTable = Record<'amount' | 'quality' | 'characteristics', Map<string, number>>;

export function scoreTableFrom(rows: { field: string; value: string; score: number }[]): ScoreTable {
  const t: ScoreTable = { amount: new Map(), quality: new Map(), characteristics: new Map() };
  for (const r of rows) t[r.field as keyof ScoreTable]?.set(r.value, r.score);
  return t;
}

function movementScore(t: ScoreTable, m: Omit<BowelMovement, 'score'>, date: string): number | null {
  if (date < DAY_SCORE_START) return null;
  if (!m.amount && !m.quality.length && !m.characteristics.length) return null;   // nothing recorded
  let s = m.amount ? t.amount.get(m.amount) ?? 0 : 0;
  for (const q of m.quality) s += t.quality.get(q) ?? 0;
  for (const c of m.characteristics) s += t.characteristics.get(c) ?? 0;
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function computeBowelSummary(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<BowelSummary> {
  const [scoreRows, docs] = await Promise.all([
    BowelScore.find({ userId }).lean(),
    Log.find(
      { userId, 'activity.category': '생리', 'activity.name': '대변' },
      { start: 1, bowel: 1, 'duration.totalSeconds': 1 },
    ).lean(),
  ]);
  const scores = scoreTableFrom(scoreRows as any[]);
  if (!scores.quality.size) {
    throw new Error('bowel_score is empty. Run `npm run migrate-bowel` first.');
  }
  return buildBowelSummary(docs as any[], scores, utcDateStr(periodStart), utcDateStr(periodEnd), localToday());
}

// Pure: every rule lives here, so it can be run against an export without a database.
// docs: raw log documents ({ start, bowel, duration }); dates are 'YYYY-MM-DD'.
export function buildBowelSummary(
  docs: any[],
  scores: ScoreTable,
  startStr: string,
  rawEnd: string,
  today: string,
): BowelSummary {
  const yesterday = addDays(today, -1);
  const endStr    = rawEnd < yesterday ? rawEnd : yesterday;
  const dates     = endStr < startStr ? [] : eachDate(startStr, endStr);

  // All movements, grouped by calendar day, chronological within the day
  const byDate = new Map<string, BowelMovement[]>();
  for (const d of docs) {
    const y = d.start?.year, mo = d.start?.month, day = d.start?.day;
    if (!y || !mo || !day) continue;
    const date = `${y}-${pad2(mo)}-${pad2(day)}`;
    const sec  = d.duration?.totalSeconds;
    const base = {
      hour:            d.start?.hour ?? null,
      amount:          d.bowel?.amount ?? null,
      quality:         Array.isArray(d.bowel?.quality) ? d.bowel.quality : [],
      characteristics: Array.isArray(d.bowel?.characteristics) ? d.bowel.characteristics : [],
      minutes:         typeof sec === 'number' && Number.isFinite(sec) ? Math.round(sec / 60) : null,
    };
    const mv: BowelMovement = { ...base, score: movementScore(scores, base, date) };
    const arr = byDate.get(date);
    if (arr) arr.push(mv); else byDate.set(date, [mv]);
  }
  for (const arr of byDate.values()) {
    arr.sort((a, b) => (clockMinutes(a.hour) ?? 0) - (clockMinutes(b.hour) ?? 0));
  }

  const allDates = [...byDate.keys()].sort();
  const firstEver = allDates[0] ?? null;
  const lastEver  = allDates.filter(d => d <= today).pop() ?? null;

  // Empty-day run length going into the period start: walk back from the day before.
  let run = 0;
  if (dates.length && firstEver && firstEver < startStr) {
    for (let d = addDays(startStr, -1); d >= firstEver && !byDate.has(d); d = addDays(d, -1)) run++;
  }
  // Before the first movement ever there is no gap to count
  const logStarted = (d: string) => firstEver !== null && d > firstEver;

  const days: BowelDay[] = [];
  const gapHist = new Array(GAP_LABELS.length).fill(0);
  let gapSum = 0, gapN = 0;

  for (const date of dates) {
    const mvs = byDate.get(date) ?? [];
    if (!mvs.length) {
      if (logStarted(date)) run++;
      days.push({
        date,
        score: date >= DAY_SCORE_START && logStarted(date) ? gapScore(run) : null,
        movements: [],
        penalty: 0,
        emptyDay: logStarted(date) ? run : null,
      });
      continue;
    }
    // Movement day: the gap before it is the run just ended (Drinking rest model)
    if (date !== firstEver) {
      gapHist[Math.min(run, GAP_LABELS.length - 1)]++;
      gapSum += run; gapN++;
    }
    run = 0;

    const scored  = mvs.map(m => m.score).filter((s): s is number => s !== null);
    const penalty = frequencyPenalty(mvs.length);
    const score   = date < DAY_SCORE_START
      ? null
      : r1((scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 0) + penalty);
    days.push({ date, score, movements: mvs, penalty, emptyDay: null });
  }

  const periodMvs = days.flatMap(d => d.movements.map(m => ({ ...m, date: d.date })));
  const movementDays = days.filter(d => d.movements.length).length;

  // Day score
  const scoredDays = days.filter(d => d.score !== null);
  const dayScore = {
    average:    scoredDays.length ? r1(scoredDays.reduce((s, d) => s + (d.score as number), 0) / scoredDays.length) : null,
    scoredDays: scoredDays.length,
    badDays:    scoredDays.filter(d => (d.score as number) < BAD_DAY_BELOW).length,
  };

  // Movements per day
  const perDayHist = new Array(PER_DAY_LABELS.length).fill(0);
  for (const d of days) perDayHist[Math.min(d.movements.length, PER_DAY_LABELS.length - 1)]++;

  // Duration
  const mins = periodMvs.map(m => m.minutes).filter((m): m is number => m !== null);
  const durHist = DURATION_BUCKETS.map(b => ({ label: b.label, count: 0 }));
  for (const m of mins) durHist[DURATION_BUCKETS.findIndex(b => m <= b.max)].count++;

  // Quality — each movement counts once, split evenly across its values
  const qAcc = new Map<string, number>();
  let qTotal = 0;
  for (const m of periodMvs) {
    if (!m.quality.length) continue;
    qTotal++;
    for (const q of m.quality) qAcc.set(q, (qAcc.get(q) ?? 0) + 1 / m.quality.length);
  }
  // Pie order: best to worst by score, ties by size
  const quality: ShareRow[] = [...qAcc.entries()]
    .sort((a, b) => (scores.quality.get(b[0]) ?? 0) - (scores.quality.get(a[0]) ?? 0) || b[1] - a[1])
    .map(([value, c]) => ({ value, count: Math.round(c), share: r1((c / qTotal) * 100) }));

  // Characteristics — only from DAY_SCORE_START
  const charMvs = periodMvs.filter(m => m.date >= DAY_SCORE_START);
  const howAcc = new Map<string, number>();
  const signAcc = new Map<string, number>();
  for (const m of charMvs) {
    const how = m.characteristics.find(c => (HOW_IT_WENT as readonly string[]).includes(c)) ?? HOW_NOT_RECORDED;
    howAcc.set(how, (howAcc.get(how) ?? 0) + 1);
    for (const c of new Set(m.characteristics)) {
      if ((HOW_IT_WENT as readonly string[]).includes(c)) continue;
      signAcc.set(c, (signAcc.get(c) ?? 0) + 1);
    }
  }
  const howItWent: ShareRow[] = [...HOW_IT_WENT, HOW_NOT_RECORDED]
    .filter(v => howAcc.get(v))
    .map(v => ({ value: v, count: howAcc.get(v)!, share: r1((howAcc.get(v)! / charMvs.length) * 100) }));
  const otherSigns = {
    movements: charMvs.length,
    rows: [...signAcc.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count, pctOfMovements: r1((count / charMvs.length) * 100) })),
  };

  // Time of day
  const tAcc = new Map<string, number>();
  for (const m of periodMvs) {
    const cm = clockMinutes(m.hour);
    if (cm === null) continue;
    const g = timeGroupOf(cm);
    tAcc.set(g.key, (tAcc.get(g.key) ?? 0) + 1);
  }
  const groups = TIME_GROUPS.map(g => ({ key: g.key, label: g.label, range: g.range, count: tAcc.get(g.key) ?? 0 }));
  const top = groups.reduce<(typeof groups)[number] | null>((b, g) => (g.count && (!b || g.count > b.count) ? g : b), null);

  // Open gap at the end of the period (empty days up to and including the last day)
  let currentGap = 0;
  for (let i = days.length - 1; i >= 0 && !days[i].movements.length && days[i].emptyDay !== null; i--) currentGap++;

  return {
    dates,
    periodDays:   dates.length,
    movementDays,
    movements:    periodMvs.length,
    daysPerWeek:  dates.length ? r1((movementDays / dates.length) * 7) : 0,
    lastMovement: lastEver ? { date: lastEver, daysAgo: diffDays(today, lastEver) } : null,

    days,
    dayScore,

    perDay: {
      average:   dates.length ? r2(periodMvs.length / dates.length) : 0,
      histogram: PER_DAY_LABELS.map((label, i) => ({ label, count: perDayHist[i] })),
    },
    gap: {
      average:   gapN ? r2(gapSum / gapN) : null,
      histogram: GAP_LABELS.map((label, i) => ({ label, count: gapHist[i] })),
      currentGap,
    },
    duration: {
      average: mins.length ? r1(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
      histogram: durHist,
      counted: mins.length,
    },

    quality,
    howItWent,
    otherSigns,
    timeOfDay: { groups, peak: top ? top.key : null },
  };
}

// ── Trend ─────────────────────────────────────────────────────────────────────
//
// Every bucket IS a Summary: buildBowelSummary runs once per bucket over the
// bucket's own dates (clamped to the window). No rule is restated here, so a
// Month bucket always agrees with the Summary for that month — gaps and the
// first movement day look back past the bucket start exactly as they look back
// past a period start. One extra run over the whole window picks the Other
// signs bands, so the bands are the same in every bucket.
//
// ~3.5k records × at most a few hundred buckets — cheap, and it keeps the
// rules in one place.

export const TREND_SIGN_TOP = 6;
export const TREND_SIGN_OTHER = 'Other';

// Quality bands, bottom → top: hard → normal → loose. An ordinal scale, so the
// view keeps this order rather than sorting by size. A value not listed here
// (new in the Bowel sheet) is appended after 설사 rather than dropped.
export const QUALITY_ORDER = ['토끼똥', '딱딱함', '푸석함', '가늠', '좋음', '보통', '무름', '묽음', '설사'] as const;

export interface BowelTrendBucket {
  label:        string;
  start:        string;             // bucket start, YYYY-MM-DD
  end:          string;             // last day counted (clamped to the window)
  daysInBucket: number;
  movementDays: number;
  movements:    number;
  score: {
    average:    number | null;
    scoredDays: number;
    badDays:    number;
    badShare:   number | null;      // % of scored days below BAD_DAY_BELOW
    worst:      { date: string; score: number } | null;
  };
  perDay:   { average: number;        counts: number[] };   // aligned to perDayLabels
  gap:      { average: number | null; counts: number[] };   // aligned to gapLabels
  duration: { average: number | null; counts: number[]; counted: number };  // aligned to durationLabels
  quality:  Record<string, number>;   // value → share % (½ / ⅓ split), as the Summary pie
  qualityCount: number;               // movements with a quality recorded
  howItWent: Record<string, number>;  // value → movements, incl. HOW_NOT_RECORDED
  otherSigns: { movements: number; pct: Record<string, number> };  // signKeys + TREND_SIGN_OTHER → % of movements
  timeOfDay: Record<string, number>;  // group key → movements
}

export interface BowelTrend {
  grain:          TrendGrain;
  windowStart:    string;
  windowEnd:      string;
  perDayLabels:   string[];
  gapLabels:      string[];
  durationLabels: string[];
  qualityOrder:   string[];
  signKeys:       string[];           // top signs over the window, largest first; Other last when used
  timeGroups:     { key: string; label: string; range: string }[];
  buckets:        BowelTrendBucket[];
}

export async function computeBowelTrend(
  userId: string,
  grain: TrendGrain,
  windowStart: Date,
  windowEnd: Date,
): Promise<BowelTrend> {
  const [scoreRows, docs] = await Promise.all([
    BowelScore.find({ userId }).lean(),
    Log.find(
      { userId, 'activity.category': '생리', 'activity.name': '대변' },
      { start: 1, bowel: 1, 'duration.totalSeconds': 1 },
    ).lean(),
  ]);
  const scores = scoreTableFrom(scoreRows as any[]);
  if (!scores.quality.size) {
    throw new Error('bowel_score is empty. Run `npm run migrate-bowel` first.');
  }
  return buildBowelTrend(docs as any[], scores, grain, ymd(windowStart), ymd(windowEnd), localToday());
}

// Pure, like buildBowelSummary: runs against an export without a database.
export function buildBowelTrend(
  docs: any[],
  scores: ScoreTable,
  grain: TrendGrain,
  startStr: string,
  endStr: string,
  today: string,
): BowelTrend {
  const toDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return fromYMD(y, m, d); };
  const ws = toDate(startStr);
  const we = toDate(endStr);

  // Other signs bands: fixed over the whole window
  const whole = buildBowelSummary(docs, scores, startStr, endStr, today);
  const topSigns = whole.otherSigns.rows.slice(0, TREND_SIGN_TOP).map(r => r.value);
  const hasOther = whole.otherSigns.rows.length > TREND_SIGN_TOP;
  const signKeys = hasOther ? [...topSigns, TREND_SIGN_OTHER] : topSigns;

  const qualityOrder: string[] = [...QUALITY_ORDER];
  for (const q of whole.quality) if (!qualityOrder.includes(q.value)) qualityOrder.push(q.value);

  const buckets: BowelTrendBucket[] = buildBucketStarts(grain, ws, we).map(bs => {
    const be = new Date(bs);
    if (grain === 'week') be.setUTCDate(be.getUTCDate() + 6);
    else if (grain === 'month') { be.setUTCMonth(be.getUTCMonth() + 1); be.setUTCDate(be.getUTCDate() - 1); }
    const bEnd = be > we ? we : be;

    const s = buildBowelSummary(docs, scores, ymd(bs), ymd(bEnd), today);

    let worst: { date: string; score: number } | null = null;
    for (const d of s.days) {
      if (d.score !== null && (worst === null || d.score < worst.score)) worst = { date: d.date, score: d.score };
    }

    const pct: Record<string, number> = {};
    for (const k of topSigns) pct[k] = 0;
    if (hasOther) pct[TREND_SIGN_OTHER] = 0;
    for (const r of s.otherSigns.rows) {
      const k = topSigns.includes(r.value) ? r.value : TREND_SIGN_OTHER;
      if (k in pct) pct[k] = r1(pct[k] + r.pctOfMovements);
    }

    return {
      label:        bucketLabel(grain, bs),
      start:        ymd(bs),
      end:          s.dates.length ? s.dates[s.dates.length - 1] : ymd(bEnd),
      daysInBucket: bucketDayCount(grain, bs, ws, we),
      movementDays: s.movementDays,
      movements:    s.movements,
      score: {
        ...s.dayScore,
        badShare: s.dayScore.scoredDays ? r1((s.dayScore.badDays / s.dayScore.scoredDays) * 100) : null,
        worst,
      },
      perDay:   { average: s.perDay.average, counts: s.perDay.histogram.map(h => h.count) },
      gap:      { average: s.gap.average, counts: s.gap.histogram.map(h => h.count) },
      duration: { average: s.duration.average, counts: s.duration.histogram.map(h => h.count), counted: s.duration.counted },
      quality:  Object.fromEntries(s.quality.map(q => [q.value, q.share])),
      qualityCount: s.days.reduce((n, d) => n + d.movements.filter(m => m.quality.length).length, 0),
      howItWent: Object.fromEntries(s.howItWent.map(h => [h.value, h.count])),
      otherSigns: { movements: s.otherSigns.movements, pct },
      timeOfDay: Object.fromEntries(s.timeOfDay.groups.map(g => [g.key, g.count])),
    };
  });

  // Drop leading buckets before the log begins (the Sleep rule). Interior and
  // trailing empty buckets stay: they are facts about those buckets.
  const first = buckets.findIndex(b => b.movements > 0);
  const trimmed = first <= 0 ? buckets : buckets.slice(first);

  return {
    grain,
    windowStart:    trimmed.length ? trimmed[0].start : startStr,
    windowEnd:      endStr,
    perDayLabels:   [...PER_DAY_LABELS],
    gapLabels:      [...GAP_LABELS],
    durationLabels: DURATION_BUCKETS.map(b => b.label),
    qualityOrder,
    signKeys,
    timeGroups:     TIME_GROUPS.map(g => ({ key: g.key, label: g.label, range: g.range })),
    buckets:        trimmed,
  };
}
