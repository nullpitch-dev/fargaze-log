// src/app/insights/_lib/chart-colors.ts

// SVG cannot use Tailwind classes — all colours are explicit hex per mode.
// This is the canonical colour template for all Insights widgets.

export function chartColors(isDark: boolean) {
  return {
    gridLine:    isDark ? '#3f3f46' : '#e7e5e4',  // zinc-700  / stone-200
    baseline:    isDark ? '#71717a' : '#78716c',  // zinc-500  / stone-500
    yLabel:      isDark ? '#a1a1aa' : '#a8a29e',  // zinc-400  / stone-400
    xLabelDim:   isDark ? '#71717a' : '#a8a29e',  // zinc-500  / stone-400
    xLabelLast:  isDark ? '#d4d4d8' : '#57534e',  // zinc-300  / stone-600
    valueLabel:  isDark ? '#f4f4f5' : '#292524',  // zinc-100  / stone-800
    noDataDash:  isDark ? '#52525b' : '#d6d3d1',  // zinc-600  / stone-300
    lineStroke:  isDark ? '#2dd4bf' : '#1d4ed8',  // teal-400  / blue-700
    dotPositive: isDark ? '#2dd4bf' : '#1d4ed8',  // teal-400  / blue-700
    dotNegative: isDark ? '#f87171' : '#b91c1c',  // red-400   / red-700
    dotNeutral:  isDark ? '#71717a' : '#78716c',  // zinc-500  / stone-500
  };
}

// Consistent per-person colours for multi-series charts (up to 5 series)
export const PERSON_COLORS_LIGHT = ['#1d4ed8', '#7c3aed', '#b45309', '#047857', '#be123c'];
export const PERSON_COLORS_DARK  = ['#60a5fa', '#a78bfa', '#fbbf24', '#34d399', '#fb7185'];

export function personColors(isDark: boolean): string[] {
  return isDark ? PERSON_COLORS_DARK : PERSON_COLORS_LIGHT;
}

// Categorical palette for grouped charts (treemaps, etc.). Assigned by INDEX,
// never keyed on domain values — keeps charts taxonomy-agnostic.
// Light mode = darker fills (white text); dark mode = lighter fills (dark text).
export const CATEGORY_COLORS_LIGHT = [
  '#1d4ed8', '#be123c', '#15803d', '#c2410c', '#7c3aed', '#0891b2',
  '#b45309', '#db2777', '#4d7c0f', '#0f766e', '#a21caf', '#4338ca',
  '#a16207', '#0369a1', '#6d28d9', '#57534e',
];
export const CATEGORY_COLORS_DARK = [
  '#60a5fa', '#fb7185', '#4ade80', '#fb923c', '#a78bfa', '#22d3ee',
  '#fcd34d', '#f472b6', '#a3e635', '#2dd4bf', '#e879f9', '#818cf8',
  '#facc15', '#38bdf8', '#c4b5fd', '#a8a29e',
];
export function categoryColors(isDark: boolean): string[] {
  return isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
}
