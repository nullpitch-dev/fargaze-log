'use client';
// src/app/insights/_widgets/BowelTrendView.tsx
// Bowel Movement widget (WBS #62) — Trend view on the shared grain × count
// window, counted back from the end of the selected period or YESTERDAY,
// whichever is earlier (an unfinished today would read as a gap day).
//
// Every bucket is a Summary run over the bucket's own dates (bowel.ts), so the
// stacks below use the Summary's own criteria and a Month bucket always agrees
// with the Summary for that month. This file only draws.
//
// Score        average day score, dashed share of bad days on the right axis
// Per day      0×…6×+          share of days            + average movements per day
// Gap          0d…5d+          share of movement days   + average gap
// Duration     0–1…21+ min     share of timed movements + average minutes
// Quality      nine values     ½ / ⅓ split, as the pie — ordinal, hard → normal → loose
// How it went  편하게 / 급하게 / 힘들게, "Not recorded" left out of the shares
// Other signs  NOT exclusive — each band is % of movements carrying the sign,
//              so the stack is not forced to 100%: its top is signs per 100 movements
// Time of day  the seven fixed groups, in clock order
//
// Scales keep their own order (bottom → top), never size order. Other signs
// have no natural order, so they run largest at the bottom.

import React, { useMemo } from 'react';
import {
  CssTrendChart, CssStackedAreaChart,
  type StackedAreaPoint, type StackedAreaSegmentDef,
} from '../_components/charts/css-chart-components';
import { BUCKET_OPTIONS } from './WeightTrendView';
import { chartColors } from '../_lib/chart-colors';
import type { TrendGrain } from '@/lib/insights/trend-window';

// ── Payload from /api/insights/stats?metric=bowel.trend ───────────────────────

export interface BowelTrendBucket {
  label: string;
  start: string;
  end: string;
  daysInBucket: number;
  movementDays: number;
  movements: number;
  score: {
    average: number | null;
    scoredDays: number;
    badDays: number;
    badShare: number | null;
    worst: { date: string; score: number } | null;
  };
  perDay:   { average: number;        counts: number[] };
  gap:      { average: number | null; counts: number[] };
  duration: { average: number | null; counts: number[]; counted: number };
  quality:  Record<string, number>;
  qualityCount: number;
  howItWent: Record<string, number>;
  otherSigns: { movements: number; pct: Record<string, number> };
  timeOfDay: Record<string, number>;
}

export interface BowelTrend {
  grain: TrendGrain;
  windowStart: string;
  windowEnd: string;
  perDayLabels: string[];
  gapLabels: string[];
  durationLabels: string[];
  qualityOrder: string[];
  signKeys: string[];
  timeGroups: { key: string; label: string; range: string }[];
  buckets: BowelTrendBucket[];
}

export type BowelTrendTab =
  'score' | 'perDay' | 'gap' | 'duration' | 'quality' | 'how' | 'signs' | 'time';

// ── Rules and colours shown to the reader ────────────────────────────────────
// Quality and How it went use the Summary pies' colours, so a colour means the
// same thing in both views.

const BAD_DAY_BELOW = -3;
const BAD_RED = '#ef4444';
const NOT_RECORDED = 'Not recorded';

const QUALITY_COLORS: Record<string, string> = {
  좋음: '#3b82f6', 보통: '#93c5fd',
  무름: '#fca5a5', 묽음: '#f87171', 설사: '#dc2626',
  가늠: '#fde68a', 푸석함: '#fbbf24', 딱딱함: '#d97706', 토끼똥: '#92400e',
};
const HOW_ORDER = ['편하게', '급하게', '힘들게'];
const HOW_COLORS: Record<string, string> = { 편하게: '#3b82f6', 급하게: '#f87171', 힘들게: '#fbbf24' };

// Single-hue ramps, light → dark along each scale. Per day starts grey: a day
// with no movement is an absence, not the lightest shade of "some".
const PER_DAY_RAMP  = ['#d6d3d1', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'];
const GAP_RAMP      = ['#fef3c7', '#fde68a', '#fbbf24', '#f59e0b', '#d97706', '#92400e'];
const DURATION_RAMP = ['#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#0d9488', '#115e59'];
// Dawn → day → dusk → night
const TIME_RAMP     = ['#fcd34d', '#fbbf24', '#f59e0b', '#fb923c', '#f87171', '#a78bfa', '#5b21b6'];
const SIGN_COLORS   = ['#3b82f6', '#f87171', '#fbbf24', '#34d399', '#a78bfa', '#f472b6'];
const SIGN_OTHER    = '#a8a29e';
const FALLBACK      = '#a8a29e';

const fmtScore = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtPct   = (v: number) => `${Math.round(v)}%`;
const fmtNum1  = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const fmtNum2  = (v: number) => v.toFixed(2).replace(/\.?0+$/, '');
const plural   = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ── Local segmented control (matches SleepTrendView) ─────────────────────────

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

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-stone-400 dark:text-zinc-500 leading-relaxed">{children}</p>;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: BowelTrend | null;
  isDark: boolean;
  tab: BowelTrendTab;
  onTabChange: (t: BowelTrendTab) => void;
  grain: TrendGrain;
  onGrainChange: (g: TrendGrain) => void;
  count: number;
  onCountChange: (n: number) => void;
}

