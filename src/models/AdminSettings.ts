import { Schema, model, models } from 'mongoose';

// Admin pages (#67) — one document per user, so the phone and the desktop agree.
//   pins   slugs of the master lists shown as shortcuts in the gear menu.
//          No schema default on purpose: while the field is absent the API
//          supplies the starting list (STARTER_PINS in src/lib/admin/pins.ts).
//   archiveUntil  (#73) the last year in the Archive file's archive tab '~N'; later
//          years have a tab each. Absent means 2025 (DEFAULT_ARCHIVE_UNTIL in
//          src/lib/yearTabs.ts). Set only by npm run migrate -- --full --rollover.
//   pointExcluded  (7 Nov 2026) names left out of Place points > Missing points
//          (vehicles in Location: 내차, 민아 차 …), each with when. Put back = removed.
const AdminSettingsSchema = new Schema(
  {
    userId: { type: String, required: true },
    pins:   { type: [String], default: undefined },
    archiveUntil: { type: Number, default: undefined },
    pointExcluded: { type: [{ _id: false, name: String, at: Date }], default: undefined },
  },
  { timestamps: true, collection: 'admin_settings' }
);

AdminSettingsSchema.index({ userId: 1 }, { unique: true });

export default models.AdminSettings || model('AdminSettings', AdminSettingsSchema);
