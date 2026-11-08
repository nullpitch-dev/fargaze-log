// The entry form's field groups (#71, Design §15.7). Pure: the phone uses it too.
// Keys follow the survey's FIELD_GROUPS (sheetSurvey.ts) where they meet the form;
// title, time, zones and calendar are always on the form, so they are not groups.
// An activity's rules (activity_master.groups) name these keys: `shown` opens the
// group on a new record, `required` refuses a record without it (대변 → bowel).
// An activity without rules takes its category's: the groups most of its activities
// show (shown by at least half; required only where all of them require it).

export interface EntryGroup { key: string; label: string; paths: string[] }

export const ENTRY_GROUPS: EntryGroup[] = [
  { key: 'link',      label: 'Cross activity',  paths: ['activity.crossActivity'] },
  { key: 'place',     label: 'Place',           paths: ['location'] },
  { key: 'cost',      label: 'Cost',            paths: ['cost'] },
  { key: 'purchase',  label: 'Purchase',        paths: ['purchase'] },
  { key: 'meal',      label: 'Meal',            paths: ['food.type', 'food.carbs', 'food.fat', 'food.spiciness'] },
  { key: 'drinks',    label: 'Drinks',          paths: ['food.drinks'] },
  { key: 'foods',     label: 'Foods',           paths: ['food.foods'] },
  { key: 'alcohols',  label: 'Alcohol',         paths: ['food.alcohols'] },
  { key: 'people',    label: 'People',          paths: ['people'] },
  { key: 'transport', label: 'Journey',         paths: ['transport'] },
  { key: 'bowel',     label: 'Bowel',           paths: ['bowel'] },
  { key: 'body',      label: 'Body',            paths: ['body'] },
  { key: 'sleep',     label: 'Sleep',           paths: ['sleep'] },
  { key: 'exercise',  label: 'Exercise',        paths: ['exercise'] },
  { key: 'reading',   label: 'Reading',         paths: ['reading'] },
  { key: 'movie',     label: 'Movie',           paths: ['movie'] },
  { key: 'golf',      label: 'Golf',            paths: ['golf'] },
  { key: 'income',    label: 'Income',          paths: ['income'] },
  { key: 'travel',    label: 'Travel',          paths: ['travel'] },
  { key: 'notes',     label: 'Notes',           paths: ['notes'] },
];

export const GROUP_KEYS = new Set(ENTRY_GROUPS.map(g => g.key));

const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

/** Whether a stored record has anything in a group. */
export function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.some(hasValue);
  if (v instanceof Date) return true;
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(hasValue);
  return false;
}

export function groupFilled(doc: any, key: string): boolean {
  const g = ENTRY_GROUPS.find(x => x.key === key);
  return !!g && g.paths.some(p => hasValue(get(doc, p)));
}

export interface GroupRules { required: string[]; shown: string[]; from: 'activity' | 'category' | 'none' }

/** Rules for an activity: its own, else its category's (see the header). */
export function rulesFor(
  name: string,
  acts: { name: string; category: string; groups?: { required?: string[]; shown?: string[] } | null }[],
): GroupRules {
  const self = acts.find(a => a.name === name);
  if (!self) return { required: [], shown: [], from: 'none' };
  if (self.groups && (self.groups.shown?.length || self.groups.required?.length)) {
    const required = self.groups.required ?? [];
    return { required, shown: [...new Set([...(self.groups.shown ?? []), ...required])], from: 'activity' };
  }
  const peers = acts.filter(a => a.category === self.category && a.groups && (a.groups.shown?.length || a.groups.required?.length));
  if (!peers.length) return { required: [], shown: [], from: 'none' };
  const count = (pick: (a: typeof peers[number]) => string[]) => {
    const m = new Map<string, number>();
    for (const a of peers) for (const k of new Set(pick(a))) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const shown = [...count(a => [...(a.groups!.shown ?? []), ...(a.groups!.required ?? [])]).entries()].filter(([, c]) => c * 2 >= peers.length).map(([k]) => k);
  const required = [...count(a => a.groups!.required ?? []).entries()].filter(([, c]) => c === peers.length).map(([k]) => k);
  return { required, shown: [...new Set([...shown, ...required])], from: 'category' };
}
