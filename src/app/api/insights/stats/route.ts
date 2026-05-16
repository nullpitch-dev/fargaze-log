// src/app/api/insights/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

// ── Constants ─────────────────────────────────────────────────────────────────

const SLEEP_THRESHOLD_HOUR = 6;

// ── Helpers ───────────────────────────────────────────────────────────────────

const QUALITY_SCORE: Record<string, number> = {
  '좋음': 1,
  '보통': 0,
  '나쁨': -1,
};

function hourStringToMinutes(hourStr: string | null | undefined): number | null {
  if (!hourStr) return null;
  const [hPart, mPart] = hourStr.split(':');
  const h = parseInt(hPart);
  const m = parseInt(mPart ?? '0');
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function applyMidnightThreshold(minutes: number): number {
  return minutes < SLEEP_THRESHOLD_HOUR * 60 ? minutes + 1440 : minutes;
}

function minutesToClock(minutes: number): string {
  const wrapped = Math.round(minutes) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function assignedDate(
  year: number,
  month: number,
  day: number,
  hourStr: string | null | undefined,
): { year: number; month: number; day: number } {
  const mins = hourStringToMinutes(hourStr);
  if (mins === null) return { year, month, day };
  if (mins < SLEEP_THRESHOLD_HOUR * 60) {
    const d = new Date(year, month - 1, day - 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  return { year, month, day };
}

function isoWeek(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const isoWeekNum =
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { isoYear: d.getFullYear(), isoWeek: isoWeekNum };
}

// ── Date range helpers ────────────────────────────────────────────────────────

function summaryRange(timeMode: string, timePeriod: string): { dateFrom: Date; dateTo: Date } | null {
  if (timeMode === 'month') {
    const [y, m] = timePeriod.split('-').map(Number);
    if (!y || !m) return null;
    return { dateFrom: new Date(y, m - 1, 1), dateTo: new Date(y, m, 0, 23, 59, 59) };
  }
  if (timeMode === 'week') {
    const match = timePeriod.match(/^(\d{4})-W(\d{1,2})$/);
    if (!match) return null;
    const y = parseInt(match[1]);
    const w = parseInt(match[2]);
    const jan4 = new Date(y, 0, 4);
    const dayOfWeek = (jan4.getDay() + 6) % 7;
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
      buckets.push({ label, dateFrom: new Date(d.getFullYear(), d.getMonth(), 1), dateTo: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) });
    }
  } else if (timeMode === 'week') {
    const anchorRange = summaryRange('week', timePeriod);
    if (!anchorRange) return [];
    for (let i = bucketsBack - 1; i >= 0; i--) {
      const monday = new Date(anchorRange.dateFrom.getTime() - i * 7 * 86400000);
      const sunday = new Date(monday.getTime() + 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 59000);
      const { isoYear, isoWeek: wNum } = isoWeek(monday);
      buckets.push({ label: `${isoYear}-W${String(wNum).padStart(2, '0')}`, dateFrom: monday, dateTo: sunday });
    }
  } else if (timeMode === 'day') {
    const anchor = new Date(timePeriod);
    for (let i = bucketsBack - 1; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * 86400000);
      const label = d.toISOString().slice(0, 10);
      const from = new Date(d); from.setHours(0, 0, 0, 0);
      const to = new Date(d); to.setHours(23, 59, 59, 999);
      buckets.push({ label, dateFrom: from, dateTo: to });
    }
  }
  return buckets;
}

// ── Sleep helpers ─────────────────────────────────────────────────────────────

interface SleepDoc {
  start: { year: number; month: number; day: number; hour: string };
  end: { hour: string };
  duration: { totalSeconds: number };
  sleep: { quality: string };
}

async function fetchSleepDocs(userId: string, dateFrom: Date, dateTo: Date, crossActivities?: string[]): Promise<SleepDoc[]> {
  const match: any = {
    userId,
    'activity.category': '생리',
    'activity.name': '수면',
    'start.datetime': { $gte: dateFrom, $lte: dateTo },
  };
  if (crossActivities?.length) match['activity.crossActivity'] = { $in: crossActivities };
  return Log.find(match)
    .select('start.year start.month start.day start.hour end.hour duration.totalSeconds sleep.quality')
    .lean() as Promise<SleepDoc[]>;
}

function computeSleepSummary(docs: SleepDoc[]) {
  if (docs.length === 0) return null;
  const durations = docs.map(d => d.duration?.totalSeconds).filter((s): s is number => !!s && s >= 3600);
  const bedtimeMins = docs.map(d => { const m = hourStringToMinutes(d.start?.hour); return m !== null ? applyMidnightThreshold(m) : null; }).filter((m): m is number => m !== null);
  const waketimeMins = docs.map(d => { const m = hourStringToMinutes(d.end?.hour); return m !== null ? m : null; }).filter((m): m is number => m !== null);
  const qualityScores = docs.map(d => QUALITY_SCORE[d.sleep?.quality]).filter((s): s is number => s !== undefined);
  const qualityCounts = { '좋음': 0, '보통': 0, '나쁨': 0 };
  docs.forEach(d => { const q = d.sleep?.quality; if (q in qualityCounts) qualityCounts[q as keyof typeof qualityCounts]++; });
  return {
    count: docs.length,
    duration: { avgSeconds: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null },
    bedtime: { avgClock: bedtimeMins.length > 0 ? minutesToClock(bedtimeMins.reduce((a, b) => a + b, 0) / bedtimeMins.length) : null },
    waketime: { avgClock: waketimeMins.length > 0 ? minutesToClock(waketimeMins.reduce((a, b) => a + b, 0) / waketimeMins.length) : null },
    quality: { avgScore: qualityScores.length > 0 ? Math.round((qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) * 100) / 100 : null, counts: qualityCounts },
  };
}

// ── Interactions helpers ──────────────────────────────────────────────────────

// Dominant value = the value that appears most often in an array of strings
function dominant(values: string[]): string {
  if (values.length === 0) return '';
  const freq: Record<string, number> = {};
  for (const v of values) freq[v] = (freq[v] ?? 0) + 1;
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
}

interface InteractionDoc {
  people: { method: string; category: string; target: string }[];
}

async function fetchInteractionDocs(
  userId: string,
  dateFrom: Date,
  dateTo: Date,
  crossActivities?: string[],
): Promise<InteractionDoc[]> {
  const match: any = {
    userId,
    'activity.relationship': '함께',
    'start.datetime': { $gte: dateFrom, $lte: dateTo },
  };
  if (crossActivities?.length) match['activity.crossActivity'] = { $in: crossActivities };
  return Log.find(match)
    .select('people')
    .lean() as Promise<InteractionDoc[]>;
}

function computeInteractionsSummary(docs: InteractionDoc[]) {
  const totalInteractions = docs.length;

  // ── Interactions section ──────────────────────────────────────────────────
  // Each record contributes once per people[] entry to method/category counts
  const intByMethod: Record<string, number> = {};
  const intByCategory: Record<string, number> = {};

  for (const doc of docs) {
    for (const group of (doc.people ?? [])) {
      if (group.method) intByMethod[group.method] = (intByMethod[group.method] ?? 0) + 1;
      if (group.category) intByCategory[group.category] = (intByCategory[group.category] ?? 0) + 1;
    }
  }

  // ── People section ────────────────────────────────────────────────────────
  // Collect per-person: all methods and categories across all their interactions
  const personMethods: Record<string, string[]> = {};
  const personCategories: Record<string, string[]> = {};
  const personInteractionCount: Record<string, number> = {};
  // For table: per person, per method/category combo → count
  const personRows: Record<string, { method: string; count: number }[]> = {};

  for (const doc of docs) {
    for (const group of (doc.people ?? [])) {
      const name = group.target;
      if (!name) continue;
      // Accumulate for dominant calculation
      if (!personMethods[name]) personMethods[name] = [];
      if (!personCategories[name]) personCategories[name] = [];
      if (group.method) personMethods[name].push(group.method);
      if (group.category) personCategories[name].push(group.category);

      // Accumulate for table rows: count per (method, category) combo
      if (!personRows[name]) personRows[name] = [];
      const key = group.method;
      const existing = personRows[name].find(r => r.method === key);
      if (existing) existing.count++;
      else personRows[name].push({ method: group.method ?? '', count: 1 });

      // Total interactions per person
      personInteractionCount[name] = (personInteractionCount[name] ?? 0) + 1;
    }
  }

  const uniquePeople = Object.keys(personInteractionCount);
  const totalPeople = uniquePeople.length;

  // People pies — dominant method/category per person, counted once each
  const peopleByMethod: Record<string, number> = {};
  const peopleByCategory: Record<string, number> = {};
  for (const name of uniquePeople) {
    const dom = dominant(personMethods[name] ?? []);
    const domCat = dominant(personCategories[name] ?? []);
    if (dom) peopleByMethod[dom] = (peopleByMethod[dom] ?? 0) + 1;
    if (domCat) peopleByCategory[domCat] = (peopleByCategory[domCat] ?? 0) + 1;
  }

  // ── Top 5 people table ────────────────────────────────────────────────────
  const sortedPeople = uniquePeople
    .map(name => ({ name, total: personInteractionCount[name] }))
    .sort((a, b) => b.total - a.total);

  const top10 = sortedPeople.slice(0, 10);
  const top10Names = new Set(top10.map(p => p.name));
  const top10Sum = top10.reduce((sum, p) => sum + p.total, 0);
  const othersTotal = totalInteractions - top10Sum;

  // Others dominant method/category — from all non-top-10 interaction docs' people entries
  const othersMethods: string[] = [];
  const othersCategories: string[] = [];
  for (const doc of docs) {
    for (const group of (doc.people ?? [])) {
      const name = group.target;
      if (!top10Names.has(name)) {
        if (group.method) othersMethods.push(group.method);
        if (group.category) othersCategories.push(group.category);
      }
    }
  }

  const topPeople = top10.map(({ name, total }) => ({
    name,
    dominantCategory: dominant(personCategories[name] ?? []),
    total,
    rows: (personRows[name] ?? [])
      .sort((a, b) => b.count - a.count)
      .map(r => ({ method: r.method, count: r.count })),
  }));

  return {
    interactions: {
      total: totalInteractions,
      byMethod: intByMethod,
      byCategory: intByCategory,
    },
    people: {
      total: totalPeople,
      byMethod: peopleByMethod,
      byCategory: peopleByCategory,
    },
    topPeople,
    others: {
      total: othersTotal,
      dominantMethod: dominant(othersMethods),
      dominantCategory: dominant(othersCategories),
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
  const mode = searchParams.get('mode') ?? 'summary';
  const timeMode = searchParams.get('timeMode') ?? 'month';
  const timePeriod = searchParams.get('timePeriod') ?? '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const bucketsBack = parseInt(searchParams.get('bucketsBack') ?? '6');
  const crossActivities = searchParams.get('crossActivities');
  const limit = parseInt(searchParams.get('limit') ?? '10');

  const crossList = crossActivities
    ? crossActivities.split(',').map(s => s.trim()).filter(Boolean)
    : undefined;

  if (!metric) return NextResponse.json({ error: 'metric is required' }, { status: 400 });

  await connectDB();

  // ── Helper: resolve date range ──────────────────────────────────────────────
  function resolveDateRange(): { from: Date; to: Date } | null {
    if (timeMode === 'period') {
      if (!dateFrom || !dateTo) return null;
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      return { from: new Date(dateFrom), to };
    }
    const range = summaryRange(timeMode, timePeriod);
    if (!range) return null;
    return { from: range.dateFrom, to: range.dateTo };
  }

  // ── sleep.* ─────────────────────────────────────────────────────────────────
  if (metric.startsWith('sleep.')) {
    if (mode === 'summary') {
      const range = resolveDateRange();
      if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
      const docs = await fetchSleepDocs(userId, range.from, range.to, crossList);
      return NextResponse.json({ metric, mode, timeMode, summary: computeSleepSummary(docs) });
    }
    if (mode === 'trend') {
      if (timeMode === 'period') return NextResponse.json({ error: 'Trend not available for period mode' }, { status: 400 });
      const buckets = trendBuckets(timeMode, timePeriod, bucketsBack);
      if (!buckets.length) return NextResponse.json({ error: 'Could not compute trend buckets' }, { status: 400 });
      const allDocs = await fetchSleepDocs(userId, buckets[0].dateFrom, buckets[buckets.length - 1].dateTo, crossList);
      const data = buckets.map(bucket => {
        const bucketDocs = allDocs.filter(doc => {
          const s = doc.start;
          if (!s?.year || !s?.month || !s?.day) return false;
          const ad = assignedDate(s.year, s.month, s.day, s.hour);
          const adDate = new Date(ad.year, ad.month - 1, ad.day);
          return adDate >= bucket.dateFrom && adDate <= bucket.dateTo;
        });
        return { label: bucket.label, summary: computeSleepSummary(bucketDocs) };
      });
      return NextResponse.json({ metric, mode, timeMode, bucketsBack, data });
    }
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  // ── interactions.summary ────────────────────────────────────────────────────
  if (metric === 'interactions.summary') {
    const range = resolveDateRange();
    if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    const docs = await fetchInteractionDocs(userId, range.from, range.to, crossList);
    const summary = computeInteractionsSummary(docs);
    return NextResponse.json({ metric, mode, timeMode, summary });
  }

  // ── people.frequency ────────────────────────────────────────────────────────
  if (metric === 'people.frequency') {
    const range = resolveDateRange();
    if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });

    const baseMatch: any = {
      userId,
      'people.0': { $exists: true },
      'start.datetime': { $gte: range.from, $lte: range.to },
    };
    if (crossList?.length) baseMatch['activity.crossActivity'] = { $in: crossList };

    if (mode === 'summary') {
      const pipeline: any[] = [
        { $match: baseMatch },
        { $unwind: '$people' },
        { $match: { 'people.target': { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$people.target', count: { $sum: 1 }, category: { $first: '$people.category' } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ];
      const raw = await Log.aggregate(pipeline);
      return NextResponse.json({ metric, mode, timeMode, data: raw.map(r => ({ key: r._id, value: r.count, meta: { category: r.category } })) });
    }

    if (mode === 'trend') {
      if (timeMode === 'period') return NextResponse.json({ error: 'Trend not available for period mode' }, { status: 400 });
      const buckets = trendBuckets(timeMode, timePeriod, bucketsBack);
      if (!buckets.length) return NextResponse.json({ error: 'Could not compute trend buckets' }, { status: 400 });

      // Top people from full range
      const topPipeline: any[] = [
        { $match: { ...baseMatch, 'start.datetime': { $gte: buckets[0].dateFrom, $lte: buckets[buckets.length - 1].dateTo } } },
        { $unwind: '$people' },
        { $match: { 'people.target': { $exists: true, $nin: [null, ''] } } },
        { $group: { _id: '$people.target', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ];
      const topPeople = (await Log.aggregate(topPipeline)).map(r => r._id as string);

      const data = await Promise.all(buckets.map(async bucket => {
        const bMatch = { ...baseMatch, 'start.datetime': { $gte: bucket.dateFrom, $lte: bucket.dateTo } };
        const pipeline: any[] = [
          { $match: bMatch },
          { $unwind: '$people' },
          { $match: { 'people.target': { $in: topPeople } } },
          { $group: { _id: '$people.target', count: { $sum: 1 } } },
        ];
        const raw = await Log.aggregate(pipeline);
        return { label: bucket.label, data: raw.map(r => ({ key: r._id, value: r.count })) };
      }));

      return NextResponse.json({ metric, mode, timeMode, bucketsBack, data });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  // ── cost.total ──────────────────────────────────────────────────────────────
  if (metric === 'cost.total') {
    const range = resolveDateRange();
    if (!range) return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });

    const baseMatch: any = {
      userId,
      'cost.amountKRW': { $gt: 0 },
      'start.datetime': { $gte: range.from, $lte: range.to },
    };
    if (crossList?.length) baseMatch['activity.crossActivity'] = { $in: crossList };

    const raw = await Log.aggregate([
      { $match: baseMatch },
      { $group: { _id: { year: '$start.year', month: '$start.month' }, total: { $sum: '$cost.amountKRW' }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    return NextResponse.json({ metric, mode, timeMode, data: raw.map(r => ({ key: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`, value: r.total, count: r.count })) });
  }

  return NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 });
}
