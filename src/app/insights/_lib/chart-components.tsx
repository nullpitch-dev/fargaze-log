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

// ── YAxisConfig ───────────────────────────────────────────────────────────────

export interface YAxisConfig {
  min: number;
  max: number;
  baseline: number | null;
  yLabels: { value: number; label: string }[];
}

// ── TrendChart — single-series line chart ─────────────────────────────────────

interface TrendChartProps {
  values: (number | null)[];
  labels: string[];
  yAxis: YAxisConfig;
  isDark: boolean;
  alwaysShowLabels: boolean;
  formatValue: (v: number) => string;
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

        {linePath && (
          <path d={linePath} fill="none" stroke={stroke} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        )}

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

// ── StackedBarChart — 100% stacked bar chart ──────────────────────────────────
//
// Props:
//   buckets     — array of { label, data: Record<string, number> }
//   colorMap    — category → hex colour
//   isDark      — from useIsDark()
//   neutralGrey — fallback colour for unknown categories

export interface StackedBarBucket {
  label: string;
  data: Record<string, number>;
}

interface StackedBarChartProps {
  buckets: StackedBarBucket[];
  colorMap: Record<string, string>;
  isDark: boolean;
  neutralGrey?: string;
}

export function StackedBarChart({
  buckets, colorMap, isDark, neutralGrey,
}: StackedBarChartProps) {
  const [hoveredCell, setHoveredCell] = useState<{ bi: number; cat: string } | null>(null);
  const C  = chartColors(isDark);
  const ng = neutralGrey ?? (isDark ? '#71717a' : '#a8a29e');
  const { W, H, PAD } = CHART;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const cats = [...new Set(buckets.flatMap(b => Object.keys(b.data)))].filter(c => c.trim() !== '');
  const n    = buckets.length;
  const barW = Math.min(64, (plotW / n) * 0.75);
  const gap  = plotW / n;
  const barX = (i: number) => PAD.l + i * gap + (gap - barW) / 2;
  const barCX = (i: number) => PAD.l + i * gap + gap / 2;

  const hoveredCat = hoveredCell?.cat ?? null;

  return (
    <div className="flex flex-col gap-1 flex-1">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        {[0, 25, 50, 75, 100].map(pct => {
          const y = PAD.t + plotH - (pct / 100) * plotH;
          return (
            <g key={pct}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y}
                stroke={pct === 0 ? C.baseline : C.gridLine}
                strokeWidth={pct === 0 ? 1 : 0.5}
                strokeDasharray={pct === 0 ? '4 3' : undefined} />
              <text x={PAD.l - 5} y={y} textAnchor="end" dominantBaseline="central"
                fontSize={10} fill={C.yLabel}>{pct}%</text>
            </g>
          );
        })}

        {buckets.map((b, bi) => {
          const total = Object.values(b.data).reduce((s, v) => s + v, 0) || 1;
          let cumPct  = 0;
          return (
            <g key={bi}>
              <text
                x={barCX(bi)} y={H - 4}
                textAnchor="middle" dominantBaseline="auto" fontSize={11}
                fill={bi === n - 1 ? C.xLabelLast : C.xLabelDim}
              >{b.label}</text>
              {cats.map(cat => {
                const pct = ((b.data[cat] ?? 0) / total) * 100;
                if (pct === 0) return null;
                const segH  = (pct / 100) * plotH;
                const segY  = PAD.t + plotH - ((cumPct + pct) / 100) * plotH;
                const isHov = hoveredCell?.bi === bi && hoveredCell?.cat === cat;
                cumPct += pct;
                return (
                  <g key={cat}>
                    <rect x={barX(bi)} y={segY} width={barW} height={segH}
                      fill={colorMap[cat] ?? ng} opacity={isHov ? 1 : 0.82} rx="2"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredCell({ bi, cat })}
                      onMouseLeave={() => setHoveredCell(null)}
                      onClick={() => setHoveredCell(isHov ? null : { bi, cat })} />
                    {isHov && (
                      <text x={barX(bi) + barW / 2} y={segY + segH / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={10} fontWeight="500" fill="#fff"
                        style={{ pointerEvents: 'none' }}>{b.data[cat]}</text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Legend with hover highlight */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-1" style={{ fontSize: 11 }}>
        {cats.map(cat => {
          const isActive = hoveredCat === cat;
          return (
            <span key={cat} className="flex items-center gap-1 transition-opacity"
              style={{
                color: isActive ? (colorMap[cat] ?? ng) : (isDark ? '#a1a1aa' : '#78716c'),
                fontWeight: isActive ? 600 : 400,
                opacity: hoveredCat !== null && !isActive ? 0.4 : 1,
              }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2, flexShrink: 0, display: 'inline-block',
                background: colorMap[cat] ?? ng,
                outline: isActive ? `2px solid ${colorMap[cat] ?? ng}` : 'none',
                outlineOffset: 1,
              }} />
              {cat}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── RankedFlowChart — ranked slots with transitioning block + connecting lines ─
//
// Generalised version of the "Top 7" chart.
// Props:
//   buckets      — array of { label, ranked: {name, count}[], transitioning: string[] }
//   topN         — number of ranked slots to show (e.g. 7)
//   colorMap     — name → hex colour (stable across buckets)
//   isDark       — from useIsDark()
//   neutralGrey  — fallback / transitioning block colour

export interface RankedFlowBucket {
  label: string;
  ranked: { name: string; count: number }[];
  transitioning: string[];
}

interface RankedFlowChartProps {
  buckets: RankedFlowBucket[];
  topN: number;
  colorMap: Record<string, string>;
  isDark: boolean;
  neutralGrey?: string;
}

const SLOT_H       = 28;
const TRANS_LINE_H = 18;
const TRANS_PAD    = 6;

export function RankedFlowChart({
  buckets, topN, colorMap, isDark, neutralGrey,
}: RankedFlowChartProps) {
  const [hoveredCell, setHoveredCell] = useState<{ bi: number; name: string } | null>(null);
  const C  = chartColors(isDark);
  const ng = neutralGrey ?? (isDark ? '#71717a' : '#a8a29e');
  const { W, PAD } = CHART;

  // No Y-axis — use full width with small side margin
  const SIDE  = 8;
  const plotW = W - SIDE * 2;

  const maxTransLines = Math.max(...buckets.map(b => Math.max(b.transitioning.length, 1)), 1);
  const TRANS_H = TRANS_PAD * 2 + maxTransLines * TRANS_LINE_H;
  const REF_Y   = PAD.t + SLOT_H * topN;
  const SVG_H   = REF_Y + TRANS_H + PAD.b + 20;

  const n    = buckets.length;
  const barW = Math.min(80, (plotW / n) * 0.78);
  const gap  = plotW / n;
  const bCX  = (i: number) => SIDE + i * gap + gap / 2;
  const bX   = (i: number) => bCX(i) - barW / 2;
  const sCY  = (rank: number) => PAD.t + rank * SLOT_H + SLOT_H / 2;
  const transCY = REF_Y + TRANS_H / 2;

  // Top-N ↔ top-N connecting lines (solid)
  const connections: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  for (let bi = 0; bi < n - 1; bi++) {
    const cNames = buckets[bi].ranked.map(p => p.name);
    const nNames = buckets[bi + 1].ranked.map(p => p.name);
    for (const name of cNames) {
      const ni = nNames.indexOf(name);
      if (ni === -1) continue;
      connections.push({
        x1: bCX(bi) + barW / 2, y1: sCY(cNames.indexOf(name)),
        x2: bCX(bi + 1) - barW / 2, y2: sCY(ni),
        color: colorMap[name] ?? ng,
      });
    }
  }

  // Top-N ↔ below-the-line connecting lines (dashed)
  const dropConnections: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  for (let bi = 0; bi < n; bi++) {
    const currNames = buckets[bi].ranked.map(p => p.name);
    if (bi < n - 1) {
      // Person drops out next bucket
      const nextTrans = buckets[bi + 1].transitioning;
      for (const name of currNames) {
        if (nextTrans.includes(name)) {
          dropConnections.push({
            x1: bCX(bi) + barW / 2, y1: sCY(currNames.indexOf(name)),
            x2: bCX(bi + 1) - barW / 2, y2: transCY,
            color: colorMap[name] ?? ng,
          });
        }
      }
      // Person enters next bucket from transitioning
      const currTrans = buckets[bi].transitioning;
      const nextNames = buckets[bi + 1].ranked.map(p => p.name);
      for (const name of currTrans) {
        if (nextNames.includes(name)) {
          dropConnections.push({
            x1: bCX(bi) + barW / 2, y1: transCY,
            x2: bCX(bi + 1) - barW / 2, y2: sCY(nextNames.indexOf(name)),
            color: colorMap[name] ?? ng,
          });
        }
      }
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <svg viewBox={`0 0 ${W} ${SVG_H}`} width="100%" style={{ overflow: 'visible' }}>
        {/* Connecting lines — drawn behind bars */}
        {connections.map((c, i) => (
          <line key={`t-${i}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke={c.color} strokeWidth="1.5" strokeOpacity="0.45" />
        ))}
        {dropConnections.map((c, i) => (
          <line key={`d-${i}`} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
            stroke={c.color} strokeWidth="1" strokeOpacity="0.3" strokeDasharray="3 2" />
        ))}

        {/* Reference line */}
        <line x1={SIDE} y1={REF_Y} x2={W - SIDE} y2={REF_Y}
          stroke={C.baseline} strokeWidth="1" strokeDasharray="4 3" />

        {buckets.map((b, bi) => (
          <g key={bi}>
            {/* Ranked slots */}
            {Array.from({ length: topN }, (_, rank) => {
              const person = b.ranked[rank];
              const slotY  = PAD.t + rank * SLOT_H;
              const isHov  = hoveredCell?.bi === bi && hoveredCell?.name === person?.name;
              const color  = person ? (colorMap[person.name] ?? ng) : 'transparent';
              return (
                <g key={rank}>
                  {person ? (
                    <>
                      <rect x={bX(bi)} y={slotY} width={barW} height={SLOT_H - 2}
                        fill={color} opacity={isHov ? 1 : 0.82} rx="2"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredCell({ bi, name: person.name })}
                        onMouseLeave={() => setHoveredCell(null)}
                        onClick={() => setHoveredCell(isHov ? null : { bi, name: person.name })} />
                      <text x={bCX(bi)} y={slotY + SLOT_H / 2}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize="10" fontWeight="500" fill="#fff"
                        style={{ pointerEvents: 'none' }}>
                        {isHov
                          ? person.count
                          : person.name.length > 6 ? person.name.slice(0, 5) + '…' : person.name}
                      </text>
                    </>
                  ) : (
                    <rect x={bX(bi)} y={slotY} width={barW} height={SLOT_H - 2}
                      fill={isDark ? '#3f3f46' : '#e7e5e4'} rx="2" opacity="0.35" />
                  )}
                </g>
              );
            })}

            {/* Transitioning block */}
            <rect x={bX(bi)} y={REF_Y + 3} width={barW} height={TRANS_H - 6}
              fill={ng} opacity="0.15" rx="2" />
            {b.transitioning.length === 0 ? (
              <text x={bCX(bi)} y={transCY}
                textAnchor="middle" dominantBaseline="central"
                fontSize="9" fill={isDark ? '#52525b' : '#d6d3d1'}>—</text>
            ) : b.transitioning.map((name, ni) => (
              <text key={ni} x={bCX(bi)}
                y={REF_Y + TRANS_PAD + ni * TRANS_LINE_H + TRANS_LINE_H / 2}
                textAnchor="middle" dominantBaseline="central"
                fontSize="9" fill={C.yLabel}>
                {name.length > 6 ? name.slice(0, 5) + '…' : name}
              </text>
            ))}

            {/* X label */}
            <text x={bCX(bi)} y={REF_Y + TRANS_H + 14}
              textAnchor="middle" fontSize={11}
              fill={bi === n - 1 ? C.xLabelLast : C.xLabelDim}>{b.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
