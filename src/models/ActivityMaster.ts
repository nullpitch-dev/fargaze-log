import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityMaster extends Document {
  userId: string;
  name: string;
  category: string;
  /** #71: the entry form's field groups for this activity (sheetSurvey FIELD_GROUPS keys). */
  groups?: { required?: string[]; shown?: string[] };
}

const ActivityMasterSchema = new Schema<IActivityMaster>({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  // #71 (8 Nov): field groups the entry form opens (shown) and insists on (required).
  // Seeded from the records by scripts/seed-activity-groups.ts; unset = the category's.
  groups: {
    type: { required: { type: [String], default: undefined }, shown: { type: [String], default: undefined } },
    default: undefined,
    _id: false,
  },
}, {
  timestamps: true,
  collection: 'activity_master',
});

// An activity name is unique across all categories (Hyoje, 24 Oct 2026), so moving
// an activity to another category is a change to its category, not a new row.
ActivityMasterSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.models.ActivityMaster || mongoose.model<IActivityMaster>('ActivityMaster', ActivityMasterSchema);
