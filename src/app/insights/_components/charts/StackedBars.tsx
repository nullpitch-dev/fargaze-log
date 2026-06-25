'use client';
// src/app/insights/_components/charts/StackedBars.tsx
// CSS stacked bars over time buckets. mode='percent' → 100% share; mode='absolute'
// → real counts with a numeric y-axis. Caller supplies series (bottom→top order)
// and per-bucket values; "others" rollup is the caller's job.

import React, { useState } from 'react';
import { formatBucketLabels } from './css-chart-components';

export interface StackedSeries { key: string; label: string; color: string; }
export interface StackedBucket { label: string; values: Record<string, number>; }

const CHART_H = 160;
const Y_W = 36;

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

export function StackedBars({
  buckets, series, isDark, mode = 'percent', formatY,
}: {
  buckets: StackedBucket[];
  series: StackedSeries[];
  isDark: boolean;
  mode?: 'percent' | 'absolute';
  formatY?: (v: number) => string;
}) {
	const [hoveredKey, setHoveredKey] = useState<string | null>(null);   // category-wide highlight (tiles + legend)
  const [tip, setTip] = useState<{ b: number; s: string } | null>(null); // tooltip on a specific tile

  if (!buckets.length || !series.length) {
    return <p className="text-xs" style={{ color: isDark ? '#a1a1aa' : '#a8a29e' }}>No data</p>;
  }

  const totals   = buckets.map(b => series.reduce((s, ser) => s + (b.values[ser.key] ?? 0), 0));
  const maxTotal = Math.max(...totals, 1);
  const axisMax  = mode === 'percent' ? 100 : niceMax(maxTotal);

  const lc = isDark ? '#a1a1aa' : '#a8a29e';
  const gc = isDark ? '#3f3f46' : '#e7e5e4';
  const vc = isDark ? '#f4f4f5' : '#292524';
  const fmt = formatY ?? ((v: number) => (mode === 'percent' ? `${Math.round(v)}%` : String(Math.round(v))));

  const ticks = mode === 'percent'
    ? [0, 25, 50, 75, 100]
    : [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(axisMax * f));
	const lastIdx = buckets.length - 1;
  const xLabels = formatBucketLabels(buckets.map(b => b.label));

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* y-axis */}
        <div className="relative shrink-0" style={{ width: Y_W, height: CHART_H }}>
          {ticks.map(t => (
            <span key={t} className="absolute text-[11px] leading-none"
              style={{ right: 3, top: `${(1 - t / axisMax) * 100}%`, transform: 'translateY(-50%)', color: lc }}>
              {fmt(t)}
            </span>
          ))}
        </div>

        {/* bars */}
        <div className="relative flex-1 flex" style={{ height: CHART_H }}>
          {ticks.map(t => (
            <div key={t} className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${(1 - t / axisMax) * 100}%`, height: 1, background: gc, opacity: 0.6 }} />
          ))}
          {buckets.map((b, bi) => {
            const denom = mode === 'percent' ? (totals[bi] || 1) : axisMax;
            let acc = 0;
            return (
              <div key={b.label} className="relative flex-1" style={{ margin: '0 3px' }}>
                {series.map(ser => {
                  const v = b.values[ser.key] ?? 0;
                  if (v <= 0) return null;
                  const hPct   = (v / denom) * 100;
                  const bottom = acc;
                  acc += hPct;
									const isHi    = hoveredKey === ser.key;
                  const showTip = tip?.b === bi && tip?.s === ser.key;
                  const op = hoveredKey ? (isHi ? 1 : 0.35) : 0.82;
                  return (
                    <div key={ser.key}
                      onMouseEnter={() => { setHoveredKey(ser.key); setTip({ b: bi, s: ser.key }); }}
                      onMouseLeave={() => { setHoveredKey(null); setTip(null); }}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: `${bottom}%`,
                        height: `${hPct}%`, background: ser.color, opacity: op,
                        transition: 'opacity 150ms ease', cursor: 'pointer' }}>
                      {showTip && (
                        <div className="absolute left-1/2 z-10 whitespace-nowrap rounded px-1 py-0.5 text-[11px]"
                          style={{ top: 0, transform: 'translate(-50%, -110%)',
                            background: isDark ? '#27272a' : '#fff', border: `1px solid ${gc}`, color: vc }}>
                          {ser.label}: {mode === 'percent' ? `${Math.round(hPct)}%` : v}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* x labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_W }}>
        <div className="flex flex-1">
					{buckets.map((b, i) => (
            <div key={i} className="flex-1 text-center text-[11px] leading-none"
              style={{ color: i === lastIdx ? vc : lc, fontWeight: i === lastIdx ? 600 : 400 }}>
              {xLabels[i]}
            </div>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[12px]" style={{ color: lc }}>
				{[...series].reverse().map(ser => {
          const isActive = hoveredKey === ser.key;
          return (
            <span key={ser.key}
              onMouseEnter={() => setHoveredKey(ser.key)}
              onMouseLeave={() => setHoveredKey(null)}
              className="inline-flex items-center gap-1 cursor-pointer"
              style={{ color: isActive ? ser.color : lc,
                fontWeight: isActive ? 600 : 400,
                opacity: hoveredKey && !isActive ? 0.4 : 1,
                transition: 'opacity 150ms ease' }}>
              <i style={{ background: ser.color, width: 10, height: 10, borderRadius: 2, display: 'inline-block',
                outline: isActive ? `2px solid ${ser.color}` : 'none', outlineOffset: 1 }} />
              {ser.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
