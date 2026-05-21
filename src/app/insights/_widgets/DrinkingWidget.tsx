'use client';
// src/app/insights/_widgets/DrinkingWidget.tsx

import { useEffect, useState } from 'react';
import { WidgetCard } from '../_components/WidgetCard';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { formatDuration } from '../_lib/format';
import type { WidgetProps } from '../_lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type SummaryTab = 'stats' | 'top10';

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
      <span className="w-20 shrink-0 text-stone-500 dark:text-zinc-400 truncate">{label}</span>
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

// ── Drinks Box Plot ───────────────────────────────────────────────────────────

function DrinksBoxPlot({ drinks, isDark }: { drinks: DrinksStats; isDark: boolean }) {
  const barColor   = isDark ? '#2dd4bf' : '#1d4ed8';
  const gridColor  = isDark ? '#3f3f46' : '#e7e5e4';
  const labelColor = isDark ? '#a1a1aa' : '#a8a29e';
  const avgColor   = isDark ? '#f97316' : '#ea580c';

  const W = 260, H = 72;
  const padL = 32, padR = 32;
  const chartW = W - padL - padR;
  const midY   = H / 2;
  const boxH   = 18;

  const { min, max, avg, p25, p75 } = drinks;
  const range = max - min || 1;
  const toX = (v: number) => padL + ((v - min) / range) * chartW;

  const xMin = toX(min);
  const xMax = toX(max);
  const x25  = toX(p25);
  const x75  = toX(p75);
  const xAvg = toX(avg);

  // All labels above the box; stagger avg up slightly to avoid overlap with min/max
  const labelY = midY - boxH / 2 - 5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      {/* Baseline */}
      <line x1={padL} y1={midY} x2={padL + chartW} y2={midY}
        stroke={gridColor} strokeWidth={1} />

      {/* Whiskers */}
      <line x1={xMin} y1={midY - boxH / 2} x2={xMin} y2={midY + boxH / 2}
        stroke={barColor} strokeWidth={1.5} />
      <line x1={xMin} y1={midY} x2={x25} y2={midY}
        stroke={barColor} strokeWidth={1.5} />
      <line x1={x75} y1={midY} x2={xMax} y2={midY}
        stroke={barColor} strokeWidth={1.5} />
      <line x1={xMax} y1={midY - boxH / 2} x2={xMax} y2={midY + boxH / 2}
        stroke={barColor} strokeWidth={1.5} />

      {/* IQR box */}
      <rect x={x25} y={midY - boxH / 2} width={Math.max(x75 - x25, 1)} height={boxH}
        fill={barColor} opacity={0.2} rx={2} />
      <rect x={x25} y={midY - boxH / 2} width={Math.max(x75 - x25, 1)} height={boxH}
        fill="none" stroke={barColor} strokeWidth={1.5} rx={2} />

      {/* Avg diamond */}
      <polygon
        points={`${xAvg},${midY - 7} ${xAvg + 6},${midY} ${xAvg},${midY + 7} ${xAvg - 6},${midY}`}
        fill={avgColor}
      />

      {/* Min label — always bottom-left of whisker */}
      <text x={xMin} y={midY + boxH / 2 + 13} textAnchor="middle"
        fontSize={11} fill={labelColor}>{min}</text>

      {/* Max label — always bottom-right of whisker */}
      <text x={xMax} y={midY + boxH / 2 + 13} textAnchor="middle"
        fontSize={11} fill={labelColor}>{max}</text>

      {/* Avg label — above the diamond */}
      <text x={xAvg} y={labelY} textAnchor="middle"
        fontSize={11} fill={avgColor} fontWeight="600">{avg}</text>

      {/* P25 / P75 — above box, suppressed if too close to whiskers */}
      {x25 - xMin > 26 && (
        <text x={x25} y={labelY} textAnchor="middle"
          fontSize={11} fill={labelColor}>P25 {p25}</text>
      )}
      {xMax - x75 > 26 && (
        <text x={x75} y={labelY} textAnchor="middle"
          fontSize={11} fill={labelColor}>P75 {p75}</text>
      )}
    </svg>
  );
}

