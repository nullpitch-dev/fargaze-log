// src/lib/calendar/search.ts
//
// Calendar search (WBS #59), modelled on the Search page's 상세 검색 but with
// the Calendar's own matching and ordering (28 Sep 2026):
//   · CONTAINS, not fuzzy: a term matches when the field holds that text,
//     case-insensitive. The Search page's Atlas Search ranks fuzzy matches and
//     stops at 100, which cannot answer "the latest 200 matches in date order".
//   · Words separated by spaces must ALL appear (any order, any of the fields
//     searched); "quoted phrases" stay together.
//   · Field conditions are ANDed with the main box and with each other.
//   · "Doesn't have" removes records whose searchable text contains any of its
//     terms.
//   · Newest first. The page's filters (category ticks, cross-activities,
//     hidden activities) are applied in the query, so the limit counts only
//     records that would show.

/** Every text field the main box searches — the Search page's list. */
export const ALL_TEXT_PATHS = [
  'activity.category', 'activity.name', 'activity.title', 'activity.additionalInfo',
  'location.activity', 'location.online', 'location.other',
  'cost.category', 'cost.categoryDetail',
  'purchase.item', 'purchase.unit',
  'food.drinks.item', 'food.foods.item', 'food.alcohols.item',
  'people.target',
  'transport.from', 'transport.to',
  'travel.city', 'travel.theme',
  'exercise.item', 'reading.title', 'movie.title',
  'notes',
];

/** The 상세 검색 field list, with the Search page's labels. */
export const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: 'activity.name',           label: '활동명' },
  { value: 'activity.title',          label: '제목' },
  { value: 'activity.additionalInfo', label: '추가정보' },
  { value: 'activity.category',       label: '카테고리' },
  { value: 'location.activity',       label: '장소' },
  { value: 'purchase.item',           label: '구매항목' },
  { value: 'people.target',           label: '사람' },
  { value: 'cost.category',           label: '비용카테고리' },
  { value: 'transport.from',          label: '출발지' },
  { value: 'transport.to',            label: '도착지' },
  { value: 'travel.city',             label: '여행도시' },
  { value: 'notes',                   label: '메모' },
];
const FIELD_SET = new Set(FIELD_OPTIONS.map(f => f.value));

export const SEARCH_LIMIT = 200;          // shown, newest first (Google's cap)
export const SEARCH_SCAN_LIMIT = 2000;    // fetched before the exact date cut; beyond this the total reads "2000+"

/** 'Brita "작은 정수기" 필터' → ['작은 정수기', 'Brita', '필터'] */
export function parseTerms(raw: string): string[] {
  const out: string[] = [];
  const rest = raw.replace(/"([^"]+)"/g, (_, p: string) => { if (p.trim()) out.push(p.trim()); return ' '; });
  for (const w of rest.split(/\s+/)) if (w) out.push(w);
  return out.slice(0, 12).map(t => t.slice(0, 80));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contains = (t: string) => ({ $regex: esc(t), $options: 'i' });

export interface SearchInput {
  q: string;
  conditions: { field: string; value: string }[];
  not: string;
  excludeCategories: string[];
  excludeCrossActivities: string[];
  excludeNames: string[];
  /** Coarse instant bounds (already padded); the exact cut is by display date afterwards. */
  fromMs: number | null;
  toMs: number | null;
  fromYear: number | null;
  toYear: number | null;
}

/** "field:value|field:value" → valid conditions only. */
export function parseConditions(raw: string | null): { field: string; value: string }[] {
  if (!raw) return [];
  return raw.split('|').map(part => {
    const i = part.indexOf(':');
    return i > 0 ? { field: part.slice(0, i).trim(), value: part.slice(i + 1).trim() } : null;
  }).filter((c): c is { field: string; value: string } => !!c && FIELD_SET.has(c.field) && !!c.value);
}

/** The Mongo filter, or null when nothing was asked for. */
export function buildSearchFilter(userId: string, s: SearchInput): Record<string, any> | null {
  const and: any[] = [];

  for (const t of parseTerms(s.q)) and.push({ $or: ALL_TEXT_PATHS.map(p => ({ [p]: contains(t) })) });
  for (const c of s.conditions) for (const t of parseTerms(c.value)) and.push({ [c.field]: contains(t) });
  const hasText = and.length > 0;

  const nots = parseTerms(s.not);
  if (nots.length) and.push({ $nor: nots.flatMap(t => ALL_TEXT_PATHS.map(p => ({ [p]: contains(t) }))) });

  const hasDates = s.fromMs !== null || s.toMs !== null;
  if (!hasText && !hasDates) return null;
  if (hasDates) {
    const dt: any = {};
    if (s.fromMs !== null) dt.$gte = new Date(s.fromMs);
    if (s.toMs !== null) dt.$lt = new Date(s.toMs);
    const yr: any = {};
    if (s.fromYear !== null) yr.$gte = s.fromYear - 1;
    if (s.toYear !== null) yr.$lte = s.toYear;
    and.push({ $or: [{ 'start.datetime': dt }, { allDay: true, 'start.year': yr }] });
  }

  if (s.excludeCategories.length) and.push({ 'activity.category': { $nin: s.excludeCategories } });
  if (s.excludeCrossActivities.length) and.push({ 'activity.crossActivity': { $nin: s.excludeCrossActivities } });
  if (s.excludeNames.length) and.push({ 'activity.name': { $nin: s.excludeNames } });

  return { userId, $and: and };
}

/** Newest first by the logged date, then by the moment. */
export const SEARCH_SORT = { 'start.year': -1, 'start.month': -1, 'start.day': -1, 'start.datetime': -1 } as const;
