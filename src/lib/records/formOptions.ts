// What the record form's pickers offer (#70 step 3, Design §15.6). Server only.
//
// Two kinds:
//   - list values: the master and reference lists. A value outside them is refused on
//     save (checkRecords), so these pickers are drop-downs.
//   - suggestions: values already used in records (places, people, items, units …),
//     most used first. Free text: anything may be typed; the list only helps.
// Suggestions take a scan of every record, so they are kept for ten minutes per user.

import Log from '../../models/Log';
import ActivityMaster from '../../models/ActivityMaster';
import CostMaster from '../../models/CostMaster';
import AlcoholConversion from '../../models/AlcoholConversion';
import IngredientMaster from '../../models/IngredientMaster';
import BowelScore from '../../models/BowelScore';
import TimezoneMaster from '../../models/TimezoneMaster';
import ExchangeRate from '../../models/ExchangeRate';
import PlaceCoord from '../../models/PlaceCoord';
import ReferenceList from '../../models/ReferenceList';
import { REFERENCE_LIST_NAMES } from '../admin/lists';

export interface FormOptions {
  activities: { name: string; category: string }[];
  zones: { code: string; offset: number; city: string }[];
  costs: { category: string; categoryDetail: string }[];
  currencies: string[];
  /** The Exchange rates list: KRW for one unit, the latest only (no history, Hyoje 5 Nov). */
  rates: { currency: string; rateKRW: number }[];
  alcohols: { item: string; unit: string }[];
  ingredients: { level1: string; level2: string }[];
  bowel: { amount: string[]; quality: string[]; characteristics: string[] };
  /** listName → values in the sheet's order */
  ref: Record<string, string[]>;
  /** Values used in records, most used first. */
  used: {
    places: string[]; online: string[]; people: string[];
    purchaseItems: string[]; purchaseUnits: string[];
    drinkItems: string[]; foodItems: string[]; foodUnits: string[];
    exerciseItems: string[]; exerciseUnits: string[]; setStyles: string[];
    sleep: string[]; cities: string[]; themes: string[];
  };
}

const CACHE_MS = 10 * 60 * 1000;
const usedCache = new Map<string, { at: number; used: FormOptions['used'] }>();

