'use client';
// src/app/insights/_widgets/DrinkingWidget.tsx

import { useEffect, useState } from 'react';
import { WidgetCard, ViewToggle, BucketSelector } from '../_components/WidgetCard';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { formatDuration } from '../_lib/format';
import type { WidgetProps, WidgetViewMode } from '../_lib/types';
import { BoxPlot } from '../_components/charts/BoxPlot';
import { Histogram } from '../_components/charts/Histogram';
import {
  CssTrendChart,
  CssStackedBarChart,
  CssVerticalBoxPlotChart,
  CssDualLineChart,
  CssRestChart,
} from '../_components/charts/css-chart-components';

// ── Types ─────────────────────────────────────────────────────────────────────

type SummaryTab  = 'stats' | 'top10';
type TrendMetric = 'days' | 'totalDrinks' | 'drinksPerDay' | 'drinkType' | 'occasion' | 'withWhom' | 'restDays' | 'sessionTime';

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
  drinkingDays:       number;
  daysInPeriod:       number;
  totalDrinks:        number;
  avgDrinksPerDay:    number | null;
  drinksBox:          { min: number; max: number; avg: number; p25: number; p75: number } | null;
  avgRestDays:        number;
  histogram:          Record<string, number>;
  drinkType:          Record<string, number>;
  occasions:          Record<string, number>;
  companions:         Record<string, number>;
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
  { key: 'withWhom',    label: 'People',    desc: 'Who you drink with over time (100%)'              },
  { key: 'restDays',    label: 'Rest',      desc: 'Rest days distribution and average over time',
    tip: 'Consecutive days without drinking before each day' },
  { key: 'sessionTime', label: 'Session',   desc: 'Average session start and end time over time',
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

// ── Compact horizontal bar ────────────────────────────────────────────────────

function HorizBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <span className="w-8 shrink-0 text-stone-500 dark:text-zinc-400 truncate">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden min-w-0">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-5 text-right text-stone-500 dark:text-zinc-400 shrink-0">{count}</span>
    </div>
  );
}

function CompactSection({ title, data, colorMap }: {
  title: string; data: Record<string, number>; colorMap: Record<string, string>;
}) {
  const total  = Object.values(data).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
        {title}
      </span>
      {sorted.map(([k, v]) => (
        <HorizBar key={k} label={k} count={v} total={total} color={colorMap[k] ?? '#a8a29e'} />
      ))}
    </div>
  );
}

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

  const companionData: Record<string, number> = { '혼자': data.companions.alone };
  for (const [k, v] of Object.entries(data.companions.byRelationType)) {
    companionData[k] = (companionData[k] ?? 0) + v;
  }
  const companionColors: Record<string, string> = { '혼자': '#a8a29e', ...RELATION_COLORS };

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

      {/* ── Row 2: Drink Type | Occasion | With Whom ── */}
      <div className="grid grid-cols-3 gap-3">
        <CompactSection title="Drink Type" data={data.drinkType ?? {}} colorMap={DRINK_TYPE_COLORS} />
        <CompactSection title="Occasion"   data={data.occasions}       colorMap={OCCASION_COLORS} />
        <CompactSection title="With Whom"  data={companionData}        colorMap={companionColors} />
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

// ── Top 10 tab ────────────────────────────────────────────────────────────────

