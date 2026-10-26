// src/app/insights/_lib/day-bands.ts
// Three-band day colours for the daily strips (26 Oct 2026): blue = low, amber =
// middle, red = high. The Diet strip bands the carbs index (below 4 / 4–8 / over
// 8) and the Drinking strip the drinks (below 4 / 4–10 / over 10). Same colours
// the Spicy days strip used, so the cards still read alike.

export type DayBand = 'low' | 'mid' | 'high';

export function bandFill(isDark: boolean): Record<DayBand, string> {
  return {
    low:  isDark ? '#60a5fa' : '#3b82f6',   // blue
    mid:  isDark ? '#fbbf24' : '#f59e0b',   // amber
    high: isDark ? '#f87171' : '#ef4444',   // red
  };
}

/** below `lowBelow` → low; up to and including `midUpTo` → mid; above → high. */
export function bandOf(value: number, lowBelow: number, midUpTo: number): DayBand {
  return value < lowBelow ? 'low' : value <= midUpTo ? 'mid' : 'high';
}

export const BAND_WORD: Record<DayBand, string> = { low: 'blue', mid: 'amber', high: 'red' };

/** 1 decimal, no trailing .0 — 2, 2.3 */
export const fmt1 = (v: number) => String(Math.round(v * 10) / 10);
