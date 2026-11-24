// src/app/calendar/_lib/time-layout.ts
//
// Pure layout for the Week and Day views' time grid (WBS #59).
//
// RULES
//   · Only records that are not bars go in the grid: timed records shorter
//     than 24 h, and points (no end). Bars and reading go in the strip above.
//   · A record crossing midnight is cut into one piece per day it touches, in
//     the DISPLAY zone.
//   · Every piece is drawn at least MIN_MINUTES tall, so a 2-minute record
//     or a point stays clickable; overlap is judged on the drawn size.
//   · Layering (Hyoje, 11 Nov), not narrow columns: pieces are stacked by start
//     time, a later one on top, indented one step past the deepest piece still
//     running when it starts (`depth`) and running to the right edge. A piece with
//     less than a line left doesn't count (24 Nov): the new one may cover its last
//     minutes and start further left. A lower piece's title goes
//     in its first stretch not covered by a later one (`labelTop`): at its top,
//     else just below whatever covers it. Only when a piece has no stretch tall
//     enough for one line (`labelMin`) does it share its depth side by side with
//     the pieces starting with it (`col` / `cols`).

import type { CalendarEvent } from '@/lib/calendar/calendar';
import { addDays, zonedDayStart } from '@/lib/calendar/calendar';
import { isBar, isReading, touches } from './month-layout';

export const MIN_MINUTES = 15;
const MIN_MS = 60_000;

export interface Piece {
  event: CalendarEvent;
  top: number;            // minutes from local midnight
  bottom: number;         // minutes, drawn (≥ top + MIN_MINUTES)
  continuesBefore: boolean;
  continuesAfter: boolean;
  depth: number;          // indent steps (0 = the full width)
  col: number;            // side by side within its depth (rare): which one
  cols: number;           //   and how many
  labelTop: number;       // minutes: where its title goes (top, or below what covers it)
  labelRoom: number;      // minutes free from labelTop (to the next cover or its end)
  z: number;              // stacking order: later on top
}

/** No longer a cap on depth (24 Nov: past it a piece went exactly on top of another and hid
 *  it — a zero-length record at 18:10 under one at 18:11). The view makes the steps smaller
 *  instead when a day goes deep (`stepFor`). */
export const MAX_DEPTH = 4;

/** % of the day's width per depth step: `base`, smaller when the day goes deeper than the
 *  last piece could keep `keep` % of the width. */
export function stepFor(pieces: Piece[], base: number, keep = 40): number {
  const deepest = pieces.reduce((m, p) => Math.max(m, p.depth), 0);
  return deepest ? Math.min(base, (100 - keep) / deepest) : base;
}

/** The pieces of one display date, layered. `labelMin` = minutes one line of text needs
 *  at the view's scale; `minMinutes` = the least a piece is drawn (the view's minimum
 *  height), so layering is judged on what is actually drawn. */
