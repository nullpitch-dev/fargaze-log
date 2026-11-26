// gcal_state (Google Calendar sync, Design §15.9): one per user — where the last sync got
// to (cursor: records changed after it are looked at), and a lock so two syncs never run at
// once (a second one asks the running one to go round again).
import mongoose, { Schema } from 'mongoose';

const GcalStateSchema = new Schema({
  userId: { type: String, required: true },
  cursor: { type: Date, default: null },
  lockUntil: { type: Date, default: null },
  again: { type: Boolean, default: false },
  pendingIds: { type: [String], default: [] },
  lastRunAt: { type: Date, default: null },
  lastReport: { type: String, default: null },
}, { collection: 'gcal_state' });

GcalStateSchema.index({ userId: 1 }, { unique: true });

export default mongoose.models.GcalState || mongoose.model('GcalState', GcalStateSchema);