/** Values of one record path, most used first. `unwind` = the array to open first. */
async function usedValues(userId: string, path: string, unwind?: string): Promise<{ v: string; n: number; r: number }[]> {
  // r = uses in the last 12 months (Hyoje, 12 Nov: names from years ago led the People
  // suggestions; seven years of history outweighed what he does now).
  const since = new Date(Date.now() - 365 * 86400_000);
  const pipeline: any[] = [{ $match: { userId } }, { $project: { _id: 0, at: '$start.datetime', x: `$${unwind ?? path}` } }];
  if (unwind) {
    pipeline.push({ $unwind: '$x' }, { $project: { at: 1, x: `$x.${path.slice(unwind.length + 1)}` } });
  }
  pipeline.push(
    { $match: { x: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$x', n: { $sum: 1 }, r: { $sum: { $cond: [{ $gte: ['$at', since] }, 1, 0] } } } },
  );
  const rows = await Log.aggregate(pipeline).allowDiskUse(true);
  return (rows as any[]).map(r => ({ v: String(r._id), n: r.n, r: r.r }));
}

/** Several paths merged into one list: most used in the last 12 months first, then most used
 *  ever, then by name. */
function merge(...lists: { v: string; n: number; r?: number }[][]): string[] {
  const m = new Map<string, { n: number; r: number }>();
  for (const l of lists) for (const { v, n, r = 0 } of l) {
    const c = m.get(v) ?? { n: 0, r: 0 };
    m.set(v, { n: c.n + n, r: c.r + r });
  }
  return [...m.entries()].sort((a, b) => b[1].r - a[1].r || b[1].n - a[1].n || a[0].localeCompare(b[0], 'ko')).map(([v]) => v);
}

async function loadUsed(userId: string): Promise<FormOptions['used']> {
  const hit = usedCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.used;
  const [
    locAct, locOther, trFrom, trTo, online, people, pItem, pUnit,
    dItem, dUnit, fItem, fUnit, eItem, eUnit, eStyle, sleep, city, theme, points,
  ] = await Promise.all([
    usedValues(userId, 'location.activity'), usedValues(userId, 'location.other'),
    usedValues(userId, 'transport.from'), usedValues(userId, 'transport.to'),
    usedValues(userId, 'location.online'),
    usedValues(userId, 'people.target', 'people'),
    usedValues(userId, 'purchase.item', 'purchase'), usedValues(userId, 'purchase.unit', 'purchase'),
    usedValues(userId, 'food.drinks.item', 'food.drinks'), usedValues(userId, 'food.drinks.unit', 'food.drinks'),
    usedValues(userId, 'food.foods.item', 'food.foods'), usedValues(userId, 'food.foods.unit', 'food.foods'),
    usedValues(userId, 'exercise.item', 'exercise'), usedValues(userId, 'exercise.unit', 'exercise'),
    usedValues(userId, 'exercise.setStyle', 'exercise'),
    usedValues(userId, 'sleep.quality'), usedValues(userId, 'travel.city'), usedValues(userId, 'travel.theme'),
    PlaceCoord.find({ userId }).select('name').lean(),
  ]);
  const pointNames = (points as any[]).map(p => ({ v: String(p.name), n: 0 }));
  const used: FormOptions['used'] = {
    places: merge(locAct, locOther, trFrom, trTo, pointNames),
    online: merge(online),
    people: merge(people),
    purchaseItems: merge(pItem), purchaseUnits: merge(pUnit),
    drinkItems: merge(dItem), foodItems: merge(fItem), foodUnits: merge(dUnit, fUnit),
    exerciseItems: merge(eItem), exerciseUnits: merge(eUnit), setStyles: merge(eStyle),
    sleep: merge(sleep), cities: merge(city), themes: merge(theme),
  };
  usedCache.set(userId, { at: Date.now(), used });
  return used;
}

export async function loadFormOptions(userId: string): Promise<FormOptions> {
  const [acts, zones, costs, rates, alcohols, ings, bowel, refs, used] = await Promise.all([
    ActivityMaster.find({ userId }).select('name category').sort({ category: 1, name: 1 }).lean(),
    TimezoneMaster.find({ userId }).select('code offsetUTC city').sort({ offsetUTC: 1, code: 1 }).lean(),
    CostMaster.find({ userId }).select('category categoryDetail').sort({ category: 1, categoryDetail: 1 }).lean(),
    ExchangeRate.find({ userId }).select('currency rateKRW').sort({ currency: 1 }).lean(),
    AlcoholConversion.find({ userId }).select('item unit').sort({ item: 1, unit: 1 }).lean(),
    IngredientMaster.find({ userId }).select('level1 level2').sort({ level1: 1, level2: 1 }).lean(),
    BowelScore.find({ userId }).select('field value score').sort({ field: 1, score: -1, value: 1 }).lean(),
    ReferenceList.find({ userId, listName: { $in: REFERENCE_LIST_NAMES.map(r => r.listName) } }).select('listName value order').sort({ order: 1 }).lean(),
    loadUsed(userId),
  ]);
  const ref: Record<string, string[]> = Object.fromEntries(REFERENCE_LIST_NAMES.map(r => [r.listName, [] as string[]]));
  for (const r of refs as any[]) ref[r.listName]?.push(String(r.value));
  const bowelBy = (field: string) => (bowel as any[]).filter(b => b.field === field).map(b => String(b.value));
  return {
    activities: (acts as any[]).map(a => ({ name: a.name, category: a.category })),
    zones: (zones as any[]).map(z => ({ code: z.code, offset: z.offsetUTC, city: z.city })),
    costs: (costs as any[]).map(c => ({ category: c.category, categoryDetail: c.categoryDetail })),
    currencies: [...new Set((rates as any[]).map(r => String(r.currency)))],
    rates: (rates as any[]).map(r => ({ currency: String(r.currency), rateKRW: Number(r.rateKRW) })),
    alcohols: (alcohols as any[]).map(a => ({ item: a.item, unit: a.unit })),
    ingredients: (ings as any[]).map(i => ({ level1: i.level1, level2: i.level2 })),
    bowel: { amount: bowelBy('amount'), quality: bowelBy('quality'), characteristics: bowelBy('characteristics') },
    ref,
    used,
  };
}
