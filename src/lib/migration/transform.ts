import IngredientMaster from '../../models/IngredientMaster';

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Remove thousand-separator commas and parse as number
export function parseNumber(val: string): number | null {
  if (!val || val.trim() === '' || val === '#NUM!' || val === '#N/A') return null;
  const cleaned = val.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Parse string to number, return null if invalid
export function parseInteger(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const num = parseInt(val.trim());
  return isNaN(num) ? null : num;
}

// Clean string — return null if empty
export function parseString(val: string): string | null {
  if (!val || val.trim() === '') return null;
  if (val.trim() === '#N/A') return null;
  if (val.trim().startsWith('#')) return null;
  return val.trim();
}

// Parse boolean
export function parseBoolean(val: string): boolean {
  return val === 'TRUE' || val === 'true' || val === '1';
}

// ── DATE/TIME ─────────────────────────────────────────────────────────────────

export function parseDateTime(
  year: string,
  month: string,
  day: string,
  hour: string
): Date | null {
  if (!year || !month || !day || !hour || hour.trim() === '') return null;
  try {
    const y = parseInt(year);
    const m = parseInt(month) - 1; // JS months are 0-indexed
    const d = parseInt(day);
    const [h, min] = hour.split(':').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(h)) return null;
    return new Date(y, m, d, h, min || 0, 0);
  } catch {
    return null;
  }
}

// ── MULTI-VALUE PARSING ───────────────────────────────────────────────────────

// Split comma-separated string into array, filter empty
export function splitComma(val: string): string[] {
  if (!val || val.trim() === '') return [];
  return val.split(',').map(s => s.trim()).filter(s => s !== '');
}

// Zip item/amount/unit arrays into array of objects
export function zipMultiValue(
  items: string,
  amounts: string,
  units: string
): Array<{ item: string; amount: string; unit: string }> {
  const itemArr = splitComma(items);
  const amountArr = splitComma(amounts);
  const unitArr = splitComma(units);
  if (itemArr.length === 0) return [];
  return itemArr.map((item, i) => ({
    item,
    amount: amountArr[i] ?? '',
    unit: unitArr[i] ?? '',
  }));
}

// Like zipMultiValue but splits plus-concatenated item names and divides amount evenly
export function zipMultiValueWithPlusSplit(
  items: string,
  amounts: string,
  units: string
): Array<{ item: string; amount: string; unit: string }> {
  const itemArr = splitComma(items);
  const amountArr = splitComma(amounts);
  const unitArr = splitComma(units);
  if (itemArr.length === 0) return [];
  return itemArr.flatMap((item, i) => {
    const subItems = item.split('+').map(s => s.trim()).filter(s => s !== '');
    if (subItems.length <= 1) {
      return [{ item, amount: amountArr[i] ?? '', unit: unitArr[i] ?? '' }];
    }
    const rawAmount = parseFloat((amountArr[i] ?? '').replace(/,/g, ''));
    const dividedAmount = !isNaN(rawAmount) ? String(rawAmount / subItems.length) : '';
    return subItems.map(subItem => ({
      item: subItem,
      amount: dividedAmount,
      unit: unitArr[i] ?? '',
    }));
  });
}

// Zip item/amount/unit/note arrays into array of objects
// Plus-concatenated item names are split and amount is divided evenly
export function zipFoodValue(
  items: string,
  amounts: string,
  units: string,
  notes: string
): Array<{ item: string; amount: string; unit: string; note: string }> {
  const itemArr = splitComma(items);
  const amountArr = splitComma(amounts);
  const unitArr = splitComma(units);
  const noteArr = splitComma(notes);
  if (itemArr.length === 0) return [];
  return itemArr.flatMap((item, i) => {
    const subItems = item.split('+').map(s => s.trim()).filter(s => s !== '');
    if (subItems.length <= 1) {
      return [{
        item,
        amount: amountArr[i] ?? '',
        unit: unitArr[i] ?? '',
        note: noteArr[i] ?? '',
      }];
    }
    const rawAmount = parseFloat((amountArr[i] ?? '').replace(/,/g, ''));
    const dividedAmount = !isNaN(rawAmount)
      ? String(rawAmount / subItems.length)
      : '';
    return subItems.map(subItem => ({
      item: subItem,
      amount: dividedAmount,
      unit: unitArr[i] ?? '',
      note: noteArr[i] ?? '',
    }));
  });
}

