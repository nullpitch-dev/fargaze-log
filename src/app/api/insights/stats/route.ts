// src/app/api/insights/stats/route.ts
// Thin dispatcher: auth + param parsing, routing to per-widget compute
// modules under @/lib/insights (sleep, interactions, drinking, diet).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

import { buildDateRange, stepBack, labelForPeriod, currentPeriod } from '@/lib/insights/dates';
import { computeSleepSummary } from '@/lib/insights/sleep';
import { computeInteractionsSummary, computeInteractionsTrendBucket, addTransitioning } from '@/lib/insights/interactions';
import { computeDrinkingSummary, computeDrinkingTrendBucket } from '@/lib/insights/drinking';
import { computeDietSummary, computeDietTrendBucket } from '@/lib/insights/diet';

// ── Main route ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await connectDB();

  const sp          = req.nextUrl.searchParams;
  const metric      = sp.get('metric') ?? '';
  const mode        = sp.get('mode') ?? 'summary';
  const timeMode    = sp.get('timeMode') ?? 'month';
  const timePeriod  = sp.get('timePeriod') ?? '';
  const dateFrom    = sp.get('dateFrom');
  const dateTo      = sp.get('dateTo');
  const bucketsBack     = parseInt(sp.get('bucketsBack') ?? '6');
  const crossActivities = sp.get('crossActivities')?.split(',').filter(Boolean) ?? [];
  const top7RelType     = sp.get('top7RelType')?.split(',').filter(Boolean) ?? [];
  const top7Method      = sp.get('top7Method')?.split(',').filter(Boolean)  ?? [];

  // ── interactions.summary ──────────────────────────────────────────────────
  if (metric === 'interactions.summary') {
    if (mode === 'trend') {
      // Build ordered list of periods (oldest → newest)
      const periods: string[] = [];
      for (let i = bucketsBack - 1; i >= 0; i--) {
        periods.push(stepBack(timeMode, timePeriod || currentPeriod(timeMode), i));
      }

      const bucketResults = await Promise.all(
        periods.map(async period => {
          const { start, end } = buildDateRange(timeMode, period, null, null);
          const filter: Record<string, any> = {
            userId,
            'start.datetime': { $gte: start, $lte: end },
          };
          if (crossActivities.length) {
            filter['activity.crossActivity'] = { $in: crossActivities };
          }
          const docs = await Log.find(filter).lean();
          const bucket = computeInteractionsTrendBucket(docs, top7RelType, top7Method);
          return { label: labelForPeriod(timeMode, period), ...bucket };
        }),
      );

      const withTransitioning = addTransitioning(bucketResults);

      return NextResponse.json({ data: withTransitioning });
    }

    // Summary mode
    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const filter: Record<string, any> = {
      userId,
      'start.datetime': { $gte: start, $lte: end },
    };
    if (crossActivities.length) {
      filter['activity.crossActivity'] = { $in: crossActivities };
    }
    const docs = await Log.find(filter).lean();
    const summary = computeInteractionsSummary(docs);
    return NextResponse.json({ summary });
  }

  // ── sleep.all ─────────────────────────────────────────────────────────────
  if (metric === 'sleep.all') {
    if (mode === 'trend') {
      const periods: string[] = [];
      for (let i = bucketsBack - 1; i >= 0; i--) {
        periods.push(stepBack(timeMode, timePeriod || currentPeriod(timeMode), i));
      }

      const results = await Promise.all(
        periods.map(async period => {
          const { start, end } = buildDateRange(timeMode, period, null, null);
          const filter: Record<string, any> = {
            userId,
            'start.datetime': { $gte: start, $lte: end },
            'activity.category': '생리',
            'activity.name': '수면',
          };
          if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };
          const docs = await Log.find(filter).lean();
          return { label: labelForPeriod(timeMode, period), summary: computeSleepSummary(docs) };
        }),
      );
      return NextResponse.json({ data: results });
    }

    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const filter: Record<string, any> = {
      userId,
      'start.datetime': { $gte: start, $lte: end },
      'activity.category': '생리',
      'activity.name': '수면',
    };
    if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };
    const docs = await Log.find(filter).lean();
    return NextResponse.json({ summary: computeSleepSummary(docs) });
  }

  // ── drinking.summary ────────────────────────────────────────────────────────
  if (metric === 'drinking.summary') {
    if (mode === 'trend') {
      const periods: string[] = [];
      for (let i = bucketsBack - 1; i >= 0; i--) {
        periods.push(stepBack(timeMode, timePeriod || currentPeriod(timeMode), i));
      }
      const bucketResults = await Promise.all(
        periods.map(async period => {
          const { start, end } = buildDateRange(timeMode, period, null, null);
          const bucket = await computeDrinkingTrendBucket(userId, start, end, crossActivities);
          return { label: labelForPeriod(timeMode, period), ...bucket };
        }),
      );
      return NextResponse.json({ data: bucketResults });
    }

    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const summary = await computeDrinkingSummary(userId, start, end, crossActivities);
    return NextResponse.json({ summary });
  }
  
	// ── diet.summary ──────────────────────────────────────────────────────────────
  if (metric === 'diet.summary') {
    if (mode === 'trend') {
      const periods: string[] = [];
      for (let i = bucketsBack - 1; i >= 0; i--) {
        periods.push(stepBack(timeMode, timePeriod || currentPeriod(timeMode), i));
      }
      const bucketResults = await Promise.all(
        periods.map(async period => {
          const { start, end } = buildDateRange(timeMode, period, null, null);
          const bucket = await computeDietTrendBucket(userId, start, end, crossActivities);
          return { label: labelForPeriod(timeMode, period), ...bucket };
        }),
      );
      return NextResponse.json({ data: bucketResults });
    }

    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const summary = await computeDietSummary(userId, start, end, crossActivities);
    return NextResponse.json({ summary });
  }

  return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
}
