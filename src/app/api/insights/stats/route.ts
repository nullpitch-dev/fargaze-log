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
import { computeWeightSummary, computeWeightTrend } from '@/lib/insights/weight';
import type { WeightGranularity } from '@/lib/insights/weight';

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
	const summaryMethod   = sp.get('method')?.split(',').filter(Boolean)      ?? [];
  const mInteractions   = sp.get('mInteractions')?.split(',').filter(Boolean) ?? [];
  const mUnique         = sp.get('mUnique')?.split(',').filter(Boolean)        ?? [];
  const mRelation       = sp.get('mRelation')?.split(',').filter(Boolean)      ?? [];

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
					const bucket = computeInteractionsTrendBucket(docs, {
            relTypeFilter:      top7RelType,
            peopleMethod:       top7Method,
            interactionsMethod: mInteractions,
            uniqueMethod:       mUnique,
            relationMethod:     mRelation,
          });
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
    const summary = computeInteractionsSummary(docs, summaryMethod);
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

	// ── weight.summary ────────────────────────────────────────────────────────
  if (metric === 'weight.summary') {
    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const summary = await computeWeightSummary(userId, start, end, crossActivities);
    return NextResponse.json({ summary });
  }

  // ── weight.trend ──────────────────────────────────────────────────────────
  // Granularity + bucket count, not the shared timeMode/timePeriod pair. The
  // span IS granularity × buckets, so a bucket explosion is unrepresentable
  // rather than guarded against. `end` is optional and defaults to today —
  // unused by the UI for now, but it is what lets a past window be inspected
  // later without re-cutting this route.
  if (metric === 'weight.trend') {
    const gRaw = sp.get('granularity') ?? 'month';
    const granularity: WeightGranularity =
      gRaw === 'day' || gRaw === 'week' || gRaw === 'month' ? gRaw : 'month';

    const bucketCount = parseInt(sp.get('buckets') ?? '12');
    const safeCount = Number.isFinite(bucketCount) ? bucketCount : 12;

		// 'YYYY-MM-DD', parsed as a LOCAL date. new Date('2026-07-18') would be
    // parsed as UTC midnight and land on the previous day in a negative
    // offset, quietly shifting every bucket boundary by one.
    const endRaw = sp.get('end');
    let endDate: Date | null = null;
    if (endRaw) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endRaw);
      if (m) endDate = new Date(+m[1], +m[2] - 1, +m[3]);
    }

    // No explicit end → anchor to min(end of the selected period, today).
    //
    // "Anchor to today, not to the last weigh-in" exists so that a two-week
    // gap in readings shows as empty recent buckets instead of sliding a
    // stale value to the right edge. It was never meant to override the
    // period the user picked: selecting January 2026 should run to 31 Jan
    // even if the last reading was the 20th, and should NOT run to today.
    // Picking the current month still lands on today, so Day mode does not
    // render a fortnight of empty future buckets.
    //
    // buildDateRange returns a UTC instant, so the calendar date is read from
    // the UTC fields. Reading it locally would turn 2026-07-31T23:59:59.999Z
    // into 1 August under BST and shift every bucket boundary by one — the
    // exact failure the local-date-field convention exists to prevent.
    if (!endDate) {
      const { end: periodEnd } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
      const periodAnchor = new Date(
        periodEnd.getUTCFullYear(),
        periodEnd.getUTCMonth(),
        periodEnd.getUTCDate(),
      );
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      endDate = periodAnchor < today ? periodAnchor : today;
    }

    const trend = await computeWeightTrend(
      userId,
      granularity,
      safeCount,
      endDate,
      crossActivities,
    );
    return NextResponse.json({ trend });
  }

  return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
}
