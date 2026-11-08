// Presets (#71, Design §15.7; Hyoje 8 Nov 2026: a first draft, adjusted after seeing it).
// Made from the form with "Save as preset"; a tap on the home screen opens the form
// filled in (presetForm, which the phone runs), and Save is one more tap.

import mongoose from 'mongoose';
import EntryPreset from '../../models/EntryPreset';

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

import type { PresetTime } from './forms';

export { presetForm } from './forms';

function validate(b: any): { ok: true; v: { name: string; form: any; time: PresetTime } } | Fail {
  const name = typeof b?.name === 'string' ? b.name.trim() : '';
  if (!name) return fail(400, 'Name is required.');
  if (!b?.form?.activity?.name) return fail(400, 'A preset needs an activity.');
  const kind = ['open', 'moment', 'length'].includes(b?.time?.kind) ? b.time.kind : 'length';
  const minutes = b?.time?.minutes == null || b.time.minutes === '' ? null : Number(b.time.minutes);
  if (kind === 'length' && (minutes == null || !Number.isFinite(minutes) || minutes <= 0)) return fail(400, 'Usual length: minutes, more than 0.');
  const { start: _s, end: _e, ...form } = b.form;
  return { ok: true, v: { name, form, time: { kind, minutes: kind === 'length' ? minutes : null } } };
}

const view = (p: any) => ({ id: String(p._id), name: p.name, order: p.order, form: p.form, time: p.time, useCount: p.useCount ?? 0 });

export async function listPresets(userId: string) {
  const rows = await EntryPreset.find({ userId }).sort({ order: 1, name: 1 }).lean() as any[];
  return rows.map(view);
}

export async function createPreset(userId: string, body: any) {
  const v = validate(body);
  if (!v.ok) return v;
  const last = await EntryPreset.findOne({ userId }).sort({ order: -1 }).select('order').lean() as any;
  try {
    const [p] = await EntryPreset.create([{ userId, ...v.v, order: (last?.order ?? -1) + 1 }]);
    return { ok: true as const, preset: view((p as any).toObject()) };
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, `A preset called ${v.v.name} exists already.`);
    throw e;
  }
}

export async function updatePreset(userId: string, id: string, body: any) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown preset.');
  const p = await EntryPreset.findOne({ _id: id, userId }).lean() as any;
  if (!p) return fail(404, 'This preset no longer exists.');
  const v = validate({ name: body?.name ?? p.name, form: body?.form ?? p.form, time: body?.time ?? p.time });
  if (!v.ok) return v;
  const order = typeof body?.order === 'number' ? body.order : p.order;
  try {
    await EntryPreset.updateOne({ _id: p._id, userId }, { $set: { ...v.v, order } });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, `A preset called ${v.v.name} exists already.`);
    throw e;
  }
  return { ok: true as const, preset: view({ ...p, ...v.v, order }) };
}

export async function deletePreset(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown preset.');
  await EntryPreset.deleteOne({ _id: id, userId });
  return { ok: true as const };
}

/** Order as shown: the IDs in their new order. */
export async function reorderPresets(userId: string, ids: string[]) {
  if (!Array.isArray(ids) || ids.some(i => !mongoose.isValidObjectId(i))) return fail(400, 'Send { ids }.');
  await EntryPreset.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(id), userId }, update: { $set: { order: i } } } })));
  return { ok: true as const };
}

/** A record was saved from this preset. */
export async function presetUsed(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return;
  await EntryPreset.updateOne({ _id: id, userId }, { $set: { usedAt: new Date() }, $inc: { useCount: 1 } });
}
