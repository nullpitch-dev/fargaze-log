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
//   · Columns and layering (rewritten 24 Nov, close to Google Calendar): pieces that
//     overlap form a cluster with columns. A piece takes the leftmost column free when
//     it starts; with none free it is layered on top, indented one step, in a column
//     whose pieces have already shown their titles (the 11 Nov layering, per column);
//     else a new column. Each piece then widens over empty columns to its right. A
//     piece with less than a line left (and a line shown) no longer counts as running.
//     Titles go in the first stretch of a line not covered where the title is drawn
//     (`labelTop`).

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
  col: number;            // its column (24 Nov: columns where titles clash)
  cols: number;           //   and how many in its cluster
  colLeft: number;        // % of the day's width where its column(s) start
  colWidth: number;       // % it spans (its column, widened over empty ones to the right)
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
  // The narrowest column that goes deep decides: its last piece keeps `keep` % of the column.
  let step = base;
  for (const p of pieces) if (p.depth) step = Math.min(step, (p.colWidth * (100 - keep) / 100) / p.depth);
  return step;
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
      depth: 0, col: 0, cols: 1, colLeft: 0, colWidth: 100, labelTop: top, labelRoom: bottom - top, z: 0 });
  }
  // Earlier first; at the same start the longer one underneath.
  raw.sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  // ── Placing (Hyoje, 24 Nov: share the width where titles would clash, don't indent when
  //    the left is free, two columns rather than four) — close to Google Calendar:
  //  · Pieces that overlap, directly or through others, form a cluster with columns.
  //  · A piece takes the leftmost column FREE when it starts (nothing there still running
  //    with more than a line to go, or still without a line for its title).
  //  · None free: it is LAYERED on top in the leftmost column whose running pieces have all
  //    shown their titles, indented one step past them (the 11 Nov layering, per column).
  //  · Neither: a new column.
  //  · Then each piece widens to the right over columns with nothing overlapping it.
  const tail = labelMin;
  const overlap = (a: Piece, b: Piece) => a.top < b.bottom && b.top < a.bottom;
  let cluster: Piece[][] = [], members: Piece[] = [], end = -1;
  const finish = () => {
    const n = cluster.length || 1;
    for (const p of members) {
      let span = 1;
      for (let k = p.col + 1; k < n && !cluster[k].some(q => overlap(p, q)); k++) span++;
      p.cols = n; p.colLeft = (p.col / n) * 100; p.colWidth = (span / n) * 100;
    }
    cluster = []; members = [];
  };
  raw.forEach((p, i) => { p.z = i; });
  for (const p of raw) {
    if (p.top >= end) { finish(); end = -1; }
    const running = (c: Piece[]) => c.filter(q => q.bottom > p.top && (q.bottom - p.top > tail || p.top - q.top < labelMin));
    let k = cluster.findIndex(c => running(c).length === 0);
    if (k >= 0) p.depth = 0;
    else {
      k = cluster.findIndex(c => running(c).every(q => p.top - q.top >= labelMin));
      if (k >= 0) p.depth = Math.max(...running(cluster[k]).map(q => q.depth)) + 1;
      else { k = cluster.length; cluster.push([]); p.depth = 0; }
    }
    cluster[k].push(p); p.col = k; members.push(p);
    end = Math.max(end, p.bottom);
  }
  finish();

  // ── Titles: the first stretch of a line not covered where the title is (its left part) ──
  const STEP = 5, TITLE = 35;                                  // % of the width: a depth step, a title's reach
  const left = (p: Piece) => p.colLeft + p.depth * STEP;
  const right = (p: Piece) => p.colLeft + p.colWidth;
  for (const p of raw) {
    const reach = Math.min(right(p), left(p) + TITLE);
    const covers = raw.filter(q => q !== p && q.z > p.z && overlap(p, q) && left(q) < reach && right(q) > left(p))
      .map(q => [Math.max(q.top, p.top), Math.min(q.bottom, p.bottom)] as const)
      .sort((a, b) => a[0] - b[0]);
    let at = p.top, found: number | null = null, room = 0, best = -1, bestRoom = 0;
    for (const [a, b] of covers) {
      if (a - at >= labelMin) { found = at; room = a - at; break; }
      if (a - at > bestRoom) { best = at; bestRoom = a - at; }
      at = Math.max(at, b);
    }
    if (found === null && p.bottom - at >= Math.min(labelMin, p.bottom - p.top)) { found = at; room = p.bottom - at; }
    if (found === null && p.bottom - at > bestRoom) { best = at; bestRoom = p.bottom - at; }
    if (found === null && bestRoom >= 0.75 * labelMin) { found = best; room = bestRoom; }
    p.labelTop = found ?? -1;
    p.labelRoom = room;
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
