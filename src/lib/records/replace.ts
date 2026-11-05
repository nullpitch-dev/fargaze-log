// Bulk Find & replace in records (#70 step 2, Design §15.6.3).
//
// Agreed with Hyoje on 27 Oct:
//   - text fields without a master list only (a list's values are renamed on its admin
//     page): title, additional info, online and other location (whole value or part of
//     the text); purchase item and unit, food and drink item names (ingredients stay),
//     food / drink / alcohol notes (whole value: one item's own value). People names
//     too: his first example was 길동이 → 홍길동, and names have no master list
//   - optional filters: a date range, an activity
//   - 'James' → 'James Potter': a place that already says the new text is skipped, and
//     the preview counts the skips. The sheet's Find & Replace can't skip, so its steps
//     are two passes with the counts to expect
//   - list cells are replaced with a regular expression that matches one whole item
//   - one change-list entry (list 'records', kind 'replace') with Undo
// With a filter, the sheet can't Find & Replace only those rows, so the steps are one
// line per record instead.

import mongoose from 'mongoose';
import Log from '../../models/Log';
import MasterChange from '../../models/MasterChange';
import { yearTabFor } from '../migration/staging';
import { getArchiveUntil } from '../archiveYear';
import { findRowText, colLetter, type ChangeLine } from './sheetCells';
import { RECORDS_LIST, SHEET_IS_TRUTH } from './edit';

// ── Fields ───────────────────────────────────────────────────────────────────

export type Mode = 'whole' | 'part';

export interface ReplaceField {
  key: string;
  label: string;
  col: number;                    // sheet column (0-based)
  /** A record field ('activity.title') or a list and the key of its entries. */
  path?: string;
  list?: string;
  itemKey?: string;
  modes: Mode[];
  /** What the sheet splits this cell on, so the new value can't hold it until cutover. */
  splits: RegExp | null;
  /** How one whole item sits in its cell: the characters before and after it. */
  before?: string;
  after?: string;
  /** Empty new text is refused (a name or unit can't be blank). */
  required?: boolean;
}

export const REPLACE_FIELDS: ReplaceField[] = [
  { key: 'title', label: 'Title', col: 2, path: 'activity.title', modes: ['whole', 'part'], splits: null },
  { key: 'additionalInfo', label: 'Additional info', col: 3, path: 'activity.additionalInfo', modes: ['whole', 'part'], splits: null },
  { key: 'online', label: 'Online location', col: 27, path: 'location.online', modes: ['whole', 'part'], splits: null },
  { key: 'other', label: 'Other location', col: 28, path: 'location.other', modes: ['whole', 'part'], splits: null },
  { key: 'purchaseItem', label: 'Purchase item', col: 34, list: 'purchase', itemKey: 'item', modes: ['whole'], splits: /,/, before: ',', after: ',', required: true },
  { key: 'purchaseUnit', label: 'Purchase unit', col: 36, list: 'purchase', itemKey: 'unit', modes: ['whole'], splits: /,/, before: ',', after: ',', required: true },
  { key: 'drinkItem', label: 'Drink item', col: 41, list: 'food.drinks', itemKey: 'item', modes: ['whole'], splits: /[,+|()]/, before: ',+', after: ',+(', required: true },
  { key: 'drinkNote', label: 'Drink note', col: 44, list: 'food.drinks', itemKey: 'note', modes: ['whole'], splits: /,/, before: ',', after: ',' },
  { key: 'foodItem', label: 'Food item', col: 45, list: 'food.foods', itemKey: 'item', modes: ['whole'], splits: /[,+|()]/, before: ',+', after: ',+(', required: true },
  { key: 'foodNote', label: 'Food note', col: 48, list: 'food.foods', itemKey: 'note', modes: ['whole'], splits: /,/, before: ',', after: ',' },
  { key: 'alcoholNote', label: 'Alcohol note', col: 52, list: 'food.alcohols', itemKey: 'note', modes: ['whole'], splits: /,/, before: ',', after: ',' },
  { key: 'person', label: 'People', col: 55, list: 'people', itemKey: 'target', modes: ['whole'], splits: /[,|]/, before: ',|', after: ',|', required: true },
];

export const fieldByKey = (k: string) => REPLACE_FIELDS.find(f => f.key === k);
const colName = (f: ReplaceField) => `${colLetter(f.col)} ${f.label}`;
const get = (o: any, p: string) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

// ── Text ─────────────────────────────────────────────────────────────────────

