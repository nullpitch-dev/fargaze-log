// #72 Export: a record as a row of the export spreadsheet. Pure: no database, no Google.
//
// The export file (Hyoje, 12 Nov) holds one tab per year ('2019' … '2026', '2027' …) in the
// year-tab layout of the Archive file: rows from 4, columns A–CI as the migration reads them,
// plus two the migration never reads:
//   CJ  record id     (so a later re-import can match rows to records)
//   CK  planned end   (the sheet has no column for it; '2026-11-16 12:00', zone added when it
//                      differs from the start zone)
// E, CG, CH (Google Calendar sync) stay empty: the sync from the sheet stops at cutover.
//
// The cells come from sheetCells() (#70), the same writing the edit feature uses, so a row read
// back by the migration (rowToDocument) gives the same record. Calculated here: the weekday
// (L, S) and the duration (V–Z: days, hours, minutes, seconds, and a '1h 30m' text).
//
// A record goes to the tab of its LOCAL start year (start.year).

import { sheetCells, colLetter } from '../records/sheetCells';
import { weekdayOf } from '../migration/transform';

/** Columns A–CK. */
export const EXPORT_WIDTH = 89;
export const COL_ID = 87;          // CJ
export const COL_PLANNED_END = 88; // CK
export const FIRST_ROW = 4;
/** Bump when the row layout changes: every tab is then rewritten on the next run. */
export const ROW_FORMAT = 2;

// Columns written as numbers (when the whole cell is one plain number), so sums work in the
// sheet. Everything else, times included ('9:30'), is written as text exactly as stored.
const NUMERIC = new Set([
  8, 9, 10, 13, 15, 16, 17, 20,      // dates and offsets
  21, 22, 23, 24,                    // V–Y duration parts
  29, 30,                            // cost KRW / foreign
  64, 65, 66,                        // body (BP body fat % stays text: the Template copies the
                                     // 2026 tab's percent format, which would show 15.3 as 1530%)
  76, 77, 78, 79, 80,                // golf, income
]);
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export type Cell = string | number;

const pad = (n: unknown) => String(n ?? '').padStart(2, '0');

/** days, hours, minutes, seconds of a duration; null when there is none. */
export function durationParts(total: unknown): [number, number, number, number] | null {
  const t = Number(total);
  if (total == null || total === '' || !Number.isFinite(t) || t < 0) return null;
  const s = Math.round(t);
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}

/** '1h 30m', '2d 3h', '45m'; '' for zero (as Hyoje's sheet). */
export function durationText(total: unknown): string {
  const p = durationParts(total);
  if (!p) return '';
  const [d, h, m] = p;
  const out = [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
  return out || (p[3] ? `${p[3]}s` : '');
}

/** CK: '2026-11-16 12:00' (+ ' (zone)' when it differs from the start zone); '' when none. */
export function plannedEndText(doc: any): string {
  const p = doc?.plannedEnd;
  if (!p?.year || !p?.month || !p?.day) return '';
  const zone = p.timezone && p.timezone !== doc?.start?.timezone ? ` (${p.timezone})` : '';
  return `${p.year}-${pad(p.month)}-${pad(p.day)}${p.hour ? ` ${p.hour}` : ''}${zone}`;
}

/** The record as a row A–CK, ready for the Sheets API (valueInputOption RAW). */
export function recordRow(doc: any): Cell[] {
  const row: Cell[] = new Array(EXPORT_WIDTH).fill('');
  for (const c of sheetCells(doc)) row[c.i] = c.value;
  row[11] = weekdayOf(doc?.start?.year, doc?.start?.month, doc?.start?.day) ?? '';
  row[18] = weekdayOf(doc?.end?.year, doc?.end?.month, doc?.end?.day) ?? '';
  const parts = durationParts(doc?.duration?.totalSeconds);
  if (parts) parts.forEach((v, k) => (row[21 + k] = v));
  row[25] = durationText(doc?.duration?.totalSeconds);
  row[COL_ID] = doc?._id != null ? String(doc._id) : '';
  row[COL_PLANNED_END] = plannedEndText(doc);
  for (const i of NUMERIC) {
    const v = row[i];
    if (typeof v === 'string' && PLAIN_NUMBER.test(v.trim())) row[i] = Number(v.trim());
  }
  return row;
}

/** How a cell will read back (the migration reads cells as displayed). Numbers in an
 *  unformatted cell display as JavaScript prints them for the values we write. */
export const displayed = (row: Cell[]): string[] => row.map(v => (typeof v === 'number' ? String(v) : v));

// ── Order and tabs ───────────────────────────────────────────────────────────

const minutesOf = (hour: unknown) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hour ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1; // all day first
};
const dateNum = (p: any) => (Number(p?.year) || 0) * 10000 + (Number(p?.month) || 0) * 100 + (Number(p?.day) || 0);

