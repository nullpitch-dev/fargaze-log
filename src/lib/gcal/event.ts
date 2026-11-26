// Google Calendar sync (Design §15.9): a record or plan → the Google event. Pure.
//
// Agreed with Hyoje (26 Nov 2026):
//   title        the record's title, else its activity name (as the app's Calendar)
//   location     the place; empty or "na" → Someone else's place, if there is one
//   description  People as "Name, Name (Method) · Name (Method)", then the notes
//   time         from the record's own wall-clock time and offset, so the moment is exact;
//                start and end each carry their own zone (a London → Seoul flight shows
//                right in both, as Google does flights). All-day → an all-day event
//                (Google's end date is the day after the last day).
// Time zones: a stored point holds the local wall clock + the offset of its zone code
// (GMT 0, BST +1 …). The event's dateTime is that wall clock written with that offset
// ("2026-07-01T09:30:00+01:00"), which fixes the moment; timeZone is the code's IANA zone
// (Europe/London), which only decides how Google shows it.
// No end yet (still going, no planned end), or an end not after the start: 30 minutes.

import { DEFAULT_CALENDAR } from './calendars';

export interface ZoneInfo { offset: number; iana: string }
export interface GTime { dateTime?: string | null; date?: string | null; timeZone?: string | null }
export interface GEvent { summary: string; location: string; description: string; start: GTime; end: GTime }

export const SHORT_MINUTES = 30;

const pad = (x: number) => String(x).padStart(2, '0');
const s = (v: unknown) => (v == null ? '' : String(v).trim());

/** "na", "n/a", "NA" — the sheet's way of saying no place. */
export const isNoPlace = (v: unknown) => !s(v) || /^n\/?a$/i.test(s(v));

/** +5.5 → "+05:30"; −3 → "-03:00"; 0 → "+00:00". */
export function offsetText(hours: number): string {
  const sign = hours < 0 ? '-' : '+';
  const total = Math.round(Math.abs(hours) * 60);
  return `${sign}${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

interface Wall { y: number; m: number; d: number; hh: number; mm: number }
/** A local wall clock as if it were UTC (ms), for arithmetic only. */
const wallMs = (w: Wall) => Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm);
const wallOf = (ms: number): Wall => {
  const t = new Date(ms);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
};
const dateText = (w: { y: number; m: number; d: number }) => `${w.y}-${pad(w.m)}-${pad(w.d)}`;

interface Point { wall: Wall; timed: boolean; offset: number | null; iana: string | null }

function pointOf(p: any, zones: Map<string, ZoneInfo>): Point | null {
  if (!p?.year || !p?.month || !p?.day) return null;
  const hm = /^(\d{1,2}):(\d{2})/.exec(s(p.hour));
  const z = zones.get(s(p.timezone));
  // The record's own offset first: offsets are kept for good (§15.2); the list's if none.
  const offset = typeof p.timezoneOffset === 'number' && Number.isFinite(p.timezoneOffset) ? p.timezoneOffset : z?.offset ?? null;
  return {
    wall: { y: p.year, m: p.month, d: p.day, hh: hm ? Number(hm[1]) : 0, mm: hm ? Number(hm[2]) : 0 },
    timed: !!hm, offset, iana: z?.iana ?? null,
  };
}

const instant = (p: Point) => wallMs(p.wall) - (p.offset ?? 0) * 3_600_000;

function timeOf(p: Point): GTime {
  const w = p.wall;
  return {
    dateTime: `${dateText(w)}T${pad(w.hh)}:${pad(w.mm)}:00${offsetText(p.offset ?? 0)}`,
    date: null,
    timeZone: p.iana,
  };
}

/** People: names with the same method together, in order — "윤희, 윤지 (대면) · 철수 (웹콜)". */
export function peopleText(people: any): string {
  const groups: { method: string; names: string[] }[] = [];
  for (const x of Array.isArray(people) ? people : []) {
    const name = s(x?.target);
    if (!name) continue;
    const method = s(x?.method);
    const g = groups.find(g => g.method === method);
    if (g) { if (!g.names.includes(name)) g.names.push(name); }
    else groups.push({ method, names: [name] });
  }
  return groups.map(g => `${g.names.join(', ')}${g.method ? ` (${g.method})` : ''}`).join(' · ');
}

export type EventResult = { ok: true; event: GEvent } | { ok: false; why: string };

/** The event for a record or plan. A plan's end is its planned end (an older plan: its end). */
export function eventOf(doc: any, zones: Map<string, ZoneInfo>): EventResult {
  const start = pointOf(doc?.start, zones);
  if (!start) return { ok: false, why: 'no start date' };
  const endRaw = doc?.end?.year ? doc.end : doc?.plannedEnd?.year ? doc.plannedEnd : null;
  const end = pointOf(endRaw, zones);

  let st: GTime, en: GTime;
  if (!start.timed) {
    // All day: from the start date to the last day (end, else planned end, else the start).
    const first = dateText(start.wall);
    const lastWall = end && dateText(end.wall) >= first ? end.wall : start.wall;
    const after = wallOf(Date.UTC(lastWall.y, lastWall.m - 1, lastWall.d + 1));
    st = { date: first, dateTime: null, timeZone: null };
    en = { date: dateText(after), dateTime: null, timeZone: null };
  } else {
    if (start.offset == null) return { ok: false, why: `no offset for the zone '${s(doc?.start?.timezone)}'` };
    st = timeOf(start);
    const usable = end && end.timed && end.offset != null && instant(end) > instant(start);
    if (usable) en = timeOf(end!);
    else {
      // Still going with no planned end, a moment (end = start), or a broken old end.
      const w = wallOf(wallMs(start.wall) + SHORT_MINUTES * 60_000);
      en = timeOf({ ...start, wall: w });
    }
  }

  const place = !isNoPlace(doc?.location?.activity) ? s(doc.location.activity)
    : !isNoPlace(doc?.location?.other) ? s(doc.location.other) : '';
  const who = peopleText(doc?.people);
  const notes = s(doc?.notes);
  const description = [who && `People: ${who}`, notes].filter(Boolean).join('\n\n');
  const summary = s(doc?.activity?.title) || s(doc?.activity?.name) || '(no title)';
  return { ok: true, event: { summary, location: place, description, start: st, end: en } };
}

/** Whether a record or plan is meant to be in Google Calendar, and in which calendar. */
export function calendarOf(doc: any): string | null {
  if (s(doc?.sync?.export).toUpperCase() !== 'Y') return null;
  return s(doc?.sync?.calendar) || DEFAULT_CALENDAR;
}
