'use client';
// src/app/insights/_widgets/DietWidget.tsx

import { useEffect, useMemo, useState } from 'react';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { ModalShell } from '../_components/ModalShell';
import { Segmented } from '../_components/Segmented';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { categoryColors, autoColorMap } from '../_lib/chart-colors';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';
import { Treemap, type TreemapDatum } from '../_components/charts/Treemap';
import { CalendarHeatmap, HeatStrip, localToday } from '../_components/charts/CalendarHeatmap';
import {
  CssDailyChart, CssVerticalBoxPlotChart, minsToClockStr,
  type CssDailyZone, type BoxPlotBucket, type HoverRow,
} from '../_components/charts/css-chart-components';
import {
  DietTrendView, DIET_SHORT_COUNT_TABS,
  type DietTrendBucket, type DietTrendTab,
} from './DietTrendView';
import { DEFAULT_BUCKETS } from './WeightTrendView';
import type { TrendGrain } from '@/lib/insights/trend-window';
import { Title, BarSection } from '../_components/charts/bars';
import { bandFill, bandOf, BAND_WORD, fmt1 } from '../_lib/day-bands';

// ── Types (mirrors diet.summary API contract) ─────────────────────────────────

interface IngCount  { level2: string; level1: string; count: number; }
interface DayEntry {
  time: string | null; type: string | null; foods: string[]; drinks: string[];
  servings: number | null; drinkAmount: string | null; spicy: 'H' | 'M' | 'L' | null;
}
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
  /** (26 Oct) each day's records, for the Daily diet strip's tooltip */
  days?:            Record<string, DayEntry[]>;
}

