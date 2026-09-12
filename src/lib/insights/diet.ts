// src/lib/insights/diet.ts
import Log from '@/models/Log';
import IngredientMaster from '@/models/IngredientMaster';
import { SLEEP_THRESHOLD_HOUR, hourStringToMinutes, assignDrinkingDate, yesterdayStr } from './dates';
import {
  TrendGrain,
  buildBucketStarts,
  bucketStartFor,
  bucketDayCount,
  bucketLabel,
  ymd,
} from './trend-window';

const CARB_SCORE: Record<string, number> = { H: 2, M: 1, L: 0 };
const spRank = (x: string | undefined) => (x === 'H' ? 3 : x === 'M' ? 2 : 1); // L / none = 1

// ── Day assignment ───────────────────────────────────────────────────────────
// 아침 is exempt from the 6 am rule: a pre-6 am breakfast keeps its own
// calendar date and its real (un-shifted) clock time. Every other type still
// rolls a pre-6 am record back to the previous day. The non-roll branch
// mirrors assignDrinkingDate's output minus the rollback step.

function isBreakfastRecord(d: any): boolean {
  return d.food?.type === '아침';
}

function assignDietDate(d: any): string | null {
  if (!d.start?.datetime) return null;
  return isBreakfastRecord(d)
    ? new Date(d.start.datetime).toISOString().slice(0, 10)
    : assignDrinkingDate(new Date(d.start.datetime), d.start?.hour);
}

// ── Accumulator ──────────────────────────────────────────────────────────────
// One record-level accumulation shared by the summary and by every trend
// bucket, so the two screens cannot drift apart. Everything the widget draws
// is derived from these maps downstream.

type DietAccum = {
  finishByDate:    Map<string, number>;
  caffeineByDate:  Map<string, number>;
  servingsByDate:  Map<string, number>;
  carbsByDate:     Map<string, number>;
  spicinessByDate: Map<string, 'H' | 'M' | 'L'>;
  ateIngCount:     Map<string, number>;
  ateItemCount:    Map<string, number>;
  drinkIngCount:   Map<string, number>;
  drinkItemCount:  Map<string, number>;
  aloneCount:      number;
  companionTotal:  number;
  byRelationType:  Record<string, number>;
  personMap:       Record<string, { categories: Record<string, number>; total: number }>;
};

function newDietAccum(): DietAccum {
  return {
    finishByDate:    new Map(),
    caffeineByDate:  new Map(),
    servingsByDate:  new Map(),
    carbsByDate:     new Map(),
    spicinessByDate: new Map(),
    ateIngCount:     new Map(),
    ateItemCount:    new Map(),
    drinkIngCount:   new Map(),
    drinkItemCount:  new Map(),
    aloneCount:      0,
    companionTotal:  0,
    byRelationType:  {},
    personMap:       {},
  };
}

/**
 * Fold one record into the accumulator under an already-assigned date.
 *
 * Companions are counted ONCE per record, on the "ate or drank" rule. An
 * earlier version ran the same block twice — once for food-or-drink records
 * and again after the food-only cut — so every meal counted double against
 * every drink-only event, distorting the relation split and the people
 * ranking. One count per record is the rule; the comment on the block is the
 * rule's only home.
 */
