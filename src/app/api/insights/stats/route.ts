// src/app/api/insights/stats/route.ts
// Replace the entire file with this version.
// Changes vs previous: interactions.summary now supports mode=trend,
// returning per-bucket totalCount, uniquePeopleCount, byRelationType,
// byMethod, top7, and transitioning arrays.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/mongodb';
import Log from '@/models/Log';
import AlcoholConversion from '@/models/AlcoholConversion';

// ── Constants ─────────────────────────────────────────────────────────────────

const SLEEP_THRESHOLD_HOUR = 6;

const QUALITY_SCORE: Record<string, number> = {
  '좋음': 1,
  '보통': 0,
  '나쁨': -1,
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function hourStringToMinutes(hourStr: string | null | undefined): number | null {
  if (!hourStr) return null;
  const [hPart, mPart] = hourStr.split(':');
  const h = parseInt(hPart);
  const m = parseInt(mPart ?? '0');
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function assignSleepDate(startDatetime: Date, startHour: string | null | undefined): Date {
  const mins = hourStringToMinutes(startHour);
  if (mins !== null && mins < SLEEP_THRESHOLD_HOUR * 60) {
    const d = new Date(startDatetime);
    d.setDate(d.getDate() - 1);
    return d;
  }
  return startDatetime;
}

function buildDateRange(
  timeMode: string,
  timePeriod: string | null,
  dateFrom: string | null,
  dateTo: string | null,
): { start: Date; end: Date } {
  if (timeMode === 'period' && dateFrom && dateTo) {
    return {
      start: new Date(`${dateFrom}T00:00:00.000Z`),
      end:   new Date(`${dateTo}T23:59:59.999Z`),
    };
  }
  if (timeMode === 'month' && timePeriod) {
    const [y, m] = timePeriod.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end   = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    return { start, end };
  }
  if (timeMode === 'week' && timePeriod) {
    const [yearStr, weekStr] = timePeriod.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }
  if (timeMode === 'day' && timePeriod) {
    return {
      start: new Date(`${timePeriod}T00:00:00.000Z`),
      end:   new Date(`${timePeriod}T23:59:59.999Z`),
    };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

function stepBack(
  timeMode: string,
  timePeriod: string,
  steps: number,
): string {
  if (timeMode === 'month') {
    const [y, m] = timePeriod.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - steps, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (timeMode === 'week') {
    const [yearStr, weekStr] = timePeriod.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(weekStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
    monday.setUTCDate(monday.getUTCDate() - steps * 7);
    const weekNum = Math.ceil(
      ((monday.getTime() - new Date(Date.UTC(monday.getUTCFullYear(), 0, 1)).getTime()) / 86400000 + 1) / 7,
    );
    return `${monday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  if (timeMode === 'day') {
    const d = new Date(`${timePeriod}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - steps);
    return d.toISOString().slice(0, 10);
  }
  return timePeriod;
}

function labelForPeriod(timeMode: string, period: string): string {
  if (timeMode === 'month') {
    const [y, m] = period.split('-');
    return `${y.slice(2)}/${m}`;
  }
  if (timeMode === 'week') return period.replace('-W', 'W');
  if (timeMode === 'day') return period.slice(5);
  return period;
}

// ── Sleep helpers ─────────────────────────────────────────────────────────────

function computeSleepSummary(docs: any[]) {
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

// ── Interactions helpers ──────────────────────────────────────────────────────

function computeInteractionsSummary(docs: any[]) {
  const interactions = docs.filter(d => d.activity?.relationship === '함께');

  const intByMethod:   Record<string, number> = {};
  const intByCategory: Record<string, number> = {};

  // Per-person tracking: name → { methods: {m: count}, categories: {c: count} }
  const personMap: Record<string, { methods: Record<string, number>; categories: Record<string, number>; total: number }> = {};

  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';
      intByMethod[method]     = (intByMethod[method] ?? 0) + 1;
      intByCategory[category] = (intByCategory[category] ?? 0) + 1;

      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];

      for (const name of targets) {
        if (!name || name === '등') continue;
        if (!personMap[name]) personMap[name] = { methods: {}, categories: {}, total: 0 };
        personMap[name].methods[method]     = (personMap[name].methods[method] ?? 0) + 1;
        personMap[name].categories[category] = (personMap[name].categories[category] ?? 0) + 1;
        personMap[name].total++;
      }
    }
  }

  const dominantKey = (counts: Record<string, number>): string =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타';

  const peopleByMethod:   Record<string, number> = {};
  const peopleByCategory: Record<string, number> = {};
  for (const p of Object.values(personMap)) {
    const dm = dominantKey(p.methods);
    const dc = dominantKey(p.categories);
    peopleByMethod[dm]   = (peopleByMethod[dm] ?? 0) + 1;
    peopleByCategory[dc] = (peopleByCategory[dc] ?? 0) + 1;
  }

  // Top 10 ranked by total interactions
  const sorted = Object.entries(personMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const top10 = sorted.map(([name, data]) => ({
    name,
    dominantCategory: dominantKey(data.categories),
    total: data.total,
    rows: Object.entries(data.methods)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count })),
  }));

  const top10Total = top10.reduce((s, p) => s + p.total, 0);
  const othersTotal = interactions.length - top10Total;

  const othersMethodCounts:   Record<string, number> = {};
  const othersCategoryCounts: Record<string, number> = {};
  const top10Names = new Set(top10.map(p => p.name));
  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];
      for (const name of targets) {
        if (!name || name === '등' || top10Names.has(name)) continue;
        const m = group.method ?? '기타';
        const c = group.category ?? '기타';
        othersMethodCounts[m]   = (othersMethodCounts[m] ?? 0) + 1;
        othersCategoryCounts[c] = (othersCategoryCounts[c] ?? 0) + 1;
      }
    }
  }

  return {
    interactions: {
      total:      interactions.length,
      byMethod:   intByMethod,
      byCategory: intByCategory,
    },
    people: {
      total:      Object.keys(personMap).length,
      byMethod:   peopleByMethod,
      byCategory: peopleByCategory,
    },
    topPeople: top10,
    others: {
      total:           othersTotal,
      dominantMethod:  dominantKey(othersMethodCounts),
      dominantCategory: dominantKey(othersCategoryCounts),
    },
  };
}

