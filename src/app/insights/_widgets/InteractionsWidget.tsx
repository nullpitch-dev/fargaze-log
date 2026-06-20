'use client';
// src/app/insights/_widgets/InteractionsWidget.tsx

import { useEffect, useState, useRef } from 'react';
import { WidgetCard, ViewToggle, BucketSelector } from '../_components/WidgetCard';
import { MultiSelectDropdown } from '../_components/MultiSelectDropdown';
import { useIsDark } from '../_lib/hooks';
import { chartColors, PERSON_COLORS_LIGHT, PERSON_COLORS_DARK } from '../_lib/chart-colors';
import { TrendChart, StackedBarChart } from '../_lib/chart-components';
import type { StackedBarBucket } from '../_lib/chart-components';
import { CssRankFlowChart } from '../_components/charts/CssRankFlowChart';
import { buildParams } from '../_lib/date-helpers';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';
import type { YAxisConfig } from '../_lib/chart-components';

// ── Types ─────────────────────────────────────────────────────────────────────

type SummaryTab  = 'stats' | 'top10';
type TrendMetric = 'interactions' | 'people' | 'relationType' | 'method' | 'top7';

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
  { key: 'relationType', label: 'Relation',         desc: 'Mix of relation types over time (100%)'            },
  { key: 'method',       label: 'Method',       desc: 'Mix of interaction methods over time (100%)'       },
  { key: 'top7',         label: 'People',        desc: 'How your top 7 people change over time'            },
];

// ── Colours ───────────────────────────────────────────────────────────────────

const NEUTRAL_GREY_LIGHT = '#a8a29e';
const NEUTRAL_GREY_DARK  = '#71717a';

const METHOD_COLORS: Record<string, string> = {
  '대면': '#1d4ed8', '영상': '#0891b2', '통화': '#7c3aed',
  '문자': '#059669', '웹콜': '#d97706', '메일': '#dc2626', '기타': '#6b7280',
};
const CATEGORY_COLORS: Record<string, string> = {
  '가족': '#1d4ed8', '업무': '#7c3aed', '친목': '#0891b2',
  '연애': '#ec4899', '종교': '#d97706', '기타': '#6b7280',
};

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

// ── Y-axis builder for line charts (±10%) ────────────────────────────────────

function buildFlexYAxis(values: (number | null)[]): YAxisConfig {
  const valid = values.filter((v): v is number => v !== null && !isNaN(v));
  if (!valid.length) return { min: 0, max: 10, baseline: null, yLabels: [] };

  const rawMin = Math.min(...valid);
  const rawMax = Math.max(...valid);
  const pad    = Math.max(1, Math.round((rawMax - rawMin) * 0.1));
  const yMin   = Math.max(0, rawMin - pad);
  const yMax   = rawMax + pad;
  const step   = Math.max(1, Math.ceil((yMax - yMin) / 3));
  const ticks  = Array.from({ length: 4 }, (_, i) => Math.round(yMin + i * step));

  return {
    min:      yMin,
    max:      yMax,
    baseline: null,
    yLabels:  ticks.map(v => ({ value: v, label: String(v) })),
  };
}

// ── Data adapters: TrendBucket → shared chart prop types ─────────────────────

function toStackedBuckets(
  buckets: TrendBucket[],
  key: 'byRelationType' | 'byMethod',
): StackedBarBucket[] {
  return buckets.map(b => ({ label: b.label, data: b[key] }));
}

// ── Summary sub-components ────────────────────────────────────────────────────

function HorizBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-stone-500 dark:text-zinc-400 truncate">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-stone-500 dark:text-zinc-400">{pct}%</span>
      <span className="w-6 text-right text-stone-700 dark:text-zinc-200 font-medium">{count}</span>
    </div>
  );
}

function MiniSection({ title, data, colorMap }: {
  title: string; data: Record<string, number>; colorMap: Record<string, string>;
}) {
  const total  = Object.values(data).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">{title}</span>
      {sorted.map(([k, v]) => (
        <HorizBar key={k} label={k} count={v} total={total} color={colorMap[k] ?? '#a8a29e'} />
      ))}
    </div>
  );
}

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

