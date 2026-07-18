'use client';
// src/app/insights/_widgets/WeightTrendView.tsx
// WBS #54 — Weight Trend view.
//
// One chart, not three tabs. The top of the stack IS total weight, so weight
// and composition are the same picture by construction.
//
// Controls are granularity × bucket count rather than a time span, so the
// span is a product of the two and an unrenderable combination (Day × 7 years)
// cannot be expressed. Deliberately independent of globalFilter's period —
// the whole point of the view is picking your own horizon. crossActivities
// still flows through buildParams in the parent.

import { useMemo } from 'react';
import {
  CssStackedAreaChart,
  type StackedAreaPoint,
  type StackedAreaSegmentDef,
} from '../_components/charts/css-chart-components';
import { SEG, SEG_ORDER, segColor } from './weight-colors';
import { Segmented } from '../_components/Segmented';

// ── Contract (mirrors weight.trend API) ───────────────────────────────────────

export type WeightGranularity = 'day' | 'week' | 'month';

export interface WeightTrendBucket {
  label:  string;              // 'YYYY-MM-DD' or 'YYYY-MM'
  start:  string;
  end:    string;
  weight: number | null;
  n:      number;
  composition: {
    weight: number;
    muscleMass: number | null;
    bodyFat: number | null;
    other: number | null;
    n: number;
  } | null;
}

export interface WeightTrend {
  granularity: WeightGranularity;
  rangeStart:  string | null;
  rangeEnd:    string | null;
  buckets:     WeightTrendBucket[];
}

export const BUCKET_OPTIONS: Record<WeightGranularity, number[]> = {
  day:   [14, 30, 60, 90],
  week:  [12, 26, 52, 104],
  month: [12, 24, 60, 120],
};

export const DEFAULT_BUCKETS: Record<WeightGranularity, number> = {
  day: 30, week: 26, month: 24,
};

export type WeightUnit = 'weight' | 'kg' | 'pct';

// ── Label conversion ──────────────────────────────────────────────────────────
// formatBucketLabels() detects granularity from the separator and drops the
// repeated leading part. It expects yyWww / yy.mm / mm/dd, so ISO labels are
// converted here rather than teaching the shared helper a fourth format.

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isoWeekNo(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);   // → Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  firstThu.setUTCDate(firstThu.getUTCDate() - ((firstThu.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 86400000));
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function shortLabel(b: WeightTrendBucket, g: WeightGranularity): string {
  const d = parseISO(b.start);
  const yy = pad2(d.getFullYear() % 100);
  if (g === 'month') return `${yy}.${pad2(d.getMonth() + 1)}`;
  if (g === 'week')  return `${yy}W${pad2(isoWeekNo(d))}`;
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
}

/** Bucket bounds legitimately run past today; the header should not claim
 *  data that does not exist yet. The API stays honest, the label is clamped. */
function clampToToday(iso: string): string {
  const today = new Date();
  const t = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  return iso > t ? t : iso;
}


// ── View ──────────────────────────────────────────────────────────────────────

interface Props {
  data:        WeightTrend | null;
  isDark:      boolean;
  granularity: WeightGranularity;
  onGranularityChange: (g: WeightGranularity) => void;
  buckets:     number;
  onBucketsChange: (n: number) => void;
  unit:        WeightUnit;
  onUnitChange: (u: WeightUnit) => void;
}

/**
 * Three states of one control, not three charts:
 *   'weight' — total line only, y-axis zoomed to the data
 *   'kg'     — stacked area in kg, y-axis pinned to zero
 *   'pct'    — stacked area normalised to 100
 *
 * A stacked area in kg is only readable on a zero baseline: every internal
 * boundary (31, 46, 70) sits far below a zoomed 63–71 window, so cropping
 * pushed all of them off-screen and left one flat band covering everything.
 * Zero baseline fixes that but flattens seven years of movement into a
 * near-straight line — hence 'weight', which drops the fill and gets the
 * zoom back. Each mode is honest about a different question.
 */
export function WeightTrendView({
  data, isDark, granularity, onGranularityChange,
  buckets, onBucketsChange, unit, onUnitChange,
}: Props) {
  const segmentDefs: StackedAreaSegmentDef[] = useMemo(
    () => SEG_ORDER.map(k => ({ key: k, label: SEG[k].name, color: segColor(k, isDark) })),
    [isDark],
  );

  const points: StackedAreaPoint[] = useMemo(() => {
    if (!data) return [];
    return data.buckets.map(b => {
      const c = b.composition;
      const hasSeg = !!c && c.muscleMass != null && c.bodyFat != null && c.other != null;
      return {
        label: shortLabel(b, data.granularity),
        total: b.weight,
        segments: hasSeg
          ? { muscle: c!.muscleMass as number, fat: c!.bodyFat as number, other: c!.other as number }
          : null,
        meta:
          b.n === 0
            ? undefined
            : hasSeg && c!.n < b.n
              ? `${b.n} days · ${c!.n} with InBody`
              : `${b.n} day${b.n === 1 ? '' : 's'}`,
      };
    });
  }, [data]);

  const bucketOptions = BUCKET_OPTIONS[granularity];

  const rangeText =
    data?.rangeStart && data?.rangeEnd
      ? `${data.rangeStart} → ${clampToToday(data.rangeEnd)}`
      : '';

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<WeightGranularity>
          value={granularity} onChange={onGranularityChange}
          options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
        <Segmented<number>
          value={buckets} onChange={onBucketsChange}
          options={bucketOptions.map(n => [n, String(n)]) as [number, string][]} />
				<Segmented<WeightUnit>
          value={unit} onChange={onUnitChange}
          options={[['weight', 'Weight'], ['kg', 'kg'], ['pct', '%']]} />
      </div>

      {/* Resolved range — what you picked is a count, what you see is a span */}
      {rangeText && (
        <span className="text-[10px] text-stone-400 dark:text-zinc-500">{rangeText}</span>
      )}

      {points.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
      ) : (
        <CssStackedAreaChart
          points={points}
          // No segment defs in 'weight' mode, so the component draws the total
          // line and nothing else — same chart, no second implementation.
          segmentDefs={unit === 'weight' ? [] : segmentDefs}
          isDark={isDark}
          mode={unit === 'pct' ? 'percent' : 'absolute'}
          baselineZero={unit === 'kg'}
          formatY={v => v.toFixed(1)}
          height={190}
        />
      )}

      <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-relaxed">
        {unit === 'weight'
          ? 'Average weight per bucket. Gaps are buckets with no weigh-in.'
          : unit === 'kg'
            ? 'Stacked kg on a zero baseline. The line is total weight across every weigh-in; the fill covers days with an InBody reading, so where they part the bucket mixes both.'
            : 'Each bucket normalised to 100%, so a segment’s share is readable over time regardless of weight.'}
      </p>
    </div>
  );
}