// Compute per-bucket data for trend mode
function computeInteractionsTrendBucket(docs: any[], relTypeFilter: string[] = [], methodFilter: string[] = []) {
  const interactions = docs.filter(d => d.activity?.relationship === '함께');
  const byRelationType: Record<string, number> = {};
  const byMethod:       Record<string, number> = {};
  const personCounts:   Record<string, number> = {};

  for (const doc of interactions) {
    for (const group of (doc.people ?? [])) {
      const method   = group.method ?? '기타';
      const category = group.category ?? '기타';
      byMethod[method]       = (byMethod[method] ?? 0) + 1;
      byRelationType[category] = (byRelationType[category] ?? 0) + 1;

      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string'
          ? [group.target]
          : [];

      // Apply top7 filters (AND logic) — only affects person ranking
      if (relTypeFilter.length && !relTypeFilter.includes(category)) continue;
      if (methodFilter.length  && !methodFilter.includes(method))    continue;

      for (const name of targets) {
        if (!name || name === '등') continue;
        personCounts[name] = (personCounts[name] ?? 0) + 1;
      }
    }
  }

  const sorted = Object.entries(personCounts)
    .sort((a, b) => b[1] - a[1]);

  const top7 = sorted.slice(0, 7).map(([name, count]) => ({ name, count }));
  const uniquePeopleCount = Object.keys(personCounts).length;

  return {
    totalCount:        interactions.length,
    uniquePeopleCount,
    byRelationType,
    byMethod,
    top7,
  };
}

