// src/app/calendar/_lib/time-layout.ts
//
// Pure layout for the Week and Day views' time grid (WBS #59).
//
// RULES (Google Calendar's)
//   · Only records that are not bars go in the grid: timed records shorter
//     than 24 h, and points (no end). Bars and reading go in the strip above.
//   · A record crossing midnight is cut into one piece per day it touches, in
//     the DISPLAY zone.
//   · Every piece is drawn at least MIN_MINUTES tall, so a 2-minute record
//     or a point stays clickable; overlap is judged on the drawn size.
//   · Overlapping pieces form a cluster. Each takes the first free column in
//     its cluster; all share the cluster's column count. A piece then widens
//     to the right across every column that is free for its whole time.

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
  col: number;
  cols: number;
  span: number;           // columns it covers, from col rightwards
}

/** The pieces of one display date, laid out in columns. */
export function layoutDay(events: CalendarEvent[], date: string, tz: string): Piece[] {
  const dayStart = zonedDayStart(date, tz);
  const dayEnd   = zonedDayStart(addDays(date, 1), tz);
  const dayMins  = Math.round((dayEnd - dayStart) / MIN_MS);   // 23 / 24 / 25 h

  const raw: Omit<Piece, 'col' | 'cols' | 'span'>[] = [];
  for (const e of events) {
    if (isBar(e) || isReading(e) || !e.start || !touches(e, date)) continue;
    const s = Date.parse(e.start);
    const t = e.end ? Date.parse(e.end) : s;
    // Guard: nothing of it falls on this date (an end at exactly midnight belongs to the day before).
    if (s >= dayEnd || t < dayStart || (t === dayStart && t > s)) continue;
    let   top    = Math.max(0, Math.round((s - dayStart) / MIN_MS));
    let   bottom = Math.min(dayMins, Math.round((t - dayStart) / MIN_MS));
    if (bottom - top < MIN_MINUTES) {
      top = Math.min(top, dayMins - MIN_MINUTES);   // a 23:55 point still fits the day
      bottom = top + MIN_MINUTES;
    }
    raw.push({ event: e, top, bottom, continuesBefore: s < dayStart, continuesAfter: t > dayEnd });
  }
  raw.sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  // Clusters of transitively overlapping pieces.
  const out: Piece[] = [];
  let cluster: Piece[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map(p => p.col + 1));
    for (const p of cluster) {
      p.cols = cols;
      let span = 1;
      while (p.col + span < cols && !cluster.some(q =>
        q.col === p.col + span && q.top < p.bottom && q.bottom > p.top)) span++;
      p.span = span;
    }
    out.push(...cluster);
    cluster = [];
  };
  for (const r of raw) {
    if (cluster.length && r.top >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = new Set(cluster.filter(p => p.bottom > r.top).map(p => p.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...r, col, cols: 1, span: 1 });
    clusterEnd = Math.max(clusterEnd, r.bottom);
  }
  if (cluster.length) flush();
  return out;
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
