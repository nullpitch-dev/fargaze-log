// src/app/insights/_widgets/WeightWidget.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { WidgetProps, WidgetViewMode } from '../_lib/types';
import { useIsDark } from '../_lib/hooks';
import { buildParams } from '../_lib/date-helpers';
import { CssVerticalBoxPlotChart } from '../_components/charts/css-chart-components';
import { WidgetCard, ViewToggle } from '../_components/WidgetCard';
import { SEG, SEG_ORDER, segColor, soloColor } from './weight-colors';
import {
  WeightTrendView, DEFAULT_BUCKETS,
  type WeightTrend, type WeightGranularity, type WeightUnit,
} from './WeightTrendView';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Composition {
  weight: number;
  muscleMass: number | null;
  bodyFat: number | null;
  other: number | null;
  bodyFatPercent: number | null;
  musclePct: number | null;
  fatPct: number | null;
  otherPct: number | null;
  hasComposition: boolean;
}

// ── One composition row ───────────────────────────────────────────────────────

const BAR_H = 36;

// Measured in real pixels rather than as a share of the bar, because the same
// percentage is a different number of pixels at different card widths.
// Same ResizeObserver approach as Treemap.tsx.
const MIN_KG_PX  = 30;   // room for "14.7"
const MIN_PCT_PX = 40;   // room for "(21.2%)" underneath it

