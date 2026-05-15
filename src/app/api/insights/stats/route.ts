// src/app/api/insights/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

// ── Constants ─────────────────────────────────────────────────────────────────

const SLEEP_THRESHOLD_HOUR = 6; // entries starting before 6am → previous day

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUALITY_SCORE: Record<string, number> = {
  '좋음': 1,
  '보통': 0,
  '나쁨': -1,
};

/**
 * Convert a start.hour string like "23:30" or "1:45" to total minutes since midnight.
 * Returns null if the string is missing or unparseable.
 */
function hourStringToMinutes(hourStr: string | null | undefined): number | null {
  if (!hourStr) return null;
  const [hPart, mPart] = hourStr.split(':');
  const h = parseInt(hPart);
  const m = parseInt(mPart ?? '0');
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Apply the 6am threshold: if the hour (in minutes) is before 6am (< 360),
 * treat it as belonging to the previous calendar day by adding 24h (1440 min).
 * This ensures that e.g. 2:00am → 26:00 for averaging purposes.
 */
function applyMidnightThreshold(minutes: number): number {
  return minutes < SLEEP_THRESHOLD_HOUR * 60 ? minutes + 1440 : minutes;
}

/**
 * Format total minutes back to a "HH:MM" clock string, wrapping past 24h.
 * e.g. 26*60 → "02:00"
 */
function minutesToClock(minutes: number): string {
  const wrapped = Math.round(minutes) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Given a sleep document's start year/month/day and hour string,
 * compute the "assigned date" applying the 6am threshold.
 * Returns { year, month, day } of the assigned date.
 */
function assignedDate(
  year: number,
  month: number,
  day: number,
  hourStr: string | null | undefined,
): { year: number; month: number; day: number } {
  const mins = hourStringToMinutes(hourStr);
  if (mins === null) return { year, month, day };
  // If before 6am → belongs to previous day
  if (mins < SLEEP_THRESHOLD_HOUR * 60) {
    const d = new Date(year, month - 1, day - 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  return { year, month, day };
}

/**
 * Get the ISO week number and year for a given date.
 */
function isoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const isoWeekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  return { isoYear: d.getFullYear(), isoWeek: isoWeekNum };
}

// ── Date range from timeMode + timePeriod + bucketsBack ───────────────────────

/**
 * For Summary mode: compute dateFrom/dateTo from timeMode + timePeriod.
 * timePeriod format:
 *   month → "YYYY-MM"
 *   week  → "YYYY-Www" (ISO week, e.g. "2026-W20")
 *   day   → "YYYY-MM-DD"
 *   period → not used here (caller passes dateFrom/dateTo directly)
 */
function summaryRange(
  timeMode: string,
  timePeriod: string,
): { dateFrom: Date; dateTo: Date } | null {
  if (timeMode === 'month') {
    const [y, m] = timePeriod.split('-').map(Number);
    if (!y || !m) return null;
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59);
    return { dateFrom: from, dateTo: to };
  }
  if (timeMode === 'week') {
    // timePeriod: "2026-W20"
    const match = timePeriod.match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) return null;
    const y = parseInt(match[1]);
    const w = parseInt(match[2]);
    // ISO week Monday
    const jan4 = new Date(y, 0, 4);
    const dayOfWeek = (jan4.getDay() + 6) % 7; // Mon=0
    const monday = new Date(jan4.getTime() - dayOfWeek * 86400000 + (w - 1) * 7 * 86400000);
    const sunday = new Date(monday.getTime() + 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 59000);
    return { dateFrom: monday, dateTo: sunday };
  }
  if (timeMode === 'day') {
    const from = new Date(timePeriod);
    const to = new Date(timePeriod);
    to.setHours(23, 59, 59);
    return { dateFrom: from, dateTo: to };
  }
  return null;
}

/**
 * For Trend mode: compute an array of { label, dateFrom, dateTo } buckets
 * going back `bucketsBack` units from the anchor period (inclusive of anchor).
 */
function trendBuckets(
  timeMode: string,
  timePeriod: string,
  bucketsBack: number,
): { label: string; dateFrom: Date; dateTo: Date }[] {
  const buckets: { label: string; dateFrom: Date; dateTo: Date }[] = [];

  if (timeMode === 'month') {
    const [y, m] = timePeriod.split('-').map(Number);
    for (let i = bucketsBack - 1; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const from = new Date(d.getFullYear(), d.getMonth(), 1);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      buckets.push({ label, dateFrom: from, dateTo: to });
    }
  } else if (timeMode === 'week') {
    const match = timePeriod.match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) return [];
    const anchorRange = summaryRange('week', timePeriod);
    if (!anchorRange) return [];
    for (let i = bucketsBack - 1; i >= 0; i--) {
      const monday = new Date(anchorRange.dateFrom.getTime() - i * 7 * 86400000);
      const sunday = new Date(monday.getTime() + 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 59000);
      const { isoYear, isoWeek: wNum } = isoWeek(monday);
      const label = `${isoYear}-W${String(wNum).padStart(2, '0')}`;
      buckets.push({ label, dateFrom: monday, dateTo: sunday });
    }
  } else if (timeMode === 'day') {
    const anchor = new Date(timePeriod);
    for (let i = bucketsBack - 1; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * 86400000);
      const label = d.toISOString().slice(0, 10);
      const from = new Date(d);
      from.setHours(0, 0, 0, 0);
      const to = new Date(d);
      to.setHours(23, 59, 59, 999);
      buckets.push({ label, dateFrom: from, dateTo: to });
    }
  }

  return buckets;
}