// ── Rest Histogram ────────────────────────────────────────────────────────────

function RestHistogram({
  histogram,
  avgRestDays,
  isDark,
}: {
  histogram: Record<string, number>;
  avgRestDays: number;
  isDark: boolean;
}) {
  const barColor   = isDark ? '#2dd4bf' : '#1d4ed8';
  const gridColor  = isDark ? '#3f3f46' : '#e7e5e4';
  const labelColor = isDark ? '#a1a1aa' : '#a8a29e';
  const valueColor = isDark ? '#f4f4f5' : '#292524';

  const counts   = BUCKET_ORDER.map(k => histogram[k] ?? 0);
  const maxCount = Math.max(...counts, 1);

  const W = 300, H = 100;
  const padT = 20, padB = 20;
  const chartH   = H - padT - padB;
  const barCount = BUCKET_ORDER.length;
  const barGap   = 4;
  const barW     = (W - barGap * (barCount - 1)) / barCount;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      <line x1={0} y1={padT} x2={W} y2={padT} stroke={gridColor} strokeWidth={1} />
      {counts.map((count, i) => {
        const barH  = maxCount > 0 ? (count / maxCount) * chartH : 0;
        const x     = i * (barW + barGap);
        const y     = padT + chartH - barH;
        const label = BUCKET_ORDER[i];
        return (
          <g key={label}>
            <rect
              x={x} y={y} width={barW} height={Math.max(barH, 0)}
              fill={barColor} rx={3} opacity={count === 0 ? 0.15 : 0.85}
            />
            {count > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle"
                fontSize={11} fill={valueColor} fontWeight="500">
                {count}
              </text>
            )}
            <text x={x + barW / 2} y={H - 2} textAnchor="middle"
              fontSize={11} fill={labelColor}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
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

      {/* ── Row 1: Drinking Days | Total Drinks | Drinks Per Day ── */}
      <div className="flex items-end gap-5">
        <div className="flex flex-col gap-0.5 shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
              {data.drinkingDays}
            </span>
            <span className="text-sm text-stone-400 dark:text-zinc-500 tabular-nums">
              / {data.daysInPeriod}d ({drinkingPct}%)
            </span>
          </div>
          <span className="text-[10px] text-stone-400 dark:text-zinc-500">Drinking Days</span>
        </div>

        {data.drinks && (
          <>
            <div className="flex flex-col gap-0.5 shrink-0">
              <span className="text-2xl font-medium text-stone-800 dark:text-zinc-100 leading-none tabular-nums">
                {data.drinks.total}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-stone-400 dark:text-zinc-500">Total Drinks</span>
                <span className="text-[9px] text-stone-300 dark:text-zinc-600">(50 ml soju eq.)</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <DrinksBoxPlot drinks={data.drinks} isDark={isDark} />
              <span className="text-[10px] text-stone-400 dark:text-zinc-500">
                Drinks Per Day ({data.drinks.n} drinking days)
              </span>
            </div>
          </>
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

      {/* ── Row 3: Consecutive Rest Days (70%) | Session Time (30%) ── */}
      <div className="flex gap-4">

        {/* Left 70%: histogram */}
        <div className="flex flex-col gap-1" style={{ flex: '6.5' }}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              Consecutive Rest Days
            </span>
            <span className="text-[10px] text-stone-400 dark:text-zinc-500">
              (Avg: {data.avgRestDays}d)
            </span>
          </div>
          <RestHistogram histogram={data.histogram} avgRestDays={data.avgRestDays} isDark={isDark} />
        </div>

        {/* Right 30%: Session Time */}
        <div className="flex flex-col gap-2" style={{ flex: '3.5' }}>
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

// ── Main widget ───────────────────────────────────────────────────────────────

export function DrinkingWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [summaryTab, setSummaryTab]   = useState<SummaryTab>('stats');
  const [summaryData, setSummaryData] = useState<DrinkingSummary | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'drinking.summary', mode: 'summary' },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setSummaryData(d.summary ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter]);

  return (
    <WidgetCard title="Drinking" floor={1} loading={loading} error={error}>
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
    </WidgetCard>
  );
}
