// src/lib/insights/sleep.ts
import { SLEEP_THRESHOLD_HOUR, hourStringToMinutes } from './dates';

const QUALITY_SCORE: Record<string, number> = {
  '좋음': 1,
  '보통': 0,
  '나쁨': -1,
};


export function computeSleepSummary(docs: any[]) {
  const valid = docs.filter(
    d =>
      d.activity?.category === '생리' &&
      d.activity?.name === '수면' &&
      d.duration?.totalSeconds != null &&
      d.duration.totalSeconds >= 3600,
  );
  if (!valid.length) return null;

  const totalSec  = valid.reduce((s, d) => s + d.duration.totalSeconds, 0);
  const avgSec    = totalSec / valid.length;
  const bedtimes  = valid.map(d => hourStringToMinutes(d.start?.hour)).filter((v): v is number => v !== null);
  const waketimes = valid.map(d => hourStringToMinutes(d.end?.hour)).filter((v): v is number => v !== null);

  const adjustedBedtimes = bedtimes.map(m => (m < SLEEP_THRESHOLD_HOUR * 60 ? m + 1440 : m));
  const avgBedtimeMins   = adjustedBedtimes.length ? adjustedBedtimes.reduce((s, v) => s + v, 0) / adjustedBedtimes.length : null;
  const avgWaketimeMins  = waketimes.length ? waketimes.reduce((s, v) => s + v, 0) / waketimes.length : null;

  function minsToClockStr(m: number | null): string | null {
    if (m === null) return null;
    const wrapped = Math.round(m) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(Math.round(wrapped % 60)).padStart(2, '0')}`;
  }

  const qualityCounts: Record<string, number> = {};
  let qualitySum = 0, qualityN = 0;
  for (const d of valid) {
    const q = d.sleep?.quality;
    if (q) {
      qualityCounts[q] = (qualityCounts[q] ?? 0) + 1;
      const score = QUALITY_SCORE[q];
      if (score !== undefined) { qualitySum += score; qualityN++; }
    }
  }

  return {
    count:    valid.length,
    duration: { avgSeconds: Math.round(avgSec) },
    bedtime:  { avgClock: minsToClockStr(avgBedtimeMins) },
    waketime: { avgClock: minsToClockStr(avgWaketimeMins) },
    quality:  {
      counts:   qualityCounts,
      avgScore: qualityN ? Math.round((qualitySum / qualityN) * 100) / 100 : null,
    },
  };
}

