'use client';
// src/app/insights/_widgets/DrinkingWidget.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { Segmented } from '../_components/Segmented';
import { BUCKET_OPTIONS, DEFAULT_BUCKETS } from './WeightTrendView';
import type { TrendGrain } from '@/lib/insights/trend-window';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { formatDuration } from '../_lib/format';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';
import { BoxPlot } from '../_components/charts/BoxPlot';
import { Histogram } from '../_components/charts/Histogram';
import {
  CssTrendChart,
  CssStackedAreaChart,
  CssDualLineChart,
  REST_BUCKET_COLORS_LIGHT,
  REST_BUCKET_COLORS_DARK,
} from '../_components/charts/css-chart-components';
import type { StackedAreaPoint, StackedAreaSegmentDef } from '../_components/charts/css-chart-components';
import { CssRankFlowChart } from '../_components/charts/CssRankFlowChart';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useLiveFilter } from '../_lib/useLiveFilter';
import { BarSection } from '../_components/charts/bars';
import { autoColorMap } from '../_lib/chart-colors';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrendMetric = 'days' | 'totalDrinks' | 'drinksPerDay' | 'drinkType' | 'occasion' | 'withWhom' | 'topPeople' | 'restDays' | 'sessionTime';

interface DrinksStats {
  total: number;
  min:   number;
  max:   number;
  avg:   number;
  p25:   number;
  p75:   number;
  n:     number;
}

interface DrinkingSummary {
  daysInPeriod:       number;
  drinkingDays:       number;
  restDays:           number;
  avgRestDays:        number;
  histogram:          Record<string, number>;
  avgStartClock:      string | null;
  avgEndClock:        string | null;
  avgDurationSeconds: number | null;
  occasions:          Record<string, number>;
  drinks:             DrinksStats | null;
  drinkType:          Record<string, number>;
  companions: {
    alone:          number;
    total:          number;
    byRelationType: Record<string, number>;
    topPeople:      { name: string; dominantCategory: string; total: number }[];
  };
}

interface DrinkingTrendBucket {
  label:              string;
  start:              string;
  drinkingDays:       number;
  daysInBucket:       number;
  totalDrinks:        number;
  avgDrinksPerDay:    number | null;
  // Quartiles dropped — the trend view draws average, max and min as lines.
  drinksBox:          { min: number; max: number; avg: number } | null;
  // null where no dry run ended in the bucket; dryDaysAtEnd carries the
  // running total instead, so a fully dry stretch is not silent.
  avgRestDays:        number | null;
  dryDaysAtEnd:       number | null;
  histogram:          Record<string, number>;
  drinkType:          Record<string, number>;
  occasions:          Record<string, number>;
	companions:         Record<string, number>;
  people:             Record<string, Record<string, number>>;
  avgStartMins:       number | null;
  avgEndMins:         number | null;
  avgDurationSeconds: number | null;
}

// ── Metric definitions ────────────────────────────────────────────────────────

const TREND_METRICS: { key: TrendMetric; label: string; desc: string; tip?: string }[] = [
  { key: 'days',        label: 'Freq',      desc: 'Number of drinking days over time'                },
  { key: 'totalDrinks', label: 'Amt(all)',  desc: 'Total drinks consumed over time',
    tip: '1 drink = 50 ml soju equivalent' },
  { key: 'drinksPerDay',label: 'Amt(day)',  desc: 'Drinks per drinking day — distribution over time',
    tip: '1 drink = 50 ml soju equivalent' },
  { key: 'drinkType',   label: 'Type',      desc: 'Mix of drink types over time (100%)'              },
  { key: 'occasion',    label: 'Occasion',  desc: 'Mix of drinking occasions over time (100%)'       },
	{ key: 'withWhom',    label: 'Relation',  desc: 'Mix of relation types over time (100%)'           },
  { key: 'topPeople',   label: 'People',    desc: 'How your top 7 drinking companions change over time' },
  { key: 'restDays',    label: 'Rest',      desc: 'Rest days distribution and average over time',
    tip: 'Dry days immediately before each drinking day. A dashed line marks a stretch where no dry run ended.' },
  { key: 'sessionTime', label: 'Session',   desc: 'Average session start, end and length over time',
    tip: '1 drink = 50 ml soju equivalent' },
];

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCKET_ORDER = ['0d', '1d', '2–3d', '4–6d', '1–2w', '2–4w', '1m+'];

