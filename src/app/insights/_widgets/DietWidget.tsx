'use client';
// src/app/insights/_widgets/DietWidget.tsx

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { categoryColors, autoColorMap } from '../_lib/chart-colors';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';
import { Treemap, type TreemapDatum } from '../_components/charts/Treemap';
import { CalendarHeatmap, HeatStrip } from '../_components/charts/CalendarHeatmap';
import {
  CssDailyChart, CssVerticalBoxPlotChart, minsToClockStr,
  type CssDailyZone, type BoxPlotBucket,
} from '../_components/charts/css-chart-components';
import { DietTrendView, type DietTrendBucket } from './DietTrendView';
import { Title, BarSection } from '../_components/charts/bars';

// ── Types (mirrors diet.summary API contract) ─────────────────────────────────

interface IngCount  { level2: string; level1: string; count: number; }
interface ItemCount { item: string; count: number; }

interface DietSummary {
  daysInPeriod:     number;
  rangeStart:       string;
  rangeEnd:         string;
  finishEating:     { date: string; endMins: number }[];
  finishCaffeine:   { date: string; endMins: number }[];
  servings:         { date: string; total: number }[];
  carbsIndex:       { date: string; value: number }[];
  spiciness:        { date: string; level: 'H' | 'M' | 'L' }[];
  ateIngredients:   IngCount[];
  ateItems:         ItemCount[];
  drankIngredients: IngCount[];
  drankItems:       ItemCount[];
  companions: {
    alone:          number;
    total:          number;
    byRelationType: Record<string, number>;
    topPeople:      { name: string; dominantCategory: string; total: number }[];
  };
	averages: { finishEatingMins: number | null; finishCaffeineMins: number | null; servings: number | null; carbsIndex: number | null };
}

type DailyMetric = 'finish' | 'caffeine' | 'servings' | 'carbs';
type ModalKind   = DailyMetric | 'spicy';
type SideTab     = 'food' | 'drink';
type ViewTab     = 'ingredients' | 'items';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const SERVING_ZONES: CssDailyZone[] = [
  { from: 0, to: 3,    color: 'rgba(34,197,94,0.13)'  },  // 소식  — green
  { from: 3, to: 6,    color: 'rgba(59,130,246,0.13)' },  // 적당  — light blue
  { from: 6, to: 9999, color: 'rgba(239,68,68,0.13)'  },  // 과식  — red
];

// ── Building blocks ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Title>{title}</Title>
      {children}
    </div>
  );
}

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

