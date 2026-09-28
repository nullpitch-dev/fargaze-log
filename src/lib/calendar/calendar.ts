// src/lib/calendar/calendar.ts
//
// Calendar view (WBS #59) — pure logic behind /api/calendar.
//
// TIME ZONES (the Google Calendar rule). A timed record is ONE MOMENT: its
// stored naive local wall clock minus its own offset. That moment is then
// shown in the DISPLAY zone the viewer picks (the device zone by default), so
// a London → Seoul flight shows both ends in London time before departure and
// both in Seoul time after arrival.
//
// The design doc (§5.3) says offsets are applied in computeTotalSeconds only.
// That invariant is about what is STORED: nothing stored is an instant. The
// calendar applies the offsets at READ time, here, in toInstant(), the same
// formula computeTotalSeconds uses.
//
// ALL-DAY records carry no time zone (Google's rule too): they sit on their
// logged dates whatever the display zone. The logged end date is INCLUSIVE —
// the last day shown.

// Look-back for timed records that started before the range and still run.
// Records longer than this (the "(기간)" periods — reading, travel, stays, one
// of 474 days) are fetched by their own query branch on duration instead.
export const MAX_TIMED_SPAN_DAYS = 31;
export const MAX_RANGE_DAYS      = 400;  // a Year view needs 366

const HOUR = 3_600_000;
const DAY  = 86_400_000;

// ── Zone helpers (Intl only, no library) ────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidZone(tz: string): boolean {
  try { fmt(tz); return true; } catch { return false; }
}