function accumulateDietRecord(acc: DietAccum, d: any, dateStr: string): void {
  const isBreakfast = isBreakfastRecord(d);

  const foods:  any[] = d.food?.foods  ?? [];
  const drinks: any[] = d.food?.drinks ?? [];
  const hasFood  = foods.some(f => f?.item);
  const hasDrink = drinks.some(dr => dr?.item);

  // Drinks treemaps — every non-alcoholic drink, regardless of food
  for (const dr of drinks) {
    if (dr?.item) acc.drinkItemCount.set(dr.item, (acc.drinkItemCount.get(dr.item) ?? 0) + 1);
    for (const ing of (dr?.ingredients ?? [])) {
      if (ing) acc.drinkIngCount.set(ing, (acc.drinkIngCount.get(ing) ?? 0) + 1);
    }
  }

  // Caffeine finish — any drink-bearing record, before the food-only cut
  if (drinks.some(dr => {
    const g = dr?.ingredients ?? [];
    return g.includes('커피') || g.includes('카페인');
  })) {
    let cMins = hourStringToMinutes(d.end?.hour) ?? hourStringToMinutes(d.start?.hour);
    if (cMins !== null) {
      if (!isBreakfast && cMins < SLEEP_THRESHOLD_HOUR * 60) cMins += 1440;
      acc.caffeineByDate.set(dateStr, Math.max(acc.caffeineByDate.get(dateStr) ?? 0, cMins));
    }
  }

  // Companions ("with whom I eat *or drink*") — counted once, here only.
  if (hasFood || hasDrink) {
    if (!d.people?.length) {
      acc.aloneCount++;
    } else {
      const eventCategoryCounts: Record<string, number> = {};
      for (const g of d.people) {
        const c = g.category ?? '기타';
        eventCategoryCounts[c] = (eventCategoryCounts[c] ?? 0) + 1;
      }
      const dom = Object.entries(eventCategoryCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '기타';
      acc.byRelationType[dom] = (acc.byRelationType[dom] ?? 0) + 1;

      const seen = new Set<string>();
      for (const g of d.people) {
        const c = g.category ?? '기타';
        const targets: string[] = Array.isArray(g.targets)
          ? g.targets
          : typeof g.target === 'string' ? [g.target] : [];
        for (const name of targets) {
          if (!name || name === '등' || seen.has(name)) continue;
          seen.add(name);
          if (!acc.personMap[name]) acc.personMap[name] = { categories: {}, total: 0 };
          acc.personMap[name].categories[c] = (acc.personMap[name].categories[c] ?? 0) + 1;
          acc.personMap[name].total++;
        }
      }
    }
    acc.companionTotal++;
  }

  // Everything below is food-bearing only — an actual "eating" record
  if (!hasFood) return;

  let endMins = hourStringToMinutes(d.end?.hour) ?? hourStringToMinutes(d.start?.hour);
  if (endMins !== null) {
    if (!isBreakfast && endMins < SLEEP_THRESHOLD_HOUR * 60) endMins += 1440;
    acc.finishByDate.set(dateStr, Math.max(acc.finishByDate.get(dateStr) ?? 0, endMins));
  }

  let mealServings = 0;
  for (const f of foods) {
    const amt = parseFloat(String(f?.amount ?? ''));
    if (!isNaN(amt)) mealServings += amt;
  }
  acc.servingsByDate.set(dateStr, (acc.servingsByDate.get(dateStr) ?? 0) + mealServings);

  const carbScore = d.food?.carbs ? (CARB_SCORE[d.food.carbs] ?? 0) : 0;
  acc.carbsByDate.set(dateStr, (acc.carbsByDate.get(dateStr) ?? 0) + carbScore * mealServings);

	// Only explicitly recorded spiciness counts. A record with no value is not
  // evidence of a mild meal, so it contributes nothing, and a day where
  // nothing was recorded gets no entry at all — its bucket then totals zero
  // and the stacked area draws a gap instead of a full band of L.
  const sp: string | undefined = d.food?.spiciness;
  if (sp === 'H' || sp === 'M' || sp === 'L') {
    const prev = acc.spicinessByDate.get(dateStr);
    if (!prev || spRank(sp) > spRank(prev)) acc.spicinessByDate.set(dateStr, sp);
  }

  for (const f of foods) {
    if (f?.item) acc.ateItemCount.set(f.item, (acc.ateItemCount.get(f.item) ?? 0) + 1);
    for (const ing of (f?.ingredients ?? [])) {
      if (ing) acc.ateIngCount.set(ing, (acc.ateIngCount.get(ing) ?? 0) + 1);
    }
  }
}

// ── Shared query shape ───────────────────────────────────────────────────────
// Food- or drink-bearing records only.

function dietFilter(userId: string, from: Date, to: Date, crossActivities: string[]) {
  const filter: Record<string, any> = {
    userId,
    'start.datetime': { $gte: from, $lt: to },
    $or: [
      { 'food.foods.0':  { $exists: true } },
      { 'food.drinks.0': { $exists: true } },
    ],
  };
  if (crossActivities.length) {
    filter['activity.crossActivity'] = { $in: crossActivities };
  }
  return filter;
}

/**
 * The instants to fetch between for a range of local days, padded on BOTH
 * sides by the 6 am threshold.
 *
 * The late side matters: a 1 am record rolls back to the previous day, so the
 * final day of the range can only be complete if the fetch reaches into the
 * morning after it. Interior days are safe either way — the next day's records
 * are already inside the range. Missing this dropped every post-midnight
 * session on the last day alone, which is exactly the bug the drinking path
 * had before its late-side padding was added.
 */
function fetchBounds(startStr: string, endStr: string): { from: Date; to: Date } {
  const from = new Date(`${startStr}T00:00:00.000Z`);
  from.setUTCHours(from.getUTCHours() - SLEEP_THRESHOLD_HOUR);

  const to = new Date(`${endStr}T00:00:00.000Z`);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setUTCHours(SLEEP_THRESHOLD_HOUR);

  return { from, to };
}

// ── Shared core ──────────────────────────────────────────────────────────────
// Fetch food/drink-bearing records for the period and run the per-day
// aggregation. Both computeDietSummary and computeDietTrendBucket shape their
// output from the accumulators returned here, so the two stay in lock-step.
async function collectDiet(
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  crossActivities: string[],
) {
  const ingredientDocs = await IngredientMaster.find({ userId }).lean();
  const level1Map = new Map<string, string>();
  for (const ing of ingredientDocs) {
    level1Map.set((ing as any).level2, (ing as any).level1);
  }

  const yesterday      = yesterdayStr();
  const rawEnd         = periodEnd.toISOString().slice(0, 10);
  const rawStart       = periodStart.toISOString().slice(0, 10);
  const effectiveEnd   = rawEnd < yesterday ? rawEnd : yesterday;
  const effectiveStart = rawStart;

  const periodDates = new Set<string>();
  {
    const cursor  = new Date(`${effectiveStart}T00:00:00.000Z`);
    const endDate = new Date(`${effectiveEnd}T00:00:00.000Z`);
    while (cursor <= endDate) {
      periodDates.add(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  const daysInPeriod = periodDates.size;

  const { from, to } = fetchBounds(effectiveStart, effectiveEnd);
  const docs = await Log.find(dietFilter(userId, from, to, crossActivities)).lean();

  const acc = newDietAccum();
  for (const doc of docs) {
    const d: any = doc;
    const dateStr = assignDietDate(d);
    if (!dateStr || !periodDates.has(dateStr)) continue;
    accumulateDietRecord(acc, d, dateStr);
  }

  return { level1Map, daysInPeriod, rawStart, rawEnd, ...acc };
}

// ── Summary ──────────────────────────────────────────────────────────────────
export async function computeDietSummary(
  userId: string, periodStart: Date, periodEnd: Date, crossActivities: string[],
): Promise<any> {
  const a = await collectDiet(userId, periodStart, periodEnd, crossActivities);

  const sortByDate = <T extends [string, any]>(entries: T[]) =>
    entries.sort((x, y) => (x[0] < y[0] ? -1 : 1));

  const finishEating = sortByDate([...a.finishByDate.entries()])
    .map(([date, endMins]) => ({ date, endMins: Math.round(endMins) }));
  const finishCaffeine = sortByDate([...a.caffeineByDate.entries()])
    .map(([date, endMins]) => ({ date, endMins: Math.round(endMins) }));
  const servings = sortByDate([...a.servingsByDate.entries()])
    .map(([date, total]) => ({ date, total: Math.round(total * 100) / 100 }));
  const carbsIndex = sortByDate([...a.carbsByDate.entries()])
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
  const spiciness = sortByDate([...a.spicinessByDate.entries()])
    .map(([date, level]) => ({ date, level }));

  const toIngArr = (m: Map<string, number>) =>
    [...m.entries()].sort((x, y) => y[1] - x[1])
      .map(([level2, count]) => ({ level2, level1: a.level1Map.get(level2) ?? '기타', count }));
  const toItemArr = (m: Map<string, number>) =>
    [...m.entries()].sort((x, y) => y[1] - x[1]).map(([item, count]) => ({ item, count }));

  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const fAvg  = mean(finishEating.map(x => x.endMins));
  const cfAvg = mean(finishCaffeine.map(x => x.endMins));
  const sAvg  = mean(servings.map(x => x.total));
  const cAvg  = mean(carbsIndex.map(x => x.value));
  const averages = {
    finishEatingMins:   fAvg  === null ? null : Math.round(fAvg),
    finishCaffeineMins: cfAvg === null ? null : Math.round(cfAvg),
    servings:           sAvg  === null ? null : Math.round(sAvg * 100) / 100,
    carbsIndex:         cAvg  === null ? null : Math.round(cAvg * 100) / 100,
  };

  const dominantKey = (counts: Record<string, number>): string =>
    Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '기타';
  const topPeople = Object.entries(a.personMap)
    .sort((x, y) => y[1].total - x[1].total)
    .slice(0, 10)
    .map(([name, data]) => ({ name, dominantCategory: dominantKey(data.categories), total: data.total }));

  return {
    daysInPeriod: a.daysInPeriod,
    rangeStart:   a.rawStart,
    rangeEnd:     a.rawEnd,
    finishEating,
    finishCaffeine,
    servings,
    carbsIndex,
    spiciness,
    ateIngredients:   toIngArr(a.ateIngCount),
    ateItems:         toItemArr(a.ateItemCount),
    drankIngredients: toIngArr(a.drinkIngCount),
    drankItems:       toItemArr(a.drinkItemCount),
    companions: { alone: a.aloneCount, total: a.companionTotal, byRelationType: a.byRelationType, topPeople },
    averages,
  };
}

// ── One trend bucket (LEGACY) ────────────────────────────────────────────────
// The old period-stepping trend path: one query per bucket. Raw per-bucket
// shapes, with the client computing box stats. Retires with the
// diet.summary&mode=trend branch once the widget stops calling it.
export async function computeDietTrendBucket(
  userId: string, periodStart: Date, periodEnd: Date, crossActivities: string[],
): Promise<any> {
  const a = await collectDiet(userId, periodStart, periodEnd, crossActivities);

  const ints   = (m: Map<string, number>) => [...m.values()].map(v => Math.round(v));
  const floats = (m: Map<string, number>) => [...m.values()].map(v => Math.round(v * 100) / 100);

  const spicy: Record<'H' | 'M' | 'L', number> = { H: 0, M: 0, L: 0 };
  for (const lvl of a.spicinessByDate.values()) spicy[lvl]++;

  const relation: Record<string, number> = { ...a.byRelationType };
  if (a.aloneCount > 0) relation['혼자'] = a.aloneCount;

  // Per-person category breakdown so the client can filter companions by
  // relation type and re-rank. Total = sum across categories.
  const people: Record<string, Record<string, number>> = {};
  for (const [name, d] of Object.entries(a.personMap)) people[name] = d.categories;

  return {
    daysInPeriod:   a.daysInPeriod,
    eatingCutoff:   ints(a.finishByDate),    // daily end-mins → client box stats
    caffeineCutoff: ints(a.caffeineByDate),
    servings:       floats(a.servingsByDate),
    carbs:          floats(a.carbsByDate),
    ateIng:     Object.fromEntries(a.ateIngCount),    // { level2: count }
    ateItems:   Object.fromEntries(a.ateItemCount),   // { item: count }
    drankIng:   Object.fromEntries(a.drinkIngCount),
    drankItems: Object.fromEntries(a.drinkItemCount),
    spicy,                                            // { H, M, L } absolute day counts
    relation,                                         // { category | 혼자: count }
    people,                                           // { name: { category: count } }
  };
}

// ── Grain × count trend (the Weight-style window) ────────────────────────────
//
// One fetch covers the whole window; bucketing happens in memory, so 120
// buckets never means 120 database round trips. The old per-bucket path above
// ran one query per bucket on top of an ingredient-master lookup each time.
//
// The four daily metrics arrive as average / max / min per bucket rather than
// as raw daily arrays: the charts are three lines now, and a 120-bucket day
// window would otherwise ship several thousand numbers the client throws away.
// Composition and People keep their raw count maps — they are drawn from the
// members themselves and stay on the short bucket counts.

export type DietBox = { min: number; max: number; avg: number };

export type DietTrendBucket = {
  label: string;
  start: string;
  daysInBucket: number;
  eatingCutoff:   DietBox | null;
  caffeineCutoff: DietBox | null;
  servings:       DietBox | null;
  carbs:          DietBox | null;
  ateIng:     Record<string, number>;
  ateItems:   Record<string, number>;
  drankIng:   Record<string, number>;
  drankItems: Record<string, number>;
  spicy:      Record<'H' | 'M' | 'L', number>;
  relation:   Record<string, number>;
  people:     Record<string, Record<string, number>>;
};

/** Average / max / min over a bucket's daily values. Null when the bucket has none. */
function boxOf(m: Map<string, number>, decimals: 0 | 2): DietBox | null {
  const round = (v: number) => (decimals === 0 ? Math.round(v) : Math.round(v * 100) / 100);
  const vals = [...m.values()];
  if (!vals.length) return null;

  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min: round(min), max: round(max), avg: round(sum / vals.length) };
}

export async function computeDietTrend(
  userId: string,
  grain: TrendGrain,
  windowStart: Date,
  windowEnd: Date,
  crossActivities: string[],
): Promise<{ grain: TrendGrain; data: DietTrendBucket[] }> {
  // Today is a partial day and would drag every per-day figure down, so the
  // window stops at yesterday — the same cap the summary path uses.
  const yesterday    = yesterdayStr();
  const startStr     = ymd(windowStart);
  const rawEnd       = ymd(windowEnd);
  const effectiveEnd = rawEnd < yesterday ? rawEnd : yesterday;

  if (effectiveEnd < startStr) return { grain, data: [] };

  const effectiveEndDate = new Date(`${effectiveEnd}T00:00:00.000Z`);

  // ── One bounded query for the whole window ────────────────────────────────
  const { from, to } = fetchBounds(startStr, effectiveEnd);
  const docs = await Log.find(dietFilter(userId, from, to, crossActivities)).lean();

  // Assign every record to its diet day once, and drop anything the 6 am
  // padding pulled in from outside the window.
  const entries: { doc: any; date: string }[] = [];
  for (const doc of docs as any[]) {
    const date = assignDietDate(doc);
    if (!date || date < startStr || date > effectiveEnd) continue;
    entries.push({ doc, date });
  }

  // ── Bucketing, all in memory ──────────────────────────────────────────────
  const starts = buildBucketStarts(grain, windowStart, effectiveEndDate);

  const keyOf = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return ymd(bucketStartFor(grain, y, m, d));
  };

  const accByBucket = new Map<string, DietAccum>();
  for (const s of starts) accByBucket.set(ymd(s), newDietAccum());

  for (const { doc, date } of entries) {
    const acc = accByBucket.get(keyOf(date));
    if (acc) accumulateDietRecord(acc, doc, date);
  }

  const data: DietTrendBucket[] = starts.map(s => {
    const key = ymd(s);
    const a = accByBucket.get(key) as DietAccum;

    const spicy: Record<'H' | 'M' | 'L', number> = { H: 0, M: 0, L: 0 };
    for (const lvl of a.spicinessByDate.values()) spicy[lvl]++;

    const relation: Record<string, number> = { ...a.byRelationType };
    if (a.aloneCount > 0) relation['혼자'] = a.aloneCount;

    const people: Record<string, Record<string, number>> = {};
    for (const [name, d] of Object.entries(a.personMap)) people[name] = d.categories;

    return {
      label:          bucketLabel(grain, s),
      start:          key,
      daysInBucket:   bucketDayCount(grain, s, windowStart, effectiveEndDate),
      eatingCutoff:   boxOf(a.finishByDate, 0),
      caffeineCutoff: boxOf(a.caffeineByDate, 0),
      servings:       boxOf(a.servingsByDate, 2),
      carbs:          boxOf(a.carbsByDate, 2),
      ateIng:     Object.fromEntries(a.ateIngCount),
      ateItems:   Object.fromEntries(a.ateItemCount),
      drankIng:   Object.fromEntries(a.drinkIngCount),
      drankItems: Object.fromEntries(a.drinkItemCount),
      spicy,
      relation,
      people,
    };
  });

  return { grain, data };
}