// Build transitioning arrays from ordered bucket data
function addTransitioning(
  buckets: { label: string; top7: { name: string; count: number }[] }[],
): { label: string; top7: { name: string; count: number }[]; transitioning: string[] }[] {
  return buckets.map((bucket, i) => {
    const prev = i > 0 ? buckets[i - 1] : null;
    const next = i < buckets.length - 1 ? buckets[i + 1] : null;

    const currentNames = new Set(bucket.top7.map(p => p.name));
    const prevNames    = new Set(prev?.top7.map(p => p.name) ?? []);
    const nextNames    = new Set(next?.top7.map(p => p.name) ?? []);

    const transitioning: string[] = [];
    // Dropped from previous top5 but not in current
    for (const name of prevNames) {
      if (!currentNames.has(name)) transitioning.push(name);
    }
    // Will appear in next top5 but not in current
    for (const name of nextNames) {
      if (!currentNames.has(name) && !transitioning.includes(name)) {
        transitioning.push(name);
      }
    }

    return { ...bucket, transitioning };
  });
}

// ── Drinking helpers ──────────────────────────────────────────────────────────

function hourStrToDecimal(hourStr: string | null | undefined): number | null {
  if (!hourStr) return null;
  const [hPart, mPart] = hourStr.split(':');
  const h = parseInt(hPart);
  const m = parseInt(mPart ?? '0');
  if (isNaN(h) || isNaN(m)) return null;
  return h + m / 60;
}

function classifyOccasion(
  foodType: string | null | undefined,
  startHour: string | null | undefined,
): string {
  const type = foodType ?? '';
  if (type === '아침') return '아침술';
  if (type === '점심') return '점심술';
  if (type === '저녁') return '저녁술';
  const h = hourStrToDecimal(startHour);
  if (h !== null && h < 18) return '낮술';
  return 'After/No dinner';
}

