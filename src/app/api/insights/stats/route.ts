// src/app/api/insights/stats/route.ts
// Thin dispatcher: auth + param parsing, routing to per-widget compute
// modules under @/lib/insights (sleep, interactions, drinking, diet, weight, exercise).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';

import { buildDateRange, stepBack, labelForPeriod, currentPeriod } from '@/lib/insights/dates';
import { computeSleepSummary, computeSleepTrend, computeSleepSummaryLegacy } from '@/lib/insights/sleep';
import { computeInteractionsSummary, computeInteractionsTrendBucket, addTransitioning, computeInteractionsTrend } from '@/lib/insights/interactions';
import { parseGrain, anchorFrom, resolveWindow } from '@/lib/insights/trend-window';
import { computeDrinkingSummary, computeDrinkingTrendBucket, computeDrinkingTrend } from '@/lib/insights/drinking';
import { computeDietSummary, computeDietTrendBucket, computeDietTrend } from '@/lib/insights/diet';
import { computeWeightSummary, computeWeightTrend } from '@/lib/insights/weight';
import type { WeightGranularity } from '@/lib/insights/weight';
import { computeExerciseSummary } from '@/lib/insights/exercise';
import { computeExerciseTrend, computeExerciseItemTrend } from '@/lib/insights/exercise-trend';
import type { ExerciseTrendGrain } from '@/lib/insights/exercise-trend';

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

  // ── interactions.trend ────────────────────────────────────────────────────
  // Weight-style window: grain × bucket count, anchored at min(end of the
  // selected period, today), start snapped to a bucket boundary. ONE fetch
  // covers the whole window (padded a day each side against timezone edge
  // shift); the compute module cuts precisely on local date fields and
  // buckets in memory. The old mode=trend path above stays until the UI
  // switches over, then retires with its parameters.
  if (metric === 'interactions.trend') {
    const grain = parseGrain(sp.get('grain'));
    const bucketCount = parseInt(sp.get('buckets') ?? '12');
    const safeCount = Math.min(Number.isFinite(bucketCount) ? Math.max(1, bucketCount) : 12, 400);

    const { end: periodEnd } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const { start, end } = resolveWindow(grain, safeCount, anchorFrom(periodEnd));

    const fetchFrom = new Date(start); fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 1);
    const fetchTo   = new Date(end);   fetchTo.setUTCDate(fetchTo.getUTCDate() + 2);

    const filter: Record<string, any> = {
      userId,
      'activity.relationship': '함께',
      'start.datetime': { $gte: fetchFrom, $lte: fetchTo },
    };
    if (crossActivities.length) {
      filter['activity.crossActivity'] = { $in: crossActivities };
    }
    const docs = await Log.find(filter).lean();

    const trend = computeInteractionsTrend(docs, grain, start, end, {
      relTypeFilter:      top7RelType,
      peopleMethod:       top7Method,
      interactionsMethod: mInteractions,
      uniqueMethod:       mUnique,
      relationMethod:     mRelation,
    });
    return NextResponse.json(trend);
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
					return { label: labelForPeriod(timeMode, period), summary: computeSleepSummaryLegacy(docs) };
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
    return NextResponse.json({ summary: computeSleepSummaryLegacy(docs) });
  }

  // ── sleep.summary ─────────────────────────────────────────────────────────
  // The night-assignment rules version: one entry per sleep day, four metrics
  // each with an average, a three-way band count for the pie, and a per-day
  // series for the strip. The compute module runs its own query because the
  // 8am boundary needs padding past the window end.
  if (metric === 'sleep.summary') {
    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const summary = await computeSleepSummary(userId, start, end, crossActivities);
    return NextResponse.json({ summary });
  }

  // ── sleep.trend ───────────────────────────────────────────────────────────
  // Weight-style window: grain × bucket count, anchored at min(end of the
  // selected period, today), start snapped to a bucket boundary. ONE bounded
  // query whatever the bucket count. The old sleep.all path above stays until
  // the UI switches over.
  if (metric === 'sleep.trend') {
    const grain = parseGrain(sp.get('grain'));
    const bucketCount = parseInt(sp.get('buckets') ?? '12');
    const safeCount = Math.min(Number.isFinite(bucketCount) ? Math.max(1, bucketCount) : 12, 400);

    const { end: periodEnd } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const { start, end } = resolveWindow(grain, safeCount, anchorFrom(periodEnd));

    const trend = await computeSleepTrend(userId, grain, start, end, crossActivities);
    return NextResponse.json(trend);
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

  // ── drinking.trend ──────────────────────────────────────────────────────────
  // Weight-style window: grain × bucket count, anchored at min(end of the
  // selected period, today), start snapped to a bucket boundary. Unlike
  // interactions.trend the compute module runs its own queries — it needs the
  // conversion table and the one drinking day before the window anyway — so it
  // takes the window rather than documents. Three bounded queries per request
  // whatever the bucket count, replacing three per bucket. The old
  // mode=trend path above stays until the UI switches over.
  if (metric === 'drinking.trend') {
    const grain = parseGrain(sp.get('grain'));
    const bucketCount = parseInt(sp.get('buckets') ?? '12');
    const safeCount = Math.min(Number.isFinite(bucketCount) ? Math.max(1, bucketCount) : 12, 400);

    const { end: periodEnd } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const { start, end } = resolveWindow(grain, safeCount, anchorFrom(periodEnd));

    const trend = await computeDrinkingTrend(userId, grain, start, end, crossActivities);
    return NextResponse.json(trend);
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

	// ── diet.trend ────────────────────────────────────────────────────────────
  // Weight-style window: grain × bucket count, anchored at min(end of the
  // selected period, today), start snapped to a bucket boundary. Like
  // drinking.trend the compute module takes the window and runs its own query,
  // so the 6 am padding lives next to the day-assignment rule that needs it.
  // One bounded query per request whatever the bucket count. The old
  // mode=trend path above stays until the UI switches over.
  if (metric === 'diet.trend') {
    const grain = parseGrain(sp.get('grain'));
    const bucketCount = parseInt(sp.get('buckets') ?? '12');
    const safeCount = Math.min(Number.isFinite(bucketCount) ? Math.max(1, bucketCount) : 12, 400);

    const { end: periodEnd } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const { start, end } = resolveWindow(grain, safeCount, anchorFrom(periodEnd));

    const trend = await computeDietTrend(userId, grain, start, end, crossActivities);
    return NextResponse.json(trend);
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

  // ── exercise.summary ──────────────────────────────────────────────────────
  // Summary mode only — no Trend view in #58. The compute module fetches all
  // 운동 records unbounded and cuts the period itself, because the personal
  // bests are all-time, so no date filter is applied here.
  if (metric === 'exercise.summary') {
    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const summary = await computeExerciseSummary(userId, start, end, crossActivities);
    return NextResponse.json({ summary });
  }

  // ── exercise.trend / exercise.itemTrend ───────────────────────────────────
  // Weight-style controls: grain × bucket count, not the filter's span. The
  // window is counted back from min(end of the selected period, today) — the
  // same anchor rule as weight.trend, for the same reason: a gap in recent
  // activity should show as empty buckets, but a deliberately selected past
  // period must not run to today. The compute module still cuts in memory;
  // this branch only decides the window.
  if (metric === 'exercise.trend' || metric === 'exercise.itemTrend') {
    const gRaw = sp.get('grain') ?? 'week';
    const grain: ExerciseTrendGrain =
      gRaw === 'day' || gRaw === 'week' || gRaw === 'month' ? gRaw : 'week';

    const bucketCount = parseInt(sp.get('buckets') ?? '12');
    const safeCount   = Math.min(Number.isFinite(bucketCount) ? Math.max(1, bucketCount) : 12, 400);

    // Anchor read from UTC fields — the same BST-shift guard as weight.trend.
    const { end: periodEnd } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const periodAnchor = new Date(Date.UTC(
      periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate(),
    ));
    const now   = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const end   = periodAnchor < today ? periodAnchor : today;

    // Step back to the window start, landing on a bucket boundary (Monday /
    // the 1st) so the first bucket is whole rather than a partial edge.
    const start = new Date(end);
    if (grain === 'day') {
      start.setUTCDate(start.getUTCDate() - (safeCount - 1));
    } else if (grain === 'week') {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      start.setUTCDate(start.getUTCDate() - (safeCount - 1) * 7);
    } else {
      start.setUTCDate(1);
      start.setUTCMonth(start.getUTCMonth() - (safeCount - 1));
    }

    if (metric === 'exercise.itemTrend') {
      const item = sp.get('item') ?? '';
      if (!item) return NextResponse.json({ error: 'item is required' }, { status: 400 });
      const itemTrend = await computeExerciseItemTrend(userId, item, start, end, grain, crossActivities);
      return NextResponse.json({ itemTrend });
    }

    const trend = await computeExerciseTrend(userId, start, end, grain, crossActivities);
    return NextResponse.json({ trend });
  }
  return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
}