function GroupLegend({ groups, colorMap }: { groups: string[]; colorMap: Record<string, string> }) {
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-400 dark:text-zinc-500">
      {groups.map(g => (
        <span key={g} className="inline-flex items-center gap-1">
          <i style={{ background: colorMap[g], width: 9, height: 9, borderRadius: 2, display: 'inline-block' }} />
          {g}
        </span>
      ))}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 flex flex-col gap-3"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-stone-900 dark:text-zinc-50 uppercase tracking-wide">{title}</p>
          <button onClick={onClose}
            className="text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ── Companions ("with whom I eat") — toggleable ───────────────────────────────

function Companions({ data, isDark }: { data: DietSummary; isDark: boolean }) {
  const c = data.companions;
  const ALONE = '혼자';
  const grey = isDark ? '#52525b' : '#a8a29e';

  const rel = [
    { key: ALONE, count: c.alone },
    ...Object.entries(c.byRelationType).map(([key, count]) => ({ key, count })),
  ].filter(r => r.count > 0).sort((a, b) => b.count - a.count);

  // Relation palette (auto-assigned), shared with People so a person inherits
  // their dominant relation's colour. ALONE stays neutral grey.
  const relColor: Record<string, string> = {
    [ALONE]: grey,
    ...autoColorMap(rel.map(r => r.key).filter(k => k !== ALONE), isDark),
  };
  const relData: Record<string, number> = {};
  rel.forEach(r => { relData[r.key] = r.count; });

  const people = c.topPeople.slice(0, 8);
  const peopleData:   Record<string, number> = {};
  const peopleColors: Record<string, string> = {};
  people.forEach(p => {
    peopleData[p.name]   = p.total;
    peopleColors[p.name] = relColor[p.dominantCategory] ?? grey;
  });

  if (!rel.length && !people.length) {
    return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <BarSection title="By relation"    data={relData}    colorMap={relColor}    isDark={isDark} />
      <BarSection title="Top companions" data={peopleData} colorMap={peopleColors} isDark={isDark} />
    </div>
  );
}

// ── Summary view ──────────────────────────────────────────────────────────────

function SummaryView({ data, isDark }: { data: DietSummary; isDark: boolean }) {
  const [side, setSide] = useState<SideTab>('food');
  const [view, setView] = useState<ViewTab>('ingredients');
  const [modal, setModal] = useState<ModalKind | null>(null);

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    data.ateIngredients.forEach(d => set.add(d.level1));
    data.drankIngredients.forEach(d => set.add(d.level1));
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [data]);

  const groupColor = useMemo(() => {
    const palette = categoryColors(isDark);
    const map: Record<string, string> = {};
    allGroups.forEach((g, i) => { map[g] = palette[i % palette.length]; });
    return map;
  }, [allGroups, isDark]);

  const palette     = categoryColors(isDark);
  const text        = isDark ? '#18181b' : '#ffffff';
  const foodAccent  = palette[0];
  const drinkAccent = palette[9 % palette.length];

  const ing = (rows: IngCount[]): TreemapDatum[] =>
    rows.map(d => ({ label: d.level2, value: d.count, fill: groupColor[d.level1] ?? palette[palette.length - 1], text }));
  const item = (rows: ItemCount[], fill: string): TreemapDatum[] =>
    rows.map(d => ({ label: d.item, value: d.count, fill, text }));

  const metrics: Record<DailyMetric, {
    short: string; title: string; values: number[]; labels: string[];
    formatY: (v: number) => string; avg: number | null;
    zones?: CssDailyZone[]; baselineZero?: boolean;
  }> = {
    finish: {
      short: 'Eating cutoff', title: 'When I finished eating',
      values: data.finishEating.map(d => d.endMins), labels: data.finishEating.map(d => d.date),
      formatY: v => minsToClockStr(v, true), avg: data.averages.finishEatingMins,
    },
		caffeine: {
      short: 'Caffeine cutoff', title: 'When I last had caffeine',
      values: data.finishCaffeine.map(d => d.endMins), labels: data.finishCaffeine.map(d => d.date),
      formatY: v => minsToClockStr(v, true), avg: data.averages.finishCaffeineMins,
    },
    servings: {
      short: 'Servings', title: 'Daily servings (인분)',
      values: data.servings.map(d => d.total), labels: data.servings.map(d => d.date),
      formatY: fmtNum, avg: data.averages.servings, zones: SERVING_ZONES, baselineZero: true,
    },
    carbs: {
      short: 'Carbs', title: 'Carbs index',
      values: data.carbsIndex.map(d => d.value), labels: data.carbsIndex.map(d => d.date),
      formatY: fmtNum, avg: data.averages.carbsIndex, baselineZero: true,
    },
  };

  // Spiciness
  const spMap = useMemo(() => new Map(data.spiciness.map(s => [s.date, s.level])), [data]);
  const SPICE_FILL: Record<'H' | 'M' | 'L', string> = {
    H: isDark ? '#f87171' : '#ef4444',  // red
    M: isDark ? '#fbbf24' : '#f59e0b',  // amber
    L: isDark ? '#60a5fa' : '#3b82f6',  // blue
  };
  const spicyFill = (date: string) => { const lvl = spMap.get(date); return lvl ? SPICE_FILL[lvl] : null; };
  const spStats = useMemo(() => {
    let h = 0, m = 0;
    data.spiciness.forEach(s => { if (s.level === 'H') h++; else if (s.level === 'M') m++; });
    return { h, m, total: data.spiciness.length };
  }, [data]);

  // Active treemap (one at a time)
  const isFood = side === 'food';
  const isIng  = view === 'ingredients';
  const treemapData = isIng
    ? ing(isFood ? data.ateIngredients : data.drankIngredients)
    : item(isFood ? data.ateItems : data.drankItems, isFood ? foodAccent : drinkAccent);
  const maxCells = isIng ? (isFood ? 24 : 16) : (isFood ? 18 : 16);

  const activeIng    = isFood ? data.ateIngredients : data.drankIngredients;
  const legendGroups = allGroups.filter(g => activeIng.some(d => d.level1 === g));
  const sectionTitle = `${isFood ? 'What I ate' : 'What I drank'} — ${view}`;

  const spicyLegend = [
    { color: SPICE_FILL.H, label: 'Spicy (H)' },
    { color: SPICE_FILL.M, label: 'Mild (M)' },
    { color: SPICE_FILL.L, label: 'Not spicy' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Distribution boxplots (tap → modal) ── */}
      <div>
        <div className="grid grid-cols-4 gap-1">
          {(['finish', 'caffeine', 'servings', 'carbs'] as DailyMetric[]).map(key => {
            const m = metrics[key];
            const stats = boxStats(m.values);
            return (
              <div key={key} role="button" tabIndex={0} onClick={() => setModal(key)}
                className="flex flex-col gap-1 rounded-lg p-1 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">
								<Title><span className="block w-full text-center">{m.short}</span></Title>
                {stats ? (
									<CssVerticalBoxPlotChart buckets={[{ label: '', ...stats }]} isDark={isDark} formatY={m.formatY} height={100} compact />
                ) : (
                  <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-stone-400 dark:text-zinc-500 mt-1">Tap a box for the daily detail.</p>
      </div>

      {/* ── Treemaps: one at a time via two toggles ── */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Segmented value={side} onChange={setSide} options={[['food', 'Food'], ['drink', 'Drink']]} />
          <Segmented value={view} onChange={setView} options={[['ingredients', 'Ingredients'], ['items', 'Items']]} />
        </div>
        <Section title={sectionTitle}>
          <Treemap data={treemapData} isDark={isDark} maxCells={maxCells} height={200} />
        </Section>
        {isIng && <GroupLegend groups={legendGroups} colorMap={groupColor} />}
      </div>

      {/* ── Spicy days — compact strip next to the treemap (tap → modal) ── */}
      <div role="button" tabIndex={0} onClick={() => setModal('spicy')}
        className="flex flex-col gap-1 rounded-lg p-1 -mx-1 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Spicy days</span>
          <span className="text-[10px] text-stone-400 dark:text-zinc-500">
            ({spStats.h} H and {spStats.m} M out of {spStats.total} days)
          </span>
        </div>
        <HeatStrip rangeStart={data.rangeStart} rangeEnd={data.rangeEnd} isDark={isDark} fillFor={spicyFill} />
      </div>

      {/* ── With whom I eat (toggleable) ── */}
      <Section title="With whom I eat">
        <Companions data={data} isDark={isDark} />
      </Section>

      {/* ── Modals ── */}
      {modal && (
        <ModalShell title={modal === 'spicy' ? 'Spicy days' : metrics[modal].title} onClose={() => setModal(null)}>
          {modal === 'spicy' ? (
            <CalendarHeatmap rangeStart={data.rangeStart} rangeEnd={data.rangeEnd} isDark={isDark}
              fillFor={spicyFill} legend={spicyLegend} />
          ) : (
            <CssDailyChart
              values={metrics[modal].values} labels={metrics[modal].labels}
              formatY={metrics[modal].formatY} avg={metrics[modal].avg}
              zones={metrics[modal].zones} baselineZero={metrics[modal].baselineZero} isDark={isDark} />
          )}
        </ModalShell>
      )}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function DietWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode,    setViewMode]    = useState<WidgetViewMode>('summary');
  const [summaryData, setSummaryData] = useState<DietSummary | null>(null);
	const [trendData, setTrendData] = useState<DietTrendBucket[] | null>(null);
	const [bucketsBack, setBucketsBack] = useState(12);
  const [loading,     setLoading]     = useState(true);
	const [error,       setError]       = useState<string | null>(null);
  const trendLoadedRef = useRef(false);

  const isPeriodMode = globalFilter.timeMode === 'period';

  useEffect(() => {
    if (viewMode !== 'summary') return;
    setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'diet.summary', mode: 'summary' },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setSummaryData(d.summary ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode]);

	useEffect(() => {
		if (viewMode !== 'trend') return;
    if (!trendLoadedRef.current) setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'diet.summary', mode: 'trend', bucketsBack: String(bucketsBack) },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
			.then(d => { setTrendData(d.data ?? []); trendLoadedRef.current = true; setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, bucketsBack]);

  return (
    <WidgetCard
      title="Diet"
      floor={1}
      loading={loading}
      error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} disabled={isPeriodMode} />}
    >
      {viewMode === 'summary' ? (
        !summaryData ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
        ) : (
          <SummaryView data={summaryData} isDark={isDark} />

        )
      ) : (
				<DietTrendView
					data={trendData ?? []}
					isDark={isDark}
					bucketsBack={bucketsBack}
					onBucketsBackChange={setBucketsBack}
				/>
      )}
    </WidgetCard>
  );
}
