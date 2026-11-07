// Place details "A - B" (#67.8, agreed 5 Nov 2026; Design §15.5.9). Pure.
//
// Hyoje's convention: in a place name, "A - B" means A has a point and B — a room,
// a golf course's course, a shop in a department store — does not. The separator is
// exactly " - " (space, hyphen, space), so "Saint-Denis" stays one name.
//
// A name uses the point of the LONGEST name that has one: drop " - …" parts from
// the end until a name with a point is found. An exact point always wins.
//   "Harrods - Food Hall - The Steak House" → "Harrods - Food Hall" if that has a
//   point, else "Harrods", else nothing.
// Favourite labels (집 / 회사 / 사이트 / 내차) resolve on the head: "회사 - 회의실"
// → "<the real 회사 then> - 회의실", and then the rule above.

export const DETAIL_SEP = ' - ';

/** The name and its shorter forms, longest first: A - B - C, A - B, A. */
export function namePrefixes(name: string): string[] {
  const parts = name.split(DETAIL_SEP);
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) out.push(parts.slice(0, i).join(DETAIL_SEP));
  return out;
}

/** The name whose point this name uses, or null when no form of it has one. */
export function pointNameFor(name: string, hasPoint: (n: string) => boolean): string | null {
  if (!name) return null;
  for (const p of namePrefixes(name)) if (hasPoint(p)) return p;
  return null;
}

/** Head (before the first " - ") and the rest (with its leading " - ", or ''). */
export function splitHead(name: string): { head: string; rest: string } {
  const i = name.indexOf(DETAIL_SEP);
  return i < 0 ? { head: name, rest: '' } : { head: name.slice(0, i), rest: name.slice(i) };
}

/** Replaces a favourite label at the head with the place it meant; the detail stays.
 *  `resolve` returns the real place for a label, or null when it isn't one. */
export function withFavorite(name: string, resolve: (label: string) => string | null): string {
  const whole = resolve(name);
  if (whole) return whole;
  const { head, rest } = splitHead(name);
  if (!rest) return name;
  const r = resolve(head);
  return r ? r + rest : name;
}

/** True when `name` is `base` itself or `base` followed by " - …". */
export const isUnder = (name: string, base: string) =>
  name === base || name.startsWith(base + DETAIL_SEP);

/** `name` with its `from` head swapped for `to` (name must be under `from`). */
export const swapHead = (name: string, from: string, to: string) => to + name.slice(from.length);

/** For a regular expression: the name with its special characters escaped. */
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** MongoDB filter for a field holding `base` or `base - …`. */
export const underFilter = (base: string) => ({ $regex: `^${escapeRegex(base)}(${escapeRegex(DETAIL_SEP)}.*)?$` });