type DailyMetric = 'finish' | 'caffeine' | 'servings' | 'carbs';
type ModalKind   = DailyMetric | 'daily';
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

  // Daily diet strip (26 Oct): each day coloured by its carbs index — below 4
  // blue, 4–8 amber, over 8 red; a day with no food stays empty. The tooltip
  // lists every record of the day (food and non-alcoholic drinks) with its
  // servings, 🌶 on a meal rated spicy (H). Replaces the Spicy days strip.
  const BAND = bandFill(isDark);
  const carbMap = useMemo(() => new Map(data.carbsIndex.map(c => [c.date, c.value])), [data]);
  const dailyFill = (date: string) => {
    const v = carbMap.get(date);
    return v === undefined ? null : BAND[bandOf(v, 4, 8)];
  };
  const dailyTip = (date: string) => {
    const v = carbMap.get(date);
    const entries = data.days?.[date] ?? [];
    const rows: HoverRow[] = [];
    if (v !== undefined) {
      const b = bandOf(v, 4, 8);
      rows.push({ label: 'Carbs index', value: `${fmt1(v)} (${BAND_WORD[b]})`, color: BAND[b] });
    }
    for (const e of entries) {
      const what = [...e.foods, ...e.drinks].join(' · ');
      const amount = e.servings !== null ? ` (${fmt1(e.servings)} 인분)` : e.drinkAmount ? ` (${e.drinkAmount})` : '';
      rows.push({
        label: [e.time, e.type].filter(Boolean).join(' '),
        value: `${what}${e.spicy === 'H' ? ' 🌶' : ''}${amount}`,
        dim: e.servings === null,
      });
    }
    if (!rows.length) rows.push({ value: 'nothing recorded', dim: true });
    return { title: date, rows };
  };
  const dailyStats = useMemo(() => {
    let high = 0, mid = 0;
    data.carbsIndex.forEach(c => { const b = bandOf(c.value, 4, 8); if (b === 'high') high++; else if (b === 'mid') mid++; });
    return { high, mid, total: data.carbsIndex.length };
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

  const dailyLegend = [
    { color: BAND.low,  label: 'Carbs below 4' },
    { color: BAND.mid,  label: '4–8' },
    { color: BAND.high, label: 'Over 8' },
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

      {/* ── Daily diet — carbs per day (tap → calendar) ── */}
      <div role="button" tabIndex={0} onClick={() => setModal('daily')}
        className="flex flex-col gap-1 rounded-lg p-1 -mx-1 cursor-pointer hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Daily diet · carbs</span>
          <span className="text-[10px] text-stone-400 dark:text-zinc-500">
            ({dailyStats.high} red, {dailyStats.mid} amber out of {dailyStats.total} days)
          </span>
        </div>
        <HeatStrip rangeStart={data.rangeStart} rangeEnd={data.rangeEnd} futureFrom={localToday()} isDark={isDark}
          fillFor={dailyFill} tooltipFor={dailyTip}
          // Above: a busy day has many lines, and the card clips anything below its last row.
          tooltipPlacement="above" />
      </div>

      {/* ── With whom I eat (toggleable) ── */}
      <Section title="With whom I eat">
        <Companions data={data} isDark={isDark} />
      </Section>

      {/* ── Modals ── */}
      {modal && (
        <ModalShell title={modal === 'daily' ? 'Daily diet · carbs' : metrics[modal].title} onClose={() => setModal(null)}>
          {modal === 'daily' ? (
            <CalendarHeatmap rangeStart={data.rangeStart} rangeEnd={data.rangeEnd} futureFrom={localToday()} isDark={isDark}
              fillFor={dailyFill} tooltipFor={dailyTip} legend={dailyLegend} />
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
  const [trendData,   setTrendData]   = useState<DietTrendBucket[]>([]);

  // Weight-style window: grain × count, count resetting to the grain's default
  // on a grain switch. Composition and People keep their own short count so
  // flipping there and back never destroys a longer window.
  const [trendTab,   setTrendTab]   = useState<DietTrendTab>('eating');
  const [grain,      setGrain]      = useState<TrendGrain>('month');
  const [count,      setCount]      = useState<number>(DEFAULT_BUCKETS.month);
  const [shortCount, setShortCount] = useState<number>(12);
  // The grain the data was actually built at, echoed by the server. Labels and
  // the range line format from this, never from the control, so a grain switch
  // cannot render one frame of new labels against old data.
  const [dataGrain,  setDataGrain]  = useState<TrendGrain>('month');

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const effectiveBuckets = DIET_SHORT_COUNT_TABS.includes(trendTab) ? shortCount : count;

  useEffect(() => {
    setLoading(true);
    setError(null);

    if (viewMode === 'summary') {
      const url = `/api/insights/stats?${buildParams(
        { metric: 'diet.summary', mode: 'summary' },
        globalFilter,
      )}`;
      fetch(url)
        .then(r => r.json())
        .then(d => { setSummaryData(d.summary ?? null); setLoading(false); })
        .catch(() => { setError('Failed to load data.'); setLoading(false); });
    } else {
      const url = `/api/insights/stats?${buildParams(
        { metric: 'diet.trend', grain, buckets: String(effectiveBuckets) },
        globalFilter,
      )}`;
      fetch(url)
        .then(r => r.json())
        .then(d => {
          setTrendData(d.data ?? []);
          if (d.grain) setDataGrain(d.grain);
          setLoading(false);
        })
        .catch(() => { setError('Failed to load data.'); setLoading(false); });
    }
  }, [globalFilter, viewMode, grain, effectiveBuckets]);

  return (
    <WidgetCard
      title="Diet"
      floor={1}
      loading={loading}
      error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} />}
    >
      {viewMode === 'summary' ? (
        !summaryData ? (
          <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
        ) : (
          <SummaryView data={summaryData} isDark={isDark} />
        )
      ) : (
        <DietTrendView
          data={trendData}
          isDark={isDark}
          tab={trendTab}
          onTabChange={setTrendTab}
          grain={grain}
          onGrainChange={g => { setGrain(g); setCount(DEFAULT_BUCKETS[g]); }}
          count={count}
          onCountChange={setCount}
          shortCount={shortCount}
          onShortCountChange={setShortCount}
          dataGrain={dataGrain}
        />
      )}
    </WidgetCard>
  );
}
