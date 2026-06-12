'use client';
// src/app/insights/_components/charts/css-chart-components.tsx
// CSS-only chart components (no SVG except for line paths) for the Drinking Trend view.

import React, { useState } from 'react';
import { formatDuration } from '../../_lib/format';

// ── Shared helpers ────────────────────────────────────────────────────────────

export function minsToClockStr(m: number, allowOverflow = false): string {
  if (!allowOverflow) m = ((m % 1440) + 1440) % 1440;
  const h   = Math.floor(m / 60);
  const min = Math.round(m % 60);
  if (allowOverflow && h >= 24) {
    return `+${String(h - 24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function gridLineColor(isDark: boolean) { return isDark ? '#3f3f46' : '#e7e5e4'; }
function labelColor(isDark: boolean)    { return isDark ? '#a1a1aa' : '#a8a29e'; }
function valueColor(isDark: boolean)    { return isDark ? '#f4f4f5' : '#292524'; }
function lineColor(isDark: boolean)     { return isDark ? '#2dd4bf' : '#1d4ed8'; }

// ── Catmull-Rom spline (tension=0.2) ─────────────────────────────────────────
// Generates an SVG path string from percentage-space points {x, y} in 0-100 viewBox.

function smoothPath(pts: { x: number; y: number }[]): string | null {
  if (pts.length < 2) return null;
  if (pts.length === 2) return `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y}`;
  const t = 0.2;
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? pts[i + 1];
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// ── Y-axis builder ────────────────────────────────────────────────────────────
// Returns ~4 evenly spaced ticks plus one pinned at rawMax.

function buildYTicks(yMin: number, yMax: number, count = 4): number[] {
  const step  = Math.max(1, Math.ceil((yMax - yMin) / (count - 1)));
  const ticks = Array.from({ length: count }, (_, i) => Math.round(yMin + i * step));
  // Ensure max is represented
  const last = ticks[ticks.length - 1];
  if (last < yMax) ticks.push(Math.ceil(yMax));
  // Deduplicate
  return [...new Set(ticks)].filter(v => v >= yMin);
}

const CHART_H    = 140;
const Y_LABEL_W  = 36;
const Y_LABEL_WR = 32; // right y-axis width

// ── CssTrendChart ─────────────────────────────────────────────────────────────

export interface CssTrendSeries {
  values: (number | null)[];
  color:  string;
  label?: string;
}

interface CssTrendChartProps {
  series:            CssTrendSeries[];
  labels:            string[];
  formatY:           (v: number) => string;
  isDark:            boolean;
  alwaysShowLabels?: boolean;
  yPadPct?:          number;
}

export function CssTrendChart({
  series, labels, formatY, isDark, alwaysShowLabels = false, yPadPct = 10,
}: CssTrendChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const allVals = series.flatMap(s => s.values).filter((v): v is number => v !== null);
  if (!allVals.length) return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;

  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad    = Math.max(1, (rawMax - rawMin) * (yPadPct / 100));
  const yMin   = rawMin - pad;
  const yMax   = rawMax + pad;
  const yRange = yMax - yMin || 1;
  const yTicks = buildYTicks(yMin, rawMax);

  const n = labels.length;
  const displayLabels = compressWeekLabels(labels);
  function xPct(i: number) { return n <= 1 ? 50 : (i / (n - 1)) * 100; }
  function yPct(v: number) { return (1 - (v - yMin) / yRange) * 100; }

  const gc = gridLineColor(isDark);
  const lc = labelColor(isDark);
  const vc = valueColor(isDark);

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis labels */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height: CHART_H }}>
          {yTicks.map(tick => {
            const t = yPct(tick);
            if (t < 3 || t > 97) return null;
            return (
              <span key={tick} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: `${t}%`, transform: 'translateY(-50%)', color: lc }}>
                {formatY(tick)}
              </span>
            );
          })}
        </div>

        {/* Plot area */}
        <div className="relative flex-1" style={{ height: CHART_H }}>
          {/* Grid lines */}
          {yTicks.map(tick => (
            <div key={tick} className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${yPct(tick)}%`, height: 1, background: gc, opacity: 0.7 }} />
          ))}

          {/* Spline lines */}
          <svg className="absolute inset-0 w-full h-full overflow-visible"
            preserveAspectRatio="none" viewBox="0 0 100 100">
            {series.map((s, si) => {
              const pts = s.values
                .map((v, i) => v !== null ? { x: xPct(i), y: yPct(v) } : null)
                .filter((p): p is { x: number; y: number } => p !== null);
              const d = smoothPath(pts);
              if (!d) return null;
              return (
                <path key={si} d={d} fill="none" stroke={s.color}
                  strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" opacity={0.85} />
              );
            })}
          </svg>

          {/* Dots + hover zones */}
          {labels.map((lbl, i) => (
            <div key={lbl} className="absolute top-0 bottom-0 flex items-stretch"
              style={{ left: `${xPct(i)}%`, width: 28, transform: 'translateX(-50%)', cursor: 'pointer', zIndex: 2 }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onClick={() => setActiveIdx(activeIdx === i ? null : i)}>              {series.map((s, si) => {
                const v = s.values[i];
                if (v === null) return null;
                const top        = `${yPct(v)}%`;
                const isActive   = activeIdx === i;
                const showLabel  = alwaysShowLabels || isActive;
                const labelBelow = yPct(v) < 18;
                return (
                  <React.Fragment key={si}>
                    <div className="absolute rounded-full"
                      style={{ left: '50%', top, transform: 'translate(-50%, -50%)',
                        width: isActive ? 9 : 7, height: isActive ? 9 : 7,
                        background: s.color, opacity: isActive ? 1 : 0.9, zIndex: 3 }} />
                    {showLabel && (
                      <div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                        style={{ left: '50%', top,
                          transform: labelBelow ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                          color: series.length > 1 ? s.color : vc, zIndex: 4, pointerEvents: 'none' }}>
                        {formatY(v)}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="relative flex-1" style={{ height: 16 }}>
          {displayLabels.map((lbl, i) => (
            <span key={i} className="absolute text-[10px] leading-none"
              style={{ left: `${xPct(i)}%`, transform: 'translateX(-50%)',
                color: i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Legend (multi-series only) */}
      {series.length > 1 && (
        <div className="flex gap-3 flex-wrap" style={{ paddingLeft: Y_LABEL_W }}>
          {series.map((s, i) => s.label ? (
            <span key={i} className="flex items-center gap-1 text-[10px]" style={{ color: lc }}>
              <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: s.color }} />
              {s.label}
            </span>
          ) : null)}
        </div>
      )}
    </div>
  );
}

// ── CssStackedBarChart ────────────────────────────────────────────────────────

export interface CssStackedBucket {
  label: string;
  data:  Record<string, number>;
}

interface CssStackedBarChartProps {
  buckets:  CssStackedBucket[];
  colorMap: Record<string, string>;
  isDark:   boolean;
}

const BAR_H = 120;

export function CssStackedBarChart({ buckets, colorMap, isDark }: CssStackedBarChartProps) {
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  // Sort categories by total across all buckets descending (largest at bottom)
  const catTotals: Record<string, number> = {};
  for (const b of buckets) {
    for (const [k, v] of Object.entries(b.data)) {
      if (k.trim()) catTotals[k] = (catTotals[k] ?? 0) + v;
    }
  }
  const cats = Object.keys(catTotals)
    .filter(c => c.trim())
    .sort((a, b) => catTotals[b] - catTotals[a]); // descending → bottom-first in flex-col-reverse

  const gc = gridLineColor(isDark);
  const lc = labelColor(isDark);
  const ng = isDark ? '#71717a' : '#a8a29e';
  const n  = buckets.length;
  const compressedLabels = compressWeekLabels(buckets.map(b => b.label));

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis */}
        <div className="relative shrink-0" style={{ width: Y_LABEL_W, height: BAR_H }}>
          {[0, 25, 50, 75, 100].map(pct => (
            <span key={pct} className="absolute text-[10px] leading-none"
              style={{ right: 4, bottom: `${pct}%`, transform: 'translateY(50%)', color: lc }}>
              {pct}%
            </span>
          ))}
        </div>

        {/* Bars */}
        <div className="relative flex-1 flex items-end" style={{ height: BAR_H }}>
          {[25, 50, 75, 100].map(pct => (
            <div key={pct} className="absolute inset-x-0 pointer-events-none"
              style={{ bottom: `${pct}%`, height: 1, background: gc, opacity: 0.7 }} />
          ))}
          <div className="absolute inset-0 flex">
            {buckets.map((b, bi) => {
              const total = Object.values(b.data).reduce((s, v) => s + v, 0) || 1;
              return (
                <div key={bi} className="flex-1 flex flex-col-reverse h-full px-0.5">
                  {cats.map(cat => {
                    const pct    = ((b.data[cat] ?? 0) / total) * 100;
                    if (pct === 0) return null;
                    const isHov  = hoveredCat === cat;
                    return (
                      <div key={cat}
                        style={{ height: `${pct}%`, background: colorMap[cat] ?? ng,
                          opacity: hoveredCat !== null && !isHov ? 0.35 : isHov ? 1 : 0.82,
                          transition: 'opacity 0.15s' }}
                        onMouseEnter={() => setHoveredCat(cat)}
                        onMouseLeave={() => setHoveredCat(null)} />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="flex flex-1">
          {compressedLabels.map((lbl, i) => (
            <div key={i} className="flex-1 text-center text-[10px] leading-none"
              style={{ color: i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {lbl}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1" style={{ paddingLeft: Y_LABEL_W }}>
        {cats.map(cat => {
          const isActive = hoveredCat === cat;
          return (
            <span key={cat}
              className="flex items-center gap-1 text-[11px] transition-opacity cursor-default"
              style={{ color: isActive ? (colorMap[cat] ?? ng) : (isDark ? '#a1a1aa' : '#78716c'),
                fontWeight: isActive ? 600 : 400,
                opacity: hoveredCat !== null && !isActive ? 0.4 : 1 }}
              onMouseEnter={() => setHoveredCat(cat)}
              onMouseLeave={() => setHoveredCat(null)}>
              <span style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, display: 'inline-block',
                background: colorMap[cat] ?? ng,
                outline: isActive ? `2px solid ${colorMap[cat] ?? ng}` : 'none', outlineOffset: 1 }} />
              {cat}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── CssVerticalBoxPlotChart ───────────────────────────────────────────────────

export interface BoxPlotBucket {
  label: string;
  min:   number;
  max:   number;
  avg:   number;
  p25:   number;
  p75:   number;
}

interface CssVerticalBoxPlotChartProps {
  buckets:  BoxPlotBucket[];
  isDark:   boolean;
  yPadPct?: number;
	formatY?: (v: number) => string;
	height?:	number;
}

const VBOX_H = 140;

export function CssVerticalBoxPlotChart({ buckets, isDark, yPadPct = 10, formatY = String, height = VBOX_H }: CssVerticalBoxPlotChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const allVals = buckets.flatMap(b => [b.min, b.max]);
  if (!allVals.length) return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;

  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad    = Math.max(0.1, (rawMax - rawMin) * (yPadPct / 100));
  const yMin   = rawMin - pad;
  const yMax   = rawMax + pad;
  const yRange = yMax - yMin || 1;
  const yTicks = buildYTicks(yMin, rawMax);

  function yPct(v: number) { return (1 - (v - yMin) / yRange) * 100; }

  const bc   = lineColor(isDark);
  const avgC = isDark ? '#f97316' : '#ea580c';
  const gc   = gridLineColor(isDark);
  const lc   = labelColor(isDark);
  const n    = buckets.length;
  const compressedLabels = compressWeekLabels(buckets.map(b => b.label));

  // Legend labels for rightmost bucket (no numbers, just names)
  const LEGEND_LABELS: { key: keyof BoxPlotBucket; name: string; color: (b: BoxPlotBucket) => string }[] = [
    { key: 'max', name: 'Max', color: () => lc },
    { key: 'p75', name: 'P75', color: () => lc },
    { key: 'avg', name: 'Avg', color: () => avgC },
    { key: 'p25', name: 'P25', color: () => lc },
    { key: 'min', name: 'Min', color: () => lc },
  ];

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height: height }}>
          {yTicks.map(tick => {
            const t = yPct(tick);
            if (t < 3 || t > 97) return null;
            return (
              <span key={tick} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: `${t}%`, transform: 'translateY(-50%)', color: lc }}>
								{formatY(tick)}
              </span>
            );
          })}
        </div>

        {/* Plot */}
        <div className="relative flex-1" style={{ height: height }}>
          {yTicks.map(tick => (
            <div key={tick} className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${yPct(tick)}%`, height: 1, background: gc, opacity: 0.7 }} />
          ))}

          <div className="absolute inset-0 flex">
            {buckets.map((b, i) => {
              const isActive  = activeIdx === i;
              const isLast    = i === n - 1;

              const topWhiskerPct    = yPct(b.max);
              const bottomWhiskerPct = yPct(b.min);
              const boxTopPct        = yPct(b.p75);
              const boxH             = yPct(b.p25) - boxTopPct;
              const avgTopPct        = yPct(b.avg);
              const whiskerH         = bottomWhiskerPct - topWhiskerPct;

              return (
                <div key={b.label} className="flex-1 relative flex justify-center"
                  style={{ height: height, cursor: 'pointer' }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}
                  onClick={() => setActiveIdx(isActive ? null : i)}>

                  {/* Whisker line */}
                  <div className="absolute" style={{ left: '50%', top: `${topWhiskerPct}%`,
                    height: `${Math.max(whiskerH, 0)}%`, width: 1.5,
                    transform: 'translateX(-50%)', background: bc }} />

                  {/* Min cap */}
                  <div className="absolute" style={{ left: '50%', top: `${bottomWhiskerPct}%`,
                    width: 10, height: 2, transform: 'translate(-50%, -50%)', background: bc }} />

                  {/* Max cap */}
                  <div className="absolute" style={{ left: '50%', top: `${topWhiskerPct}%`,
                    width: 10, height: 2, transform: 'translate(-50%, -50%)', background: bc }} />

                  {/* IQR box fill */}
                  <div className="absolute rounded-sm" style={{ left: '20%', right: '20%',
                    top: `${boxTopPct}%`, height: `${Math.max(boxH, 2)}%`,
                    background: bc, opacity: 0.18 }} />

                  {/* IQR box border */}
                  <div className="absolute rounded-sm" style={{ left: '20%', right: '20%',
                    top: `${boxTopPct}%`, height: `${Math.max(boxH, 2)}%`,
                    border: `1.5px solid ${bc}` }} />

                  {/* Avg diamond */}
                  <div className="absolute" style={{ left: '50%', top: `${avgTopPct}%`,
                    width: 7, height: 7, transform: 'translate(-50%, -50%) rotate(45deg)',
                    background: avgC }} />

                  {/* Hover tooltip: min / avg / max */}
                  {isActive && (
                    <div className="absolute z-10 rounded px-1.5 py-1 text-[10px] leading-snug whitespace-nowrap flex flex-col gap-0.5"
                      style={{ left: '50%', top: `${avgTopPct}%`,
                        transform: 'translate(-50%, -110%)',
                        background: isDark ? '#27272a' : '#fff',
                        border: `1px solid ${isDark ? '#3f3f46' : '#e7e5e4'}`,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
											<span style={{ color: lc }}>Max <span style={{ color: valueColor(isDark), fontWeight: 600 }}>{formatY(b.max)}</span></span>
                      <span style={{ color: avgC }}>Avg <span style={{ fontWeight: 600 }}>{formatY(b.avg)}</span></span>
                      <span style={{ color: lc }}>Min <span style={{ color: valueColor(isDark), fontWeight: 600 }}>{formatY(b.min)}</span></span>
                    </div>
                  )}

                  {/* Rightmost: legend labels only (no numbers) */}
                  {isLast && !isActive && LEGEND_LABELS.map(({ key, name, color }) => {
                    const pct = yPct(b[key] as number);
                    const isAvg = key === 'avg';
                    // Offset labels to avoid overlap
                    const offsetMap: Record<string, string> = {
                      max: 'translateY(-13px)',
                      p75: 'translateY(-11px)',
                      avg: 'translateY(-11px)',
                      p25: 'translateY(2px)',
                      min: 'translateY(3px)',
                    };
                    return (
                      <div key={name} className="absolute text-[9px] leading-none whitespace-nowrap pointer-events-none"
                        style={{ left: '62%', top: `${pct}%`,
                          transform: offsetMap[key as string],
                          color: color(b), fontWeight: isAvg ? 600 : 400 }}>
                        {name}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="flex flex-1">
          {compressedLabels.map((lbl, i) => (
            <div key={i} className="flex-1 text-center text-[10px] leading-none"
              style={{ color: i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {lbl}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── CssDualLineChart (Session Time) ──────────────────────────────────────────
// From / To lines sharing Y-axis in HH:MM, with filled area + arrows + duration labels.

interface SessionBucket {
  label:              string;
  avgStartMins:       number | null;
  avgEndMins:         number | null;
  avgDurationSeconds: number | null;
}

interface CssDualLineChartProps {
  buckets: SessionBucket[];
  isDark:  boolean;
}

const DUAL_H          = 160;
const FROM_COLOR_L    = '#1d4ed8';
const FROM_COLOR_D    = '#2dd4bf';
const TO_COLOR_L      = '#7c3aed';
const TO_COLOR_D      = '#f97316';

export function CssDualLineChart({ buckets, isDark }: CssDualLineChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const fromColor = isDark ? FROM_COLOR_D : FROM_COLOR_L;
  const toColor   = isDark ? TO_COLOR_D   : TO_COLOR_L;

  const allMins = buckets.flatMap(b => [b.avgStartMins, b.avgEndMins])
    .filter((v): v is number => v !== null);
  if (!allMins.length) return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;

  const rawMin = Math.min(...allMins);
  const rawMax = Math.max(...allMins);
  const pad    = Math.max(10, (rawMax - rawMin) * 0.10);
  const yMin   = rawMin - pad;
  const yMax   = rawMax + pad;
  const yRange = yMax - yMin || 1;
  const yTicks = buildYTicks(yMin, rawMax);

  function yPct(v: number) { return (1 - (v - yMin) / yRange) * 100; }
  function xPct(i: number) { return buckets.length <= 1 ? 50 : (i / (buckets.length - 1)) * 100; }

  const n  = buckets.length;
  const compressedLabels = compressWeekLabels(buckets.map(b => b.label));
  const gc = gridLineColor(isDark);
  const lc = labelColor(isDark);
  const vc = valueColor(isDark);
  const arrowColor = isDark ? '#71717a' : '#a8a29e';
  const durColor   = isDark ? '#a1a1aa' : '#57534e'; // darker than before

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis (time) */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height: DUAL_H }}>
          {yTicks.map(tick => {
            const t = yPct(tick);
            if (t < 3 || t > 97) return null;
            return (
              <span key={tick} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: `${t}%`, transform: 'translateY(-50%)', color: lc }}>
                {minsToClockStr(tick, tick >= 1440)}
              </span>
            );
          })}
        </div>

        {/* Plot */}
        <div className="relative flex-1" style={{ height: DUAL_H }}>
          {/* Grid lines */}
          {yTicks.map(tick => (
            <div key={tick} className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${yPct(tick)}%`, height: 1, background: gc, opacity: 0.7 }} />
          ))}

          {/* SVG overlay */}
          <svg className="absolute inset-0 w-full h-full overflow-visible"
            preserveAspectRatio="none" viewBox="0 0 100 100">

            {/* Fill area between From and To */}
            {(() => {
              const fromPts = buckets.map((b, i) =>
                b.avgStartMins !== null ? { x: xPct(i), y: yPct(b.avgStartMins) } : null
              ).filter((p): p is { x: number; y: number } => p !== null);
              const toPts = buckets.map((b, i) =>
                b.avgEndMins !== null ? { x: xPct(i), y: yPct(b.avgEndMins) } : null
              ).filter((p): p is { x: number; y: number } => p !== null);
              if (fromPts.length < 2 || toPts.length < 2) return null;
              const top = fromPts.map(p => `${p.x},${p.y}`).join(' ');
              const bot = [...toPts].reverse().map(p => `${p.x},${p.y}`).join(' ');
              return <polygon points={`${top} ${bot}`} fill={fromColor} fillOpacity={0.07} />;
            })()}

            {/* From spline */}
            {(() => {
              const pts = buckets.map((b, i) =>
                b.avgStartMins !== null ? { x: xPct(i), y: yPct(b.avgStartMins) } : null
              ).filter((p): p is { x: number; y: number } => p !== null);
              const d = smoothPath(pts);
              return d ? <path d={d} fill="none" stroke={fromColor}
                strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity={0.85} /> : null;
            })()}

            {/* To spline */}
            {(() => {
              const pts = buckets.map((b, i) =>
                b.avgEndMins !== null ? { x: xPct(i), y: yPct(b.avgEndMins) } : null
              ).filter((p): p is { x: number; y: number } => p !== null);
              const d = smoothPath(pts);
              return d ? <path d={d} fill="none" stroke={toColor}
                strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity={0.85} /> : null;
            })()}

            {/* Vertical arrows + duration labels */}
            {buckets.map((b, i) => {
              if (b.avgStartMins === null || b.avgEndMins === null) return null;
              const x   = xPct(i);
              const y1  = yPct(b.avgStartMins);
              const y2  = yPct(b.avgEndMins);
              const mid = (y1 + y2) / 2;
              const isActive  = activeIdx === i;
              const showDur   = isActive || i === n - 1;
              return (
                <g key={i} style={{ pointerEvents: 'none' }}>
                  <line x1={x} y1={y1 + 1.5} x2={x} y2={y2 - 2.5}
                    stroke={arrowColor} strokeWidth="1" strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke" />
                  <polygon points={`${x - 1.2},${y2 - 3} ${x + 1.2},${y2 - 3} ${x},${y2 - 0.8}`}
                    fill={arrowColor} />
                  {showDur && b.avgDurationSeconds !== null && (
                    <text x={x + 2} y={mid} textAnchor="start" dominantBaseline="central"
                      fontSize={9} fontWeight={500}
                      fill={durColor} style={{ pointerEvents: 'none' }}>
                      {formatDuration(b.avgDurationSeconds)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover zones + dots */}
          {buckets.map((b, i) => (
            <div key={b.label} className="absolute top-0 bottom-0"
              style={{ left: `${xPct(i)}%`, width: 28, transform: 'translateX(-50%)',
                cursor: 'pointer', zIndex: 2 }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onClick={() => setActiveIdx(activeIdx === i ? null : i)}>

              {/* From dot */}
              {b.avgStartMins !== null && (() => {
                const top      = `${yPct(b.avgStartMins)}%`;
                const isActive = activeIdx === i;
                const below    = yPct(b.avgStartMins) < 18;
                return (
                  <>
                    <div className="absolute rounded-full"
                      style={{ left: '50%', top, transform: 'translate(-50%, -50%)',
                        width: isActive ? 9 : 7, height: isActive ? 9 : 7,
                        background: fromColor, opacity: isActive ? 1 : 0.9, zIndex: 3 }} />
                    {isActive && (
                      <div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                        style={{ left: '50%', top,
                          transform: below ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                          color: fromColor, zIndex: 4, pointerEvents: 'none' }}>
                        {minsToClockStr(b.avgStartMins)}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* To dot */}
              {b.avgEndMins !== null && (() => {
                const top      = `${yPct(b.avgEndMins)}%`;
                const isActive = activeIdx === i;
                const below    = yPct(b.avgEndMins) < 18;
                return (
                  <>
                    <div className="absolute rounded-full"
                      style={{ left: '50%', top, transform: 'translate(-50%, -50%)',
                        width: isActive ? 9 : 7, height: isActive ? 9 : 7,
                        background: toColor, opacity: isActive ? 1 : 0.9, zIndex: 3 }} />
                    {isActive && (
                      <div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                        style={{ left: '50%', top,
                          transform: below ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                          color: toColor, zIndex: 4, pointerEvents: 'none' }}>
                        {minsToClockStr(b.avgEndMins, b.avgEndMins >= 1440)}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="relative flex-1" style={{ height: 16 }}>
          {compressedLabels.map((lbl, i) => (
            <span key={i} className="absolute text-[10px] leading-none"
              style={{ left: `${xPct(i)}%`, transform: 'translateX(-50%)',
                color: i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3" style={{ paddingLeft: Y_LABEL_W }}>
        {[{ label: 'From', color: fromColor }, { label: 'To', color: toColor }].map(({ label, color }) => (
          <span key={label} className="flex items-center gap-1 text-[10px]" style={{ color: lc }}>
            <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Week label compression ────────────────────────────────────────────────────
// Input labels are like "25/03" (month) or "25W03" (week) from labelForPeriod().
// For week labels: show YYWww only for first bucket or year-change; rest show Www.

export function compressWeekLabels(labels: string[]): string[] {
  // Detect if these are week labels: match pattern YYWww or YYYYWww
  const isWeek = labels.every(l => /^\d{2,4}W\d{2}$/.test(l));
  if (!isWeek) return labels;

  let lastYear = '';
  return labels.map((lbl, i) => {
    // Extract year and week parts — e.g. "25W03" → year="25", week="W03"
    const match = lbl.match(/^(\d{2,4})(W\d{2})$/);
    if (!match) return lbl;
    const [, year, week] = match;
    const isFirst      = i === 0;
    const yearChanged  = year !== lastYear;
    lastYear = year;
    return (isFirst || yearChanged) ? lbl : week;
  });
}

// ── CssRestChart ──────────────────────────────────────────────────────────────
// Stacked bar chart (histogram buckets) with avg rest days spline overlay.
// Dual Y-axis: left = count (bars), right = avg days (line).
//
// All positions computed in pixels relative to REST_H so there is no
// coordinate-space mismatch between CSS bars and the SVG line.

const REST_BUCKET_ORDER = ['0d', '1d', '2–3d', '4–6d', '1–2w', '2–4w', '1m+'];

const REST_BUCKET_COLORS_LIGHT: Record<string, string> = {
  '0d':   '#9f1239',
  '1d':   '#c2410c',
  '2–3d': '#d97706',
  '4–6d': '#65a30d',
  '1–2w': '#0891b2',
  '2–4w': '#1d4ed8',
  '1m+':  '#1e3a8a',
};
const REST_BUCKET_COLORS_DARK: Record<string, string> = {
  '0d':   '#fb7185',
  '1d':   '#fb923c',
  '2–3d': '#fbbf24',
  '4–6d': '#a3e635',
  '1–2w': '#22d3ee',
  '2–4w': '#60a5fa',
  '1m+':  '#818cf8',
};

export interface RestBucket {
  label:       string;
  histogram:   Record<string, number>;
  avgRestDays: number;
}

interface CssRestChartProps {
  buckets: RestBucket[];
  isDark:  boolean;
}

const REST_H    = 160; // px — plot area height
const REST_W    = 500; // px — SVG viewBox width (arbitrary, scales via width=100%)
const BAR_GAP   = 0.2; // fraction of slot width used as gap

export function CssRestChart({ buckets, isDark }: CssRestChartProps) {
  const [activeIdx,  setActiveIdx]  = useState<number | null>(null);
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  const colorMap = isDark ? REST_BUCKET_COLORS_DARK : REST_BUCKET_COLORS_LIGHT;
  const lc       = labelColor(isDark);
  const gc       = gridLineColor(isDark);
  const avgColor = isDark ? '#c084fc' : '#7c3aed';
  const n        = buckets.length;

  // ── Left axis: bars scale 0 → maxTotal ───────────────────────────────────
  const totals   = buckets.map(b =>
    REST_BUCKET_ORDER.reduce((s, k) => s + (b.histogram[k] ?? 0), 0),
  );
  const maxTotal = Math.max(...totals, 1);
  const leftTicks = buildYTicks(0, maxTotal);

  // Shared vertical bounds — both axes map into [PLOT_T, PLOT_B]
  const PLOT_T = 12; // px from top — breathing room
  const PLOT_B = REST_H - 4; // px from top — baseline
  const PLOT_H = PLOT_B - PLOT_T;

  // px from top for a bar-axis value (0 → PLOT_B, maxTotal → PLOT_T)
  function barPx(v: number): number {
    return PLOT_B - (v / maxTotal) * PLOT_H;
  }

  // ── Right axis: avg line ──────────────────────────────────────────────────
  const avgVals   = buckets.map(b => b.avgRestDays);
  const rawAvgMax = Math.max(...avgVals, 0);
  const rawAvgMin = Math.min(...avgVals, 0);
  const avgPad    = Math.max(0.2, (rawAvgMax - rawAvgMin) * 0.12);
  const avgYMin   = Math.max(0, rawAvgMin - avgPad);
  const avgYMax   = rawAvgMax + avgPad;
  const avgYRange = avgYMax - avgYMin || 1;
  const rightTicks = buildYTicks(avgYMin, rawAvgMax).filter(t => t >= avgYMin && t <= avgYMax + avgPad);

  // px from top for avg-axis value — same PLOT_T..PLOT_B bounds as barPx
  function avgPx(v: number): number {
    const clamped = Math.max(avgYMin, Math.min(avgYMax, v));
    return PLOT_B - ((clamped - avgYMin) / avgYRange) * PLOT_H;
  }

  // ── X positions — bar slots ───────────────────────────────────────────────
  const slotW    = REST_W / n;                        // px per slot in SVG coords
  const barW     = slotW * (1 - BAR_GAP);
  function slotLeft(i: number)   { return i * slotW; }
  function slotCenter(i: number) { return i * slotW + slotW / 2; }

  // Avg spline points in SVG pixel space
  const avgPts = buckets.map((b, i) => ({
    x: slotCenter(i),
    y: avgPx(b.avgRestDays),
  }));
  const avgPath = smoothPath(avgPts);

  const compressedLabels = compressWeekLabels(buckets.map(b => b.label));

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">

        {/* Left Y-axis */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height: REST_H }}>
          {leftTicks.map(tick => {
            const topPx = barPx(tick);
            if (topPx < PLOT_T - 2 || topPx > PLOT_B) return null;
            return (
              <span key={tick} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: topPx + 'px', transform: 'translateY(-50%)', color: lc }}>
                {tick}
              </span>
            );
          })}
        </div>

        {/* Plot — single SVG covers everything: bars, grid, line, dots */}
        <div className="relative flex-1 overflow-hidden" style={{ height: REST_H }}>
          <svg
            width="100%" height={REST_H}
            viewBox={`0 0 ${REST_W} ${REST_H}`}
            preserveAspectRatio="none"
            style={{ display: 'block', overflow: 'hidden' }}
          >
            {/* Grid lines (left axis) */}
            {leftTicks.map(tick => {
              const y = barPx(tick);
              return (
                <line key={tick} x1={0} y1={y} x2={REST_W} y2={y}
                  stroke={gc} strokeWidth={0.5} opacity={0.9}
                  vectorEffect="non-scaling-stroke" />
              );
            })}

            {/* Stacked bars — pre-calculated to avoid mutation-in-map issues */}
            {buckets.map((b, bi) => {
              const cx = slotCenter(bi);
              const x  = cx - barW / 2;
              // Pre-calculate all segments first
              const segments: { cat: string; y: number; h: number }[] = [];
              let stackTop = PLOT_B;
              for (const cat of REST_BUCKET_ORDER) {
                const cnt = b.histogram[cat] ?? 0;
                if (cnt === 0) continue;
                const h      = (cnt / maxTotal) * PLOT_H;
                const newTop = Math.max(PLOT_T, stackTop - h);
                segments.push({ cat, y: newTop, h: stackTop - newTop });
                stackTop = newTop;
                if (stackTop <= PLOT_T) break;
              }
              return (
                <g key={bi} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setActiveIdx(bi)}
                  onMouseLeave={() => setActiveIdx(null)}>
                  {segments.map(({ cat, y, h }) => {
                    const isHov = hoveredCat === cat;
                    return (
                      <rect key={cat} x={x} y={y} width={barW} height={h}
                        fill={colorMap[cat]}
                        opacity={hoveredCat !== null && !isHov ? 0.35 : isHov ? 1 : 0.82}
                        onMouseEnter={e => { e.stopPropagation(); setHoveredCat(cat); }}
                        onMouseLeave={e => { e.stopPropagation(); setHoveredCat(null); }} />
                    );
                  })}
                </g>
              );
            })}

            {/* Avg spline */}
            {avgPath && (
              <path d={avgPath} fill="none" stroke={avgColor}
                strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity={0.9} />
            )}

            {/* Avg dots + labels */}
            {buckets.map((b, i) => {
              const cx       = slotCenter(i);
              const cy       = avgPx(b.avgRestDays);
              const isActive = activeIdx === i;
              const showLbl  = isActive || i === n - 1;
              const below    = cy < 18;
              return (
                <g key={i} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}>
                  <circle cx={cx} cy={cy} r={isActive ? 4 : 2.5}
                    fill={avgColor} opacity={isActive ? 1 : 0.9}
                    vectorEffect="non-scaling-stroke" />
                  {showLbl && (
                    <text x={cx} y={cy + (below ? 10 : -6)}
                      textAnchor="middle" fontSize={10} fontWeight={600}
                      fill={avgColor} vectorEffect="non-scaling-stroke">
                      {b.avgRestDays}d
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>


      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="flex flex-1">
          {compressedLabels.map((lbl, i) => (
            <div key={i} className="flex-1 text-center text-[10px] leading-none"
              style={{ color: i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {lbl}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1"
        style={{ paddingLeft: Y_LABEL_W }}>
        {REST_BUCKET_ORDER.map(cat => {
          const isActive = hoveredCat === cat;
          return (
            <span key={cat}
              className="flex items-center gap-1 text-[10px] transition-opacity cursor-default"
              style={{ color: isActive ? colorMap[cat] : (isDark ? '#a1a1aa' : '#78716c'),
                fontWeight: isActive ? 600 : 400,
                opacity: hoveredCat !== null && !isActive ? 0.4 : 1 }}
              onMouseEnter={() => setHoveredCat(cat)}
              onMouseLeave={() => setHoveredCat(null)}>
              <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                display: 'inline-block', background: colorMap[cat] }} />
              {cat}
            </span>
          );
        })}
        <span className="flex items-center gap-1 text-[10px]" style={{ color: avgColor }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            display: 'inline-block', background: avgColor }} />
          Avg
        </span>
      </div>
    </div>
  );
}

// ── CssDailyChart ──────────────────────────────────────────────────────────────
// REPLACES the previously appended CssDailyChart block in css-chart-components.tsx.
// Reuses smoothPath, buildYTicks, the colour helpers, CHART_H and Y_LABEL_W above.
//
// Summary "distribution" view: a single daily series with an optional dashed
// average line and optional background zone bands. Tooltip sits ABOVE the marker
// (so the pointer never covers it), shows value + date, and the plot does NOT clip
// so a high point's tooltip stays visible.

export interface CssDailyZone { from: number; to: number; color: string; }

interface CssDailyChartProps {
  values:        (number | null)[];
  labels:        string[];                 // 'YYYY-MM-DD'
  formatY:       (v: number) => string;
  isDark:        boolean;
  avg?:          number | null;            // dashed average line + label
  zones?:        CssDailyZone[];           // background bands, in data units
  baselineZero?: boolean;                  // pin y-min to 0 (for sums / 인분)
  yPadPct?:      number;
}

export function CssDailyChart({
  values, labels, formatY, isDark, avg = null, zones, baselineZero = false, yPadPct = 12,
}: CssDailyChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const nums = values.filter((v): v is number => v !== null);
  if (!nums.length) return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;

  const avgN   = avg ?? null;
  const rawMin = Math.min(...nums, avgN ?? Infinity);
  const rawMax = Math.max(...nums, avgN ?? -Infinity);
  const pad    = Math.max(1, (rawMax - rawMin) * (yPadPct / 100));
  const yMin   = baselineZero ? 0 : rawMin - pad;
  const yMax   = rawMax + pad;
  const yRange = yMax - yMin || 1;
  const yTicks = buildYTicks(yMin, rawMax);

  const n = labels.length;
  function xPct(i: number) { return n <= 1 ? 50 : (i / (n - 1)) * 100; }
  function yPct(v: number) { return (1 - (v - yMin) / yRange) * 100; }

  const gc = gridLineColor(isDark);
  const lc = labelColor(isDark);
  const vc = valueColor(isDark);
  const dc = lineColor(isDark);
  const avgC = isDark ? '#f97316' : '#ea580c';

  // ~6 evenly spaced x-axis dates
  const tickCount = Math.min(6, n);
  const labelIdx = new Set<number>();
  for (let k = 0; k < tickCount; k++) {
    labelIdx.add(Math.round((k / Math.max(1, tickCount - 1)) * (n - 1)));
  }
  const fmtX = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${+p[1]}/${+p[2]}` : d; };

  const pts = values
    .map((v, i) => v !== null ? { x: xPct(i), y: yPct(v) } : null)
    .filter((p): p is { x: number; y: number } => p !== null);
  const dPath = smoothPath(pts);

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height: CHART_H }}>
          {yTicks.map(tick => {
            const t = yPct(tick);
            if (t < 3 || t > 97) return null;
            return (
              <span key={tick} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: `${t}%`, transform: 'translateY(-50%)', color: lc }}>
                {formatY(tick)}
              </span>
            );
          })}
        </div>

        {/* Plot — no overflow clip, so the above-marker tooltip stays visible */}
        <div className="relative flex-1" style={{ height: CHART_H }}>
          {/* Zone bands */}
          {zones?.map((z, zi) => {
            const top    = yPct(Math.min(z.to, yMax));
            const bottom = yPct(Math.max(z.from, yMin));
            const h      = Math.max(0, bottom - top);
            if (h <= 0) return null;
            return (
              <div key={zi} className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${top}%`, height: `${h}%`, background: z.color }} />
            );
          })}

          {/* Grid */}
          {yTicks.map(tick => (
            <div key={tick} className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${yPct(tick)}%`, height: 1, background: gc, opacity: 0.6 }} />
          ))}

          {/* Average line — thicker + larger label */}
          {avgN !== null && avgN >= yMin && avgN <= yMax && (
            <>
              <div className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${yPct(avgN)}%`, height: 0, borderTop: `2px dashed ${avgC}`, opacity: 0.95 }} />
              <span className="absolute text-[11px] font-semibold leading-none px-1 rounded"
                style={{ right: 2, top: `${yPct(avgN)}%`, transform: 'translateY(-50%)', color: avgC,
                  background: isDark ? 'rgba(24,24,27,0.75)' : 'rgba(255,255,255,0.75)', zIndex: 4 }}>
                {formatY(avgN)}
              </span>
            </>
          )}

          {/* Spline */}
          <svg className="absolute inset-0 w-full h-full overflow-visible"
            preserveAspectRatio="none" viewBox="0 0 100 100">
            {dPath && (
              <path d={dPath} fill="none" stroke={dc} strokeWidth="1.5"
                strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke" opacity={0.9} />
            )}
          </svg>

          {/* Dots + hover tooltip (always above the marker) */}
          {labels.map((lbl, i) => {
            const v = values[i];
            return (
              <div key={lbl + i} className="absolute top-0 bottom-0"
                style={{ left: `${xPct(i)}%`, width: `${100 / Math.max(1, n)}%`,
                  transform: 'translateX(-50%)', cursor: 'pointer', zIndex: 2 }}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}>
                {v !== null && (() => {
                  const top = `${yPct(v)}%`;
                  const isActive = activeIdx === i;
                  return (
                    <>
                      <div className="absolute rounded-full"
                        style={{ left: '50%', top, transform: 'translate(-50%,-50%)',
                          width: isActive ? 9 : 5, height: isActive ? 9 : 5,
                          background: dc, opacity: isActive ? 1 : 0.85, zIndex: 3 }} />
                      {isActive && (
                        <div className="absolute rounded px-1.5 py-1 leading-tight whitespace-nowrap text-center pointer-events-none"
                          style={{ left: '50%', top,
                            transform: 'translate(-50%, calc(-100% - 11px))',
                            background: isDark ? '#27272a' : '#ffffff',
                            border: `1px solid ${isDark ? '#3f3f46' : '#e7e5e4'}`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: vc }}>{formatY(v)}</div>
                          <div style={{ fontSize: 10, color: lc, marginTop: 1 }}>{fmtX(lbl)}</div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="relative flex-1" style={{ height: 14 }}>
          {labels.map((lbl, i) => labelIdx.has(i) ? (
            <span key={i} className="absolute text-[10px] leading-none"
              style={{ left: `${xPct(i)}%`, transform: 'translateX(-50%)', color: lc }}>
              {fmtX(lbl)}
            </span>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

