// Stamps (#71, Hyoje 10 Nov): see models/EntryStamp.ts. Server only.
import mongoose from 'mongoose';
import EntryStamp from '../../models/EntryStamp';

export const NOTE_MAX = 40;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = /^\d{1,2}:\d{2}$/;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? new Date(d as any).toISOString() : '');

export interface StampPoint { date: string; hour: string; timezone: string }
const point = (p: any): StampPoint | null =>
  p && DATE.test(p.date ?? '') && HOUR.test(p.hour ?? '') ? { date: p.date, hour: p.hour, timezone: String(p.timezone ?? '') } : null;
const cleanNote = (n: unknown) => String(n ?? '').trim().slice(0, NOTE_MAX);

export function stampItem(s: any) {
  return {
    id: String(s._id),
    note: s.note ?? '',
    start: { date: s.start?.date ?? '', hour: s.start?.hour ?? '', timezone: s.start?.timezone ?? '' },
    end: s.end?.hour ? { date: s.end.date, hour: s.end.hour, timezone: s.end.timezone ?? '' } : { date: '', hour: '', timezone: '' },
    updatedAt: iso(s.updatedAt),
  };
}

/** Waiting stamps, newest first. */
export async function listStamps(userId: string) {
  const rows = await EntryStamp.find({ userId, usedAt: null }).sort({ createdAt: -1 }).limit(100).lean();
  return (rows as any[]).map(stampItem);
}

export async function getStamp(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown stamp.');
  const s = await EntryStamp.findOne({ _id: id, userId }).lean() as any;
  if (!s) return fail(404, 'This stamp no longer exists.');
  return { ok: true as const, stamp: stampItem(s), used: !!s.usedAt };
}

export async function createStamp(userId: string, start: unknown, note?: unknown) {
  const p = point(start);
  if (!p) return fail(400, 'Send start: { date: YYYY-MM-DD, hour: H:MM, timezone }.');
  const s = await EntryStamp.create({ userId, start: p, note: cleanNote(note) });
  return { ok: true as const, stamp: stampItem(s.toObject()) };
}

/** A note, an end (End now), or both. An empty end clears it. */
export async function updateStamp(userId: string, id: string, change: { note?: unknown; end?: unknown }) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown stamp.');
  const set: Record<string, unknown> = {};
  if (change.note !== undefined) set.note = cleanNote(change.note);
  if (change.end !== undefined) {
    const e = change.end && (change.end as any).hour ? point(change.end) : null;
    if (change.end && (change.end as any).hour && !e) return fail(400, 'end must be { date: YYYY-MM-DD, hour: H:MM, timezone }.');
    set.end = e;
  }
  const s = await EntryStamp.findOneAndUpdate({ _id: id, userId, usedAt: null }, { $set: set }, { new: true }).lean() as any;
  if (!s) return fail(404, 'This stamp no longer exists.');
  return { ok: true as const, stamp: stampItem(s) };
}

export async function deleteStamp(userId: string, id: string) {
  if (!mongoose.isValidObjectId(id)) return fail(404, 'Unknown stamp.');
  const s = await EntryStamp.findOneAndDelete({ _id: id, userId }).lean() as any;
  if (!s) return fail(404, 'Already gone.');
  return { ok: true as const, stamp: stampItem(s) };
}

/** Undo of a delete, from the toast. */
export async function restoreStamp(userId: string, stamp: any) {
  const p = point(stamp?.start);
  if (!p || !mongoose.isValidObjectId(stamp?.id)) return fail(400, 'Send the stamp the delete returned.');
  await EntryStamp.updateOne({ _id: stamp.id, userId }, { $setOnInsert: { userId, start: p, end: point(stamp.end), note: cleanNote(stamp.note), recordId: null, usedAt: null } }, { upsert: true });
  return { ok: true as const };
}

/** The stamp became this record (or plan). */
export async function stampUsed(userId: string, id: string, recordId: string) {
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(recordId)) return;
  await EntryStamp.updateOne({ _id: id, userId, usedAt: null }, { $set: { usedAt: new Date(), recordId } });
}

/** Undo of that record: the stamp waits again. */
export async function stampBack(userId: string, recordId: string) {
  if (!mongoose.isValidObjectId(recordId)) return;
  await EntryStamp.updateOne({ userId, recordId }, { $set: { usedAt: null, recordId: null } });
}
