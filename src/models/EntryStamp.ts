// entry_stamps (#71, Hyoje 10 Nov 2026): a time saved with one tap when there is no time to
// fill in a form (talking, driving, walking in a hurry), with an optional short note
// (보고, 역으로, 첫눈). Not a record: a record needs an activity. A stamp waits on Home's
// Stamps list until it is made into a record (it opens New with its times) or deleted.
// Not on the Calendar or in any statistics.

import mongoose, { Schema } from 'mongoose';

const Point = { date: String, hour: String, timezone: String };

const EntryStampSchema = new Schema({
  userId: { type: String, required: true, index: true },
  start: Point,
  end: { type: Point, default: null },
  note: { type: String, default: '' },
  /** Set when the stamp became a record; cleared again by that record's Undo. */
  recordId: { type: Schema.Types.ObjectId, default: null },
  usedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'entry_stamps' });

EntryStampSchema.index({ userId: 1, usedAt: 1 });

export default mongoose.models.EntryStamp || mongoose.model('EntryStamp', EntryStampSchema);
