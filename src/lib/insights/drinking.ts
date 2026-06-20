// src/lib/insights/drinking.ts
import Log from '@/models/Log';
import AlcoholConversion from '@/models/AlcoholConversion';
import { SLEEP_THRESHOLD_HOUR, hourStringToMinutes, assignDrinkingDate, diffDays, yesterdayStr } from './dates';
import { percentile } from './util';


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

 

 
export async function computeDrinkingSummary(
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




export async function computeDrinkingTrendBucket(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  crossActivities: string[],
): Promise<{
  drinkingDays: number;
  daysInPeriod: number;
  totalDrinks: number;
  avgDrinksPerDay: number | null;
  drinksBox: { min: number; max: number; avg: number; p25: number; p75: number } | null;
  avgRestDays: number;
  histogram: Record<string, number>;
  drinkType: Record<string, number>;
  occasions: Record<string, number>;
	companions: Record<string, number>;
  people: Record<string, Record<string, number>>;
  avgStartMins: number | null;
  avgEndMins: number | null;
  avgDurationSeconds: number | null;
}> {
  // Load conversion table
  const conversionDocs = await AlcoholConversion.find({ userId }).lean();
  const convMap = new Map<string, number>();
  for (const c of conversionDocs) {
    convMap.set(`${(c as any).item}||${(c as any).unit}`, (c as any).drinks);
  }

  // Period dates
  const yesterday      = yesterdayStr();
  const rawEnd         = periodEnd.toISOString().slice(0, 10);
  const rawStart       = periodStart.toISOString().slice(0, 10);
  const effectiveEnd   = rawEnd < yesterday ? rawEnd : yesterday;
  const effectiveStart = rawStart;

  const periodDates: string[] = [];
  const cursor  = new Date(`${effectiveStart}T00:00:00.000Z`);
  const endDate = new Date(`${effectiveEnd}T00:00:00.000Z`);
  while (cursor <= endDate) {
    periodDates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const daysInPeriod = periodDates.length;
  if (daysInPeriod === 0) {
    return {
      drinkingDays: 0, daysInPeriod: 0, totalDrinks: 0,
      avgDrinksPerDay: null, drinksBox: null, avgRestDays: 0,
			histogram: {}, drinkType: {}, occasions: {}, companions: {}, people: {},
      avgStartMins: null, avgEndMins: null, avgDurationSeconds: null,
    };
  }

  // Fetch docs in the period (with 6h lookback)
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
  if (crossActivities.length) filter['activity.crossActivity'] = { $in: crossActivities };
  const docs = await Log.find(filter).lean();

  // Drinking days
  const drinkingDaySet = new Set<string>(
    docs
      .map((d: any) =>
        d.start?.datetime
          ? assignDrinkingDate(new Date(d.start.datetime), d.start?.hour)
          : null,
      )
      .filter((s): s is string => s !== null && periodDates.includes(s)),
  );

  // Drinks per date
  const drinksByDate = new Map<string, number>();
  const drinkTypeAccum: Record<string, number> = {};
  const occasions: Record<string, number> = {
    '아침술': 0, '점심술': 0, '저녁술': 0, '낮술': 0, 'After/No dinner': 0,
  };
  const companions: Record<string, number> = {};
	const people: Record<string, Record<string, number>> = {};

  for (const doc of docs) {
    if (!(doc as any).start?.datetime) continue;
    const dateStr = assignDrinkingDate(
      new Date((doc as any).start.datetime),
      (doc as any).start?.hour,
    );
    if (!periodDates.includes(dateStr)) continue;

    // Drinks quantity
    const alcohols: any[] = (doc as any).food?.alcohols ?? [];
    let sessionDrinks = 0;
    const itemDrinks: { item: string; drinks: number }[] = [];
    for (const a of alcohols) {
      const key = `${a.item}||${a.unit}`;
      const dpu = convMap.get(key) ?? null;
      if (dpu === null) continue;
      const amt = parseFloat(a.amount);
      if (isNaN(amt)) continue;
      const d = amt * dpu;
      sessionDrinks += d;
      itemDrinks.push({ item: a.item, drinks: d });
    }
    drinksByDate.set(dateStr, (drinksByDate.get(dateStr) ?? 0) + sessionDrinks);

    // Drink type (proportional)
    const recTotal = itemDrinks.reduce((s, x) => s + x.drinks, 0);
    if (recTotal > 0) {
      for (const { item, drinks } of itemDrinks) {
        drinkTypeAccum[item] = (drinkTypeAccum[item] ?? 0) + drinks / recTotal;
      }
    }

    // Occasions
    const occ = classifyOccasion((doc as any).food?.type, (doc as any).start?.hour);
    occasions[occ] = (occasions[occ] ?? 0) + 1;

    // Companions (by relation type)
    for (const group of ((doc as any).people ?? [])) {
      const cat = group.category ?? '기타';
      companions[cat] = (companions[cat] ?? 0) + 1;
    }
    if (!((doc as any).people?.length)) {
      companions['혼자'] = (companions['혼자'] ?? 0) + 1;
    }

    // Individual people (deduped per event) → name → category → count
    const seenPeople = new Set<string>();
    for (const group of ((doc as any).people ?? [])) {
      const cat = group.category ?? '기타';
      const targets: string[] = Array.isArray(group.targets)
        ? group.targets
        : typeof group.target === 'string' ? [group.target] : [];
      for (const name of targets) {
        if (!name || name === '등' || seenPeople.has(name)) continue;
        seenPeople.add(name);
        if (!people[name]) people[name] = {};
        people[name][cat] = (people[name][cat] ?? 0) + 1;
      }
    }
  }

  const totalDrinks = Math.round(
    [...drinksByDate.values()].reduce((s, v) => s + v, 0) * 100,
  ) / 100;

  const perDayValues = [...drinksByDate.entries()]
    .filter(([d]) => drinkingDaySet.has(d))
    .map(([, v]) => Math.round(v * 100) / 100)
    .sort((a, b) => a - b);

  const n = perDayValues.length;
  const drinksBox = n > 0 ? {
    min: perDayValues[0],
    max: perDayValues[n - 1],
    avg: Math.round((perDayValues.reduce((s, v) => s + v, 0) / n) * 100) / 100,
    p25: Math.round(percentile(perDayValues, 25) * 100) / 100,
    p75: Math.round(percentile(perDayValues, 75) * 100) / 100,
  } : null;

  const avgDrinksPerDay = n > 0
    ? Math.round((perDayValues.reduce((s, v) => s + v, 0) / n) * 100) / 100
    : null;

  // Drink type rounded
  const drinkType: Record<string, number> = {};
  for (const [item, val] of Object.entries(drinkTypeAccum)) {
    const r = Math.round(val);
    if (r > 0) drinkType[item] = r;
  }

  // Histogram — reuse same daily score logic as summary
  // We need allDrinkingDates for this; fetch lazily for the full dataset
  const allDrinkingRaw = await Log.find(
    { userId, 'food.alcohols': { $exists: true, $not: { $size: 0 } } },
    { 'start.datetime': 1, 'start.hour': 1 },
  ).lean();
  const allDrinkingDates = new Set<string>(
    allDrinkingRaw
      .map((d: any) => d.start?.datetime
        ? assignDrinkingDate(new Date(d.start.datetime), d.start?.hour)
        : null)
      .filter(Boolean) as string[],
  );
  const sortedAll = [...allDrinkingDates].sort();
  const datasetFirstDate = sortedAll[0] ?? effectiveStart;
  const dailyScores = computeDailyScores(allDrinkingDates, periodDates, datasetFirstDate);
  const histogram: Record<string, number> = Object.fromEntries(
    SCORE_BUCKET_ORDER.map(k => [k, 0]),
  );
  for (const { score } of dailyScores) {
    histogram[bucketScore(score)]++;
  }

  // avgRestDays — use same dailyScores logic as computeDrinkingSummary
  const scoreSum = dailyScores.reduce((s, d) => s + d.score, 0);
  const avgRestDays = daysInPeriod > 0
    ? Math.round((scoreSum / daysInPeriod) * 10) / 10
    : 0;

  // Session time — avg start/end as minutes-since-midnight (with midnight overflow for end)
  // Use circular mean with 6am threshold for start; allow end > 1440
  const THRESHOLD = 6;
  function toCircularMins(vals: (number | null)[]): number | null {
    const v = vals.filter((x): x is number => x !== null)
      .map(m => m < THRESHOLD * 60 ? m + 1440 : m);
    if (!v.length) return null;
    const avg = v.reduce((s, x) => s + x, 0) / v.length;
    return Math.round(avg % 1440);
  }

  const startMinsArr = docs.map((d: any) => hourStringToMinutes(d.start?.hour));
  const endMinsArr   = docs.map((d: any) => {
    const m = hourStringToMinutes((d as any).end?.hour);
    if (m === null) return null;
    // If end < start (overnight), add 1440
    const sm = hourStringToMinutes((d as any).start?.hour);
    return (sm !== null && m < sm) ? m + 1440 : m;
  });

  const avgStartMins = toCircularMins(startMinsArr);
  // For end: use raw average allowing >1440
  const validEndMins = endMinsArr.filter((x): x is number => x !== null);
  const avgEndMinsRaw = validEndMins.length
    ? Math.round(validEndMins.reduce((s, v) => s + v, 0) / validEndMins.length)
    : null;

  const durations = docs
    .map((d: any) => d.duration?.totalSeconds)
    .filter((v): v is number => v != null && v > 0);
  const avgDurationSeconds = durations.length
    ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
    : null;

  return {
    drinkingDays: drinkingDaySet.size,
    daysInPeriod,
    totalDrinks,
    avgDrinksPerDay,
    drinksBox,
    avgRestDays,
    histogram,
    drinkType,
		occasions,
    companions,
    people,
    avgStartMins,
    avgEndMins: avgEndMinsRaw,
    avgDurationSeconds,
  };
}

