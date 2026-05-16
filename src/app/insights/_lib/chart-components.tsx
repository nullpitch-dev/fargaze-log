// src/app/insights/_lib/chart-components.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { chartColors } from './chart-colors';
import { formatBucketLabel } from './format';

// ── Spline path generator (Catmull-Rom, tension=0.2) ─────────────────────────

export function smoothLinePath(pts: { x: number; y: number }[]): string | null {
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

// ── SVG layout constants ──────────────────────────────────────────────────────

export const CHART = {
  W: 500,
  H: 180,
  PAD: { t: 20, r: 16, b: 28, l: 44 },
} as const;

// ── Generic single-series TrendChart ─────────────────────────────────────────
// Accepts pre-computed values[] and yAxis config. Handles spline, dots,
// value labels, X-axis labels, and hover/tap interaction.

export interface YAxisConfig {
  min: number;
  max: number;
  baseline: number | null;
  yLabels: { value: number; label: string }[];
}

interface TrendChartProps {
  /** Raw numeric values, one per bucket (null = no data for that bucket) */
  values: (number | null)[];
  /** X-axis label per bucket */
  labels: string[];
  yAxis: YAxisConfig;
  isDark: boolean;
  alwaysShowLabels: boolean;
  formatValue: (v: number) => string;
  /** Optional: override line/dot colour (defaults to chartColors lineStroke) */
  lineColor?: string;
}

export function TrendChart({
  values, labels, yAxis, isDark, alwaysShowLabels, formatValue, lineColor,
}: TrendChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  useEffect(() => { setActiveIdx(null); }, [values]);

  const C = chartColors(isDark);
  const { W, H, PAD } = CHART;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const { min: yMin, max: yMax, baseline, yLabels } = yAxis;
  const yRange = yMax - yMin || 1;

  function yForVal(v: number) { return PAD.t + plotH - ((v - yMin) / yRange) * plotH; }
  function xForIdx(i: number) {
    return values.length === 1 ? PAD.l + plotW / 2 : PAD.l + (i / (values.length - 1)) * plotW;
  }

  const pts = values
    .map((v, i) => v !== null ? { x: xForIdx(i), y: yForVal(v) } : null)
    .filter((p): p is { x: number; y: number } => p !== null);
  const linePath = smoothLinePath(pts);
  const stroke = lineColor ?? C.lineStroke;

  return (
    <div className="flex flex-col gap-1 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>

        {/* Y-axis grid + labels */}
        {yLabels.map(({ value, label }) => {
          const y = yForVal(value);
          const isBase = baseline !== null && value === baseline;
          return (
            <g key={label}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke={isBase ? C.baseline : C.gridLine}
                strokeWidth={isBase ? 1 : 0.5}
                strokeDasharray={isBase ? '4,4' : undefined} />
              <text x={PAD.l - 6} y={y + 4} textAnchor="end" fontSize={11} fill={C.yLabel}>
                {label}
              </text>
            </g>
          );
        })}

        {/* Spline */}
        {linePath && (
          <path d={linePath} fill="none" stroke={stroke} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        )}

        {/* Dots + labels + X-axis */}
        {values.map((v, i) => {
          const cx = xForIdx(i);
          const isActive = activeIdx === i;
          const dotY = v !== null ? yForVal(v) : null;
          const showLabel = v !== null && (alwaysShowLabels || isActive);
          const labelY = dotY !== null ? (dotY - PAD.t < 18 ? dotY + 16 : dotY - 8) : null;

          return (
            <g key={labels[i]} style={{ cursor: 'pointer' }}
              onClick={() => setActiveIdx(isActive ? null : i)}
              onMouseEnter={() => !alwaysShowLabels && setActiveIdx(i)}
              onMouseLeave={() => !alwaysShowLabels && setActiveIdx(null)}>
              <rect x={cx - 14} y={PAD.t} width={28} height={plotH} fill="transparent" />
              {v !== null && dotY !== null ? (
                <>
                  <circle cx={cx} cy={dotY} r={isActive ? 5 : 3.5} fill={stroke} opacity={isActive ? 1 : 0.9} />
                  {showLabel && labelY !== null && (
                    <text x={cx} y={labelY} textAnchor="middle" fontSize={11}
                      fill={C.valueLabel} fontWeight={isActive ? '700' : '600'}>
                      {formatValue(v)}
                    </text>
                  )}
                </>
              ) : (
                <line x1={cx - 4} y1={PAD.t + plotH} x2={cx + 4} y2={PAD.t + plotH}
                  stroke={C.noDataDash} strokeWidth={1.5} />
              )}
              <text x={cx} y={H - 4} textAnchor="middle" fontSize={11}
                fill={i === values.length - 1 ? C.xLabelLast : C.xLabelDim}>
                {formatBucketLabel(labels[i])}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
