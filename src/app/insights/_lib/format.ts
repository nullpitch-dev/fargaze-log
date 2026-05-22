// src/app/insights/_lib/format.ts

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatQualityScore(score: number): string {
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}

export function formatBucketLabel(label: string): string {
  if (/^\d{4}-\d{2}$/.test(label)) {
    const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return names[parseInt(label.split('-')[1]) - 1];
  }
  // Week label — handles both "2026-W21" (raw) and "2026W21" / "W21" (compressed)
  if (/W\d+/.test(label)) {
    if (label.includes('-W')) return `W${label.split('-W')[1]}`;
    const m = label.match(/^(\d{2,4})?(W\d{2})$/);
    return m ? m[2] : label;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label.split('-')[2];
  return label;
}
