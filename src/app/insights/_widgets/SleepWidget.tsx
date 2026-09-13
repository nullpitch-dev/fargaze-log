// src/app/insights/_widgets/SleepWidget.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { WidgetProps, WidgetViewMode } from '../_lib/types';
import { useIsDark } from '../_lib/hooks';
import { formatDuration } from '../_lib/format';
import { buildParams } from '../_lib/date-helpers';
import { HeatStrip } from '../_components/charts/CalendarHeatmap';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { SleepTrendView, type SleepTrendBucket, type SleepTrendTab } from './SleepTrendView';
import { BUCKET_OPTIONS, DEFAULT_BUCKETS } from './WeightTrendView';
import type { TrendGrain } from '@/lib/insights/trend-window';

// ── Band colours ──────────────────────────────────────────────────────────────
//
// Duration, Bedtime and Quality are judgements, so they share one blue / grey /
// red scale. Wake is deliberately NOT a judgement — waking early is neither
// good nor bad — so it gets its own violet ramp, light to dark by lateness.
// Reusing the judgement colours there would make early waking read as "good"
// however the labels are worded. Violet rather than grey so the mid band is
// never confused with an empty day.

const BAND_COLORS = { good: '#3b82f6', ok: '#93c5fd', bad: '#f87171' } as const;
const WAKE_COLORS = { early: '#c4b5fd', mid: '#8b5cf6', late: '#5b21b6' } as const;

type TriBand = 'good' | 'ok' | 'bad';
type WakeBand = 'early' | 'mid' | 'late';

// Thresholds, worded exactly as the API applies them. An exact boundary value
// falls in the MIDDLE band, so 5h, 7h, 22:30, 23:30, 05:00 and 07:00 are all OK.
const CRITERIA = {
  duration: { good: 'longer than 7h', ok: '5h to 7h', bad: 'shorter than 5h' },
  bedtime:  { good: 'before 22:30',   ok: '22:30 to 23:30', bad: 'after 23:30' },
  waketime: { early: 'before 05:00',  mid: '05:00 to 07:00', late: 'after 07:00' },
  quality:  { good: 'mostly 좋음',    ok: 'mostly 보통',     bad: 'mostly 나쁨' },
} as const;

function summarise(parts: [string, string][]): string {
  return parts.map(([k, v]) => `${k}: ${v}`).join('  ·  ');
}

// ── Pie ───────────────────────────────────────────────────────────────────────

interface Seg { key: string; label: string; value: number; color: string; hint?: string }

