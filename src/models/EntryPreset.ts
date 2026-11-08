// entry_presets (#71, Design §15.7, 8 Nov 2026): one-tap starting points on the entry
// app's home — 수면, 체중, 애들 픽드랍 … A preset holds the parts of a form it fills
// (anything but the times) and how its time works:
//   open    — starts now and stays open (수면: End now in the morning)
//   moment  — start = end = now (체중)
//   length  — starts now, ends `minutes` later (애들 픽드랍)
// A tap opens the form filled in; Save is one more tap (a wrong tap makes nothing).

import mongoose, { Schema } from 'mongoose';

const EntryPresetSchema = new Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  order: { type: Number, default: 0 },
  /** A partial RecordForm without start / end. */
  form: { type: Schema.Types.Mixed, default: {} },
  time: {
    kind: { type: String, enum: ['open', 'moment', 'length'], default: 'length' },
    minutes: { type: Number, default: null },
  },
  usedAt: { type: Date, default: null },
  useCount: { type: Number, default: 0 },
}, { timestamps: true, collection: 'entry_presets', minimize: false });

EntryPresetSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.models.EntryPreset || mongoose.model('EntryPreset', EntryPresetSchema);
