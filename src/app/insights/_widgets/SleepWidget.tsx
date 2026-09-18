// src/app/insights/_widgets/SleepWidget.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { WidgetProps, WidgetViewMode } from '../_lib/types';
import { useIsDark } from '../_lib/hooks';
import { formatDuration } from '../_lib/format';
import { buildParams } from '../_lib/date-helpers';
import {
  ChartHoverCard, minsToClockStr, type HoverRow,
} from '../_components/charts/css-chart-components';
import { HeatStrip } from '../_components/charts/CalendarHeatmap';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { SleepTrendView, type SleepTrendBucket, type SleepTrendTab } from './SleepTrendView';
import { DEFAULT_BUCKETS } from './WeightTrendView';
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

// ── Pie ───────────────────────────────────────────────────────────────────────

interface Seg { key: string; label: string; value: number; color: string; hint?: string }

/**
 * Pie and legend are one component because they share one hover state: pointing
 * at a slice or at its legend row does the same thing — dims the other bands
 * and opens the shared chart hover card with the whole breakdown, the way the
 * line chart lists every series. The hovered band keeps the bold value and
 * carries its threshold as the note.
 *
 * The card hangs below the block rather than below the pie, so it never lands
 * on top of the legend it is explaining.
 */
function MetricPieBlock({ segments, title, size = 56, isDark, flip = false }: {
  segments: Seg[]; title: string; size?: number; isDark: boolean; flip?: boolean;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const total = segments.reduce((s, x) => s + x.value, 0);

  const R = 40, CX = 50, CY = 50;
  let start = -Math.PI / 2;

  const slices = segments
    .map(seg => {
      const frac = total > 0 ? seg.value / total : 0;
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

  const rows: HoverRow[] = segments.map(s => ({
    label: s.label,
    color: s.color,
    value: `${s.value} day${s.value === 1 ? '' : 's'} · ${total ? Math.round((s.value / total) * 100) : 0}%`,
    dim: hoverKey !== null && hoverKey !== s.key,
  }));
  const hovered = segments.find(s => s.key === hoverKey);

  return (
    <div className="relative flex flex-col items-center gap-1.5"
      onMouseLeave={() => setHoverKey(null)}>

      {total === 0 ? (
        <div style={{ width: size, height: size }} className="shrink-0" />
      ) : (
        <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0">
          {slices.map(s => (
            <path key={s.key} d={s.path} fill={s.color}
              opacity={hoverKey === null || hoverKey === s.key ? 0.85 : 0.35}
              style={{ cursor: 'pointer', transition: 'opacity 120ms' }}
              onMouseEnter={() => setHoverKey(s.key)} />
          ))}
        </svg>
      )}

      <div className="flex flex-col gap-0.5 items-start">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1"
            style={{
              cursor: 'pointer',
              opacity: hoverKey === null || hoverKey === s.key ? 1 : 0.45,
              transition: 'opacity 120ms',
            }}
            onMouseEnter={() => setHoverKey(s.key)}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="text-[9px] leading-tight text-stone-500 dark:text-zinc-400">
              {s.label} {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>

      {hoverKey !== null && (
        <ChartHoverCard
          title={title}
          rows={rows}
          note={hovered?.hint}
          isDark={isDark}
          flip={flip}
          placement="above"
        />
      )}
    </div>
  );
}

/**
 * A text label whose explanation opens as the shared hover card instead of the
 * browser's own tooltip — so the thresholds read the same wherever they appear,
 * and appear at once rather than after the browser's delay.
 */
function HintLabel({ text, rows, isDark, className, flip = false, placement = 'below' }: {
  text: string;
  rows: HoverRow[];
  isDark: boolean;
  className?: string;
  flip?: boolean;
  placement?: 'below' | 'above';
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block cursor-help"
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span className={className}>{text}</span>
      {open && (
        <ChartHoverCard rows={rows} isDark={isDark} flip={flip} placement={placement} />
      )}
    </span>
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

  // The thresholds as hover rows rather than one packed string, so the heading,
  // the strip label and the pie all open the same card in the same shape.
  const durRows: HoverRow[] = [
    { label: 'Good', value: C.duration.good, color: BAND_COLORS.good },
    { label: 'OK',   value: C.duration.ok,   color: BAND_COLORS.ok },
    { label: 'Bad',  value: C.duration.bad,  color: BAND_COLORS.bad },
  ];
  const bedRows: HoverRow[] = [
    { label: 'Good', value: C.bedtime.good, color: BAND_COLORS.good },
    { label: 'OK',   value: C.bedtime.ok,   color: BAND_COLORS.ok },
    { label: 'Bad',  value: C.bedtime.bad,  color: BAND_COLORS.bad },
  ];
  const wakeRows: HoverRow[] = [
    { label: '<5',  value: C.waketime.early, color: WAKE_COLORS.early },
    { label: '5~7', value: C.waketime.mid,   color: WAKE_COLORS.mid },
    { label: '>7',  value: C.waketime.late,  color: WAKE_COLORS.late },
    { value: 'no judgement, just information', dim: true },
  ];
  const qRows: HoverRow[] = [
    { label: 'Good', value: C.quality.good, color: BAND_COLORS.good },
    { label: 'OK',   value: C.quality.ok,   color: BAND_COLORS.ok },
    { label: 'Poor', value: C.quality.bad,  color: BAND_COLORS.bad },
    { value: 'daily mean shown as a percentage: all poor 0%, all good 100%', dim: true },
  ];

  const columns = [
    {
      title: 'Duration',
      figure: data.duration.avgSeconds != null ? formatDuration(data.duration.avgSeconds) : '—',
      segments: durSegs,
      rows: durRows,
    },
    { title: 'Bedtime', figure: data.bedtime.avgClock ?? '—',  segments: bedSegs,  rows: bedRows },
    { title: 'Wake',    figure: data.waketime.avgClock ?? '—', segments: wakeSegs, rows: wakeRows },
    {
      title: 'Quality',
      figure: data.quality.percent != null ? `${data.quality.percent}%` : '—',
      segments: qSegs,
      rows: qRows,
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

  // Strip tooltips. A strip cell used to say only its date; now it carries the
  // day's actual figure and which band that put it in, so the strip can be read
  // without opening anything. A day with no record, or with no band for this
  // metric, still gets a card — it says so rather than showing nothing.
  const BAND_NAMES: Record<string, string> = {
    good: 'Good', ok: 'OK', bad: 'Bad', early: '<5', mid: '5~7', late: '>7',
  };

  type MetricKey = 'duration' | 'bedtime' | 'waketime' | 'quality';

  const tooltipFor = (metric: MetricKey) => (date: string) => {
    const d = byDate.get(date);
    if (!d) return { rows: [{ value: 'No sleep recorded', dim: true }] };

    let band: string | null = null;
    let value = '—';
    let color: string | undefined;
    let note: string | undefined;

    if (metric === 'duration') {
      band = d.dBand;
      value = d.durationSec != null ? formatDuration(d.durationSec) : '—';
      color = band ? BAND_COLORS[band as TriBand] : undefined;
      note = band ? C.duration[band as TriBand] : undefined;
    } else if (metric === 'bedtime') {
      band = d.bBand;
      // Local clock, not the continuous-axis offset: a 01:00 bedtime reads
      // 01:00 here, the same value the record holds.
      value = d.bedMin != null ? minsToClockStr(d.bedMin) : '—';
      color = band ? BAND_COLORS[band as TriBand] : undefined;
      note = band ? C.bedtime[band as TriBand] : undefined;
    } else if (metric === 'waketime') {
      band = d.wBand;
      value = d.wakeMin != null ? minsToClockStr(d.wakeMin) : '—';
      color = band ? WAKE_COLORS[band as WakeBand] : undefined;
      note = band ? C.waketime[band as WakeBand] : undefined;
    } else {
      band = d.qBand;
      value = d.qualityScore != null
        ? `${Math.round(((d.qualityScore + 1) / 2) * 100)}%`
        : '—';
      color = band ? BAND_COLORS[band as TriBand] : undefined;
      note = band ? C.quality[band as TriBand] : undefined;
    }

    const rows: HoverRow[] = [{ label: band ? BAND_NAMES[band] : '—', value, color }];
    if (!band) {
      rows.push({ value: 'no band on this day', dim: true });
    }
    return { title: date, rows, note };
  };

  const strips: {
    label: string;
    fill: (d: string) => string | null;
    rows: HoverRow[];
    tip: (d: string) => { title?: string; rows: HoverRow[]; note?: string };
  }[] = [
    { label: 'Duration', fill: fillFor('dBand'), rows: durRows,  tip: tooltipFor('duration') },
    { label: 'Bedtime',  fill: fillFor('bBand'), rows: bedRows,  tip: tooltipFor('bedtime') },
    { label: 'Wake',     fill: fillWake,         rows: wakeRows, tip: tooltipFor('waketime') },
    { label: 'Quality',  fill: fillFor('qBand'), rows: qRows,    tip: tooltipFor('quality') },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Upper: four columns — title, figure, pie, legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-4">
        {columns.map((col, ci) => (
          <div key={col.title} className="flex flex-col items-center gap-1.5 min-w-0">
            {/* The right-hand columns flip their cards inward — WidgetCard is
                overflow-hidden, so one hanging off column 4 would be clipped. */}
            <HintLabel
              text={col.title}
              rows={col.rows}
              isDark={isDark}
              flip={ci >= 2}
              className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide"
            />
            <span className="text-sm font-mono font-medium text-stone-800 dark:text-zinc-100">
              {col.figure}
            </span>
            <MetricPieBlock segments={col.segments} title={col.title} isDark={isDark} flip={ci >= 2} />
          </div>
        ))}
      </div>

      {/* Lower: four aligned day strips */}
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 items-center">
        {strips.map(s => (
          <React.Fragment key={s.label}>
            <HintLabel
              text={s.label}
              rows={s.rows}
              isDark={isDark}
              placement="above"
              className="text-[9px] text-stone-400 dark:text-zinc-500"
            />
            <HeatStrip
              rangeStart={data.rangeStart}
              rangeEnd={data.rangeEnd}
              isDark={isDark}
              fillFor={s.fill}
              height={14}
              tooltipFor={s.tip}
              // Above, not below: the strips sit at the foot of the card and
              // WidgetCard is overflow-hidden, so a card hanging down from the
              // Quality row would be cut off.
              tooltipPlacement="above"
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