// Parse people field (pipe = group separator, comma = within group)
export function parsePeople(
  methods: string,
  categories: string,
  targets: string
): Array<{ method: string; category: string; target: string }> {
  if (!methods && !categories && !targets) return [];

  const methodGroups = (methods || '').split('|').map(s => s.trim());
  const categoryGroups = (categories || '').split('|').map(s => s.trim());
  const targetGroups = (targets || '').split('|').map(s => s.trim());

  const result: Array<{ method: string; category: string; target: string }> = [];

  const groupCount = Math.max(methodGroups.length, categoryGroups.length, targetGroups.length);

  for (let g = 0; g < groupCount; g++) {
    const method = methodGroups[g] ?? methodGroups[0] ?? '';
    const category = categoryGroups[g] ?? categoryGroups[0] ?? '';
    const targetList = splitComma(targetGroups[g] ?? '');

    if (targetList.length === 0) {
      if (method || category) {
        result.push({ method, category, target: '' });
      }
    } else {
      targetList
        .filter(target => target !== '등')
        .forEach(target => {
          result.push({ method, category, target });
        });
    }
  }

  return result;
}

// ── DURATION ──────────────────────────────────────────────────────────────────

/**
 * Compute duration in total seconds from start/end datetimes and their UTC offsets.
 *
 * UTC conversion: localDatetime - (timezoneOffset * 3600 * 1000) = UTC ms
 *
 * Cases:
 *   - Normal event:        (endUTC - startUTC) in seconds
 *   - Same start/end:      0
 *   - allDay, single day:  null (no start or end datetime)
 *   - allDay, multi-day:   (endDate - startDate) in seconds using date-only values
 *   - Data error (no end): null
 */
export function computeTotalSeconds(
  allDay: boolean,
  startDatetime: Date | null,
  endDatetime: Date | null,
  startTimezoneOffset: number | null,
  endTimezoneOffset: number | null,
  startYear: number | null,
  startMonth: number | null,
  startDay: number | null,
  endYear: number | null,
  endMonth: number | null,
  endDay: number | null,
): number | null {
  // All-day event
  if (allDay) {
    // Single all-day: no end date → null
    if (!endYear || !endMonth || !endDay) return null;
    // Multi-day all-day: use date-only values
    if (!startYear || !startMonth || !startDay) return null;
    const startMs = Date.UTC(startYear, startMonth - 1, startDay);
    const endMs = Date.UTC(endYear, endMonth - 1, endDay);
    const diff = endMs - startMs;
    return diff > 0 ? diff / 1000 : 0;
  }

  // Normal event: need both timestamps
  if (!startDatetime || !endDatetime) return null;

  const startOffset = startTimezoneOffset ?? 0;
  const endOffset = endTimezoneOffset ?? 0;

  // Convert local datetime to UTC milliseconds
  const startUTC = startDatetime.getTime() - startOffset * 3600 * 1000;
  const endUTC = endDatetime.getTime() - endOffset * 3600 * 1000;

  const diff = endUTC - startUTC;
  if (diff < 0) return null; // data error — end before start
  return diff / 1000;
}

// ── ROW VALIDATION ────────────────────────────────────────────────────────────