// ── Sleep aggregation ─────────────────────────────────────────────────────────

interface SleepDoc {
  start: { year: number; month: number; day: number; hour: string };
  end: { hour: string };
  duration: { totalSeconds: number };
  sleep: { quality: string };
}

/**
 * Fetch all sleep entries within a date window and return them with the
 * assigned date applied (6am threshold).
 */
async function fetchSleepDocs(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  crossActivities?: string[],
): Promise<SleepDoc[]> {
  const match: any = {
    userId,
    'activity.category': '생리',
    'activity.name': '수면',
    'start.datetime': { $gte: dateFrom, $lte: dateTo },
  };
  if (crossActivities && crossActivities.length > 0) {
    match['activity.crossActivity'] = { $in: crossActivities };
  }

  return Log.find(match)
    .select('start.year start.month start.day start.hour end.hour duration.totalSeconds sleep.quality')
    .lean() as Promise<SleepDoc[]>;
}

/**
 * Compute summary stats from a list of sleep docs.
 */
function computeSleepSummary(docs: SleepDoc[]) {
  if (docs.length === 0) return null;

  const durations = docs
    .map(d => d.duration?.totalSeconds)
    .filter((s): s is number => !!s && s >= 3600);

  const bedtimeMins = docs
    .map(d => {
      const mins = hourStringToMinutes(d.start?.hour);
      return mins !== null ? applyMidnightThreshold(mins) : null;
    })
    .filter((m): m is number => m !== null);

  const waketimeMins = docs
    .map(d => {
      const mins = hourStringToMinutes(d.end?.hour);
      return mins !== null ? mins : null;
    })
    .filter((m): m is number => m !== null);

  const qualityScores = docs
    .map(d => QUALITY_SCORE[d.sleep?.quality])
    .filter((s): s is number => s !== undefined);

  const qualityCounts = { '좋음': 0, '보통': 0, '나쁨': 0 };
  docs.forEach(d => {
    const q = d.sleep?.quality;
    if (q in qualityCounts) qualityCounts[q as keyof typeof qualityCounts]++;
  });

  return {
    count: docs.length,
    duration: {
      avgSeconds: durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
    },
    bedtime: {
      avgClock: bedtimeMins.length > 0
        ? minutesToClock(bedtimeMins.reduce((a, b) => a + b, 0) / bedtimeMins.length)
        : null,
    },
    waketime: {
      avgClock: waketimeMins.length > 0
        ? minutesToClock(waketimeMins.reduce((a, b) => a + b, 0) / waketimeMins.length)
        : null,
    },
    quality: {
      avgScore: qualityScores.length > 0
        ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) / 100
        : null,
      counts: qualityCounts,
    },
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.userId;
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const metric = searchParams.get('metric');
  const mode = searchParams.get('mode') ?? 'summary';         // 'summary' | 'trend'
  const timeMode = searchParams.get('timeMode') ?? 'month';   // 'month' | 'week' | 'day' | 'period'
  const timePeriod = searchParams.get('timePeriod') ?? '';    // e.g. "2026-05", "2026-W20", "2026-05-15"
  const dateFrom = searchParams.get('dateFrom');              // used when timeMode='period'
  const dateTo = searchParams.get('dateTo');
  const bucketsBack = parseInt(searchParams.get('bucketsBack') ?? '6');
  const crossActivities = searchParams.get('crossActivities');
  const limit = parseInt(searchParams.get('limit') ?? '10');

  const crossList = crossActivities
    ? crossActivities.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  if (!metric) return NextResponse.json({ error: 'metric is required' }, { status: 400 });

  await connectDB();

  // ── sleep.* metrics ─────────────────────────────────────────────────────────
  if (metric.startsWith('sleep.')) {
    if (mode === 'summary') {
      // Determine date range
      let from: Date, to: Date;
      if (timeMode === 'period') {
        if (!dateFrom || !dateTo)
          return NextResponse.json({ error: 'dateFrom and dateTo required for period mode' }, { status: 400 });
        from = new Date(dateFrom);
        to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
      } else {
        const range = summaryRange(timeMode, timePeriod);
        if (!range)
          return NextResponse.json({ error: 'Invalid timePeriod for timeMode' }, { status: 400 });
        from = range.dateFrom;
        to = range.dateTo;
      }

      const docs = await fetchSleepDocs(userId, from, to, crossList);
      const summary = computeSleepSummary(docs);

      return NextResponse.json({ metric, mode, timeMode, summary });
    }

    if (mode === 'trend') {
      if (timeMode === 'period')
        return NextResponse.json({ error: 'Trend mode is not available for period timeMode' }, { status: 400 });

      const buckets = trendBuckets(timeMode, timePeriod, bucketsBack);
      if (buckets.length === 0)
        return NextResponse.json({ error: 'Could not compute trend buckets' }, { status: 400 });

      // Fetch all docs in the full range at once (one DB call)
      const fullFrom = buckets[0].dateFrom;
      const fullTo = buckets[buckets.length - 1].dateTo;
      const allDocs = await fetchSleepDocs(userId, fullFrom, fullTo, crossList);

      // Assign each doc to its bucket by assigned date
      const results = buckets.map(bucket => {
        const bucketDocs = allDocs.filter(doc => {
          const s = doc.start;
          if (!s?.year || !s?.month || !s?.day) return false;
          const ad = assignedDate(s.year, s.month, s.day, s.hour);
          const adDate = new Date(ad.year, ad.month - 1, ad.day);
          return adDate >= bucket.dateFrom && adDate <= bucket.dateTo;
        });
        return {
          label: bucket.label,
          summary: computeSleepSummary(bucketDocs),
        };
      });

      return NextResponse.json({ metric, mode, timeMode, bucketsBack, data: results });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  // ── people.frequency ────────────────────────────────────────────────────────
  if (metric === 'people.frequency') {
    let from: Date, to: Date;
    if (timeMode === 'period') {
      if (!dateFrom || !dateTo)
        return NextResponse.json({ error: 'dateFrom and dateTo required for period mode' }, { status: 400 });
      from = new Date(dateFrom);
      to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
    } else {
      const range = summaryRange(timeMode, timePeriod);
      if (!range)
        return NextResponse.json({ error: 'Invalid timePeriod for timeMode' }, { status: 400 });
      from = range.dateFrom;
      to = range.dateTo;
    }

    const baseMatch: any = {
      userId,
      'people.0': { $exists: true },
      'start.datetime': { $gte: from, $lte: to },
    };
    if (crossList && crossList.length > 0) {
      baseMatch['activity.crossActivity'] = { $in: crossList };
    }

    const pipeline: any[] = [
      { $match: baseMatch },
      { $unwind: '$people' },
      { $match: { 'people.target': { $exists: true, $nin: [null, ''] } } },
      {
        $group: {
          _id: '$people.target',
          count: { $sum: 1 },
          category: { $first: '$people.category' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ];

    const raw = await Log.aggregate(pipeline);
    const data = raw.map(r => ({
      key: r._id,
      value: r.count,
      meta: { category: r.category },
    }));

    return NextResponse.json({ metric, mode, timeMode, data });
  }

  // ── cost.total ──────────────────────────────────────────────────────────────
  if (metric === 'cost.total') {
    let from: Date, to: Date;
    if (timeMode === 'period') {
      if (!dateFrom || !dateTo)
        return NextResponse.json({ error: 'dateFrom and dateTo required' }, { status: 400 });
      from = new Date(dateFrom);
      to = new Date(dateTo);
    } else {
      const range = summaryRange(timeMode, timePeriod);
      if (!range)
        return NextResponse.json({ error: 'Invalid timePeriod' }, { status: 400 });
      from = range.dateFrom;
      to = range.dateTo;
    }

    const baseMatch: any = {
      userId,
      'cost.amountKRW': { $gt: 0 },
      'start.datetime': { $gte: from, $lte: to },
    };
    if (crossList && crossList.length > 0) {
      baseMatch['activity.crossActivity'] = { $in: crossList };
    }

    const pipeline: any[] = [
      { $match: baseMatch },
      {
        $group: {
          _id: { year: '$start.year', month: '$start.month' },
          total: { $sum: '$cost.amountKRW' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ];

    const raw = await Log.aggregate(pipeline);
    const data = raw.map(r => ({
      key: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
      value: r.total,
      count: r.count,
    }));

    return NextResponse.json({ metric, mode, timeMode, data });
  }

  return NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 });
}
