// src/app/insights/_widgets/SleepWidget.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { WidgetProps, WidgetViewMode, SleepMetric } from '../_lib/types';
// Note: add SleepMetric to types.ts
import { useIsDark } from '../_lib/hooks';
import { chartColors } from '../_lib/chart-colors';
import { formatDuration, formatQualityScore } from '../_lib/format';
import { buildParams } from '../_lib/date-helpers';
import { TrendChart, YAxisConfig, CHART } from '../_lib/chart-components';
import { WidgetCard, ViewToggle, BucketSelector } from '../_components/WidgetCard';

// ── Quality pie ───────────────────────────────────────────────────────────────

function QualityPie({ counts }: { counts: { '좋음': number; '보통': number; '나쁨': number } }) {
  const total = counts['좋음'] + counts['보통'] + counts['나쁨'];
  if (total === 0) return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;

  const COLORS = { '좋음': '#3b82f6', '보통': '#a8a29e', '나쁨': '#f87171' };
  const LABELS = { '좋음': 'Good', '보통': 'OK', '나쁨': 'Poor' };
  const R = 40; const CX = 50; const CY = 50;
  let startAngle = -Math.PI / 2;

  const slices = (['좋음', '보통', '나쁨'] as const).map(k => {
    const frac = counts[k] / total;
    const angle = frac * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const path = frac === 1
      ? `M ${CX} ${CY} m -${R} 0 a ${R} ${R} 0 1 1 ${2*R} 0 a ${R} ${R} 0 1 1 -${2*R} 0`
      : `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
    startAngle = endAngle;
    return { key: k, path, color: COLORS[k], frac, count: counts[k] };
  }).filter(s => s.frac > 0);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-16 h-16 shrink-0">
        {slices.map(s => <path key={s.key} d={s.path} fill={s.color} opacity={0.85} />)}
      </svg>
      <div className="flex flex-col gap-1">
        {(['좋음', '보통', '나쁨'] as const).map(k => counts[k] > 0 && (
          <div key={k} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[k] }} />
            <span className="text-xs text-stone-600 dark:text-zinc-300">
              {LABELS[k]} {Math.round((counts[k] / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Y-axis config per sleep metric ────────────────────────────────────────────

type SleepMetricKey = 'duration' | 'bedtime' | 'waketime' | 'quality';

function getSleepYAxis(metric: SleepMetricKey, validValues: number[]): YAxisConfig {
  if (metric === 'duration') {
    const dataMin = Math.min(...validValues);
    const dataMax = Math.max(...validValues);
    const min = Math.max(0, dataMin - 3600);
    const max = dataMax + 3600;
    const mid = Math.round((min + max) / 2 / 3600) * 3600;
    return {
      min, max, baseline: null,
      yLabels: [
        { value: max, label: `${Math.round(max / 3600)}h` },
        { value: mid, label: `${Math.round(mid / 3600)}h` },
        { value: min, label: `${Math.round(min / 3600)}h` },
      ],
    };
  }
  if (metric === 'bedtime') {
    return {
      min: 1260, max: 1500, baseline: 1380,
      yLabels: [
        { value: 1500, label: '01:00' },
        { value: 1380, label: '23:00' },
        { value: 1260, label: '21:00' },
      ],
    };
  }
  if (metric === 'waketime') {
    return {
      min: 240, max: 480, baseline: 360,
      yLabels: [
        { value: 480, label: '08:00' },
        { value: 360, label: '06:00' },
        { value: 240, label: '04:00' },
      ],
    };
  }
  return {
    min: -1, max: 1, baseline: 0,
    yLabels: [
      { value: 1,  label: 'Good' },
      { value: 0,  label: 'OK' },
      { value: -1, label: 'Poor' },
    ],
  };
}

// ── Value extractors ──────────────────────────────────────────────────────────

function getSleepValue(summary: any, metric: SleepMetricKey): number | null {
  if (!summary) return null;
  if (metric === 'duration') return summary.duration?.avgSeconds ?? null;
  if (metric === 'bedtime') {
    const c = summary.bedtime?.avgClock;
    if (!c) return null;
    const [h, m] = c.split(':').map(Number);
    let mins = h * 60 + m;
    if (mins < 6 * 60) mins += 1440;
    return mins;
  }
  if (metric === 'waketime') {
    const c = summary.waketime?.avgClock;
    if (!c) return null;
    const [h, m] = c.split(':').map(Number);
    return h * 60 + m;
  }
  if (metric === 'quality') return summary.quality?.avgScore ?? null;
  return null;
}

function formatSleepValue(v: number, metric: SleepMetricKey): string {
  if (metric === 'duration') return formatDuration(v);
  if (metric === 'bedtime' || metric === 'waketime') {
    const wrapped = Math.round(v) % 1440;
    const h = Math.floor(wrapped / 60);
    const mn = Math.round(wrapped % 60);
    return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
  }
  if (metric === 'quality') return formatQualityScore(v);
  return String(v);
}

// ── SleepWidget ───────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<SleepMetricKey, string> = {
  duration: 'Duration', bedtime: 'Bedtime', waketime: 'Wake', quality: 'Quality',
};

export function SleepWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode, setViewMode] = useState<WidgetViewMode>('summary');
  const [metric, setMetric] = useState<SleepMetricKey>('duration');
  const [bucketsBack, setBucketsBack] = useState(12);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendData, setTrendData] = useState<{ label: string; summary: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPeriodMode = globalFilter.timeMode === 'period';
  useEffect(() => { if (isPeriodMode) setViewMode('summary'); }, [isPeriodMode]);

  useEffect(() => {
    setLoading(true); setError(null);
    const url = viewMode === 'summary'
      ? `/api/insights/stats?${buildParams({ metric: 'sleep.all', mode: 'summary' }, globalFilter)}`
      : `/api/insights/stats?${buildParams({ metric: 'sleep.all', mode: 'trend', bucketsBack: String(bucketsBack) }, globalFilter)}`;
    fetch(url).then(r => r.json()).then(d => {
      if (viewMode === 'summary') setSummaryData(d.summary ?? null);
      else setTrendData(d.data ?? []);
      setLoading(false);
    }).catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, bucketsBack]);

  // Prepare TrendChart props
  const values = trendData.map(d => getSleepValue(d.summary, metric));
  const validValues = values.filter((v): v is number => v !== null);

  return (
    <WidgetCard title="Sleep" floor={1} loading={loading} error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} disabled={isPeriodMode} />}>
      {viewMode === 'summary' ? (
        summaryData ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Duration', value: summaryData.duration?.avgSeconds ? formatDuration(summaryData.duration.avgSeconds) : '—' },
                { label: 'Bedtime',  value: summaryData.bedtime?.avgClock ?? '—' },
                { label: 'Wake',     value: summaryData.waketime?.avgClock ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">{label}</span>
                  <span className="text-sm font-mono font-medium text-stone-800 dark:text-zinc-100">{value}</span>
                </div>
              ))}
            </div>
            <div>
              <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide block mb-2">Quality</span>
              <div className="flex items-center gap-4">
                <QualityPie counts={summaryData.quality?.counts ?? { '좋음': 0, '보통': 0, '나쁨': 0 }} />
                {summaryData.quality?.avgScore != null && (
                  <div className="flex flex-col items-center">
                    <span className={`text-lg font-mono font-semibold ${
                      summaryData.quality.avgScore > 0 ? 'text-blue-500'
                      : summaryData.quality.avgScore < 0 ? 'text-red-400'
                      : 'text-stone-400 dark:text-zinc-500'
                    }`}>{formatQualityScore(summaryData.quality.avgScore)}</span>
                    <span className="text-[10px] text-stone-400 dark:text-zinc-500">avg score</span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-stone-400 dark:text-zinc-500">{summaryData.count} entries</p>
          </div>
        ) : <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>
      ) : (
        <div className="flex flex-col gap-3 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(METRIC_LABELS) as SleepMetricKey[]).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    metric === m
                      ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}>{METRIC_LABELS[m]}</button>
              ))}
            </div>
            <BucketSelector value={bucketsBack} onChange={setBucketsBack} />
          </div>
          {validValues.length > 0 ? (
            <TrendChart
              values={values}
              labels={trendData.map(d => d.label)}
              yAxis={getSleepYAxis(metric, validValues)}
              isDark={isDark}
              alwaysShowLabels={bucketsBack <= 6}
              formatValue={v => formatSleepValue(v, metric)}
            />
          ) : (
            <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>
          )}
        </div>
      )}
    </WidgetCard>
  );
}
