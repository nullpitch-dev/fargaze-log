'use client';
// src/app/insights/_widgets/DietTrendView.tsx
// Diet widget — Trend view on the Weight-style window: grain × bucket count,
// counted back from the end of the selected period or today, whichever is
// earlier. 8 tabs: four daily metrics as three-line charts, Composition and
// People on the short count with their original charts, Spicy and Relation as
// stacked areas. Self-contained: only shared chart primitives are imported.

import React, { useMemo, useState } from 'react';
import {
  CssTrendChart, CssStackedAreaChart, minsToClockStr,
  type StackedAreaPoint, type StackedAreaSegmentDef,
} from '../_components/charts/css-chart-components';
import { StackedBars, type StackedSeries, type StackedBucket } from '../_components/charts/StackedBars';
import { CssRankFlowChart, type RankFlowBucket } from '../_components/charts/CssRankFlowChart';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useLiveFilter } from '../_lib/useLiveFilter';
import { categoryColors } from '../_lib/chart-colors';
import { BUCKET_OPTIONS } from './WeightTrendView';
import type { TrendGrain } from '@/lib/insights/trend-window';

// ── Bucket shape from /api/insights/stats?metric=diet.trend ────────────────────

export interface DietBox { min: number; max: number; avg: number; }

export interface DietTrendBucket {
  label: string;
  start: string;
  daysInBucket: number;
  eatingCutoff:   DietBox | null;
  caffeineCutoff: DietBox | null;
  servings:       DietBox | null;
  carbs:          DietBox | null;
  ateIng:    Record<string, number>;
  ateItems:  Record<string, number>;
  drankIng:  Record<string, number>;
  drankItems:Record<string, number>;
  spicy:     { H: number; M: number; L: number };
  relation:  Record<string, number>;
  people:    Record<string, Record<string, number>>;
}

export type DietTrendTab =
  | 'eating' | 'caffeine' | 'servings' | 'carbs'
  | 'composition' | 'spicy' | 'relation' | 'companions';

/** Tabs that cannot render at 120 buckets and stay on the short count. */
export const DIET_SHORT_COUNT_TABS: DietTrendTab[] = ['composition', 'companions'];
export const DIET_SHORT_COUNTS: number[] = [3, 6, 12];

type SideTab  = 'food' | 'drink';
type ViewTab  = 'ingredients' | 'items';

const OTHERS_KEY = '__others__';
const ALONE      = '혼자';

const fmtNum = (v: number) => (Math.round(v * 10) / 10).toString();

// ── Local segmented control ───────────────────────────────────────────────────
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
  return <p className="text-xs py-6 text-center" style={{ color: isDark ? '#a1a1aa' : '#a8a29e' }}>No data for this range.</p>;
}

// ── Resolved range line ───────────────────────────────────────────────────────
// The control states a count; this line states the span it resolved to. Both
// the label grain and the span come from the SERVER-echoed grain, never from
// the control, so a grain switch cannot render one frame of new labels against
// old data.
const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
function bucketEndISO(startISO: string, g: TrendGrain): string {
  const [y, m, d] = startISO.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  if (g === 'week') dt.setDate(dt.getDate() + 6);
  else if (g === 'month') { dt.setMonth(dt.getMonth() + 1); dt.setDate(dt.getDate() - 1); }
  return toISO(dt);
}

