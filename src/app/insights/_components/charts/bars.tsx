// src/app/insights/_components/charts/bars.tsx
// Standardised horizontal-bar primitives shared by the Diet, Drinking, and
// Interactions summaries. Geometry from Interactions (h-1.5 rounded-full),
// typography from Diet (label stone-600 / zinc-300). Bars are max-normalised
// (longest = full width); the value column shows share-of-total % and the raw
// count. Fills come from the dedicated barColors palette via autoColorMap — no
// hard-coded per-category colour maps.

import React from 'react';
import { autoColorMap } from '../../_lib/chart-colors';

const neutral = (isDark: boolean) => (isDark ? '#52525b' : '#a8a29e');

// Shared sub-title — change the title format here and every widget follows.
export function Title({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium text-stone-400 dark:text-zinc-500 uppercase tracking-wide truncate">
      {children}
    </span>
  );
}

export function BarRow({ label, count, pct, frac, color }: {
  label: string; count: number; pct: number; frac: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 shrink-0 truncate text-stone-600 dark:text-zinc-300">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-stone-100 dark:bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full"
          style={{ width: `${Math.max(2, frac * 100)}%`, background: color }} />
      </div>
      <span className="w-16 shrink-0 text-right tabular-nums whitespace-nowrap text-stone-500 dark:text-zinc-400">
        {pct}% ({count})
      </span>
    </div>
  );
}

// Sorted desc, max-normalised. Pass a colorMap to control fills (e.g. to share
// the relation palette with a People list); omit it to auto-assign by rank.
export function BarSection({ title, data, colorMap, isDark }: {
  title: string;
  data: Record<string, number>;
  colorMap?: Record<string, string>;
  isDark: boolean;
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  const max = entries[0][1];
  const cmap = colorMap ?? autoColorMap(entries.map(([k]) => k), isDark);
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Title>{title}</Title>
      <div className="flex flex-col gap-1">
        {entries.map(([k, v]) => (
          <BarRow key={k} label={k} count={v}
            pct={Math.round((v / sum) * 100)} frac={v / max}
            color={cmap[k] ?? neutral(isDark)} />
        ))}
      </div>
    </div>
  );
}
