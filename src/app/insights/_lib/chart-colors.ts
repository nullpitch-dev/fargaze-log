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

// A different lightness tier than the base 16, so a repeated hue still reads
// distinct: pale fills in light mode, deep fills in dark mode. Tile text picks
// black/white per fill, so both tiers stay legible.
const RANKFLOW_EXTRA_LIGHT = [
  '#f9a8d4', '#fdba74', '#86efac', '#93c5fd', '#fde047', '#d8b4fe',
  '#5eead4', '#fca5a5', '#a3e635', '#67e8f9', '#c4b5fd', '#cbd5e1',
];
const RANKFLOW_EXTRA_DARK = [
  '#9d174d', '#9a3412', '#166534', '#1e40af', '#854d0e', '#6b21a8',
  '#115e59', '#991b1b', '#3f6212', '#155e75', '#5b21b6', '#334155',
];
// The base-16 has two near-identical violets (indices 4 & 14); recolour the
// second one for the rank-flow so people landing on it don't read as the same
// purple. categoryColors itself is untouched (treemaps keep their order).
const _rfLight = [...CATEGORY_COLORS_LIGHT]; _rfLight[14] = '#92400e';  // 2nd violet → brown
const _rfDark  = [...CATEGORY_COLORS_DARK];  _rfDark[14]  = '#d4a373';  // 2nd violet → tan
export const RANKFLOW_COLORS_LIGHT = [..._rfLight, ...RANKFLOW_EXTRA_LIGHT];
export const RANKFLOW_COLORS_DARK  = [..._rfDark,  ...RANKFLOW_EXTRA_DARK];
export function rankFlowColors(isDark: boolean): string[] {
  return isDark ? RANKFLOW_COLORS_DARK : RANKFLOW_COLORS_LIGHT;
}

// Dedicated palette for the standardised horizontal bar charts (Diet / Drinking /
// Interactions summaries). Its own set — intentionally NOT categoryColors or
// rankFlowColors — so the bars stay visually independent of the treemap/rank-flow.
// Assigned by index (see autoColorMap), never keyed on domain values.
export const BAR_COLORS_LIGHT = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#9333ea', '#0d9488', '#e11d48',
  '#65a30d', '#ea580c', '#c026d3', '#0284c7', '#ca8a04', '#4f46e5', '#475569',
];
export const BAR_COLORS_DARK = [
  '#60a5fa', '#f87171', '#4ade80', '#fbbf24', '#c084fc', '#2dd4bf', '#fb7185',
  '#a3e635', '#fb923c', '#e879f9', '#38bdf8', '#facc15', '#818cf8', '#94a3b8',
];
export function barColors(isDark: boolean): string[] {
  return isDark ? BAR_COLORS_DARK : BAR_COLORS_LIGHT;
}

// Assign palette colours to keys by their given order (caller decides order,
// e.g. descending count), wrapping if there are more keys than colours.
export function autoColorMap(keys: string[], isDark: boolean): Record<string, string> {
  const palette = barColors(isDark);
  const map: Record<string, string> = {};
  keys.forEach((k, i) => { map[k] = palette[i % palette.length]; });
  return map;
}
