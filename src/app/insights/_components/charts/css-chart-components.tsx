'use client';
// src/app/insights/_components/charts/css-chart-components.tsx
// CSS-only chart components (no SVG except for line paths) for the Drinking Trend view.

import React, { useId, useState } from 'react';

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

/**
 * A tick may fall outside the plot box: buildYTicks pins the data max, which
 * can sit above yMax. Labels already guard against this, gridlines did not —
 * and since the plot divs are not clipped, a negative top painted the line
 * upward out of the chart and into the widget header. Guard every call site.
 */
const inPlot = (t: number) => t >= 0 && t <= 100;

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
  yAxis?:            { min?: number; max?: number; baseline?: number | null; ticks?: { value: number; label: string }[] };
  // Optional second series against its OWN right-hand axis (v4.5 — the
  // Exercise Trend load line). Drawn dashed so the two scales cannot be
  // read as one; ignored entirely when absent or all-null, so every
  // existing call site renders pixel-identically.
  rightSeries?:      CssTrendSeries;
  formatYRight?:     (v: number) => string;
  // Band-centred x positions (v4.5): points sit over the centre of n equal
  // cells instead of spanning edge-to-edge, so the chart can align with a
  // cell grid drawn below it. Off by default — existing charts span as before.
  xBand?:            boolean;
  // Label thinning (v4.5): a fixed stride walked back from the newest bucket,
  // per the shared convention. Default keeps every label, as before.
  maxXLabels?:       number;
  // Per-point printed values (v4.5): default on, as before. When off, a
  // point's value still appears on hover/tap.
  showValues?:       boolean;
  // Year compression (v4.5): by default formatBucketLabels prints the year
  // only where it changes, which breaks once labels are thinned — the label
  // carrying the year can be one of the thinned ones. Pass false to print
  // every label whole.
  compressXLabels?:  boolean;
}

