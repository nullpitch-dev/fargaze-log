// entry_cache (25 Nov, speed): answers that take long to work out and change slowly, kept
// between server starts. Today: the record form's "values already used" (formOptions.ts),
// which reads every record — 19 passes over seven years each time a server woke up.
// Safe to delete at any time: it is worked out again on the next form.

import mongoose, { Schema } from 'mongoose';

const EntryCacheSchema = new Schema({
  userId: { type: String, required: true },
  key: { type: String, required: true },
  value: { type: Schema.Types.Mixed, default: null },
  at: { type: Date, required: true },
}, { collection: 'entry_cache', minimize: false });

EntryCacheSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.models.EntryCache || mongoose.model('EntryCache', EntryCacheSchema);
