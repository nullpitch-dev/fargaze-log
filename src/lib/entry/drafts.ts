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
