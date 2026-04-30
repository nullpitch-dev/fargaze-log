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

// Zip item/amount/unit/note arrays into array of objects
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
  return itemArr.map((item, i) => ({
    item,
    amount: amountArr[i] ?? '',
    unit: unitArr[i] ?? '',
    note: noteArr[i] ?? '',
  }));
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
      targetList.forEach(target => {
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
