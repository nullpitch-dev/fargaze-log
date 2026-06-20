// src/lib/insights/diet.ts
import Log from '@/models/Log';
import IngredientMaster from '@/models/IngredientMaster';
import { SLEEP_THRESHOLD_HOUR, hourStringToMinutes, assignDrinkingDate, yesterdayStr } from './dates';

const CARB_SCORE: Record<string, number> = { H: 2, M: 1, L: 0 };
const spRank = (x: string | undefined) => (x === 'H' ? 3 : x === 'M' ? 2 : 1); // L / none = 1

// ── Shared core ──────────────────────────────────────────────────────────────
// Fetch food/drink-bearing records for the period and run the per-day aggregation.
// Both computeDietSummary and each computeDietTrendBucket shape their output from
// the accumulators returned here, so the two stay in lock-step.
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

  const fetchStart = new Date(`${effectiveStart}T00:00:00.000Z`);
  fetchStart.setUTCHours(fetchStart.getUTCHours() - SLEEP_THRESHOLD_HOUR);

  const filter: Record<string, any> = {
    userId,
    'start.datetime': {
      $gte: fetchStart,
      $lte: new Date(`${effectiveEnd}T23:59:59.999Z`),
    },
    $or: [
      { 'food.foods.0':  { $exists: true } },
      { 'food.drinks.0': { $exists: true } },
    ],
  };
  if (crossActivities.length) {
    filter['activity.crossActivity'] = { $in: crossActivities };
  }
  const docs = await Log.find(filter).lean();

  const finishByDate    = new Map<string, number>();
  const caffeineByDate  = new Map<string, number>();
  const servingsByDate  = new Map<string, number>();
  const carbsByDate     = new Map<string, number>();
  const spicinessByDate = new Map<string, 'H' | 'M' | 'L'>();

  const ateIngCount    = new Map<string, number>();
  const ateItemCount   = new Map<string, number>();
  const drinkIngCount  = new Map<string, number>();
  const drinkItemCount = new Map<string, number>();

  let aloneCount = 0;
  let companionTotal = 0;
  const byRelationType: Record<string, number> = {};
  const personMap: Record<string, { categories: Record<string, number>; total: number }> = {};

  for (const doc of docs) {

		const d: any = doc;
    if (!d.start?.datetime) continue;

    // 아침 is exempt from the 6 am rule: a pre-6 am breakfast keeps its own
    // calendar date and its real (un-shifted) clock time. Every other type
    // still rolls a pre-6 am record back to the previous day. The non-roll
    // branch mirrors assignDrinkingDate's output minus the rollback step.
    const isBreakfast = d.food?.type === '아침';
    const dateStr = isBreakfast
      ? new Date(d.start.datetime).toISOString().slice(0, 10)
      : assignDrinkingDate(new Date(d.start.datetime), d.start?.hour);
    if (!periodDates.has(dateStr)) continue;

    const foods:  any[] = d.food?.foods  ?? [];
    const drinks: any[] = d.food?.drinks ?? [];
		const hasFood  = foods.some(f => f?.item);
    const hasDrink = drinks.some(dr => dr?.item);

    // Drinks treemaps — every non-alcoholic drink, regardless of food
    for (const dr of drinks) {
      if (dr?.item) drinkItemCount.set(dr.item, (drinkItemCount.get(dr.item) ?? 0) + 1);
      for (const ing of (dr?.ingredients ?? [])) {
        if (ing) drinkIngCount.set(ing, (drinkIngCount.get(ing) ?? 0) + 1);
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
        caffeineByDate.set(dateStr, Math.max(caffeineByDate.get(dateStr) ?? 0, cMins));
      }
    }

		// Companions ("with whom I eat *or drink*") — count food and drink events.
    if (hasFood || hasDrink) {
      if (!d.people?.length) {
        aloneCount++;
      } else {
        const eventCategoryCounts: Record<string, number> = {};
        for (const g of d.people) {
          const c = g.category ?? '기타';
          eventCategoryCounts[c] = (eventCategoryCounts[c] ?? 0) + 1;
        }
        const dom = Object.entries(eventCategoryCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '기타';
        byRelationType[dom] = (byRelationType[dom] ?? 0) + 1;

        const seen = new Set<string>();
        for (const g of d.people) {
          const c = g.category ?? '기타';
          const targets: string[] = Array.isArray(g.targets)
            ? g.targets
            : typeof g.target === 'string' ? [g.target] : [];
          for (const name of targets) {
            if (!name || name === '등' || seen.has(name)) continue;
            seen.add(name);
            if (!personMap[name]) personMap[name] = { categories: {}, total: 0 };
            personMap[name].categories[c] = (personMap[name].categories[c] ?? 0) + 1;
            personMap[name].total++;
          }
        }
      }
      companionTotal++;
    }

    // Everything below is food-bearing only — an actual "eating" record
    if (!hasFood) continue;

		let endMins = hourStringToMinutes(d.end?.hour) ?? hourStringToMinutes(d.start?.hour);
    if (endMins !== null) {
      if (!isBreakfast && endMins < SLEEP_THRESHOLD_HOUR * 60) endMins += 1440;
      finishByDate.set(dateStr, Math.max(finishByDate.get(dateStr) ?? 0, endMins));
    }

    let mealServings = 0;
    for (const f of foods) {
      const amt = parseFloat(String(f?.amount ?? ''));
      if (!isNaN(amt)) mealServings += amt;
    }
    servingsByDate.set(dateStr, (servingsByDate.get(dateStr) ?? 0) + mealServings);

    const carbScore = d.food?.carbs ? (CARB_SCORE[d.food.carbs] ?? 0) : 0;
    carbsByDate.set(dateStr, (carbsByDate.get(dateStr) ?? 0) + carbScore * mealServings);

    const sp: string | undefined = d.food?.spiciness;
    const cur: 'H' | 'M' | 'L' = sp === 'H' ? 'H' : sp === 'M' ? 'M' : 'L';
    const prev = spicinessByDate.get(dateStr);
    if (!prev || spRank(cur) > spRank(prev)) spicinessByDate.set(dateStr, cur);

    for (const f of foods) {
      if (f?.item) ateItemCount.set(f.item, (ateItemCount.get(f.item) ?? 0) + 1);
      for (const ing of (f?.ingredients ?? [])) {
        if (ing) ateIngCount.set(ing, (ateIngCount.get(ing) ?? 0) + 1);
      }
    }

    // Companions ("with whom I eat")
    if (!d.people?.length) {
      aloneCount++;
    } else {
      const eventCategoryCounts: Record<string, number> = {};
      for (const g of d.people) {
        const c = g.category ?? '기타';
        eventCategoryCounts[c] = (eventCategoryCounts[c] ?? 0) + 1;
      }
      const dom = Object.entries(eventCategoryCounts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '기타';
      byRelationType[dom] = (byRelationType[dom] ?? 0) + 1;

      const seen = new Set<string>();
      for (const g of d.people) {
        const c = g.category ?? '기타';
        const targets: string[] = Array.isArray(g.targets)
          ? g.targets
          : typeof g.target === 'string' ? [g.target] : [];
        for (const name of targets) {
          if (!name || name === '등' || seen.has(name)) continue;
          seen.add(name);
          if (!personMap[name]) personMap[name] = { categories: {}, total: 0 };
          personMap[name].categories[c] = (personMap[name].categories[c] ?? 0) + 1;
          personMap[name].total++;
        }
      }
    }
    companionTotal++;
  }

  return {
    level1Map, daysInPeriod, rawStart, rawEnd,
    finishByDate, caffeineByDate, servingsByDate, carbsByDate, spicinessByDate,
    ateIngCount, ateItemCount, drinkIngCount, drinkItemCount,
    aloneCount, companionTotal, byRelationType, personMap,
  };
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

// ── One trend bucket ─────────────────────────────────────────────────────────
// Raw per-bucket shapes. The client computes box stats, picks global top-N
// composition members, and assembles rank flow across buckets.
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
