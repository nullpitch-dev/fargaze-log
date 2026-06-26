'use client';
// src/app/insights/_widgets/InteractionsWidget.tsx

import { useEffect, useState, useRef } from 'react';
import { WidgetCard, ViewToggle, BucketSelector } from '../_components/WidgetCard';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useIsDark } from '../_lib/hooks';
import { chartColors, PERSON_COLORS_LIGHT, PERSON_COLORS_DARK, autoColorMap } from '../_lib/chart-colors';
import { BarSection, BarRow, Title } from '../_components/charts/bars';
import { StackedBars } from '../_components/charts/StackedBars';
import { CssTrendChart } from '../_components/charts/css-chart-components';
import { CssRankFlowChart } from '../_components/charts/CssRankFlowChart';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrendMetric = 'interactions' | 'people' | 'relationType' | 'method' | 'top7';

// Trend tabs that carry their own independent Method filter
const METHOD_FILTER_TABS: TrendMetric[] = ['interactions', 'people', 'relationType'];

interface TrendBucket {
  label: string;
  totalCount: number;
  uniquePeopleCount: number;
  byRelationType: Record<string, number>;
  byMethod: Record<string, number>;
  top7: { name: string; count: number }[];
  transitioning: string[];
}

// ── Metric definitions ────────────────────────────────────────────────────────

const TREND_METRICS: { key: TrendMetric; label: string; desc: string }[] = [
  { key: 'interactions', label: 'Interactions', desc: 'Total number of interaction events over time'      },
  { key: 'people',       label: 'Unique',       desc: 'Number of unique people interacted with over time' },
  { key: 'relationType', label: 'Relation',     desc: 'Mix of relation types over time (100%)'            },
  { key: 'method',       label: 'Method',       desc: 'Mix of interaction methods over time (100%)'       },
  { key: 'top7',         label: 'People',        desc: 'How your top 7 people change over time'            },
];

// ── Colours ───────────────────────────────────────────────────────────────────

function buildCategoryColorMap(
  buckets: TrendBucket[],
  key: 'byRelationType' | 'byMethod',
  isDark: boolean,
): Record<string, string> {
  const palette = isDark ? PERSON_COLORS_DARK : PERSON_COLORS_LIGHT;
  const cats = new Set<string>();
  for (const b of buckets) Object.keys(b[key]).forEach(k => cats.add(k));
  const map: Record<string, string> = {};
  [...cats].forEach((cat, i) => { map[cat] = palette[i % palette.length]; });
  return map;
}

// ── Data adapters: TrendBucket → shared chart prop types ─────────────────────

// {label, data} bucket shape for StackedBars (formerly exported by _lib/chart-components).
interface StackedBarBucket {
  label: string;
  data: Record<string, number>;
}

function toStackedBuckets(
  buckets: TrendBucket[],
  key: 'byRelationType' | 'byMethod',
): StackedBarBucket[] {
  return buckets.map(b => ({ label: b.label, data: b[key] }));
}

// {label,data} buckets + colour map → StackedBars props.
// Largest-total category stacked at the bottom (matches the old StackedBarChart order).
function toStacked(
  raw: StackedBarBucket[],
  colorMap: Record<string, string>,
  isDark: boolean,
) {
  const ng = isDark ? '#71717a' : '#a8a29e';
  const totals: Record<string, number> = {};
  for (const b of raw) for (const [k, v] of Object.entries(b.data)) if (k.trim()) totals[k] = (totals[k] ?? 0) + v;
  const cats = Object.keys(totals).filter(c => c.trim()).sort((a, b) => totals[b] - totals[a]);
  return {
    buckets: raw.map(b => ({ label: b.label, values: b.data })),
    series:  cats.map(c => ({ key: c, label: c, color: colorMap[c] ?? ng })),
  };
}

// ── Summary sub-components ────────────────────────────────────────────────────

function BigStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none">
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-stone-400 dark:text-zinc-500 mt-0.5">{label}</span>
    </div>
  );
}