// Returns yesterday as YYYY-MM-DD (UTC)
function yesterdayStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Difference in calendar days between two YYYY-MM-DD strings (a - b)
function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00.000Z`).getTime() -
      new Date(`${b}T00:00:00.000Z`).getTime()) /
      86400000,
  );
}

// Score(D) = diffDays(D, lastDrinkBeforeD) - 1 + (D is rest ? 1 : 0)
// If no prior drinking day exists, anchor to datasetFirstDate.
function computeDailyScores(
  allDrinkingDates: Set<string>,
  periodDates: string[],
  datasetFirstDate: string,
): { dateStr: string; score: number; isDrinking: boolean }[] {
  const sortedDrinkDates = [...allDrinkingDates].sort();

  return periodDates.map(dateStr => {
    const isDrinking = allDrinkingDates.has(dateStr);

    let lastDrink: string | null = null;
    for (let i = sortedDrinkDates.length - 1; i >= 0; i--) {
      if (sortedDrinkDates[i] < dateStr) {
        lastDrink = sortedDrinkDates[i];
        break;
      }
    }

    const anchor = lastDrink ?? datasetFirstDate;
    const score  = diffDays(dateStr, anchor) - 1 + (isDrinking ? 0 : 1);
    return { dateStr, score: Math.max(0, score), isDrinking };
  });
}

// Bucket a rest score into a histogram label
function bucketScore(score: number): string {
  if (score === 0)  return '0d';
  if (score === 1)  return '1d';
  if (score <= 3)   return '2–3d';
  if (score <= 6)   return '4–6d';
  if (score <= 13)  return '1–2w';
  if (score <= 29)  return '2–4w';
  return '1m+';
}

const SCORE_BUCKET_ORDER = ['0d', '1d', '2–3d', '4–6d', '1–2w', '2–4w', '1m+'];

// ── Drinking date assignment (6am threshold) ──────────────────────────────────
 
/**
 * Given a log document's start.datetime and start.hour,
 * returns the YYYY-MM-DD string this record belongs to.
 * Records between 00:00–05:59 are attributed to the previous calendar day.
 */
function assignDrinkingDate(datetime: Date, hourStr: string | null | undefined): string {
  const mins = hourStringToMinutes(hourStr);
  const d = new Date(datetime);
  if (mins !== null && mins < SLEEP_THRESHOLD_HOUR * 60) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}
 
// ── Percentile helper ─────────────────────────────────────────────────────────
 
function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo  = Math.floor(idx);
  const hi  = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
 
// ── computeDrinkingSummary ────────────────────────────────────────────────────
 
async function computeDrinkingSummary(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  crossActivities: string[],
): Promise<any> {
 
  // ── Step 1: load conversion table ───────────────────────────────────────────
  const conversionDocs = await AlcoholConversion.find({ userId }).lean();
  // Build a lookup: `${item}||${unit}` → drinks
  const convMap = new Map<string, number>();
  for (const c of conversionDocs) {
    convMap.set(`${(c as any).item}||${(c as any).unit}`, (c as any).drinks);
  }
 
  // ── Step 2: all distinct drinking days (full dataset, unbounded) ─────────────
  // Fetch raw to apply 6am date assignment in JS (can't do it in aggregation easily)
  const allDrinkingRaw = await Log.find(
    { userId, 'food.alcohols': { $exists: true, $not: { $size: 0 } } },
    { 'start.datetime': 1, 'start.hour': 1 },
  ).lean();
 
  const allDrinkingDates = new Set<string>(
    allDrinkingRaw
      .map((d: any) =>
        d.start?.datetime
          ? assignDrinkingDate(new Date(d.start.datetime), d.start?.hour)
          : null,
      )
      .filter(Boolean) as string[],
  );
  const sortedAll = [...allDrinkingDates].sort();
  const datasetFirstDate = sortedAll[0] ?? periodStart.toISOString().slice(0, 10);
 
  // ── Step 3: cap effective period end at yesterday ────────────────────────────
  const yesterday     = yesterdayStr();
  const rawEnd        = periodEnd.toISOString().slice(0, 10);
  const rawStart      = periodStart.toISOString().slice(0, 10);
  const effectiveEnd  = rawEnd < yesterday ? rawEnd : yesterday;
  const effectiveStart = rawStart;
 
  // Build array of every date in the effective period
  const periodDates: string[] = [];
  const cursor  = new Date(`${effectiveStart}T00:00:00.000Z`);
  const endDate = new Date(`${effectiveEnd}T00:00:00.000Z`);
  while (cursor <= endDate) {
    periodDates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const daysInPeriod = periodDates.length;
 
  // ── Step 4: fetch alcohol entries in the effective period ────────────────────
  // Expand window by 6h on the early side to capture pre-6am records
  // that belong to the first day of the period
  const fetchStart = new Date(`${effectiveStart}T00:00:00.000Z`);
  fetchStart.setUTCHours(fetchStart.getUTCHours() - SLEEP_THRESHOLD_HOUR);
 
  const filter: Record<string, any> = {
    userId,
    'start.datetime': {
      $gte: fetchStart,
      $lte: new Date(`${effectiveEnd}T23:59:59.999Z`),
    },
    'food.alcohols': { $exists: true, $not: { $size: 0 } },
  };
  if (crossActivities.length) {
    filter['activity.crossActivity'] = { $in: crossActivities };
  }
  const docs = await Log.find(filter).lean();
 
  // ── Step 5: daily scores and histogram ──────────────────────────────────────
  const dailyScores = computeDailyScores(allDrinkingDates, periodDates, datasetFirstDate);
 
  // Build drinkingDaySet using assignDrinkingDate
  const drinkingDaySet = new Set<string>(
    docs
      .map((d: any) =>
        d.start?.datetime
          ? assignDrinkingDate(new Date(d.start.datetime), d.start?.hour)
          : null,
      )
      .filter((s): s is string => s !== null && periodDates.includes(s)),
  );
 
  const scoreSum    = dailyScores.reduce((s, d) => s + d.score, 0);
  const avgRestDays = daysInPeriod > 0
    ? Math.round((scoreSum / daysInPeriod) * 10) / 10
    : 0;
 
  const histogram: Record<string, number> = Object.fromEntries(
    SCORE_BUCKET_ORDER.map(k => [k, 0]),
  );
  for (const { score } of dailyScores) {
    histogram[bucketScore(score)]++;
  }
 
  // ── Step 6: drinks quantity ──────────────────────────────────────────────────
 
  // Accumulate drinks per assigned date
  const drinksByDate = new Map<string, number>();
 
  for (const doc of docs) {
    if (!(doc as any).start?.datetime) continue;
    const dateStr = assignDrinkingDate(
      new Date((doc as any).start.datetime),
      (doc as any).start?.hour,
    );
    // Only count dates within the effective period
    if (!periodDates.includes(dateStr)) continue;
 
    const alcohols: any[] = (doc as any).food?.alcohols ?? [];
    let sessionDrinks = 0;
    for (const a of alcohols) {
      const key = `${a.item}||${a.unit}`;
      const drinksPerUnit = convMap.get(key) ?? null;
      if (drinksPerUnit === null) continue;         // unknown item×unit — skip
      const amount = parseFloat(a.amount);
      if (isNaN(amount)) continue;
      sessionDrinks += amount * drinksPerUnit;
    }
 
    drinksByDate.set(dateStr, (drinksByDate.get(dateStr) ?? 0) + sessionDrinks);
  }
 
  // Total drinks for the period
  const totalDrinks = Math.round(
    [...drinksByDate.values()].reduce((s, v) => s + v, 0) * 100,
  ) / 100;
 
  // Per-day stats — drinking days only
  const perDayValues = [...drinksByDate.entries()]
    .filter(([dateStr]) => drinkingDaySet.has(dateStr))
    .map(([, v]) => Math.round(v * 100) / 100)
    .sort((a, b) => a - b);
 
  const drinkingDaysCount = perDayValues.length;
 
  const drinksStats = drinkingDaysCount > 0
    ? {
        total:  totalDrinks,
        min:    perDayValues[0],
        max:    perDayValues[perDayValues.length - 1],
        avg:    Math.round((perDayValues.reduce((s, v) => s + v, 0) / drinkingDaysCount) * 100) / 100,
        p25:    Math.round(percentile(perDayValues, 25) * 100) / 100,
        p75:    Math.round(percentile(perDayValues, 75) * 100) / 100,
        n:      drinkingDaysCount,
      }
    : null;
 
  // Drink Type — split each record proportionally by drinks value
  // Total across all types = total number of records (docs.length)
  const drinkTypeAccum: Record<string, number> = {};

  for (const doc of docs) {
    const dateStr = (doc as any).start?.datetime
      ? assignDrinkingDate(new Date((doc as any).start.datetime), (doc as any).start?.hour)
      : null;
    if (!dateStr || !periodDates.includes(dateStr)) continue;

    const alcohols: any[] = (doc as any).food?.alcohols ?? [];

    // Compute drinks value per item in this record
    const itemDrinks: { item: string; drinks: number }[] = [];
    for (const a of alcohols) {
      const key = `${a.item}||${a.unit}`;
      const drinksPerUnit = convMap.get(key) ?? null;
      if (drinksPerUnit === null) continue;
      const amount = parseFloat(a.amount);
      if (isNaN(amount)) continue;
      itemDrinks.push({ item: a.item, drinks: amount * drinksPerUnit });
    }

    const recordTotal = itemDrinks.reduce((s, x) => s + x.drinks, 0);
    if (recordTotal === 0) continue;

    // Split this record (= 1.0) proportionally across items
    for (const { item, drinks } of itemDrinks) {
      const share = drinks / recordTotal;
      drinkTypeAccum[item] = (drinkTypeAccum[item] ?? 0) + share;
    }
  }

  // Round to integers for display
  const drinkType: Record<string, number> = {};
  for (const [item, val] of Object.entries(drinkTypeAccum)) {
    const rounded = Math.round(val);
    if (rounded > 0) drinkType[item] = rounded;
  }

  // ── Step 7: remaining metrics ────────────────────────────────────────────────
 
  // Occasions
  const occasions: Record<string, number> = {
    '아침술': 0, '점심술': 0, '저녁술': 0, '낮술': 0, 'After/No dinner': 0,
  };
  for (const doc of docs) {
    const label = classifyOccasion((doc as any).food?.type, (doc as any).start?.hour);
    occasions[label] = (occasions[label] ?? 0) + 1;
  }
 
  // Avg start & end times — circular, pre-6am treated as 24+
  const THRESHOLD = 6;
  function toCircular(vals: (number | null)[]): number | null {
    const v = vals.filter((x): x is number => x !== null).map(h => h < THRESHOLD ? h + 24 : h);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  }
  function decimalToClock(dec: number | null): string | null {
    if (dec === null) return null;
    const wrapped = Math.round(dec * 60) % 1440;
    return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
  }
 
  const avgStartClock = decimalToClock(toCircular(docs.map((d: any) => hourStrToDecimal(d.start?.hour))));
  const avgEndClock   = decimalToClock(toCircular(docs.map((d: any) => hourStrToDecimal(d.end?.hour))));
 
  // Avg duration
  const durations = docs
    .map((d: any) => d.duration?.totalSeconds)
    .filter((v): v is number => v != null && v > 0);
  const avgDurationSeconds = durations.length
    ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
    : null;
 
  // Companions
  const aloneCount = docs.filter((d: any) => !d.people || d.people.length === 0).length;
  const byRelationType: Record<string, number> = {};
  const personMap: Record<string, { categories: Record<string, number>; total: number }> = {};
 
  for (const doc of docs) {
    if (!(doc as any).people?.length) continue;
 
    const eventCategoryCounts: Record<string, number> = {};
    for (const group of (doc as any).people) {
      const category = group.category ?? '기타';
      eventCategoryCounts[category] = (eventCategoryCounts[category] ?? 0) + 1;
    }
    const dominantCategory = Object.entries(eventCategoryCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타';
    byRelationType[dominantCategory] = (byRelationType[dominantCategory] ?? 0) + 1;
 
    const eventPeople = new Set<string>();
    for (const group of (doc as any).people) {
      const category = group.category ?? '기타';
      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string' ? [group.target] : [];
      for (const name of targets) {
        if (!name || name === '등' || eventPeople.has(name)) continue;
        eventPeople.add(name);
        if (!personMap[name]) personMap[name] = { categories: {}, total: 0 };
        personMap[name].categories[category] = (personMap[name].categories[category] ?? 0) + 1;
        personMap[name].total++;
      }
    }
  }
 
  const dominantKey = (counts: Record<string, number>): string =>
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타';
 
  const topPeople = Object.entries(personMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([name, data]) => ({
      name,
      dominantCategory: dominantKey(data.categories),
      total: data.total,
    }));
 
  return {
    daysInPeriod,
    drinkingDays:      drinkingDaySet.size,
    restDays:          daysInPeriod - drinkingDaySet.size,
    avgRestDays,
    histogram,
    avgStartClock,
    avgEndClock,
    avgDurationSeconds,
    occasions,
    drinks:    drinksStats,
    drinkType,
    companions: {
      alone:          aloneCount,
      total:          docs.length,
      byRelationType,
      topPeople,
    },
  };
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as any)?.user?.userId;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  await connectDB();

  const sp          = req.nextUrl.searchParams;
  const metric      = sp.get('metric') ?? '';
  const mode        = sp.get('mode') ?? 'summary';
  const timeMode    = sp.get('timeMode') ?? 'month';
  const timePeriod  = sp.get('timePeriod') ?? '';
  const dateFrom    = sp.get('dateFrom');
  const dateTo      = sp.get('dateTo');
  const bucketsBack     = parseInt(sp.get('bucketsBack') ?? '6');
  const crossActivities = sp.get('crossActivities')?.split(',').filter(Boolean) ?? [];
  const top7RelType     = sp.get('top7RelType')?.split(',').filter(Boolean) ?? [];
  const top7Method      = sp.get('top7Method')?.split(',').filter(Boolean)  ?? [];

  // ── interactions.summary ──────────────────────────────────────────────────
  if (metric === 'interactions.summary') {
    if (mode === 'trend') {
      // Build ordered list of periods (oldest → newest)
      const periods: string[] = [];
      for (let i = bucketsBack - 1; i >= 0; i--) {
        periods.push(stepBack(timeMode, timePeriod || currentPeriod(timeMode), i));
      }

      const bucketResults = await Promise.all(
        periods.map(async period => {
          const { start, end } = buildDateRange(timeMode, period, null, null);
          const filter: Record<string, any> = {
            userId,
            'start.datetime': { $gte: start, $lte: end },
          };
          if (crossActivities.length) {
            filter['activity.crossActivity'] = { $in: crossActivities };
          }
          const docs = await Log.find(filter).lean();
          const bucket = computeInteractionsTrendBucket(docs, top7RelType, top7Method);
          return { label: labelForPeriod(timeMode, period), ...bucket };
        }),
      );

      const withTransitioning = addTransitioning(bucketResults);

      return NextResponse.json({ data: withTransitioning });
    }

    // Summary mode
    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const filter: Record<string, any> = {
      userId,
      'start.datetime': { $gte: start, $lte: end },
    };
    if (crossActivities.length) {
      filter['activity.crossActivity'] = { $in: crossActivities };
    }
    const docs = await Log.find(filter).lean();
    const summary = computeInteractionsSummary(docs);
    return NextResponse.json({ summary });
  }

  // ── sleep.all ─────────────────────────────────────────────────────────────
  if (metric === 'sleep.all') {
    if (mode === 'trend') {
      const periods: string[] = [];
      for (let i = bucketsBack - 1; i >= 0; i--) {
        periods.push(stepBack(timeMode, timePeriod || currentPeriod(timeMode), i));
      }

      const results = await Promise.all(
        periods.map(async period => {
          const { start, end } = buildDateRange(timeMode, period, null, null);
          const filter: Record<string, any> = {
            userId,
            'start.datetime': { $gte: start, $lte: end },
            'activity.category': '생리',
            'activity.name': '수면',
          };
          if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };
          const docs = await Log.find(filter).lean();
          return { label: labelForPeriod(timeMode, period), summary: computeSleepSummary(docs) };
        }),
      );
      return NextResponse.json({ data: results });
    }

    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const filter: Record<string, any> = {
      userId,
      'start.datetime': { $gte: start, $lte: end },
      'activity.category': '생리',
      'activity.name': '수면',
    };
    if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };
    const docs = await Log.find(filter).lean();
    return NextResponse.json({ summary: computeSleepSummary(docs) });
  }

  // ── drinking.summary ────────────────────────────────────────────────────────
  if (metric === 'drinking.summary') {
    const { start, end } = buildDateRange(timeMode, timePeriod, dateFrom, dateTo);
    const summary = await computeDrinkingSummary(userId, start, end, crossActivities);
    return NextResponse.json({ summary });
  }
  
  return NextResponse.json({ error: 'Unknown metric' }, { status: 400 });
}

function currentPeriod(timeMode: string): string {
  const now = new Date();
  if (timeMode === 'month') {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (timeMode === 'week') {
    const jan1    = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const dayOfYr = Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
    const week    = Math.ceil(dayOfYr / 7);
    return `${now.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return now.toISOString().slice(0, 10);
}
