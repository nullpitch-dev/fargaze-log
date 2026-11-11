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
//     time, a later one on top, indented one step per piece still running when
//     it starts (`depth`) and running to the right edge. A lower piece's title goes
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

export const MAX_DEPTH = 4;

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

  const place = () => {
    // Depth: one step past the deepest piece still running when it starts.
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      const g = group.get(p);
      if (g && g[0] !== p) { p.depth = g[0].depth; continue; }
      let d = 0;
      for (let j = 0; j < i; j++) {
        const q = raw[j];
        if (q.top <= p.top && q.bottom > p.top && !siblings(p, q)) d = Math.max(d, q.depth + 1);
      }
      p.depth = Math.min(d, MAX_DEPTH);
    }
    // Title: the first stretch of at least labelMin not covered by a later piece.
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      const covers = raw.slice(i + 1).filter(q => overlap(p, q) && !siblings(p, q) && q.depth > p.depth)
        .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)] as const)
        .sort((a, b) => a[0] - b[0]);
      let at = p.top, found: number | null = null, room = 0;
      for (const [a, b] of covers) {
        if (a - at >= labelMin) { found = at; room = a - at; break; }
        at = Math.max(at, b);
      }
      if (found === null && p.bottom - at >= Math.min(labelMin, p.bottom - p.top)) { found = at; room = p.bottom - at; }
      p.labelTop = found ?? -1;
      p.labelRoom = room;
    }
  };
  place();
  // The fallback: a piece with no room for its title shares its depth, side by side, with
  // the pieces starting within one line of it.
  for (const p of raw) {
    if (p.labelTop >= 0 || group.has(p)) continue;
    const g = [p, ...raw.filter(q => q !== p && !group.has(q) && q.top >= p.top && q.top - p.top < labelMin && overlap(p, q))];
    if (g.length < 2) continue;
    g.forEach((q, k) => { group.set(q, g); q.col = k; q.cols = g.length; });
  }
  if (group.size) place();
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
