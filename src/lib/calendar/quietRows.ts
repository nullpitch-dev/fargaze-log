// Quiet rows (Hyoje, 17 Nov 2026): long records that say little and crowd the Day view,
// each with its own switch under the Calendar's Rows (beside Reading & study). Switched
// off = left out of every view, the Year counts included — but only when done alone
// (Relationship 혼자): 음료 with someone at 회사 still shows (Hyoje, 17 Nov). Pure: the page uses it too.
// The names are Hyoje's own data (like READING_NAMES); a per-user setting comes with the
// English demo data.

export interface QuietRow {
  key: string;
  label: string;
  /** Matches a record by its activity name and its place ("회사 - 회의실 1" counts as 회사). */
  test: (name: string, place: string) => boolean;
}

const DRINK_PLACES = new Set(['집', '회사', '사이트', '2단지']);

/** "회사 - 회의실 1" → "회사" (the place details rule, 67.8). */
export const placeOf = (place: string | null | undefined) => {
  const p = String(place ?? '').trim();
  const i = p.indexOf(' - ');
  return i < 0 ? p : p.slice(0, i).trim();
};

export const QUIET_ROWS: QuietRow[] = [
  { key: 'workday', label: '평일 업무', test: name => name === '평일 업무' },
  { key: 'drinks', label: '음료 @ 집, 회사, 사이트, 2단지', test: (name, place) => name === '음료' && DRINK_PLACES.has(placeOf(place)) },
];

export const QUIET_KEYS = new Set(QUIET_ROWS.map(r => r.key));

/** Only records done alone are quiet (activity.relationship, a locked value). */
export const QUIET_RELATIONSHIP = '혼자';

/** Whether a record falls in one of the switched-off rows. */
export function isQuiet(name: string | null | undefined, place: string | null | undefined, relationship: string | null | undefined, hidden: Iterable<string>): boolean {
  const off = new Set(hidden);
  if (!off.size || String(relationship ?? '').trim() !== QUIET_RELATIONSHIP) return false;
  return QUIET_ROWS.some(r => off.has(r.key) && r.test(String(name ?? '').trim(), String(place ?? '')));
}