const OCCASION_COLORS: Record<string, string> = {
  '아침술':          '#f59e0b',
  '점심술':          '#10b981',
  '저녁술':          '#3b82f6',
  '낮술':            '#8b5cf6',
  'After/No dinner': '#ef4444',
};

const RELATION_COLORS: Record<string, string> = {
  '가족': '#1d4ed8', '업무': '#7c3aed', '친목': '#0891b2',
  '연애': '#ec4899', '종교': '#d97706', '기타': '#6b7280',
};

const DRINK_TYPE_COLORS: Record<string, string> = {
  '소주':     '#1d4ed8', '증류소주': '#1d4ed8', '전통소주': '#2563eb', '일본소주': '#3b82f6',
  '맥주':     '#0891b2', '소맥':     '#0e7490',
  '와인':     '#7c3aed', '샴페인':   '#a855f7', '포트와인': '#6d28d9',
  '막걸리':   '#d97706', '동동주':   '#b45309',
  '위스키':   '#dc2626', '꼬냑':     '#b91c1c',
  '사케':     '#059669', '청주':     '#047857',
  '보드카':   '#6b7280', '럼주':     '#4b5563', '데킬라':   '#374151',
  '백주':     '#9f1239', '칵테일':   '#0f766e', '담금주':   '#92400e',
  '과실주':   '#b45309', '막사':     '#78350f', '맥사':     '#164e63',
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
        {value}
      </span>
      <span className="text-[10px] text-stone-400 dark:text-zinc-500">{label}</span>
    </div>
  );
}


// ── Total Drinks card with ⓘ tooltip ─────────────────────────────────────────

