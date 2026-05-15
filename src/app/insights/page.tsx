'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type TimeMode = 'month' | 'week' | 'day' | 'period';
type WidgetSize = 'sm' | 'md' | 'lg';
type WidgetFloor = 0 | 1 | 2 | 3 | 4;
type SleepMetric = 'duration' | 'bedtime' | 'waketime' | 'quality';
type WidgetViewMode = 'summary' | 'trend';

interface GlobalFilter {
  timeMode: TimeMode;
  timePeriod: string;
  dateFrom: string;
  dateTo: string;
  crossActivities: string[];
}

interface WidgetProps {
  globalFilter: GlobalFilter;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentWeekStr(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const wNum =
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wNum).padStart(2, '0')}`;
}

function defaultPeriodFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

function defaultTimePeriod(mode: TimeMode): string {
  if (mode === 'month') return currentMonthStr();
  if (mode === 'week') return currentWeekStr();
  if (mode === 'day') return todayStr();
  return '';
}

function periodLabel(mode: TimeMode, period: string): string {
  if (mode === 'month') {
    const [y, m] = period.split('-');
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${names[parseInt(m) - 1]} ${y}`;
  }
  if (mode === 'week') return period.replace('-W', ' W');
  if (mode === 'day') return period;
  return '';
}

// ── URL param builder ─────────────────────────────────────────────────────────

