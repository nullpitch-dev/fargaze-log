// src/app/calendar/_lib/month-layout.ts
//
// Pure layout for the Month view (WBS #59). No React here, so it can be
// tested against real API responses.
//
// RULES (Google Calendar's, except where noted)
//   · Bars: all-day records and timed records of 24 h or more. A bar spans
//     every day it touches and continues into the next week row.
//   · Chips: every other timed record, on its START day only (a night's sleep
//     does not draw a second chip on the morning after — our rule; sleep
//     would otherwise double every day).
//   · Lanes: bars first (earliest, then longest), then chips by time, each in
//     the lowest free lane. A day whose items reach past the last lane shows
//     "+N more" in that last lane instead.
//   · Reading & study (독서(기간), 공부(기간)) never become bars. They share
//     ONE row per week: ▶ title on a start day, ✓ title on a finish day,
//     otherwise the number of books being read.

import type { CalendarEvent } from '@/lib/calendar/calendar';
import { addDays } from '@/lib/calendar/calendar';

const DAY_MS = 86_400_000;

export const READING_NAMES = new Set(['독서(기간)', '공부(기간)']);
export const isReading = (e: CalendarEvent) => READING_NAMES.has(e.name ?? '');

export function isBar(e: CalendarEvent): boolean {
  if (e.kind === 'allDay') return true;
  return e.kind === 'timed' && !!e.start && !!e.end
    && Date.parse(e.end) - Date.parse(e.start) >= DAY_MS;
}

export const labelOf = (e: CalendarEvent) => e.title || e.name || e.category;

/** Does the record appear on this display date at all? */
export const touches = (e: CalendarEvent, date: string) => e.startDate <= date && e.endDate >= date;

// ── Month grid ──────────────────────────────────────────────────────────────

export function monthGrid(cursor: string): { month: string; from: string; to: string; weeks: string[][] } {
  const [y, m] = cursor.split('-').map(Number);
  const first = `${cursor.slice(0, 7)}-01`;
  const last  = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const mon   = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;   // Mon = 0
  const from  = addDays(first, -mon(first));
  const to    = addDays(last, 6 - mon(last));
  const weeks: string[][] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  return { month: cursor.slice(0, 7), from, to, weeks };
}

// ── One week row ────────────────────────────────────────────────────────────
// Also the all-day strip of the Week (7 columns) and Day (1 column) views:
// every "7" is dates.length.

export interface Placed {
  event: CalendarEvent;
  lane: number;
  startCol: number;
  endCol: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface ReadingCell {
  ongoing: CalendarEvent[];
  starts: CalendarEvent[];
  finishes: CalendarEvent[];
}

export interface WeekLayout {
  dates: string[];
  bars: Placed[];            // visible bars
  chips: Placed[];           // visible chips
  more: number[];            // per column: items hidden behind "+N more"
  moreLane: number;          // the lane "+N more" sits in
  lanesUsed: number;         // lanes actually drawn (≤ maxLanes)
  reading: ReadingCell[] | null;   // null when the week has no reading, or the row is off
}

export function layoutWeek(
  dates: string[], events: CalendarEvent[], readingEvents: CalendarEvent[],
  maxLanes: number, showReading: boolean,
): WeekLayout {
  const n = dates.length;
  const first = dates[0], last = dates[n - 1];
  const col = (d: string) => dates.indexOf(d);

  const bars  = events.filter(e => isBar(e) && e.startDate <= last && e.endDate >= first);
  const chips = events.filter(e => !isBar(e) && e.startDate >= first && e.startDate <= last);

  const placed: Placed[] = [];
  const occ: boolean[][] = [];
  const free = (lane: number, a: number, b: number) => {
    for (let c = a; c <= b; c++) if (occ[lane]?.[c]) return false;
    return true;
  };
  const take = (lane: number, a: number, b: number) => {
    occ[lane] ??= Array(n).fill(false);
    for (let c = a; c <= b; c++) occ[lane][c] = true;
  };
  const place = (e: CalendarEvent, a: number, b: number) => {
    let lane = 0;
    while (!free(lane, a, b)) lane++;
    take(lane, a, b);
    placed.push({ event: e, lane, startCol: a, endCol: b,
      continuesBefore: e.startDate < first, continuesAfter: e.endDate > last });
  };

  bars
    .map(e => ({ e, a: e.startDate < first ? 0 : col(e.startDate), b: e.endDate > last ? n - 1 : col(e.endDate) }))
    .sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a) || (x.e.start ?? '').localeCompare(y.e.start ?? ''))
    .forEach(({ e, a, b }) => place(e, a, b));

  chips
    .sort((x, y) => x.startDate.localeCompare(y.startDate) || (x.start ?? '').localeCompare(y.start ?? ''))
    .forEach(e => { const c = col(e.startDate); place(e, c, c); });

  // Overflow: a column overflows when any of its items sits at or past maxLanes.
  const L = maxLanes;
  const overflow = Array(n).fill(false);
  for (const p of placed) if (p.lane >= L) for (let c = p.startCol; c <= p.endCol; c++) overflow[c] = true;

  const more = Array(n).fill(0);
  const visible: Placed[] = [];
  for (const p of placed) {
    let show = p.lane < L;
    for (let c = p.startCol; c <= p.endCol && show; c++) if (overflow[c] && p.lane >= L - 1) show = false;
    if (show) visible.push(p);
    else for (let c = p.startCol; c <= p.endCol; c++) more[c]++;
  }

  const lanesUsed = Math.min(L, Math.max(0, ...visible.map(p => p.lane + 1), ...more.map(n => (n ? L : 0))));

  let reading: ReadingCell[] | null = null;
  if (showReading) {
    const inWeek = readingEvents.filter(e => e.startDate <= last && e.endDate >= first);
    if (inWeek.length) {
      reading = dates.map(d => ({
        ongoing:  inWeek.filter(e => touches(e, d)),
        starts:   inWeek.filter(e => e.startDate === d),
        finishes: inWeek.filter(e => e.endDate === d),
      }));
    }
  }

  return {
    dates,
    bars:  visible.filter(p => isBar(p.event)),
    chips: visible.filter(p => !isBar(p.event)),
    more, moreLane: L - 1, lanesUsed, reading,
  };
}

// ── Filters ─────────────────────────────────────────────────────────────────

export function applyFilters(
  events: CalendarEvent[], hiddenCategories: string[], hiddenCrossActivities: string[],
  hiddenNames: string[] = [],
): CalendarEvent[] {
  const hc = new Set(hiddenCategories), hx = new Set(hiddenCrossActivities), hn = new Set(hiddenNames);
  return events.filter(e => !hc.has(e.category)
    && !(e.crossActivity && hx.has(e.crossActivity))
    && !(e.name && hn.has(e.name)));
}

/** ISO 8601 week number (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));        // Thursday of this week
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return Math.floor((thu.getTime() - jan1) / DAY_MS / 7) + 1;
}

/** "Day 120 of 474" for a reading period, counted in display dates. */
export function readingProgress(e: CalendarEvent, date: string): { day: number; of: number } {
  const d = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) + 1;
  return { day: d(e.startDate, date), of: d(e.startDate, e.endDate) };
}
