// src/app/api/insights/correlate/route.ts
// Returns paired data points for two metrics on the same day, for scatter/correlation analysis.
// Currently supports: metricA=alcohol.units, metricB=sleep.duration

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

function pearson(pairs: { a: number; b: number }[]): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  const meanA = pairs.reduce((s, p) => s + p.a, 0) / n;
  const meanB = pairs.reduce((s, p) => s + p.b, 0) / n;
  const num = pairs.reduce((s, p) => s + (p.a - meanA) * (p.b - meanB), 0);
  const denA = Math.sqrt(pairs.reduce((s, p) => s + (p.a - meanA) ** 2, 0));
  const denB = Math.sqrt(pairs.reduce((s, p) => s + (p.b - meanB) ** 2, 0));
  if (denA === 0 || denB === 0) return null;
  return num / (denA * denB);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.userId;
  if (!userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const metricA = searchParams.get('metricA');
  const metricB = searchParams.get('metricB');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const crossActivities = searchParams.get('crossActivities');

  if (!metricA || !metricB) {
    return NextResponse.json({ error: 'metricA and metricB are required' }, { status: 400 });
  }

  await connectDB();

  const baseMatch: any = { userId };
  if (dateFrom || dateTo) {
    baseMatch['start.datetime'] = {};
    if (dateFrom) baseMatch['start.datetime'].$gte = new Date(dateFrom);
    if (dateTo) baseMatch['start.datetime'].$lte = new Date(dateTo);
  }
  if (crossActivities) {
    baseMatch['activity.crossActivity'] = { $in: crossActivities.split(',').map(s => s.trim()) };
  }

  // ── alcohol.units vs sleep.duration ────────────────────────────────────────
  // For each day that has a sleep entry, find the alcohol consumed that evening
  // (same day or evening before) and pair the two values.
  if (
    (metricA === 'alcohol.units' && metricB === 'sleep.duration') ||
    (metricA === 'sleep.duration' && metricB === 'alcohol.units')
  ) {
    // Fetch all sleep entries
    const sleepDocs = await Log.find({
      ...baseMatch,
      'activity.category': '생리',
      'duration.totalSeconds': { $gt: 0 },
    })
      .select('start.year start.month start.day duration.totalSeconds')
      .lean();

    // Fetch all alcohol entries — sum food.alcohols[] per day
    const alcoholPipeline: any[] = [
      {
        $match: {
          userId,
          'food.alcohols.0': { $exists: true },
          ...(dateFrom || dateTo ? { 'start.datetime': baseMatch['start.datetime'] } : {}),
        },
      },
      { $unwind: '$food.alcohols' },
      {
        $match: {
          'food.alcohols.item': { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: { year: '$start.year', month: '$start.month', day: '$start.day' },
          count: { $sum: 1 }, // number of alcohol items as proxy for units
        },
      },
    ];

    const alcoholDocs = await Log.aggregate(alcoholPipeline);

    // Build alcohol lookup by date key
    const alcoholByDay = new Map<string, number>();
    for (const doc of alcoholDocs) {
      const key = `${doc._id.year}-${doc._id.month}-${doc._id.day}`;
      alcoholByDay.set(key, doc.count);
    }

    // Pair: for each sleep entry, look for alcohol on the same day OR the previous day
    // (drinking in the evening before sleeping)
    const pairs: { a: number; b: number; date: string }[] = [];

    for (const sleep of sleepDocs) {
      const s = sleep.start as any;
      if (!s?.year || !s?.month || !s?.day) continue;

      const sleepSeconds = (sleep.duration as any)?.totalSeconds;
      if (!sleepSeconds || sleepSeconds < 3600) continue; // skip naps < 1h

      // Check same day and previous day for alcohol
      const sameDayKey = `${s.year}-${s.month}-${s.day}`;
      const prevDate = new Date(s.year, s.month - 1, s.day - 1);
      const prevDayKey = `${prevDate.getFullYear()}-${prevDate.getMonth() + 1}-${prevDate.getDate()}`;

      const alcoholUnits = (alcoholByDay.get(sameDayKey) ?? 0) + (alcoholByDay.get(prevDayKey) ?? 0);

      pairs.push({
        a: metricA === 'alcohol.units' ? alcoholUnits : sleepSeconds,
        b: metricB === 'sleep.duration' ? sleepSeconds : alcoholUnits,
        date: sameDayKey,
      });
    }

    const correlation = pearson(pairs);

    return NextResponse.json({
      metricA,
      metricB,
      correlation,
      n: pairs.length,
      pairs,
      labels: {
        metricA: metricA === 'alcohol.units' ? '음주 횟수' : '수면 시간',
        metricB: metricB === 'sleep.duration' ? '수면 시간 (분)' : '음주 횟수',
      },
    });
  }

  return NextResponse.json({ error: `Unknown metric pair: ${metricA} / ${metricB}` }, { status: 400 });
}
