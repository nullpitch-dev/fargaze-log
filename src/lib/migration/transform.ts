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

export function parseDuration(d: string, h: string, m: string, s: string, label: string) {
  // If any field contains #NUM! treat entire duration as null
  if ([d, h, m, s].some(v => v?.includes('#NUM') || v?.includes('#DIV'))) {
    return { days: null, hours: null, minutes: null, seconds: null, label: null };
  }
  return {
    days: parseInteger(d),
    hours: parseInteger(h),
    minutes: parseInteger(m),
    seconds: parseInteger(s),
    label: parseString(label),
  };
}

// ── ROW VALIDATION ────────────────────────────────────────────────────────────

export function createRowFilter() {
  let presetFound = false;

  return function shouldSkipRow(row: any[]): boolean {
    const activityCategory = row[0]?.toString().trim();
    const activity = row[1]?.toString().trim();

    if (activity === 'Preset') {
      presetFound = true;
      return true;
    }
    if (presetFound) return true;

    if (!activityCategory) return true;
    if (activityCategory === '#N/A') return true;
    if (activityCategory.startsWith('#')) return true;

    return false;
  };
}
