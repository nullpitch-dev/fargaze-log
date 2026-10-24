// Add, edit and delete for the generic admin editor (#67 step 2).
//
// Every write: values are checked on the server, the user comes from the session
// (passed in by the route), and the change is logged in master_change as
// "to repeat" in the sheet, with the sheet step spelled out.
//
// Rules (Hyoje, 24 Oct 2026):
//   - On a row that records use, the columns records point to are locked
//     (renaming / merging comes in step 3); every other column is free.
//   - Only a row no record uses can be deleted. Lists without a record count
//     (favourite places, place points) can be deleted after a warning in the page.
//   - A new value in a "pick existing" column (category, group, label …) needs
//     confirmNew, so a typo doesn't create a category by accident.

import type { Types } from 'mongoose';
import Log from '@/models/Log';
import MasterChange from '@/models/MasterChange';
import TimezoneMaster from '@/models/TimezoneMaster';
import { type ListDef, type CellValue, toRow, lockedColumns } from './lists';

export type WriteResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; needsConfirm?: { column: string; label: string; value: string } };

type Values = Record<string, CellValue>;

const fail = (status: number, error: string): WriteResult => ({ ok: false, status, error });
const records = (n: number) => `${n.toLocaleString()} record${n === 1 ? '' : 's'} use${n === 1 ? 's' : ''}`;

// ── Parsing what the page sends ──────────────────────────────────────────────

const LOCAL_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

