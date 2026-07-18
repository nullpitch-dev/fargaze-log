// src/lib/insights/weight.ts
// WBS #54 — Weight widget compute module.

import Log from '@/models/Log';
import { percentile } from './util';

/**
 * Conventions:
 *  - Date filtering uses the local date fields (start.year/month/day) via
 *    $expr + $dateFromParts, never start.datetime (UTC). periodStart/periodEnd
 *    come straight from buildDateRange() in dates.ts.
 *  - No 6am day-boundary rule here. Weigh-ins happen in the morning, so a
 *    06:30 reading belongs to its own calendar day; assignDrinkingDate()
 *    would roll it backwards incorrectly.
 *  - Multiple readings on one day are averaged into a single per-day value,
 *    so a double weigh-in day does not get double weight in the box plot.
 *  - bodyFatPercent may arrive as a percent (21.1) or a decimal (0.211).
 *    Both are normalised to a percent number at the boundary, so the widget
 *    never has to think about the conversion.
 *
 * Scope split:
 *  - weightBox and avgComposition are scoped to the global filter period.
 *  - latest is the most recent measurement EVER, ignoring the period, because
 *    comparing a past month's average against that same month's final reading
 *    tells you nothing useful. crossActivities still applies to both, so the
 *    two bars never differ in scope along that axis.
 *
 * Segment semantics (InBody Dial):
 *    체중        weight       = total
 *    골격근량    muscleMass   = SKELETAL muscle only — bone is NOT included
 *    체지방량    bodyFat      = weight × bodyFatPercent (derived in the sheet)
 *    기타        other        = weight − muscleMass − bodyFat
 *                             = other lean mass: organs, body water outside
 *                               skeletal muscle, smooth/cardiac muscle, and
 *                               bone mineral. A legitimate ~34% component,
 *                               not a residual error bucket.
 *
 * Pre-InBody records carry weight only. Those days still drive the box plot,
 * and both composition bars still render — as a single un-segmented weight
 * bar (hasComposition = false) rather than disappearing.
 */

export interface WeightBox {
  min: number;
  max: number;
  avg: number;
  p25: number;
  p75: number;
  n: number;
}

export interface Composition {
  weight: number;
  /** null on pre-InBody days — render a single un-segmented bar */
  muscleMass: number | null;
  bodyFat: number | null;
  other: number | null;
  bodyFatPercent: number | null;
  musclePct: number | null;
  fatPct: number | null;
  otherPct: number | null;
  hasComposition: boolean;
}

export interface WeightSummary {
  weightBox: WeightBox | null;
  avgComposition: (Composition & { n: number }) | null;
  /** most recent measurement overall — may fall outside the filter period */
  latest: (Composition & { date: string }) | null;
  deltaFromAvg: {
    weight: number;
    muscleMass: number | null;
    bodyFat: number | null;
    bodyFatPercent: number | null;
  } | null;
  /** shared max across the two composition bars, so their lengths compare */
  compositionMax: number | null;
}