function MetricPie({ segments, size = 56 }: { segments: Seg[]; size?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <div style={{ width: size, height: size }} className="shrink-0" />;
  }

  const R = 40, CX = 50, CY = 50;
  let start = -Math.PI / 2;

  const slices = segments
    .map(seg => {
      const frac = seg.value / total;
      const angle = frac * 2 * Math.PI;
      const end = start + angle;
      const x1 = CX + R * Math.cos(start), y1 = CY + R * Math.sin(start);
      const x2 = CX + R * Math.cos(end),   y2 = CY + R * Math.sin(end);
      const path = frac === 1
        ? `M ${CX} ${CY} m -${R} 0 a ${R} ${R} 0 1 1 ${2 * R} 0 a ${R} ${R} 0 1 1 -${2 * R} 0`
        : `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${angle > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
      start = end;
      return { ...seg, path, frac };
    })
    .filter(s => s.frac > 0);

  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0">
      {slices.map(s => <path key={s.key} d={s.path} fill={s.color} opacity={0.85} />)}
    </svg>
  );
}

function PieLegend({ segments }: { segments: Seg[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="flex flex-col gap-0.5 items-start">
      {segments.map(s => (
        <div key={s.key} className="flex items-center gap-1" title={s.hint}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
          <span className="text-[9px] leading-tight text-stone-500 dark:text-zinc-400">
            {s.label} {total ? Math.round((s.value / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Summary view ──────────────────────────────────────────────────────────────

function SleepSummaryView({ data, isDark }: { data: any; isDark: boolean }) {
  if (!data || !data.count) {
    return <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>;
  }

  const C = CRITERIA;
  const durSegs: Seg[] = [
    { key: 'good', label: 'Good', value: data.duration.bands.good, color: BAND_COLORS.good, hint: `Good — ${C.duration.good}` },
    { key: 'ok',   label: 'OK',   value: data.duration.bands.ok,   color: BAND_COLORS.ok,   hint: `OK — ${C.duration.ok}` },
    { key: 'bad',  label: 'Bad',  value: data.duration.bands.bad,  color: BAND_COLORS.bad,  hint: `Bad — ${C.duration.bad}` },
  ];
  const bedSegs: Seg[] = [
    { key: 'good', label: 'Good', value: data.bedtime.bands.good, color: BAND_COLORS.good, hint: `Good — ${C.bedtime.good}` },
    { key: 'ok',   label: 'OK',   value: data.bedtime.bands.ok,   color: BAND_COLORS.ok,   hint: `OK — ${C.bedtime.ok}` },
    { key: 'bad',  label: 'Bad',  value: data.bedtime.bands.bad,  color: BAND_COLORS.bad,  hint: `Bad — ${C.bedtime.bad}` },
  ];
  const wakeSegs: Seg[] = [
    { key: 'early', label: '<5',  value: data.waketime.bands.early, color: WAKE_COLORS.early, hint: `Before 5 — ${C.waketime.early}` },
    { key: 'mid',   label: '5~7', value: data.waketime.bands.mid,   color: WAKE_COLORS.mid,   hint: `5 to 7 — ${C.waketime.mid}` },
    { key: 'late',  label: '>7',  value: data.waketime.bands.late,  color: WAKE_COLORS.late,  hint: `After 7 — ${C.waketime.late}` },
  ];
  const qSegs: Seg[] = [
    { key: 'good', label: 'Good', value: data.quality.bands.good, color: BAND_COLORS.good, hint: `Good — ${C.quality.good}` },
    { key: 'ok',   label: 'OK',   value: data.quality.bands.ok,   color: BAND_COLORS.ok,   hint: `OK — ${C.quality.ok}` },
    { key: 'bad',  label: 'Poor', value: data.quality.bands.bad,  color: BAND_COLORS.bad,  hint: `Poor — ${C.quality.bad}` },
  ];

  const durHint = summarise([['Good', C.duration.good], ['OK', C.duration.ok], ['Bad', C.duration.bad]]);
  const bedHint = summarise([['Good', C.bedtime.good], ['OK', C.bedtime.ok], ['Bad', C.bedtime.bad]]);
  const wakeHint = summarise([['<5', C.waketime.early], ['5~7', C.waketime.mid], ['>7', C.waketime.late]])
    + '  ·  no judgement, just information';
  const qHint = 'Daily mean of 좋음 +1 / 보통 0 / 나쁨 -1, shown as a percentage: all poor 0%, all good 100%';

  const columns = [
    {
      title: 'Duration',
      figure: data.duration.avgSeconds != null ? formatDuration(data.duration.avgSeconds) : '—',
      segments: durSegs,
      hint: durHint,
    },
    { title: 'Bedtime', figure: data.bedtime.avgClock ?? '—',  segments: bedSegs,  hint: bedHint },
    { title: 'Wake',    figure: data.waketime.avgClock ?? '—', segments: wakeSegs, hint: wakeHint },
    {
      title: 'Quality',
      figure: data.quality.percent != null ? `${data.quality.percent}%` : '—',
      segments: qSegs,
      hint: qHint,
    },
  ];

  // Per-day lookups for the strips. A day with no entry, or with a null band,
  // gets no fill — HeatStrip draws it as an empty cell, the same as a day with
  // no record at all. That is the nap-only day and the 15h-ceiling day.
  const byDate = new Map<string, any>();
  for (const d of data.days) byDate.set(d.date, d);

  const fillFor = (key: 'dBand' | 'bBand' | 'qBand') => (date: string) => {
    const band = byDate.get(date)?.[key] as TriBand | null | undefined;
    return band ? BAND_COLORS[band] : null;
  };
  const fillWake = (date: string) => {
    const band = byDate.get(date)?.wBand as WakeBand | null | undefined;
    return band ? WAKE_COLORS[band] : null;
  };

  const strips: { label: string; fill: (d: string) => string | null; hint: string }[] = [
    { label: 'Duration', fill: fillFor('dBand'), hint: durHint },
    { label: 'Bedtime',  fill: fillFor('bBand'), hint: bedHint },
    { label: 'Wake',     fill: fillWake,         hint: wakeHint },
    { label: 'Quality',  fill: fillFor('qBand'), hint: qHint },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Upper: four columns — title, figure, pie, legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-4">
        {columns.map(col => (
          <div key={col.title} className="flex flex-col items-center gap-1.5 min-w-0" title={col.hint}>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide cursor-help">
              {col.title}
            </span>
            <span className="text-sm font-mono font-medium text-stone-800 dark:text-zinc-100">
              {col.figure}
            </span>
            <MetricPie segments={col.segments} />
            <PieLegend segments={col.segments} />
          </div>
        ))}
      </div>

      {/* Lower: four aligned day strips */}
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
        {strips.map(s => (
          <React.Fragment key={s.label}>
            <span className="text-[9px] text-stone-400 dark:text-zinc-500 text-right cursor-help" title={s.hint}>
              {s.label}
            </span>
            <HeatStrip
              rangeStart={data.rangeStart}
              rangeEnd={data.rangeEnd}
              isDark={isDark}
              fillFor={s.fill}
              height={14}
            />
          </React.Fragment>
        ))}
      </div>

      <p className="text-[10px] text-stone-400 dark:text-zinc-500">{data.count} days</p>
    </div>
  );
}

// ── SleepWidget ───────────────────────────────────────────────────────────────

export function SleepWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
	const [viewMode, setViewMode] = useState<WidgetViewMode>('summary');
  const [trendTab, setTrendTab] = useState<SleepTrendTab>('session');
  const [grain, setGrain] = useState<TrendGrain>('month');
  const [count, setCount] = useState(DEFAULT_BUCKETS.month);
  // The grain the SERVER used. Labels and the resolved-range line format from
  // this, never from the control, so a grain switch cannot render one frame of
  // new labels against old data.
  const [dataGrain, setDataGrain] = useState<TrendGrain>('month');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendData, setTrendData] = useState<SleepTrendBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Trend stays available in Period mode — the period only anchors the window.
  const isPeriodMode = false;

  function changeGrain(g: TrendGrain) {
    setGrain(g);
    setCount(DEFAULT_BUCKETS[g]);   // count resets to the new grain's default
  }

  useEffect(() => {
    setLoading(true); setError(null);
    const url = viewMode === 'summary'
      ? `/api/insights/stats?${buildParams({ metric: 'sleep.summary' }, globalFilter)}`
      : `/api/insights/stats?${buildParams(
          { metric: 'sleep.trend', grain, buckets: String(count) },
          globalFilter,
        )}`;
    fetch(url).then(r => r.json()).then(d => {
      if (viewMode === 'summary') {
        setSummaryData(d.summary ?? null);
      } else {
        setTrendData(d.buckets ?? []);
        if (d.grain) setDataGrain(d.grain as TrendGrain);
      }
      setLoading(false);
    }).catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, grain, count]);

  return (
    <WidgetCard title="Sleep" floor={1} loading={loading} error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} disabled={isPeriodMode} />}>
      {viewMode === 'summary' ? (
        <SleepSummaryView data={summaryData} isDark={isDark} />
			) : (
        <SleepTrendView
          data={trendData}
          isDark={isDark}
          tab={trendTab}
          onTabChange={setTrendTab}
          grain={grain}
          onGrainChange={changeGrain}
          count={count}
          onCountChange={setCount}
          dataGrain={dataGrain}
        />
      )}
    </WidgetCard>
  );
}