export function layoutDay(events: CalendarEvent[], date: string, tz: string, labelMin = 20, minMinutes = MIN_MINUTES): Piece[] {
  const least = Math.max(MIN_MINUTES, minMinutes);
  const dayStart = zonedDayStart(date, tz);
  const dayEnd   = zonedDayStart(addDays(date, 1), tz);
  const dayMins  = Math.round((dayEnd - dayStart) / MIN_MS);   // 23 / 24 / 25 h

  const raw: Piece[] = [];
  for (const e of events) {
    if (isBar(e) || isReading(e) || !e.start || !touches(e, date)) continue;
    const s = Date.parse(e.start);
    const t = e.end ? Date.parse(e.end) : s;
    // Guard: nothing of it falls on this date (an end at exactly midnight belongs to the day before).
    if (s >= dayEnd || t < dayStart || (t === dayStart && t > s)) continue;
    let   top    = Math.max(0, Math.round((s - dayStart) / MIN_MS));
    let   bottom = Math.min(dayMins, Math.round((t - dayStart) / MIN_MS));
    if (bottom - top < least) {
      top = Math.min(top, dayMins - least);   // a 23:55 point still fits the day
      bottom = top + least;
    }
    raw.push({ event: e, top, bottom, continuesBefore: s < dayStart, continuesAfter: t > dayEnd,
      depth: 0, col: 0, cols: 1, labelTop: top, labelRoom: bottom - top, z: 0 });
  }
  // Earlier first; at the same start the longer one underneath.
  raw.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  raw.forEach((p, i) => { p.z = i; });

  const group = new Map<Piece, Piece[]>();   // side-by-side groups (the fallback)
  const siblings = (a: Piece, b: Piece) => !!group.get(a)?.includes(b);
  const overlap = (a: Piece, b: Piece) => a.top < b.bottom && b.top < a.bottom;
  // A piece with less than a line left when another starts is nearly over: the new one may
  // sit on its last minutes instead of stepping in (Hyoje, 24 Nov: "it can start from the
  // left edge" — a 13:00 lesson was indented only because a lunch ran to 13:05).
  const tail = labelMin;

  const place = () => {
    // Depth: one step past the deepest piece still running (with more than a line to go).
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      const g = group.get(p);
      if (g && g[0] !== p) { p.depth = g[0].depth; continue; }
      let d = 0;
      for (let j = 0; j < i; j++) {
        const q = raw[j];
        if (q.top <= p.top && q.bottom - p.top > tail && !siblings(p, q)) d = Math.max(d, q.depth + 1);
      }
      p.depth = d;
    }
    // Title: the first stretch of at least labelMin not covered by a piece drawn over it.
    for (const p of raw) {
      const covers = raw.filter(q => q !== p && q.z > p.z && overlap(p, q) && !siblings(p, q))
        .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)] as const)
        .sort((a, b) => a[0] - b[0]);
      let at = p.top, found: number | null = null, room = 0;
      let best = -1, bestRoom = 0;                       // the widest gap, should none be a line tall
      for (const [a, b] of covers) {
        if (a - at >= labelMin) { found = at; room = a - at; break; }
        if (a - at > bestRoom) { best = at; bestRoom = a - at; }
        at = Math.max(at, b);
      }
      if (found === null && p.bottom - at >= Math.min(labelMin, p.bottom - p.top)) { found = at; room = p.bottom - at; }
      if (found === null && p.bottom - at > bestRoom) { best = at; bestRoom = p.bottom - at; }
      // Nearly a line (24 Nov: a lesson's title lost in 12 free minutes between two others).
      if (found === null && bestRoom >= 0.75 * labelMin) { found = best; room = bestRoom; }
      p.labelTop = found ?? -1;
      p.labelRoom = room;
    }
  };
  place();
  // A piece left with no room for its title. What takes its room: the pieces starting on
  // it before it has had a line of its own — counted from where it is first free (below a
  // short one drawn on top of its start). Then:
  //  · already side by side: they join its row (24 Nov: 06:00 대변 · 체중 · 팔굽혀펴기 and
  //    아침 준비 starting a few minutes later — four across);
  //  · two of a kind (they end near it too — a lesson and the waiting for it): side by side;
  //  · it is short: drawn ON TOP of them (a 15-minute payment just before sleep); their
  //    titles go below it;
  //  · they are short: they move to its right half, it keeps its full width and title;
  //  · else side by side (24 Nov: a 13:00 lesson and coffee from 13:17).
  // Repeated until nothing moves (each change can take another's room), at most 4 times.
  const alike = (p: Piece, q: Piece) => Math.abs(q.bottom - p.bottom) <= Math.min(3 * labelMin, 20);   // minutes, whatever the scale
  const short = (p: Piece) => p.bottom - p.top <= 2 * labelMin;
  const regroup = (g: Piece[]) => g.forEach((q, k) => { group.set(q, g); q.col = k; q.cols = g.length; });
  let top = raw.length;
  for (let pass = 0; pass < 4; pass++) {
    let again = false;
    for (const p of raw) {
      if (p.labelTop >= 0) continue;
      const free = Math.max(p.top, ...raw.filter(q => q !== p && q.z > p.z && q.top <= p.top && overlap(p, q) && !siblings(p, q)).map(q => q.bottom));
      const on = raw.filter(q => q !== p && !group.has(q) && q.z > p.z && q.top >= p.top && q.top < free + labelMin && overlap(p, q));
      const g0 = group.get(p);
      if (g0) {
        if (on.length && g0.every(q => q.cols === g0.length)) { regroup([...g0, ...on]); again = true; }
        continue;
      }
      const two = on.filter(q => alike(p, q));
      if (two.length) { regroup([p, ...two]); again = true; continue; }
      if (short(p)) { if (p.z < top - 1 || on.length) { p.z = top++; again = true; } continue; }
      if (!on.length) continue;
      if (on.every(short)) {
        for (const q of on) { group.set(q, [p, q]); q.col = 1; q.cols = 2; }
        group.set(p, [p, ...on]);
      } else regroup([p, ...on]);
      again = true;
    }
    if (!again) break;
    place();
  }
  for (const p of raw) if (p.labelTop < 0) { p.labelTop = p.top; p.labelRoom = labelMin; }   // the rare rest: title at the top
  return raw;
}

/** Minutes past local midnight of `nowMs` on `date`, or null if now is not on that date. */
export function nowMinutes(nowMs: number, date: string, tz: string): number | null {
  const a = zonedDayStart(date, tz), b = zonedDayStart(addDays(date, 1), tz);
  return nowMs >= a && nowMs < b ? (nowMs - a) / MIN_MS : null;
}

/** Monday-first week containing `date`. */
export function weekOf(date: string): string[] {
  const mon = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const first = addDays(date, -mon);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}
