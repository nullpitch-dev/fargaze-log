// Drafts (#71, Hyoje 9 Nov 2026): an OPEN record (a start time and no end time) may be
// saved half-filled — a started activity can't always be filled in yet. What it may lack
// until it ends: required sections, the cost amount / currency / categories, an item's
// amount and unit, a people group's name, a food's ingredients, the journey. What it may
// never have, open or not: unknown list values, separators the sheet splits on, the same
// record twice, an end before its start. Ending it (End now, or an end time) needs them all.
// Pure: the server applies it after the form's own checks.

import { isOpen } from './groups';

const CAN_WAIT: RegExp[] = [
  / is required for /,                                  // required sections (groups.ts)
  /item, amount and unit go together/,
  /group has no name/,
  /^Cost: .*missing/,
  /^Cost: .*(without a foreign amount|without its currency)/,
  /^Journey: /,
  /^Return type is required/,
  /has no ingredients/,
];

export const NEEDED_TO_END = ' — needed before it ends';

/** Moves what an open record may lack from problems to warnings. */
export function relaxOpen(doc: any, problems: string[], warnings: string[]): { problems: string[]; warnings: string[] } {
  if (!isOpen(doc)) return { problems, warnings };
  const keep: string[] = [], wait: string[] = [];
  for (const p of problems) (CAN_WAIT.some(re => re.test(p)) ? wait : keep).push(p);
  return { problems: keep, warnings: [...warnings, ...wait.map(p => p + NEEDED_TO_END)] };
}

/** Ending an open record: what it was let off while open (shown "as before") is now required. */
export function tightenOnEnd(base: any, doc: any, problems: string[], warnings: string[]): { problems: string[]; warnings: string[] } {
  if (!base || !isOpen(base) || isOpen(doc)) return { problems, warnings };
  const keep: string[] = [], now: string[] = [];
  for (const w of warnings) {
    const plain = w.replace(/ \(as before\)$/, '');
    (plain !== w && CAN_WAIT.some(re => re.test(plain)) ? now : keep).push(plain !== w && CAN_WAIT.some(re => re.test(plain)) ? plain : w);
  }
  return { problems: [...problems, ...now], warnings: keep };
}

// ── Planned end (Hyoje, 10 Nov) ──────────────────────────────────────────────
// End is when it actually ended; a plan, and anything still going, has only a planned
// end. So an End that hasn't come yet — on a plan, or a record ending later — becomes the
// planned end (when there is none), and End is left empty: the record stays open (a draft
// may wait for its details) and shows "until …" instead.

const instant = (p: any): number | null => {
  if (!p) return null;
  const off = typeof p.timezoneOffset === 'number' ? p.timezoneOffset : 0;
  if (p.datetime) return new Date(p.datetime).getTime() - off * 3_600_000;
  if (p.year && p.month && p.day) return Date.UTC(p.year, p.month - 1, p.day) - off * 3_600_000;
  return null;
};
const EMPTY_POINT = { timezone: null, datetime: null, year: null, month: null, day: null, weekday: null, hour: null, timezoneOffset: null };
const NO_END_NOTE = /^No end time: saved as an open record/;

/** Moves an End still to come into plannedEnd (in place). True when it moved. */
export function endAheadToPlanned(doc: any, warnings: string[], now = Date.now()): boolean {
  if (!doc?.end?.year) return false;
  const startAt = instant(doc.start), endAt = instant(doc.end);
  const isPlan = startAt != null && startAt > now;
  // A date-only end is ahead from the day after today on (a trip entered on its last day
  // has ended); a timed one with a minute's grace for a clock that's a little ahead.
  const ahead = endAt != null && endAt > now + (doc.end.datetime ? 60_000 : 0);
  if (!isPlan && !ahead) return false;
  if (!doc.plannedEnd?.year) doc.plannedEnd = { ...doc.end };
  doc.end = { ...EMPTY_POINT, timezone: doc.end.timezone ?? null };
  doc.duration = { totalSeconds: null };
  for (let i = warnings.length - 1; i >= 0; i--) if (NO_END_NOTE.test(warnings[i])) warnings.splice(i, 1);
  return true;
}

/** "12:00" or "Wed 12 Nov 12:00" style text is the page's business; this says if two differ. */
export function plannedEndChanged(a: any, b: any): boolean {
  const k = (p: any) => (p?.year ? `${p.year}-${p.month}-${p.day} ${p.hour ?? ''} ${p.timezone ?? ''}` : '');
  return k(a?.plannedEnd) !== k(b?.plannedEnd);
}