function Top10Tab({ data }: { data: DrinkingSummary }) {
  const people = data.companions.topPeople;
  if (!people.length) {
    return <p className="text-xs text-stone-400 dark:text-zinc-500">No companion data</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-stone-100 dark:border-zinc-800 text-stone-400 dark:text-zinc-500">
            <th className="text-left py-1 pr-2 font-medium">Name</th>
            <th className="text-left py-1 pr-2 font-medium">Type</th>
            <th className="text-right py-1 font-medium">#</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => (
            <tr key={i} className="border-b border-stone-50 dark:border-zinc-800/50">
              <td className="py-1 pr-2 font-medium text-stone-800 dark:text-zinc-100 truncate max-w-0">
                {p.name}
              </td>
              <td className="py-1 pr-2 text-stone-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: RELATION_COLORS[p.dominantCategory] ?? '#6b7280' }} />
                  {p.dominantCategory}
                </span>
              </td>
              <td className="py-1 text-right font-mono text-stone-700 dark:text-zinc-200">
                {p.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function DrinkingTrendChart({
  metric, buckets, isDark, bucketsBack,
}: {
  metric: TrendMetric;
  buckets: DrinkingTrendBucket[];
  isDark: boolean;
  bucketsBack: number;
}) {
  const labels = buckets.map(b => b.label);
  const alwaysShow = bucketsBack <= 6;

  if (metric === 'days') {
    return (
      <CssTrendChart
        series={[{
          values: buckets.map(b => b.drinkingDays),
          color: isDark ? '#2dd4bf' : '#1d4ed8',
        }]}
        labels={labels}
        formatY={v => String(Math.round(v))}
        isDark={isDark}
        alwaysShowLabels={alwaysShow}
      />
    );
  }

  if (metric === 'totalDrinks') {
    return (
      <CssTrendChart
        series={[{
          values: buckets.map(b => b.totalDrinks),
          color: isDark ? '#2dd4bf' : '#1d4ed8',
        }]}
        labels={labels}
        formatY={v => String(Math.round(v))}
        isDark={isDark}
        alwaysShowLabels={alwaysShow}
      />
    );
  }

  if (metric === 'drinksPerDay') {
    const boxBuckets = buckets
      .filter(b => b.drinksBox !== null)
      .map(b => ({ label: b.label, ...b.drinksBox! }));
    if (!boxBuckets.length) return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;
    return <CssVerticalBoxPlotChart buckets={boxBuckets} isDark={isDark} />;
  }

  if (metric === 'drinkType') {
    return (
      <CssStackedBarChart
        buckets={buckets.map(b => ({ label: b.label, data: b.drinkType }))}
        colorMap={DRINK_TYPE_COLORS}
        isDark={isDark}
      />
    );
  }

  if (metric === 'occasion') {
    return (
      <CssStackedBarChart
        buckets={buckets.map(b => ({ label: b.label, data: b.occasions }))}
        colorMap={OCCASION_COLORS}
        isDark={isDark}
      />
    );
  }

  if (metric === 'withWhom') {
    const companionColors: Record<string, string> = { '혼자': '#a8a29e', ...RELATION_COLORS };
    return (
      <CssStackedBarChart
        buckets={buckets.map(b => ({ label: b.label, data: b.companions }))}
        colorMap={companionColors}
        isDark={isDark}
      />
    );
  }

  if (metric === 'restDays') {
    return (
      <CssRestChart
        buckets={buckets.map(b => ({
          label:       b.label,
          histogram:   b.histogram,
          avgRestDays: b.avgRestDays,
        }))}
        isDark={isDark}
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
      />
    );
  }

  return null;
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function DrinkingWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode,    setViewMode]    = useState<WidgetViewMode>('summary');
  const [summaryTab,  setSummaryTab]  = useState<SummaryTab>('stats');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('days');
  const [bucketsBack, setBucketsBack] = useState(6);
  const [summaryData, setSummaryData] = useState<DrinkingSummary | null>(null);
  const [trendData,   setTrendData]   = useState<DrinkingTrendBucket[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const isPeriodMode = globalFilter.timeMode === 'period';

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
        { metric: 'drinking.summary', mode: 'trend', bucketsBack: String(bucketsBack) },
        globalFilter,
      )}`;
      fetch(url)
        .then(r => r.json())
        .then(d => { setTrendData(d.data ?? []); setLoading(false); })
        .catch(() => { setError('Failed to load data.'); setLoading(false); });
    }
  }, [globalFilter, viewMode, bucketsBack]);

  return (
    <WidgetCard
      title="Drinking"
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
              <button
                key={t}
                onClick={() => setSummaryTab(t)}
                className={`px-2.5 py-1 transition-colors ${
                  summaryTab === t
                    ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                    : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
                }`}
              >
                {t === 'stats' ? 'Stats' : 'Top 10'}
              </button>
            ))}
          </div>

          {!summaryData ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : summaryTab === 'stats' ? (
            <StatsTab data={summaryData} isDark={isDark} />
          ) : (
            <Top10Tab data={summaryData} />
          )}
        </>
      ) : (
        // ── Trend view ──────────────────────────────────────────────────────────
        <div className="flex flex-col gap-3">

          {/* Row 1: metric pills + BucketSelector */}
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

          {/* Row 2: description + optional ⓘ */}
          {TREND_METRICS.find(m => m.key === trendMetric)?.desc && (
            <p className="text-[11px] text-stone-400 dark:text-zinc-500 -mt-1 flex items-center gap-1">
              {TREND_METRICS.find(m => m.key === trendMetric)!.desc}
              {TREND_METRICS.find(m => m.key === trendMetric)?.tip && (
                <TrendTip tip={TREND_METRICS.find(m => m.key === trendMetric)!.tip!} />
              )}
            </p>
          )}

          {/* Row 3: chart */}
          {trendData.length === 0 ? (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          ) : (
            <DrinkingTrendChart
              metric={trendMetric}
              buckets={trendData}
              isDark={isDark}
              bucketsBack={bucketsBack}
            />
          )}
        </div>
      )}
    </WidgetCard>
  );
}
