// src/lib/insights/trend-window.ts
//
// Shared grain × bucket-count window machinery for the trend views converted
// to the Weight-style model (Interactions first; Drinking and Diet follow).
// Weight and Exercise keep their own private copies for now — this module is
// the extraction those copies signalled; they can adopt it when next touched.
//
// Date convention: every Date in this module is a UTC-midnight instant that
// REPRESENTS a local calendar day. All arithmetic uses the UTC accessors, so
// no DST change can shift a bucket boundary — the same discipline as the
// exercise trend.

export type TrendGrain = 'day' | 'week' | 'month';

export function parseGrain(raw: string | null, fallback: TrendGrain = 'week'): TrendGrain {
  return raw === 'day' || raw === 'week' || raw === 'month' ? raw : fallback;
}

/** YYYY-MM-DD from a UTC-midnight date. */
export function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** UTC-midnight date from local calendar components. */
export function fromYMD(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Today as a UTC-midnight date representing the local calendar day. */
export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * The window anchor: min(end of the selected filter period, today).
 * periodEnd comes from buildDateRange, which returns a UTC instant — the
 * calendar date must be read from its UTC fields. Reading it locally would
 * turn 2026-07-31T23:59:59.999Z into 1 August under BST and shift every
 * bucket boundary by one.
 */
export function anchorFrom(periodEnd: Date): Date {
  const periodAnchor = new Date(Date.UTC(
    periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate(),
  ));
  const today = todayUTC();
  return periodAnchor < today ? periodAnchor : today;
}

/**
 * Resolve the window: count back from the anchor, landing the start on a
 * bucket boundary (Monday / the 1st) so the first bucket is whole rather
 * than a partial edge. end is the anchor day itself (inclusive).
 */
export function resolveWindow(
  grain: TrendGrain,
  count: number,
  anchor: Date,
): { start: Date; end: Date } {
  const end = new Date(anchor);
  const start = new Date(end);
  if (grain === 'day') {
    start.setUTCDate(start.getUTCDate() - (count - 1));
  } else if (grain === 'week') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // back to Monday
    start.setUTCDate(start.getUTCDate() - (count - 1) * 7);
  } else {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - (count - 1));
  }
  return { start, end };
}

/** The start of the bucket a given local calendar day falls into. */
export function bucketStartFor(grain: TrendGrain, year: number, month: number, day: number): Date {
  const d = fromYMD(year, month, day);
  if (grain === 'day') return d;
  if (grain === 'week') {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
    return d;
  }
  d.setUTCDate(1);
  return d;
}

/** All bucket starts in the window, oldest to newest. */
export function buildBucketStarts(grain: TrendGrain, start: Date, end: Date): Date[] {
  const starts: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    starts.push(new Date(cursor));
    if (grain === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (grain === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return starts;
}

/**
 * How many days of a bucket fall inside the window — a bucket straddling
 * the window edge counts only its real days, so per-day ratios stay honest.
 */
export function bucketDayCount(
  grain: TrendGrain,
  bucketStart: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const bucketEnd = new Date(bucketStart);
  if (grain === 'day') {
    // single day
  } else if (grain === 'week') {
    bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 6);
  } else {
    bucketEnd.setUTCMonth(bucketEnd.getUTCMonth() + 1);
    bucketEnd.setUTCDate(bucketEnd.getUTCDate() - 1);
  }
  const from = bucketStart < windowStart ? windowStart : bucketStart;
  const to = bucketEnd > windowEnd ? windowEnd : bucketEnd;
  if (to < from) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
}

/** ISO week (Jan-4 based), matching the project's existing convention. */
export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of this ISO week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(
    ((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7,
  );
  return { year, week };
}

/**
 * Bucket label in the raw forms formatBucketLabels expects:
 * month → yy.mm · week → yyWww · day → mm-dd.
 * The grain is echoed in every trend response, so views format labels from
 * the payload's grain, never from the control's — the lesson from the
 * one-frame label mismatch in the Exercise trend.
 */
export function bucketLabel(grain: TrendGrain, bucketStart: Date): string {
  if (grain === 'month') {
    const yy = String(bucketStart.getUTCFullYear() % 100).padStart(2, '0');
    const mm = String(bucketStart.getUTCMonth() + 1).padStart(2, '0');
    return `${yy}.${mm}`;
  }
  if (grain === 'week') {
    const { year, week } = isoWeek(bucketStart);
    const yy = String(year % 100).padStart(2, '0');
    return `${yy}W${String(week).padStart(2, '0')}`;
  }
  const mm = String(bucketStart.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(bucketStart.getUTCDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}
