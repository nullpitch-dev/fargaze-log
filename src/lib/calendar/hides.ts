// The Calendar's Hide list (Design §15.9.2, Hyoje 26 Nov 2026). Pure: the page, the side
// calendar and the server use it alike.
//
// Each entry hides one activity of a category ("생활 – 식물 관리") or all of it ("기록 – All"),
// for records, plans or both: 아침 준비 means something as a record, not as a repeated plan.
// A tick switches an entry on (hidden) or off (shown, kept in the list); × removes it.
// Today's Coming up never uses it: a hidden plan still shows there.
// The Hide list replaced the category ticks: categories ticked off before become
// "<category> – All · Both" entries (hidesFrom), so nothing hidden comes back.

export type HideScope = 'records' | 'plans' | 'both';
export interface HideEntry {
  category: string;
  /** The activity name; null = every activity of the category. */
  name: string | null;
  scope: HideScope;
  /** Ticked = hidden. */
  on: boolean;
}

export const SCOPES: { key: HideScope; label: string }[] = [
  { key: 'both', label: 'Both' },
  { key: 'records', label: 'Records' },
  { key: 'plans', label: 'Plans' },
];
export const scopeLabel = (s: HideScope) => SCOPES.find(x => x.key === s)?.label ?? s;

/** The same entry (category, activity, scope). */
export const sameHide = (a: Pick<HideEntry, 'category' | 'name' | 'scope'>, b: Pick<HideEntry, 'category' | 'name' | 'scope'>) =>
  a.category === b.category && (a.name ?? null) === (b.name ?? null) && a.scope === b.scope;

/** Whether a record (plan = false) or plan is hidden by the ticked entries. */
export function isHiddenBy(hides: HideEntry[] | undefined, category: string | null | undefined, name: string | null | undefined, plan: boolean): boolean {
  if (!hides?.length) return false;
  const c = category ?? '', n = name ?? '';
  return hides.some(h => h.on
    && h.category === c
    && (h.name == null || h.name === n)
    && (h.scope === 'both' || h.scope === (plan ? 'plans' : 'records')));
}

/** The list a user starts with, from the category ticks of before. */
export function hidesFrom(hiddenCategories: string[] | undefined): HideEntry[] {
  return (hiddenCategories ?? []).filter(Boolean).map(category => ({ category, name: null, scope: 'both' as const, on: true }));
}

/** Checks a list sent to the server; null when it isn't one. */
export function parseHides(v: unknown): HideEntry[] | null {
  if (!Array.isArray(v) || v.length > 300) return null;
  const out: HideEntry[] = [];
  for (const x of v) {
    const category = typeof x?.category === 'string' ? x.category.trim() : '';
    const name = x?.name == null || x?.name === '' ? null : typeof x.name === 'string' ? x.name.trim() : undefined;
    const scope = x?.scope;
    if (!category || category.length > 100 || name === undefined || (name && name.length > 100)) return null;
    if (!SCOPES.some(s => s.key === scope)) return null;
    out.push({ category, name, scope, on: x?.on !== false });
  }
  return out;
}

/** The ticked entries for a query string (the Year counts, search): "[[cat, name, scope], …]". */
export const hidesParam = (hides: HideEntry[]) =>
  JSON.stringify(hides.filter(h => h.on).map(h => [h.category, h.name ?? '', h.scope]));

export function hidesFromParam(s: string | null): HideEntry[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return parseHides(Array.isArray(v) ? v.map((x: any) => ({ category: x?.[0], name: x?.[1] || null, scope: x?.[2], on: true })) : []) ?? [];
  } catch { return []; }
}
