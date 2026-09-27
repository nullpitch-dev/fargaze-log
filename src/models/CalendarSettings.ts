import mongoose, { Schema, model, models } from 'mongoose';

// Calendar view (WBS #59) — one document per user, saved on every change so
// the phone and the desktop always agree.
//   hiddenCategories       categories whose tick is off (new ones show by default)
//   hiddenCrossActivities  cross-activity values switched off
//   colors                 category → palette key (see calendar-colors.ts);
//                          a category not listed uses its default colour
//   showReading            the "Reading & study" row
const CalendarSettingsSchema = new Schema(
  {
    userId:                { type: String, required: true },
    hiddenCategories:      { type: [String], default: [] },
    hiddenCrossActivities: { type: [String], default: [] },
    colors:                { type: Schema.Types.Mixed, default: {} },
    showReading:           { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'calendar_settings', minimize: false }
);

CalendarSettingsSchema.index({ userId: 1 }, { unique: true });

export default models.CalendarSettings || model('CalendarSettings', CalendarSettingsSchema);