/**
 * Replaces every `from` in `text` with `to`, except where the text around it already
 * reads `to` (so 'James' → 'James Potter' leaves 'James Potter' alone).
 */
export function replaceInText(text: string, from: string, to: string): { result: string; count: number; skipped: number } {
  if (!from) return { result: text, count: 0, skipped: 0 };
  const lead = to.indexOf(from);                 // where `from` sits inside `to`, or -1
  let out = '', i = 0, count = 0, skipped = 0;
  for (;;) {
    const at = text.indexOf(from, i);
    if (at < 0) break;
    if (lead >= 0 && at - lead >= i && text.slice(at - lead, at - lead + to.length) === to) {
      skipped++;
      out += text.slice(i, at - lead + to.length);
      i = at - lead + to.length;
      continue;
    }
    out += text.slice(i, at) + to;
    i = at + from.length;
    count++;
  }
  return { result: out + text.slice(i), count, skipped };
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const classOf = (chars: string) => `[${chars.split('').map(c => (c === '|' ? '\\|' : reEscape(c))).join('')}]`;

/** A Google Sheets regular expression (RE2) that matches one whole item between the cell's separators. */
export function itemRegex(f: ReplaceField, from: string): { find: string; replace: (to: string) => string } {
  const b = classOf(f.before ?? ','), a = classOf(f.after ?? ',');
  return {
    find: `(^|${b}\\s*)${reEscape(from)}(\\s*${a}|$)`,
    replace: to => `$1${to.replace(/\$/g, '$$$$')}$2`,
  };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface ReplaceRequest {
  field: string;
  mode: Mode;
  from: string;
  to: string;
  dateFrom?: string | null;       // 'YYYY-MM-DD', the record's start date
  dateTo?: string | null;
  activity?: string | null;
}

interface Hit {
  id: mongoose.Types.ObjectId;
  updatedAt: Date;
  tab: string;
  findRow: string;
  path: string;                   // what $set writes: the field, or the whole list
  before: unknown;
  after: unknown;
  cellBefore: string;
  cellAfter: string;
  count: number;                  // replacements in this record
  skipped: number;
}

type Fail = { ok: false; status: number; error: string; problems?: string[] };
const fail = (status: number, error: string, problems?: string[]): Fail => ({ ok: false, status, error, ...(problems ? { problems } : {}) });
const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const dateOk = (d: unknown) => d == null || d === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(d));
const pad = (x: unknown) => String(x ?? '').padStart(2, '0');

function check(req: ReplaceRequest): { f: ReplaceField; from: string; to: string; problems: string[] } | Fail {
  const f = fieldByKey(String(req?.field ?? ''));
  if (!f) return fail(400, `Unknown field. Choose one of: ${REPLACE_FIELDS.map(x => x.key).join(', ')}.`);
  const mode = req.mode === 'part' ? 'part' : 'whole';
  if (!f.modes.includes(mode)) return fail(400, `${f.label} can only be replaced as a whole value.`);
  if (!dateOk(req.dateFrom) || !dateOk(req.dateTo)) return fail(400, 'Dates must look like 2026-10-27.');
  // Whole values are compared trimmed, as stored; part of a text keeps its spaces.
  const from = mode === 'whole' ? t(req.from) : String(req.from ?? '');
  const to = mode === 'whole' ? t(req.to) : String(req.to ?? '');
  const problems: string[] = [];
  if (!from.trim()) problems.push('Type the text to find.');
  if (from === to) problems.push('The new text is the same as the old.');
  if (f.required && !to) problems.push(`${f.label} can't be empty.`);
  if (SHEET_IS_TRUTH && f.splits && f.splits.test(to)) {
    const chars = [',', '+', '|', '(', ')'].filter(c => f.splits!.test(c)).join(' ');
    problems.push(`${f.label}: the sheet splits this cell on ${chars} — not allowed in the new text until cutover.`);
  }
  return { f, from, to, problems };
}

/** One record's cell, written the sheet's way (for the preview and per-record lines). */
function cellText(f: ReplaceField, doc: any): string {
  if (f.path) return String(get(doc, f.path) ?? '');
  const items = get(doc, f.list!) as any[] | undefined;
  return (Array.isArray(items) ? items : []).map(x => String(x?.[f.itemKey!] ?? '')).join(', ');
}

async function findHits(userId: string, f: ReplaceField, mode: Mode, from: string, to: string, req: ReplaceRequest): Promise<Hit[]> {
  const q: Record<string, unknown> = { userId };
  if (f.path) q[f.path] = mode === 'whole' ? from : { $regex: reEscape(from) };
  else q[`${f.list}.${f.itemKey}`] = from;
  if (t(req.activity)) q['activity.name'] = t(req.activity);
  const docs = await Log.find(q).lean() as any[];
  const archiveUntil = await getArchiveUntil(userId);
  const inRange = (d: any) => {
    const day = d?.start?.year ? `${d.start.year}-${pad(d.start.month)}-${pad(d.start.day)}` : '';
    return (!req.dateFrom || day >= req.dateFrom) && (!req.dateTo || day <= req.dateTo);
  };

  const hits: Hit[] = [];
  for (const d of docs) {
    if (!inRange(d)) continue;
    const base = { id: d._id, updatedAt: d.updatedAt, tab: yearTabFor(d, archiveUntil) ?? '(no tab)', findRow: findRowText(d), cellBefore: cellText(f, d) };
    if (f.path) {
      const now = String(get(d, f.path) ?? '');
      if (mode === 'whole') {
        if (now.trim() !== from) continue;
        hits.push({ ...base, path: f.path, before: get(d, f.path), after: to || null, cellAfter: to, count: 1, skipped: 0 });
      } else {
        const r = replaceInText(now, from, to);
        if (!r.count && !r.skipped) continue;
        if (!r.count) { hits.push({ ...base, path: f.path, before: now, after: now, cellAfter: now, count: 0, skipped: r.skipped }); continue; }
        hits.push({ ...base, path: f.path, before: now, after: r.result.trim() === '' ? null : r.result, cellAfter: r.result, count: r.count, skipped: r.skipped });
      }
    } else {
      const list = (get(d, f.list!) as any[]) ?? [];
      let count = 0;
      const next = list.map(x => {
        if (String(x?.[f.itemKey!] ?? '').trim() !== from) return x;
        count++;
        return { ...x, [f.itemKey!]: to };
      });
      if (!count) continue;
      hits.push({ ...base, path: f.list!, before: list, after: next, cellAfter: cellText(f, { ...d, ...setPath(f.list!, next) }), count, skipped: 0 });
    }
  }
  return hits;
}

/** { food: { foods: v } } for 'food.foods' — enough for cellText. */
function setPath(path: string, v: unknown): any {
  const [k, ...rest] = path.split('.');
  return { [k]: rest.length ? setPath(rest.join('.'), v) : v };
}

// ── Sheet steps ──────────────────────────────────────────────────────────────

const n = (x: number) => x.toLocaleString('en-GB');
const expect = (x: number) => (x === 0 ? 'expect none' : `expect ${n(x)}`);

function byTab(hits: Hit[], pick: (h: Hit) => number): { tab: string; n: number }[] {
  const m = new Map<string, number>();
  for (const h of hits) m.set(h.tab, (m.get(h.tab) ?? 0) + pick(h));
  return [...m.entries()].map(([tab, x]) => ({ tab, n: x })).sort((a, b) => (a.tab.startsWith('~') ? 1 : 0) - (b.tab.startsWith('~') ? 1 : 0) || b.tab.localeCompare(a.tab));
}

/** Find & Replace steps, for an unfiltered replace. */
export function findReplaceSteps(f: ReplaceField, mode: Mode, from: string, to: string, hits: Hit[]): string[] {
  const col = colLetter(f.col);
  const range = (tab: string, row: number) => `'${tab}'!${col}${row}:${col}`;
  const ranges = (pick: (h: Hit) => number) => byTab(hits, pick).map(x => `${range(x.tab, 4)} (${expect(x.n)})`).join(', ');
  const active = `   Active file: ${['Active', 'History', 'Future'].map(tb => range(tb, 3)).join(', ')} (any number, including none).`;
  const how = 'Choose “Specific range” and do each range in turn; leave “Also search within formulas” off. Sheets says how many it replaced; the newest year tab can show more if rows were added since the last migration.';

  if (f.list) {
    const re = itemRegex(f, from);
    return [
      `Find and replace in column ${col} (${f.label}), with “Search using regular expressions” ticked and “Match case” ticked. Find: ${re.find}   Replace with: ${re.replace(to)}   — this matches ${from} only as a whole item, between ${f.before!.split('').join(' ')} and ${f.after!.split('').join(' ')}. ${how}`,
      `   Archive file: ${ranges(h => h.count)}.`,
      active,
      'If a cell holds the same item twice in a row, Sheets replaces only the first: run the same step again until it replaces none.',
    ];
  }
  if (mode === 'whole') {
    return [
      `Find and replace ${from} → ${to || '(empty)'} in column ${col} (${f.label}), with “Match case” and “Match entire cell contents” ticked. ${how}`,
      `   Archive file: ${ranges(h => h.count)}.`,
      active,
    ];
  }
  const skips = hits.reduce((a, h) => a + h.skipped, 0);
  const lead = to.indexOf(from);
  const steps = [
    `Find and replace ${from} → ${to || '(empty)'} in column ${col} (${f.label}), with “Match case” ticked and “Match entire cell contents” NOT ticked. ${how}`,
    `   Archive file: ${ranges(h => h.count + h.skipped)}.`,
    active,
  ];
  if (lead >= 0 && skips) {
    // Sheets also replaced inside text that already said `to`; put those back.
    const doubled = to.slice(0, lead) + to + to.slice(lead + from.length);
    steps.push(
      `Then a second pass, because Sheets also changed text that already said ${to}: find and replace ${doubled} → ${to} in the same ranges, same ticks.`,
      `   Archive file: ${ranges(h => h.skipped)}.`,
      `   Active file: the same ranges as above (any number, including none).`,
    );
  }
  return steps;
}

/** One line per record, for a filtered replace (Sheets can't Find & Replace by date or activity). */
export function perRecordLines(f: ReplaceField, hits: Hit[]): (ChangeLine & { tab: string; findRow: string })[] {
  return hits.filter(h => h.count).map(h => ({
    tab: h.tab, findRow: h.findRow, column: colName(f),
    what: h.count === 1 ? 'Changed' : `Changed (${h.count} places)`,
    before: h.cellBefore, after: h.cellAfter,
  }));
}

// ── Preview and apply ────────────────────────────────────────────────────────

async function plan(userId: string, req: ReplaceRequest) {
  const c = check(req);
  if ('ok' in c) return c;
  const { f, from, to, problems } = c;
  const mode: Mode = req.mode === 'part' ? 'part' : 'whole';
  const hits = problems.length ? [] : await findHits(userId, f, mode, from, to, req);
  const changing = hits.filter(h => h.count);
  const filtered = !!(req.dateFrom || req.dateTo || t(req.activity));
  if (!problems.length && !changing.length) problems.push(hits.length ? 'Every match already says the new text: nothing to change.' : 'No record matches.');
  const steps = filtered ? [] : findReplaceSteps(f, mode, from, to, hits);
  const lines = filtered ? perRecordLines(f, hits) : [];
  const title = `Replace ${from} → ${to || '(empty)'} in ${f.label}${mode === 'part' ? ' (part of the text)' : ''}${filtered ? ` · ${[req.dateFrom || req.dateTo ? `${req.dateFrom || '…'} – ${req.dateTo || '…'}` : '', t(req.activity)].filter(Boolean).join(' · ')}` : ''}`;
  return { ok: true as const, f, mode, from, to, hits, changing, problems, filtered, steps, lines, title };
}

export async function previewReplace(userId: string, req: ReplaceRequest) {
  const p = await plan(userId, req);
  if (!p.ok) return p;
  return {
    ok: true as const,
    title: p.title, problems: p.problems,
    records: p.changing.length,
    places: p.changing.reduce((a, h) => a + h.count, 0),
    skipped: p.hits.reduce((a, h) => a + h.skipped, 0),
    byTab: byTab(p.changing, () => 1),
    rows: p.hits.slice(0, 500).map(h => ({ id: String(h.id), tab: h.tab, findRow: h.findRow, before: h.cellBefore, after: h.cellAfter, count: h.count, skipped: h.skipped })),
    more: Math.max(0, p.hits.length - 500),
    steps: p.steps, lines: p.lines,
  };
}

/** `expectPlaces` is the preview's count: if records changed since, the apply stops. */
export async function applyReplace(userId: string, req: ReplaceRequest & { expectPlaces?: number }) {
  const p = await plan(userId, req);
  if (!p.ok) return p;
  if (p.problems.length) return fail(422, 'Nothing was changed.', p.problems);
  const places = p.changing.reduce((a, h) => a + h.count, 0);
  if (typeof req.expectPlaces === 'number' && req.expectPlaces !== places) {
    return fail(409, `The records changed since the preview (${n(req.expectPlaces)} → ${n(places)} places). Preview again.`);
  }

  const now = new Date();
  const session = await mongoose.startSession();
  let changeId = '';
  try {
    await session.withTransaction(async () => {
      const res = await Log.bulkWrite(p.changing.map(h => ({
        updateOne: { filter: { _id: h.id, userId, updatedAt: h.updatedAt }, update: { $set: { [h.path]: h.after, updatedAt: now } }, timestamps: false },
      })) as any, { session, ordered: true } as any);
      if ((res as any).matchedCount !== p.changing.length) throw Object.assign(new Error('changed'), { conflict: true });
      const [ch] = await MasterChange.create([{
        userId, list: RECORDS_LIST, kind: 'replace', rowId: null,
        before: { field: p.f.key, mode: p.mode, from: p.from, to: p.to, dateFrom: req.dateFrom ?? null, dateTo: req.dateTo ?? null, activity: t(req.activity) || null },
        after: null,
        recordsChanged: p.changing.length, recordIds: p.changing.map(h => h.id),
        sheetSteps: p.filtered ? p.lines.map(l => `${l.tab} · ${l.findRow} · ${l.column}: ${l.before} → ${l.after}`) : p.steps,
        extra: {
          title: p.title, steps: p.steps, lines: p.lines, places,
          // What Undo needs: each record's field before and after, and when it was saved.
          items: p.changing.map(h => ({ id: h.id, path: h.path, before: h.before, after: h.after, tab: h.tab, findRow: h.findRow, cellBefore: h.cellBefore, cellAfter: h.cellAfter })),
          afterUpdatedAt: now, field: p.f.key,
        },
      }], { session });
      changeId = String(ch._id);
    });
  } catch (e: any) {
    if (e?.conflict) return fail(409, 'Some records changed while replacing; nothing was changed. Preview again.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true as const, changeId, records: p.changing.length, places };
}

/**
 * Undo of a replace: every record must still be as the replace left it. The sheet
 * steps for an undo after the tick are one line per record — a reverse Find & Replace
 * would also change text that said the new value before the replace.
 */
export async function undoReplace(userId: string, ch: any) {
  const items = (ch.extra?.items ?? []) as any[];
  const f = fieldByKey(ch.extra?.field);
  if (!items.length || !f) return fail(409, 'This replace has nothing to undo.');
  const ids = items.map(i => i.id);
  const still = await Log.countDocuments({ _id: { $in: ids }, userId, updatedAt: ch.extra.afterUpdatedAt });
  if (still !== items.length) {
    return fail(409, `Undo is no longer possible: ${n(items.length - still)} of the ${n(items.length)} records have been changed or rebuilt by a migration since. Replace back instead.`);
  }
  const sheetNeeded = !!ch.sheetDone;
  const now = new Date();
  const lines = items.map(i => ({ tab: i.tab, findRow: i.findRow, column: colName(f), what: 'Changed back', before: i.cellAfter, after: i.cellBefore }));
  const session = await mongoose.startSession();
  let newId = '';
  try {
    await session.withTransaction(async () => {
      const res = await Log.bulkWrite(items.map(i => ({
        updateOne: { filter: { _id: i.id, userId, updatedAt: ch.extra.afterUpdatedAt }, update: { $set: { [i.path]: i.before, updatedAt: now } }, timestamps: false },
      })) as any, { session, ordered: true } as any);
      if ((res as any).matchedCount !== items.length) throw Object.assign(new Error('changed'), { conflict: true });
      await MasterChange.updateOne({ _id: ch._id }, { $set: { undoneAt: now, ...(sheetNeeded ? {} : { sheetDone: true, sheetDoneAt: now }) } }, { session });
      const [u] = await MasterChange.create([{
        userId, list: RECORDS_LIST, kind: 'replace', rowId: null,
        before: ch.before, after: null, recordsChanged: items.length, recordIds: ids,
        sheetSteps: sheetNeeded ? lines.map(l => `${l.tab} · ${l.findRow} · ${l.column}: ${l.before} → ${l.after}`) : ['Nothing to do in the sheet: this was undone before it was repeated there.'],
        sheetDone: !sheetNeeded, sheetDoneAt: sheetNeeded ? null : now, undoOf: ch._id,
        extra: { title: `Undo: ${ch.extra?.title ?? ''}`, steps: [], lines: sheetNeeded ? lines : [], field: f.key, afterUpdatedAt: now },
      }], { session });
      newId = String(u._id);
    });
  } catch (e: any) {
    if (e?.conflict) return fail(409, 'Undo is no longer possible: a record changed while undoing; nothing was changed.');
    throw e;
  } finally {
    await session.endSession();
  }
  return { ok: true as const, changeId: newId, recordsChanged: items.length, sheetNeeded };
}