interface DayRecord {
  date: string;
  weight: number;
  muscleMass: number | null;
  bodyFat: number | null;
  bodyFatPercent: number | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pad = (n: number) => String(n).padStart(2, '0');

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const SELECT_FIELDS = 'start.year start.month start.day body';

/** Match shared by both the period query and the latest-ever query. */
function baseMatch(userId: string, crossActivities: string[]): Record<string, unknown> {
  const m: Record<string, unknown> = {
    userId,
    'body.weight': { $exists: true, $ne: null },
  };
  if (crossActivities.length > 0) {
    m['activity.crossActivity'] = { $in: crossActivities };
  }
  return m;
}

/**
 * Collapse raw log documents into one record per calendar day, averaging any
 * repeat readings. Shared by the period path and the latest-ever path so the
 * two can never drift apart.
 */
function collapseToDays(docs: any[]): DayRecord[] {
  const byDay = new Map<
    string,
    { weight: number[]; muscleMass: number[]; bodyFat: number[]; bodyFatPercent: number[] }
  >();

  for (const d of docs) {
    const s = d.start;
    if (!s?.year || !s?.month || !s?.day) continue;

    const key = `${s.year}-${pad(s.month)}-${pad(s.day)}`;
    if (!byDay.has(key)) {
      byDay.set(key, { weight: [], muscleMass: [], bodyFat: [], bodyFatPercent: [] });
    }
    const slot = byDay.get(key)!;
    const b = d.body ?? {};

    if (typeof b.weight === 'number') slot.weight.push(b.weight);
    if (typeof b.muscleMass === 'number') slot.muscleMass.push(b.muscleMass);
    if (typeof b.bodyFat === 'number') slot.bodyFat.push(b.bodyFat);
    if (typeof b.bodyFatPercent === 'number') slot.bodyFatPercent.push(b.bodyFatPercent);
  }

  const days: DayRecord[] = [];
  for (const [date, slot] of byDay) {
    if (slot.weight.length === 0) continue;

    const weight = mean(slot.weight);
    const bodyFatPercent =
      slot.bodyFatPercent.length > 0 ? mean(slot.bodyFatPercent) : null;

    // bodyFat is a derived column in the sheet; if it is missing but the
    // percentage is present, recover it rather than dropping the day.
    let bodyFat = slot.bodyFat.length > 0 ? mean(slot.bodyFat) : null;
    if (bodyFat == null && bodyFatPercent != null) {
      bodyFat = weight * bodyFatPercent;
    }

    days.push({
      date,
      weight,
      muscleMass: slot.muscleMass.length > 0 ? mean(slot.muscleMass) : null,
      bodyFat,
      bodyFatPercent,
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

/**
 * Build a Composition. When muscleMass or bodyFat is missing the result is a
 * weight-only composition (hasComposition = false) rather than null, so the
 * widget can always render a bar.
 */
function buildComposition(
  weight: number,
  muscleMass: number | null,
  bodyFat: number | null,
  bodyFatPercent: number | null,
): Composition {
  if (muscleMass == null || bodyFat == null || weight <= 0) {
    return {
      weight: r1(weight),
      muscleMass: null,
      bodyFat: null,
      other: null,
      bodyFatPercent: null,
      musclePct: null,
      fatPct: null,
      otherPct: null,
      hasComposition: false,
    };
  }

  const other = weight - muscleMass - bodyFat;
  // May arrive as a percent (21.1) or a decimal (0.211). Body fat is never
  // below 1%, so a value under 1 is unambiguously a decimal.
  const rawPct = bodyFatPercent != null ? bodyFatPercent : bodyFat / weight;
  const pct = rawPct < 1 ? rawPct * 100 : rawPct;

  return {
    weight: r1(weight),
    muscleMass: r1(muscleMass),
    bodyFat: r1(bodyFat),
    other: r1(other),
    bodyFatPercent: r1(pct),
    musclePct: r1((muscleMass / weight) * 100),
    fatPct: r1((bodyFat / weight) * 100),
    otherPct: r1((other / weight) * 100),
    hasComposition: true,
  };
}

/** Most recent day carrying a weight reading, ignoring the filter period. */
async function findLatestDay(base: Record<string, unknown>): Promise<DayRecord | null> {
  const newest: any = await Log.findOne(base)
    .sort({ 'start.year': -1, 'start.month': -1, 'start.day': -1 })
    .select('start.year start.month start.day')
    .lean();

  if (!newest?.start) return null;
  const s = newest.start;

  // Re-fetch that whole day so repeat readings are averaged the same way.
  const dayDocs = await Log.find({
    ...base,
    'start.year': s.year,
    'start.month': s.month,
    'start.day': s.day,
  })
    .select(SELECT_FIELDS)
    .lean();

  return collapseToDays(dayDocs as any[])[0] ?? null;
}

export async function computeWeightSummary(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  crossActivities: string[] = [],
): Promise<WeightSummary> {
  const dayExpr = {
    $dateFromParts: {
      year: '$start.year',
      month: '$start.month',
      day: '$start.day',
    },
  };

  const base = baseMatch(userId, crossActivities);

  const periodMatch = {
    ...base,
    $expr: {
      $and: [
        { $gte: [dayExpr, periodStart] },
        { $lte: [dayExpr, periodEnd] },
      ],
    },
  };

  const docs = await Log.find(periodMatch).select(SELECT_FIELDS).lean();
  const days = collapseToDays(docs as any[]);

  if (days.length === 0) {
    return {
      weightBox: null,
      avgComposition: null,
      latest: null,
      deltaFromAvg: null,
      compositionMax: null,
    };
  }

  // ---- 1. weight box plot — period scoped ----
  const weights = days.map((d) => d.weight).sort((a, b) => a - b);

  const weightBox: WeightBox = {
    min: r1(weights[0]),
    max: r1(weights[weights.length - 1]),
    avg: r1(mean(weights)),
    p25: r1(percentile(weights, 25)),
    p75: r1(percentile(weights, 75)),
    n: weights.length,
  };

  // ---- 2. average body composition — period scoped ----
  // If any day carries a full triple, the average is taken over those days
  // ONLY, so the segments always sum exactly to the bar's total. Otherwise
  // (pre-InBody range) it falls back to a weight-only average over all days.
  const fullDays = days.filter((d) => d.muscleMass != null && d.bodyFat != null);
  const basis = fullDays.length > 0 ? fullDays : days;

  const avgComposition: Composition & { n: number } = {
    ...buildComposition(
      mean(basis.map((d) => d.weight)),
      fullDays.length > 0 ? mean(fullDays.map((d) => d.muscleMass as number)) : null,
      fullDays.length > 0 ? mean(fullDays.map((d) => d.bodyFat as number)) : null,
      // Deliberately null: buildComposition then derives the percentage as
      // mean(bodyFat) / mean(weight), so the widget shows ONE fat percentage
      // that agrees with the three segment shares.
      null,
    ),
    n: basis.length,
  };

  // ---- 3. latest measurement — NOT period scoped ----
  const latestDay = await findLatestDay(base);

  const latest: (Composition & { date: string }) | null = latestDay
    ? {
        ...buildComposition(
          latestDay.weight,
          latestDay.muscleMass,
          latestDay.bodyFat,
          latestDay.bodyFatPercent,
        ),
        date: latestDay.date,
      }
    : null;

  // ---- deltas + shared bar scale ----
  const bothSegmented = !!latest?.hasComposition && avgComposition.hasComposition;

  const deltaFromAvg = latest
    ? {
        weight: r1(latest.weight - avgComposition.weight),
        muscleMass: bothSegmented
          ? r1((latest.muscleMass as number) - (avgComposition.muscleMass as number))
          : null,
        bodyFat: bothSegmented
          ? r1((latest.bodyFat as number) - (avgComposition.bodyFat as number))
          : null,
        bodyFatPercent: bothSegmented
          ? r1((latest.bodyFatPercent as number) - (avgComposition.bodyFatPercent as number))
          : null,
      }
    : null;

  const compositionMax = latest
    ? Math.max(latest.weight, avgComposition.weight)
    : avgComposition.weight;

  return { weightBox, avgComposition, latest, deltaFromAvg, compositionMax };
}

// ── Trend ─────────────────────────────────────────────────────────────────────
/**
 * Trend conventions (WBS #54, Trend view):
 *  - Buckets count back from `end` (default: today), NOT from the latest
 *    measurement. A two-week gap in weigh-ins must show as empty recent
 *    buckets rather than silently sliding a stale reading to the right edge.
 *  - Leading empty buckets are trimmed; interior empty buckets are kept.
 *    A gap inside the data is information; blank width before the data
 *    starts is not.
 *  - `weight` averages ALL days in the bucket. `composition` averages only
 *    days carrying a full triple, and its own `weight` is the average over
 *    those days. So the segments always sum exactly to composition.weight.
 *    In a mixed bucket the total line and the fill top differ slightly —
 *    that divergence is the pre-InBody boundary, and it is deliberate.
 *  - Buckets with no composition days at all carry composition = null. The
 *    chart draws the total line across them and starts the fill later.
 */

export type WeightGranularity = 'day' | 'week' | 'month';

export interface WeightTrendBucket {
  /** display label — 'YYYY-MM-DD' (day/week start) or 'YYYY-MM' (month) */
  label: string;
  /** inclusive bucket bounds, local calendar dates */
  start: string;
  end: string;
  /** average weight over every day in the bucket; null when the bucket is empty */
  weight: number | null;
  /** days carrying a weight reading */
  n: number;
  /** averaged over full-triple days only; null when the bucket has none */
  composition: (Composition & { n: number }) | null;
}

export interface WeightTrend {
  granularity: WeightGranularity;
  /** resolved range actually returned, after leading-empty trimming */
  rangeStart: string | null;
  rangeEnd: string | null;
  buckets: WeightTrendBucket[];
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday of the week containing d. */
function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // Mon = 0
  out.setDate(out.getDate() - dow);
  return out;
}

/**
 * Ordered bucket bounds, oldest → newest, ending with the bucket that
 * contains `anchor`.
 */
function buildBuckets(
  granularity: WeightGranularity,
  anchor: Date,
  count: number,
): { label: string; start: Date; end: Date }[] {
  const out: { label: string; start: Date; end: Date }[] = [];

  for (let i = count - 1; i >= 0; i--) {
    let start: Date;
    let end: Date;
    let label: string;

    if (granularity === 'day') {
      start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - i);
      end = start;
      label = dateKey(start);
    } else if (granularity === 'week') {
      const base = startOfWeek(anchor);
      start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i * 7);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      label = dateKey(start);
    } else {
      start = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      label = `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
    }

    out.push({ label, start, end });
  }

  return out;
}

export async function computeWeightTrend(
  userId: string,
  granularity: WeightGranularity,
  buckets: number,
  end: Date | null = null,
  crossActivities: string[] = [],
): Promise<WeightTrend> {
  const anchorRaw = end ?? new Date();
  const anchor = new Date(
    anchorRaw.getFullYear(),
    anchorRaw.getMonth(),
    anchorRaw.getDate(),
  );

  const count = Math.max(1, Math.min(buckets, 400));
  const bounds = buildBuckets(granularity, anchor, count);

  const rangeFrom = bounds[0].start;
  const rangeTo = bounds[bounds.length - 1].end;

  const dayExpr = {
    $dateFromParts: {
      year: '$start.year',
      month: '$start.month',
      day: '$start.day',
    },
  };

  const base = baseMatch(userId, crossActivities);

  // One query for the whole span; bucketing happens in memory. Cheaper than
  // N round trips and keeps the day-collapsing logic in a single place.
  const docs = await Log.find({
    ...base,
    $expr: {
      $and: [
        { $gte: [dayExpr, rangeFrom] },
        { $lte: [dayExpr, rangeTo] },
      ],
    },
  })
    .select(SELECT_FIELDS)
    .lean();

  const days = collapseToDays(docs as any[]); // already sorted ascending

  // Walk days and buckets together — both are sorted, so one pass suffices.
  const perBucket: DayRecord[][] = bounds.map(() => []);
  let bi = 0;
  for (const day of days) {
    while (bi < bounds.length && day.date > dateKey(bounds[bi].end)) bi++;
    if (bi >= bounds.length) break;
    if (day.date >= dateKey(bounds[bi].start)) perBucket[bi].push(day);
  }

  const all: WeightTrendBucket[] = bounds.map((b, i) => {
    const rows = perBucket[i];

    if (rows.length === 0) {
      return {
        label: b.label,
        start: dateKey(b.start),
        end: dateKey(b.end),
        weight: null,
        n: 0,
        composition: null,
      };
    }

    const fullDays = rows.filter((d) => d.muscleMass != null && d.bodyFat != null);

    const composition =
      fullDays.length > 0
        ? {
            ...buildComposition(
              mean(fullDays.map((d) => d.weight)),
              mean(fullDays.map((d) => d.muscleMass as number)),
              mean(fullDays.map((d) => d.bodyFat as number)),
              // null on purpose — the percentage is derived from the averaged
              // segments so it agrees with the three shares, exactly as in
              // avgComposition above.
              null,
            ),
            n: fullDays.length,
          }
        : null;

    return {
      label: b.label,
      start: dateKey(b.start),
      end: dateKey(b.end),
      weight: r1(mean(rows.map((d) => d.weight))),
      n: rows.length,
      composition,
    };
  });

  // Trim leading empties only.
  const first = all.findIndex((b) => b.n > 0);
  const trimmed = first === -1 ? [] : all.slice(first);

  return {
    granularity,
    rangeStart: trimmed.length > 0 ? trimmed[0].start : null,
    rangeEnd: trimmed.length > 0 ? trimmed[trimmed.length - 1].end : null,
    buckets: trimmed,
  };
}