// ── Stacked-area adapter ──────────────────────────────────────────────────────
// Band order is fixed across the whole window by total size, largest at the
// bottom, so a band never swaps places as you scroll through time. A bucket
// whose bands sum to zero becomes a gap rather than an empty column — for
// Spicy that is a stretch where spiciness was simply never recorded.
function toArea(
  raw: { label: string; data: Record<string, number> }[],
  colorMap: Record<string, string>,
  isDark: boolean,
  fixedOrder?: string[],
): { points: StackedAreaPoint[]; defs: StackedAreaSegmentDef[] } {
  const ng = isDark ? '#71717a' : '#a8a29e';
  const totals: Record<string, number> = {};
  for (const b of raw) {
    for (const [k, v] of Object.entries(b.data)) if (k.trim()) totals[k] = (totals[k] ?? 0) + v;
  }
  const cats = fixedOrder ?? Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const defs = cats.map(c => ({ key: c, label: c, color: colorMap[c] ?? ng }));

  const points = raw.map(b => {
    const segments: Record<string, number> = {};
    let sum = 0;
    for (const c of cats) {
      const v = b.data[c] ?? 0;
      segments[c] = v;
      sum += v;
    }
    return { label: b.label, total: sum > 0 ? sum : null, segments: sum > 0 ? segments : null };
  });

  return { points, defs };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DietTrendView({
  data, isDark, tab, onTabChange,
  grain, onGrainChange, count, onCountChange,
  shortCount, onShortCountChange, dataGrain,
}: {
  data: DietTrendBucket[];
  isDark: boolean;
  tab: DietTrendTab;
  onTabChange: (t: DietTrendTab) => void;
  grain: TrendGrain;
  onGrainChange: (g: TrendGrain) => void;
  count: number;
  onCountChange: (n: number) => void;
  shortCount: number;
  onShortCountChange: (n: number) => void;
  dataGrain: TrendGrain;
}) {
  const [side, setSide] = useState<SideTab>('food');
  const [view, setView] = useState<ViewTab>('ingredients');

  // Relation filter — live, but an empty selection ("Deselect all") is held
  // until the dropdown closes rather than emptying the chart.
  const allTypes = useMemo(
    () => [...new Set(data.flatMap(b => Object.values(b.people).flatMap(cats => Object.keys(cats))))].filter(t => t.trim()),
    [data],
  );
  const relation = useLiveFilter(allTypes);
  const palette = categoryColors(isDark);
  const neutral = isDark ? '#52525b' : '#a8a29e';

  const isShortTab = DIET_SHORT_COUNT_TABS.includes(tab);
  const labels     = data.map(b => b.label);
  const alwaysShow = (isShortTab ? shortCount : count) <= 6;
  const lineProps  = {
    maxXLabels: 12,
    showValues: data.length <= 16,
    compressXLabels: false,
  } as const;

  const TABS: [DietTrendTab, string][] = [
    ['eating', 'Eating'], ['caffeine', 'Caffeine'], ['servings', 'Servings'], ['carbs', 'Carbs'],
    ['composition', 'Composition'], ['spicy', 'Spicy'], ['relation', 'Relation'],
    ['companions', 'People'],
  ];

  const lastEnd   = data.length ? bucketEndISO(data[data.length - 1].start, dataGrain) : '';
  const todayISO  = toISO(new Date());
  const rangeText = data.length
    ? `${data[0].start} → ${lastEnd > todayISO ? todayISO : lastEnd}`
    : '';

  // ── Four daily metrics: three lines instead of a box plot ──────────────────
  // Quartiles were dropped, and a box per bucket is unreadable at 120 buckets.
  // Average is the headline; max and min are lighter. A bucket with no
  // qualifying day is a gap, not a zero.
  const LINES: Record<'eating' | 'caffeine' | 'servings' | 'carbs',
                      { key: keyof DietTrendBucket; formatY: (v: number) => string }> = {
    eating:   { key: 'eatingCutoff',   formatY: v => minsToClockStr(v, true) },
    caffeine: { key: 'caffeineCutoff', formatY: v => minsToClockStr(v, true) },
    servings: { key: 'servings',       formatY: fmtNum },
    carbs:    { key: 'carbs',          formatY: fmtNum },
  };

  function renderLines(cfg: { key: keyof DietTrendBucket; formatY: (v: number) => string }) {
    const boxes = data.map(b => b[cfg.key] as DietBox | null);
    if (!boxes.some(x => x !== null)) return <NoData isDark={isDark} />;

    const avgC = isDark ? '#2dd4bf' : '#1d4ed8';
    const maxC = isDark ? '#5eead4' : '#60a5fa';
    const minC = isDark ? '#99f6e4' : '#93c5fd';
    return (
      <CssTrendChart
        series={[
          { values: boxes.map(x => x?.avg ?? null), color: avgC, label: 'Avg' },
          { values: boxes.map(x => x?.max ?? null), color: maxC, label: 'Max' },
          { values: boxes.map(x => x?.min ?? null), color: minC, label: 'Min' },
        ]}
        labels={labels}
        formatY={cfg.formatY}
        isDark={isDark}
        alwaysShowLabels={alwaysShow}
        {...lineProps}
      />
    );
  }

  // ── Composition (Food/Drink × Ingredients/Items) — unchanged, short count ──
  // Kept as dense stacked bars: fixing band membership across a long window
  // would change what the tab means, and the short count keeps it readable.
  function renderComposition() {
    const mapKey: keyof DietTrendBucket =
      side === 'food'
        ? (view === 'ingredients' ? 'ateIng'   : 'ateItems')
        : (view === 'ingredients' ? 'drankIng' : 'drankItems');

    const maps = data.map(b => b[mapKey] as Record<string, number>);
    const totals: Record<string, number> = {};
    maps.forEach(m => Object.entries(m).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + v; }));

    // Grow the member list until no bucket's "others" share reaches OTHERS_MAX,
    // capped at the palette size so colours never repeat.
    const OTHERS_MAX = 0.30;
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const bucketTotals = maps.map(m => Object.values(m).reduce((s, v) => s + v, 0));
    const worstOthersShare = (n: number) => {
      const set = new Set(ranked.slice(0, n));
      let worst = 0;
      maps.forEach((m, bi) => {
        const tot = bucketTotals[bi];
        if (!tot) return;
        let others = 0;
        for (const [k, v] of Object.entries(m)) if (!set.has(k)) others += v;
        worst = Math.max(worst, others / tot);
      });
      return worst;
    };
    const capN = Math.min(palette.length, ranked.length);
    let n = Math.min(7, capN);
    while (n < capN && worstOthersShare(n) >= OTHERS_MAX) n++;

    const top = ranked.slice(0, n);
    const topSet = new Set(top);

    const series: StackedSeries[] = top.map((k, i) => ({ key: k, label: k, color: palette[i % palette.length] }));
    if (n < ranked.length) series.push({ key: OTHERS_KEY, label: 'others', color: neutral });

    const buckets: StackedBucket[] = data.map((b, bi) => {
      const m = maps[bi];
      const values: Record<string, number> = {};
      let others = 0;
      for (const [k, v] of Object.entries(m)) {
        if (topSet.has(k)) values[k] = v; else others += v;
      }
      if (others > 0) values[OTHERS_KEY] = others;
      return { label: b.label, values };
    });

    const hasAny = buckets.some(b => Object.keys(b.values).length);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Segmented value={side} onChange={setSide} options={[['food', 'Food'], ['drink', 'Drink']]} />
          <Segmented value={view} onChange={setView} options={[['ingredients', 'Ingredients'], ['items', 'Items']]} />
        </div>
        {hasAny ? <StackedBars buckets={buckets} series={series} isDark={isDark} mode="percent" /> : <NoData isDark={isDark} />}
      </div>
    );
  }

  // ── Spicy — stacked area of absolute day counts ────────────────────────────
  // Band order is the scale's own order, mild at the bottom, not total size:
  // this is an ordinal level, so reordering it by frequency would be
  // misleading. Only days with a recorded level are counted, so a stretch
  // where spiciness was never logged reads as a gap rather than a full band.
  function renderSpicy() {
    const raw = data.map(b => ({
      label: b.label,
      data: { 'Not spicy': b.spicy.L, 'Mild (M)': b.spicy.M, 'Spicy (H)': b.spicy.H },
    }));
    const colorMap = {
      'Not spicy': isDark ? '#60a5fa' : '#3b82f6',
      'Mild (M)':  isDark ? '#fbbf24' : '#f59e0b',
      'Spicy (H)': isDark ? '#f87171' : '#ef4444',
    };
    const { points, defs } = toArea(raw, colorMap, isDark, ['Not spicy', 'Mild (M)', 'Spicy (H)']);
    if (!points.some(p => p.total !== null)) return <NoData isDark={isDark} />;
    return (
      <CssStackedAreaChart
				points={points} segmentDefs={defs} isDark={isDark} mode="absolute" baselineZero highlightable
        maxXLabels={12} formatY={v => String(Math.round(v))} height={190} />
    );
  }

  // ── Relation — stacked area of the share of eating and drinking events ─────
  function renderRelation() {
    const totals: Record<string, number> = {};
    data.forEach(b => Object.entries(b.relation).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + v; }));
    const cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    let pi = 0;
    const colorMap: Record<string, string> = {};
    cats.forEach(k => { colorMap[k] = k === ALONE ? neutral : palette[(pi++) % palette.length]; });

    const raw = data.map(b => ({ label: b.label, data: { ...b.relation } }));
    const { points, defs } = toArea(raw, colorMap, isDark, cats);
    if (!points.some(p => p.total !== null)) return <NoData isDark={isDark} />;
    return (
      <CssStackedAreaChart
				points={points} segmentDefs={defs} isDark={isDark} mode="percent" highlightable
        maxXLabels={12} formatY={v => `${Math.round(v)}%`} height={190} />
    );
  }

  // ── People — rank flow, unchanged, short count ─────────────────────────────
  function renderCompanions() {
    const selSet = new Set(relation.applied);   // chart uses the applied set; empty = none
    const buckets: RankFlowBucket[] = data.map(b => ({
      label: b.label,
      ranked: Object.entries(b.people)
        .map(([name, cats]) => ({
          name,
          count: Object.entries(cats).reduce((s, [c, v]) => s + (selSet.has(c) ? v : 0), 0),
        }))
        .filter(p => p.count > 0)
        .sort((x, y) => y.count - x.count)
        .slice(0, 7),
    }));

    const hasAny = buckets.some(b => b.ranked.length);
    const typeControl = (
      <MultiSelectDropdown label="Relation" options={allTypes}
        selected={relation.draft} onChange={relation.onChange} onClose={relation.onClose} />
    );
    return hasAny
      ? <CssRankFlowChart buckets={buckets} topN={7} isDark={isDark} controls={typeControl} />
      : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">{typeControl}</div>
          <NoData isDark={isDark} />
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: tab pills + grain × count */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
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
          {isShortTab ? (
            <Segmented<number>
              value={shortCount} onChange={onShortCountChange}
              options={DIET_SHORT_COUNTS.map(n => [n, String(n)]) as [number, string][]} />
          ) : (
            <Segmented<number>
              value={count} onChange={onCountChange}
              options={BUCKET_OPTIONS[grain].map(n => [n, String(n)]) as [number, string][]} />
          )}
        </div>
      </div>

      {/* Row 2: resolved range — what you picked is a count, what you see is a span */}
      {rangeText && (
        <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1">{rangeText}</p>
      )}

      {!data.length ? <NoData isDark={isDark} /> : (
        <>
          {(tab === 'eating' || tab === 'caffeine' || tab === 'servings' || tab === 'carbs') && renderLines(LINES[tab])}
          {tab === 'composition' && renderComposition()}
          {tab === 'spicy'       && renderSpicy()}
          {tab === 'relation'    && renderRelation()}
          {tab === 'companions'  && renderCompanions()}
        </>
      )}
    </div>
  );
}