function TotalDrinksCard({ total, isDark }: { total: number; isDark: boolean }) {
  const [tipOpen, setTipOpen] = useState(false);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
          Total Drinks
        </span>
        {/* ⓘ icon — click/tap toggles tooltip */}
        <button
          onClick={() => setTipOpen(v => !v)}
          className="text-stone-300 dark:text-zinc-600 hover:text-stone-400 dark:hover:text-zinc-400 leading-none"
          style={{ fontSize: '11px', lineHeight: 1 }}
          aria-label="What is a drink?"
        >
          ⓘ
        </button>
      </div>
      <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
        {Math.round(total)}
      </span>
      {tipOpen && (
        <span className="text-[10px] text-stone-400 dark:text-zinc-500 leading-snug mt-0.5">
          1 drink = 50 ml soju equivalent
        </span>
      )}
    </div>
  );
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab({ data, isDark }: { data: DrinkingSummary; isDark: boolean }) {
  const drinkingPct = data.daysInPeriod > 0
    ? Math.round((data.drinkingDays / data.daysInPeriod) * 100)
    : 0;

	const grey = isDark ? '#52525b' : '#a8a29e';
  const companionData: Record<string, number> = { '혼자': data.companions.alone };
  for (const [k, v] of Object.entries(data.companions.byRelationType)) {
    companionData[k] = (companionData[k] ?? 0) + v;
  }
  // Relation palette (auto-assigned), shared with People so a person inherits
  // their dominant relation's colour. 혼자 stays neutral grey.
  const relKeys = Object.keys(companionData).filter(k => k !== '혼자')
    .sort((a, b) => companionData[b] - companionData[a]);
  const companionColors: Record<string, string> = { '혼자': grey, ...autoColorMap(relKeys, isDark) };

  const peopleData:   Record<string, number> = {};
  const peopleColors: Record<string, string> = {};
  for (const p of data.companions.topPeople) {
    peopleData[p.name]   = p.total;
    peopleColors[p.name] = companionColors[p.dominantCategory] ?? grey;
  }

  return (
    <div className="flex flex-col gap-3">

      {/* ── Row 1: [Drinking Days / Total Drinks] 35 | [Drinks Per Day box plot] 65 ── */}
      <div className="flex gap-4">

        {/* Left 35%: stacked Drinking Days + Total Drinks */}
        <div className="flex flex-col gap-2" style={{ flex: '35' }}>
          {/* Drinking Days */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              Drinking Days
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
                {data.drinkingDays}
              </span>
              <span className="text-sm text-stone-400 dark:text-zinc-500 tabular-nums">
                / {data.daysInPeriod}d ({drinkingPct}%)
              </span>
            </div>
          </div>

          {/* Total Drinks */}
          {data.drinks && (
            <TotalDrinksCard total={data.drinks.total} isDark={isDark} />
          )}
        </div>

        {/* Right 65%: Drinks Per Day box plot */}
        {data.drinks && (
          <div className="flex flex-col" style={{ flex: '65', gap: '6px' }}>
            <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              Drinks Per Day
            </span>
            <div className="flex flex-col w-full" style={{ gap: '1px' }}>
              <BoxPlot {...data.drinks} isDark={isDark} />
            </div>
          </div>
        )}

      </div>

      <div className="border-t border-stone-100 dark:border-zinc-800" />

			{/* ── Row 2: two columns — left: Drink Type / Occasion · right: Relation / People ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left */}
        <div className="flex flex-col gap-3 min-w-0">
					<BarSection title="Drink Type" data={data.drinkType ?? {}} isDark={isDark} />
          <BarSection title="Occasion"   data={data.occasions}       isDark={isDark} />
        </div>
        {/* Right */}
        <div className="flex flex-col gap-3 min-w-0">
          <BarSection title="Relation" data={companionData} colorMap={companionColors} isDark={isDark} />
          <BarSection title="People"   data={peopleData}    colorMap={peopleColors}    isDark={isDark} />
        </div>
      </div>

      <div className="border-t border-stone-100 dark:border-zinc-800" />

      {/* ── Row 3: Consecutive Rest Days (65%) | Session Time (35%) ── */}
      <div className="flex gap-4">

        {/* Left 65%: histogram */}
        <div className="flex flex-col gap-1" style={{ flex: '65' }}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              Consecutive Rest Days
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500">
              (Avg: {data.avgRestDays}d)
            </span>
          </div>
          <Histogram
            buckets={BUCKET_ORDER.map(label => ({ label, count: data.histogram[label] ?? 0 }))}
            isDark={isDark}
          />
        </div>

        {/* Right 35%: Session Time */}
        <div className="flex flex-col gap-2" style={{ flex: '35' }}>
          <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
            Session Time
          </span>
          <div className="flex flex-col gap-2">
            {[
              { label: 'From', value: data.avgStartClock ?? '—' },
              { label: 'To',   value: data.avgEndClock   ?? '—' },
              { label: 'For',  value: data.avgDurationSeconds ? formatDuration(data.avgDurationSeconds) : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-[10px] text-stone-400 dark:text-zinc-500 w-6 shrink-0">{label}</span>
                <span className="text-lg font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}

// ── Trend ⓘ tooltip ───────────────────────────────────────────────────────────

function TrendTip({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-stone-300 dark:text-zinc-600 hover:text-stone-400 dark:hover:text-zinc-400 leading-none ml-0.5"
        style={{ fontSize: '11px', lineHeight: 1 }}
        aria-label="Info">ⓘ</button>
      {open && (
        <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1 z-10 rounded px-2 py-1 text-[10px] leading-snug whitespace-nowrap"
          style={{ background: 'var(--color-stone-800, #292524)', color: '#e7e5e4',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
          {tip}
        </span>
      )}
    </span>
  );
}

// ── Trend chart dispatcher ────────────────────────────────────────────────────

// Convert {label,data} buckets + a colour map into stacked-area props. Band
// order is fixed across the whole window by total size, largest at the bottom,
// so a band does not swap places as you scroll through time. The same adapter
// shape as the Interactions trend uses.
function toArea(
  raw: { label: string; data: Record<string, number> }[],
  colorMap: Record<string, string>,
  isDark: boolean,
): { points: StackedAreaPoint[]; defs: StackedAreaSegmentDef[] } {
  const ng = isDark ? '#71717a' : '#a8a29e';
  const totals: Record<string, number> = {};
  for (const b of raw) {
    for (const [k, v] of Object.entries(b.data)) if (k.trim()) totals[k] = (totals[k] ?? 0) + v;
  }
  const cats = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const defs = cats.map(c => ({ key: c, label: c, color: colorMap[c] ?? ng }));

  const points = raw.map(b => {
    const segments: Record<string, number> = {};
    let sum = 0;
    for (const c of cats) {
      const v = b.data[c] ?? 0;
      segments[c] = v;
      sum += v;
    }
    // sum 0 → nothing to normalise; a null reads as a gap, which is the
    // honest picture for a bucket with no drinking at all.
    return { label: b.label, total: sum > 0 ? sum : null, segments: sum > 0 ? segments : null };
  });

  return { points, defs };
}

function DrinkingTrendChart({
  metric, buckets, isDark, count,
}: {
  metric: TrendMetric;
  buckets: DrinkingTrendBucket[];
  isDark: boolean;
  count: number;
}) {
	const labels = buckets.map(b => b.label);
  const alwaysShow = count <= 6;
  // Shared line-tab settings, matching the Interactions trend.
  const lineProps = {
    maxXLabels: 12,
    showValues: buckets.length <= 16,
    compressXLabels: false,
  } as const;

	// Relation filter for the People (rank-flow) tab — live, but an empty selection
  // ("Deselect all") is held until the dropdown closes rather than emptying the chart.
  const allRelations = useMemo(
    () => [...new Set(buckets.flatMap(b => Object.values(b.people).flatMap(cats => Object.keys(cats))))].filter(t => t.trim()),
    [buckets],
  );
  const relation = useLiveFilter(allRelations);

  if (metric === 'days') {
    return (
      <CssTrendChart
        series={[{
          values: buckets.map(b => b.drinkingDays),
          color: isDark ? '#2dd4bf' : '#1d4ed8',
          label: 'Days',
        }]}
        labels={labels}
        formatY={v => String(Math.round(v))}
        isDark={isDark}
        alwaysShowLabels={alwaysShow}
        {...lineProps}
      />
    );
  }

  if (metric === 'totalDrinks') {
    return (
      <CssTrendChart
        series={[{
          values: buckets.map(b => b.totalDrinks),
          color: isDark ? '#2dd4bf' : '#1d4ed8',
          label: 'Drinks',
        }]}
        labels={labels}
        formatY={v => String(Math.round(v))}
        isDark={isDark}
        alwaysShowLabels={alwaysShow}
        {...lineProps}
      />
    );
  }

  // Amt(day): three lines instead of a box plot. Quartiles were dropped, and a
  // box per bucket is unreadable at 120 buckets. Average is the headline; max
  // and min are lighter. A bucket with no drinking day is a gap, not a zero.
  if (metric === 'drinksPerDay') {
    if (!buckets.some(b => b.drinksBox !== null)) {
      return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;
    }
    const avgC = isDark ? '#2dd4bf' : '#1d4ed8';
    const maxC = isDark ? '#5eead4' : '#60a5fa';
    const minC = isDark ? '#99f6e4' : '#93c5fd';
    return (
      <CssTrendChart
        series={[
          { values: buckets.map(b => b.drinksBox?.avg ?? null), color: avgC, label: 'Avg' },
          { values: buckets.map(b => b.drinksBox?.max ?? null), color: maxC, label: 'Max' },
          { values: buckets.map(b => b.drinksBox?.min ?? null), color: minC, label: 'Min' },
        ]}
        labels={labels}
        formatY={v => String(Math.round(v * 10) / 10)}
        isDark={isDark}
        maxXLabels={12}
        showValues={false}
        compressXLabels={false}
      />
    );
  }

	// Type / Occasion / Relation: stacked areas. Dense bars are unreadable at
  // 120 buckets, and all three have small stable vocabularies, so bands stay
  // recognisable across the whole window.
  if (metric === 'drinkType') {
    const { points, defs } = toArea(
      buckets.map(b => ({ label: b.label, data: b.drinkType })), DRINK_TYPE_COLORS, isDark);
    return (
      <CssStackedAreaChart
        points={points} segmentDefs={defs}
        isDark={isDark} mode="percent" highlightable
        maxXLabels={12} formatY={v => String(v)} height={190} />
    );
  }

  if (metric === 'occasion') {
    const { points, defs } = toArea(
      buckets.map(b => ({ label: b.label, data: b.occasions })), OCCASION_COLORS, isDark);
    return (
      <CssStackedAreaChart
        points={points} segmentDefs={defs}
        isDark={isDark} mode="percent" highlightable
        maxXLabels={12} formatY={v => String(v)} height={190} />
    );
  }

  if (metric === 'withWhom') {
    const companionColors: Record<string, string> = { '혼자': '#a8a29e', ...RELATION_COLORS };
    const { points, defs } = toArea(
      buckets.map(b => ({ label: b.label, data: b.companions })), companionColors, isDark);
    return (
      <CssStackedAreaChart
        points={points} segmentDefs={defs}
        isDark={isDark} mode="percent" highlightable
        maxXLabels={12} formatY={v => String(v)} height={190} />
    );
  }

  if (metric === 'topPeople') {
		const selSet = new Set(relation.applied);   // chart uses the applied set; empty = none
    const rankBuckets = buckets.map(b => ({
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
    const hasAny = rankBuckets.some(b => b.ranked.length);
    const relControl = (
			<MultiSelectDropdown label="Relation" options={allRelations}
        selected={relation.draft} onChange={relation.onChange} onClose={relation.onClose} />
    );
    return hasAny
      ? <CssRankFlowChart buckets={rankBuckets} topN={7} isDark={isDark} controls={relControl} />
      : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">{relControl}</div>
          <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
        </div>
      );
  }

  // Rest: seven fixed bands as a stacked area (counts of dry runs that ended
  // in the bucket), with the rest line on its own right-hand axis in days.
  // Solid where a run actually ended; dashed across a dry stretch, passing
  // through how far the run had reached at each bucket's last day.
  if (metric === 'restDays') {
    const restColors = isDark ? REST_BUCKET_COLORS_DARK : REST_BUCKET_COLORS_LIGHT;
    const defs = BUCKET_ORDER.map(k => ({ key: k, label: k, color: restColors[k] }));
    const points = buckets.map(b => {
      const segments: Record<string, number> = {};
      let sum = 0;
      for (const k of BUCKET_ORDER) {
        const v = b.histogram[k] ?? 0;
        segments[k] = v;
        sum += v;
      }
      return { label: b.label, total: sum > 0 ? sum : null, segments: sum > 0 ? segments : null };
    });
    return (
      <CssStackedAreaChart
        points={points} segmentDefs={defs}
        isDark={isDark} mode="absolute" baselineZero highlightable
        maxXLabels={12} formatY={v => String(Math.round(v))} height={190}
        rightLine={{
          values: buckets.map(b => b.avgRestDays),
          bridge: buckets.map(b => b.dryDaysAtEnd),
          color:  isDark ? '#c084fc' : '#7c3aed',
          label:  'Rest',
        }}
        formatYRight={v => `${Math.round(v * 10) / 10}d`}
      />
    );
  }

  if (metric === 'sessionTime') {
    return (
      <CssDualLineChart
        buckets={buckets.map(b => ({
          label:              b.label,
          avgStartMins:       b.avgStartMins,
          avgEndMins:         b.avgEndMins,
          avgDurationSeconds: b.avgDurationSeconds,
        }))}
        isDark={isDark}
        maxXLabels={12}
        showValues={buckets.length <= 16}
      />
    );
  }

  return null;
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function DrinkingWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode,    setViewMode]    = useState<WidgetViewMode>('summary');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('days');
  // Weight-style window: grain × count, count resetting to the grain's default
  // on a grain switch. The People tab keeps its own short count (3/6/12) so
  // flipping there and back never destroys a longer window.
  const [grain, setGrain] = useState<TrendGrain>('month');
  const [count, setCount] = useState<number>(DEFAULT_BUCKETS.month);
  const [peopleCount, setPeopleCount] = useState<number>(12);
  const [summaryData, setSummaryData] = useState<DrinkingSummary | null>(null);
  const [trendData,   setTrendData]   = useState<DrinkingTrendBucket[]>([]);
  const [dataGrain,   setDataGrain]   = useState<TrendGrain>('month');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // The People tab fetches its own shorter window; the other tabs share one.
  const effectiveBuckets = trendMetric === 'topPeople' ? peopleCount : count;

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (viewMode === 'summary') {
      const url = `/api/insights/stats?${buildParams(
        { metric: 'drinking.summary', mode: 'summary' },
        globalFilter,
      )}`;
      fetch(url)
        .then(r => r.json())
        .then(d => { setSummaryData(d.summary ?? null); setLoading(false); })
        .catch(() => { setError('Failed to load data.'); setLoading(false); });
    } else {
      const url = `/api/insights/stats?${buildParams(
        { metric: 'drinking.trend', grain, buckets: String(effectiveBuckets) },
        globalFilter,
      )}`;
      fetch(url)
        .then(r => r.json())
        .then(d => {
          setTrendData(d.data ?? []);
          if (d.grain) setDataGrain(d.grain);   // range line formats from the payload's grain
          setLoading(false);
        })
        .catch(() => { setError('Failed to load data.'); setLoading(false); });
    }
  }, [globalFilter, viewMode, grain, effectiveBuckets]);

  // Resolved range — the control states a count, this line states the span.
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toISO = (dt: Date) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  const bucketEndISO = (startISO: string, g: TrendGrain): string => {
    const [y, m, d] = startISO.split('-').map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (g === 'week') dt.setDate(dt.getDate() + 6);
    else if (g === 'month') { dt.setMonth(dt.getMonth() + 1); dt.setDate(dt.getDate() - 1); }
    return toISO(dt);
  };
  const todayISO = toISO(new Date());
  const lastEnd  = trendData.length ? bucketEndISO(trendData[trendData.length - 1].start, dataGrain) : '';
  const rangeText = trendData.length
    ? `${trendData[0].start} → ${lastEnd > todayISO ? todayISO : lastEnd}`
    : '';

  return (
    <WidgetCard
      title="Drinking"
      floor={1}
      loading={loading}
      error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} />}
    >
			{viewMode === 'summary' ? (
        !summaryData ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
        ) : (
          <StatsTab data={summaryData} isDark={isDark} />
        )
      ) : (
        // ── Trend view ──────────────────────────────────────────────────────────
        <div className="flex flex-col gap-3">

          {/* Row 1: metric pills + grain × count */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1">
              {TREND_METRICS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTrendMetric(key)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    trendMetric === key
                      ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Segmented<TrendGrain>
                value={grain}
                onChange={g => { setGrain(g); setCount(DEFAULT_BUCKETS[g]); }}
                options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]} />
              {trendMetric === 'topPeople' ? (
                <Segmented<number>
                  value={peopleCount} onChange={setPeopleCount}
                  options={[[3, '3'], [6, '6'], [12, '12']]} />
              ) : (
                <Segmented<number>
                  value={count} onChange={setCount}
                  options={BUCKET_OPTIONS[grain].map(n => [n, String(n)]) as [number, string][]} />
              )}
            </div>
          </div>

          {/* Row 2: description + optional ⓘ */}
          {TREND_METRICS.find(m => m.key === trendMetric)?.desc && (
            <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1 flex items-center gap-1">
              {TREND_METRICS.find(m => m.key === trendMetric)!.desc}
              {TREND_METRICS.find(m => m.key === trendMetric)?.tip && (
                <TrendTip tip={TREND_METRICS.find(m => m.key === trendMetric)!.tip!} />
              )}
            </p>
          )}

					{/* Resolved range — what you picked is a count, what you see is a span */}
          {rangeText && (
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 -mt-1">{rangeText}</span>
          )}

          {/* Row 3: chart */}
          {trendData.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (
            <DrinkingTrendChart
              metric={trendMetric}
              buckets={trendData}
              isDark={isDark}
              count={effectiveBuckets}
            />
          )}
        </div>
      )}
    </WidgetCard>
  );
}