const TABS: [BowelTrendTab, string][] = [
  ['score',    'Score'],
  ['perDay',   'Per day'],
  ['gap',      'Gap'],
  ['duration', 'Duration'],
  ['quality',  'Quality'],
  ['how',      'How it went'],
  ['signs',    'Other signs'],
  ['time',     'Time of day'],
];

export function BowelTrendView({
  data, isDark, tab, onTabChange, grain, onGrainChange, count, onCountChange,
}: Props) {
  const cc = chartColors(isDark);
  // The average lines sit over coloured bands, so they take the value ink
  // (stone-800 / zinc-100) rather than any band colour.
  const avgInk = cc.valueLabel;

  const buckets = data?.buckets ?? [];
  const n = buckets.length;
  const labels = buckets.map(b => b.label);
  const showValues = n <= 16;

  const rangeText = data && n ? `${data.windowStart} → ${data.windowEnd}` : '';

  // ── Stacked-area helper ─────────────────────────────────────────────────────
  // keys/labels/colours bottom → top; valuesOf returns one number per key, or
  // null for a bucket with nothing to stack (drawn as a gap).
  function area(
    keys: string[], names: string[], colors: string[],
    valuesOf: (b: BowelTrendBucket) => number[] | null,
    metaOf?: (b: BowelTrendBucket) => string | undefined,
  ): { points: StackedAreaPoint[]; defs: StackedAreaSegmentDef[] } {
    const defs = keys.map((key, i) => ({ key, label: names[i], color: colors[i] ?? FALLBACK }));
    const points = buckets.map(b => {
      const vals = valuesOf(b);
      const sum = vals ? vals.reduce((a, v) => a + v, 0) : 0;
      return {
        label: b.label,
        total: vals && sum > 0 ? sum : null,
        segments: vals && sum > 0 ? Object.fromEntries(keys.map((k, i) => [k, vals[i]])) : null,
        meta: metaOf?.(b),
      };
    });
    return { points, defs };
  }

  const charts = useMemo(() => {
    if (!data || !n) return null;
    const idx = (arr: string[]) => arr.map((_, i) => String(i));

    const perDay = area(
      idx(data.perDayLabels), data.perDayLabels, PER_DAY_RAMP,
      b => b.perDay.counts,
      b => plural(b.daysInBucket, 'day'),
    );
    const gap = area(
      idx(data.gapLabels), data.gapLabels, GAP_RAMP,
      b => (b.movementDays ? b.gap.counts : null),
      b => plural(b.gap.counts.reduce((a, v) => a + v, 0), 'movement day'),
    );
    const duration = area(
      idx(data.durationLabels), data.durationLabels.map(l => `${l} min`), DURATION_RAMP,
      b => (b.duration.counted ? b.duration.counts : null),
      b => plural(b.duration.counted, 'movement'),
    );
    const quality = area(
      data.qualityOrder, data.qualityOrder, data.qualityOrder.map(q => QUALITY_COLORS[q] ?? FALLBACK),
      b => (b.qualityCount ? data.qualityOrder.map(q => b.quality[q] ?? 0) : null),
      b => plural(b.qualityCount, 'movement'),
    );
    const how = area(
      HOW_ORDER, HOW_ORDER, HOW_ORDER.map(h => HOW_COLORS[h]),
      b => HOW_ORDER.map(h => b.howItWent[h] ?? 0),
      b => {
        const rec = HOW_ORDER.reduce((a, h) => a + (b.howItWent[h] ?? 0), 0);
        const nr = b.howItWent[NOT_RECORDED] ?? 0;
        return nr ? `${plural(rec, 'movement')} · ${nr} not recorded` : plural(rec, 'movement');
      },
    );
    const signs = area(
      data.signKeys, data.signKeys,
      data.signKeys.map((k, i) => (k === 'Other' ? SIGN_OTHER : SIGN_COLORS[i] ?? FALLBACK)),
      // A bucket with movements but no signs is a real zero, not a gap
      b => (b.otherSigns.movements ? data.signKeys.map(k => b.otherSigns.pct[k] ?? 0) : null),
      b => `of ${plural(b.otherSigns.movements, 'movement')}`,
    );
    // A bucket with movements but no signs is a real zero, not a gap: put the
    // zeros back (the helper drops zero sums) and the chart draws them on the
    // floor via zeroIsValue.
    signs.points = signs.points.map((p, i) =>
      p.segments === null && buckets[i].otherSigns.movements
        ? { ...p, total: 0, segments: Object.fromEntries(data.signKeys.map(k => [k, 0])) }
        : p);
    const time = area(
			data.timeGroups.map(g => g.key), data.timeGroups.map(g => `${g.range.slice(0, 5).replace(/^0/, '')}~`),
      TIME_RAMP,
      b => data.timeGroups.map(g => b.timeOfDay[g.key] ?? 0),
      b => plural(data.timeGroups.reduce((a, g) => a + (b.timeOfDay[g.key] ?? 0), 0), 'movement'),
    );
    return { perDay, gap, duration, quality, how, signs, time };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Tabs ────────────────────────────────────────────────────────────────────

  function renderScore() {
    const avg = buckets.map(b => b.score.average);
    if (!avg.some(v => v !== null)) {
      return <NoData isDark={isDark} />;
    }
    const notes = buckets.map(b => {
      if (b.score.average === null) return null;
      const bad = `${b.score.badDays} of ${plural(b.score.scoredDays, 'day')} bad`;
      return b.score.worst && grain !== 'day'
        ? `${bad} · worst ${b.score.worst.date.slice(5)} ${fmtScore(b.score.worst.score)}`
        : bad;
    });
    return (
      <>
        <CssTrendChart
          series={[{ values: avg, color: cc.lineStroke, label: 'Avg score' }]}
          rightSeries={{ values: buckets.map(b => b.score.badShare), color: BAD_RED, label: 'Bad days', dim: true }}
          formatYRight={fmtPct}
          labels={labels}
          formatY={fmtScore}
          yAxis={{ baseline: 0 }}
          zones={[{ from: -1000, to: BAD_DAY_BELOW, color: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.07)' }]}
          notes={notes}
          isDark={isDark}
          maxXLabels={12}
          showValues={showValues}
        />
        <Note>
          The line is the average day score; the dashed line on the right is the share of days
          scoring below {BAD_DAY_BELOW}. No score before 19 Sep 2019.
        </Note>
      </>
    );
  }

  function renderArea(
    c: { points: StackedAreaPoint[]; defs: StackedAreaSegmentDef[] },
    opts: {
      mode?: 'absolute' | 'percent';
      zeroIsValue?: boolean;
      right?: { values: (number | null)[]; label: string; fmt: (v: number) => string };
      note: React.ReactNode;
    },
  ) {
    if (!c.points.some(p => p.total !== null)) return <NoData isDark={isDark} />;
    const percent = (opts.mode ?? 'percent') === 'percent';
    return (
      <>
        <CssStackedAreaChart
          points={c.points}
          segmentDefs={c.defs}
          isDark={isDark}
          mode={opts.mode ?? 'percent'}
          baselineZero={!percent}
          highlightable
          zeroIsValue={opts.zeroIsValue}
          maxXLabels={12}
          formatY={fmtPct}
          height={190}
          rightLine={opts.right ? { values: opts.right.values, color: avgInk, label: opts.right.label } : undefined}
          formatYRight={opts.right?.fmt}
        />
        <Note>{opts.note}</Note>
      </>
    );
  }

  function renderTab() {
    if (!charts) return <NoData isDark={isDark} />;
    switch (tab) {
      case 'score': return renderScore();
      case 'perDay': return renderArea(charts.perDay, {
        right: { values: buckets.map(b => b.perDay.average), label: 'Avg per day', fmt: fmtNum2 },
        note: 'Share of days by number of movements. The line on the right is the average per day.',
      });
      case 'gap': return renderArea(charts.gap, {
        right: { values: buckets.map(b => (b.movementDays ? b.gap.average : null)), label: 'Avg gap (days)', fmt: fmtNum2 },
        note: 'Share of movement days by the empty days just before them. The line on the right is the average gap.',
      });
      case 'duration': return renderArea(charts.duration, {
        right: { values: buckets.map(b => b.duration.average), label: 'Avg minutes', fmt: fmtNum1 },
        note: 'Share of timed movements by duration. The line on the right is the average in minutes.',
      });
      case 'quality': return renderArea(charts.quality, {
        note: 'Share of movements by quality, hard at the bottom to loose at the top. A movement with two values counts half to each.',
      });
      case 'how': return renderArea(charts.how, {
        note: 'Share of movements by how it went, from 19 Sep 2019. Movements with nothing recorded are left out.',
      });
      case 'signs': return renderArea(charts.signs, {
        mode: 'absolute',
        zeroIsValue: true,
        note: 'Each band is the % of movements carrying that sign. Signs can occur together, so the stack is not 100%: its top is signs per 100 movements. From 19 Sep 2019.',
      });
      case 'time': return renderArea(charts.time, {
        note: 'Share of movements by time of day, early morning at the bottom to night at the top.',
      });
    }
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
            options={BUCKET_OPTIONS[grain].map(v => [v, String(v)]) as [number, string][]} />
        </div>
      </div>

      {/* Row 2: resolved range — what you picked is a count, what you see is a span */}
      {rangeText && (
        <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1">{rangeText}</p>
      )}

      {!n ? <NoData isDark={isDark} /> : renderTab()}
    </div>
  );
}