/** Start date, then start time (all day first), then end, then id: the sheet's order. */
export function compareRecords(a: any, b: any): number {
  return dateNum(a.start) - dateNum(b.start)
    || minutesOf(a.start?.hour) - minutesOf(b.start?.hour)
    || dateNum(a.end) - dateNum(b.end)
    || minutesOf(a.end?.hour) - minutesOf(b.end?.hour)
    || String(a._id ?? '').localeCompare(String(b._id ?? ''));
}

export const yearOf = (doc: any): number | null => {
  const y = Number(doc?.start?.year);
  return Number.isInteger(y) && y > 1900 ? y : null;
};
export const isYearTab = (name: string) => /^\d{4}$/.test(name);

// ── Round trip ───────────────────────────────────────────────────────────────

const empty = (v: unknown) =>
  v == null || v === '' || (Array.isArray(v) && (v.length === 0 || (v.length === 1 && v[0] === 'Not Defined')));

function same(a: unknown, b: unknown): boolean {
  if (empty(a) && empty(b)) return true;
  if (a instanceof Date || b instanceof Date) {
    const t = (x: unknown) => (x instanceof Date ? x.getTime() : x == null ? NaN : new Date(x as any).getTime());
    return t(a) === t(b);
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a), nb = Number(b);
    return Number.isFinite(na) && Number.isFinite(nb) && Math.abs(na - nb) < 1e-9;
  }
  return String(a ?? '') === String(b ?? '');
}

/** Where a record read back from its row (rowToDocument) differs from the database record.
 *  Only what the row can carry is compared: the read-back's own fields. sync.* is skipped
 *  (E / CG / CH stay empty on purpose); weekdays are calculated from the date both ways. */
export function roundTripDiffs(db: any, back: any, path = ''): string[] {
  if (path === 'sync' || path === 'userId' || /\.weekday$/.test(path)) return [];
  if (Array.isArray(back) || Array.isArray(db)) {
    const a = Array.isArray(db) ? db : [], b = Array.isArray(back) ? back : [];
    if (b.every(x => typeof x !== 'object' || x == null) && a.every(x => typeof x !== 'object' || x == null)) {
      return empty(a) && empty(b) ? [] : a.map(String).join('|') === b.map(String).join('|') ? [] : [`${path}: ${a.join('|')} → ${b.join('|')}`];
    }
    if (a.length !== b.length) return [`${path}: ${a.length} item(s) → ${b.length}`];
    return b.flatMap((x, i) => roundTripDiffs(a[i], x, `${path}[${i}]`));
  }
  if (back && typeof back === 'object' && !(back instanceof Date)) {
    return Object.keys(back).flatMap(k => roundTripDiffs(db?.[k], back[k], path ? `${path}.${k}` : k));
  }
  return same(db, back) ? [] : [`${path}: ${fmt(db)} → ${fmt(back)}`];
}
const fmt = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 16) : empty(v) ? '(empty)' : String(v));

export { colLetter };
