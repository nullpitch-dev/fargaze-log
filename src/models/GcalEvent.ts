// gcal_events (Google Calendar sync, Design §15.9, 26 Nov 2026): which Google event belongs
// to which record or plan. Kept apart from the records on purpose: the sync never rewrites a
// record, so it can't race an edit being saved (the record's sync.eventId is only a hint,
// written alongside; this row is what counts).
//
//   docId       the record (log) or plan (log_plan) — a plan's event moves to its record
//   kind        'record' | 'plan' (what docId was when last synced)
//   calendar    the calendar key (calendars.ts), eventId the Google event
//   hash        what was last sent (sha1); the same again → no call
//   repeatId / occurrence   a repeat's plan: a plan made again for the same day takes over
//                its event instead of a new one
//   error, tries            the last failure; retried until 8 tries
import mongoose, { Schema } from 'mongoose';

const GcalEventSchema = new Schema({
  userId: { type: String, required: true },
  docId: { type: Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: ['record', 'plan'], required: true },
  calendar: { type: String, required: true },
  eventId: { type: String, default: null },
  hash: { type: String, default: null },
  repeatId: { type: Schema.Types.ObjectId, default: null },
  occurrence: { type: String, default: null },
  syncedAt: { type: Date, default: null },
  error: { type: String, default: null },
  tries: { type: Number, default: 0 },
}, { collection: 'gcal_events', timestamps: true });

GcalEventSchema.index({ userId: 1, docId: 1 }, { unique: true });
GcalEventSchema.index({ userId: 1, eventId: 1 });
GcalEventSchema.index({ userId: 1, kind: 1 });

export default mongoose.models.GcalEvent || mongoose.model('GcalEvent', GcalEventSchema);