export function CssTrendChart({
  series, labels, formatY, isDark, yPadPct = 10, yAxis, rightSeries, formatYRight,
  xBand = false, maxXLabels, showValues = true, compressXLabels = true,
}: CssTrendChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const allVals = series.flatMap(s => s.values).filter((v): v is number => v !== null);
  if (!allVals.length) return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;

  const baseline = yAxis?.baseline ?? null;
  // fold an optional reference line into the auto-range so it stays visible
  const lo = baseline !== null ? Math.min(...allVals, baseline) : Math.min(...allVals);
  const hi = baseline !== null ? Math.max(...allVals, baseline) : Math.max(...allVals);
  const pad    = Math.max(1, (hi - lo) * (yPadPct / 100));
  const yMin   = yAxis?.min ?? (lo - pad);
  const yMax   = yAxis?.max ?? (hi + pad);
  const yRange = yMax - yMin || 1;
  const ticks  = yAxis?.ticks
    ? yAxis.ticks
    : buildYTicks(yMin, hi).map(v => ({ value: v, label: formatY(v) }));

  // Right axis — its own range and scale, never mixed into the left one.
  const rightVals = (rightSeries?.values ?? []).filter((v): v is number => v !== null);
  const hasRight  = rightVals.length > 0;
  const fmtR      = formatYRight ?? formatY;
  const loR    = hasRight ? Math.min(...rightVals) : 0;
  const hiR    = hasRight ? Math.max(...rightVals) : 1;
  const padR   = Math.max(1, (hiR - loR) * (yPadPct / 100));
  const yMinR  = loR - padR;
  const yMaxR  = hiR + padR;
  const yRangeR = yMaxR - yMinR || 1;
  const ticksR = hasRight ? buildYTicks(yMinR, hiR).map(v => ({ value: v, label: fmtR(v) })) : [];

  const n = labels.length;
  const displayLabels = compressXLabels ? formatBucketLabels(labels) : labels;
  function xPct(i: number)  {
    if (xBand) return n <= 0 ? 50 : ((i + 0.5) / n) * 100;
    return n <= 1 ? 50 : (i / (n - 1)) * 100;
  }
  const labelStride = maxXLabels ? Math.max(1, Math.ceil(n / maxXLabels)) : 1;
  const showXLabel  = (i: number) => (n - 1 - i) % labelStride === 0;
  function yPct(v: number)  { return (1 - (v - yMin) / yRange) * 100; }
  function yPctR(v: number) { return (1 - (v - yMinR) / yRangeR) * 100; }

  const gc = gridLineColor(isDark);
  const lc = labelColor(isDark);
  const vc = valueColor(isDark);

  // With a right axis (or several left series) every value label takes its
  // series colour, so the two scales stay attributable.
  const multiColored = series.length > 1 || hasRight;

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis labels */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height: CHART_H }}>
          {ticks.map(tk => {
            const t = yPct(tk.value);
            if (t < 3 || t > 97) return null;
            return (
              <span key={tk.value} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: `${t}%`, transform: 'translateY(-50%)', color: lc }}>
                {tk.label}
              </span>
            );
          })}
        </div>

        {/* Plot area */}
        <div className="relative flex-1" style={{ height: CHART_H }}>
          {/* Grid lines — left ticks only; a second grid would be noise */}
          {ticks.map(tk => (
            inPlot(yPct(tk.value)) ? (
              <div key={tk.value} className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${yPct(tk.value)}%`, height: 1, background: gc, opacity: 0.7 }} />
            ) : null
          ))}

          {/* Baseline reference line (optional) */}
          {baseline !== null && yPct(baseline) >= 0 && yPct(baseline) <= 100 && (
            <div className="absolute inset-x-0 pointer-events-none"
              style={{ top: `${yPct(baseline)}%`, height: 0, borderTop: `1px dashed ${lc}`, opacity: 0.8 }} />
          )}

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
            {hasRight && rightSeries && (() => {
              const pts = rightSeries.values
                .map((v, i) => v !== null ? { x: xPct(i), y: yPctR(v) } : null)
                .filter((p): p is { x: number; y: number } => p !== null);
              const d = smoothPath(pts);
              if (!d) return null;
              return (
                <path d={d} fill="none" stroke={rightSeries.color}
                  strokeWidth="1.5" strokeDasharray="5 3"
                  strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" opacity={0.85} />
              );
            })()}
          </svg>

          {/* Dots + hover zones */}
          {labels.map((_, i) => (
            // Key by position, not label text — labels can transiently
            // duplicate for one frame when a parent switches formats before
            // its refetch lands, and columns are positional anyway.
            <div key={i} className="absolute top-0 bottom-0 flex items-stretch"
              style={{ left: `${xPct(i)}%`,
                // One bucket wide, so zones tile instead of overlapping —
                // a fixed 28px zone buried dots under their right-hand
                // neighbour's zone whenever buckets sat closer than that.
                width: `${100 / Math.max(1, xBand ? n : n - 1)}%`,
                minWidth: 10,
                transform: 'translateX(-50%)', cursor: 'pointer',
                zIndex: activeIdx === i ? 10 : 2 }}
              onMouseEnter={() => setActiveIdx(i)}
              onMouseLeave={() => setActiveIdx(null)}
              onClick={() => setActiveIdx(activeIdx === i ? null : i)}>              {series.map((s, si) => {
                const v = s.values[i];
                if (v === null) return null;
                const top        = `${yPct(v)}%`;
                const isActive   = activeIdx === i;
                const showLabel  = showValues || isActive;   // hidden values reappear on hover
                const labelBelow = yPct(v) < 18;
                return (
                  <React.Fragment key={si}>
                    <div className="absolute rounded-full"
                      style={{ left: '50%', top, transform: 'translate(-50%, -50%)',
                        width: isActive ? 9 : 7, height: isActive ? 9 : 7,
                        background: s.color, opacity: isActive ? 1 : 0.9, zIndex: 3 }} />
                    {showLabel && (
                      isActive && si === 0 ? (
                        // Two-line tooltip: value over bucket name, floated
                        // well clear of the dot (and the pointer resting on
                        // it), on a translucent backdrop so it stays readable
                        // over lines and grid. Always ABOVE the dot — nothing
                        // clips the plot's top, so a high point just overlaps
                        // the caption for a moment, which beats a tooltip
                        // that jumps sides.
                        <div className="absolute text-[10px] font-semibold leading-tight whitespace-nowrap text-center rounded"
                          style={{ left: '50%', top,
                            transform: 'translate(-50%, -34px)',
                            color: multiColored ? s.color : vc,
                            background: isDark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.92)',
                            padding: '1px 4px',
                            zIndex: 5, pointerEvents: 'none' }}>
                          {formatY(v)}
                          <div className="font-normal" style={{ color: lc }}>{displayLabels[i]}</div>
                        </div>
                      ) : (
                        <div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                          style={{ left: '50%', top,
                            transform: labelBelow ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                            color: multiColored ? s.color : vc, zIndex: 4, pointerEvents: 'none' }}>
                          {formatY(v)}
                        </div>
                      )
                    )}
                  </React.Fragment>
                );
              })}
              {hasRight && rightSeries && rightSeries.values[i] !== null && (() => {
                const v = rightSeries.values[i] as number;
                const top        = `${yPctR(v)}%`;
                const isActive   = activeIdx === i;
                const labelBelow = yPctR(v) < 18;
                return (
                  <React.Fragment>
                    {/* hollow dot — the dashed series keeps its own shape language */}
                    <div className="absolute rounded-full"
                      style={{ left: '50%', top, transform: 'translate(-50%, -50%)',
                        width: isActive ? 9 : 7, height: isActive ? 9 : 7,
                        background: isDark ? '#18181b' : '#ffffff',
                        border: `1.5px solid ${rightSeries.color}`,
                        opacity: isActive ? 1 : 0.9, zIndex: 3 }} />
                    {(showValues || isActive) && (
                      <div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                        style={{ left: '50%', top,
                          transform: labelBelow ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                          color: rightSeries.color, zIndex: 4, pointerEvents: 'none' }}>
                        {fmtR(v)}
                      </div>
                    )}
                  </React.Fragment>
                );
              })()}
            </div>
          ))}
        </div>

        {/* Right y-axis labels (only when a right series exists) */}
        {hasRight && (
          <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_WR, height: CHART_H }}>
            {ticksR.map(tk => {
              const t = yPctR(tk.value);
              if (t < 3 || t > 97) return null;
              return (
                <span key={tk.value} className="absolute text-[10px] leading-none"
                  style={{ left: 4, top: `${t}%`, transform: 'translateY(-50%)',
                    color: rightSeries?.color ?? lc }}>
                  {tk.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* X labels */}
      <div className="flex w-full"
        style={{ paddingLeft: Y_LABEL_W, paddingRight: hasRight ? Y_LABEL_WR : 0 }}>
        <div className="relative flex-1" style={{ height: 16 }}>
          {displayLabels.map((lbl, i) => showXLabel(i) ? (
            <span key={i} className="absolute text-[10px] leading-none whitespace-nowrap"
              style={{ left: `${xPct(i)}%`, transform: 'translateX(-50%)',
                color: i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {lbl}
            </span>
          ) : null)}
        </div>
      </div>

      {/* Legend (multi-series, or a labelled right series) */}
      {(series.length > 1 || (hasRight && rightSeries?.label)) && (
        <div className="flex gap-3 flex-wrap"
          style={{ paddingLeft: Y_LABEL_W, paddingRight: hasRight ? Y_LABEL_WR : 0 }}>
          {series.map((s, i) => s.label ? (
            <span key={i} className="flex items-center gap-1 text-[10px]" style={{ color: lc }}>
              <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: s.color }} />
              {s.label}
            </span>
          ) : null)}
          {hasRight && rightSeries?.label && (
            <span className="flex items-center gap-1 text-[10px]" style={{ color: lc }}>
              <span className="inline-block"
                style={{ width: 12, height: 0, borderTop: `2px dashed ${rightSeries.color}` }} />
              {rightSeries.label}
            </span>
          )}
        </div>
      )}
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
	height?:  number;
  compact?: boolean;
  // Trend charts bold the newest bucket. Categorical buckets (Set / Day) have
  // no newest, so the emphasis is meaningless there — pass false.
  emphasizeLast?: boolean;
}

const VBOX_H = 140;

export function CssVerticalBoxPlotChart({
  buckets, isDark, yPadPct = 10, formatY = String, height = VBOX_H, compact = false,
  emphasizeLast = true,
}: CssVerticalBoxPlotChartProps) {
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
  const compressedLabels = formatBucketLabels(buckets.map(b => b.label));
  const hasXLabels = compressedLabels.some(l => l && l.length > 0);

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y-axis (hidden in compact) */}
        {!compact && (
          <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height }}>
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
        )}

        {/* Plot */}
        <div className="relative flex-1" style={{ height }}>
					{!compact && yTicks.map(tick => (
            inPlot(yPct(tick)) ? (
              <div key={tick} className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${yPct(tick)}%`, height: 1, background: gc, opacity: 0.7 }} />
            ) : null
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
                  style={{ height, cursor: 'pointer' }}
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

                  {/* Compact value labels: max (above) / avg (pill) / min (below) */}
                  {compact && !isActive && (
                    <>
                      <span className="absolute text-[9px] leading-none whitespace-nowrap pointer-events-none"
                        style={{ left: '50%', top: `${topWhiskerPct}%`, transform: 'translate(-50%, -135%)', color: lc }}>
                        {formatY(b.max)}
                      </span>
                      <span className="absolute text-[10px] font-semibold leading-none whitespace-nowrap pointer-events-none rounded px-0.5"
                        style={{ left: '50%', top: `${avgTopPct}%`, transform: 'translate(-50%, -50%)', color: avgC,
                          background: isDark ? 'rgba(24,24,27,0.85)' : 'rgba(255,255,255,0.85)' }}>
                        {formatY(b.avg)}
                      </span>
                      <span className="absolute text-[9px] leading-none whitespace-nowrap pointer-events-none"
                        style={{ left: '50%', top: `${bottomWhiskerPct}%`, transform: 'translate(-50%, 55%)', color: lc }}>
                        {formatY(b.min)}
                      </span>
                    </>
                  )}

                  {/* Hover tooltip: max / avg / min */}
                  {isActive && (
                    <div className="absolute z-10 rounded px-1.5 py-1 text-[10px] leading-snug whitespace-nowrap flex flex-col gap-0.5"
                      style={{ left: '50%', top: `${avgTopPct}%`,
                        transform: 'translate(-50%, -110%)',
                        background: isDark ? '#27272a' : '#fff',
                        border: `1px solid ${isDark ? '#3f3f46' : '#e7e5e4'}`,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
											<span style={{ color: lc }}>Max <span style={{ color: valueColor(isDark), fontWeight: 600 }}>{formatY(b.max)}</span></span>
                      <span style={{ color: lc }}>P75 <span style={{ color: valueColor(isDark), fontWeight: 600 }}>{formatY(b.p75)}</span></span>
                      <span style={{ color: avgC }}>Avg <span style={{ fontWeight: 600 }}>{formatY(b.avg)}</span></span>
                      <span style={{ color: lc }}>P25 <span style={{ color: valueColor(isDark), fontWeight: 600 }}>{formatY(b.p25)}</span></span>
                      <span style={{ color: lc }}>Min <span style={{ color: valueColor(isDark), fontWeight: 600 }}>{formatY(b.min)}</span></span>
                    </div>
                  )}

									{/* Rightmost: centred value labels (hidden in compact).
                      Same placement as compact, but max/min match avg's size.
                      P75/P25 stay in the tooltip — printed here they would sit
                      inside the IQR box and collide with its border. */}
                  {!compact && isLast && !isActive && (
                    <>
                      <span className="absolute text-[10px] leading-none whitespace-nowrap pointer-events-none"
                        style={{ left: '50%', top: `${topWhiskerPct}%`, transform: 'translate(-50%, -135%)', color: valueColor(isDark) }}>
                        {formatY(b.max)}
                      </span>
                      <span className="absolute text-[10px] font-semibold leading-none whitespace-nowrap pointer-events-none rounded px-0.5"
                        style={{ left: '50%', top: `${avgTopPct}%`, transform: 'translate(-50%, -50%)', color: avgC,
                          background: isDark ? 'rgba(24,24,27,0.85)' : 'rgba(255,255,255,0.85)' }}>
                        {formatY(b.avg)}
                      </span>
                      <span className="absolute text-[10px] leading-none whitespace-nowrap pointer-events-none"
                        style={{ left: '50%', top: `${bottomWhiskerPct}%`, transform: 'translate(-50%, 55%)', color: valueColor(isDark) }}>
                        {formatY(b.min)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X labels (skipped when every bucket label is empty, e.g. Diet's single box) */}
			{hasXLabels && (
        <div className="flex w-full" style={{ paddingLeft: compact ? 0 : Y_LABEL_W }}>
          <div className="flex flex-1">
            {compressedLabels.map((lbl, i) => (
              <div key={i} className="flex-1 text-center text-[10px] leading-none"
                style={{ color: emphasizeLast && i === n - 1 ? (isDark ? '#f4f4f5' : '#292524') : lc,
                  fontWeight: emphasizeLast && i === n - 1 ? 600 : 400 }}>
                {lbl}
              </div>
            ))}
          </div>
        </div>
      )}
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
  const compressedLabels = formatBucketLabels(buckets.map(b => b.label));
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
            inPlot(yPct(tick)) ? (
              <div key={tick} className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${yPct(tick)}%`, height: 1, background: gc, opacity: 0.6 }} />
            ) : null
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

						{/* Vertical arrows (start → end) */}
            {buckets.map((b, i) => {
              if (b.avgStartMins === null || b.avgEndMins === null) return null;
              const x  = xPct(i);
              const y1 = yPct(b.avgStartMins);
              const y2 = yPct(b.avgEndMins);
              return (
								<g key={i} style={{ pointerEvents: 'none' }}>
                  <line x1={x} y1={y1 + 1.5} x2={x} y2={y2}
                    stroke={arrowColor} strokeWidth="1" strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke" />
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
								const below    = yPct(b.avgStartMins) < 86;   // start label sits below its dot
                return (
                  <>
                    <div className="absolute rounded-full"
                      style={{ left: '50%', top, transform: 'translate(-50%, -50%)',
                        width: isActive ? 9 : 7, height: isActive ? 9 : 7,
                        background: fromColor, opacity: isActive ? 1 : 0.9, zIndex: 3 }} />
										<div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                      style={{ left: '50%', top,
                        transform: below ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                        color: fromColor, zIndex: 4, pointerEvents: 'none' }}>
                      {minsToClockStr(b.avgStartMins)}
                    </div>
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
										<div className="absolute text-[10px] font-semibold leading-none whitespace-nowrap"
                      style={{ left: '50%', top,
                        transform: below ? 'translate(-50%, 8px)' : 'translate(-50%, -18px)',
                        color: toColor, zIndex: 4, pointerEvents: 'none' }}>
                      {minsToClockStr(b.avgEndMins, b.avgEndMins >= 1440)}
                    </div>
                  </>
                );
              })()}
							{/* Duration (always shown) — two lines (Xh / YYm); left of the line on the last bucket */}
              {b.avgStartMins !== null && b.avgEndMins !== null && b.avgDurationSeconds !== null && (() => {
                const totalMin = Math.round(b.avgDurationSeconds / 60);
                const h = Math.floor(totalMin / 60);
                const m = totalMin % 60;
                const isLast = i === n - 1;
                return (
                  <div className="absolute text-[10px] font-semibold leading-tight whitespace-nowrap text-center"
                    style={{ left: '50%', top: `${(yPct(b.avgStartMins) + yPct(b.avgEndMins)) / 2}%`,
                      transform: isLast ? 'translate(calc(-100% - 4px), -50%)' : 'translate(4px, -50%)',
                      color: durColor, zIndex: 4, pointerEvents: 'none' }}>
                    <div>{h}h</div>
                    <div>{String(m).padStart(2, '0')}m</div>
                  </div>
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

// Formats trend bucket labels by granularity (detected via separator), omitting the
// repeated leading part: week/month omit the repeated year, day omits the repeated
// month. yyWww → "25W03"/"W03"; yy.mm → "25.07"/"07"; mm/dd → "07/15"/"16".
export function formatBucketLabels(labels: string[]): string[] {
  const omit = (
    re: RegExp,
    leadOf: (m: RegExpMatchArray) => string,
    restOf: (m: RegExpMatchArray) => string,
  ) => {
    let last = '';
    return labels.map((l, i) => {
      const m = l.match(re)!;
      const lead = leadOf(m);
      const show = i === 0 || lead !== last;
      last = lead;
      return show ? l : restOf(m);
    });
  };

  if (labels.every(l => /^\d{2}W\d{2}$/.test(l)))    // week: omit year
    return omit(/^(\d{2})(W\d{2})$/, m => m[1], m => m[2]);
  if (labels.every(l => /^\d{2}\.\d{2}$/.test(l)))   // month: omit year
    return omit(/^(\d{2})\.(\d{2})$/, m => m[1], m => m[2]);
  if (labels.every(l => /^\d{2}\/\d{2}$/.test(l)))   // day: omit month
    return omit(/^(\d{2})\/(\d{2})$/, m => m[1], m => m[2]);
  return labels;
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

  const compressedLabels = formatBucketLabels(buckets.map(b => b.label));

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

						{/* Avg dots */}
            {buckets.map((b, i) => {
              const cx       = slotCenter(i);
              const cy       = avgPx(b.avgRestDays);
              const isActive = activeIdx === i;
              return (
                <g key={i} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx(null)}>
                  <circle cx={cx} cy={cy} r={isActive ? 4 : 2.5}
                    fill={avgColor} opacity={isActive ? 1 : 0.9}
                    vectorEffect="non-scaling-stroke" />
                </g>
              );
            })}
          </svg>

					{/* Avg value labels — HTML pills (readable over any bar, crisp + symmetric) */}
          {buckets.map((b, i) => {
            const cy    = avgPx(b.avgRestDays);
            const below = cy < 18;
            return (
              <div key={i}
                className="absolute text-[10px] font-semibold leading-none whitespace-nowrap pointer-events-none"
                style={{ left: `${(slotCenter(i) / REST_W) * 100}%`,
                  top: `${cy + (below ? 12 : -9)}px`,
                  transform: 'translate(-50%, -50%)',
                  color: avgColor,
                  background: isDark ? 'rgba(24,24,27,0.72)' : 'rgba(255,255,255,0.80)',
                  padding: '1px 3px', borderRadius: 3, zIndex: 2 }}>
                {b.avgRestDays}d
              </div>
            );
          })}
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

// ── CssStackedAreaChart ───────────────────────────────────────────────────────
// Stacked area with a continuous total line. Built for Weight Trend (WBS #54)
// but nothing here is weight-specific.
//
// The two things it exists to handle:
//  1. Points may carry a total but NO segments (pre-InBody weigh-ins). The
//     total line runs across them; the coloured fill simply does not start
//     until segments appear. The gap is information, not a defect.
//  2. In a mixed bucket the segment sum and the total legitimately differ —
//     the total averages every day, the segments average only full-triple
//     days. The fill top and the line separate slightly, and that separation
//     IS the pre-InBody boundary. Do not "fix" it by forcing them to agree.
//
// Nulls break the line rather than interpolating across them. Inventing a
// reading that never happened is worse than a visible gap.
//
// mode='percent' normalises each stack to 100, which flattens the tops and
// makes a segment's share directly readable over time. The total line is
// hidden there because a constant 100 carries no information.

export interface StackedAreaSegmentDef {
  key:   string;
  label: string;
  color: string;
}

export interface StackedAreaPoint {
  /** already-shortened label; pass through formatBucketLabels-compatible forms */
  label:     string;
  total:     number | null;
  /** keyed by StackedAreaSegmentDef.key; null when this point has no breakdown */
  segments:  Record<string, number> | null;
  /** optional extra tooltip line, e.g. 'n = 22 of 30 days' */
  meta?:     string;
}

interface CssStackedAreaChartProps {
  points:       StackedAreaPoint[];
  /** bottom → top stacking order */
  segmentDefs:  StackedAreaSegmentDef[];
  isDark:       boolean;
  mode?:        'absolute' | 'percent';
  formatY?:     (v: number) => string;
  height?:      number;
  /** pin y-min to 0. Off by default — see the note in the widget. */
  baselineZero?: boolean;
  yPadPct?:     number;
  /** cap on how many x labels are drawn; the last is always kept */
  maxXLabels?:  number;
}

const AREA_H = 150;

/** Closed band between an upper and a lower boundary, both splined. */
function areaBandPath(
  top:    { x: number; y: number }[],
  bottom: { x: number; y: number }[],
): string | null {
  if (top.length < 2 || bottom.length < 2) return null;
  const t = smoothPath(top);
  const b = smoothPath([...bottom].reverse());
  if (!t || !b) return null;
  // b starts with 'M x,y'; turning that into 'L x,y' joins the two boundaries.
  return `${t} L ${b.slice(1).trim()} Z`;
}

export function CssStackedAreaChart({
  points, segmentDefs, isDark, mode = 'absolute', formatY = String,
  height = AREA_H, baselineZero = false, yPadPct = 8, maxXLabels = 8,
}: CssStackedAreaChartProps) {
	const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const clipId = useId().replace(/:/g, '');   // ':' is illegal in a url(#…) ref

  const n = points.length;
  if (n === 0) {
    return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;
  }

  const percent = mode === 'percent';

  /** Cumulative boundaries for one point, bottom → top. null when no segments. */
  function boundariesAt(i: number): number[] | null {
    const seg = points[i].segments;
    if (!seg) return null;
    const vals = segmentDefs.map(d => seg[d.key] ?? 0);
    const sum  = vals.reduce((a, b) => a + b, 0);
    if (sum <= 0) return null;
    const scale = percent ? 100 / sum : 1;
    const out: number[] = [0];
    for (const v of vals) out.push(out[out.length - 1] + v * scale);
    return out;
  }

  const allBoundaries = points.map((_, i) => boundariesAt(i));
  const totals        = points.map(p => p.total);

  // ── y range ────────────────────────────────────────────────────────────────
  let yMin: number;
  let yMax: number;
  let ticks: number[];

  if (percent) {
    yMin = 0; yMax = 100;
    ticks = [0, 25, 50, 75, 100];
  } else {
    const pool: number[] = [];
    for (const t of totals) if (t !== null) pool.push(t);
    for (const b of allBoundaries) if (b) pool.push(b[b.length - 1]);
    if (pool.length === 0) {
      return <p className="text-xs" style={{ color: labelColor(isDark) }}>No data</p>;
    }
    const lo  = Math.min(...pool);
    const hi  = Math.max(...pool);
    const pad = Math.max(0.5, (hi - lo) * (yPadPct / 100));
    yMin  = baselineZero ? 0 : lo - pad;
    yMax  = hi + pad;
    ticks = buildYTicks(yMin, hi);
  }

  const yRange = yMax - yMin || 1;
  const xPct = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const yPct = (v: number) => (1 - (v - yMin) / yRange) * 100;

  const gc = gridLineColor(isDark);
  const lc = labelColor(isDark);
  const vc = valueColor(isDark);
  const tc = lineColor(isDark);

  // ── contiguous runs of points that carry segments ──────────────────────────
  const segRuns: number[][] = [];
  {
    let cur: number[] = [];
    for (let i = 0; i < n; i++) {
      if (allBoundaries[i]) cur.push(i);
      else { if (cur.length) segRuns.push(cur); cur = []; }
    }
    if (cur.length) segRuns.push(cur);
  }

  // ── contiguous runs of points that carry a total (line breaks on gaps) ─────
  const lineRuns: number[][] = [];
  if (!percent) {
    let cur: number[] = [];
    for (let i = 0; i < n; i++) {
      if (totals[i] !== null) cur.push(i);
      else { if (cur.length) lineRuns.push(cur); cur = []; }
    }
    if (cur.length) lineRuns.push(cur);
  }

  // Width of a lone-point run, drawn as a narrow column so it does not vanish.
  const soloW = n <= 1 ? 40 : Math.min(3, (100 / n) * 0.7);

	// ── x labels — thin FIRST, then shorten ───────────────────────────────────
  // formatBucketLabels drops a repeated leading year, so '25.06' becomes '06'
  // once the previous label already carried '25'. Shortening before thinning
  // meant the one label holding the year was often the one discarded, leaving
  // a row of bare months. Thinning first makes those decisions against the
  // labels that will actually be drawn.
	// Fixed stride, walked backwards from the last bucket. Dividing the range
  // evenly produced uneven gaps (2 months, 1, 2, 1) because the rounded
  // positions do not land on a whole number of buckets, and the separately
  // pinned last label could land next to its neighbour and overlap it
  // ('W26W27'). Stepping back from the end pins the newest label by
  // construction and makes every gap identical.
  const keep: number[] = [];
  {
    const stride = Math.max(1, Math.ceil(n / Math.max(1, maxXLabels)));
    for (let i = n - 1; i >= 0; i -= stride) keep.push(i);
    keep.reverse();
  }
  const keptShort = formatBucketLabels(keep.map(i => points[i].label));
  const shortAt   = new Map<number, string>(keep.map((i, k) => [i, keptShort[k]]));

  return (
    <div className="flex flex-col gap-1 w-full select-none">
      <div className="flex w-full">
        {/* Y axis */}
        <div className="relative shrink-0 overflow-hidden" style={{ width: Y_LABEL_W, height }}>
          {ticks.map(tk => {
            const t = yPct(tk);
            if (t < 3 || t > 97) return null;
            return (
              <span key={tk} className="absolute text-[10px] leading-none"
                style={{ right: 4, top: `${t}%`, transform: 'translateY(-50%)', color: lc }}>
                {percent ? `${tk}%` : formatY(tk)}
              </span>
            );
          })}
        </div>

        {/* Plot */}
        <div className="relative flex-1" style={{ height }}>
          {/* Grid */}
					{ticks.map(tk => (
            inPlot(yPct(tk)) ? (
              <div key={tk} className="absolute inset-x-0 pointer-events-none"
                style={{ top: `${yPct(tk)}%`, height: 1, background: gc, opacity: 0.7 }} />
            ) : null
          ))}

					<svg className="absolute inset-0 w-full h-full overflow-visible"
            preserveAspectRatio="none" viewBox="0 0 100 100">
            {/* Bands are clipped to the plot box. Without this, a band whose
                base sits below yMin paints straight down over the x labels,
                the legend and the caption. */}
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width="100" height="100" />
              </clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
            {/* Stacked bands */}
            {segRuns.map((run, ri) =>
              segmentDefs.map((def, k) => {
                if (run.length === 1) {
                  const i = run[0];
                  const b = allBoundaries[i]!;
                  const yTop = yPct(b[k + 1]);
                  const yBot = yPct(b[k]);
                  return (
                    <rect key={`${ri}-${k}`}
                      x={xPct(i) - soloW / 2} width={soloW}
                      y={Math.min(yTop, yBot)} height={Math.abs(yBot - yTop)}
                      fill={def.color} opacity={0.85} />
                  );
                }
                const top = run.map(i => ({ x: xPct(i), y: yPct(allBoundaries[i]![k + 1]) }));
                const bot = run.map(i => ({ x: xPct(i), y: yPct(allBoundaries[i]![k]) }));
                const d = areaBandPath(top, bot);
                if (!d) return null;
                return <path key={`${ri}-${k}`} d={d} fill={def.color} opacity={0.85} />;
              }),
            )}
            </g>

            {/* Total line — absolute mode only */}
            {!percent && lineRuns.map((run, ri) => {
              const pts = run.map(i => ({ x: xPct(i), y: yPct(totals[i] as number) }));
              if (pts.length === 1) {
                return <circle key={ri} cx={pts[0].x} cy={pts[0].y} r={1.2} fill={tc} />;
              }
              const d = smoothPath(pts);
              if (!d) return null;
              return (
                <path key={ri} d={d} fill="none" stroke={tc} strokeWidth="1.5"
                  strokeLinejoin="round" strokeLinecap="round"
                  vectorEffect="non-scaling-stroke" opacity={0.95} />
              );
            })}
          </svg>

          {/* Hover columns */}
          {points.map((p, i) => {
            const isActive = activeIdx === i;
            const b = allBoundaries[i];
            const empty = p.total === null && !b;
            return (
              <div key={p.label + i} className="absolute top-0 bottom-0"
                style={{ left: `${xPct(i)}%`, width: `${Math.max(100 / n, 2)}%`,
                  transform: 'translateX(-50%)', cursor: 'pointer', zIndex: 2 }}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
                onClick={() => setActiveIdx(isActive ? null : i)}>

                {isActive && (
                  <>
                    <div className="absolute inset-y-0 pointer-events-none"
                      style={{ left: '50%', width: 1, background: lc, opacity: 0.5 }} />
                    <div className="absolute rounded px-2 py-1 leading-tight whitespace-nowrap pointer-events-none"
                      style={{ left: '50%', top: 4,
                        transform: i > n * 0.6
                          ? 'translateX(calc(-100% - 6px))'
                          : 'translateX(6px)',
                        background: isDark ? '#27272a' : '#ffffff',
                        border: `1px solid ${isDark ? '#3f3f46' : '#e7e5e4'}`,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 6 }}>
                      <div style={{ fontSize: 10, color: lc }}>{p.label}</div>

                      {empty && (
                        <div style={{ fontSize: 11, color: lc, marginTop: 2 }}>No reading</div>
                      )}

                      {p.total !== null && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: vc, marginTop: 2 }}>
                          {formatY(p.total)}
                        </div>
                      )}

                      {b && segmentDefs.map((def, k) => {
                        const raw = p.segments?.[def.key] ?? 0;
                        const span = b[k + 1] - b[k];
                        return (
                          <div key={def.key} className="flex items-center gap-1"
                            style={{ fontSize: 10, color: lc, marginTop: 1 }}>
                            <span className="inline-block rounded-full"
                              style={{ width: 7, height: 7, background: def.color }} />
                            <span style={{ minWidth: 52 }}>{def.label}</span>
                            <span style={{ color: vc }}>
                              {percent ? `${span.toFixed(1)}%` : formatY(raw)}
                            </span>
                          </div>
                        );
                      })}

                      {!b && p.total !== null && (
                        <div style={{ fontSize: 10, color: lc, marginTop: 2 }}>
                          Weight only
                        </div>
                      )}

                      {p.meta && (
                        <div style={{ fontSize: 10, color: lc, marginTop: 2 }}>{p.meta}</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* X labels */}
      <div className="flex w-full" style={{ paddingLeft: Y_LABEL_W }}>
        <div className="relative flex-1" style={{ height: 16 }}>
					{keep.map(i => (
            <span key={i} className="absolute text-[10px] leading-none whitespace-nowrap"
              style={{ left: `${xPct(i)}%`, transform: 'translateX(-50%)',
                color: i === n - 1 ? vc : lc,
                fontWeight: i === n - 1 ? 600 : 400 }}>
              {shortAt.get(i)}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-3 flex-wrap" style={{ paddingLeft: Y_LABEL_W }}>
        {segmentDefs.map(def => (
          <span key={def.key} className="flex items-center gap-1 text-[10px]" style={{ color: lc }}>
            <span className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: def.color }} />
            {def.label}
          </span>
        ))}
        {!percent && (
          <span className="flex items-center gap-1 text-[10px]" style={{ color: lc }}>
            <span className="inline-block" style={{ width: 10, height: 2, background: tc }} />
            Total
          </span>
        )}
      </div>
    </div>
  );
}