function CompositionRow({
  label, sublabel, sublabel2, comp, max, isDark,
}: {
  label: string;
  sublabel?: string;
  sublabel2?: string;
  comp: Composition;
  max: number;
  isDark: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setTrackPx(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Bar length is scaled against the shared max, so the two rows compare.
  const widthPct = max > 0 ? (comp.weight / max) * 100 : 0;
  const barPx = trackPx * (widthPct / 100);

  const parts = comp.hasComposition
    ? SEG_ORDER.map(k => ({
        key: k,
        kg:  (k === 'muscle' ? comp.muscleMass : k === 'fat' ? comp.bodyFat : comp.other) as number,
        pct: (k === 'muscle' ? comp.musclePct  : k === 'fat' ? comp.fatPct  : comp.otherPct) as number,
      }))
    : [];

  return (
    <div className="flex items-center gap-2">
      <div className="w-11 shrink-0 flex flex-col">
        <span className="text-[9px] uppercase tracking-wide text-stone-500 dark:text-zinc-400 leading-tight">
          {label}
        </span>
				{sublabel && (
          <span className="text-[9px] text-stone-400 dark:text-zinc-500 leading-tight">
            {sublabel}
          </span>
        )}
        {sublabel2 && (
          <span className="text-[9px] text-stone-400 dark:text-zinc-500 leading-tight">
            {sublabel2}
          </span>
        )}
      </div>

      <div ref={trackRef} className="flex-1 min-w-0">
        <div className="flex rounded overflow-hidden" style={{ height: BAR_H, width: `${widthPct}%` }}>
          {comp.hasComposition ? (
            parts.map(p => {
              const segPx = barPx * (p.pct / 100);
              return (
                <div key={p.key}
                  className="flex flex-col items-center justify-center gap-0.5 overflow-hidden"
                  style={{ width: `${p.pct}%`, background: segColor(p.key, isDark) }}
                  title={`${SEG[p.key].name} ${p.kg.toFixed(1)} kg (${p.pct.toFixed(1)}%)`}>
                  {segPx >= MIN_KG_PX && (
                    <span className="text-[11px] font-mono font-medium text-white leading-none">
                      {p.kg.toFixed(1)}
                    </span>
                  )}
                  {segPx >= MIN_PCT_PX && (
                    <span className="text-[10px] font-mono text-white/80 leading-none">
                      ({p.pct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="w-full flex items-center justify-center" style={{ background: soloColor(isDark) }}>
              <span className="text-[10px] font-mono font-medium text-white leading-none">
                weight only
              </span>
            </div>
          )}
        </div>
      </div>

      <span className="w-12 shrink-0 text-right text-[11px] font-mono font-medium text-stone-800 dark:text-zinc-100">
        {comp.weight.toFixed(1)}
      </span>
    </div>
  );
}

// ── Delta strip (sits between the two bars) ───────────────────────────────────

function DeltaStrip({ dWeight, dFatPct }: { dWeight?: number | null; dFatPct?: number | null }) {
  const item = (v: number | null | undefined, label: string, suffix: string) => {
    if (v == null) return null;
    if (v === 0) {
      return (
        <span className="text-[10px] font-mono text-stone-400 dark:text-zinc-500">
          {label} —
        </span>
      );
    }
    const up = v > 0;
    return (
      <span className={`text-[10px] font-mono ${up ? 'text-rose-500 dark:text-rose-400' : 'text-blue-500 dark:text-teal-400'}`}>
        {label} {up ? '▲' : '▼'}{Math.abs(v).toFixed(1)}{suffix}
      </span>
    );
  };

  if (dWeight == null && dFatPct == null) return null;

  return (
    <div className="flex items-center gap-3 pl-[52px]">
      {item(dWeight, 'weight', ' kg')}
      {item(dFatPct, 'body fat', ' %p')}
    </div>
  );
}

// ── Date label ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// ── Summary view ──────────────────────────────────────────────────────────────

function SummaryView({ data, isDark }: { data: any; isDark: boolean }) {
  const box    = data?.weightBox ?? null;
  const avg    = data?.avgComposition ?? null;
  const latest = data?.latest ?? null;
  const delta  = data?.deltaFromAvg ?? null;
  const max    = data?.compositionMax ?? 0;

  const showLegend = avg?.hasComposition || latest?.hasComposition;

	if (!box) {
    return <p className="text-xs text-stone-400 dark:text-zinc-500 mt-4">No data</p>;
  }

  return (
    <div className="flex gap-3">
          {/* Left — distribution */}
          <div className="w-[25%] shrink-0 flex flex-col gap-1.5">
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              Weight (kg)
            </span>
            <CssVerticalBoxPlotChart
              buckets={[{
                label: '',
                min: box.min,
                max: box.max,
                avg: box.avg,
                p25: box.p25,
                p75: box.p75,
              }]}
              isDark={isDark}
              formatY={v => v.toFixed(1)}
              height={150}
            />
          </div>

          {/* Right — body composition */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
            <span className="text-[10px] text-stone-400 dark:text-zinc-500 uppercase tracking-wide">
              Body Composition
            </span>

            {avg && (
              <CompositionRow label="Average" comp={avg} max={max} isDark={isDark} />
            )}

            <DeltaStrip dWeight={delta?.weight} dFatPct={delta?.bodyFatPercent} />

            {latest && (
              <CompositionRow
                label="Latest"
								sublabel={shortDate(latest.date)}
                sublabel2={latest.date.slice(0, 4)}
                comp={latest}
                max={max}
                isDark={isDark}
              />
            )}

            {showLegend && (
							<div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1">
                {SEG_ORDER.map(k => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: segColor(k, isDark) }} />
                    <span className="text-[11px] text-stone-600 dark:text-zinc-300">
                      {SEG[k].name}
                    </span>
                  </div>
                ))}
              </div>
            )}
      </div>
    </div>
  );
}

// ── WeightWidget ──────────────────────────────────────────────────────────────

export function WeightWidget({ globalFilter }: WidgetProps) {
  const isDark = useIsDark();
  const [viewMode, setViewMode] = useState<WidgetViewMode>('summary');

  const [summaryData, setSummaryData] = useState<any>(null);
  const [trendData,   setTrendData]   = useState<WeightTrend | null>(null);

  const [granularity, setGranularity] = useState<WeightGranularity>('month');
  const [buckets,     setBuckets]     = useState<number>(DEFAULT_BUCKETS.month);
	const [unit,        setUnit]        = useState<WeightUnit>('weight');

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const trendLoadedRef = useRef(false);

  // Switching granularity must also reset the count: 24 is a valid month
  // choice but not a valid day choice, and a stale value leaves no button
  // looking selected.
  function changeGranularity(g: WeightGranularity) {
    setGranularity(g);
    setBuckets(DEFAULT_BUCKETS[g]);
  }

  useEffect(() => {
    if (viewMode !== 'summary') return;
    setLoading(true);
    setError(null);
    const url = `/api/insights/stats?${buildParams(
      { metric: 'weight.summary', mode: 'summary' },
      globalFilter,
    )}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setSummaryData(d.summary ?? null); setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode]);

  // Trend deliberately ignores the global period — granularity × buckets IS
  // the span. crossActivities still rides along via buildParams, so the two
  // views never disagree on which logs count. Extra params are appended
  // rather than passed through buildParams, which only carries the shared set.
  useEffect(() => {
    if (viewMode !== 'trend') return;
    if (!trendLoadedRef.current) setLoading(true);
    setError(null);
    const base = buildParams({ metric: 'weight.trend', mode: 'trend' }, globalFilter);
    const url  = `/api/insights/stats?${base}&granularity=${granularity}&buckets=${buckets}`;
    fetch(url)
      .then(r => r.json())
      .then(d => { setTrendData(d.trend ?? null); trendLoadedRef.current = true; setLoading(false); })
      .catch(() => { setError('Failed to load data.'); setLoading(false); });
  }, [globalFilter, viewMode, granularity, buckets]);

  return (
    <WidgetCard
      title="Weight"
      floor={1}
      loading={loading}
      error={error}
      action={<ViewToggle value={viewMode} onChange={setViewMode} />}
    >
      {viewMode === 'summary' ? (
        <SummaryView data={summaryData} isDark={isDark} />
      ) : (
        <WeightTrendView
          data={trendData}
          isDark={isDark}
          granularity={granularity}
          onGranularityChange={changeGranularity}
          buckets={buckets}
          onBucketsChange={setBuckets}
          unit={unit}
          onUnitChange={setUnit}
        />
      )}
    </WidgetCard>
  );
}