// Full-width People row: top 10 by interaction count, ranks 1–5 left / 6–10
// right. Joint-normalised — every bar shares one max (#1) and one total — so the
// two columns read as one honest ranking. Each bar inherits its person's
// dominant-relation colour (same palette as the Relation Type section).
function PeopleBars({ topPeople, colorMap, isDark }: {
  topPeople: { name: string; dominantCategory: string; total: number }[];
  colorMap: Record<string, string>;
  isDark: boolean;
}) {
  const people = topPeople.filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
  if (!people.length) return null;
  const sum = people.reduce((s, p) => s + p.total, 0);
  const max = people[0].total;
  const neutral = isDark ? '#52525b' : '#a8a29e';

  const column = (slice: typeof people) => (
    <div className="flex flex-col gap-1">
      {slice.map(p => (
        <BarRow key={p.name} label={p.name} count={p.total}
          pct={Math.round((p.total / sum) * 100)} frac={p.total / max}
          color={colorMap[p.dominantCategory] ?? neutral} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Title>People</Title>
      <div className="grid grid-cols-2 gap-x-4">
        {column(people.slice(0, 5))}
        {column(people.slice(5, 10))}
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function InteractionsWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode, setViewMode]       = useState<WidgetViewMode>('summary');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('interactions');
  const [bucketsBack, setBucketsBack] = useState(12);

  // People-tab filters (unchanged): Relation + Method, draft → commit on close
  const [top7RelType, setTop7RelType]           = useState<string[]>([]);
  const [top7Method, setTop7Method]             = useState<string[]>([]);
  const [committedRelType, setCommittedRelType] = useState<string[]>([]);
  const [committedMethod, setCommittedMethod]   = useState<string[]>([]);
  const top7RelTypeRef = useRef<string[]>([]);
  const top7MethodRef  = useRef<string[]>([]);

  // Per-tab Method filters (independent) for Interactions / Unique / Relation,
  // keyed by metric. Draft → commit on close, same pattern as People.
  const [tabMethodDraft, setTabMethodDraft]         = useState<Record<string, string[]>>({});
  const [tabMethodCommitted, setTabMethodCommitted] = useState<Record<string, string[]>>({});
  const tabMethodRef = useRef<Record<string, string[]>>({});

  // Summary Method filter — independent from every Trend tab
  const [summaryMethodDraft, setSummaryMethodDraft]         = useState<string[]>([]);
  const [summaryMethodCommitted, setSummaryMethodCommitted] = useState<string[]>([]);
  const summaryMethodRef = useRef<string[]>([]);

  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendData, setTrendData]     = useState<TrendBucket[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Full method universe (byMethod stays full in both modes), used both for the
  // dropdown options and to detect "all selected" so we can omit the param —
  // keeping the default view byte-identical to today.
  const summaryAllMethods = summaryData
    ? Object.keys(summaryData.interactions.byMethod).filter(s => s.trim())
    : [];
  const trendAllMethods = [...new Set(trendData.flatMap(b => Object.keys(b.byMethod)))].filter(s => s.trim());

  const subsetParam = (sel: string[] | undefined, universe: string[]) =>
    sel && sel.length > 0 && sel.length < universe.length ? sel.join(',') : '';

  const summaryMethodParam = subsetParam(summaryMethodCommitted, summaryAllMethods);
  const pInteractions = subsetParam(tabMethodCommitted['interactions'], trendAllMethods);
  const pUnique       = subsetParam(tabMethodCommitted['people'],       trendAllMethods);
  const pRelation     = subsetParam(tabMethodCommitted['relationType'], trendAllMethods);

  const isPeriodMode = globalFilter.timeMode === 'period';
  useEffect(() => { if (isPeriodMode) setViewMode('summary'); }, [isPeriodMode]);

  useEffect(() => {
    setLoading(true); setError(null);
    const url = viewMode === 'summary'
      ? `/api/insights/stats?${buildParams({
          metric: 'interactions.summary',
          mode: 'summary',
          ...(summaryMethodParam && { method: summaryMethodParam }),
        }, globalFilter)}`
      : `/api/insights/stats?${buildParams({
          metric: 'interactions.summary',
          mode: 'trend',
          bucketsBack: String(bucketsBack),
          ...(committedRelType.length && { top7RelType: committedRelType.join(',') }),
          ...(committedMethod.length  && { top7Method:  committedMethod.join(',')  }),
          ...(pInteractions && { mInteractions: pInteractions }),
          ...(pUnique       && { mUnique:       pUnique }),
          ...(pRelation     && { mRelation:     pRelation }),
        }, globalFilter)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (viewMode === 'summary') setSummaryData(d.summary ?? null);
        else setTrendData(d.data ?? []);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, bucketsBack, committedRelType, committedMethod, pInteractions, pUnique, pRelation, summaryMethodParam]);

  // Keep refs in sync with draft state
  useEffect(() => { top7RelTypeRef.current = top7RelType; }, [top7RelType]);
  useEffect(() => { top7MethodRef.current  = top7Method;  }, [top7Method]);
  useEffect(() => { tabMethodRef.current   = tabMethodDraft; }, [tabMethodDraft]);
  useEffect(() => { summaryMethodRef.current = summaryMethodDraft; }, [summaryMethodDraft]);

  // Initialise all Trend selections to all-selected when trend data first loads
  useEffect(() => {
    if (trendData.length === 0) return;
    const allRelTypes = [...new Set(trendData.flatMap(b => Object.keys(b.byRelationType)))].filter(s => s.trim());
    const allMethods  = [...new Set(trendData.flatMap(b => Object.keys(b.byMethod)))].filter(s => s.trim());
    setTop7RelType(prev      => prev.length === 0 ? allRelTypes : prev);
    setTop7Method(prev       => prev.length === 0 ? allMethods  : prev);
    setCommittedRelType(prev => prev.length === 0 ? allRelTypes : prev);
    setCommittedMethod(prev  => prev.length === 0 ? allMethods  : prev);
    const initTab = (rec: Record<string, string[]>) => {
      const next = { ...rec };
      for (const k of METHOD_FILTER_TABS) {
        if (!next[k] || next[k].length === 0) next[k] = allMethods;
      }
      return next;
    };
    setTabMethodDraft(initTab);
    setTabMethodCommitted(initTab);
  }, [trendData]);

  // Initialise the Summary Method filter to all-selected when summary data loads
  useEffect(() => {
    if (!summaryData) return;
    const all = Object.keys(summaryData.interactions.byMethod).filter(s => s.trim());
    setSummaryMethodDraft(prev     => prev.length === 0 ? all : prev);
    setSummaryMethodCommitted(prev => prev.length === 0 ? all : prev);
  }, [summaryData]);

  // Derived values
  const relTypeColorMap = buildCategoryColorMap(trendData, 'byRelationType', isDark);
  const methodColorMap  = buildCategoryColorMap(trendData, 'byMethod', isDark);
  const relTypeStacked  = toStacked(toStackedBuckets(trendData, 'byRelationType'), relTypeColorMap, isDark);
  const methodStacked   = toStacked(toStackedBuckets(trendData, 'byMethod'),       methodColorMap,  isDark);

  const lineValues      = trendData.map(b =>
    trendMetric === 'interactions' ? b.totalCount : b.uniquePeopleCount,
  );
  const validLineValues = lineValues.filter((v): v is number => v !== null);
  const activeDesc      = TREND_METRICS.find(m => m.key === trendMetric)?.desc;

  const relTypeOptions  = [...new Set(trendData.flatMap(b => Object.keys(b.byRelationType)))].filter(s => s.trim());
  const methodOptions   = trendAllMethods;

  // Summary colour maps (relation type + method), shared across both columns and
  // the People table dot so each category keeps one colour. Auto-assigned.
  const catColors = autoColorMap(
    summaryData
      ? Array.from(new Set([
          ...Object.keys(summaryData.interactions.byCategory),
          ...Object.keys(summaryData.people.byCategory),
        ])).sort((a, b) => (summaryData.interactions.byCategory[b] ?? 0) - (summaryData.interactions.byCategory[a] ?? 0))
      : [],
    isDark,
  );
  const methodColors = autoColorMap(
    summaryData
      ? Array.from(new Set([
          ...Object.keys(summaryData.interactions.byMethod),
          ...Object.keys(summaryData.people.byMethod),
        ])).sort((a, b) => (summaryData.interactions.byMethod[b] ?? 0) - (summaryData.interactions.byMethod[a] ?? 0))
      : [],
    isDark,
  );

  // Summary Method filter row — between the header line and the contents
  const summaryMethodRow = summaryAllMethods.length === 0 ? null : (
    <div className="flex justify-end pb-2 -mt-1">
      <MultiSelectDropdown
        label="Method"
        options={summaryAllMethods}
        selected={summaryMethodDraft}
        onChange={setSummaryMethodDraft}
        onClose={() => setSummaryMethodCommitted([...summaryMethodRef.current])}
      />
    </div>
  );

  // Per-tab Method control (Interactions / Unique / Relation), shown by the chart
  const tabMethodControl = (METHOD_FILTER_TABS.includes(trendMetric) && methodOptions.length > 0) ? (
    <div className="flex justify-end -mt-1">
      <MultiSelectDropdown
        label="Method"
        options={methodOptions}
        selected={tabMethodDraft[trendMetric] ?? []}
        onChange={vals => setTabMethodDraft(prev => ({ ...prev, [trendMetric]: vals }))}
        onClose={() => setTabMethodCommitted(prev => ({ ...prev, [trendMetric]: tabMethodRef.current[trendMetric] ?? [] }))}
      />
    </div>
  ) : null;

  return (
    <WidgetCard
      title="Interactions"
      floor={1}
      loading={loading}
      error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} disabled={isPeriodMode} />}
    >
      {viewMode === 'summary' ? (
        <>
          {summaryMethodRow}
          {!summaryData ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Row 1: interactions (left) + unique people (right) */}
              <div className="grid grid-cols-2 gap-x-4 divide-x divide-stone-100 dark:divide-zinc-800">
                <div className="flex flex-col gap-3">
                  <BigStat value={summaryData.interactions.total} label="interactions" />
                  <BarSection title="Relation Type" data={summaryData.interactions.byCategory} colorMap={catColors}    isDark={isDark} />
                  <BarSection title="Method"        data={summaryData.interactions.byMethod}   colorMap={methodColors} isDark={isDark} />
                </div>
                <div className="flex flex-col gap-3 pl-4">
                  <BigStat value={summaryData.people.total} label="unique people" />
                  <BarSection title="Relation Type" data={summaryData.people.byCategory} colorMap={catColors}    isDark={isDark} />
                  <BarSection title="Method"        data={summaryData.people.byMethod}   colorMap={methodColors} isDark={isDark} />
                </div>
              </div>

              {/* Row 2: full-width People — ranks 1–5 left, 6–10 right, joint-normalised */}
              <PeopleBars topPeople={summaryData.topPeople ?? []} colorMap={catColors} isDark={isDark} />
            </div>
          )}
        </>
      ) : (
        // ── Trend view ────────────────────────────────────────────────────────
        <div className="flex flex-col gap-3">

          {/* Row 1: metric pills (left) + BucketSelector (right) */}
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
            <BucketSelector value={bucketsBack} onChange={setBucketsBack} />
          </div>

          {/* Row 2: description of active metric */}
          {activeDesc && (
            <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1">{activeDesc}</p>
          )}

          {/* Row 3: per-tab Method control (Interactions / Unique / Relation) */}
          {tabMethodControl}

          {/* Row 4: chart */}
          {trendData.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (trendMetric === 'interactions' || trendMetric === 'people') ? (
            validLineValues.length > 0 ? (
              <CssTrendChart
                series={[{ values: lineValues, color: isDark ? '#2dd4bf' : '#1d4ed8' }]}
                labels={trendData.map(b => b.label)}
                formatY={v => String(v)}
                isDark={isDark}
              />
            ) : (
              <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
            )
          ) : trendMetric === 'relationType' ? (
            <StackedBars buckets={relTypeStacked.buckets} series={relTypeStacked.series} isDark={isDark} mode="percent" />
          ) : trendMetric === 'method' ? (
            <StackedBars buckets={methodStacked.buckets} series={methodStacked.series} isDark={isDark} mode="percent" />
          ) : (
            <CssRankFlowChart
              buckets={trendData.map(b => ({ label: b.label, ranked: b.top7 }))}
              topN={7}
              isDark={isDark}
              controls={
                <>
                  <MultiSelectDropdown
                    label="Relation"
                    options={relTypeOptions}
                    selected={top7RelType}
                    onChange={setTop7RelType}
                    onClose={() => setCommittedRelType([...top7RelTypeRef.current])}
                  />
                  <MultiSelectDropdown
                    label="Method"
                    options={methodOptions}
                    selected={top7Method}
                    onChange={setTop7Method}
                    onClose={() => setCommittedMethod([...top7MethodRef.current])}
                  />
                </>
              }
            />
          )}
        </div>
      )}
    </WidgetCard>
  );
}
