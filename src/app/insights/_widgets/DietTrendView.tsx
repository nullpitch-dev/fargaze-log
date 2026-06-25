'use client';
// src/app/insights/_widgets/DietTrendView.tsx
// Diet widget — Trend view. 8 tabs: four box-plot-per-bucket metrics, three
// stacked-bar tabs (composition / spicy / relation), and companions (rank-flow,
// built next). Self-contained: only shared chart primitives are imported.

import React, { useMemo, useState } from 'react';
import {
  CssVerticalBoxPlotChart, minsToClockStr,
  type BoxPlotBucket,
} from '../_components/charts/css-chart-components';
import { StackedBars, type StackedSeries, type StackedBucket } from '../_components/charts/StackedBars';
import { CssRankFlowChart, type RankFlowBucket } from '../_components/charts/CssRankFlowChart';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useLiveFilter } from '../_lib/useLiveFilter';
import { categoryColors } from '../_lib/chart-colors';
import { BucketSelector } from '../_components/WidgetCard';

// ── Bucket shape from /api/insights/stats?metric=diet.summary&mode=trend ────────
export interface DietTrendBucket {
  label: string;
  daysInPeriod: number;
  eatingCutoff:   number[];
  caffeineCutoff: number[];
  servings:       number[];
  carbs:          number[];
  ateIng:    Record<string, number>;
  ateItems:  Record<string, number>;
  drankIng:  Record<string, number>;
  drankItems:Record<string, number>;
  spicy:     { H: number; M: number; L: number };
  relation:  Record<string, number>;
	people:    Record<string, Record<string, number>>;
}

type TrendTab = 'eating' | 'caffeine' | 'servings' | 'carbs'
              | 'composition' | 'spicy' | 'relation' | 'companions';
type SideTab  = 'food' | 'drink';
type ViewTab  = 'ingredients' | 'items';

const OTHERS_KEY = '__others__';
const ALONE      = '혼자';

// ── Local helpers (mirror DietWidget) ──────────────────────────────────────────
function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function boxStats(values: number[]): Omit<BoxPlotBucket, 'label'> | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return {
    min: s[0], max: s[s.length - 1],
    avg: s.reduce((a, b) => a + b, 0) / s.length,
    p25: percentile(s, 0.25), p75: percentile(s, 0.75),
  };
}
const fmtNum = (v: number) => (Math.round(v * 10) / 10).toString();

function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px] w-fit">
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)}
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

// ── Component ───────────────────────────────────────────────────────────────────
export function DietTrendView({ data, isDark, bucketsBack, onBucketsBackChange }: {
  data: DietTrendBucket[];
  isDark: boolean;
  bucketsBack: number;
  onBucketsBackChange: (n: number) => void;
}) {
	const [tab,  setTab]  = useState<TrendTab>('eating');
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

  const TABS: [TrendTab, string][] = [
    ['eating', 'Eating'], ['caffeine', 'Caffeine'], ['servings', 'Servings'], ['carbs', 'Carbs'],
    ['composition', 'Composition'], ['spicy', 'Spicy'], ['relation', 'Relation'],
		['companions', 'People'],
  ];

  if (!data.length) return <NoData isDark={isDark} />;

  // ── box-plot tabs ──────────────────────────────────────────────────────────
  const BOX: Record<'eating' | 'caffeine' | 'servings' | 'carbs',
                    { key: keyof DietTrendBucket; formatY: (v: number) => string }> = {
    eating:   { key: 'eatingCutoff',   formatY: v => minsToClockStr(v, true) },
    caffeine: { key: 'caffeineCutoff', formatY: v => minsToClockStr(v, true) },
    servings: { key: 'servings',       formatY: fmtNum },
    carbs:    { key: 'carbs',          formatY: fmtNum },
  };
  function renderBox(cfg: { key: keyof DietTrendBucket; formatY: (v: number) => string }) {
    const buckets = data
      .map(b => {
        const s = boxStats(b[cfg.key] as number[]);
        return s ? ({ label: b.label, ...s } as BoxPlotBucket) : null;
      })
      .filter((b): b is BoxPlotBucket => b !== null);
    if (!buckets.length) return <NoData isDark={isDark} />;
    return <CssVerticalBoxPlotChart buckets={buckets} isDark={isDark} formatY={cfg.formatY} />;
  }

  // ── composition (Food/Drink × Ingredients/Items) ───────────────────────────
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

  // ── spicy (absolute day counts) ────────────────────────────────────────────
  function renderSpicy() {
    const buckets: StackedBucket[] = data.map(b => ({
      label: b.label, values: { L: b.spicy.L, M: b.spicy.M, H: b.spicy.H },
    }));
    const series: StackedSeries[] = [
      { key: 'L', label: 'Not spicy', color: isDark ? '#60a5fa' : '#3b82f6' },
      { key: 'M', label: 'Mild (M)',  color: isDark ? '#fbbf24' : '#f59e0b' },
      { key: 'H', label: 'Spicy (H)', color: isDark ? '#f87171' : '#ef4444' },
    ];
    return <StackedBars buckets={buckets} series={series} isDark={isDark} mode="absolute" formatY={v => String(Math.round(v))} />;
  }

  // ── relation (100% share; 혼자 neutral) ────────────────────────────────────
  function renderRelation() {
    const totals: Record<string, number> = {};
    data.forEach(b => Object.entries(b.relation).forEach(([k, v]) => { totals[k] = (totals[k] ?? 0) + v; }));
    const cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    let pi = 0;
    const series: StackedSeries[] = cats.map(k => ({
      key: k, label: k, color: k === ALONE ? neutral : palette[(pi++) % palette.length],
    }));
		const buckets: StackedBucket[] = data.map(b => ({ label: b.label, values: { ...b.relation } }));
    return <StackedBars buckets={buckets} series={series} isDark={isDark} mode="percent" />;
  }

	// ── companions (rank-flow of top-7 people, live Type filter) ───────────────
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
      {/* tab bar + bucket-size selector (wraps, no horizontal scroll) */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {TABS.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                tab === t
                  ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                  : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <BucketSelector value={bucketsBack} onChange={onBucketsBackChange} />
      </div>

      {(tab === 'eating' || tab === 'caffeine' || tab === 'servings' || tab === 'carbs') && renderBox(BOX[tab])}
      {tab === 'composition' && renderComposition()}
      {tab === 'spicy'       && renderSpicy()}
      {tab === 'relation'    && renderRelation()}
			{tab === 'companions'  && renderCompanions()}
    </div>
  );
}