export function parseCoordsText(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

interface Parsed { values: Values; fields: Record<string, unknown>; errors: string[] }

/** Turns the page's input into the row's values (for logging) and the document's fields. */
export async function parseInput(def: ListDef, userId: string, raw: Record<string, unknown>): Promise<Parsed> {
  const values: Values = {};
  const fields: Record<string, unknown> = {};
  const errors: string[] = [];
  let offsets: Map<string, number> | null = null;

  for (const c of def.columns) {
    const v = raw[c.key];
    if (c.type === 'text') {
      const t = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
      if (!t && c.required) errors.push(`${c.label} is required.`);
      values[c.key] = t || null;
      fields[c.key] = t;
    } else if (c.type === 'number') {
      const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.replace(/,/g, '').trim() : '';
      const n = t === '' ? NaN : Number(t);
      if (t === '' && !c.required) { values[c.key] = null; fields[c.key] = null; continue; }
      if (!Number.isFinite(n)) { errors.push(`${c.label} must be a number.`); continue; }
      values[c.key] = n;
      fields[c.key] = n;
    } else if (c.type === 'coords') {
      const p = typeof v === 'string' ? parseCoordsText(v) : null;
      if (!p) { errors.push(`${c.label}: write it as "latitude, longitude", e.g. 51.37, -0.45.`); continue; }
      values[c.key] = p;
      fields.lat = p.lat;
      fields.lng = p.lng;
    } else if (c.type === 'zoneTime') {
      const o = (v && typeof v === 'object' ? v : {}) as { timezone?: string; local?: string };
      const tz = (o.timezone ?? '').trim();
      const local = (o.local ?? '').trim();
      if (!tz && !local) {
        if (c.required) errors.push(`${c.label} is required.`);
        values[c.key] = null; fields[c.key] = null; continue;
      }
      if (!tz || !local) { errors.push(`${c.label}: fill both the time zone and the time, or neither.`); continue; }
      if (!offsets) {
        const zones = await TimezoneMaster.find({ userId }).select('code offsetUTC').lean() as any[];
        offsets = new Map(zones.map(z => [z.code, z.offsetUTC]));
      }
      const off = offsets.get(tz);
      if (off === undefined) { errors.push(`${c.label}: time zone "${tz}" is not in the time zone list.`); continue; }
      const m = local.match(LOCAL_RE);
      const [y, mo, d, h, mi] = m ? m.slice(1).map(Number) : [];
      const naive = m ? Date.UTC(y, mo - 1, d, h, mi) : NaN;
      const chk = new Date(naive);
      if (!m || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d || h > 23 || mi > 59) {
        errors.push(`${c.label}: write the time as YYYY-MM-DD HH:mm.`); continue;
      }
      const norm = `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}`;
      values[c.key] = { timezone: tz, local: norm };
      fields[c.key] = { timezone: tz, local: norm, at: new Date(naive - off * 3600_000) };
    }
  }
  return { values, fields, errors };
}

// ── How many records use a row ───────────────────────────────────────────────

export async function rowUsage(def: ListDef, userId: string, values: Record<string, unknown>): Promise<number | null> {
  if (!def.usage?.length) return null;
  const or: Record<string, unknown>[] = [];
  for (const spec of def.usage) {
    if (spec.when && !Object.entries(spec.when).every(([k, v]) => values[k] === v)) continue;
    const cols = Object.keys(spec.key);
    if (cols.some(c => values[c] == null || values[c] === '')) continue;
    if (spec.unwind?.length && cols.length > 1) {
      const base = spec.unwind[0];
      or.push({ [base]: { $elemMatch: Object.fromEntries(cols.map(c => [spec.key[c].slice(base.length + 1), values[c]])) } });
    } else {
      or.push(Object.fromEntries(cols.map(c => [spec.key[c], values[c]])));
    }
  }
  if (!or.length) return 0;
  return Log.countDocuments({ userId, $or: or });
}

// ── Sheet steps ──────────────────────────────────────────────────────────────

function cellsText(def: ListDef, v: Values | Record<string, unknown>): string {
  return def.sheet.order.map(k => {
    const x = v[k] as CellValue;
    if (x == null || x === '') return '(empty)';
    if (typeof x === 'object' && 'local' in x) { const [d, t] = x.local.split(' '); return `${x.timezone} | ${d} | ${t}`; }
    if (typeof x === 'object' && 'lat' in x) return `${x.lat}, ${x.lng}`;
    return String(x);
  }).join(' | ');
}

export function sheetSteps(def: ListDef, kind: 'add' | 'edit' | 'delete', before: Values | null, after: Values | null): string[] {
  const any = (after ?? before)!;
  const where = typeof def.sheet.where === 'function' ? def.sheet.where(any) : def.sheet.where;
  const steps: string[] = [];
  if (def.sheet.column) {
    if (kind === 'add') steps.push(`${where}: add ${after!.value}.`);
    if (kind === 'edit') steps.push(`${where}: change ${before!.value} to ${after!.value}.`);
    if (kind === 'delete') steps.push(`${where}: remove ${before!.value} and move the values below it up.`);
    if (kind === 'add' && def.sheet.dropdown) steps.push(`Check the dropdown in ${def.sheet.dropdown} still covers the whole column.`);
  } else {
    if (kind === 'add') steps.push(`${where}: add a row ${cellsText(def, after!)}.`);
    if (kind === 'edit') steps.push(`${where}: change the row ${cellsText(def, before!)} to ${cellsText(def, after!)}.`);
    if (kind === 'delete') steps.push(`${where}: delete the row ${cellsText(def, before!)}.`);
  }
  return steps;
}

// ── Checks shared by add and edit ────────────────────────────────────────────

async function checkRow(def: ListDef, userId: string, p: Parsed, selfId: Types.ObjectId | string | null, confirmNew: boolean): Promise<WriteResult | null> {
  const model = def.model();
  const scope = { userId, ...(def.filter ?? {}) };
  const notSelf = selfId ? { _id: { $ne: selfId } } : {};

  // New value in a "pick existing" column
  if (!confirmNew) {
    for (const c of def.columns.filter(c => c.pickExisting)) {
      const val = p.fields[c.key];
      if (!val) continue;
      const exists = await model.exists({ ...scope, [c.key]: val });
      if (!exists) return { ok: false, status: 409, error: `"${val}" is a new ${c.label.toLowerCase()}.`, needsConfirm: { column: c.key, label: c.label, value: String(val) } };
    }
  }

  // Duplicates (favourite places are checked by period instead)
  if (def.slug !== 'favorite-place') {
    const dup = await model.findOne({ ...scope, ...notSelf, ...Object.fromEntries(def.unique.map(k => [k, p.fields[k]])) }).lean() as any;
    if (dup) {
      const what = def.unique.map(k => p.fields[k]).join(' / ');
      const extra = def.slug === 'activity' && dup.category !== p.fields.category ? ` (in ${dup.category})` : '';
      return fail(409, `${what} is already in this list${extra}.`);
    }
  }

  // Favourite places: from before to, no overlap with the same label
  if (def.slug === 'favorite-place') {
    const from = p.fields.from as { at: Date } | null;
    const to = p.fields.to as { at: Date } | null;
    if (from && to && from.at >= to.at) return fail(400, 'From must be before To.');
    const others = await model.find({ ...scope, ...notSelf, label: p.fields.label }).lean() as any[];
    const s1 = from?.at.getTime() ?? -Infinity, e1 = to?.at.getTime() ?? Infinity;
    for (const o of others) {
      const s2 = o.from?.at ? new Date(o.from.at).getTime() : -Infinity;
      const e2 = o.to?.at ? new Date(o.to.at).getTime() : Infinity;
      if (s1 <= e2 && s2 <= e1) return fail(409, `This period overlaps "${o.name}" for ${p.fields.label}.`);
    }
  }
  return null;
}

// ── Add / edit / delete ──────────────────────────────────────────────────────

export async function addRow(def: ListDef, userId: string, raw: Record<string, unknown>, confirmNew: boolean): Promise<WriteResult> {
  const p = await parseInput(def, userId, raw);
  if (p.errors.length) return fail(400, p.errors.join(' '));
  const bad = await checkRow(def, userId, p, null, confirmNew);
  if (bad) return bad;

  const model = def.model();
  const doc: Record<string, unknown> = { userId, ...(def.filter ?? {}), ...p.fields };
  if (def.filter?.listName) {
    const last = await model.findOne({ userId, ...def.filter }).sort({ order: -1 }).lean() as any;
    doc.order = (last?.order ?? 0) + 1;
  }
  const created = await model.create(doc);
  await MasterChange.create({
    userId, list: def.slug, kind: 'add', rowId: String(created._id),
    after: p.values, sheetSteps: sheetSteps(def, 'add', null, p.values),
  });
  return { ok: true, id: String(created._id) };
}

export async function editRow(def: ListDef, userId: string, id: string, raw: Record<string, unknown>, confirmNew: boolean): Promise<WriteResult> {
  const model = def.model();
  const existing = await model.findOne({ _id: id, userId, ...(def.filter ?? {}) }).lean() as any;
  if (!existing) return fail(404, 'This row no longer exists. Reload the page.');
  const before = toRow(def, existing).values;

  const p = await parseInput(def, userId, raw);
  if (p.errors.length) return fail(400, p.errors.join(' '));

  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (def.columns.every(c => same(before[c.key], p.values[c.key]))) return fail(400, 'Nothing changed.');

  const changedFixed = (def.fixedOnEdit ?? []).filter(k => !same(before[k], p.values[k]));
  if (changedFixed.length) {
    const labels = changedFixed.map(k => def.columns.find(c => c.key === k)?.label ?? k).join(', ');
    return fail(409, `${labels} can't change here: records refer to it by name, and renaming comes later.`);
  }

  const changedLocked = lockedColumns(def).filter(k => !same(before[k], p.values[k]));
  if (changedLocked.length) {
    const used = await rowUsage(def, userId, before as Record<string, unknown>);
    if (used) {
      const labels = changedLocked.map(k => def.columns.find(c => c.key === k)?.label ?? k).join(', ');
      return fail(409, `${labels} can't change: ${records(used)} this row. Renaming and merging come later.`);
    }
  }

  const bad = await checkRow(def, userId, p, existing._id, confirmNew);
  if (bad) return bad;

  await model.updateOne({ _id: existing._id }, { $set: p.fields });
  await MasterChange.create({
    userId, list: def.slug, kind: 'edit', rowId: id,
    before, after: p.values, sheetSteps: sheetSteps(def, 'edit', before, p.values),
  });
  return { ok: true, id };
}

export async function deleteRow(def: ListDef, userId: string, id: string): Promise<WriteResult> {
  const model = def.model();
  const existing = await model.findOne({ _id: id, userId, ...(def.filter ?? {}) }).lean() as any;
  if (!existing) return fail(404, 'This row no longer exists. Reload the page.');
  const before = toRow(def, existing).values;

  const used = await rowUsage(def, userId, before as Record<string, unknown>);
  if (used) return fail(409, `Can't delete: ${records(used)} this row.`);

  await model.deleteOne({ _id: existing._id });
  await MasterChange.create({
    userId, list: def.slug, kind: 'delete', rowId: id,
    before, sheetSteps: sheetSteps(def, 'delete', before, null),
  });
  return { ok: true, id };
}