export function createRowFilter() {
  let presetFound = false;

  return function shouldSkipRow(row: any[]): boolean {
    const activityCategory = row[0]?.toString().trim();
    const activity = row[1]?.toString().trim();

    // Check Preset BEFORE checking empty activity category
    if (activity === 'Preset') {
      presetFound = true;
      return true;
    }
    if (presetFound) return true;

    if (!activityCategory) return true;
    if (activityCategory === '#N/A') return true;
    if (activityCategory.startsWith('#')) return true;

    // Skip header rows
    if (activityCategory === 'activity category') return true;
    if (activityCategory === 'activity') return true;
    if (activityCategory === 'categoryLevel1') return true;

    return false;
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// parseFoodIngredients.ts  —  add to src/lib/migration/transform.ts
//
// Part 4 of the ingredient plan. Runs AFTER comma-split and plus-split,
// on each individual food item string. Extracts the parenthesised ingredient
// list and returns { item, ingredients }.
//
// Rules:
//   바나나(단 과일)                → { item: '바나나', ingredients: ['단 과일'] }
//   샌드위치(가공육|치즈|잎 채소)  → { item: '샌드위치', ingredients: ['가공육','치즈','잎 채소'] }
//   밥                              → { item: '밥', ingredients: ['Not Defined'] }   (no parens)
//   밥()                            → { item: '밥', ingredients: ['Not Defined'] }   (empty parens)
//
// Validation: ingredients are checked against the level2 vocabulary, which is
// loaded ONCE from the ingredient_master collection (single source of truth —
// the Ingredient sheet). If any ingredient is not valid, throw — the migration
// caller skips the entire row and logs the offending value (Part 4.6).
// ─────────────────────────────────────────────────────────────────────────────


// Module-level cache of valid level2 values. Populated by loadValidLevel2().
let _validLevel2: Set<string> | null = null;

/**
 * Load the level2 vocabulary from ingredient_master. Call once at the start of
 * migration (before parsing any rows). Idempotent — subsequent calls are no-ops
 * unless `force` is true.
 *
 * The "Not Defined" sentinel is always accepted in addition to the DB values.
 */
export async function loadValidLevel2(userId: string, force = false): Promise<Set<string>> {
  if (_validLevel2 && !force) return _validLevel2;

  const docs = await IngredientMaster.find({ userId }).select('level2 -_id').lean();
  const set = new Set<string>(docs.map((d: any) => d.level2));
  set.add('Not Defined'); // sentinel for unfilled / unparseable

  if (set.size <= 1) {
    throw new Error(
      'loadValidLevel2: ingredient_master is empty for userId "' +
        userId +
        '". Run `npm run migrate-ingredient` first.'
    );
  }

  _validLevel2 = set;
  return set;
}

/** For tests / re-seeding: clear the cached vocabulary. */
export function resetValidLevel2(): void {
  _validLevel2 = null;
}

export class IngredientValidationError extends Error {
  constructor(public readonly badValue: string, public readonly rawItem: string) {
    super(`Unknown level2 ingredient "${badValue}" in food item "${rawItem}"`);
    this.name = 'IngredientValidationError';
  }
}

/**
 * Split one already-comma/plus-split food token into name + ingredients[].
 * Throws IngredientValidationError if any ingredient is not a valid level2 value.
 *
 * `loadValidLevel2()` MUST have been awaited earlier in the migration run,
 * otherwise this throws (fail-fast rather than silently accepting anything).
 */
export function parseFoodIngredients(raw: string): { item: string; ingredients: string[] } {
  if (!_validLevel2) {
    throw new Error(
      'parseFoodIngredients called before loadValidLevel2(). ' +
        'Await loadValidLevel2(userId) once at migration start.'
    );
  }

  const trimmed = raw.trim();

  // Match a trailing (...) group. Use the LAST '(' so item names containing
  // parentheses earlier are tolerated, though that is not expected.
  const open = trimmed.lastIndexOf('(');
  const close = trimmed.lastIndexOf(')');

  if (open === -1 || close === -1 || close < open) {
    return { item: trimmed, ingredients: ['Not Defined'] };   // no parentheses
  }

  const item = trimmed.slice(0, open).trim();
  const inside = trimmed.slice(open + 1, close).trim();

  if (inside === '') {
    return { item, ingredients: ['Not Defined'] };            // empty parentheses
  }

  const ingredients = inside
    .split('|')
    .map(s => s.trim())
    .filter(s => s !== '');

  if (ingredients.length === 0) {
    return { item, ingredients: ['Not Defined'] };
  }

  for (const ing of ingredients) {
    if (!_validLevel2.has(ing)) {
      throw new IngredientValidationError(ing, trimmed);
    }
  }

  return { item, ingredients };
}

