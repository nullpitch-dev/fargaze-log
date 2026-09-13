'use client';
// src/app/insights/_widgets/SleepTrendView.tsx
// Sleep widget — Trend view on the Weight-style window: grain × bucket count,
// counted back from the end of the selected period or today, whichever is
// earlier.
//
// Two tabs, not four. Duration, Bedtime and Wake were three separate charts
// that answered one question between them — did the whole night move, or
// stretch? Session puts all three on one picture: the band runs from average
// bedtime up to average wake time on a continuous clock axis, and the dashed
// line on the right-hand axis is the duration.
//
// The band's width and the duration line are NOT the same number, which is
// why both are drawn. The band spans first-bed to last-wake; the duration is
// the SUM of every sleep assigned to the day. A split night (asleep 19:00,
// awake 23:00, asleep again 05:00, awake 10:00) spans fifteen hours and
// totals nine. A day with a nap spans six and totals nine.
//
// Quality cannot join a clock axis — it is an ordinal scale — so it keeps its
// own tab.
//
// Every tab is a single line or a single area, so none of them has the
// density problem that pinned Diet's Composition and People to the short
// count. All of them use the long counts.

import React, { useMemo } from 'react';
import {
  CssDualLineChart, CssStackedAreaChart,
  type StackedAreaPoint, type StackedAreaSegmentDef,
} from '../_components/charts/css-chart-components';
import { BUCKET_OPTIONS } from './WeightTrendView';
import type { TrendGrain } from '@/lib/insights/trend-window';

// ── Bucket shape from /api/insights/stats?metric=sleep.trend ──────────────────

export interface SleepTrendBucket {
  label: string;
  start: string;
  daysInBucket: number;
  sleepDays: number;
  avgDurationSec: number | null;
  avgBedMin: number | null;     // minutes from midnight of the sleep day
  avgWakeMin: number | null;    // may exceed 1440 — the morning after
  avgBedClock: string | null;
  avgWakeClock: string | null;
  qualityScore: number | null;
  qualityPercent: number | null;
  quality: { good: number; ok: number; bad: number };
}

export type SleepTrendTab = 'session' | 'quality';

// Same scale as the Summary card's pies, so a colour means the same thing in
// both views. Ordinal, so the band order is the scale's own order — worst at
// the bottom, best on top — never total size.
const QUALITY_BANDS: [key: string, label: string, color: string][] = [
  ['bad',  'Poor', '#f87171'],
  ['ok',   'OK',   '#93c5fd'],
  ['good', 'Good', '#3b82f6'],
];

// ── Local segmented control (matches DietTrendView) ───────────────────────────

