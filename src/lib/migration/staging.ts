// Staging migration (#68, Design §11.7): the checks, as plain functions.
//
// Staging uploads new records only; it never edits. A record is "the same" when its
// activity name, title, start and end are all the same (activity names are unique
// across categories, so the category adds nothing). The title is part of it because
// several purchases often share one activity and time, e.g. an Amazon order logged as
// 구매 - 생활 · 정수기 필터 구매 and 구매 - 건강 · 유산균 구매 at 8:10 (Hyoje, 26 Oct).
// Agreed with Hyoje on 26 Oct:
//   - the same record twice in Staging            → the whole run stops
//   - a Staging record already in the database    → the whole run stops
//   - a Staging record missing from its year tab  → a warning; it is still sent
// A change to a record already sent is made in the edit feature or by a full migration.

import { tabForYear, DEFAULT_ARCHIVE_UNTIL } from '../yearTabs';

export interface Located { row: number; doc: any }

const iso = (d: unknown) => (d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 16) : '');
const pad = (v: unknown) => String(v ?? '').padStart(2, '0');

/**
 * One end of a record: the wall-clock datetime, or for an all-day record (no hour,
 * so no datetime) its local date — two all-day records on different days differ.
 */
function point(p: any): string {
  return iso(p?.datetime) || (p?.year ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : '');
}

/** Activity + title + start + end: what makes two records the same. */
export function recordKey(doc: any): string {
  return [String(doc?.activity?.name ?? '').trim(), String(doc?.activity?.title ?? '').trim(),
    point(doc?.start), point(doc?.end)].join('|');
}

/** "2026-10-25 19:00 → 19:40 · 식사 › 저녁" — wall-clock times as stored. */
export function describe(doc: any): string {
  const s = point(doc?.start).replace('T', ' ') || '(no start)';
  const e = point(doc?.end).replace('T', ' ');
  const title = String(doc?.activity?.title ?? '').trim();
  const cat = `${doc?.activity?.category ?? ''} › ${doc?.activity?.name ?? ''}${title ? ` · ${title}` : ''}`;
  if (s.length === 10 && e === s) return `${s} (all day) · ${cat}`;
  const end = !e ? '(no end)' : e.length > 10 && e.slice(0, 10) === s.slice(0, 10) ? e.slice(11) : e;
  return `${s} → ${end} · ${cat}`;
}

/** Fields the database must return for recordKey. */
export const KEY_FIELDS = 'activity.name activity.title start.datetime start.year start.month start.day end.datetime end.year end.month end.day';

/** Keys that appear more than once in Staging, with their rows. */
export function duplicatesWithin(items: Located[]): Located[][] {
  const by = new Map<string, Located[]>();
  for (const it of items) by.set(recordKey(it.doc), [...(by.get(recordKey(it.doc)) ?? []), it]);
  return [...by.values()].filter(g => g.length > 1);
}

/** Staging records whose key is already in the database. */
export function alreadyThere(items: Located[], existing: Set<string>): Located[] {
  return items.filter(it => existing.has(recordKey(it.doc)));
}

/** The database query that finds every possible match in one go (uses the start index). */
export function existingQuery(userId: string, docs: any[]): Record<string, unknown> {
  const names = [...new Set(docs.map(d => d?.activity?.name).filter(Boolean))];
  const timed = [...new Map(docs.filter(d => iso(d?.start?.datetime))
    .map(d => [iso(d.start.datetime), d.start.datetime])).values()];
  const days = [...new Map(docs.filter(d => !iso(d?.start?.datetime))
    .map(d => [point(d?.start), { 'start.year': d?.start?.year, 'start.month': d?.start?.month, 'start.day': d?.start?.day }])).values()];
  const or: Record<string, unknown>[] = [];
  if (timed.length) or.push({ 'start.datetime': { $in: timed } });
  for (const d of days) or.push({ 'start.datetime': null, ...d });
  return { userId, 'activity.name': { $in: names }, $or: or.length ? or : [{ _id: null }] };
}

/**
 * The year tab a record belongs to: the archive tab '~N' for N and earlier, otherwise
 * the year's own tab (#73; N is the stored archive year).
 */
export function yearTabFor(doc: any, archiveUntil = DEFAULT_ARCHIVE_UNTIL): string | null {
  return tabForYear(doc?.start?.year, archiveUntil);
}

/**
 * Staging records with no match in their year tab. `tabKeys` holds the keys read from
 * each tab; a tab that could not be read is absent, and its records are listed too.
 */
export function missingFromYearTab(items: Located[], tabKeys: Map<string, Set<string>>, archiveUntil = DEFAULT_ARCHIVE_UNTIL): { it: Located; tab: string | null; why: string }[] {
  const out: { it: Located; tab: string | null; why: string }[] = [];
  for (const it of items) {
    const tab = yearTabFor(it.doc, archiveUntil);
    if (!tab) { out.push({ it, tab, why: 'no start year' }); continue; }
    const keys = tabKeys.get(tab);
    if (!keys) { out.push({ it, tab, why: `the tab '${tab}' could not be read` }); continue; }
    if (!keys.has(recordKey(it.doc))) out.push({ it, tab, why: `not in '${tab}'` });
  }
  return out;
}
