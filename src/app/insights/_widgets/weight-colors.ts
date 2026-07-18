// src/app/insights/_widgets/weight-colors.ts
// Shared weight-segment palette. Extracted from WeightWidget so the Trend
// view can use it without importing from its own parent (which would be a
// circular import).
//
// Fixed semantic segments, so colours are pinned rather than auto-assigned
// from barColors/autoColorMap (which exist for dynamic key sets). Orange
// always means fat. Same rationale as QualityPie in SleepWidget.

export const SEG = {
  muscle: { name: 'Skeletal Muscle', light: '#1d4ed8', dark: '#2dd4bf' },
  fat:    { name: 'Fat',             light: '#ea580c', dark: '#f97316' },
  other:  { name: 'Other',           light: '#a8a29e', dark: '#71717a' },
} as const;

export type SegKey = keyof typeof SEG;

/** Summary bar left → right, and Trend stack bottom → top. Kept identical on
 *  purpose: muscle sits at the bottom of the stack, so if the y-axis is
 *  cropped it is the only band that loses its base. Fat and other stay whole. */
export const SEG_ORDER: SegKey[] = ['muscle', 'fat', 'other'];

export const segColor  = (k: SegKey, d: boolean) => (d ? SEG[k].dark : SEG[k].light);
export const soloColor = (d: boolean) => (d ? '#2dd4bf' : '#1d4ed8');