function TopPeopleTable({ topPeople, others }: {
  topPeople: { name: string; dominantCategory: string; total: number; rows: { method: string; count: number }[] }[];
  others: { total: number; dominantMethod: string; dominantCategory: string };
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-100 dark:border-zinc-800 text-stone-400 dark:text-zinc-500">
            <th className="text-left py-1 pr-2 font-medium">Name</th>
            <th className="text-left py-1 pr-2 font-medium">Type</th>
            <th className="text-right py-1 pr-2 font-medium">#</th>
            <th className="text-left py-1 font-medium">Methods</th>
          </tr>
        </thead>
        <tbody>
          {topPeople.map((p, pi) => {
            const methods = p.rows
              .sort((a, b) => b.count - a.count)
              .map(r => `${r.method} ${r.count}`)
              .join(', ');
            return (
              <tr key={pi} className="border-b border-stone-50 dark:border-zinc-800/50">
                <td className="py-1 pr-2 font-medium text-stone-800 dark:text-zinc-100 truncate max-w-0">{p.name}</td>
                <td className="py-1 pr-2 text-stone-500 dark:text-zinc-400 truncate max-w-0">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: CATEGORY_COLORS[p.dominantCategory] ?? '#6b7280' }} />
                    {p.dominantCategory}
                  </span>
                </td>
                <td className="py-1 pr-2 text-right font-mono text-stone-700 dark:text-zinc-200">{p.total}</td>
                <td className="py-1 text-stone-500 dark:text-zinc-400 text-[10px]">{methods}</td>
              </tr>
            );
          })}
          {others.total > 0 && (
            <tr className="border-t border-stone-100 dark:border-zinc-800 text-stone-400 dark:text-zinc-500">
              <td className="py-1 pr-2 italic">Others</td>
              <td className="py-1 pr-2">{others.dominantCategory ? `${others.dominantCategory} 등` : '—'}</td>
              <td className="py-1 pr-2 text-right font-mono">{others.total}</td>
              <td className="py-1">{others.dominantMethod ? `${others.dominantMethod} 등` : '—'}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function InteractionsWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode, setViewMode]       = useState<WidgetViewMode>('summary');
  const [summaryTab, setSummaryTab]   = useState<SummaryTab>('stats');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('interactions');
  const [bucketsBack, setBucketsBack] = useState(12);

  // Draft filter state (updates on every checkbox click, no re-fetch)
  const [top7RelType, setTop7RelType]           = useState<string[]>([]);
  const [top7Method, setTop7Method]             = useState<string[]>([]);
  // Committed filter state (triggers re-fetch — updated only when dropdown closes)
  const [committedRelType, setCommittedRelType] = useState<string[]>([]);
  const [committedMethod, setCommittedMethod]   = useState<string[]>([]);
  // Refs so onClose callbacks always read the latest draft values
  const top7RelTypeRef = useRef<string[]>([]);
  const top7MethodRef  = useRef<string[]>([]);

  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendData, setTrendData]     = useState<TrendBucket[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const isPeriodMode = globalFilter.timeMode === 'period';
  useEffect(() => { if (isPeriodMode) setViewMode('summary'); }, [isPeriodMode]);

  useEffect(() => {
    setLoading(true); setError(null);
    const url = viewMode === 'summary'
      ? `/api/insights/stats?${buildParams({ metric: 'interactions.summary', mode: 'summary' }, globalFilter)}`
      : `/api/insights/stats?${buildParams({
          metric: 'interactions.summary',
          mode: 'trend',
          bucketsBack: String(bucketsBack),
          ...(committedRelType.length && { top7RelType: committedRelType.join(',') }),
          ...(committedMethod.length  && { top7Method:  committedMethod.join(',')  }),
        }, globalFilter)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (viewMode === 'summary') setSummaryData(d.summary ?? null);
        else setTrendData(d.data ?? []);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, bucketsBack, committedRelType, committedMethod]);

  // Reset filters when leaving top7 metric
  useEffect(() => {
    if (trendMetric !== 'top7') {
      setTop7RelType([]);
      setTop7Method([]);
      setCommittedRelType([]);
      setCommittedMethod([]);
    }
  }, [trendMetric]);

  // Keep refs in sync with draft state
  useEffect(() => { top7RelTypeRef.current = top7RelType; }, [top7RelType]);
  useEffect(() => { top7MethodRef.current  = top7Method;  }, [top7Method]);

  // Initialise both draft and committed to all-selected when data first loads
  useEffect(() => {
    if (trendData.length === 0) return;
    const allRelTypes = [...new Set(trendData.flatMap(b => Object.keys(b.byRelationType)))].filter(s => s.trim());
    const allMethods  = [...new Set(trendData.flatMap(b => Object.keys(b.byMethod)))].filter(s => s.trim());
    setTop7RelType(prev     => prev.length === 0 ? allRelTypes : prev);
    setTop7Method(prev      => prev.length === 0 ? allMethods  : prev);
    setCommittedRelType(prev => prev.length === 0 ? allRelTypes : prev);
    setCommittedMethod(prev  => prev.length === 0 ? allMethods  : prev);
  }, [trendData]);

  // Derived values
  const relTypeColorMap = buildCategoryColorMap(trendData, 'byRelationType', isDark);
  const methodColorMap  = buildCategoryColorMap(trendData, 'byMethod', isDark);
  const neutralGrey     = isDark ? NEUTRAL_GREY_DARK : NEUTRAL_GREY_LIGHT;

  const lineValues      = trendData.map(b =>
    trendMetric === 'interactions' ? b.totalCount : b.uniquePeopleCount,
  );
  const validLineValues = lineValues.filter((v): v is number => v !== null);
  const yAxis           = buildFlexYAxis(validLineValues);
  const activeDesc      = TREND_METRICS.find(m => m.key === trendMetric)?.desc;

  const relTypeOptions  = [...new Set(trendData.flatMap(b => Object.keys(b.byRelationType)))].filter(s => s.trim());
  const methodOptions   = [...new Set(trendData.flatMap(b => Object.keys(b.byMethod)))].filter(s => s.trim());

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
          {/* Summary tab bar */}
          <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px] mb-3 self-start">
            {(['stats', 'top10'] as SummaryTab[]).map(t => (
              <button key={t} onClick={() => setSummaryTab(t)}
                className={`px-2.5 py-1 transition-colors ${
                  summaryTab === t
                    ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                    : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
                }`}>
                {t === 'stats' ? 'Stats' : 'Top 10'}
              </button>
            ))}
          </div>

          {!summaryData ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : summaryTab === 'stats' ? (
            <div className="grid grid-cols-2 gap-x-4 divide-x divide-stone-100 dark:divide-zinc-800">
              <div className="flex flex-col gap-3">
               <BigStat value={summaryData.interactions.total} label="interactions" />
                <MiniSection title="Relation Type" data={summaryData.interactions.byCategory} colorMap={CATEGORY_COLORS} />
                <MiniSection title="Method"        data={summaryData.interactions.byMethod}   colorMap={METHOD_COLORS} /> 
              </div>
              <div className="flex flex-col gap-3 pl-4">
                <BigStat value={summaryData.people.total} label="unique people" />
                <MiniSection title="Relation Type" data={summaryData.people.byCategory} colorMap={CATEGORY_COLORS} />
                <MiniSection title="Method"        data={summaryData.people.byMethod}   colorMap={METHOD_COLORS} />
              </div>
            </div>
          ) : (
            <TopPeopleTable
              topPeople={summaryData.topPeople ?? []}
              others={summaryData.others ?? { total: 0, dominantMethod: '', dominantCategory: '' }}
            />
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

          {/* Row 4: chart */}
          {trendData.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (trendMetric === 'interactions' || trendMetric === 'people') ? (
            validLineValues.length > 0 ? (
              <TrendChart
                values={lineValues}
                labels={trendData.map(b => b.label)}
                yAxis={yAxis}
                isDark={isDark}
                alwaysShowLabels={bucketsBack <= 6}
                formatValue={v => String(v)}
              />
            ) : (
              <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
            )
          ) : trendMetric === 'relationType' ? (
            <StackedBarChart
              buckets={toStackedBuckets(trendData, 'byRelationType')}
              colorMap={relTypeColorMap}
              isDark={isDark}
              neutralGrey={neutralGrey}
            />
          ) : trendMetric === 'method' ? (
            <StackedBarChart
              buckets={toStackedBuckets(trendData, 'byMethod')}
              colorMap={methodColorMap}
              isDark={isDark}
              neutralGrey={neutralGrey}
            />
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
