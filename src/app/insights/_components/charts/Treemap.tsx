'use client';
// src/app/insights/_components/charts/Treemap.tsx
//
// CSS-positioned squarified treemap. Cells are absolutely-positioned divs sized
// in real pixels (measured via ResizeObserver) so the squarified aspect ratios
// are correct at any width. No SVG — consistent with the CSS-first chart family.

import { useMemo, useRef, useState, useLayoutEffect } from 'react';

export interface TreemapDatum {
  label: string;
  value: number;
  fill: string;
  text: string;
}

// ── Squarified layout (Bruls et al.) ──────────────────────────────────────────
// Lays `values` into the rectangle (0,0,W,H). Assumes values are sorted desc.

function squarify(values: number[], W: number, H: number) {
  const out: { x: number; y: number; w: number; h: number }[] = new Array(values.length);
  const total = values.reduce((s, v) => s + v, 0) || 1;
  const scale = (W * H) / total;
  const area = values.map(v => v * scale);
  let x = 0, y = 0, w = W, h = H;

  const worst = (s0: number, s1: number, side: number) => {
    let s = 0, mx = 0, mn = Infinity;
    for (let k = s0; k < s1; k++) {
      s += area[k];
      if (area[k] > mx) mx = area[k];
      if (area[k] < mn) mn = area[k];
    }
    if (s <= 0) return Infinity;
    const s2 = s * s, d2 = side * side;
    return Math.max((d2 * mx) / s2, s2 / (d2 * mn));
  };

  const place = (s0: number, s1: number) => {
    let s = 0;
    for (let k = s0; k < s1; k++) s += area[k];
    if (w >= h) {
      const stripW = s / h;
      let cy = y;
      for (let k = s0; k < s1; k++) {
        const ih = area[k] / stripW;
        out[k] = { x, y: cy, w: stripW, h: ih };
        cy += ih;
      }
      x += stripW; w -= stripW;
    } else {
      const stripH = s / w;
      let cx = x;
      for (let k = s0; k < s1; k++) {
        const iw = area[k] / stripH;
        out[k] = { x: cx, y, w: iw, h: stripH };
        cx += iw;
      }
      y += stripH; h -= stripH;
    }
  };

  let rowStart = 0, cur = 0;
  while (cur < values.length) {
    const side = Math.min(w, h);
    if (cur === rowStart) { cur++; continue; }
    if (worst(rowStart, cur + 1, side) <= worst(rowStart, cur, side)) cur++;
    else { place(rowStart, cur); rowStart = cur; }
  }
  place(rowStart, cur);
  return out;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Treemap({
  data,
  isDark,
  maxCells = 20,
  height = 170,
  othersLabel = '기타',
}: {
  data: TreemapDatum[];
  isDark: boolean;
  maxCells?: number;
  height?: number;
  othersLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sort desc, then roll the tail beyond maxCells into a single neutral "others" cell.
  const cells = useMemo<TreemapDatum[]>(() => {
    const sorted = data.filter(d => d.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= maxCells) return sorted;
    const head = sorted.slice(0, maxCells - 1);
    const tail = sorted.slice(maxCells - 1);
    const sum = tail.reduce((s, d) => s + d.value, 0);
    return [
      ...head,
			{
        label: `${othersLabel} (+${tail.length})`,
        value: sum,
        fill: isDark ? '#a1a1aa' : '#78716c',   // zinc-400 / stone-500
        text: isDark ? '#18181b' : '#ffffff',
      },
    ];
  }, [data, maxCells, othersLabel, isDark]);

  const rects = useMemo(
    () => (w && cells.length ? squarify(cells.map(c => c.value), w, height) : []),
    [cells, w, height],
  );

  if (!data.some(d => d.value > 0)) {
    return <p className="text-xs text-stone-400 dark:text-zinc-500">No data</p>;
  }

  const gap = isDark ? '#18181b' : '#ffffff';  // zinc-900 / white — cell separator

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {rects.map((r, i) => {
        const c = cells[i];
        const showLabel = r.w > 34 && r.h > 22;
        const showVal   = r.w > 44 && r.h > 34;
        const fs = Math.max(10, Math.min(13, Math.round(Math.min(r.w, r.h) / 4)));
        return (
          <div
            key={c.label + i}
            title={`${c.label} · ${Math.round(c.value)}`}
            className="absolute flex flex-col items-center justify-center text-center overflow-hidden"
            style={{
              left: r.x, top: r.y, width: r.w, height: r.h,
              background: c.fill, color: c.text,
              border: `1px solid ${gap}`,
              lineHeight: 1.05, padding: '0 2px',
            }}
          >
            {showLabel && (
              <span className="truncate max-w-full" style={{ fontSize: fs, fontWeight: 500 }}>
                {c.label}
              </span>
            )}
            {showVal && (
              <span style={{ fontSize: Math.max(9, fs - 2), opacity: 0.75 }}>
                {Math.round(c.value)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