function buildParams(base: Record<string, string>, gf: GlobalFilter): string {
  const p = new URLSearchParams(base);
  p.set('timeMode', gf.timeMode);
  if (gf.timeMode === 'period') {
    p.set('dateFrom', gf.dateFrom);
    p.set('dateTo', gf.dateTo);
  } else {
    p.set('timePeriod', gf.timePeriod);
  }
  if (gf.crossActivities.length > 0) p.set('crossActivities', gf.crossActivities.join(','));
  return p.toString();
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatQualityScore(score: number): string {
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}

// ── Floor badge ───────────────────────────────────────────────────────────────

const FLOOR_META: Record<WidgetFloor, { label: string; color: string }> = {
  0: { label: 'Facts',        color: 'text-stone-400 dark:text-zinc-500' },
  1: { label: 'Descriptive',  color: 'text-blue-500 dark:text-blue-400' },
  2: { label: 'Diagnostic',   color: 'text-violet-500 dark:text-violet-400' },
  3: { label: 'Predictive',   color: 'text-amber-500 dark:text-amber-400' },
  4: { label: 'Prescriptive', color: 'text-rose-500 dark:text-rose-400' },
};

function FloorBadge({ floor }: { floor: WidgetFloor }) {
  const { label, color } = FLOOR_META[floor];
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider ${color}`}>{label}</span>
  );
}

// ── Widget shell ──────────────────────────────────────────────────────────────

function WidgetCard({
  title, floor, loading, error, children, action,
}: {
  title: string;
  floor: WidgetFloor;
  loading: boolean;
  error?: string | null;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-sm flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 dark:border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex flex-col gap-0.5">
          <FloorBadge floor={floor} />
          <p className="text-sm font-medium text-stone-900 dark:text-zinc-50">{title}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex-1 px-4 py-4 min-h-[200px] flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-stone-400 dark:text-zinc-500">Loading…</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── Summary / Trend toggle ────────────────────────────────────────────────────

function ViewToggle({ value, onChange, disabled }: {
  value: WidgetViewMode;
  onChange: (v: WidgetViewMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700 text-[11px] ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {(['summary', 'trend'] as WidgetViewMode[]).map(v => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-2.5 py-1 capitalize transition-colors ${
            value === v
              ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
              : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
          }`}>
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Quality pie chart ─────────────────────────────────────────────────────────

function QualityPie({ counts }: { counts: { '좋음': number; '보통': number; '나쁨': number } }) {
  const total = counts['좋음'] + counts['보통'] + counts['나쁨'];
  if (total === 0) return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;

  const COLORS = { '좋음': '#3b82f6', '보통': '#a8a29e', '나쁨': '#f87171' };
  const LABELS = { '좋음': 'Good', '보통': 'OK', '나쁨': 'Poor' };

  const R = 40; const CX = 50; const CY = 50;
  let startAngle = -Math.PI / 2;
  const slices = (['좋음', '보통', '나쁨'] as const)
    .map(k => {
      const frac = counts[k] / total;
      const angle = frac * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = CX + R * Math.cos(startAngle);
      const y1 = CY + R * Math.sin(startAngle);
      const x2 = CX + R * Math.cos(endAngle);
      const y2 = CY + R * Math.sin(endAngle);
      const largeArc = angle > Math.PI ? 1 : 0;
      const path = frac === 1
        ? `M ${CX} ${CY} m -${R} 0 a ${R} ${R} 0 1 1 ${2 * R} 0 a ${R} ${R} 0 1 1 -${2 * R} 0`
        : `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      startAngle = endAngle;
      return { key: k, path, color: COLORS[k], frac, count: counts[k] };
    })
    .filter(s => s.frac > 0);

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

// ── Trend bar chart (SVG-based) ───────────────────────────────────────────────

// ── Y-axis config per metric ──────────────────────────────────────────────────

interface YAxisConfig {
  min: number;       // in the same unit as getValue()
  max: number;
  baseline: number | null;  // horizontal reference line (null = none)
  yLabels: { value: number; label: string }[];
}

function getYAxisConfig(metric: SleepMetric, validValues: number[]): YAxisConfig {
  if (metric === 'duration') {
    const dataMin = Math.min(...validValues);
    const dataMax = Math.max(...validValues);
    const min = Math.max(0, dataMin - 3600);  // min − 1h, floor at 0
    const max = dataMax + 3600;               // max + 1h
    // Y labels: min, midpoint, max — formatted as hours
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
    // Range: 21:00 (1260 min) to 01:00+24h (1500 min), baseline 23:00 (1380 min)
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
    // Range: 04:00 (240 min) to 08:00 (480 min), baseline 06:00 (360 min)
    return {
      min: 240, max: 480, baseline: 360,
      yLabels: [
        { value: 480, label: '08:00' },
        { value: 360, label: '06:00' },
        { value: 240, label: '04:00' },
      ],
    };
  }
  // quality: −1 to +1, baseline 0
  return {
    min: -1, max: 1, baseline: 0,
    yLabels: [
      { value: 1,  label: 'Good' },
      { value: 0,  label: 'OK' },
      { value: -1, label: 'Poor' },
    ],
  };
}

// ── TrendChart ────────────────────────────────────────────────────────────────

function TrendChart({ data, metric, bucketsBack }: {
  data: { label: string; summary: any }[];
  metric: SleepMetric;
  bucketsBack: number;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Reset active dot when data or metric changes
  useEffect(() => { setActiveIdx(null); }, [data, metric]);

  if (data.length === 0) return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;

  // Always show labels when ≤6 buckets; hover/tap only for 12
  const alwaysShowLabels = bucketsBack <= 6;

  function getValue(summary: any): number | null {
    if (!summary) return null;
    if (metric === 'duration') return summary.duration?.avgSeconds ?? null;
    if (metric === 'bedtime') {
      const c = summary.bedtime?.avgClock;
      if (!c) return null;
      const [h, m] = c.split(':').map(Number);
      let mins = h * 60 + m;
      if (mins < 6 * 60) mins += 1440; // apply midnight threshold
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

  function formatValue(v: number): string {
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

  function formatLabel(label: string): string {
    if (/^\d{4}-\d{2}$/.test(label)) {
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(label.split('-')[1]) - 1];
    }
    if (/W\d+/.test(label)) return `W${label.split('-W')[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label.split('-')[2];
    return label;
  }

  const values = data.map(d => getValue(d.summary));
  const validValues = values.filter((v): v is number => v !== null);
  if (validValues.length === 0) return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;

  // SVG layout — wide viewBox, scales to full widget width via width="100%"
  const W = 500;
  const H = 180;
  const PAD = { t: 20, r: 16, b: 28, l: 44 }; // left pad for Y-axis labels
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const yAxis = getYAxisConfig(metric, validValues);
  const { min: yMin, max: yMax, baseline, yLabels } = yAxis;
  const yRange = yMax - yMin || 1;

  function yForVal(v: number): number {
    return PAD.t + plotH - ((v - yMin) / yRange) * plotH;
  }

  function xForIdx(i: number): number {
    if (data.length === 1) return PAD.l + plotW / 2;
    return PAD.l + (i / (data.length - 1)) * plotW;
  }

  // Smooth cubic bezier spline through valid points
  const pointsWithIdx = values
    .map((v, i) => (v !== null ? { x: xForIdx(i), y: yForVal(v) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);

  function smoothLinePath(pts: { x: number; y: number }[]): string | null {
    if (pts.length < 2) return null;
    if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] ?? pts[i + 1];
      const tension = 0.2;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  }

  const linePath = smoothLinePath(pointsWithIdx);

  // Dot color — darker blue and red
  function dotColor(v: number): string {
    if (metric === 'quality') {
      if (v > 0) return '#1d4ed8';  // blue-700
      if (v < 0) return '#b91c1c';  // red-700
      return '#78716c';             // stone-500
    }
    return '#1d4ed8'; // blue-700
  }

  const baselineY = baseline !== null ? yForVal(baseline) : null;

  return (
    <div className="flex flex-col gap-1 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>

        {/* Y-axis labels + grid lines */}
        {yLabels.map(({ value, label }) => {
          const y = yForVal(value);
          const isBaseline = baseline !== null && value === baseline;
          return (
            <g key={label}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke={isBaseline ? '#78716c' : '#e7e5e4'}
                strokeWidth={isBaseline ? 1 : 0.5}
                strokeDasharray={isBaseline ? '4,4' : undefined} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#a8a29e">
                {label}
              </text>
            </g>
          );
        })}

        {/* Line */}
        {linePath && (
          <path d={linePath} fill="none" stroke="#1d4ed8" strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
        )}

        {/* Dots + labels + X-axis labels */}
        {data.map((d, i) => {
          const v = values[i];
          const cx = xForIdx(i);
          const isActive = activeIdx === i;
          const showLabel = v !== null && (alwaysShowLabels || isActive);
          const labelText = v !== null ? formatValue(v) : null;
          const dotY = v !== null ? yForVal(v) : null;
          const labelY = dotY !== null
            ? (dotY - PAD.t < 18 ? dotY + 16 : dotY - 8)
            : null;

          return (
            <g key={d.label}
              style={{ cursor: 'pointer' }}
              onClick={() => setActiveIdx(isActive ? null : i)}
              onMouseEnter={() => !alwaysShowLabels && setActiveIdx(i)}
              onMouseLeave={() => !alwaysShowLabels && setActiveIdx(null)}
            >
              {/* Invisible hit target */}
              <rect x={cx - 14} y={PAD.t} width={28} height={plotH}
                fill="transparent" />

              {v !== null && dotY !== null ? (
                <>
                  <circle cx={cx} cy={dotY} r={isActive ? 5 : 3.5}
                    fill={dotColor(v)} opacity={isActive ? 1 : 0.9} />
                  {showLabel && labelY !== null && (
                    <text x={cx} y={labelY} textAnchor="middle" fontSize={10}
                      fill="#44403c" fontWeight={isActive ? '700' : '500'}>
                      {labelText}
                    </text>
                  )}
                </>
              ) : (
                <line x1={cx - 4} y1={PAD.t + plotH} x2={cx + 4} y2={PAD.t + plotH}
                  stroke="#d6d3d1" strokeWidth={1.5} />
              )}

              {/* X-axis label */}
              <text x={cx} y={H - 4} textAnchor="middle" fontSize={10}
                fill={i === data.length - 1 ? '#57534e' : '#a8a29e'}>
                {formatLabel(d.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Sleep widget ──────────────────────────────────────────────────────────────

const SLEEP_METRIC_LABELS: Record<SleepMetric, string> = {
  duration: 'Duration',
  bedtime: 'Bedtime',
  waketime: 'Wake',
  quality: 'Quality',
};

function SleepWidget({ globalFilter }: WidgetProps) {
  const [viewMode, setViewMode] = useState<WidgetViewMode>('summary');
  const [trendMetric, setTrendMetric] = useState<SleepMetric>('duration');
  const [bucketsBack, setBucketsBack] = useState(6);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendData, setTrendData] = useState<{ label: string; summary: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPeriodMode = globalFilter.timeMode === 'period';

  useEffect(() => {
    if (isPeriodMode) setViewMode('summary');
  }, [isPeriodMode]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const url = viewMode === 'summary'
      ? `/api/insights/stats?${buildParams({ metric: 'sleep.all', mode: 'summary' }, globalFilter)}`
      : `/api/insights/stats?${buildParams({ metric: 'sleep.all', mode: 'trend', bucketsBack: String(bucketsBack) }, globalFilter)}`;

    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (viewMode === 'summary') setSummaryData(d.summary ?? null);
        else setTrendData(d.data ?? []);
        setLoading(false);
      })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, bucketsBack]);

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
                {summaryData.quality?.avgScore !== null && summaryData.quality?.avgScore !== undefined && (
                  <div className="flex flex-col items-center">
                    <span className={`text-lg font-mono font-semibold ${
                      summaryData.quality.avgScore > 0 ? 'text-blue-500'
                      : summaryData.quality.avgScore < 0 ? 'text-red-400'
                      : 'text-stone-400 dark:text-zinc-500'
                    }`}>
                      {formatQualityScore(summaryData.quality.avgScore)}
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-zinc-500">avg score</span>
                  </div>
                )}
              </div>
            </div>
            <p className="text-[10px] text-stone-400 dark:text-zinc-500">{summaryData.count} entries</p>
          </div>
        ) : (
          <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>
        )
      ) : (
        <div className="flex flex-col gap-3 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {(Object.keys(SLEEP_METRIC_LABELS) as SleepMetric[]).map(m => (
                <button key={m} onClick={() => setTrendMetric(m)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    trendMetric === m
                      ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}>
                  {SLEEP_METRIC_LABELS[m]}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {[3, 6, 12].map(n => (
                <button key={n} onClick={() => setBucketsBack(n)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    bucketsBack === n
                      ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                      : 'bg-stone-100 dark:bg-zinc-800 text-stone-500 dark:text-zinc-400 hover:bg-stone-200 dark:hover:bg-zinc-700'
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <TrendChart data={trendData} metric={trendMetric} bucketsBack={bucketsBack} />
        </div>
      )}
    </WidgetCard>
  );
}

// ── Top People widget ─────────────────────────────────────────────────────────

function TopPeopleWidget({ globalFilter }: WidgetProps) {
  const [data, setData] = useState<{ key: string; value: number; meta: any }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/insights/stats?${buildParams({ metric: 'people.frequency', limit: '10' }, globalFilter)}`)
      .then(r => r.json())
      .then(d => { setData(d.data ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter]);

  const max = data.length > 0 ? data[0].value : 1;

  return (
    <WidgetCard title="Top People" floor={1} loading={loading} error={error}>
      {data.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>
      ) : (
        <div className="flex flex-col gap-1.5 flex-1">
          {data.map((d, i) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 dark:text-zinc-500 w-4 text-right shrink-0">{i + 1}</span>
              <span className="text-xs text-stone-700 dark:text-zinc-200 w-16 shrink-0 truncate">{d.key}</span>
              <div className="flex-1 bg-stone-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-stone-400 dark:bg-zinc-400 rounded-full transition-all"
                  style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
              <span className="text-xs font-mono text-stone-500 dark:text-zinc-400 shrink-0 w-8 text-right">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// ── Global Filter Bar ─────────────────────────────────────────────────────────

const TIME_MODE_LABELS: Record<TimeMode, string> = {
  month: 'Month', week: 'Week', day: 'Day', period: 'Period',
};

function GlobalFilterBar({ filter, onApply, crossActivityOptions }: {
  filter: GlobalFilter;
  onApply: (f: GlobalFilter) => void;
  crossActivityOptions: string[];
}) {
  const [local, setLocal] = useState<GlobalFilter>(filter);
  const [caOpen, setCaOpen] = useState(false);
  const caRef = useRef<HTMLDivElement>(null);

  // Stay in sync when parent updates (e.g. after cross-activities load)
  useEffect(() => { setLocal(filter); }, [filter]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (caRef.current && !caRef.current.contains(e.target as Node)) setCaOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function setTimeMode(mode: TimeMode) {
    setLocal(prev => ({
      ...prev,
      timeMode: mode,
      timePeriod: defaultTimePeriod(mode),
      dateFrom: prev.dateFrom || defaultPeriodFrom(),
      dateTo: prev.dateTo || todayStr(),
    }));
  }

  const allSelected = local.crossActivities.length === crossActivityOptions.length;
  const noneSelected = local.crossActivities.length === 0;

  function toggleCA(v: string) {
    setLocal(prev => ({
      ...prev,
      crossActivities: prev.crossActivities.includes(v)
        ? prev.crossActivities.filter(x => x !== v)
        : [...prev.crossActivities, v],
    }));
  }

  const inputType = local.timeMode === 'month' ? 'month'
    : local.timeMode === 'week' ? 'week'
    : 'date';

  return (
    <div className="mb-6 p-4 bg-white dark:bg-zinc-900 border border-stone-200 dark:border-zinc-700 rounded-xl shadow-sm">
      <div className="flex flex-wrap gap-4 items-end">

        {/* Time mode selector */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">View by</label>
          <div className="flex rounded overflow-hidden border border-stone-200 dark:border-zinc-700">
            {(Object.keys(TIME_MODE_LABELS) as TimeMode[]).map(mode => (
              <button key={mode} onClick={() => setTimeMode(mode)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  local.timeMode === mode
                    ? 'bg-stone-800 dark:bg-zinc-200 text-white dark:text-zinc-900 font-medium'
                    : 'bg-white dark:bg-zinc-900 text-stone-500 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800'
                }`}>
                {TIME_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>

        {/* Time picker */}
        {local.timeMode === 'period' ? (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Date range</label>
            <div className="flex gap-2 items-center">
              <input type="date" value={local.dateFrom}
                onChange={e => setLocal(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-50 focus:outline-none shadow-sm" />
              <span className="text-stone-400 text-xs">—</span>
              <input type="date" value={local.dateTo}
                onChange={e => setLocal(prev => ({ ...prev, dateTo: e.target.value }))}
                className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-50 focus:outline-none shadow-sm" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              {TIME_MODE_LABELS[local.timeMode]}
            </label>
            <input type={inputType} value={local.timePeriod}
              onChange={e => setLocal(prev => ({ ...prev, timePeriod: e.target.value }))}
              className="bg-white dark:bg-zinc-900 border border-stone-300 dark:border-zinc-600 rounded px-3 py-1.5 text-xs text-stone-900 dark:text-zinc-50 focus:outline-none shadow-sm" />
          </div>
        )}

        {/* Cross-activity */}
        {crossActivityOptions.length > 0 && (
          <div className="flex flex-col gap-1 relative" ref={caRef}>
            <label className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">Activity type</label>
            <button onClick={() => setCaOpen(v => !v)}
              className={`flex items-center gap-2 bg-white dark:bg-zinc-900 border rounded px-3 py-1.5 text-xs shadow-sm focus:outline-none transition-colors ${
                !allSelected
                  ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-stone-300 dark:border-zinc-600 text-stone-900 dark:text-zinc-50'
              }`}>
              {allSelected ? 'All' : noneSelected ? 'None' : `${local.crossActivities.length} selected`}
              <span className="text-stone-400 dark:text-zinc-500">▾</span>
            </button>
            {caOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-800 border border-stone-200 dark:border-zinc-600 rounded-lg shadow-xl min-w-[180px] py-1">
                <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer border-b border-stone-100 dark:border-zinc-700">
                  <input type="checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = !allSelected && !noneSelected; }}
                    onChange={() => setLocal(prev => ({
                      ...prev,
                      crossActivities: allSelected ? [] : [...crossActivityOptions],
                    }))}
                    className="accent-blue-500" />
                  <span className="text-xs font-medium text-stone-700 dark:text-zinc-200">
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </span>
                </label>
                {crossActivityOptions.map(opt => (
                  <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-stone-50 dark:hover:bg-zinc-700 cursor-pointer">
                    <input type="checkbox" checked={local.crossActivities.includes(opt)}
                      onChange={() => toggleCA(opt)} className="accent-blue-500" />
                    <span className={`text-xs ${local.crossActivities.includes(opt) ? 'text-stone-700 dark:text-zinc-200' : 'text-stone-400 dark:text-zinc-500 line-through'}`}>
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Apply */}
        <button onClick={() => onApply(local)}
          className="px-4 py-1.5 bg-stone-800 dark:bg-zinc-700 text-white rounded text-xs font-medium hover:bg-stone-900 dark:hover:bg-zinc-600 transition-colors">
          Apply
        </button>
      </div>

    </div>
  );
}

// ── Widget registry ───────────────────────────────────────────────────────────

interface WidgetConfig {
  id: string;
  size: WidgetSize;
  component: React.ComponentType<WidgetProps>;
}

const SIZE_COLS: Record<WidgetSize, string> = {
  sm: 'col-span-1',
  md: 'col-span-1',
  lg: 'col-span-1 md:col-span-2 lg:col-span-3',
};

const WIDGETS: WidgetConfig[] = [
  { id: 'sleep',      size: 'md', component: SleepWidget },
  { id: 'top-people', size: 'md', component: TopPeopleWidget },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [crossActivityOptions, setCrossActivityOptions] = useState<string[]>([]);
  const [appliedFilter, setAppliedFilter] = useState<GlobalFilter>({
    timeMode: 'month',
    timePeriod: currentMonthStr(),
    dateFrom: defaultPeriodFrom(),
    dateTo: todayStr(),
    crossActivities: [],
  });

  useEffect(() => {
    fetch('/api/cross-activities')
      .then(r => r.json())
      .then((values: string[]) => {
        setCrossActivityOptions(values);
        setAppliedFilter(prev => ({ ...prev, crossActivities: values }));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col flex-1 px-4 py-6">
      <div className="mb-6">
        <h1 className="text-base font-semibold text-stone-900 dark:text-zinc-50">Insights</h1>
        <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Data-driven life analytics</p>
      </div>

      <GlobalFilterBar
        filter={appliedFilter}
        onApply={setAppliedFilter}
        crossActivityOptions={crossActivityOptions}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {WIDGETS.map(({ id, size, component: Widget }) => (
          <div key={id} className={SIZE_COLS[size]}>
            <Widget globalFilter={appliedFilter} />
          </div>
        ))}
      </div>
    </div>
  );
}
