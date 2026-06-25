'use client';
// src/app/insights/_components/charts/CssRankFlowChart.tsx
// CSS-only ranked-flow ("Top-N over time"). Columns of colour-tiles ranked
// top→bottom, a dashed reference line, and a grey block below listing people
// who DROPPED out of the previous bucket's top-N. Each person keeps one fixed
// colour; hovering a tile highlights that person across every bucket (showing
// their per-bucket count) and dims the rest — that's how you trace someone,
// since there are no connecting lines. Tile text colour adapts to fill
// luminance. No SVG. Shared by Diet (companions) and Interactions.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { chartColors, rankFlowColors } from '../../_lib/chart-colors';
import { formatBucketLabels } from './css-chart-components';

export interface RankFlowBucket {
  label: string;
  ranked: { name: string; count: number }[];   // desc, length ≤ topN
}

const SLOT_H = 28;
const TILE_GAP = 2;
const TRANS_LINE_H = 16;
const TRANS_PAD = 8;

const trunc = (s: string) => (s.length > 6 ? s.slice(0, 5) + '…' : s);

// Black or white text depending on fill brightness (per tile, not per mode).
function textOn(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#18181b' : '#ffffff';
}

export function CssRankFlowChart({
  buckets, topN, isDark, controls,
}: {
  buckets: RankFlowBucket[];
  topN: number;
  isDark: boolean;
  controls?: React.ReactNode;
}) {
	const [hoverName, setHoverName] = useState<string | null>(null);
  const [blurNames, setBlurNames] = useState(false);
  const [tip, setTip] = useState<{ name: string; x: number; top: number; bottom: number } | null>(null);

  const C  = chartColors(isDark);
  const ng = isDark ? '#71717a' : '#a8a29e';

  if (!buckets.length) return <p className="text-xs" style={{ color: ng }}>No data</p>;

	const n = buckets.length;
  const xLabels = formatBucketLabels(buckets.map(b => b.label));

  const palette = rankFlowColors(isDark);
  const order: string[] = [];
  for (const b of buckets) for (const p of b.ranked) if (!order.includes(p.name)) order.push(p.name);
  const colorMap: Record<string, string> = {};
  order.forEach((name, i) => { colorMap[name] = palette[i % palette.length]; });

  const present = buckets.map(b => b.ranked.map(p => p.name));
  const dropped: string[][] = buckets.map((_, bi) =>
    bi === 0 ? [] : present[bi - 1].filter(name => !present[bi].includes(name)),
  );

  const slotsH  = topN * SLOT_H;
  const maxDrop = Math.max(...dropped.map(d => d.length), 1);
  const greyH   = TRANS_PAD * 2 + maxDrop * TRANS_LINE_H;
  const plotH   = slotsH + greyH;
  const refY    = slotsH;

  const blurStyle = blurNames ? { filter: 'blur(4px)' } : undefined;

  return (
		<div className="flex flex-col gap-1 w-full select-none">
			<div className="flex items-center justify-end gap-3">
        {controls}
        <label className="flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0" style={{ color: ng }}>
          <input type="checkbox" checked={blurNames} onChange={e => setBlurNames(e.target.checked)} />
          Blur names
        </label>
      </div>

      <div className="relative w-full" style={{ height: plotH }}>
        <div className="absolute left-0 right-0" style={{ top: refY, borderTop: `1px dashed ${C.baseline}` }} />

        <div className="relative flex w-full h-full">
          {buckets.map((b, bi) => (
            <div key={bi} className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
              {Array.from({ length: topN }, (_, rank) => {
                const person = b.ranked[rank];
                const isHi = !!person && hoverName === person.name;
                const dim  = hoverName !== null && !isHi;
                const fill = person ? (colorMap[person.name] ?? ng) : '';
                return (
                  <div key={rank} style={{ height: SLOT_H, padding: `0 3px ${TILE_GAP}px` }}>
                    {person ? (
											<div onMouseEnter={e => {
                          setHoverName(person.name);
                          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          setTip({ name: person.name, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
                        }}
                        onMouseLeave={() => { setHoverName(null); setTip(null); }}
                        className="flex items-center justify-center h-full rounded cursor-pointer"
                        style={{ background: fill, opacity: dim ? 0.22 : 1, transition: 'opacity 120ms ease' }}>
                        <span style={{ color: textOn(fill), fontSize: 10, fontWeight: 600,
                          ...(isHi ? undefined : blurStyle) }}>
                          {isHi ? person.count : trunc(person.name)}
                        </span>
                      </div>
                    ) : (
                      <div className="h-full rounded"
                        style={{ background: isDark ? '#3f3f46' : '#e7e5e4', opacity: 0.35 }} />
                    )}
                  </div>
                );
              })}

							<div className="flex flex-col items-center justify-start rounded"
                style={{ height: greyH, margin: '0 3px', paddingTop: TRANS_PAD, background: `${ng}26` }}>
                {dropped[bi].length === 0 ? (
                  <span style={{ fontSize: 9, color: isDark ? '#52525b' : '#d6d3d1' }}>—</span>
                ) : dropped[bi].map((name, di) => {
                  const isHi = hoverName === name;
                  const dim  = hoverName !== null && !isHi;
                  return (
                    <span key={di} style={{ fontSize: 9, lineHeight: `${TRANS_LINE_H}px`,
                      color: isHi ? (colorMap[name] ?? C.yLabel) : C.yLabel,
                      fontWeight: isHi ? 700 : 400, opacity: dim ? 0.3 : 1, ...blurStyle }}>
                      {trunc(name)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex w-full">
        {buckets.map((b, bi) => (
          <div key={bi} className="flex-1 text-center"
            style={{ fontSize: 11, color: bi === n - 1 ? C.xLabelLast : C.xLabelDim,
              fontWeight: bi === n - 1 ? 600 : 400 }}>
						{xLabels[bi]}
          </div>
        ))}
      </div>

      {tip && !blurNames && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            left: Math.max(60, Math.min(tip.x, window.innerWidth - 60)),
            top: tip.top < 40 ? tip.bottom + 6 : tip.top - 6,
            transform: tip.top < 40 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            background: isDark ? '#27272a' : '#1c1917',
            color: '#fff',
          }}
          className="z-50 pointer-events-none whitespace-nowrap rounded px-2 py-0.5 text-[11px] shadow-lg">
          {tip.name}
        </div>,
        document.body,
      )}
    </div>
  );
}