function parts(utcMs: number, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(new Date(utcMs))) {
    if (x.type !== 'literal') p[x.type] = Number(x.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of `tz` at the given moment, in minutes (London summer = 60). */
export function zoneOffsetMinutes(utcMs: number, tz: string): number {
  const p = parts(utcMs, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** The moment local midnight starts `date` (YYYY-MM-DD) in `tz`. */
export function zonedDayStart(date: string, tz: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const o1 = zoneOffsetMinutes(guess, tz);
  let t = guess - o1 * 60000;
  const o2 = zoneOffsetMinutes(t, tz);
  if (o2 !== o1) t = guess - o2 * 60000;
  return t;
}

/** Local calendar date (YYYY-MM-DD) of a moment in `tz`. */
export function zonedDate(utcMs: number, tz: string): string {
  const p = parts(utcMs, tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function ymd(y?: number | null, m?: number | null, d?: number | null): string | null {
  if (!y || !m || !d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/** Stored naive wall clock + its offset (hours) → the true moment. */
export function toInstant(naive: Date | string | null | undefined, offsetHours: number | null | undefined): number | null {
  if (!naive) return null;
  const ms = new Date(naive).getTime();
  if (isNaN(ms)) return null;
  return ms - (offsetHours ?? 0) * HOUR;
}

// ── Range ───────────────────────────────────────────────────────────────────

export interface CalendarRange {
  from: string;      // first display date, inclusive
  to:   string;      // last display date, inclusive
  tz:   string;      // display zone
  startMs: number;   // local midnight starting `from`
  endMs:   number;   // local midnight AFTER `to` (exclusive)
}

export function resolveRange(from: string, to: string, tz: string): CalendarRange {
  return { from, to, tz, startMs: zonedDayStart(from, tz), endMs: zonedDayStart(addDays(to, 1), tz) };
}

/**
 * Mongo filter for every record that COULD touch the range. Deliberately
 * loose; buildCalendarEvents makes the exact cut. Naive wall clocks sit up
 * to ±14 h from the true moment, hence the padding.
 */
export function candidateFilter(userId: string, r: CalendarRange) {
  const pad = 15 * HOUR;
  const fromYear = Number(r.from.slice(0, 4));
  const toYear   = Number(r.to.slice(0, 4));
  return {
    userId,
    $or: [
      { 'start.datetime': {
          $lt:  new Date(r.endMs + pad),
          $gte: new Date(r.startMs - pad - MAX_TIMED_SPAN_DAYS * DAY),
      } },
      { allDay: true, 'start.year': { $gte: fromYear - 1, $lte: toYear } },
      // Long timed records, however long ago they started.
      { 'duration.totalSeconds': { $gt: MAX_TIMED_SPAN_DAYS * 86_400 },
        'start.datetime': { $lt: new Date(r.endMs + pad) } },
    ],
  };
}

export const CANDIDATE_PROJECTION = {
  allDay: 1, activity: 1,
  'start.datetime': 1, 'start.year': 1, 'start.month': 1, 'start.day': 1,
  'start.hour': 1, 'start.timezone': 1, 'start.timezoneOffset': 1,
  'end.datetime': 1, 'end.year': 1, 'end.month': 1, 'end.day': 1,
  'end.hour': 1, 'end.timezone': 1, 'end.timezoneOffset': 1,
};

// ── Events ──────────────────────────────────────────────────────────────────

export type EventKind = 'timed' | 'point' | 'allDay';

export interface CalendarEvent {
  id: string;
  kind: EventKind;           // point = a timed record with no end
  category: string;
  name: string | null;
  title: string | null;
  crossActivity: string | null;
  start: string | null;      // ISO moment (timed / point)
  end:   string | null;      // ISO moment (timed only)
  startDate: string;         // display date the record starts on (all-day: logged date)
  endDate:   string;         // display date it ends on, inclusive
  logged: { start: string; end: string | null };   // as entered, e.g. "2021-07-05 07:30 KST"
  future: boolean;
}

export interface CalendarDiagnostics {
  candidates: number;
  noStart: number;          // not all-day, but no start time — cannot be placed
  noOffset: number;         // offset missing, 0 assumed
  endBeforeStart: number;   // drawn as a point
  skippedIds: string[];     // first few noStart ids
  endBeforeStartIds: string[];   // first few endBeforeStart ids
  startsInRange: Record<string, number>;   // "category/name" → records STARTING in range
}

export interface EventFilters {
  excludeCategories?: string[];
  crossActivities?: string[];   // include list; empty = all, with or without one
  excludeCrossActivities?: string[];   // the page's own rule: hide these, keep records without one
  excludeNames?: string[];             // activity.name, exact
}

function loggedLabel(e: any): string | null {
  const date = ymd(e?.year, e?.month, e?.day);
  if (!date) return null;
  return [date, e?.hour, e?.timezone].filter(Boolean).join(' ');
}

export function buildCalendarEvents(
  docs: any[], r: CalendarRange, nowMs: number, filters: EventFilters = {},
): { events: CalendarEvent[]; diagnostics: CalendarDiagnostics } {
  const diag: CalendarDiagnostics = {
    candidates: docs.length, noStart: 0, noOffset: 0, endBeforeStart: 0,
    skippedIds: [], endBeforeStartIds: [], startsInRange: {},
  };
  const exclude = new Set(filters.excludeCategories ?? []);
  const cross   = new Set(filters.crossActivities ?? []);
  const xCross  = new Set(filters.excludeCrossActivities ?? []);
  const xNames  = new Set(filters.excludeNames ?? []);
  const today   = zonedDate(nowMs, r.tz);
  const events: CalendarEvent[] = [];

  for (const d of docs) {
    const a = d.activity ?? {};
    const category = a.category ?? '';
    if (exclude.has(category)) continue;
    if (cross.size && !cross.has(a.crossActivity ?? '')) continue;
    if (a.crossActivity && xCross.has(a.crossActivity)) continue;
    if (a.name && xNames.has(a.name)) continue;

    const base = {
      id: String(d._id), category,
      name: a.name ?? null, title: a.title ?? null, crossActivity: a.crossActivity || null,
      logged: { start: loggedLabel(d.start) ?? '', end: loggedLabel(d.end) },
    };

    let ev: CalendarEvent;
    if (d.allDay) {
      const s = ymd(d.start?.year, d.start?.month, d.start?.day);
      if (!s) { diag.noStart++; continue; }
      let e = ymd(d.end?.year, d.end?.month, d.end?.day) ?? s;
      if (e < s) e = s;
      if (e < r.from || s > r.to) continue;
      ev = { ...base, kind: 'allDay', start: null, end: null, startDate: s, endDate: e, future: s > today };
    } else {
      if (d.start?.datetime && d.start?.timezoneOffset == null) diag.noOffset++;
      if (d.end?.datetime && d.end?.timezoneOffset == null) diag.noOffset++;
      const s = toInstant(d.start?.datetime, d.start?.timezoneOffset);
      if (s === null) {
        diag.noStart++;
        if (diag.skippedIds.length < 5) diag.skippedIds.push(base.id);
        continue;
      }
      let e = toInstant(d.end?.datetime, d.end?.timezoneOffset);
      if (e !== null && e < s) {
        diag.endBeforeStart++;
        if (diag.endBeforeStartIds.length < 5) diag.endBeforeStartIds.push(base.id);
        e = null;
      }

      // Overlap test: a timed record ending exactly at the range start does not touch it.
      const touches = e === null
        ? s >= r.startMs && s < r.endMs
        : s < r.endMs && (e > r.startMs || (e === s && s >= r.startMs));
      if (!touches) continue;

      // An end at exactly local midnight belongs to the previous day.
      const endDate = e === null ? zonedDate(s, r.tz)
        : zonedDate(e > s ? e - 1 : e, r.tz);
      ev = {
        ...base, kind: e === null ? 'point' : 'timed',
        start: new Date(s).toISOString(), end: e === null ? null : new Date(e).toISOString(),
        startDate: zonedDate(s, r.tz), endDate, future: s > nowMs,
      };
    }

    events.push(ev);
    if (ev.startDate >= r.from && ev.startDate <= r.to) {
      const k = `${category}/${base.name ?? ''}`;
      diag.startsInRange[k] = (diag.startsInRange[k] ?? 0) + 1;
    }
  }

  events.sort((x, y) =>
    x.startDate.localeCompare(y.startDate)
    || (x.kind === 'allDay' ? 0 : 1) - (y.kind === 'allDay' ? 0 : 1)
    || (x.start ?? '').localeCompare(y.start ?? ''));

  diag.startsInRange = Object.fromEntries(
    Object.entries(diag.startsInRange).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'ko')));
  return { events, diagnostics: diag };
}

/** Records per display day; a record counts on EVERY day it touches. */
export function countByDay(events: CalendarEvent[], r: CalendarRange): Record<string, number> {
  const out: Record<string, number> = {};
  for (let dt = r.from; dt <= r.to; dt = addDays(dt, 1)) out[dt] = 0;
  for (const e of events) {
    const a = e.startDate < r.from ? r.from : e.startDate;
    const b = e.endDate   > r.to   ? r.to   : e.endDate;
    for (let dt = a; dt <= b; dt = addDays(dt, 1)) out[dt]++;
  }
  return out;
}
