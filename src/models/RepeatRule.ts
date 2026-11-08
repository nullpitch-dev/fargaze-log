// log_repeat (#71, Design §15.7, 8 Nov 2026): repeating plans, like Google Calendar's.
// The app makes the occurrences as plans (log_plan) up to HORIZON_DAYS ahead, so they
// show on the Calendar. Per rule:
//   mode 'ask'  — each occurrence goes to To confirm once its start has passed (meetings)
//   mode 'auto' — "count as done": it becomes a record by itself once its end has
//                 passed (애들 픽드랍); it can still be adjusted or deleted afterwards
// Times are local wall-clock times in the rule's IANA zone; each occurrence takes the
// zone CODE whose offset holds on that day (Europe/London → GMT or BST).

import mongoose, { Schema } from 'mongoose';

const RepeatRuleSchema = new Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  /** A partial RecordForm without start / end. */
  form: { type: Schema.Types.Mixed, default: {} },
  allDay: { type: Boolean, default: false },
  startTime: { type: String, default: null },      // 'H:mm'
  minutes: { type: Number, default: null },         // length; null = no end
  iana: { type: String, required: true },           // e.g. 'Europe/London'
  freq: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
  interval: { type: Number, default: 1 },
  weekdays: { type: [Number], default: undefined }, // weekly: 0 = Sunday … 6 = Saturday
  monthDay: { type: Number, default: null },        // monthly: 1–31 (a shorter month skips)
  from: { type: String, required: true },           // first date 'YYYY-MM-DD'
  until: { type: String, default: null },           // last date, or
  count: { type: Number, default: null },           // number of occurrences
  mode: { type: String, enum: ['ask', 'auto'], default: 'ask' },
  /** Occurrences are made up to this date (inclusive). */
  filledUntil: { type: String, default: null },
  stoppedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'log_repeat', minimize: false });

export default mongoose.models.RepeatRule || mongoose.model('RepeatRule', RepeatRuleSchema);
