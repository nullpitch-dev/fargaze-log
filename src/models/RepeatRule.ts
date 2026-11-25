// log_repeat (#71, Design §15.7, 8 Nov 2026): repeating plans, like Google Calendar's.
// The app makes the occurrences as plans (log_plan) up to HORIZON_DAYS ahead (monthly and yearly
// ones about 13 months), so they
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
  freq: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true },   // yearly: 24 Nov 2026
  interval: { type: Number, default: 1 },
  weekdays: { type: [Number], default: undefined }, // weekly: 0 = Sunday … 6 = Saturday
  monthDay: { type: Number, default: null },        // monthly: 1–31 (a shorter month skips)
  // monthly "on the fourth Tuesday" (24 Nov 2026, as Google Calendar): which week (1–4, or -1
  // for the last) and weekday (0 = Sunday); null = by monthDay
  monthWeek: { type: Number, default: null },
  monthWeekday: { type: Number, default: null },
  // monthly on day N, moved off a weekend (25 Nov): 'before' — the Friday before (salary);
  // 'after' — the Monday after (a bill); null = day N whatever the weekday
  monthShift: { type: String, enum: ['before', 'after', null], default: null },
  // yearly on a lunar date (25 Nov: birthdays, 제사, 설, 추석): the lunar month / day (an
  // ordinary month; day 30 falls on the 29th in a short month). See lib/entry/lunar.ts.
  lunar: { type: Boolean, default: false },
  lunarMonth: { type: Number, default: null },
  lunarDay: { type: Number, default: null },
  from: { type: String, required: true },           // first date 'YYYY-MM-DD'
  until: { type: String, default: null },           // last date, or
  count: { type: Number, default: null },           // number of occurrences
  mode: { type: String, enum: ['ask', 'auto'], default: 'ask' },
  /** Occurrences are made up to this date (inclusive). */
  filledUntil: { type: String, default: null },
  stoppedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'log_repeat', minimize: false });

export default mongoose.models.RepeatRule || mongoose.model('RepeatRule', RepeatRuleSchema);