function Segmented<T extends string | number>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px] w-fit">
      {options.map(([val, label]) => (
        <button key={String(val)} onClick={() => onChange(val)}
          className={`px-2.5 py-1 transition-colors ${
            value === val
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function NoData({ isDark }: { isDark: boolean }) {
  return (
    <p className="text-xs py-6 text-center" style={{ color: isDark ? '#a1a1aa' : '#a8a29e' }}>
      No data for this range.
    </p>
  );
}

// ── Resolved range line ───────────────────────────────────────────────────────
// The control states a count; this line states the span it resolved to. The
// grain comes from the SERVER-echoed value, never from the control, so a grain
// switch cannot render one frame of new labels against old data.

const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

function bucketEndISO(startISO: string, g: TrendGrain): string {
  const [y, m, d] = startISO.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (g === 'week') dt.setDate(dt.getDate() + 6);
  else if (g === 'month') { dt.setMonth(dt.getMonth() + 1); dt.setDate(dt.getDate() - 1); }
  return toISO(dt);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: SleepTrendBucket[];
  isDark: boolean;
  tab: SleepTrendTab;
  onTabChange: (t: SleepTrendTab) => void;
  grain: TrendGrain;
  onGrainChange: (g: TrendGrain) => void;
  count: number;
  onCountChange: (n: number) => void;
  /** grain the SERVER used — labels and the range line format from this */
  dataGrain: TrendGrain;
}

export function SleepTrendView({
  data, isDark, tab, onTabChange, grain, onGrainChange, count, onCountChange, dataGrain,
}: Props) {
  const TABS: [SleepTrendTab, string][] = [
    ['session', 'Session'],
    ['quality', 'Quality'],
  ];

  const lastEnd = data.length ? bucketEndISO(data[data.length - 1].start, dataGrain) : '';
  const todayISO = toISO(new Date());
  const rangeText = data.length
    ? `${data[0].start} → ${lastEnd > todayISO ? todayISO : lastEnd}`
    : '';

  // ── Session — bedtime / wake band plus the duration line ───────────────────
  const sessionBuckets = useMemo(
    () => data.map(b => ({
      label: b.label,
      avgStartMins: b.avgBedMin,
      avgEndMins: b.avgWakeMin,
      avgDurationSeconds: b.avgDurationSec,
    })),
    [data],
  );

  // ── Quality — stacked area of the mix of days ──────────────────────────────
  // Percent mode: the question is how the mix shifted, and an absolute count
  // would just redraw the number of days in each bucket. A bucket with no
  // rated day totals zero and draws as a gap, not an empty column.
  const qualityArea = useMemo(() => {
    const defs: StackedAreaSegmentDef[] = QUALITY_BANDS.map(([key, label, color]) => ({
      key, label, color,
    }));
    const points: StackedAreaPoint[] = data.map(b => {
      const sum = b.quality.good + b.quality.ok + b.quality.bad;
      return {
        label: b.label,
        total: sum > 0 ? sum : null,
        segments: sum > 0
          ? { bad: b.quality.bad, ok: b.quality.ok, good: b.quality.good }
          : null,
      };
    });
    return { points, defs };
  }, [data]);

  function renderSession() {
    if (!sessionBuckets.some(b => b.avgStartMins !== null && b.avgEndMins !== null)) {
      return <NoData isDark={isDark} />;
    }
    return (
      <>
        <CssDualLineChart
          buckets={sessionBuckets}
          isDark={isDark}
          maxXLabels={12}
          // Clock captions beside every dot are legible at a dozen buckets and
          // solid ink at a hundred. The hover card still carries the figures.
          showValues={sessionBuckets.length <= 16}
        />
        <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-relaxed">
          The band runs from average bedtime to average wake time; the dashed line on the right
          is average time asleep. They differ where a night was split or a nap was taken — the
          band is first-bed to last-wake, the line is everything actually slept.
        </p>
      </>
    );
  }

  function renderQuality() {
    if (!qualityArea.points.some(p => p.total !== null)) return <NoData isDark={isDark} />;
    return (
      <>
        <CssStackedAreaChart
          points={qualityArea.points}
          segmentDefs={qualityArea.defs}
          isDark={isDark}
          mode="percent"
          highlightable
          maxXLabels={12}
          formatY={v => `${Math.round(v)}%`}
          height={190}
        />
        <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-relaxed">
          Share of days at each rating. Bands keep the scale&rsquo;s own order rather than being
          sorted by size, because the rating is ordinal. A gap is a bucket with nothing recorded.
        </p>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3 flex-1">
      {/* Row 1: tabs on the left, grain × count on the right */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => onTabChange(t)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                tab === t
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Segmented<TrendGrain>
            value={grain} onChange={onGrainChange}
            options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
          <Segmented<number>
            value={count} onChange={onCountChange}
            options={BUCKET_OPTIONS[grain].map(n => [n, String(n)]) as [number, string][]} />
        </div>
      </div>

      {/* Row 2: resolved range — what you picked is a count, what you see is a span */}
      {rangeText && (
        <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1">{rangeText}</p>
      )}

      {!data.length ? <NoData isDark={isDark} /> : (
        <>
          {tab === 'session' && renderSession()}
          {tab === 'quality' && renderQuality()}
        </>
      )}
    </div>
  );
}
